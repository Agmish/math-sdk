export type SymbolTier = 'premium' | 'high' | 'low' | 'special';
export type SymbolKey =
  | 'HEIRESS'
  | 'EXECUTOR'
  | 'STAG'
  | 'RAVEN_KEY'
  | 'RING'
  | 'WATCH'
  | 'LILIES'
  | 'CANDELABRUM'
  | 'WILD'
  | 'TESTAMENT'
  | 'VAULT'
  | 'MIRROR'
  | 'CODICIL';

export type SymbolDefinition = {
  key: SymbolKey;
  label: string;
  tier: SymbolTier;
  image: string;
  color: string;
  glow: string;
  pays?: number[];
  specialRule?: string;
};

export const SYMBOLS: readonly SymbolDefinition[] = [
  {
    key: 'HEIRESS',
    label: 'The Heiress',
    tier: 'premium',
    image: assetUrl('symbols/heiress.webp'),
    color: '#a84943',
    glow: '#f0a18f',
    pays: [0, 0, 1, 5, 20],
  },
  {
    key: 'EXECUTOR',
    label: 'The Executor',
    tier: 'premium',
    image: assetUrl('symbols/executor.webp'),
    color: '#c6b18a',
    glow: '#f1dfbd',
    pays: [0, 0, 0.5, 2.5, 10],
  },
  {
    key: 'STAG',
    label: 'Blackthorn Stag',
    tier: 'high',
    image: assetUrl('symbols/stag.webp'),
    color: '#8fb3ad',
    glow: '#c4f0e8',
  },
  {
    key: 'RAVEN_KEY',
    label: 'Raven & Key',
    tier: 'high',
    image: assetUrl('symbols/raven-key.webp'),
    color: '#779c9f',
    glow: '#b8edf0',
  },
  {
    key: 'RING',
    label: 'Emerald Ring',
    tier: 'high',
    image: assetUrl('symbols/poison-ring.webp'),
    color: '#4e9c70',
    glow: '#9bf1b7',
    pays: [0, 0, 0.3, 1.5, 5],
  },
  {
    key: 'WATCH',
    label: 'Midnight Watch',
    tier: 'low',
    image: assetUrl('symbols/pocket-watch.webp'),
    color: '#bca36c',
    glow: '#ead598',
    pays: [0, 0, 0.2, 0.8, 3],
  },
  {
    key: 'LILIES',
    label: 'Funeral Lilies',
    tier: 'low',
    image: assetUrl('symbols/lilies.webp'),
    color: '#d8d0b9',
    glow: '#fff7df',
    pays: [0, 0, 0.1, 0.5, 2],
  },
  {
    key: 'CANDELABRUM',
    label: 'Blue Candelabrum',
    tier: 'low',
    image: assetUrl('symbols/candelabrum.webp'),
    color: '#7ca9ad',
    glow: '#bceef2',
  },
  {
    key: 'WILD',
    label: 'Wax Seal Wild',
    tier: 'special',
    image: assetUrl('symbols/wax-wild.webp'),
    color: '#a53835',
    glow: '#ff8a70',
    specialRule: 'Substitutes for all regular symbols and expands to cover its reel when activated.',
  },
  {
    key: 'TESTAMENT',
    label: 'Testament Scatter',
    tier: 'special',
    image: assetUrl('symbols/testament.webp'),
    color: '#9c4937',
    glow: '#e8ab78',
    specialRule: 'Three symbols can award The Sealed Will.',
  },
  {
    key: 'VAULT',
    label: 'Vault Scatter',
    tier: 'special',
    image: assetUrl('symbols/vault-scatter.webp'),
    color: '#a88c5d',
    glow: '#e5c98e',
    specialRule: 'Three symbols can award Vault of Echoes.',
  },
  {
    key: 'MIRROR',
    label: 'Séance Mirror',
    tier: 'special',
    image: assetUrl('symbols/seance-mirror.webp'),
    color: '#649ca3',
    glow: '#adf2f2',
    specialRule: 'Three symbols can award Midnight Séance.',
  },
  {
    key: 'CODICIL',
    label: 'Blackthorn Crest',
    tier: 'special',
    image: assetUrl('symbols/stag.webp'),
    color: '#b99455',
    glow: '#f0d18e',
    specialRule: 'Three symbols can reveal The Final Codicil.',
  },
];

export const SYMBOL_BY_KEY = Object.fromEntries(
  SYMBOLS.map((symbol) => [symbol.key, symbol]),
) as Record<SymbolKey, SymbolDefinition>;

export const REEL_SYMBOL_POOL: SymbolKey[] = [
  'HEIRESS',
  'EXECUTOR',
  'RING',
  'WATCH',
  'LILIES',
  'WATCH',
  'LILIES',
  'WILD',
  'TESTAMENT',
  'VAULT',
  'MIRROR',
  'CODICIL',
];
import { assetUrl } from './assets';
