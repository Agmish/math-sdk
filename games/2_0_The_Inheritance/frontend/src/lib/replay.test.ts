import { afterEach, describe, expect, it, vi } from 'vitest';
import publishedFixtures from './fixtures/published-books.json';
import { createReplayBook } from './books';
import { getReplayConfig, loadReplay } from './replay';

describe('Stake replay integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses required and optional replay URL parameters safely', () => {
    vi.stubGlobal('window', {
      location: {
        search:
          '?replay=true&game=inheritance&version=7&mode=VAULT_ECHOES_BUY&event=42' +
          '&rgs_url=https%3A%2F%2Frgs.example&currency=XSC&amount=10000&lang=zz&device=mobile&social=true',
      },
    });

    expect(getReplayConfig()).toEqual({
      active: true,
      game: 'inheritance',
      version: '7',
      mode: 'VAULT_ECHOES_BUY',
      event: '42',
      rgsUrl: 'https://rgs.example',
      currency: 'XSC',
      amount: 10_000,
      lang: 'en',
      device: 'mobile',
      social: true,
    });
  });

  it('loads and validates the official replay response schema', async () => {
    const book = createReplayBook('BASE', 'BASE-normal');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        payoutMultiplier: book.payoutMultiplier,
        costMultiplier: 1,
        state: book,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadReplay({
      active: true,
      game: 'inheritance',
      version: '1',
      mode: 'BASE',
      event: 'normal/unsafe',
      rgsUrl: 'https://rgs.example/',
      currency: 'USD',
      amount: 1_000_000,
      lang: 'en',
      device: 'desktop',
      social: false,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://rgs.example/bet/replay/inheritance/1/BASE/normal%2Funsafe',
    );
  });

  it('loads Stake replay rounds whose state is the direct event array', async () => {
    const published = publishedFixtures.VAULT_ECHOES_BUY.positive;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        round: {
          betID: 321,
          mode: 'VAULT_ECHOES_BUY',
          payoutMultiplier: published.payoutMultiplier / 100,
          costMultiplier: 140,
          state: published.events,
        },
      }),
    })));

    const result = await loadReplay({
      active: true,
      game: 'inheritance',
      version: '1',
      mode: 'VAULT_ECHOES_BUY',
      event: '321',
      rgsUrl: 'https://rgs.example',
      currency: 'USD',
      amount: 1_000_000,
      lang: 'en',
      device: 'desktop',
      social: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.book.id).toBe('321');
    expect(result.payoutMultiplier).toBe(published.payoutMultiplier / 100);
    expect(result.costMultiplier).toBe(140);
  });

  it('reports replay errors without substituting a fabricated round', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));

    const result = await loadReplay({
      active: true,
      game: 'inheritance',
      version: '1',
      mode: 'BASE',
      event: 'missing',
      rgsUrl: 'https://rgs.example',
      currency: 'USD',
      amount: 1_000_000,
      lang: 'en',
      device: 'desktop',
      social: false,
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('book');
  });
});
