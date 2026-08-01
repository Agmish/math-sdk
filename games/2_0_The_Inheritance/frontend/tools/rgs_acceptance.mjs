import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const baseUrl = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, executablePath: edgePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const calls = { authenticate: 0, play: 0, endRound: 0, replay: 0 };
let scenario = 'zero';
const publishedFixtures = JSON.parse(
  readFileSync(new URL('../src/lib/fixtures/published-books.json', import.meta.url), 'utf8'),
);

function book(kind = 'loss', mode = 'BASE') {
  return structuredClone(publishedFixtures[mode][kind]);
}
const basePositiveMultiplier = book('positive').payoutMultiplier / 100;

function jurisdiction() {
  return {
    socialCasino: false,
    disabledFullscreen: false,
    disabledTurbo: false,
    disabledSuperTurbo: false,
    disabledAutoplay: true,
    disabledSlamstop: false,
    disabledSpacebar: false,
    disabledBuyFeature: false,
    displayNetPosition: false,
    displayRTP: true,
    displaySessionTimer: false,
    minimumRoundDuration: 0,
  };
}

function authPayload() {
  const lowBalance = scenario === 'insufficient';
  const active = scenario === 'active';
  return {
    balance: { amount: lowBalance ? 5_000 : 10_000_000, currency: 'XSC' },
    config: {
      minBet: 10_000,
      maxBet: 300_000_000,
      stepBet: 10_000,
      defaultBetLevel: 10_000,
      betLevels: [10_000, 20_000, 50_000, 300_000_000],
      jurisdiction: jurisdiction(),
    },
    round: active
      ? {
          betID: 77,
          amount: 20_000,
          payout: Math.round(20_000 * basePositiveMultiplier),
          payoutMultiplier: basePositiveMultiplier,
          active: true,
          mode: 'BASE',
          event: 'active-77',
          state: book('positive'),
        }
      : null,
  };
}

await page.route('https://rgs.mock/**', async (route) => {
  const request = route.request();
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers });
    return;
  }

  const pathname = new URL(request.url()).pathname;
  if (pathname.startsWith('/bet/replay/')) {
    calls.replay += 1;
    const replayBook = book('positive');
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        payoutMultiplier: replayBook.payoutMultiplier / 100,
        costMultiplier: 1,
        state: replayBook,
      }),
    });
    return;
  }
  if (pathname.endsWith('/wallet/authenticate')) {
    calls.authenticate += 1;
    if (scenario === 'invalid') {
      await route.fulfill({
        status: 401,
        headers,
        contentType: 'application/json',
        body: JSON.stringify('ERR_ATE'),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(authPayload()),
    });
    return;
  }
  if (pathname.endsWith('/wallet/play')) {
    calls.play += 1;
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        balance: { amount: 9_990_000, currency: 'XSC' },
        round: {
          betID: 78,
          amount: 10_000,
          payout: 0,
          payoutMultiplier: 0,
          active: false,
          mode: 'BASE',
          event: 'zero-78',
          state: book('loss'),
        },
      }),
    });
    return;
  }
  if (pathname.endsWith('/wallet/end-round')) {
    calls.endRound += 1;
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({ balance: { amount: 10_008_000, currency: 'XSC' } }),
    });
    return;
  }
  await route.fulfill({ status: 404, headers, body: '{}' });
});

function launchUrl(sessionID) {
  const url = new URL(baseUrl);
  url.searchParams.set('sessionID', sessionID);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('device', 'desktop');
  url.searchParams.set('rgs_url', 'rgs.mock');
  return url.href;
}

