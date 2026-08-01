import type { Position, PublishedEvent, SpinBook } from './books';
import { assetUrl } from './assets';
import type { FeatureKind } from './constants';
import { hashSeed, mulberry32 } from './random';
import { SYMBOL_BY_KEY, type SymbolKey } from './symbols';
import {
  buildBoardForTemplate,
  createNeutralBoard,
  evaluateWays,
  findWaysTemplate,
  planWaysWins,
  type EvaluatedWaysWin,
  type PlannedWaysWin,
} from './waysMath';

export type ReelMotionPhase = 'idle' | 'spinning' | 'landed' | 'locking' | 'expanding' | 'win';

export type WildExpansion = {
  reel: number;
  originRow: number;
  multiplier: number;
  kind: 'wax' | 'spirit';
};

export type WinBreakdown = {
  kind: 'ways' | 'collection';
  icon: SymbolKey;
  title: string;
  detail: string;
  calculation: string;
  ways: number | null;
  matchLength: number | null;
};

export type PresentationFrame = {
  id: string;
  phase: FeatureKind;
  board: SymbolKey[][];
  winPositions: Position[];
  prizeValues: Record<string, number>;
  activeWildReels: number[];
  expandingWild: WildExpansion | null;
  spinNumber: number;
  spinsTotal: number;
  counterLabel: string;
  counterValue: string;
  stageLabel: string;
  mechanicLabel: string;
  featureGoal: string;
  multiplier: number;
  visitedReels: number[];
  lockedValues: number;
  respinsLeft: number | null;
  spinWinMultiplier: number;
  cumulativeWinMultiplier: number;
  winBreakdown: WinBreakdown | null;
};

export type PresentationSequence = {
  feature: FeatureKind;
  introKicker: string;
  introTitle: string;
  introDetail: string;
  introArt: string | null;
  introAction: string;
  frames: PresentationFrame[];
  totalPayoutMultiplier: number;
  summaryTitle: string;
  summaryDetail: string;
};

const REGULAR_SYMBOLS: SymbolKey[] = [
  'HEIRESS',
  'EXECUTOR',
  'STAG',
  'RAVEN_KEY',
  'RING',
  'WATCH',
  'LILIES',
  'CANDELABRUM',
  'WATCH',
  'LILIES',
  'CANDELABRUM',
];

const FEATURE_ART: Partial<Record<FeatureKind, string>> = {
  will: assetUrl('features/sealed-will.webp'),
  vault: assetUrl('features/vault-echoes.webp'),
  seance: assetUrl('features/midnight-seance.webp'),
  codicil: assetUrl('features/final-codicil.webp'),
};

export function buildPresentation(book: SpinBook): PresentationSequence {
  if (book.publishedEvents?.length) {
    return buildPublishedPresentation(book, book.publishedEvents);
  }
  const random = mulberry32(hashSeed(`presentation:${book.id}:${book.mode}`));

  switch (book.outcome.feature) {
    case 'will':
      return buildWillSequence(book, random);
    case 'vault':
      return buildVaultSequence(book, random);
    case 'seance':
      return buildSeanceSequence(book, random);
    case 'codicil':
      return buildCodicilSequence(book, random);
    default:
      return buildBaseSequence(book, random);
  }
}

