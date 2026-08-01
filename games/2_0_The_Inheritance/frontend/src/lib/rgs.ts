import {
  DEFAULT_BALANCE,
  DEFAULT_BET_AMOUNT,
  DEFAULT_BET_LEVELS,
  isGameModeId,
  type GameModeId,
} from './constants';
import { createDemoBook, createReplayBook, type SpinBook } from './books';
import { normalizePublishedBook } from './publishedBook';

type StakeClient = {
  Authenticate: () => Promise<AuthenticateResponse>;
  Play: (input: { amount: number; mode: string }) => Promise<PlayResponse>;
  EndRound: () => Promise<{ balance?: Balance }>;
  Event?: (event: string) => Promise<unknown>;
};

type RoundState = SpinBook | { book?: SpinBook } | Record<string, unknown>;

export type Balance = {
  amount: number;
  currency: string;
};

export type LaunchConfig = {
  sessionId: string | null;
  rgsUrl: string | null;
  lang: string;
  device: string;
  social: boolean;
  replay: boolean;
};

export type AuthenticateResponse = {
  balance?: Balance;
  config?: {
    minBet?: number;
    maxBet?: number;
    stepBet?: number;
    defaultBetLevel?: number;
    betLevels?: number[];
  };
  jurisdictionFlags?: {
    socialCasino?: boolean;
    disabledTurbo?: boolean;
    disabledFullscreen?: boolean;
    disabledSuperTurbo?: boolean;
    disabledAutoplay?: boolean;
    disabledSlamstop?: boolean;
    disabledSpacebar?: boolean;
    disabledBuyFeature?: boolean;
    displayNetPosition?: boolean;
    displayRTP?: boolean;
    displaySessionTimer?: boolean;
    minimumRoundDuration?: number;
  };
  round?: RgsRound | null;
};

export type RgsRound = {
  betID?: number;
  amount?: number;
  payout?: number;
  payoutMultiplier?: number;
  active: boolean;
  mode: string;
  event?: string;
  state?: RoundState;
  events?: unknown[];
  id?: string | number;
};

export type PlayResponse = {
  balance?: Balance;
  round?: RgsRound;
};

export type RestoredRound = {
  amount: number;
  book: SpinBook;
  mode: GameModeId;
  needsEndRound: boolean;
};

export type RuntimeState = {
  balance: Balance;
  betLevels: number[];
  minBet: number;
  maxBet: number;
  stepBet: number;
  defaultBetLevel: number;
  connected: boolean;
  playable: boolean;
  demo: boolean;
  activeRound: RestoredRound | null;
  socialCasino: boolean;
  spacebarEnabled: boolean;
  buyFeaturesEnabled: boolean;
  autoplayEnabled: boolean;
  displayRTP: boolean;
  minimumRoundDuration: number;
  error: string | null;
};

export function getLaunchConfig(): LaunchConfig {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get('lang') ?? 'en';
  return {
    sessionId: params.get('sessionID'),
    rgsUrl: params.get('rgs_url'),
    lang: requestedLanguage === 'en' ? requestedLanguage : 'en',
    device: params.get('device') ?? 'desktop',
    social: params.get('social') === 'true',
    replay: params.get('replay') === 'true',
  };
}

export async function createRuntime(): Promise<{ state: RuntimeState; client: StakeClient | null }> {
  const launch = getLaunchConfig();
  const fallback = createFallbackRuntime();

  if (launch.replay) {
    return { state: fallback, client: null };
  }

  if (!launch.sessionId && !launch.rgsUrl) {
    return { state: fallback, client: null };
  }

  if (!launch.sessionId || !launch.rgsUrl) {
    return {
      client: null,
      state: {
        ...fallback,
        playable: false,
        demo: false,
        error: 'The launch URL is missing sessionID or rgs_url, so play is disabled.',
      },
    };
  }

  try {
    const module = await import('stake-engine');
    const sdkTarget = normalizeSdkTarget(window.location.href, launch.rgsUrl);
    const client = module.RGSClient(sdkTarget) as StakeClient;
    const response = await client.Authenticate();
    return {
      client,
      state: normalizeAuthenticateResponse(response),
    };
  } catch (error) {
    return {
      client: null,
      state: {
        ...fallback,
        playable: false,
        demo: false,
        error: error instanceof Error ? error.message : 'Unable to authenticate with Stake Engine RGS.',
      },
    };
  }
}

