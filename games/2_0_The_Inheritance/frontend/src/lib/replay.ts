import { DEFAULT_BET_AMOUNT, isGameModeId, type GameModeId } from './constants';
import type { SpinBook } from './books';
import { normalizeBookState } from './rgs';

export type ReplayConfig = {
  active: boolean;
  game: string | null;
  version: string | null;
  mode: GameModeId;
  event: string | null;
  rgsUrl: string | null;
  currency: string;
  amount: number;
  lang: 'en';
  device: string;
  social: boolean;
};

export type ReplayResult =
  | {
      ok: true;
      book: SpinBook;
      payoutMultiplier: number;
      costMultiplier: number;
    }
  | { ok: false; message: string };

export function getReplayConfig(): ReplayConfig {
  const params = new URLSearchParams(window.location.search);
  const rawMode = params.get('mode') ?? 'BASE';
  const mode = isGameModeId(rawMode) ? rawMode : 'BASE';
  const rawAmount = Number(params.get('amount') ?? DEFAULT_BET_AMOUNT);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0
    ? Math.round(rawAmount)
    : DEFAULT_BET_AMOUNT;

  return {
    active: params.get('replay') === 'true',
    game: params.get('game'),
    version: params.get('version'),
    mode,
    event: params.get('event'),
    rgsUrl: params.get('rgs_url'),
    currency: params.get('currency') ?? 'USD',
    amount,
    lang: 'en',
    device: params.get('device') ?? 'desktop',
    social: params.get('social') === 'true',
  };
}

export async function loadReplay(config: ReplayConfig): Promise<ReplayResult> {
  if (!config.active) {
    return { ok: false, message: 'Replay mode is not active.' };
  }

  if (!config.game || !config.version || !config.event || !config.rgsUrl) {
    return {
      ok: false,
      message: 'Replay URL is missing game, version, event, or rgs_url.',
    };
  }

  try {
    const path = [config.game, config.version, config.mode, config.event]
      .map((value) => encodeURIComponent(String(value)))
      .join('/');
    const url = `${config.rgsUrl.replace(/\/$/, '')}/bet/replay/${path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Replay request failed with ${response.status}`);
    }
    const data = await response.json() as Record<string, unknown>;
    const book = normalizeBookState(config.mode, data.state as Parameters<typeof normalizeBookState>[1]);
    if (!book) {
      throw new Error('Replay response did not contain a supported event book.');
    }
    const payoutValue = requiredMultiplier(data.payoutMultiplier, 'payoutMultiplier');
    const payoutMultiplier = Math.abs(payoutValue / 100 - book.payoutMultiplier) <= 1e-8
      ? payoutValue / 100
      : payoutValue;
    const costMultiplier = requiredMultiplier(data.costMultiplier, 'costMultiplier');
    if (Math.abs(book.payoutMultiplier - payoutMultiplier) > 1e-8) {
      throw new Error(
        `Replay payout mismatch: response ${payoutMultiplier}x, event book ${book.payoutMultiplier}x.`,
      );
    }
    if (Math.abs(book.costMultiplier - costMultiplier) > 1e-8) {
      throw new Error(
        `Replay cost mismatch: response ${costMultiplier}x, event book ${book.costMultiplier}x.`,
      );
    }
    return { ok: true, book, payoutMultiplier, costMultiplier };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Replay data could not be loaded.',
    };
  }
}

function requiredMultiplier(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Replay response has invalid ${label}.`);
  }
  return value;
}
