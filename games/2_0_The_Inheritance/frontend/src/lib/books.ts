import { GAME_MODES, type FeatureKind, type GameModeId, MAX_WIN_MULTIPLIER } from './constants';
import { OUTCOME_TABLES, pickOutcome, TOTAL_WEIGHT, type ClauseId, type OutcomeBand } from './mathProfile';
import { hashSeed, mulberry32 } from './random';
import { REEL_SYMBOL_POOL, type SymbolKey } from './symbols';
import {
  buildBoardForTemplate,
  createNeutralBoard,
  evaluateWays,
  findWaysTemplate,
} from './waysMath';

export type Position = {
  reel: number;
  row: number;
};

export type SpinBook = {
  id: string;
  mode: GameModeId;
  costMultiplier: number;
  payoutMultiplier: number;
  outcome: OutcomeBand;
  board: SymbolKey[][];
  winPositions: Position[];
  prizeValues: Record<string, number>;
  events: BookEvent[];
  publishedEvents?: PublishedEvent[];
  published?: true;
};

export type PublishedEvent = {
  index: number;
  type: string;
  [key: string]: unknown;
};

export type BookEvent =
  | { index: number; type: 'featureIntro'; label: string; mode: GameModeId; feature: FeatureKind }
  | { index: number; type: 'presentationPlan'; seed: string; feature: FeatureKind; frames: number; phases: FeatureKind[] }
  | { index: number; type: 'ante'; costMultiplier: number }
  | { index: number; type: 'reveal'; board: SymbolKey[][]; anticipation: number[] }
  | { index: number; type: 'clauseSelected'; clause: ClauseId; label: string }
  | { index: number; type: 'expandWild'; reel: number; multiplier: number }
  | { index: number; type: 'vaultState'; locks: number; respins: number; collected: number }
  | { index: number; type: 'seancePossess'; reels: number[]; multiplier: number }
  | { index: number; type: 'codicilFusion'; stages: ['will', 'vault', 'seance'] }
  | { index: number; type: 'featureMeter'; current: number; total: number }
  | { index: number; type: 'freeSpins'; current: number; total: number }
  | { index: number; type: 'bigWin'; multiplier: number }
  | { index: number; type: 'maxWin'; multiplier: number }
  | { index: number; type: 'winInfo'; totalWin: number; positions: Position[] }
  | { index: number; type: 'finalWin'; amount: number };

type UnindexedBookEvent = BookEvent extends infer Event
  ? Event extends { index: number }
    ? Omit<Event, 'index'>
    : never
  : never;

const MODE_COSTS = Object.fromEntries(GAME_MODES.map((mode) => [mode.id, mode.costMultiplier])) as Record<GameModeId, number>;

export function createDemoBook(mode: GameModeId, seedInput = `${mode}-${Date.now()}`): SpinBook {
  const seed = hashSeed(seedInput);
  const random = mulberry32(seed);
  const outcome = pickOutcome(mode, random() * TOTAL_WEIGHT);
  return createBookFromOutcome(mode, outcome, seedInput);
}

export function createReplayBook(mode: GameModeId, eventId: string): SpinBook {
  const explicitOutcome = OUTCOME_TABLES[mode].find((outcome) => eventId.includes(outcome.kind));
  return createBookFromOutcome(mode, explicitOutcome ?? pickOutcome(mode, hashSeed(eventId) % TOTAL_WEIGHT), eventId);
}

export function createBookFromOutcome(mode: GameModeId, outcome: OutcomeBand, seedInput: string): SpinBook {
  const random = mulberry32(hashSeed(`${mode}:${outcome.id}:${seedInput}`));
  const board = createBoard(random, outcome, mode);
  const winPositions = createWinPositions(outcome, board);
  const prizeValues = createPrizeValues(board, outcome, random);
  const events = createEvents(mode, outcome, board, winPositions, prizeValues);

  return {
    id: `${mode}-${outcome.id}-${hashSeed(seedInput).toString(16)}`,
    mode,
    costMultiplier: MODE_COSTS[mode],
    payoutMultiplier: clampPayout(outcome.payoutMultiplier),
    outcome,
    board,
    winPositions,
    prizeValues,
    events,
  };
}

