import { describe, expect, it } from 'vitest';
import { GAME_MODES, MAX_WIN_MULTIPLIER } from './constants';
import { createBookFromOutcome, createReplayBook } from './books';
import { OUTCOME_TABLES } from './mathProfile';
import { evaluateWays } from './waysMath';

describe('The Inheritance book generation', () => {
  it('creates 5x4 replay books for every mode', () => {
    for (const mode of GAME_MODES) {
      const book = createReplayBook(mode.id, `${mode.id}-normal`);
      expect(book.mode).toBe(mode.id);
      expect(book.board).toHaveLength(5);
      expect(book.board.every((reel) => reel.length === 4)).toBe(true);
      expect(book.events[book.events.length - 1]?.type).toBe('finalWin');
      expect(book.events.some((event) => event.type === 'presentationPlan')).toBe(true);
    }
  });

  it('caps max-win books at the published 15,000x', () => {
    for (const mode of GAME_MODES) {
      const book = createReplayBook(mode.id, `${mode.id}-max`);
      expect(book.payoutMultiplier).toBe(MAX_WIN_MULTIPLIER);
      expect(book.outcome.kind).toBe('max');
    }
  });

  it('starts every buy mode with its named feature intro', () => {
    for (const mode of GAME_MODES.filter((candidate) => candidate.isBuyBonus)) {
      const book = createReplayBook(mode.id, `${mode.id}-normal`);
      const intro = book.events.find((event) => event.type === 'featureIntro');
      expect(intro).toMatchObject({ type: 'featureIntro', feature: mode.feature });
    }
  });

  it('makes the ante visibly denser with special-symbol pressure', () => {
    const ante = createReplayBook('HEIRLOOM_ANTE', 'HEIRLOOM_ANTE-bonus');
    const specialCount = ante.board.flat().filter((symbol) =>
      ['TESTAMENT', 'VAULT', 'MIRROR', 'WILD'].includes(symbol),
    ).length;
    expect(ante.events.some((event) => event.type === 'ante')).toBe(true);
    expect(specialCount).toBeGreaterThanOrEqual(2);
  });

  it('emits different event families for each feature', () => {
    const will = createReplayBook('SEALED_WILL_BUY', 'SEALED_WILL_BUY-wild');
    const vault = createReplayBook('VAULT_ECHOES_BUY', 'VAULT_ECHOES_BUY-bonus');
    const seance = createReplayBook('MIDNIGHT_SEANCE_BUY', 'MIDNIGHT_SEANCE_BUY-bonus');
    const codicil = createReplayBook('FINAL_CODICIL_BUY', 'FINAL_CODICIL_BUY-epic');

    expect(will.events.some((event) => event.type === 'clauseSelected')).toBe(true);
    expect(will.events.some((event) => event.type === 'expandWild')).toBe(true);
    expect(vault.events.some((event) => event.type === 'vaultState')).toBe(true);
    expect(Object.keys(vault.prizeValues).length).toBeGreaterThan(0);
    expect(seance.events.some((event) => event.type === 'seancePossess')).toBe(true);
    expect(codicil.events.some((event) => event.type === 'codicilFusion')).toBe(true);
  });

  it('stores base and ante wins as exact visible ways results', () => {
    for (const mode of ['BASE', 'HEIRLOOM_ANTE'] as const) {
      for (const outcome of OUTCOME_TABLES[mode].filter(
        (candidate) => candidate.feature === 'base' || candidate.feature === 'ante',
      )) {
        const book = createBookFromOutcome(mode, outcome, `book-audit:${outcome.id}`);
        const evaluation = evaluateWays(
          book.board,
          outcome.multiplier ?? 1,
          outcome.expandingWild ? [4] : [],
        );
        expect(evaluation.totalMultiplier, outcome.id).toBeCloseTo(outcome.payoutMultiplier, 8);
        expect(book.winPositions).toEqual(evaluation.positions);
      }
    }
  });
});
