export type SoundName =
  | 'spin'
  | 'reelStop'
  | 'wild'
  | 'lock'
  | 'collect'
  | 'multiplier'
  | 'win'
  | 'winLow'
  | 'winMid'
  | 'winHigh'
  | 'bigWin'
  | 'max'
  | 'button'
  | 'tease'
  | 'will'
  | 'vault'
  | 'seance'
  | 'codicil'
  | 'chapter'
  | 'retrigger';

export type MusicMood = 'base' | 'will' | 'vault' | 'seance' | 'codicil';

const AUDIO_BASE = `${import.meta.env.BASE_URL}assets/audio/`;

const EFFECTS: Record<SoundName, string> = {
  spin: 'spin-whisper.wav',
  reelStop: 'reel-stop.wav',
  wild: 'wax-stamp.wav',
  lock: 'vault-lock.wav',
  collect: 'coin-collect.wav',
  multiplier: 'multiplier-rise.wav',
  win: 'win-chime.wav',
  winLow: 'win-low.wav',
  winMid: 'win-medium.wav',
  winHigh: 'win-high.wav',
  bigWin: 'big-win.wav',
  max: 'max-inheritance.wav',
  button: 'button-paper.wav',
  tease: 'omen-tease.wav',
  will: 'will-open.wav',
  vault: 'vault-open.wav',
  seance: 'seance-rise.wav',
  codicil: 'codicil-open.wav',
  chapter: 'chapter-turn.wav',
  retrigger: 'retrigger.wav',
};

const BASE_VOLUMES: Record<SoundName, number> = {
  spin: 0.24,
  reelStop: 0.28,
  wild: 0.5,
  lock: 0.32,
  collect: 0.34,
  multiplier: 0.36,
  win: 0.35,
  winLow: 0.28,
  winMid: 0.36,
  winHigh: 0.42,
  bigWin: 0.48,
  max: 0.52,
  button: 0.22,
  tease: 0.28,
  will: 0.42,
  vault: 0.44,
  seance: 0.42,
  codicil: 0.48,
  chapter: 0.38,
  retrigger: 0.46,
};

const MUSIC_LEVELS: Record<MusicMood, number> = {
  base: 0.22,
  will: 0.24,
  vault: 0.24,
  seance: 0.25,
  codicil: 0.26,
};

const MUSIC_TRACKS: Record<MusicMood, string> = {
  base: 'music-inheritance.ogg',
  will: 'music-inheritance.ogg',
  vault: 'music-inheritance.ogg',
  seance: 'music-inheritance.ogg',
  codicil: 'music-inheritance.ogg',
};

const MUSIC_START_OFFSETS: Record<MusicMood, number> = {
  base: 0,
  will: 22,
  vault: 44,
  seance: 66,
  codicil: 88,
};

let musicTracks: Partial<Record<MusicMood, HTMLAudioElement>> = {};
let activeMusic: HTMLAudioElement | null = null;
let activeEffects: Array<{ audio: HTMLAudioElement; name: SoundName }> = [];
let templates: Partial<Record<SoundName, HTMLAudioElement>> = {};
let currentMood: MusicMood = 'base';
let musicFade: ReturnType<typeof setInterval> | null = null;
let musicDuck: ReturnType<typeof setInterval> | null = null;
let musicTransitionCount = 0;

export function preloadAudio(): void {
  if (typeof Audio === 'undefined') return;
  for (const name of Object.keys(EFFECTS) as SoundName[]) {
    const audio = new Audio(`${AUDIO_BASE}${EFFECTS[name]}`);
    audio.preload = 'auto';
    templates[name] = audio;
  }
  for (const mood of Object.keys(MUSIC_TRACKS) as MusicMood[]) {
    if (musicTracks[mood]) continue;
    const track = new Audio(`${AUDIO_BASE}${MUSIC_TRACKS[mood]}`);
    track.loop = true;
    track.preload = 'auto';
    track.volume = 0;
    musicTracks[mood] = track;
  }
}

export function startMusic(muted: boolean, mood: MusicMood = currentMood): void {
  currentMood = mood;
  if (muted || typeof Audio === 'undefined') return;
  if (!musicTracks[mood]) preloadAudio();
  const target = musicTracks[mood];
  if (!target) return;

  if (!activeMusic || activeMusic.paused) {
    if (activeMusic && activeMusic !== target) activeMusic.pause();
    activeMusic = target;
    if (activeMusic.currentTime < 1) activeMusic.currentTime = MUSIC_START_OFFSETS[mood];
    activeMusic.volume = MUSIC_LEVELS[mood];
    void activeMusic.play().catch(() => {
      // A later pointer or key gesture retries playback.
    });
    return;
  }

  if (activeMusic !== target) {
    crossfadeTo(target, MUSIC_LEVELS[mood], MUSIC_START_OFFSETS[mood]);
    return;
  }

  activeMusic.volume = MUSIC_LEVELS[mood];
  void activeMusic.play().catch(() => {
    // A later pointer or key gesture retries playback.
  });
}