function normalizeSdkTarget(
  pageUrl: string,
  rgsUrl: string,
): { url: string; protocol: 'http' | 'https' } {
  const launchUrl = new URL(pageUrl);
  let protocol: 'http' | 'https' = 'https';
  let target = rgsUrl.replace(/\/$/, '');
  try {
    const parsed = new URL(rgsUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      protocol = parsed.protocol === 'http:' ? 'http' : 'https';
      target = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/$/, '');
    }
  } catch {
    target = target.replace(/^\/\//, '');
  }
  launchUrl.searchParams.set('rgs_url', target);
  return { url: launchUrl.href, protocol };
}

export function normalizeAuthenticateResponse(response: AuthenticateResponse): RuntimeState {
  const fallback = createFallbackRuntime();
  const config = normalizeBetConfig(response.config);
  const restoredRound = normalizeRestoredRound(response.round, config.defaultBetLevel);
  const jurisdiction = response.jurisdictionFlags;
  return {
    balance: response.balance ?? fallback.balance,
    ...config,
    connected: true,
    playable: true,
    demo: false,
    activeRound: restoredRound,
    socialCasino: Boolean(jurisdiction?.socialCasino),
    spacebarEnabled: !jurisdiction?.disabledSpacebar,
    buyFeaturesEnabled: !jurisdiction?.disabledBuyFeature,
    autoplayEnabled: !jurisdiction?.disabledAutoplay,
    displayRTP: jurisdiction?.displayRTP !== false,
    minimumRoundDuration: Math.max(0, jurisdiction?.minimumRoundDuration ?? 0),
    error: null,
  };
}

export type PlayRoundResult =
  | {
      ok: true;
      book: SpinBook;
      balance?: Balance;
      localPreview?: boolean;
      needsEndRound: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export async function playRound(
  mode: GameModeId,
  amount: number,
  client: StakeClient | null,
): Promise<PlayRoundResult> {
  if (!client) {
    const qaOutcome = localQaOutcome();
    return {
      ok: true,
      book: qaOutcome ? createReplayBook(mode, `${mode}-${qaOutcome}`) : createDemoBook(mode),
      localPreview: true,
      needsEndRound: false,
    };
  }

  try {
    const response = await client.Play({ amount, mode });
    const state = response.round?.state;
    const book =
      normalizeBookState(mode, state) ??
      normalizeEventBook(mode, response.round?.events, response.round?.id ?? response.round?.betID);
    if (!book) {
      throw new Error('RGS play response did not contain a supported event book.');
    }
    verifyPayoutMultiplier(book, response.round?.payoutMultiplier);
    return {
      ok: true,
      book,
      balance: response.balance,
      needsEndRound: Boolean(response.round?.active) && roundHasPayout(response.round, book),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'RGS play request failed.',
    };
  }
}

export async function settleRound(
  client: StakeClient,
): Promise<{ ok: true; balance?: Balance } | { ok: false; error: string }> {
  try {
    const response = await client.EndRound();
    return { ok: true, balance: response.balance };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'RGS end-round request failed.',
    };
  }
}

function localQaOutcome(): 'bonus' | 'loss' | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') return null;
  const value = new URLSearchParams(window.location.search).get('qa');
  return value === 'bonus' || value === 'loss' ? value : null;
}

export function normalizeEventBook(
  mode: GameModeId,
  events: unknown[] | undefined,
  roundId?: string | number,
): SpinBook | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const records = events.filter((event): event is Record<string, unknown> =>
    Boolean(event) && typeof event === 'object',
  );
  const finalWin = [...records].reverse().find((event) => event.type === 'finalWin');
  const plan = records.find((event) => event.type === 'presentationPlan');
  const intro = records.find((event) => event.type === 'featureIntro');
  if (typeof finalWin?.amount !== 'number') return null;
  return normalizePublishedBook(mode, {
    id: roundId ?? `event-${mode}`,
    mode,
    payoutMultiplier: finalWin.amount,
    events: records,
    criteria: 'rgs-event-book',
    resultMeta: {
      feature: typeof plan?.feature === 'string'
        ? plan.feature
        : typeof intro?.feature === 'string'
          ? intro.feature
          : 'regular',
    },
  });
}

export function normalizeBookState(mode: GameModeId, state: RoundState | undefined): SpinBook | null {
  if (!state) {
    return null;
  }

  const maybeBook = 'book' in state ? state.book : null;
  if (isSpinBook(maybeBook)) {
    return maybeBook;
  }

  if (isSpinBook(state)) {
    return state;
  }

  const published = normalizePublishedBook(mode, state);
  if (published) return published;

  if (maybeBook) {
    return normalizePublishedBook(mode, maybeBook);
  }

  return null;
}

