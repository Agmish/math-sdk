import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { launchTestBrowser } from './browser_launch.mjs';

const baseUrl = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const visualUrl = new URL(baseUrl);
visualUrl.searchParams.set('sessionID', 'visual-session');
visualUrl.searchParams.set('lang', 'en');
visualUrl.searchParams.set('device', 'desktop');
visualUrl.searchParams.set('rgs_url', 'rgs.visual');
const lossUrl = new URL(baseUrl);
lossUrl.search = visualUrl.search;
const socialUrl = new URL(baseUrl);
socialUrl.search = visualUrl.search;
socialUrl.searchParams.set('social', 'true');
const output = fileURLToPath(new URL('../visual-qa/', import.meta.url));
await mkdir(output, { recursive: true });

const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
let movingReels = 0;
let roundKind = 'positive';
const publishedFixtures = JSON.parse(
  readFileSync(new URL('../src/lib/fixtures/published-books.json', import.meta.url), 'utf8'),
);

await page.route('https://rgs.visual/**', async (route) => {
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
  if (pathname.endsWith('/wallet/authenticate')) {
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        balance: { amount: 6_000_000_000, currency: 'USD' },
        config: {
          minBet: 10_000,
          maxBet: 300_000_000,
          stepBet: 10_000,
          defaultBetLevel: 1_000_000,
          betLevels: [10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 300_000_000],
          jurisdiction: {
            socialCasino: false,
            disabledAutoplay: false,
            disabledSpacebar: false,
            disabledBuyFeature: false,
            displayRTP: true,
            minimumRoundDuration: 0,
          },
        },
        round: null,
      }),
    });
    return;
  }
  if (pathname.endsWith('/wallet/play')) {
    const requestBody = request.postDataJSON();
    const mode = typeof requestBody.mode === 'string' && publishedFixtures[requestBody.mode]
      ? requestBody.mode
      : 'BASE';
    const book = structuredClone(publishedFixtures[mode][roundKind]);
    const payoutMultiplier = book.payoutMultiplier / 100;
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        balance: { amount: 5_999_000_000, currency: 'USD' },
        round: {
          active: payoutMultiplier > 0,
          amount: requestBody.amount,
          mode,
          payoutMultiplier,
          state: book.events,
        },
      }),
    });
    return;
  }
  if (pathname.endsWith('/wallet/end-round')) {
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({ balance: { amount: 6_000_000_000, currency: 'USD' } }),
    });
    return;
  }
  await route.fulfill({ status: 404, headers, body: '{}' });
});
page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location();
    errors.push(`console: ${message.text()}${location.url ? ` @ ${location.url}` : ''}`);
  }
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('requestfailed', (request) => {
  const errorText = request.failure()?.errorText ?? '';
  // Navigating between deterministic scenarios stops the looping music request.
  // Chromium reports that intentional media cancellation as ERR_ABORTED.
  if (request.resourceType() === 'media' && errorText.includes('ERR_ABORTED')) return;
  errors.push(`network: ${request.url()} ${errorText}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});

async function loadBase(url = visualUrl.href) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.reel-frame').waitFor();
}

async function openFeature(name) {
  await page.locator('button.feature-trigger').click();
  await page.locator('.feature-card').filter({ hasText: name }).click();
  await page.locator('.feature-confirm').waitFor();
}

async function confirmFeature() {
  await page.locator('.feature-confirm-button').click();
  await page.locator('.round-overlay-card').waitFor();
}

async function checkSocialCopy(label) {
  const copy = (await page.locator('body').innerText()).toLowerCase();
  const restricted = [
    'win feature',
    'pay out',
    'paid out',
    'stake',
    'betting',
    'total bet',
    'bet',
    'bets',
    'cash',
    'payer',
    'pay',
    'pays',
    'paid',
    'money',
    'buy',
    'bought',
    'purchase',
    'rebet',
    'credit',
    'gamble',
    'wager',
    'deposit',
    'withdraw',
    'currency',
    'fund',
    'funds',
    'payout',
  ];
  for (const phrase of restricted) {
    const expression = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (expression.test(copy)) errors.push(`Social copy contains "${phrase}" in ${label}.`);
  }
}

await loadBase();
await page.screenshot({ path: join(output, 'desktop-base.png'), fullPage: true });

const mobileViewport = await page.locator('meta[name="viewport"]').getAttribute('content');
const touchAction = await page.locator('body').evaluate((body) => getComputedStyle(body).touchAction);
if (!mobileViewport?.includes('maximum-scale=1.0') || !mobileViewport.includes('user-scalable=no')) {
  errors.push(`Mobile viewport does not disable double-tap zoom: ${mobileViewport ?? 'missing'}.`);
}
if (touchAction !== 'manipulation') errors.push(`Body touch-action is ${touchAction}, expected manipulation.`);

const soundButton = page.getByRole('button', { name: 'Toggle sound' });
await soundButton.click();
if (!(await soundButton.innerText()).includes('SOUND OFF')) errors.push('Sound control did not enter the muted state.');
await soundButton.click();

await page.getByRole('button', { name: /Configure auto bet/i }).click();
await page.locator('.autoplay-confirm').waitFor();
if (await page.locator('.spin-button').isDisabled()) errors.push('Auto Bet started before confirmation.');
await page.screenshot({ path: join(output, 'desktop-autoplay-confirm.png'), fullPage: true });
await page.locator('.autoplay-confirm .text-button').click();

if (await page.getByText('WIN SYSTEM', { exact: true }).count()) {
  errors.push('The redundant base-game WIN SYSTEM block is still visible.');
}

const lowerBet = page.locator('button[aria-label="Lower bet"]');
for (let index = 0; index < 30 && await lowerBet.isEnabled(); index += 1) {
  await lowerBet.click();
}
const minimumBetText = (await page.locator('.bet-stepper strong').textContent())?.trim();
if (minimumBetText !== '$0.01') errors.push(`Minimum bet is ${minimumBetText ?? 'missing'}, expected $0.01.`);

await page.locator('button[aria-label="Maximum bet"]').click();
const maximumBetText = (await page.locator('.bet-stepper strong').textContent())?.trim();
if (maximumBetText !== '$300.00') errors.push(`Maximum bet is ${maximumBetText ?? 'missing'}, expected $300.00.`);

await loadBase();

const loadedImages = await page.locator('img').evaluateAll((images) =>
  images.every((image) => image.complete && image.naturalWidth > 0),
);
if (!loadedImages) errors.push('One or more runtime images did not load.');

await page.locator('button.feature-trigger').click();
const featureCards = page.locator('.feature-card');
if (await featureCards.count() !== 4) errors.push('Bonus menu does not expose exactly four complete feature rounds.');
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('.feature-card-art img'))
    .every((image) => image.complete && image.naturalWidth > 0),
);
await page.screenshot({ path: join(output, 'desktop-feature-menu.png'), fullPage: true });

await featureCards.filter({ hasText: 'The Sealed Will' }).click();
await page.locator('.feature-confirm').waitFor();
await page.screenshot({ path: join(output, 'desktop-confirm.png'), fullPage: true });
await confirmFeature();
await page.waitForTimeout(620);
await page.screenshot({ path: join(output, 'desktop-will-intro.png'), fullPage: true });
await page.locator('.round-overlay-action').click();
await page.locator('.reel-motion-strip').first().waitFor({ state: 'attached', timeout: 5000 });
movingReels = await page.locator('.reel-motion-strip').count();
if (movingReels < 1) errors.push('The moving picture-symbol reel strip did not appear during a spin.');
await page.screenshot({ path: join(output, 'desktop-spinning.png'), fullPage: true });
await page.locator('.wild-expansion.fresh').waitFor({ timeout: 15000 });
await page.screenshot({ path: join(output, 'desktop-wild-expansion.png'), fullPage: true });
await page.locator('.win-explanation.visible').waitFor({ timeout: 15000 });
await page.waitForTimeout(260);
await page.screenshot({ path: join(output, 'desktop-win-explanation.png'), fullPage: true });

await loadBase();
await openFeature('Vault of Echoes');
await confirmFeature();
await page.locator('.round-overlay-action').click();
await page.waitForTimeout(570);
await page.locator('.vault-round .prize-value').first().waitFor({ timeout: 10000 });
await page.screenshot({ path: join(output, 'desktop-vault-result.png'), fullPage: true });
await page.locator('.vault-round .win-explanation.visible').waitFor({ timeout: 15000 });
await page.waitForTimeout(220);
await page.screenshot({ path: join(output, 'desktop-vault-collection.png'), fullPage: true });

await loadBase();
await openFeature('Midnight Séance');
await confirmFeature();
await page.locator('.round-overlay-action').click();
await page.locator('.wild-expansion.spirit').waitFor({ timeout: 10000 });
await page.screenshot({ path: join(output, 'desktop-seance-result.png'), fullPage: true });

await loadBase();
await openFeature('The Final Codicil');
await confirmFeature();
await page.locator('.round-overlay-action').click();
await page.locator('.codicil-track').waitFor({ timeout: 10000 });
await page.screenshot({ path: join(output, 'desktop-codicil-result.png'), fullPage: true });

await loadBase();
await page.locator('button.rules-trigger').click();
await page.locator('.rules-modal').waitFor();
await page.screenshot({ path: join(output, 'desktop-rules-how-wins.png'), fullPage: true });
await page.locator('.rules-tabs button').filter({ hasText: 'Four bonuses' }).click();
await page.screenshot({ path: join(output, 'desktop-rules-bonuses.png'), fullPage: true });
await page.locator('.rules-tabs button').filter({ hasText: 'Picture paytable' }).click();
await page.screenshot({ path: join(output, 'desktop-rules-paytable.png'), fullPage: true });
await page.locator('.rules-modal .text-button').click();

for (const [label, width, height] of [['popout-l', 1024, 700], ['popout-s', 640, 480]]) {
  await page.setViewportSize({ width, height });
  await page.goto(visualUrl.href, { waitUntil: 'networkidle' });
  await page.locator('.reel-frame').waitFor();
  const fit = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  if (fit.width > fit.viewportWidth + 1 || fit.height > fit.viewportHeight + 1) {
    errors.push(`${label} layout scrolls: ${JSON.stringify(fit)}.`);
  }
  await page.screenshot({ path: join(output, `${label}.png`), fullPage: true });
}
await page.setViewportSize({ width: 1440, height: 1000 });

roundKind = 'loss';
await loadBase(lossUrl.href);
await openFeature('The Sealed Will');
await confirmFeature();
await page.locator('.round-overlay-action').click();
await page.locator('.round-overlay-card.summary').waitFor({ timeout: 30000 });
if (await page.locator('.summary-win.loss').count() !== 1) {
  errors.push('A zero-return feature did not settle as a visible net loss.');
}
await page.screenshot({ path: join(output, 'desktop-loss-settlement.png'), fullPage: true });

roundKind = 'positive';
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(visualUrl.href, { waitUntil: 'networkidle' });
await page.locator('.reel-frame').waitFor();
await page.screenshot({ path: join(output, 'mobile-base.png'), fullPage: true });
const mobileBaseChecks = await page.evaluate(() => {
  const root = document.querySelector('.game-root');
  return {
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    rootClientHeight: root?.clientHeight ?? 0,
    rootScrollHeight: root?.scrollHeight ?? 0,
  };
});
if (
  mobileBaseChecks.documentHeight > mobileBaseChecks.viewportHeight + 1 ||
  mobileBaseChecks.rootScrollHeight > mobileBaseChecks.rootClientHeight + 1
) {
  errors.push(
    `Main mobile frame scrolls: document ${mobileBaseChecks.documentHeight}/${mobileBaseChecks.viewportHeight}, ` +
    `root ${mobileBaseChecks.rootScrollHeight}/${mobileBaseChecks.rootClientHeight}.`,
  );
}
await page.locator('button.feature-trigger').click();
await page.screenshot({ path: join(output, 'mobile-feature-menu.png'), fullPage: true });

const viewportChecks = await page.evaluate(() => ({
  viewport: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  reels: document.querySelectorAll('.reel').length,
  symbols: document.querySelectorAll('.symbol-tile img').length,
  featureCards: document.querySelectorAll('.feature-card').length,
}));
if (viewportChecks.documentWidth > viewportChecks.viewport + 1) {
  errors.push(`Mobile horizontal overflow: ${viewportChecks.documentWidth}px document in ${viewportChecks.viewport}px viewport.`);
}
if (viewportChecks.reels !== 5 || viewportChecks.symbols !== 20) {
  errors.push(`Reel render mismatch: ${viewportChecks.reels} reels, ${viewportChecks.symbols} picture symbols.`);
}
if (viewportChecks.featureCards !== 4) {
  errors.push(`Mobile bonus menu mismatch: ${viewportChecks.featureCards} feature cards.`);
}

await page.setViewportSize({ width: 320, height: 568 });
await page.goto(visualUrl.href, { waitUntil: 'networkidle' });
await page.locator('.reel-frame').waitFor();
const legacyMobileChecks = await page.evaluate(() => {
  const controls = document.querySelector('.control-deck')?.getBoundingClientRect();
  const reels = document.querySelector('.reel-frame')?.getBoundingClientRect();
  return {
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    controlsBottom: controls?.bottom ?? Number.POSITIVE_INFINITY,
    reelsVisible: Boolean(reels && reels.top >= 0 && reels.bottom <= window.innerHeight),
  };
});
if (
  legacyMobileChecks.documentHeight > legacyMobileChecks.viewportHeight + 1 ||
  legacyMobileChecks.controlsBottom > legacyMobileChecks.viewportHeight + 1 ||
  !legacyMobileChecks.reelsVisible
) {
  errors.push(`320×568 layout does not fit: ${JSON.stringify(legacyMobileChecks)}.`);
}
await page.screenshot({ path: join(output, 'mobile-legacy-320x568.png'), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(socialUrl.href, { waitUntil: 'networkidle' });
await page.locator('.reel-frame').waitFor();
await checkSocialCopy('base game');
await page.locator('button.feature-trigger').click();
await checkSocialCopy('feature menu');
await page.locator('.feature-card').filter({ hasText: 'The Sealed Will' }).click();
await page.locator('.feature-confirm').waitFor();
await checkSocialCopy('feature confirmation');
await page.locator('.feature-confirm .text-button').click();
await page.locator('.feature-menu .text-button').click();
await page.locator('button.rules-trigger').click();
await page.locator('.rules-modal').waitFor();
await checkSocialCopy('rules');
for (const tab of ['Four bonuses', 'Picture awards']) {
  await page.locator('.rules-tabs button').filter({ hasText: tab }).click();
  await checkSocialCopy(`rules / ${tab}`);
}
await page.screenshot({ path: join(output, 'mobile-social-rules.png'), fullPage: true });

await browser.close();
if (errors.length) {
  throw new Error(errors.join('\n'));
}
console.log(JSON.stringify({
  status: 'ok',
  screenshots: 22,
  movingReels,
  ...viewportChecks,
  mobileBaseChecks,
  legacyMobileChecks,
}, null, 2));
