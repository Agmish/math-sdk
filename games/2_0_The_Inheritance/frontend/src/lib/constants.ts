import contract from '../../../game_contract.json';
import { assetUrl } from './assets';

export const GAME_TITLE = contract.game.title;
export const GAME_SUBTITLE = contract.game.subtitle;
export const RTP_TARGET = contract.game.rtp;
export const RTP_LABEL = contract.game.rtpLabel;
export const API_MULTIPLIER = 1_000_000;
export const EVENT_PAYOUT_SCALE = contract.game.eventPayoutScale;
export const MAX_WIN_MULTIPLIER = contract.game.maxWin;
export const MIN_BET_AMOUNT = 10_000;
export const MAX_BET_AMOUNT = 300_000_000;
export const DEFAULT_BET_AMOUNT = 1_000_000;

export type GameModeId =
  | 'BASE'
  | 'HEIRLOOM_ANTE'
  | 'SEALED_WILL_BUY'
  | 'VAULT_ECHOES_BUY'
  | 'MIDNIGHT_SEANCE_BUY'
  | 'FINAL_CODICIL_BUY';

export type FeatureKind = 'base' | 'ante' | 'will' | 'vault' | 'seance' | 'codicil';

export type GameMode = {
  id: GameModeId;
  label: string;
  shortLabel: string;
  costMultiplier: number;
  rtp: number;
  rtpLabel: string;
  maxWinMultiplier: number;
  rules: string;
  category: 'base' | 'boost' | 'buy';
  feature: FeatureKind;
  featureArt?: string;
  isBuyBonus: boolean;
  volatility: 'High' | 'Very High' | 'Extreme';
  featureFrequencyLabel: string;
  mechanicPreview: string;
  startingAward?: string;
  featureBullets?: string[];
  accent: string;
};

const contractMode = (id: GameModeId) => {
  const mode = contract.modes.find((candidate) => candidate.id === id);
  if (!mode) throw new Error(`Canonical contract is missing ${id}`);
  return mode;
};

const mode = (
  id: GameModeId,
  config: Omit<GameMode, 'id' | 'costMultiplier' | 'rtp' | 'rtpLabel' | 'maxWinMultiplier'>,
): GameMode => {
  const source = contractMode(id);
  return {
    id,
    costMultiplier: source.cost,
    rtp: source.rtp,
    rtpLabel: contract.game.rtpLabel,
    maxWinMultiplier: source.maxWin,
    ...config,
  };
};