function buildPublishedPresentation(book: SpinBook, events: PublishedEvent[]): PresentationSequence {
  const groups: Array<{ reveal: PublishedEvent; events: PublishedEvent[] }> = [];
  let current: { reveal: PublishedEvent; events: PublishedEvent[] } | null = null;
  for (const event of events) {
    if (event.type === 'reveal') {
      current = { reveal: event, events: [] };
      groups.push(current);
    } else if (current) {
      current.events.push(event);
    }
  }

  const phaseCounts: Partial<Record<FeatureKind, number>> = {};
  const frames: PresentationFrame[] = groups.map((group, index) => {
    const stage = String(
      group.events.find((event) => typeof event.stage === 'string')?.stage
      ?? group.reveal.gameType
      ?? book.outcome.feature,
    );
    const phase = publishedPhase(stage, book.outcome.feature);
    phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
    const update = group.events.find((event) => event.type === 'updateFreeSpin');
    const vault = group.events.find((event) => event.type === 'vaultState');
    const expansion = group.events.find((event) => event.type === 'expandWild');
    const possession = group.events.find((event) => event.type === 'seancePossess');
    const retrigger = group.events.find((event) => event.type === 'retrigger');
    const featureTrigger = group.events.find((event) => event.type === 'featureTrigger');
    const winInfo = group.events.find((event) => event.type === 'winInfo');
    const setWin = group.events.find((event) => event.type === 'setWin');
    const setTotal = [...group.events].reverse().find((event) => event.type === 'setTotalWin');
    const award = group.events.find((event) => event.type === 'featureAward');
    const lockPrize = group.events.find((event) => event.type === 'lockPrize');
    const expandedBoard = group.events.find((event) => event.type === 'expandedBoard');
    const board = isPresentationBoard(expandedBoard?.board)
      ? expandedBoard.board
      : isPresentationBoard(group.reveal.board)
        ? group.reveal.board
        : book.board;
    const winPositions = Array.isArray(winInfo?.positions) ? winInfo.positions.filter(isPresentationPosition) : [];
    const prizeValues: Record<string, number> = {};
    if (lockPrize && isPresentationPosition(lockPrize.position)) {
      prizeValues[`${lockPrize.position.reel}:${lockPrize.position.row}`] = numericEvent(lockPrize.value);
    }
    if (award && Array.isArray(award.positions)) {
      for (const position of award.positions.filter(isPresentationPosition)) {
        prizeValues[`${position.reel}:${position.row}`] = numericEvent(award.amount);
      }
    }
    const activeWildReels = Array.isArray(possession?.reels)
      ? possession.reels.filter((item): item is number => typeof item === 'number')
      : expansion && typeof expansion.reel === 'number'
        ? [expansion.reel]
        : [];
    const spinNumber = update
      ? numericEvent(update.amount, 0) + 1
      : featureTrigger
        ? 0
        : phaseCounts[phase] ?? index + 1;
    const spinsTotal = numericEvent(update?.total, publishedPhaseTotal(phase));
    const cumulative = numericEvent(setTotal?.amount, 0);
    const spinWin = numericEvent(setWin?.amount, 0);
    const multiplier = numericEvent(possession?.multiplier, numericEvent(expansion?.multiplier, 1));
    return {
      id: `${book.id}-published-${index}`,
      phase,
      board,
      winPositions,
      prizeValues,
      activeWildReels,
      expandingWild: expansion && typeof expansion.reel === 'number'
        ? {
            reel: expansion.reel,
            originRow: numericEvent(expansion.originRow, 0),
            multiplier,
            kind: phase === 'seance' ? 'spirit' : 'wax',
          }
        : possession && activeWildReels.length
          ? {
              reel: activeWildReels[0],
              originRow: board[activeWildReels[0]]?.findIndex((symbol) => symbol === 'MIRROR') ?? 0,
              multiplier,
              kind: 'spirit',
            }
          : null,
      spinNumber,
      spinsTotal,
      counterLabel: featureTrigger ? 'FEATURE TRIGGER' : phase === 'vault' ? 'VAULT REVEALS' : phase === 'base' || phase === 'ante' ? 'WIN SYSTEM' : 'FREE SPINS',
      counterValue: featureTrigger
        ? '3 SYMBOLS'
        : phase === 'base' || phase === 'ante'
        ? '1,024 WAYS'
        : `${Math.min(spinNumber, spinsTotal)} / ${spinsTotal}`,
      stageLabel: publishedStageLabel(phase),
      mechanicLabel: retrigger
        ? `+${numericEvent(retrigger.addedSpins, 2)} FREE SPINS RETRIGGERED`
        : phase === 'vault'
          ? `${numericEvent(vault?.locks, 0)} VALUES LOCKED`
          : expansion
            ? `WAX SEAL EXPANDS · ${formatMultiplier(multiplier)}× POWER`
            : possession
              ? `REEL ${activeWildReels[0] + 1} POSSESSED · ${formatMultiplier(multiplier)}× POWER`
              : winInfo
                ? 'PUBLISHED RESULT VERIFIED'
                : 'CHAPTER TRIGGER REVEALED',
      featureGoal: publishedFeatureGoal(phase),
      multiplier,
      visitedReels: activeWildReels,
      lockedValues: numericEvent(vault?.locks, 0),
      respinsLeft: vault ? numericEvent(vault.respins, 0) : null,
      spinWinMultiplier: spinWin,
      cumulativeWinMultiplier: cumulative,
      winBreakdown: publishedWinBreakdown(winInfo, award ?? lockPrize),
    };
  });

  if (frames.length === 0) {
    throw new Error(`Published book ${book.id} contains no reveal event.`);
  }
  const feature = book.outcome.feature;
  return {
    feature,
    introKicker: feature === 'base' || feature === 'ante' ? '' : 'PUBLISHED BONUS RESULT',
    introTitle: publishedStageLabel(feature),
    introDetail: publishedIntroDetail(feature),
    introArt: FEATURE_ART[feature] ?? null,
    introAction: feature === 'base' || feature === 'ante' ? '' : 'Open the Chapter',
    frames,
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: book.payoutMultiplier > 0 ? 'The Estate Records the Result' : 'The House Keeps Its Secret',
    summaryDetail: `${frames.length} published reveal${frames.length === 1 ? '' : 's'} completed.`,
  };
}

function publishedPhase(value: string, fallback: FeatureKind): FeatureKind {
  if (value.includes('will')) return 'will';
  if (value.includes('vault') || value === 'respin') return 'vault';
  if (value.includes('seance')) return 'seance';
  if (value.includes('codicil')) return 'codicil';
  return fallback;
}

function publishedPhaseTotal(phase: FeatureKind): number {
  if (phase === 'will') return 8;
  if (phase === 'vault') return 6;
  if (phase === 'seance') return 10;
  if (phase === 'codicil') return 11;
  return 1;
}

function publishedStageLabel(phase: FeatureKind): string {
  switch (phase) {
    case 'will': return 'THE SEALED WILL';
    case 'vault': return 'VAULT OF ECHOES';
    case 'seance': return 'MIDNIGHT SÉANCE';
    case 'codicil': return 'THE FINAL CODICIL';
    case 'ante': return 'HEIRLOOM ANTE ACTIVE';
    default: return 'BLACKTHORN ESTATE';
  }
}

function publishedFeatureGoal(phase: FeatureKind): string {
  switch (phase) {
    case 'will': return 'WATCH THE SEAL EXPAND · READ THE VISIBLE AWARD · FOLLOW THE FREE-SPIN COUNTER';
    case 'vault': return 'LOCK EACH KEY · READ ITS VALUE · FOLLOW THE RUNNING COLLECTION';
    case 'seance': return 'WATCH THE MIRROR MOVE · READ THE SPIRIT AWARD · FOLLOW THE POWER';
    case 'codicil': return 'COMPLETE ALL THREE CHAPTERS OF THE PUBLISHED RESULT';
    default: return 'MATCH 3+ PICTURES ON ADJACENT REELS, STARTING AT REEL 1';
  }
}

