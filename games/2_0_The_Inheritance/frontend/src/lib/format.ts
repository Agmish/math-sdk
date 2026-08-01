import { API_MULTIPLIER } from './constants';

export type AmountDisplayKind = 'balance' | 'result';

export function amountToDisplay(
  amount: number,
  currency = 'USD',
  kind: AmountDisplayKind = 'balance',
): string {
  const value = amount / API_MULTIPLIER;
  const precision = currencyPrecision(value, currency, kind);
  if (currency === 'XGC' || currency === 'XSC') {
    const socialCurrency = currency === 'XGC' ? 'GC' : 'SC';
    return `${new Intl.NumberFormat('en', precision).format(value)} ${socialCurrency}`;
  }

  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      ...precision,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat('en', precision).format(value)} ${currency}`;
  }
}

export function multiplierToDisplay(value: number): string {
  if (value >= 100) {
    return `${Math.round(value).toLocaleString('en')}x`;
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}x`;
}

export function socialText(text: string, social: boolean): string {
  if (!social) {
    return text;
  }

  return SOCIAL_PHRASES.reduce((value, [restricted, replacement]) => {
    const pattern = new RegExp(`\\b${escapeExpression(restricted)}\\b`, 'gi');
    return value.replace(pattern, (match) => matchCase(replacement, match));
  }, text);
}

const SOCIAL_PHRASES: Array<[string, string]> = [
  ['insufficient funds', 'not enough balance'],
  ['be awarded to player’s accounts', 'appear in player’s accounts'],
  ['place your bets', 'come and play'],
  ['at the cost of', 'for'],
  ['cost of', 'can be played for'],
  ['bonus buy', 'feature'],
  ['buy bonus', 'feature'],
  ['win feature', 'play feature'],
  ['total bet', 'total play'],
  ['paid out', 'won'],
  ['pays out', 'wins'],
  ['pay out', 'win'],
  ['paytable', 'award table'],
  ['payouts', 'wins'],
  ['payout', 'win'],
  ['betting', 'playing'],
  ['bets', 'plays'],
  ['bet', 'play'],
  ['bought', 'instantly triggered'],
  ['purchase', 'play'],
  ['buy', 'play'],
  ['rebet', 'respin'],
  ['payer', 'winner'],
  ['pays', 'wins'],
  ['paid', 'won'],
  ['pay', 'win'],
  ['cash', 'coins'],
  ['money', 'coins'],
  ['gamble', 'play'],
  ['wager', 'play'],
  ['stake', 'play amount'],
  ['deposit', 'get coins'],
  ['withdraw', 'redeem'],
  ['credits', 'balance'],
  ['credit', 'balance'],
  ['currency', 'token'],
  ['funds', 'balance'],
  ['fund', 'balance'],
];

function currencyPrecision(
  value: number,
  currency: string,
  kind: AmountDisplayKind,
): Intl.NumberFormatOptions {
  if (currency === 'JPY' || currency === 'KRW') {
    return { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  }
  if (kind === 'result' && value !== 0 && Math.abs(value) < 0.01) {
    return { minimumFractionDigits: 2, maximumFractionDigits: 6 };
  }
  return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
}

function matchCase(replacement: string, source: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement[0]?.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
