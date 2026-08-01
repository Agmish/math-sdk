import type { Position } from './books';
import { SYMBOL_BY_KEY, type SymbolKey } from './symbols';

export type EvaluatedWaysWin = {
  symbol: SymbolKey;
  matchLength: number;
  ways: number;
  basePayMultiplier: number;
  appliedMultiplier: number;
  totalMultiplier: number;
  positions: Position[];
  counts: number[];
};

export type WaysEvaluation = {
  wins: EvaluatedWaysWin[];
  totalMultiplier: number;
  positions: Position[];
};

export type WaysTemplate = {
  symbol: SymbolKey;
  matchLength: number;
  counts: number[];
  ways: number;
  basePayMultiplier: number;
  appliedMultiplier: number;
  totalMultiplier: number;
  totalCents: number;
};

export type WaysFrameSpec = {
  multiplier: number;
  activeWildReels: number[];
};

export type PlannedWaysWin = {
  frameIndex: number;
  template: WaysTemplate;
};

const PAYING_SYMBOLS = Object.values(SYMBOL_BY_KEY)
  .filter((symbol) => Boolean(symbol.pays))
  .map((symbol) => symbol.key);

const FILLER_GROUPS: SymbolKey[][] = [
  ['HEIRESS', 'EXECUTOR', 'STAG', 'RAVEN_KEY'],
  ['RING', 'WATCH', 'LILIES', 'CANDELABRUM'],
];

const SPECIAL_FILLERS: SymbolKey[] = ['TESTAMENT', 'VAULT', 'MIRROR'];

export function evaluateWays(
  board: SymbolKey[][],
  appliedMultiplier = 1,
  activeWildReels: number[] = [],
): WaysEvaluation {
  const activeWilds = new Set(activeWildReels);
  const wins: EvaluatedWaysWin[] = [];

  for (const symbolKey of PAYING_SYMBOLS) {
    const symbol = SYMBOL_BY_KEY[symbolKey];
    const counts: number[] = [];
    const positions: Position[] = [];

    for (let reel = 0; reel < board.length; reel += 1) {
      const reelPositions: Position[] = [];
      for (let row = 0; row < board[reel].length; row += 1) {
        if (activeWilds.has(reel) || board[reel][row] === 'WILD' || board[reel][row] === symbolKey) {
          reelPositions.push({ reel, row });
        }
      }
      if (reelPositions.length === 0) break;
      counts.push(reelPositions.length);
      positions.push(...reelPositions);
    }

    const matchLength = counts.length;
    if (matchLength < 3) continue;
    const ways = counts.reduce((product, count) => product * count, 1);
    const basePayMultiplier = symbol.pays?.[matchLength - 1] ?? 0;
    const totalMultiplier = roundMultiplier(basePayMultiplier * ways * appliedMultiplier);
    if (totalMultiplier <= 0) continue;
    wins.push({
      symbol: symbolKey,
      matchLength,
      ways,
      basePayMultiplier,
      appliedMultiplier,
      totalMultiplier,
      positions,
      counts,
    });
  }

  const totalMultiplier = roundMultiplier(
    wins.reduce((total, win) => total + win.totalMultiplier, 0),
  );
  return {
    wins,
    totalMultiplier,
    positions: uniquePositions(wins.flatMap((win) => win.positions)),
  };
}

export function createNeutralBoard(
  random: () => number,
  activeWildReels: number[] = [],
): SymbolKey[][] {
  const activeWilds = new Set(activeWildReels);
  const nonWildPrefix = [0, 1, 2].filter((reel) => !activeWilds.has(reel));
  const useSpecialFillers = nonWildPrefix.length <= 1;
  let nonWildIndex = 0;

  return Array.from({ length: 5 }, (_, reel) => {
    if (activeWilds.has(reel)) {
      return Array.from({ length: 4 }, (_, row) => SPECIAL_FILLERS[(reel + row) % SPECIAL_FILLERS.length]);
    }
    if (useSpecialFillers) {
      return Array.from({ length: 4 }, (_, row) => SPECIAL_FILLERS[(reel + row) % SPECIAL_FILLERS.length]);
    }
    const group = [...FILLER_GROUPS[nonWildIndex % FILLER_GROUPS.length]];
    nonWildIndex += 1;
    shuffle(group, random);
    return group;
  });
}

export function buildBoardForTemplate(
  template: WaysTemplate,
  activeWildReels: number[],
  random: () => number,
): SymbolKey[][] {
  const activeWilds = new Set(activeWildReels);
  const board = createNeutralBoard(random, activeWildReels);

  for (let reel = 0; reel < board.length; reel += 1) {
    if (activeWilds.has(reel)) continue;
    board[reel] = board[reel].map((symbol, row) =>
      symbol === template.symbol
        ? SPECIAL_FILLERS[(reel + row) % SPECIAL_FILLERS.length]
        : symbol,
    );
  }

  for (let reel = 0; reel < template.matchLength; reel += 1) {
    if (activeWilds.has(reel)) continue;
    const rows = [0, 1, 2, 3];
    shuffle(rows, random);
    for (let index = 0; index < template.counts[reel]; index += 1) {
      board[reel][rows[index]] = template.symbol;
    }
  }

  const evaluation = evaluateWays(board, template.appliedMultiplier, activeWildReels);
  if (
    evaluation.wins.length !== 1 ||
    evaluation.wins[0].symbol !== template.symbol ||
    toCents(evaluation.totalMultiplier) !== template.totalCents
  ) {
    throw new Error(
      `Unable to construct exact ${template.totalMultiplier}x ${template.symbol} ways board`,
    );
  }
  return board;
}