function publishedIntroDetail(feature: FeatureKind): string {
  if (feature === 'will') return 'Eight free spins with an expanding Wax Seal reel and visible sealed awards.';
  if (feature === 'vault') return 'Six lock-and-respin reveals collect the values shown on the Vault Keys.';
  if (feature === 'seance') return 'Ten free spins move a possessed reel through the séance.';
  if (feature === 'codicil') return 'Five Will, three Vault and three Séance reveals form one continuous round.';
  return '';
}

function publishedWinBreakdown(
  winInfo: PublishedEvent | undefined,
  award: PublishedEvent | undefined,
): WinBreakdown | null {
  if (!winInfo) return null;
  const wins = Array.isArray(winInfo.wins) ? winInfo.wins : [];
  const first = wins[0] && typeof wins[0] === 'object' ? wins[0] as Record<string, unknown> : null;
  const icon = isPresentationSymbol(first?.symbol) ? first.symbol : isPresentationSymbol(award?.symbol) ? award.symbol : 'WILD';
  const total = numericEvent(winInfo.totalWin, 0);
  if (winInfo.evaluationSource === 'visibleWays' && first) {
    const ways = numericEvent(first.ways, 0);
    const kind = numericEvent(first.kind, 0);
    const basePay = numericEvent(first.basePay, 0);
    const multiplier = numericEvent(first.multiplier, 1);
    return {
      kind: 'ways',
      icon,
      title: `${SYMBOL_BY_KEY[icon].label} · ${kind} reels · ${ways} ${ways === 1 ? 'way' : 'ways'}`,
      detail: 'The highlighted pictures connect from reel one across adjacent reels.',
      calculation: `${formatMultiplier(basePay)}× picture × ${ways} ways × ${formatMultiplier(multiplier)} power = ${formatMultiplier(total)}×`,
      ways,
      matchLength: kind,
    };
  }
  return {
    kind: 'collection',
    icon,
    title: `${SYMBOL_BY_KEY[icon].label} award`,
    detail: 'The highlighted feature picture carries the exact value recorded in the published result.',
    calculation: `${formatMultiplier(total)}× added to the running total`,
    ways: null,
    matchLength: null,
  };
}

function isPresentationPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const position = value as Record<string, unknown>;
  return Number.isInteger(position.reel) && Number.isInteger(position.row);
}

function isPresentationBoard(value: unknown): value is SymbolKey[][] {
  return Array.isArray(value)
    && value.length === 5
    && value.every((reel) => Array.isArray(reel) && reel.length === 4);
}

function isPresentationSymbol(value: unknown): value is SymbolKey {
  return typeof value === 'string' && value in SYMBOL_BY_KEY;
}