scenario = 'zero';
await page.goto(launchUrl('valid-zero'), { waitUntil: 'networkidle' });
await page.locator('.spin-button').waitFor();
if (!(await page.locator('.spin-button').isEnabled())) throw new Error('Authenticated play button is disabled.');
if (!(await page.locator('.balance-readout').innerText()).includes('SC')) {
  throw new Error('Authenticated SC currency was not displayed.');
}
await page.locator('.spin-button').click();
await page.waitForFunction(() => !document.querySelector('.spin-button')?.hasAttribute('disabled'));
if (calls.play !== 1) throw new Error(`Expected one Play request, received ${calls.play}.`);
if (calls.endRound !== 0) throw new Error('Zero-return play incorrectly sent EndRound.');
const playCallsBeforeSpace = calls.play;
await page.keyboard.press('Space');
await page.waitForFunction(() => !document.querySelector('.spin-button')?.hasAttribute('disabled'));
if (calls.play !== playCallsBeforeSpace + 1) throw new Error('Space bar did not invoke exactly one Play request.');
if (calls.endRound !== 0) throw new Error('Space-bar zero-return play incorrectly sent EndRound.');

scenario = 'insufficient';
const playCallsBeforeInsufficient = calls.play;
await page.goto(launchUrl('valid-low-balance'), { waitUntil: 'networkidle' });
if (await page.locator('.spin-button').isEnabled()) {
  throw new Error('Insufficient-balance play button is enabled.');
}
if (calls.play !== playCallsBeforeInsufficient) {
  throw new Error('Insufficient-balance launch sent a Play request.');
}

scenario = 'invalid';
await page.goto(launchUrl('invalid-session'), { waitUntil: 'networkidle' });
await page.locator('.runtime-message').waitFor();
if (await page.locator('.spin-button').isEnabled()) {
  throw new Error('Invalid authentication left the play button enabled.');
}

scenario = 'active';
const playCallsBeforeRestore = calls.play;
await page.goto(launchUrl('valid-active'), { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.querySelector('.spin-button')?.hasAttribute('disabled'), null, {
  timeout: 10_000,
});
if (calls.play !== playCallsBeforeRestore) {
  throw new Error('Active-round restore sent a new Play request.');
}
if (calls.endRound !== 1) {
  throw new Error(`Restored winning round did not settle exactly once; received ${calls.endRound}.`);
}
if (!(await page.locator('.bet-stepper').innerText()).includes('0.02')) {
  throw new Error('Active round did not restore its 0.02 play amount.');
}

scenario = 'replay';
const authCallsBeforeReplay = calls.authenticate;
await page.setViewportSize({ width: 360, height: 640 });
const replayUrl = new URL(baseUrl);
replayUrl.searchParams.set('replay', 'true');
replayUrl.searchParams.set('game', 'inheritance');
replayUrl.searchParams.set('version', '1');
replayUrl.searchParams.set('mode', 'BASE');
replayUrl.searchParams.set('event', 'replay-99');
replayUrl.searchParams.set('rgs_url', 'https://rgs.mock');
replayUrl.searchParams.set('currency', 'XSC');
replayUrl.searchParams.set('amount', '10000');
replayUrl.searchParams.set('lang', 'en');
replayUrl.searchParams.set('device', 'mobile');
replayUrl.searchParams.set('social', 'true');
await page.goto(replayUrl.href, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
if (calls.replay !== 1) throw new Error(`Replay endpoint called ${calls.replay} times.`);
if (calls.authenticate !== authCallsBeforeReplay) throw new Error('Replay mode made an authenticated request.');
if (await page.locator('.control-deck').count()) throw new Error('Replay mode left normal play controls visible.');
const replayCopy = await page.locator('.replay-banner').innerText();
if (!replayCopy.includes('0.01 SC') || !replayCopy.includes(`${basePositiveMultiplier}×`)) {
  throw new Error(`Replay UI is missing cost or multiplier: ${replayCopy}`);
}
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.getByRole('button', { name: 'Play Again', exact: true }).waitFor({ timeout: 10_000 });
await page.getByRole('button', { name: 'Play Again', exact: true }).click();
await page.getByRole('button', { name: 'Play Again', exact: true }).waitFor({ timeout: 10_000 });

await browser.close();
console.log(JSON.stringify({ status: 'ok', calls }, null, 2));
