import { describe, expect, it } from 'vitest';
import publishedFixtures from './fixtures/published-books.json';
import {
  DEFAULT_BET_AMOUNT,
  DEFAULT_BET_LEVELS,
  GAME_MODES,
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  modeTotalCost,
} from './constants';
import { createReplayBook } from './books';
import {
  normalizeAuthenticateResponse,
  normalizeEventBook,
  playRound,
  settleRound,
} from './rgs';

describe('RGS mode play flow', () => {
  it('offers the complete one-cent to 300-dollar default wager range', () => {
    expect(DEFAULT_BET_LEVELS[0]).toBe(MIN_BET_AMOUNT);
    expect(DEFAULT_BET_LEVELS[DEFAULT_BET_LEVELS.length - 1]).toBe(MAX_BET_AMOUNT);
    expect(MIN_BET_AMOUNT).toBe(10_000);
    expect(MAX_BET_AMOUNT).toBe(300_000_000);
    expect(DEFAULT_BET_LEVELS).toContain(DEFAULT_BET_AMOUNT);
    expect(new Set(DEFAULT_BET_LEVELS).size).toBe(DEFAULT_BET_LEVELS.length);
    expect([...DEFAULT_BET_LEVELS].sort((left, right) => left - right)).toEqual(DEFAULT_BET_LEVELS);
  });

  it('keeps total debit equal to base bet times selected mode cost', () => {
    const baseBet = 1_000_000;

    for (const mode of GAME_MODES) {
      expect(modeTotalCost(mode.id, baseBet)).toBe(baseBet * mode.costMultiplier);
    }
  });

  it('uses every returned RGS bet level and restores the active-round amount', () => {
    const published = publishedFixtures.VAULT_ECHOES_BUY.positive;
    const state = normalizeAuthenticateResponse({
      balance: { amount: 90_000_000, currency: 'CAD' },
      config: {
        minBet: 10_000,
        maxBet: 300_000_000,
        stepBet: 10_000,
        defaultBetLevel: 50_000,
        betLevels: [10_000, 20_000, 50_000, 300_000_000],
      },
      jurisdictionFlags: {
        socialCasino: true,
        disabledSpacebar: true,
        disabledBuyFeature: true,
      },
      round: {
        betID: 77,
        active: true,
        amount: 20_000,
        mode: 'VAULT_ECHOES_BUY',
        state: published.events,
        payoutMultiplier: published.payoutMultiplier / 100,
      },
    });

    expect(state.betLevels).toEqual([10_000, 20_000, 50_000, 300_000_000]);
    expect(state.defaultBetLevel).toBe(50_000);
    expect(state.activeRound).toMatchObject({
      amount: 20_000,
      mode: 'VAULT_ECHOES_BUY',
      book: {
        id: '77',
        published: true,
      },
    });
    expect(state.socialCasino).toBe(true);
    expect(state.spacebarEnabled).toBe(false);
    expect(state.buyFeaturesEnabled).toBe(false);
  });

  it('sends the selected mode id and base bet to RGS Play', async () => {
    const calls: Array<{ amount: number; mode: string }> = [];
    const book = createReplayBook('FINAL_CODICIL_BUY', 'FINAL_CODICIL_BUY-normal');
    const client = {
      Authenticate: async () => ({}),
      Play: async (input: { amount: number; mode: string }) => {
        calls.push(input);
        return {
          balance: { amount: 1_000_000, currency: 'USD' },
          round: {
            active: book.payoutMultiplier > 0,
            mode: 'FINAL_CODICIL_BUY',
            state: book,
            payoutMultiplier: book.payoutMultiplier,
          },
        };
      },
      EndRound: async () => ({ balance: { amount: 1_000_000, currency: 'USD' } }),
    };

    await playRound('FINAL_CODICIL_BUY', 2_000_000, client);

    expect(calls).toEqual([{ amount: 2_000_000, mode: 'FINAL_CODICIL_BUY' }]);
  });

  it('accepts the production RGS round.state event array', async () => {
    const published = publishedFixtures.BASE.positive;
    const client = {
      Authenticate: async () => ({}),
      Play: async () => ({
        balance: { amount: 990_000, currency: 'USD' },
        round: {
          betID: 912,
          active: true,
          mode: 'BASE',
          payoutMultiplier: published.payoutMultiplier / 100,
          state: published.events,
        },
      }),
      EndRound: async () => ({ balance: { amount: 1_010_000, currency: 'USD' } }),
    };

    const result = await playRound('BASE', 10_000, client);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.book.id).toBe('912');
    expect(result.book.published).toBe(true);
    expect(result.book.payoutMultiplier).toBe(published.payoutMultiplier / 100);
    expect(result.needsEndRound).toBe(true);
  });

  it('uses the weighted math table locally without forcing a winning feature', async () => {
    const result = await playRound('FINAL_CODICIL_BUY', 1_000_000, null);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.localPreview).toBe(true);
    expect(result.book.mode).toBe('FINAL_CODICIL_BUY');
    expect(result.book.outcome).toBeDefined();
  });

  it('never sends EndRound from Play, including for a zero-return round', async () => {
    const zeroBook = createReplayBook('BASE', 'BASE-loss');
    let endRoundCalls = 0;
    const client = {
      Authenticate: async () => ({}),
      Play: async () => ({
        balance: { amount: 900_000, currency: 'USD' },
        round: {
          active: false,
          mode: 'BASE',
          state: zeroBook,
          payoutMultiplier: 0,
        },
      }),
      EndRound: async () => {
        endRoundCalls += 1;
        return { balance: { amount: 900_000, currency: 'USD' } };
      },
    };

    const result = await playRound('BASE', 100_000, client);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.needsEndRound).toBe(false);
    expect(endRoundCalls).toBe(0);
  });

  it('defers a winning EndRound until presentation explicitly settles it', async () => {
    const winBook = createReplayBook('BASE', 'BASE-normal');
    expect(winBook.payoutMultiplier).toBeGreaterThan(0);
    let endRoundCalls = 0;
    const client = {
      Authenticate: async () => ({}),
      Play: async () => ({
        balance: { amount: 900_000, currency: 'USD' },
        round: {
          active: true,
          mode: 'BASE',
          state: winBook,
          payoutMultiplier: winBook.payoutMultiplier,
        },
      }),
      EndRound: async () => {
        endRoundCalls += 1;
        return { balance: { amount: 1_100_000, currency: 'USD' } };
      },
    };

    const result = await playRound('BASE', 100_000, client);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.needsEndRound).toBe(true);
    expect(endRoundCalls).toBe(0);

    const settlement = await settleRound(client);
    expect(settlement.ok).toBe(true);
    expect(endRoundCalls).toBe(1);
  });

  it('does not fabricate a demo result when connected RGS play fails', async () => {
    const client = {
      Authenticate: async () => ({}),
      Play: async () => {
        throw new Error('ERR_IS');
      },
      EndRound: async () => ({}),
    };

    const result = await playRound('BASE', 100_000, client);

    expect(result).toEqual({ ok: false, error: 'ERR_IS' });
  });

  it('hydrates Stake event arrays into the frontend book contract', () => {
    const board = Array.from({ length: 5 }, () => [
      { name: 'KEY' }, { name: 'WATCH' }, { name: 'LETTER' }, { name: 'RING' },
    ]);
    const book = normalizeEventBook('VAULT_ECHOES_BUY', [
      { index: 0, type: 'reveal', board },
      { index: 1, type: 'featureIntro', feature: 'vault_echoes' },
      { index: 2, type: 'winInfo', positions: [{ reel: 0, row: 0 }], totalWin: 25000 },
      { index: 3, type: 'setWin', amount: 25000 },
      { index: 4, type: 'setTotalWin', amount: 25000 },
      { index: 5, type: 'finalWin', amount: 25000 },
    ], 42);

    expect(book?.id).toBe('42');
    expect(book?.board[0]).toEqual(['VAULT', 'WATCH', 'LILIES', 'RING']);
    expect(book?.outcome.feature).toBe('vault');
    expect(book?.winPositions).toEqual([{ reel: 0, row: 0 }]);
  });
});
