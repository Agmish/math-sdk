import { describe, expect, it } from 'vitest';
import { amountToDisplay, socialText } from './format';

describe('currency and social-mode formatting', () => {
  it('shows exact sub-cent results while keeping balances at normal precision', () => {
    expect(amountToDisplay(1_000, 'USD', 'result')).toBe('$0.001');
    expect(amountToDisplay(1_250, 'USD', 'result')).toBe('$0.00125');
    expect(amountToDisplay(1_250, 'USD', 'balance')).toBe('$0.00');
  });

  it('supports Stake.US token currencies without a dollar prefix', () => {
    expect(amountToDisplay(1_250_000, 'XSC', 'result')).toBe('1.25 SC');
    expect(amountToDisplay(2_000_000, 'XGC')).toBe('2.00 GC');
  });

  it('replaces restricted social terms without corrupting surrounding words', () => {
    const text =
      'Bonus Buy purchase: total bet, payout, cash, wager, insufficient funds, and currency.';
    const result = socialText(text, true).toLowerCase();

    for (const restricted of [
      'bonus buy',
      'purchase',
      'total bet',
      'payout',
      'cash',
      'wager',
      'insufficient funds',
      'currency',
    ]) {
      expect(result).not.toContain(restricted);
    }
    expect(result).toContain('feature');
    expect(result).toContain('total play');
    expect(result).toContain('token');
  });
});