function isSpinBook(value: unknown): value is SpinBook {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SpinBook>;
  return (
    typeof candidate.id === 'string' &&
    Array.isArray(candidate.board) &&
    Array.isArray(candidate.events) &&
    typeof candidate.payoutMultiplier === 'number'
  );
}

function createFallbackRuntime(): RuntimeState {
  return {
    balance: { amount: DEFAULT_BALANCE, currency: 'USD' },
    betLevels: DEFAULT_BET_LEVELS,
    minBet: DEFAULT_BET_LEVELS[0],
    maxBet: DEFAULT_BET_LEVELS[DEFAULT_BET_LEVELS.length - 1],
    stepBet: DEFAULT_BET_LEVELS[0],
    defaultBetLevel: DEFAULT_BET_AMOUNT,
    connected: false,
    playable: true,
    demo: true,
    activeRound: null,
    socialCasino: false,
    spacebarEnabled: true,
    buyFeaturesEnabled: true,
    autoplayEnabled: true,
    displayRTP: true,
    minimumRoundDuration: 0,
    error: null,
  };
}

function normalizeBetConfig(config: AuthenticateResponse['config']): Pick<
  RuntimeState,
  'betLevels' | 'minBet' | 'maxBet' | 'stepBet' | 'defaultBetLevel'
> {
  if (!config) {
    throw new Error('RGS authenticate response is missing betting configuration.');
  }

  const minBet = positiveInteger(config.minBet, 'minBet');
  const maxBet = positiveInteger(config.maxBet, 'maxBet');
  const stepBet = positiveInteger(config.stepBet, 'stepBet');
  if (maxBet < minBet) {
    throw new Error('RGS authenticate response has maxBet below minBet.');
  }

  const returnedLevels = Array.isArray(config.betLevels) ? config.betLevels : [];
  const betLevels = [...new Set(returnedLevels)]
    .filter((value) => Number.isInteger(value) && value >= minBet && value <= maxBet)
    .sort((left, right) => left - right);
  if (betLevels.length === 0) {
    throw new Error('RGS authenticate response did not provide any usable bet levels.');
  }

  const requestedDefault = positiveInteger(config.defaultBetLevel, 'defaultBetLevel');
  const defaultBetLevel = betLevels.includes(requestedDefault) ? requestedDefault : betLevels[0];
  return { betLevels, minBet, maxBet, stepBet, defaultBetLevel };
}

function normalizeRestoredRound(
  round: RgsRound | null | undefined,
  defaultBetLevel: number,
): RestoredRound | null {
  if (!round?.active) return null;
  if (!isGameModeId(round.mode)) {
    throw new Error(`Active RGS round uses unsupported mode "${round.mode}".`);
  }

  const book =
    normalizeBookState(round.mode, round.state) ??
    normalizeEventBook(round.mode, round.events, round.id ?? round.betID);
  if (!book) {
    throw new Error('Active RGS round could not be restored from its saved state.');
  }
  verifyPayoutMultiplier(book, round.payoutMultiplier);
  const amount = Number.isInteger(round.amount) && Number(round.amount) > 0
    ? Number(round.amount)
    : defaultBetLevel;
  return {
    amount,
    book,
    mode: round.mode,
    needsEndRound: roundHasPayout(round, book),
  };
}

function roundHasPayout(round: RgsRound | undefined, book: SpinBook): boolean {
  return (
    book.payoutMultiplier > 0 ||
    (typeof round?.payout === 'number' && round.payout > 0) ||
    (typeof round?.payoutMultiplier === 'number' && round.payoutMultiplier > 0)
  );
}

function verifyPayoutMultiplier(book: SpinBook, responseMultiplier: number | undefined): void {
  if (
    typeof responseMultiplier === 'number' &&
    Number.isFinite(responseMultiplier) &&
    Math.abs(normalizeResponseMultiplier(responseMultiplier, book.payoutMultiplier) - book.payoutMultiplier) > 1e-8
  ) {
    throw new Error(
      `RGS payout mismatch: response ${responseMultiplier}x, event book ${book.payoutMultiplier}x.`,
    );
  }
}

function normalizeResponseMultiplier(value: number, expected: number): number {
  if (Math.abs(value - expected) <= 1e-8) return value;
  if (Math.abs(value / 100 - expected) <= 1e-8) return value / 100;
  return value;
}

function positiveInteger(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`RGS authenticate response has invalid ${label}.`);
  }
  return Number(value);
}
