import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_MODES, RTP_TARGET } from './constants';
import {
  OUTCOME_TABLES,
  TOTAL_WEIGHT,
  expectedPayoutMultiplier,
  probabilityBelowCost,
  theoreticalRtp,
  zeroReturnProbability,
} from './mathProfile';

type PublishedParSheet = {
  modes: Array<{
    name: string;
    cost: number;
    rtp: number;
    zeroReturnRate: number;
    belowCostRate: number;
  }>;
};

describe('The Inheritance RTP profile', () => {
  it('keeps every playable mode at exactly 96.00% RTP', () => {
    for (const mode of GAME_MODES) {
      expect(theoreticalRtp(mode.id)).toBeCloseTo(RTP_TARGET, 10);
      expect((theoreticalRtp(mode.id) * 100).toFixed(2)).toBe('96.00');
    }
  });

  it('scales expected payout by the mode cost multiplier', () => {
    for (const mode of GAME_MODES) {
      expect(expectedPayoutMultiplier(mode.id)).toBeCloseTo(mode.costMultiplier * RTP_TARGET, 8);
    }
  });

  it('uses complete one-million weight tables with a max-win specimen', () => {
    for (const mode of GAME_MODES) {
      expect(OUTCOME_TABLES[mode.id].reduce((total, outcome) => total + outcome.weight, 0)).toBe(TOTAL_WEIGHT);
      expect(OUTCOME_TABLES[mode.id].some((outcome) => outcome.kind === 'max')).toBe(true);
    }
  });

  it('makes Heirloom Ante more feature-dense than the base game', () => {
    const featureWeight = (modeId: 'BASE' | 'HEIRLOOM_ANTE') =>
      OUTCOME_TABLES[modeId]
        .filter((outcome) => ['will', 'vault', 'seance', 'codicil'].includes(outcome.feature))
        .reduce((total, outcome) => total + outcome.weight, 0);
    expect(featureWeight('HEIRLOOM_ANTE')).toBeGreaterThan(featureWeight('BASE'));
  });

  it('gives the casino a positive 4% long-run edge and allows losses in every buy mode', () => {
    for (const mode of GAME_MODES) {
      expect(1 - theoreticalRtp(mode.id)).toBeCloseTo(0.04, 12);
    }

    for (const mode of GAME_MODES.filter((candidate) => candidate.isBuyBonus)) {
      expect(zeroReturnProbability(mode.id)).toBeGreaterThan(0);
      expect(probabilityBelowCost(mode.id)).toBeGreaterThan(0);
      expect(probabilityBelowCost(mode.id)).toBeLessThan(1);
    }
  });

  it('matches the generated Stake publication weights and payouts exactly', () => {
    const published = JSON.parse(
      readFileSync(new URL('../../../library/configs/par_sheet.json', import.meta.url), 'utf8'),
    ) as PublishedParSheet;

    for (const mode of GAME_MODES) {
      const publishedMode = published.modes.find((candidate) => candidate.name === mode.id);
      expect(publishedMode, mode.id).toBeDefined();
      expect(publishedMode?.cost).toBe(mode.costMultiplier);
      expect(publishedMode?.rtp).toBeCloseTo(theoreticalRtp(mode.id), 10);
      expect(publishedMode?.zeroReturnRate).toBeCloseTo(zeroReturnProbability(mode.id), 8);
      expect(publishedMode?.belowCostRate).toBeCloseTo(probabilityBelowCost(mode.id), 8);
    }
  });
});