function numericEvent(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildBaseSequence(book: SpinBook, random: () => number): PresentationSequence {
  const expandEvent = book.events.find((event) => event.type === 'expandWild');
  const activeWildReels = expandEvent ? [expandEvent.reel] : [];
  const appliedMultiplier = expandEvent?.multiplier ?? 1;
  const template = book.payoutMultiplier > 0
    ? findWaysTemplate(book.payoutMultiplier, appliedMultiplier, activeWildReels, random)
    : null;
  if (book.payoutMultiplier > 0 && !template) {
    throw new Error(
      `No visible paytable combination can produce ${book.payoutMultiplier}x for ${book.outcome.id}`,
    );
  }
  const board = template
    ? buildBoardForTemplate(template, activeWildReels, random)
    : createNeutralBoard(random, activeWildReels);
  const originRow = Math.abs(hashSeed(`${book.id}:row`)) % 4;

  if (expandEvent) {
    board[expandEvent.reel][originRow] = 'WILD';
  }
  const evaluation = evaluateWays(board, appliedMultiplier, activeWildReels);
  if (toCents(evaluation.totalMultiplier) !== toCents(book.payoutMultiplier)) {
    throw new Error(`Base reveal does not reconcile for ${book.outcome.id}`);
  }
  const baseWin = evaluation.wins[0] ?? null;

  const frame: PresentationFrame = {
    id: `${book.id}-base`,
    phase: book.outcome.feature,
    board,
    winPositions: evaluation.positions,
    prizeValues: {},
    activeWildReels,
    expandingWild: expandEvent
      ? {
          reel: expandEvent.reel,
          originRow,
          multiplier: expandEvent.multiplier,
          kind: 'wax',
        }
      : null,
    spinNumber: 1,
    spinsTotal: 1,
    counterLabel: 'WIN SYSTEM',
    counterValue: '1,024 WAYS',
    stageLabel: book.mode === 'HEIRLOOM_ANTE' ? 'HEIRLOOM ANTE ACTIVE' : 'BLACKTHORN ESTATE',
    mechanicLabel: expandEvent ? `WAX SEAL ×${expandEvent.multiplier}` : 'MATCH FROM REEL ONE',
    featureGoal: 'MATCH 3+ PICTURES ON ADJACENT REELS, STARTING AT REEL 1',
    multiplier: appliedMultiplier,
    visitedReels: [],
    lockedValues: 0,
    respinsLeft: null,
    spinWinMultiplier: book.payoutMultiplier,
    cumulativeWinMultiplier: book.payoutMultiplier,
    winBreakdown: baseWin ? describeEvaluatedWay(baseWin) : null,
  };

  return {
    feature: book.outcome.feature,
    introKicker: '',
    introTitle: '',
    introDetail: '',
    introArt: null,
    introAction: '',
    frames: [frame],
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: book.payoutMultiplier > 0 ? 'Inheritance Awarded' : 'The House Keeps Its Secret',
    summaryDetail: 'Base game round complete.',
  };
}

function buildWillSequence(book: SpinBook, random: () => number): PresentationSequence {
  const total = clamp(book.outcome.freeSpins ?? 8, 8, 20);
  const retriggerSpins = Math.max(0, total - 8);
  const retriggerIndex = retriggerSpins > 0 ? Math.min(total - 3, 6) : -1;
  const clauseId = book.outcome.clause ?? 'widows-share';
  const clause = clauseName(clauseId);
  const baseExpansionCount = book.outcome.kind === 'loss' ? 1 : clamp(Math.ceil((book.outcome.multiplier ?? 2) / 8), 1, 4);
  const expansionCount = clauseId === 'outsiders-clause'
    ? Math.max(3, baseExpansionCount)
    : clauseId === 'secret-heir'
      ? Math.max(2, baseExpansionCount)
      : baseExpansionCount;
  const expansionFrames = scheduledIndexes(total, expansionCount);
  const stickyWilds: number[] = [];
  const frames: PresentationFrame[] = [];
  let featureMultiplier = 1;

  for (let index = 0; index < total; index += 1) {
    const board = randomBoard(random);
    if (index === retriggerIndex) {
      board[0][0] = 'TESTAMENT';
      board[2][1] = 'TESTAMENT';
      board[4][2] = 'TESTAMENT';
    }
    let expandingWild: WildExpansion | null = null;
    let spinWildReels: number[] = clauseId === 'widows-share'
      ? [...stickyWilds]
      : clauseId === 'secret-heir'
        ? [index % 5]
        : [];
    let transformedLabel = '';

    if (expansionFrames.includes(index) && (clauseId !== 'widows-share' || stickyWilds.length < 5)) {
      const reel = clauseId === 'widows-share'
        ? nextUnusedReel(stickyWilds, random)
        : Math.floor(random() * 5);
      const originRow = Math.floor(random() * 4);
      board[reel][originRow] = 'WILD';
      if (clauseId === 'widows-share') {
        stickyWilds.push(reel);
        spinWildReels = [...stickyWilds];
      } else {
        spinWildReels = [reel];
      }
      if (clauseId === 'outsiders-clause') {
        featureMultiplier += Math.max(1, Math.round((book.outcome.multiplier ?? 2) / Math.max(2, expansionCount)));
      } else if (clauseId === 'widows-share') {
        featureMultiplier = Math.max(featureMultiplier, 1 + stickyWilds.length);
      }
      expandingWild = {
        reel,
        originRow,
        multiplier: featureMultiplier,
        kind: 'wax',
      };
    }

    if (clauseId === 'secret-heir') {
      const heirReel = spinWildReels[0] ?? index % 5;
      const originRow = (index + Math.floor(random() * 4)) % 4;
      board[heirReel][originRow] = 'WILD';
      featureMultiplier = Math.max(1, book.outcome.multiplier ?? 1);
      expandingWild = {
        reel: heirReel,
        originRow,
        multiplier: featureMultiplier,
        kind: 'wax',
      };
      transformedLabel = `REEL ${heirReel + 1} NAMED THE SECRET HEIR`;
    }

    frames.push({
      id: `${book.id}-will-${index}`,
      phase: 'will',
      board,
      winPositions: [],
      prizeValues: {},
      activeWildReels: spinWildReels,
      expandingWild,
      spinNumber: index + 1,
      spinsTotal: index < retriggerIndex ? 8 : total,
      counterLabel: 'FREE SPINS',
      counterValue: `${Math.max(0, (index < retriggerIndex ? 8 : total) - index)} / ${index < retriggerIndex ? 8 : total}`,
      stageLabel: clause,
      mechanicLabel: index === retriggerIndex
        ? `+${retriggerSpins} FREE SPINS RETRIGGERED`
        : clauseId === 'secret-heir'
          ? transformedLabel
          : clauseId === 'outsiders-clause'
            ? `SEAL MULTIPLIER RISES TO ×${featureMultiplier}`
            : stickyWilds.length
              ? `${stickyWilds.length} STICKY WILD REEL${stickyWilds.length === 1 ? '' : 'S'}`
              : 'LAND A WAX SEAL TO EXPAND',
      featureGoal: willClauseGoal(clauseId),
      multiplier: featureMultiplier,
      visitedReels: [],
      lockedValues: 0,
      respinsLeft: null,
      spinWinMultiplier: 0,
      cumulativeWinMultiplier: 0,
      winBreakdown: null,
    });
  }
  applyWaysPayout(frames, book.payoutMultiplier, random);
  if (retriggerIndex >= 0) placeRetriggerScatters(frames[retriggerIndex], 'TESTAMENT');

  return {
    feature: 'will',
    introKicker: 'BONUS TRIGGERED',
    introTitle: `${Math.min(8, total)} Free Spins`,
    introDetail: willClauseDetail(clauseId),
    introArt: FEATURE_ART.will ?? null,
    introAction: 'Open the Will',
    frames,
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: 'The Will Is Settled',
    summaryDetail: `${clause} resolved across ${total} free spins.`,
  };
}

function buildVaultSequence(book: SpinBook, random: () => number): PresentationSequence {
  const targetLocks = clamp(book.outcome.vaultLocks ?? 6, 6, 20);
  const activeFrames = clamp(Math.ceil((targetLocks - 6) / 2), 1, 5);
  const total = activeFrames + 3;
  const positions = shuffledPositions(random);
  const vaultAwards = distributeVaultAward(book.payoutMultiplier, targetLocks, random);
  const values = new Map<string, number>();
  let locked = 6;
  let respinsLeft = 3;
  let cumulative = 0;
  const frames: PresentationFrame[] = [];

  for (let index = 0; index < total; index += 1) {
    const previousLocked = locked;
    if (index < activeFrames) {
      const remaining = targetLocks - locked;
      const activeRemaining = activeFrames - index;
      locked += Math.ceil(remaining / activeRemaining);
      respinsLeft = 3;
    } else {
      respinsLeft = Math.max(0, respinsLeft - 1);
    }

    const board = randomBoard(random);
    const prizeValues: Record<string, number> = {};
    for (let positionIndex = 0; positionIndex < locked; positionIndex += 1) {
      const position = positions[positionIndex];
      const key = `${position.reel}:${position.row}`;
      board[position.reel][position.row] = 'VAULT';
      if (!values.has(key)) values.set(key, vaultAwards[positionIndex] ?? 0);
      prizeValues[key] = values.get(key) ?? 1;
    }
    const isCollection = index === total - 1;
    const spinWin = isCollection ? book.payoutMultiplier : 0;
    cumulative = roundMultiplier(cumulative + spinWin);
    const newPositions = positions.slice(previousLocked, locked);
    const highlightedPositions = isCollection ? positions.slice(0, locked) : newPositions;
    frames.push({
      id: `${book.id}-vault-${index}`,
      phase: 'vault',
      board,
      winPositions: highlightedPositions,
      prizeValues,
      activeWildReels: [],
      expandingWild: null,
      spinNumber: index + 1,
      spinsTotal: total,
      counterLabel: 'RESPINS',
      counterValue: `${respinsLeft}`,
      stageLabel: 'VAULT OF ECHOES',
      mechanicLabel: isCollection
        ? `COLLECTING ${locked} LOCKED VALUES`
        : newPositions.length > 0
          ? `+${newPositions.length} NEW VALUE${newPositions.length === 1 ? '' : 'S'} · RESPINS RESET`
          : `NO NEW VALUE · ${respinsLeft} RESPIN${respinsLeft === 1 ? '' : 'S'} LEFT`,
      featureGoal: 'LOCK A NEW VALUE → RESET TO 3 RESPINS → COLLECT EVERYTHING',
      multiplier: book.outcome.multiplier ?? 1,
      visitedReels: [],
      lockedValues: locked,
      respinsLeft,
      spinWinMultiplier: spinWin,
      cumulativeWinMultiplier: cumulative,
      winBreakdown: isCollection && spinWin > 0
        ? {
            kind: 'collection',
            icon: 'VAULT',
            title: `${locked} locked values collected`,
            detail: 'Every highlighted estate value is added once when the respin counter reaches zero.',
            calculation: `VAULT TOTAL = ${formatMultiplier(spinWin)}×`,
            ways: null,
            matchLength: null,
          }
        : null,
    });
  }

  return {
    feature: 'vault',
    introKicker: 'HOLD & RESPIN',
    introTitle: '3 Respins',
    introDetail: 'Six estate values begin locked. Every new value resets the respin counter to three.',
    introArt: FEATURE_ART.vault ?? null,
    introAction: 'Open the Vault',
    frames,
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: 'The Vault Is Counted',
    summaryDetail: `${targetLocks} estate values were locked before the final respin.`,
  };
}

function buildSeanceSequence(book: SpinBook, random: () => number): PresentationSequence {
  const total = clamp(book.outcome.freeSpins ?? 10, 10, 16);
  const retriggerSpins = Math.max(0, total - 10);
  const retriggerIndex = retriggerSpins > 0 ? Math.min(total - 3, 5) : -1;
  const frames: PresentationFrame[] = [];
  let multiplier = 1;
  let previousReel = -1;
  const visitedReels = new Set<number>();
  const possessionStep = Math.max(1, Math.round(((book.outcome.multiplier ?? 5) - 1) / 4));

  for (let index = 0; index < total; index += 1) {
    let reel = Math.floor(random() * 5);
    if (reel === previousReel) reel = (reel + 1 + Math.floor(random() * 3)) % 5;
    previousReel = reel;
    const originRow = Math.floor(random() * 4);
    const board = randomBoard(random);
    board[reel][originRow] = 'MIRROR';
    if (index === retriggerIndex) {
      board[0][0] = 'MIRROR';
      board[2][1] = 'MIRROR';
      board[4][2] = 'MIRROR';
    }
    const newPossession = !visitedReels.has(reel);
    visitedReels.add(reel);
    if (newPossession && visitedReels.size > 1) multiplier += possessionStep;
    frames.push({
      id: `${book.id}-seance-${index}`,
      phase: 'seance',
      board,
      winPositions: [],
      prizeValues: {},
      activeWildReels: [reel],
      expandingWild: {
        reel,
        originRow,
        multiplier,
        kind: 'spirit',
      },
      spinNumber: index + 1,
      spinsTotal: index < retriggerIndex ? 10 : total,
      counterLabel: 'FREE SPINS',
      counterValue: `${Math.max(0, (index < retriggerIndex ? 10 : total) - index)} / ${index < retriggerIndex ? 10 : total}`,
      stageLabel: 'MIDNIGHT SÉANCE',
      mechanicLabel: index === retriggerIndex
        ? `+${retriggerSpins} FREE SPINS RETRIGGERED`
        : newPossession
          ? `NEW REEL POSSESSED · POWER RISES TO ×${multiplier}`
          : `SPIRIT RETURNS TO REEL ${reel + 1}`,
      featureGoal: 'FOLLOW THE MIRROR → FULL REEL WILD → NEW REELS RAISE POWER',
      multiplier,
      visitedReels: [...visitedReels],
      lockedValues: 0,
      respinsLeft: null,
      spinWinMultiplier: 0,
      cumulativeWinMultiplier: 0,
      winBreakdown: null,
    });
  }
  applyWaysPayout(frames, book.payoutMultiplier, random);
  if (retriggerIndex >= 0) placeRetriggerScatters(frames[retriggerIndex], 'MIRROR');

  return {
    feature: 'seance',
    introKicker: 'BONUS TRIGGERED',
    introTitle: `${Math.min(10, total)} Free Spins`,
    introDetail: 'Before every free spin the Mirror roams to a new reel, possesses it, and turns the complete reel Wild.',
    introArt: FEATURE_ART.seance ?? null,
    introAction: 'Begin the Séance',
    frames,
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: 'The Spirits Fall Silent',
    summaryDetail: `${total} free spins completed with roaming possessed reels.`,
  };
}

function buildCodicilSequence(book: SpinBook, random: () => number): PresentationSequence {
  const total = 11;
  const frames: PresentationFrame[] = [];
  const stickyWilds: number[] = [];
  const vaultPositions = shuffledPositions(random);
  const vaultValues = new Map<string, number>();
  let locked = 6;
  let multiplier = 1;
  const visitedReels = new Set<number>();

  for (let index = 0; index < total; index += 1) {
    let frame: PresentationFrame;

    if (index < 5) {
      const board = randomBoard(random);
      let expandingWild: WildExpansion | null = null;
      if (index === 1 || index === 3) {
        const reel = index === 1 ? 3 : 4;
        const originRow = Math.floor(random() * 4);
        stickyWilds.push(reel);
        multiplier += Math.max(2, Math.round((book.outcome.multiplier ?? 5) / 10));
        board[reel][originRow] = 'WILD';
        expandingWild = { reel, originRow, multiplier, kind: 'wax' };
      }
      frame = {
        id: `${book.id}-codicil-will-${index}`,
        phase: 'will',
        board,
        winPositions: [],
        prizeValues: {},
        activeWildReels: [...stickyWilds],
        expandingWild,
        spinNumber: index + 1,
        spinsTotal: 5,
        counterLabel: 'STAGE I',
        counterValue: `${index + 1} / 5`,
        stageLabel: 'THE SEALED WILL',
        mechanicLabel: `${stickyWilds.length} INHERITED WILD REEL${stickyWilds.length === 1 ? '' : 'S'}`,
        featureGoal: 'STAGE I · BUILD STICKY WILD REELS FOR THE LATER CHAPTERS',
        multiplier,
        visitedReels: [],
        lockedValues: 0,
        respinsLeft: null,
        spinWinMultiplier: 0,
        cumulativeWinMultiplier: 0,
        winBreakdown: null,
      };
    } else if (index < 8) {
      const vaultTarget = clamp(book.outcome.vaultLocks ?? 12, 6, 20);
      const vaultStage = index - 5;
      const stagesRemaining = 3 - vaultStage;
      locked = Math.min(
        vaultTarget,
        locked + Math.ceil(Math.max(0, vaultTarget - locked) / stagesRemaining),
      );
      const board = randomBoard(random);
      const prizeValues: Record<string, number> = {};
      for (let positionIndex = 0; positionIndex < locked; positionIndex += 1) {
        const position = vaultPositions[positionIndex];
        const key = `${position.reel}:${position.row}`;
        board[position.reel][position.row] = 'VAULT';
        if (!vaultValues.has(key)) vaultValues.set(key, prizeValue(random, book.outcome.multiplier ?? 1));
        prizeValues[key] = vaultValues.get(key) ?? 1;
      }
      frame = {
        id: `${book.id}-codicil-vault-${index}`,
        phase: 'vault',
        board,
        winPositions: vaultPositions.slice(Math.max(0, locked - 2), locked),
        prizeValues,
        activeWildReels: [],
        expandingWild: null,
        spinNumber: index - 4,
        spinsTotal: 3,
        counterLabel: 'STAGE II',
        counterValue: `${index - 4} / 3`,
        stageLabel: 'VAULT OF ECHOES',
        mechanicLabel: `${locked} VALUES LOCKED`,
        featureGoal: 'STAGE II · LOCK ESTATE VALUES WHILE WILD REELS STAY INHERITED',
        multiplier,
        visitedReels: [],
        lockedValues: locked,
        respinsLeft: 8 - index,
        spinWinMultiplier: 0,
        cumulativeWinMultiplier: 0,
        winBreakdown: null,
      };
    } else {
      const board = randomBoard(random);
      const roamingReel = (index + Math.floor(random() * 4)) % 5;
      const inherited = [...new Set([...stickyWilds, roamingReel])];
      const originRow = Math.floor(random() * 4);
      board[roamingReel][originRow] = 'MIRROR';
      const newPossession = !visitedReels.has(roamingReel);
      visitedReels.add(roamingReel);
      if (newPossession) multiplier += 1;
      frame = {
        id: `${book.id}-codicil-seance-${index}`,
        phase: 'seance',
        board,
        winPositions: [],
        prizeValues: {},
        activeWildReels: inherited,
        expandingWild: { reel: roamingReel, originRow, multiplier, kind: 'spirit' },
        spinNumber: index - 7,
        spinsTotal: 3,
        counterLabel: 'STAGE III',
        counterValue: `${index - 7} / 3`,
        stageLabel: 'MIDNIGHT SÉANCE',
        mechanicLabel: `${inherited.length} REELS POSSESSED`,
        featureGoal: 'STAGE III · THE MIRROR USES EVERY WILD REEL BUILT IN STAGE I',
        multiplier,
        visitedReels: [...visitedReels],
        lockedValues: locked,
        respinsLeft: null,
        spinWinMultiplier: 0,
        cumulativeWinMultiplier: 0,
        winBreakdown: null,
      };
    }

    frames.push(frame);
  }
  applyCodicilPayout(frames, book.payoutMultiplier, random);

  return {
    feature: 'codicil',
    introKicker: 'PREMIUM FEATURE',
    introTitle: 'The Final Codicil',
    introDetail: 'One continuous round: five Will spins, three Vault respins, then three Séance reveals using the inherited Wild reels.',
    introArt: FEATURE_ART.codicil ?? null,
    introAction: 'Open the Codicil',
    frames,
    totalPayoutMultiplier: book.payoutMultiplier,
    summaryTitle: 'The Estate Is Settled',
    summaryDetail: 'All three chapters of the Final Codicil are complete.',
  };
}

function randomBoard(random: () => number): SymbolKey[][] {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => REGULAR_SYMBOLS[Math.floor(random() * REGULAR_SYMBOLS.length)]),
  );
}

