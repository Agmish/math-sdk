import contract from '../../../game_contract.json';
import { GAME_MODES, type FeatureKind, type GameModeId, RTP_TARGET } from './constants';

export type OutcomeKind = 'loss' | 'normal' | 'wild' | 'bonus' | 'big' | 'epic' | 'max';
export type ClauseId = 'widows-share' | 'outsiders-clause' | 'secret-heir';

export type OutcomeBand = {
  id: string;
  label: string;
  kind: OutcomeKind;
  feature: FeatureKind;
  weight: number;
  payoutMultiplier: number;
  meter: number;
  freeSpins?: number;
  expandingWild?: boolean;
  multiplier?: number;
  clause?: ClauseId;
  vaultLocks?: number;
  respins?: number;
  possessedReels?: number[];
};

export const TOTAL_WEIGHT = 1_000_000;

function featureKind(value: string, modeId: GameModeId): FeatureKind {
  switch (value) {
    case 'sealed_will': return 'will';
    case 'vault_echoes': return 'vault';
    case 'midnight_seance': return 'seance';
    case 'final_codicil': return 'codicil';
    default: return modeId === 'HEIRLOOM_ANTE' ? 'ante' : 'base';
  }
}

function outcomeKind(id: string, payout: number, cost: number): OutcomeKind {
  if (id === 'loss' || payout === 0) return 'loss';
  if (id === 'max_win') return 'max';
  if (id === 'expanding_wild') return 'wild';
  if (payout >= cost * 10) return 'epic';
  if (payout >= cost * 2) return 'big';
  if (payout >= cost) return 'bonus';
  return 'normal';
}

function presentationFields(
  modeId: GameModeId,
  feature: FeatureKind,
  payout: number,
  cost: number,
): Partial<OutcomeBand> {
  if (feature === 'will') {
    const retriggered = modeId === 'SEALED_WILL_BUY' && payout >= 200;
    return {
      freeSpins: retriggered ? 10 : 8,
      expandingWild: true,
      multiplier: 1,
      clause: 'widows-share',
    };
  }
  if (feature === 'vault') return { vaultLocks: 6, respins: 6 };
  if (feature === 'seance') {
    const retriggered = modeId === 'MIDNIGHT_SEANCE_BUY' && payout >= 500;
    return { freeSpins: retriggered ? 12 : 10, possessedReels: [0], multiplier: 1 };
  }
  if (feature === 'codicil') {
    return { freeSpins: 11, expandingWild: true, vaultLocks: 3, possessedReels: [0], multiplier: 1 };
  }
  if (payout === 3 || payout === 3.6) {
    return { expandingWild: true, multiplier: payout === 3 ? 2.5 : 3 };
  }
  return {};
}

export const OUTCOME_TABLES = Object.fromEntries(
  contract.modes.map((sourceMode) => {
    const modeId = sourceMode.id as GameModeId;
    const outcomes: OutcomeBand[] = sourceMode.outcomes.map((source, index) => {
      const feature = featureKind(source.feature, modeId);
      return {
        id: `${modeId.toLowerCase()}-${source.id}`,
        label: source.id.split('_').join(' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
        kind: outcomeKind(source.id, source.payoutMultiplier, sourceMode.cost),
        feature,
        weight: source.weight,
        payoutMultiplier: source.payoutMultiplier,
        meter: Math.min(15, Math.max(0, Math.ceil((index / Math.max(1, sourceMode.outcomes.length - 1)) * 15))),
        ...presentationFields(modeId, feature, source.payoutMultiplier, sourceMode.cost),
      };
    });
    return [modeId, outcomes];
  }),
) as Record<GameModeId, OutcomeBand[]>;

export function getMode(modeId: GameModeId) {
  return GAME_MODES.find((mode) => mode.id === modeId) ?? GAME_MODES[0];
}

export function expectedPayoutMultiplier(modeId: GameModeId): number {
  return OUTCOME_TABLES[modeId].reduce(
    (total, outcome) => total + outcome.weight * outcome.payoutMultiplier,
    0,
  ) / TOTAL_WEIGHT;
}

export function theoreticalRtp(modeId: GameModeId): number {
  return expectedPayoutMultiplier(modeId) / getMode(modeId).costMultiplier;
}

export function probabilityBelowCost(modeId: GameModeId): number {
  const cost = getMode(modeId).costMultiplier;
  return OUTCOME_TABLES[modeId]
    .filter((outcome) => outcome.payoutMultiplier < cost)
    .reduce((total, outcome) => total + outcome.weight, 0) / TOTAL_WEIGHT;
}

export function zeroReturnProbability(modeId: GameModeId): number {
  return OUTCOME_TABLES[modeId]
    .filter((outcome) => outcome.payoutMultiplier === 0)
    .reduce((total, outcome) => total + outcome.weight, 0) / TOTAL_WEIGHT;
}

export function assertExactRtp(modeId: GameModeId): void {
  const rtp = theoreticalRtp(modeId);
  if (Math.abs(rtp - RTP_TARGET) > 0.000000001) {
    throw new Error(`${modeId} RTP must be exactly 96.00%; got ${(rtp * 100).toFixed(8)}%`);
  }
}

export function pickOutcome(modeId: GameModeId, roll: number): OutcomeBand {
  const table = OUTCOME_TABLES[modeId];
  const normalizedRoll = Math.max(0, Math.min(TOTAL_WEIGHT - 1, Math.floor(roll)));
  let cursor = 0;
  for (const outcome of table) {
    cursor += outcome.weight;
    if (normalizedRoll < cursor) return outcome;
  }
  return table[table.length - 1];
}
