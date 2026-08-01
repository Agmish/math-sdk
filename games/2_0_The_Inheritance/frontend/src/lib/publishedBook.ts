import { EVENT_PAYOUT_SCALE, getGameMode, type FeatureKind, type GameModeId } from './constants';
import type { BookEvent, Position, PublishedEvent, SpinBook } from './books';
import type { OutcomeBand, OutcomeKind } from './mathProfile';
import type { SymbolKey } from './symbols';

type PublishedBookInput = {
  id?: string | number;
  payoutMultiplier?: number;
  events?: unknown[];
  criteria?: string;
  mode?: string;
  resultMeta?: Record<string, unknown>;
};

const SYMBOL_MAP: Record<string, SymbolKey> = {
  CROWN: 'HEIRESS',
  PORTRAIT: 'EXECUTOR',
  RING: 'RING',
  WATCH: 'WATCH',
  LETTER: 'LILIES',
  WILD: 'WILD',
  TESTAMENT: 'TESTAMENT',
  KEY: 'VAULT',
  MIRROR: 'MIRROR',
  SCATTER: 'CODICIL',
};

export function normalizePublishedBook(mode: GameModeId, value: unknown): SpinBook | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as PublishedBookInput;
  if (!Array.isArray(source.events) || !Number.isFinite(source.payoutMultiplier)) return null;

  const publishedEvents = source.events.map(normalizeEvent).filter((event): event is PublishedEvent => Boolean(event));
  if (publishedEvents.length === 0) return null;
  if (!publishedEvents.every((event, index) => event.index === index)) return null;

  const resultMeta = source.resultMeta ?? {};
  const configuredMode = getGameMode(mode);
  const costMultiplier = numeric(resultMeta.costMultiplier) ?? configuredMode.costMultiplier;
  if (Math.abs(costMultiplier - configuredMode.costMultiplier) > 1e-8) return null;

  const payoutMultiplier = Number(source.payoutMultiplier) / EVENT_PAYOUT_SCALE;
  const feature = normalizeFeature(String(resultMeta.feature ?? 'regular'), mode);
  const outcome = outcomeFromEvents(
    String(source.criteria ?? `book-${String(source.id ?? 'unknown')}`),
    feature,
    payoutMultiplier,
    publishedEvents,
  );
  const revealEvents = publishedEvents.filter((event) => event.type === 'reveal' || event.type === 'expandedBoard');
  const board = [...revealEvents].reverse().map((event) => event.board).find(isSymbolBoard) ?? neutralBoard();
  const winEvent = [...publishedEvents].reverse().find((event) => event.type === 'winInfo');
  const winPositions = Array.isArray(winEvent?.positions) ? winEvent.positions.filter(isPosition) : [];
  const prizeValues: Record<string, number> = {};
  for (const event of publishedEvents) {
    if (event.type !== 'lockPrize' || !isPosition(event.position)) continue;
    prizeValues[`${event.position.reel}:${event.position.row}`] = numeric(event.value) ?? 0;
  }

  return {
    id: String(source.id ?? `${mode}-${source.criteria ?? 'book'}`),
    mode,
    costMultiplier,
    payoutMultiplier,
    outcome,
    board,
    winPositions,
    prizeValues,
    events: publishedEvents as BookEvent[],
    publishedEvents,
    published: true,
  };
}

function normalizeEvent(value: unknown): PublishedEvent | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (!Number.isInteger(source.index) || typeof source.type !== 'string') return null;
  const event: PublishedEvent = { ...source, index: Number(source.index), type: source.type };
  if (Array.isArray(source.board)) event.board = normalizeBoard(source.board);
  if (typeof source.symbol === 'string') event.symbol = SYMBOL_MAP[source.symbol] ?? source.symbol;
  const payoutAmountEvent = ['setWin', 'setTotalWin', 'finalWin', 'featureAward'].includes(source.type);
  for (const key of ['amount', 'totalWin', 'win', 'value', 'collected', 'basePay']) {
    if (typeof source[key] !== 'number') continue;
    event[key] = key === 'amount' && !payoutAmountEvent
      ? Number(source[key])
      : Number(source[key]) / EVENT_PAYOUT_SCALE;
  }
  if (Array.isArray(source.wins)) {
    event.wins = source.wins.map((win) => {
      if (!win || typeof win !== 'object') return win;
      const record = { ...(win as Record<string, unknown>) };
      if (typeof record.symbol === 'string') record.symbol = SYMBOL_MAP[record.symbol] ?? record.symbol;
      for (const key of ['win', 'basePay']) {
        if (typeof record[key] === 'number') record[key] = Number(record[key]) / EVENT_PAYOUT_SCALE;
      }
      return record;
    });
  }
  return event;
}