function applyWaysPayout(
  frames: PresentationFrame[],
  totalMultiplier: number,
  random: () => number,
): void {
  const plan = planWaysWins(
    totalMultiplier,
    frames.map((frame) => ({
      multiplier: frame.multiplier,
      activeWildReels: frame.activeWildReels,
    })),
    random,
  );
  if (totalMultiplier > 0 && plan.length === 0) {
    const frame = frames[frames.length - 1];
    if (!frame) throw new Error('Feature presentation contains no frames.');
    const icon: SymbolKey = frame.phase === 'seance'
      ? 'MIRROR'
      : frame.phase === 'codicil'
        ? 'CODICIL'
        : 'WILD';
    const position = { reel: 2, row: 1 };
    frame.board[position.reel][position.row] = icon;
    frame.winPositions = [position];
    frame.prizeValues = { '2:1': totalMultiplier };
    frame.spinWinMultiplier = totalMultiplier;
    frame.winBreakdown = {
      kind: 'collection',
      icon,
      title: `${SYMBOL_BY_KEY[icon].label} award`,
      detail: 'The feature picture carries the exact value recorded for this round.',
      calculation: `${formatMultiplier(totalMultiplier)}× added to the running total`,
      ways: null,
      matchLength: null,
    };
    updateCumulativeWins(frames);
    return;
  }
  applyWaysPlan(frames, plan, random);
  updateCumulativeWins(frames);
}