export function findWaysTemplate(
  totalMultiplier: number,
  appliedMultiplier: number,
  activeWildReels: number[] = [],
  random: () => number = Math.random,
): WaysTemplate | null {
  const templates = templateMap(
    appliedMultiplier,
    activeWildReels,
    toCents(totalMultiplier),
  ).get(toCents(totalMultiplier));
  if (!templates?.length) return null;
  return templates[Math.floor(random() * templates.length)];
}

export function planWaysWins(
  totalMultiplier: number,
  frames: WaysFrameSpec[],
  random: () => number,
): PlannedWaysWin[] {
  const targetCents = toCents(totalMultiplier);
  if (targetCents <= 0) return [];
  const maps = frames.map((frame) =>
    templateMap(frame.multiplier, frame.activeWildReels, targetCents),
  );
  const preferredWins = frames.length <= 1
    ? 1
    : Math.min(5, Math.max(3, Math.round(frames.length * 0.42)));

  const winCounts = [
    preferredWins,
    preferredWins - 1,
    preferredWins + 1,
    2,
    1,
  ].filter((count, index, values) =>
    count > 0 && count <= frames.length && values.indexOf(count) === index,
  );

  for (const winCount of winCounts) {
    const memo = new Set<string>();
    const plan = searchPlan(0, targetCents, winCount, maps, random, memo);
    if (plan) return plan;
  }
  return [];
}

function searchPlan(
  frameIndex: number,
  remainingCents: number,
  winsLeft: number,
  maps: Array<Map<number, WaysTemplate[]>>,
  random: () => number,
  memo: Set<string>,
): PlannedWaysWin[] | null {
  if (winsLeft === 0) return remainingCents === 0 ? [] : null;
  if (frameIndex >= maps.length || maps.length - frameIndex < winsLeft || remainingCents <= 0) {
    return null;
  }

  const key = `${frameIndex}:${remainingCents}:${winsLeft}`;
  if (memo.has(key)) return null;
  memo.add(key);

  const ideal = remainingCents / winsLeft;
  const candidates = [...maps[frameIndex].entries()]
    .filter(([amount]) => amount <= remainingCents)
    .sort(([left], [right]) =>
      Math.abs(left - ideal) - Math.abs(right - ideal) || left - right,
    )
    .slice(0, 44);

  for (const [amount, templates] of candidates) {
    const tail = searchPlan(
      frameIndex + 1,
      remainingCents - amount,
      winsLeft - 1,
      maps,
      random,
      memo,
    );
    if (!tail) continue;
    const template = templates[Math.floor(random() * templates.length)];
    return [{ frameIndex, template }, ...tail];
  }

  return searchPlan(frameIndex + 1, remainingCents, winsLeft, maps, random, memo);
}

function templateMap(
  appliedMultiplier: number,
  activeWildReels: number[],
  maximumCents: number,
): Map<number, WaysTemplate[]> {
  const activeWilds = new Set(activeWildReels);
  const result = new Map<number, WaysTemplate[]>();
  if ([0, 1, 2].every((reel) => activeWilds.has(reel))) return result;

  for (const symbolKey of PAYING_SYMBOLS) {
    const pays = SYMBOL_BY_KEY[symbolKey].pays;
    if (!pays) continue;
    for (let matchLength = 3; matchLength <= 5; matchLength += 1) {
      if (matchLength < 5 && activeWilds.has(matchLength)) continue;
      const counts = enumerateCounts(matchLength, activeWilds);
      for (const countSet of counts) {
        const ways = countSet.reduce((product, count) => product * count, 1);
        const basePayMultiplier = pays[matchLength - 1] ?? 0;
        const totalMultiplier = roundMultiplier(basePayMultiplier * ways * appliedMultiplier);
        const totalCents = toCents(totalMultiplier);
        if (totalCents <= 0 || totalCents > maximumCents) continue;
        const templates = result.get(totalCents) ?? [];
        if (templates.length < 10) {
          templates.push({
            symbol: symbolKey,
            matchLength,
            counts: countSet,
            ways,
            basePayMultiplier,
            appliedMultiplier,
            totalMultiplier,
            totalCents,
          });
          result.set(totalCents, templates);
        }
      }
    }
  }
  return result;
}

function enumerateCounts(matchLength: number, activeWilds: Set<number>): number[][] {
  const result: number[][] = [];
  const visit = (reel: number, counts: number[]) => {
    if (reel === matchLength) {
      result.push([...counts]);
      return;
    }
    if (activeWilds.has(reel)) {
      counts.push(4);
      visit(reel + 1, counts);
      counts.pop();
      return;
    }
    for (let count = 1; count <= 4; count += 1) {
      counts.push(count);
      visit(reel + 1, counts);
      counts.pop();
    }
  };
  visit(0, []);
  return result;
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
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

function toCents(value: number): number {
  return Math.round(value * 100);
}

function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}