function normalizeBoard(value: unknown[]): SymbolKey[][] {
  return value.map((reel) => {
    if (!Array.isArray(reel)) return [];
    return reel.map((symbol) => {
      const name = symbol && typeof symbol === 'object'
        ? String((symbol as Record<string, unknown>).name ?? '')
        : String(symbol ?? '');
      return SYMBOL_MAP[name] ?? 'LILIES';
    });
  });
}

function normalizeFeature(value: string, mode: GameModeId): FeatureKind {
  switch (value) {
    case 'sealed_will': return 'will';
    case 'vault_echoes': return 'vault';
    case 'midnight_seance': return 'seance';
    case 'final_codicil': return 'codicil';
    default: return mode === 'HEIRLOOM_ANTE' ? 'ante' : 'base';
  }
}

function outcomeFromEvents(
  id: string,
  feature: FeatureKind,
  payoutMultiplier: number,
  events: PublishedEvent[],
): OutcomeBand {
  const freeSpinTrigger = events.find((event) => event.type === 'freeSpinTrigger');
  const updateFreeSpins = events.filter((event) => event.type === 'updateFreeSpin');
  const spins = Math.max(
    numeric(freeSpinTrigger?.totalFs) ?? 0,
    ...updateFreeSpins.map((event) => numeric(event.total) ?? 0),
  );
  const vaultStates = events.filter((event) => event.type === 'vaultState');
  const possession = [...events].reverse().find((event) => event.type === 'seancePossess');
  const multiplier = Math.max(
    1,
    ...events
      .filter((event) => event.type === 'expandWild' || event.type === 'seancePossess')
      .map((event) => numeric(event.multiplier) ?? 1),
  );
  return {
    id,
    label: id.split('_').join(' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
    kind: resultKind(id, payoutMultiplier),
    feature,
    weight: 0,
    payoutMultiplier,
    meter: Math.min(15, Math.ceil(payoutMultiplier / 25)),
    freeSpins: spins || undefined,
    expandingWild: events.some((event) => event.type === 'expandWild') || undefined,
    multiplier,
    vaultLocks: Math.max(0, ...vaultStates.map((event) => numeric(event.locks) ?? 0)) || undefined,
    respins: numeric(vaultStates[vaultStates.length - 1]?.respins) ?? undefined,
    possessedReels: Array.isArray(possession?.reels)
      ? possession.reels.filter((item): item is number => typeof item === 'number')
      : undefined,
  };
}

function resultKind(id: string, payout: number): OutcomeKind {
  if (payout === 0) return 'loss';
  if (id.includes('max')) return 'max';
  if (payout >= 500) return 'epic';
  if (payout >= 100) return 'big';
  return 'normal';
}

function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const position = value as Record<string, unknown>;
  return Number.isInteger(position.reel) && Number.isInteger(position.row);
}

function isSymbolBoard(value: unknown): value is SymbolKey[][] {
  return Array.isArray(value)
    && value.length === 5
    && value.every((reel) => Array.isArray(reel) && reel.length === 4);
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function neutralBoard(): SymbolKey[][] {
  return [
    ['HEIRESS', 'HEIRESS', 'HEIRESS', 'HEIRESS'],
    ['RING', 'RING', 'RING', 'RING'],
    ['WATCH', 'WATCH', 'WATCH', 'WATCH'],
    ['EXECUTOR', 'EXECUTOR', 'EXECUTOR', 'EXECUTOR'],
    ['LILIES', 'LILIES', 'LILIES', 'LILIES'],
  ];
}