function placeRetriggerScatters(frame: PresentationFrame, symbol: 'TESTAMENT' | 'MIRROR'): void {
  let visible = frame.board.flat().filter((candidate) => candidate === symbol).length;
  const winning = new Set(frame.winPositions.map((position) => `${position.reel}:${position.row}`));
  for (const reel of [0, 2, 4, 1, 3]) {
    for (let row = 0; row < 4 && visible < 3; row += 1) {
      if (winning.has(`${reel}:${row}`) || frame.board[reel][row] === symbol) continue;
      frame.board[reel][row] = symbol;
      visible += 1;
    }
    if (visible >= 3) break;
  }
}

function applyCodicilPayout(
  frames: PresentationFrame[],
  totalMultiplier: number,
  random: () => number,
): void {
  const waysFrames = frames.filter((frame) => frame.phase !== 'vault');
  let vaultTarget = 0;
  let plan: PlannedWaysWin[] = [];

  if (totalMultiplier > 0) {
    const preferredWaysShares = [0.75, 0.7, 0.8, 0.65, 0.85, 0.6, 0.9, 1];
    for (const share of preferredWaysShares) {
      const candidateWaysTarget = Math.round(totalMultiplier * share * 10) / 10;
      const candidatePlan = planWaysWins(
        candidateWaysTarget,
        waysFrames.map((frame) => ({
          multiplier: frame.multiplier,
          activeWildReels: frame.activeWildReels,
        })),
        random,
      );
      if (candidatePlan.length === 0) continue;
      vaultTarget = roundMultiplier(totalMultiplier - candidateWaysTarget);
      plan = candidatePlan;
      break;
    }
    if (plan.length === 0) {
      throw new Error(`No exact Final Codicil plan exists for ${totalMultiplier}x`);
    }
  }

  applyWaysPlan(waysFrames, plan, random);
  applyCodicilVaultCollection(frames, vaultTarget, random);
  updateCumulativeWins(frames);
  const presentedTotal = roundMultiplier(
    frames.reduce((sum, frame) => sum + frame.spinWinMultiplier, 0),
  );
  if (toCents(presentedTotal) !== toCents(totalMultiplier)) {
    throw new Error(`Final Codicil presentation totals ${presentedTotal}x, expected ${totalMultiplier}x`);
  }
}