export function setMusicMood(mood: MusicMood, muted = false): void {
  currentMood = mood;
  if (muted) return;
  startMusic(false, mood);
}

export function setMuted(muted: boolean): void {
  for (const track of Object.values(musicTracks)) {
    if (!track) continue;
    track.muted = muted;
    if (muted) track.pause();
  }
  if (!muted) startMusic(false, currentMood);
  if (muted) {
    activeEffects.forEach(({ audio }) => audio.pause());
    activeEffects = [];
  }
}

export function playSound(name: SoundName, muted: boolean, intensity = 1): void {
  if (muted || typeof Audio === 'undefined') return;

  const sameSound = activeEffects.filter((entry) => entry.name === name);
  const overlapLimit = name === 'reelStop' || name === 'lock' ? 3 : name === 'button' ? 2 : 1;
  while (sameSound.length >= overlapLimit) {
    const oldest = sameSound.shift();
    if (!oldest) break;
    oldest.audio.pause();
    activeEffects = activeEffects.filter((entry) => entry !== oldest);
  }

  const template = templates[name] ?? new Audio(`${AUDIO_BASE}${EFFECTS[name]}`);
  templates[name] = template;
  const audio = template.cloneNode(true) as HTMLAudioElement;
  audio.volume = Math.min(0.72, BASE_VOLUMES[name] * Math.max(0.45, intensity));

  // Only non-musical cabinet actions vary in pitch. Musical wins remain in key.
  if (name === 'reelStop') {
    audio.playbackRate = 0.978 + Math.random() * 0.044;
    audio.preservesPitch = false;
  } else if (name === 'lock') {
    audio.playbackRate = 0.985 + Math.random() * 0.03;
    audio.preservesPitch = false;
  } else if (name === 'button') {
    audio.playbackRate = 0.99 + Math.random() * 0.02;
    audio.preservesPitch = false;
  }

  const active = { audio, name };
  activeEffects.push(active);
  const remove = () => {
    activeEffects = activeEffects.filter((candidate) => candidate !== active);
  };
  audio.addEventListener('ended', remove, { once: true });
  audio.addEventListener('error', remove, { once: true });
  void audio.play().catch(remove);
}

export function duckMusic(strength = 0.46, duration = 850): void {
  if (!activeMusic || activeMusic.paused) return;
  if (musicDuck) clearInterval(musicDuck);
  const target = MUSIC_LEVELS[currentMood];
  const floor = Math.max(0.18, Math.min(0.85, strength));
  activeMusic.volume = target * floor;
  const started = Date.now();
  musicDuck = setInterval(() => {
    if (!activeMusic) return;
    const progress = Math.min(1, (Date.now() - started) / duration);
    activeMusic.volume = target * (floor + (1 - floor) * (1 - Math.pow(1 - progress, 2)));
    if (progress < 1) return;
    if (musicDuck) clearInterval(musicDuck);
    musicDuck = null;
  }, 34);
}

function crossfadeTo(next: HTMLAudioElement, targetVolume: number, startAt: number): void {
  const previous = activeMusic;
  if (musicFade) clearInterval(musicFade);
  musicTransitionCount += 1;
  next.currentTime = startAt;
  next.volume = 0;
  activeMusic = next;
  void next.play().catch(() => {});

  let step = 0;
  const steps = 46;
  const previousVolume = previous?.volume ?? 0;
  musicFade = setInterval(() => {
    step += 1;
    const progress = Math.min(1, step / steps);
    next.volume = targetVolume * Math.sin((progress * Math.PI) / 2);
    if (previous && previous !== next) {
      previous.volume = previousVolume * Math.cos((progress * Math.PI) / 2);
    }
    if (progress < 1) return;

    if (previous && previous !== next) {
      previous.pause();
      previous.currentTime = 0;
    }
    if (musicFade) clearInterval(musicFade);
    musicFade = null;
  }, 34);
}

export function getAudioDebugState(): {
  mood: MusicMood;
  transitions: number;
  active: boolean;
} {
  return {
    mood: currentMood,
    transitions: musicTransitionCount,
    active: Boolean(activeMusic && !activeMusic.paused),
  };
}