function createBoard(random: () => number, outcome: OutcomeBand, mode: GameModeId): SymbolKey[][] {
  if (outcome.feature === 'base' || outcome.feature === 'ante') {
    const activeWildReels = outcome.expandingWild ? [4] : [];
    const appliedMultiplier = outcome.multiplier ?? 1;
    const template = outcome.payoutMultiplier > 0
      ? findWaysTemplate(outcome.payoutMultiplier, appliedMultiplier, activeWildReels, random)
      : null;
    if (outcome.payoutMultiplier > 0 && !template) {
      throw new Error(`No exact base-game board exists for ${outcome.id}`);
    }
    const exactBoard = template
      ? buildBoardForTemplate(template, activeWildReels, random)
      : createNeutralBoard(random, activeWildReels);
    if (outcome.expandingWild) exactBoard[4][1] = 'WILD';
    return exactBoard;
  }

  const pool = mode === 'HEIRLOOM_ANTE'
    ? [...REEL_SYMBOL_POOL, 'TESTAMENT', 'VAULT', 'MIRROR', 'WILD'] as SymbolKey[]
    : REEL_SYMBOL_POOL;
  const board = Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => pool[Math.floor(random() * pool.length)]),
  );

  if (outcome.kind !== 'loss') {
    const lead: SymbolKey = outcome.feature === 'vault'
      ? 'VAULT'
      : outcome.feature === 'seance'
        ? 'MIRROR'
        : outcome.feature === 'will'
          ? 'TESTAMENT'
          : outcome.expandingWild
            ? 'WILD'
            : 'HEIRESS';
    board[0][1] = lead;
    board[1][1] = lead;
    board[2][1] = lead;
  }

  applyFeatureBoard(board, outcome);

  if (outcome.kind === 'max') {
    for (let reel = 0; reel < board.length; reel += 1) {
      board[reel] = reel % 2 === 0
        ? ['WILD', 'HEIRESS', 'WILD', 'VAULT']
        : ['MIRROR', 'WILD', 'TESTAMENT', 'WILD'];
    }
  }

  return board;
}

function applyFeatureBoard(board: SymbolKey[][], outcome: OutcomeBand): void {
  if (outcome.expandingWild) {
    const reel = outcome.feature === 'base' || outcome.feature === 'ante'
      ? 4
      : outcome.kind === 'max'
        ? 2
        : Math.max(1, Math.min(3, outcome.meter % 5));
    board[reel] = ['WILD', 'WILD', 'WILD', 'WILD'];
  }

  if (outcome.feature === 'will') {
    board[0][0] = 'TESTAMENT';
    board[2][2] = 'TESTAMENT';
    board[4][3] = 'TESTAMENT';
  }

  if (outcome.feature === 'vault') {
    const locks = Math.min(outcome.vaultLocks ?? 6, 20);
    for (let index = 0; index < locks; index += 1) {
      board[index % 5][Math.floor(index / 5)] = 'VAULT';
    }
  }

  if (outcome.feature === 'seance') {
    board[0][0] = 'MIRROR';
    board[2][1] = 'MIRROR';
    board[4][3] = 'MIRROR';
    for (const reel of outcome.possessedReels ?? []) {
      board[reel] = ['WILD', 'MIRROR', 'WILD', 'MIRROR'];
    }
  }

  if (outcome.feature === 'codicil') {
    board[0] = ['TESTAMENT', 'WILD', 'VAULT', 'MIRROR'];
    board[2] = ['MIRROR', 'WILD', 'TESTAMENT', 'VAULT'];
    board[4] = ['VAULT', 'MIRROR', 'WILD', 'TESTAMENT'];
    for (const reel of outcome.possessedReels ?? []) {
      if (reel === 1 || reel === 3) {
        board[reel] = ['WILD', 'WILD', 'MIRROR', 'WILD'];
      }
    }
  }
}

function createPrizeValues(
  board: SymbolKey[][],
  outcome: OutcomeBand,
  random: () => number,
): Record<string, number> {
  if ((outcome.feature !== 'vault' && outcome.feature !== 'codicil') || outcome.kind === 'loss') {
    return {};
  }
  const values = [1, 2, 3, 5, 8, 10, 15, 20, 25, 50];
  const scale = Math.max(1, Math.round((outcome.multiplier ?? 1) / 3));
  const result: Record<string, number> = {};
  board.forEach((reel, reelIndex) => {
    reel.forEach((symbol, row) => {
      if (symbol === 'VAULT') {
        result[`${reelIndex}:${row}`] = values[Math.floor(random() * values.length)] * scale;
      }
    });
  });
  return result;
}

function createWinPositions(outcome: OutcomeBand, board: SymbolKey[][]): Position[] {
  if (outcome.kind === 'loss') {
    return [];
  }
  if (outcome.feature === 'base' || outcome.feature === 'ante') {
    return evaluateWays(
      board,
      outcome.multiplier ?? 1,
      outcome.expandingWild ? [4] : [],
    ).positions;
  }
  if (outcome.kind === 'max') {
    return board.flatMap((reel, reelIndex) => reel.map((_, row) => ({ reel: reelIndex, row })));
  }

  const positions: Position[] = [
    { reel: 0, row: 1 },
    { reel: 1, row: 1 },
    { reel: 2, row: 1 },
  ];
  board.forEach((reel, reelIndex) => {
    if (reel.every((symbol) => symbol === 'WILD')) {
      positions.push(...reel.map((_, row) => ({ reel: reelIndex, row })));
    }
  });
  return uniquePositions(positions);
}