function applyWaysPlan(
  frames: PresentationFrame[],
  plan: PlannedWaysWin[],
  random: () => number,
): void {
  const plannedByFrame = new Map(plan.map((entry) => [entry.frameIndex, entry.template]));

  frames.forEach((frame, frameIndex) => {
    const template = plannedByFrame.get(frameIndex);
    frame.board = template
      ? buildBoardForTemplate(template, frame.activeWildReels, random)
      : createNeutralBoard(random, frame.activeWildReels);
    decorateWildOrigin(frame);
    const evaluation = evaluateWays(frame.board, frame.multiplier, frame.activeWildReels);
    const expectedTotal = template?.totalMultiplier ?? 0;
    if (toCents(evaluation.totalMultiplier) !== toCents(expectedTotal)) {
      throw new Error(
        `${frame.id} evaluates to ${evaluation.totalMultiplier}x, expected ${expectedTotal}x`,
      );
    }
    const win = evaluation.wins[0] ?? null;
    frame.winPositions = evaluation.positions;
    frame.spinWinMultiplier = evaluation.totalMultiplier;
    frame.winBreakdown = win ? describeEvaluatedWay(win) : null;
  });
}

function applyCodicilVaultCollection(
  frames: PresentationFrame[],
  vaultTarget: number,
  random: () => number,
): void {
  const vaultFrames = frames.filter((frame) => frame.phase === 'vault');
  if (vaultFrames.length === 0) return;
  const finalFrame = vaultFrames[vaultFrames.length - 1];
  const positionKeys = Object.keys(finalFrame.prizeValues);
  const awards = distributeVaultAward(vaultTarget, positionKeys.length, random);
  const awardByKey = new Map(positionKeys.map((key, index) => [key, awards[index] ?? 0]));

  for (const frame of vaultFrames) {
    const visibleKeys = Object.keys(frame.prizeValues);
    frame.prizeValues = Object.fromEntries(
      visibleKeys.map((key) => [key, awardByKey.get(key) ?? 0]),
    );
    frame.winPositions = [];
    frame.spinWinMultiplier = 0;
    frame.winBreakdown = null;
  }

  if (vaultTarget <= 0) return;
  finalFrame.winPositions = positionKeys.map((key) => {
    const [reel, row] = key.split(':').map(Number);
    return { reel, row };
  });
  finalFrame.spinWinMultiplier = vaultTarget;
  finalFrame.winBreakdown = {
    kind: 'collection',
    icon: 'VAULT',
    title: `${positionKeys.length} estate values collected`,
    detail: 'The highlighted seals are counted once before the Séance chapter begins.',
    calculation: `${positionKeys.length} visible values = ${formatMultiplier(vaultTarget)}×`,
    ways: null,
    matchLength: null,
  };
}

