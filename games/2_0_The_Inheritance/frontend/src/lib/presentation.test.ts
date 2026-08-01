import { describe, expect, it } from 'vitest';
import { createBookFromOutcome, createReplayBook } from './books';
import { OUTCOME_TABLES } from './mathProfile';
import { buildPresentation } from './presentation';
import { evaluateWays } from './waysMath';

describe('round presentation sequences', () => {
  it('keeps every frame on the five-by-four picture grid', () => {
    for (const mode of [
      'BASE',
      'SEALED_WILL_BUY',
      'VAULT_ECHOES_BUY',
      'MIDNIGHT_SEANCE_BUY',
      'FINAL_CODICIL_BUY',
    ] as const) {
      const sequence = buildPresentation(createReplayBook(mode, `${mode}-big`));
      for (const frame of sequence.frames) {
        expect(frame.board).toHaveLength(5);
        expect(frame.board.every((reel) => reel.length === 4)).toBe(true);
      }
    }
  });

  it('plays The Sealed Will as free spins with an animated expanding Wild', () => {
    const sequence = buildPresentation(createReplayBook('SEALED_WILL_BUY', 'will-wild'));

    expect(sequence.frames).toHaveLength(8);
    expect(sequence.frames.every((frame) => frame.counterLabel === 'FREE SPINS')).toBe(true);
    expect(sequence.frames.some((frame) => frame.expandingWild?.kind === 'wax')).toBe(true);
    expect(sequence.frames.some((frame) => frame.activeWildReels.length > 0)).toBe(true);
  });

  it('keeps expanded Will reels visible through the canonical eight-spin sequence', () => {
    const sequence = buildPresentation(createReplayBook('SEALED_WILL_BUY', 'normal'));

    expect(sequence.introDetail).toContain('sticky');
    expect(sequence.frames[sequence.frames.length - 1].activeWildReels.length).toBeGreaterThan(0);
  });

  it('plays Vault of Echoes as a resetting hold-and-respin round', () => {
    const sequence = buildPresentation(createReplayBook('VAULT_ECHOES_BUY', 'VAULT_ECHOES_BUY-bonus'));

    expect(sequence.frames.every((frame) => frame.phase === 'vault')).toBe(true);
    expect(sequence.frames[0].lockedValues).toBeGreaterThanOrEqual(6);
    const finalFrame = sequence.frames[sequence.frames.length - 1];
    expect(finalFrame.respinsLeft).toBe(0);
    expect(finalFrame.lockedValues).toBeGreaterThanOrEqual(sequence.frames[0].lockedValues);
    expect(Object.values(finalFrame.prizeValues).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(sequence.totalPayoutMultiplier, 8);
    expect(finalFrame.winBreakdown?.kind).toBe('collection');
  });

  it('plays Midnight Séance with a roaming possessed Wild reel', () => {
    const sequence = buildPresentation(createReplayBook('MIDNIGHT_SEANCE_BUY', 'seance-possession'));
    const reels = sequence.frames.map((frame) => frame.expandingWild?.reel);

    expect(sequence.frames).toHaveLength(10);
    expect(sequence.frames.every((frame) => frame.expandingWild?.kind === 'spirit')).toBe(true);
    expect(new Set(reels).size).toBeGreaterThan(1);
    for (let index = 1; index < sequence.frames.length; index += 1) {
      const previous = sequence.frames[index - 1];
      const current = sequence.frames[index];
      if (current.visitedReels.length === previous.visitedReels.length) {
        expect(current.multiplier).toBe(previous.multiplier);
      }
    }
  });

  it('plays the Final Codicil in Will, Vault and Séance stages', () => {
    const sequence = buildPresentation(createReplayBook('FINAL_CODICIL_BUY', 'codicil-seance'));

    expect(sequence.frames).toHaveLength(11);
    expect(sequence.frames.map((frame) => frame.phase)).toContain('will');
    expect(sequence.frames.map((frame) => frame.phase)).toContain('vault');
    expect(sequence.frames.map((frame) => frame.phase)).toContain('seance');
  });

  it('distributes but never changes the published round payout', () => {
    for (const mode of [
      'BASE',
      'SEALED_WILL_BUY',
      'VAULT_ECHOES_BUY',
      'MIDNIGHT_SEANCE_BUY',
      'FINAL_CODICIL_BUY',
    ] as const) {
      const book = createReplayBook(mode, `${mode}-epic`);
      const sequence = buildPresentation(book);
      const presentedTotal = sequence.frames.reduce((total, frame) => total + frame.spinWinMultiplier, 0);

      expect(presentedTotal).toBeCloseTo(book.payoutMultiplier, 8);
      expect(sequence.frames[sequence.frames.length - 1].cumulativeWinMultiplier).toBeCloseTo(book.payoutMultiplier, 8);
    }
  });

  it('maps every displayed ways win to the actual highlighted picture positions', () => {
    for (const mode of [
      'SEALED_WILL_BUY',
      'MIDNIGHT_SEANCE_BUY',
      'FINAL_CODICIL_BUY',
    ] as const) {
      const sequence = buildPresentation(createReplayBook(mode, `${mode}-bonus`));
      for (const frame of sequence.frames.filter((candidate) => candidate.winBreakdown?.kind === 'ways')) {
        const breakdown = frame.winBreakdown;
        const evaluation = evaluateWays(frame.board, frame.multiplier, frame.activeWildReels);
        expect(evaluation.totalMultiplier).toBeCloseTo(frame.spinWinMultiplier, 8);
        expect(evaluation.wins).toHaveLength(1);
        expect(breakdown?.matchLength).toBeGreaterThanOrEqual(3);
        for (let reel = 0; reel < (breakdown?.matchLength ?? 0); reel += 1) {
          const reelPositions = frame.winPositions.filter((position) => position.reel === reel);
          expect(reelPositions.length).toBeGreaterThan(0);
          if (!frame.activeWildReels.includes(reel)) {
            expect(reelPositions.every((position) => frame.board[reel][position.row] === breakdown?.icon)).toBe(true);
          }
        }
      }
    }
  });

  it('reconciles every published outcome against the visible paytable', () => {
    for (const [mode, outcomes] of Object.entries(OUTCOME_TABLES)) {
      for (const outcome of outcomes) {
        const book = createBookFromOutcome(
          mode as keyof typeof OUTCOME_TABLES,
          outcome,
          `audit:${mode}:${outcome.id}`,
        );
        const sequence = buildPresentation(book);
        const presentedTotal = sequence.frames.reduce(
          (total, frame) => total + frame.spinWinMultiplier,
          0,
        );
        expect(presentedTotal, `${mode}/${outcome.id}`).toBeCloseTo(outcome.payoutMultiplier, 8);

        for (const frame of sequence.frames) {
          if (
            frame.phase !== 'vault' &&
            frame.winBreakdown?.kind === 'ways'
          ) {
            const evaluation = evaluateWays(frame.board, frame.multiplier, frame.activeWildReels);
            expect(evaluation.totalMultiplier, frame.id).toBeCloseTo(frame.spinWinMultiplier, 8);
          }
          if (frame.winBreakdown?.kind === 'collection') {
            const visibleCollection = Object.values(frame.prizeValues)
              .reduce((sum, value) => sum + value, 0);
            expect(visibleCollection, frame.id).toBeCloseTo(frame.spinWinMultiplier, 8);
          }
        }
      }
    }
  });

  it('shows real winning reveals and a retrigger in representative free-spin outcomes', () => {
    const willOutcome = OUTCOME_TABLES.SEALED_WILL_BUY.find((outcome) => (outcome.freeSpins ?? 0) > 8)!;
    const seanceOutcome = OUTCOME_TABLES.MIDNIGHT_SEANCE_BUY.find((outcome) => (outcome.freeSpins ?? 0) > 10)!;
    const will = buildPresentation(createBookFromOutcome('SEALED_WILL_BUY', willOutcome, 'will-retrigger'));
    const seance = buildPresentation(createBookFromOutcome('MIDNIGHT_SEANCE_BUY', seanceOutcome, 'seance-retrigger'));

    expect(will.frames.filter((frame) => frame.spinWinMultiplier > 0).length).toBeGreaterThanOrEqual(3);
    expect(seance.frames.filter((frame) => frame.spinWinMultiplier > 0).length).toBeGreaterThanOrEqual(3);
    const willRetrigger = will.frames.find((frame) => frame.mechanicLabel.includes('RETRIGGERED'));
    const seanceRetrigger = seance.frames.find((frame) => frame.mechanicLabel.includes('RETRIGGERED'));
    expect(willRetrigger).toBeDefined();
    expect(seanceRetrigger).toBeDefined();
    expect(willRetrigger?.board.flat().filter((symbol) => symbol === 'TESTAMENT')).toHaveLength(3);
    expect(seanceRetrigger?.board.flat().filter((symbol) => symbol === 'MIRROR').length).toBeGreaterThanOrEqual(3);
  });
});
