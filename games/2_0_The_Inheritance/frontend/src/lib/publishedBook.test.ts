import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/published-books.json';
import { MODE_IDS, type GameModeId } from './constants';
import { buildPresentation } from './presentation';
import { normalizePublishedBook } from './publishedBook';

describe('published Stake math books', () => {
  it('normalizes numeric IDs, symbol objects and hundredth-multiplier units', () => {
    for (const mode of MODE_IDS) {
      for (const kind of ['loss', 'positive', 'max'] as const) {
        const raw = fixtures[mode][kind];
        const book = normalizePublishedBook(mode, raw);
        expect(book).not.toBeNull();
        expect(book?.id).toBe(String(raw.id));
        expect(book?.payoutMultiplier).toBe(raw.payoutMultiplier / 100);
        expect(book?.costMultiplier).toBe(raw.resultMeta.costMultiplier);
        expect(book?.publishedEvents?.map((event) => event.index)).toEqual(
          raw.events.map((_, index) => index),
        );
        expect(book?.board).toHaveLength(5);
        expect(book?.board.every((reel) => reel.length === 4)).toBe(true);
      }
    }
  });

  it('builds the presentation directly from the published event sequence', () => {
    for (const mode of MODE_IDS as GameModeId[]) {
      const book = normalizePublishedBook(mode, fixtures[mode].positive);
      expect(book).not.toBeNull();
      const sequence = buildPresentation(book!);
      expect(sequence.frames.length).toBeGreaterThan(0);
      expect(sequence.totalPayoutMultiplier).toBe(book!.payoutMultiplier);
      expect(
        sequence.frames.reduce((sum, frame) => sum + frame.spinWinMultiplier, 0),
      ).toBeCloseTo(book!.payoutMultiplier, 8);
      expect(sequence.frames[sequence.frames.length - 1]?.cumulativeWinMultiplier).toBeCloseTo(
        book!.payoutMultiplier,
        8,
      );
    }
  });

  it('preserves free-spin counters while scaling only payout-unit event fields', () => {
    for (const mode of ['SEALED_WILL_BUY', 'MIDNIGHT_SEANCE_BUY'] as const) {
      const book = normalizePublishedBook(mode, fixtures[mode].max);
      expect(book).not.toBeNull();
      const updates = book!.publishedEvents!.filter((event) => event.type === 'updateFreeSpin');
      expect(updates.map((event) => event.amount)).toEqual(
        updates.map((_, index) => index),
      );
      const sequence = buildPresentation(book!);
      expect(sequence.frames.some((frame) => frame.mechanicLabel.includes('RETRIGGERED'))).toBe(true);
      expect(sequence.frames.every((frame) => Number.isInteger(frame.spinNumber))).toBe(true);
      expect(sequence.frames[sequence.frames.length - 1].cumulativeWinMultiplier)
        .toBeCloseTo(book!.payoutMultiplier, 8);
    }
  });
});