function decorateWildOrigin(frame: PresentationFrame): void {
  const reel = frame.expandingWild?.reel ?? frame.activeWildReels[0];
  if (reel === undefined || !frame.board[reel]) return;
  const row = frame.expandingWild?.originRow ?? (frame.spinNumber + reel) % 4;
  frame.board[reel][row] = frame.expandingWild?.kind === 'spirit' ? 'MIRROR' : 'WILD';
}

function updateCumulativeWins(frames: PresentationFrame[]): void {
  let cumulative = 0;
  for (const frame of frames) {
    cumulative = roundMultiplier(cumulative + frame.spinWinMultiplier);
    frame.cumulativeWinMultiplier = cumulative;
  }
}

function describeEvaluatedWay(win: EvaluatedWaysWin): WinBreakdown {
  const symbol = SYMBOL_BY_KEY[win.symbol];
  return {
    kind: 'ways',
    icon: win.symbol,
    title: `${symbol.label} · ${win.matchLength} reels · ${win.ways} ${win.ways === 1 ? 'way' : 'ways'}`,
    detail: `The highlighted ${symbol.label} pictures connect from reel 1 through reel ${win.matchLength}.`,
    calculation: win.appliedMultiplier > 1
      ? `${formatMultiplier(win.basePayMultiplier)}× symbol × ${win.ways} ways × ${formatMultiplier(win.appliedMultiplier)} power = ${formatMultiplier(win.totalMultiplier)}×`
      : `${formatMultiplier(win.basePayMultiplier)}× symbol × ${win.ways} ways = ${formatMultiplier(win.totalMultiplier)}×`,
    ways: win.ways,
    matchLength: win.matchLength,
  };
}

function distributeVaultAward(total: number, count: number, random: () => number): number[] {
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const weights = Array.from({ length: count }, () => 2 + Math.floor(random() * 9));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const values = weights.map((weight) => Math.round((total * weight * 100) / weightTotal) / 100);
  values[values.length - 1] = roundMultiplier(
    values[values.length - 1] + total - values.reduce((sum, value) => sum + value, 0),
  );
  return values;
}

function scheduledIndexes(total: number, count: number): number[] {
  if (count <= 1) return [Math.min(total - 1, 1)];
  return Array.from({ length: count }, (_, index) =>
    Math.min(total - 1, 1 + Math.round((index * (total - 3)) / Math.max(1, count - 1))),
  );
}

function nextUnusedReel(used: number[], random: () => number): number {
  const available = [0, 1, 2, 3, 4].filter((reel) => !used.includes(reel));
  return available[Math.floor(random() * available.length)] ?? Math.floor(random() * 5);
}

function shuffledPositions(random: () => number): Position[] {
  const positions = Array.from({ length: 20 }, (_, index) => ({
    reel: index % 5,
    row: Math.floor(index / 5),
  }));
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [positions[index], positions[target]] = [positions[target], positions[index]];
  }
  return positions;
}

function prizeValue(random: () => number, scale: number): number {
  const values = [1, 1, 2, 2, 3, 5, 8, 10, 15, 20, 25, 50];
  return values[Math.floor(random() * values.length)] * Math.max(1, Math.ceil(scale / 15));
}

function clauseName(clause: SpinBook['outcome']['clause']): string {
  switch (clause) {
    case 'outsiders-clause':
      return 'OUTSIDER’S CLAUSE';
    case 'secret-heir':
      return 'SECRET HEIR';
    default:
      return 'WIDOW’S SHARE';
  }
}

function willClauseDetail(clause: NonNullable<SpinBook['outcome']['clause']>): string {
  switch (clause) {
    case 'outsiders-clause':
      return 'Outsider’s Clause is active. Every Wax Seal expands for its spin and permanently increases the feature multiplier.';
    case 'secret-heir':
      return 'Secret Heir is active. One named reel transforms completely Wild before every spin, then passes the title to another reel.';
    default:
      return 'Widow’s Share is active. Every expanded Wax Seal reel remains sticky until the final free spin.';
  }
}

function willClauseGoal(clause: NonNullable<SpinBook['outcome']['clause']>): string {
  switch (clause) {
    case 'outsiders-clause':
      return 'LAND A SEAL → EXPAND ITS REEL → RAISE POWER FOR EVERY LATER SPIN';
    case 'secret-heir':
      return 'NAME AN HEIR REEL → EXPAND IT WILD → PASS THE TITLE NEXT SPIN';
    default:
      return 'LAND A SEAL → EXPAND THE REEL → KEEP IT WILD TO THE FINAL SPIN';
  }
}

function roundMultiplier(value: number): number {
  return Math.round(value * 10_000_000_000) / 10_000_000_000;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function formatMultiplier(value: number): string {
  return value.toLocaleString('en', { maximumFractionDigits: 2 });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
