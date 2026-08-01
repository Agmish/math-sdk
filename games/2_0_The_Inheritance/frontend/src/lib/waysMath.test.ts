import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  buildBoardForTemplate,
  evaluateWays,
  findWaysTemplate,
  planWaysWins,
} from './waysMath';

describe('1,024-ways evaluator', () => {
  it('multiplies symbol pay by the number of visible ways', () => {
    const board = [
      ['HEIRESS', 'HEIRESS', 'VAULT', 'MIRROR'],
      ['HEIRESS', 'VAULT', 'MIRROR', 'TESTAMENT'],
      ['HEIRESS', 'HEIRESS', 'VAULT', 'MIRROR'],
      ['RING', 'WATCH', 'LILIES', 'CANDELABRUM'],
      ['HEIRESS', 'EXECUTOR', 'STAG', 'RAVEN_KEY'],
    ] as const;
    const result = evaluateWays(board.map((reel) => [...reel]));

    expect(result.wins).toHaveLength(1);
    expect(result.wins[0]).toMatchObject({
      symbol: 'HEIRESS',
      matchLength: 3,
      ways: 4,
      basePayMultiplier: 1,
      appliedMultiplier: 1,
      totalMultiplier: 4,
    });
  });

  it('counts a complete expanded Wild reel and feature power exactly once', () => {
    const random = mulberry32(1927);
    const template = findWaysTemplate(24, 2, [1], random);
    expect(template).not.toBeNull();
    const board = buildBoardForTemplate(template!, [1], random);
    const result = evaluateWays(board, 2, [1]);

    expect(result.totalMultiplier).toBe(24);
    expect(result.wins[0].counts[1]).toBe(4);
  });

  it('finds an exact multi-spin plan instead of dividing an award arbitrarily', () => {
    const random = mulberry32(2026);
    const frames = [
      { multiplier: 1, activeWildReels: [] },
      { multiplier: 2, activeWildReels: [4] },
      { multiplier: 3, activeWildReels: [3, 4] },
      { multiplier: 4, activeWildReels: [1] },
      { multiplier: 5, activeWildReels: [2] },
    ];
    const plan = planWaysWins(100, frames, random);

    expect(plan.length).toBeGreaterThan(0);
    expect(plan.reduce((total, entry) => total + entry.template.totalMultiplier, 0))
      .toBeCloseTo(100, 8);
  });
});