export const GAME_MODES: GameMode[] = [
  mode('BASE', {
    label: 'Base Game',
    shortLabel: 'Base',
    rules:
      'A 5×4, 1,024-ways round. Three Testament symbols reveal The Sealed Will, three Vault Keys open Vault of Echoes, three Mirrors begin Midnight Séance, and three Blackthorn Crests reveal The Final Codicil. Wax Seal Wilds expand after the reels stop.',
    category: 'base',
    feature: 'base',
    isBuyBonus: false,
    volatility: 'High',
    featureFrequencyLabel: `${(contractMode('BASE').statistics.featureHitRate * 100).toFixed(2)}% natural-feature frequency`,
    mechanicPreview: 'Natural chapters, expanding Wax Seal Wilds and 1,024 ways.',
    startingAward: 'Base round',
    featureBullets: [
      'Matching regular pictures connect from reel one across adjacent reels.',
      'Wax Seal Wilds expand vertically before the result is evaluated.',
      'Four distinct three-symbol chapter triggers can appear naturally.',
    ],
    accent: '#c19a5b',
  }),
  mode('HEIRLOOM_ANTE', {
    label: 'Heirloom Ante',
    shortLabel: 'Ante',
    rules:
      'Costs 3× the selected base amount. The published Ante table raises the combined natural-feature frequency to 6.61%; a feature and a return are never guaranteed.',
    category: 'boost',
    feature: 'ante',
    isBuyBonus: false,
    volatility: 'Very High',
    featureFrequencyLabel: `${(contractMode('HEIRLOOM_ANTE').statistics.featureHitRate * 100).toFixed(2)}% natural-feature frequency`,
    mechanicPreview: 'A separate weighted table with more frequent feature results.',
    startingAward: '3× round cost',
    featureBullets: [
      'Uses its own certified one-million-weight result table.',
      'Natural chapter frequency is higher than the Base Game.',
      'Activation requires confirmation and never guarantees a return.',
    ],
    accent: '#8eb7aa',
  }),
  mode('SEALED_WILL_BUY', {
    label: 'The Sealed Will',
    shortLabel: 'Will',
    rules:
      'Starts with eight free spins. A Wax Seal expands into a complete Wild reel on every reveal and exposes that spin’s sealed award. Three Testament symbols during the feature add two spins and update the visible counter.',
    category: 'buy',
    feature: 'will',
    featureArt: assetUrl('features/sealed-will.webp'),
    isBuyBonus: true,
    volatility: 'High',
    featureFrequencyLabel: 'Eight starting spins · +2-spin retrigger',
    mechanicPreview: '8 free spins · expanding Wax Seal reel · visible sealed awards.',
    startingAward: '8 free spins',
    featureBullets: [
      'One Wax Seal expands vertically on every spin.',
      'The highlighted seal displays the exact award recorded in the result book.',
      'Three Testament symbols add two free spins.',
    ],
    accent: '#aa3f38',
  }),
  mode('VAULT_ECHOES_BUY', {
    label: 'Vault of Echoes',
    shortLabel: 'Vault',
    rules:
      'Starts six lock-and-respin reveals. Each new Vault Key locks in its displayed estate value. The six visible values are accumulated once; the mode is not a jackpot game and may return zero.',
    category: 'buy',
    feature: 'vault',
    featureArt: assetUrl('features/vault-echoes.webp'),
    isBuyBonus: true,
    volatility: 'Very High',
    featureFrequencyLabel: 'Six lock-and-respin reveals',
    mechanicPreview: '6 reveals · locked Vault Keys · exact visible collection.',
    startingAward: '6 vault reveals',
    featureBullets: [
      'One new Vault Key position is locked on each reveal.',
      'Every key displays the exact value recorded in the published event.',
      'The collected total is shown continuously and paid once.',
    ],
    accent: '#b9904f',
  }),
  mode('MIDNIGHT_SEANCE_BUY', {
    label: 'Midnight Séance',
    shortLabel: 'Séance',
    rules:
      'Starts with ten free spins. The Mirror possesses one complete reel on every reveal; the possessed reel displays the exact spirit award and the séance power rises through the sequence. Three Mirrors add two spins.',
    category: 'buy',
    feature: 'seance',
    featureArt: assetUrl('features/midnight-seance.webp'),
    isBuyBonus: true,
    volatility: 'Very High',
    featureFrequencyLabel: 'Ten starting spins · +2-spin retrigger',
    mechanicPreview: '10 free spins · roaming possessed reel · rising séance power.',
    startingAward: '10 free spins',
    featureBullets: [
      'The Mirror possesses one complete reel before every reveal.',
      'The highlighted spirit positions display that reveal’s exact award.',
      'Three Mirrors add two free spins.',
    ],
    accent: '#64b5b4',
  }),
  mode('FINAL_CODICIL_BUY', {
    label: 'The Final Codicil',
    shortLabel: 'Codicil',
    rules:
      'One eleven-reveal round combining five Sealed Will spins, three Vault reveals and three Midnight Séance reveals. Running awards and inherited visual upgrades carry between the three chapters; the complete sequence is one independent round.',
    category: 'buy',
    feature: 'codicil',
    featureArt: assetUrl('features/final-codicil.webp'),
    isBuyBonus: true,
    volatility: 'Extreme',
    featureFrequencyLabel: 'Five Will · three Vault · three Séance reveals',
    mechanicPreview: 'Will → Vault → Séance in one continuous three-chapter round.',
    startingAward: '11 feature reveals',
    featureBullets: [
      'Stage I presents five expanding-Wild awards.',
      'Stage II locks and collects three Vault Key values.',
      'Stage III presents three possessed-reel spirit awards.',
    ],
    accent: '#d8bd7a',
  }),
];

export const MODE_IDS = GAME_MODES.map((item) => item.id) as GameModeId[];

export function isGameModeId(value: string): value is GameModeId {
  return MODE_IDS.includes(value as GameModeId);
}

export function getGameMode(modeId: GameModeId): GameMode {
  return GAME_MODES.find((item) => item.id === modeId) ?? GAME_MODES[0];
}

export function modeTotalCost(modeId: GameModeId, baseBet: number): number {
  return getGameMode(modeId).costMultiplier * baseBet;
}

export const DEFAULT_BET_LEVELS = [
  MIN_BET_AMOUNT,
  20_000,
  50_000,
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
  20_000_000,
  50_000_000,
  100_000_000,
  150_000_000,
  200_000_000,
  250_000_000,
  MAX_BET_AMOUNT,
];

export const DEFAULT_BALANCE = 6_000_000_000;

export const SOCIAL_REPLACEMENTS: Record<string, string> = {
  bet: 'play',
  Bet: 'Play',
  BET: 'PLAY',
  buy: 'play',
  Buy: 'Play',
  cash: 'coins',
  Cash: 'Coins',
  money: 'coins',
  Money: 'Coins',
};