function createEvents(
  mode: GameModeId,
  outcome: OutcomeBand,
  board: SymbolKey[][],
  winPositions: Position[],
  prizeValues: Record<string, number>,
): BookEvent[] {
  const modeConfig = GAME_MODES.find((candidate) => candidate.id === mode) ?? GAME_MODES[0];
  const events: BookEvent[] = [];
  const add = (event: UnindexedBookEvent) => events.push({ ...event, index: events.length } as BookEvent);

  if (modeConfig.category === 'boost') {
    add({ type: 'ante', costMultiplier: modeConfig.costMultiplier });
  }
  if (modeConfig.isBuyBonus || outcome.feature !== 'base' && outcome.feature !== 'ante') {
    add({ type: 'featureIntro', label: featureLabel(outcome.feature), mode, feature: outcome.feature });
  }
  add({
    type: 'presentationPlan',
    seed: `${mode}:${outcome.id}`,
    feature: outcome.feature,
    frames: presentationFrameCount(outcome),
    phases: outcome.feature === 'codicil' ? ['will', 'vault', 'seance'] : [outcome.feature],
  });

  add({ type: 'reveal', board, anticipation: anticipationFor(outcome.feature) });
  add({ type: 'featureMeter', current: outcome.meter, total: 15 });

  if (outcome.freeSpins) {
    add({ type: 'freeSpins', current: Math.min(outcome.freeSpins, Math.max(1, Math.ceil(outcome.meter / 2))), total: outcome.freeSpins });
  }
  if (outcome.clause) {
    add({ type: 'clauseSelected', clause: outcome.clause, label: clauseLabel(outcome.clause) });
  }
  if (outcome.expandingWild) {
    const exactBaseReel = outcome.feature === 'base' || outcome.feature === 'ante' ? 4 : -1;
    const reel = exactBaseReel >= 0
      ? exactBaseReel
      : board.findIndex((candidate) => candidate.every((symbol) => symbol === 'WILD'));
    add({ type: 'expandWild', reel: reel >= 0 ? reel : 2, multiplier: outcome.multiplier ?? 1 });
  }
  if (outcome.vaultLocks) {
    add({
      type: 'vaultState',
      locks: outcome.vaultLocks,
      respins: outcome.respins ?? 3,
      collected: Object.values(prizeValues).reduce((sum, value) => sum + value, 0),
    });
  }
  if (outcome.possessedReels) {
    add({ type: 'seancePossess', reels: outcome.possessedReels, multiplier: outcome.multiplier ?? 1 });
  }
  if (outcome.feature === 'codicil') {
    add({ type: 'codicilFusion', stages: ['will', 'vault', 'seance'] });
  }
  if (outcome.kind === 'max') {
    add({ type: 'maxWin', multiplier: outcome.payoutMultiplier });
  } else if (outcome.kind === 'big' || outcome.kind === 'epic') {
    add({ type: 'bigWin', multiplier: outcome.payoutMultiplier });
  }
  add({ type: 'winInfo', totalWin: outcome.payoutMultiplier, positions: winPositions });
  add({ type: 'finalWin', amount: outcome.payoutMultiplier });
  return events;
}

function anticipationFor(feature: FeatureKind): number[] {
  switch (feature) {
    case 'will':
      return [0, 0, 1, 1, 2];
    case 'vault':
      return [0, 1, 1, 2, 2];
    case 'seance':
      return [0, 0, 1, 2, 3];
    case 'codicil':
      return [1, 1, 2, 2, 3];
    default:
      return [0, 0, 0, 0, 0];
  }
}

function presentationFrameCount(outcome: OutcomeBand): number {
  if (outcome.feature === 'will' || outcome.feature === 'seance') {
    return outcome.freeSpins ?? (outcome.feature === 'will' ? 8 : 10);
  }
  if (outcome.feature === 'vault') {
    const activeFrames = Math.min(5, Math.max(1, Math.ceil(((outcome.vaultLocks ?? 6) - 6) / 2)));
    return activeFrames + 3;
  }
  if (outcome.feature === 'codicil') return 11;
  return 1;
}

function featureLabel(feature: FeatureKind): string {
  switch (feature) {
    case 'will':
      return 'The Sealed Will';
    case 'vault':
      return 'Vault of Echoes';
    case 'seance':
      return 'Midnight Séance';
    case 'codicil':
      return 'The Final Codicil';
    case 'ante':
      return 'Heirloom Ante';
    default:
      return 'Blackthorn Estate';
  }
}

function clauseLabel(clause: ClauseId): string {
  switch (clause) {
    case 'widows-share':
      return 'Widow’s Share';
    case 'outsiders-clause':
      return 'Outsider’s Clause';
    case 'secret-heir':
      return 'Secret Heir';
  }
}

function uniquePositions(positions: Position[]): Position[] {
  const seen = new Set<string>();
  return positions.filter((position) => {
    const key = `${position.reel}:${position.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampPayout(value: number): number {
  return Math.min(value, MAX_WIN_MULTIPLIER);
}
