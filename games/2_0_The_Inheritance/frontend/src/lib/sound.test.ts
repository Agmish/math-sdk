import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAudioDebugState,
  preloadAudio,
  setMusicMood,
  startMusic,
} from './sound';

class FakeAudio {
  src: string;
  loop = false;
  preload = '';
  volume = 0;
  currentTime = 0;
  paused = true;
  muted = false;
  playbackRate = 1;
  preservesPitch = true;

  constructor(src = '') {
    this.src = src;
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  cloneNode(): FakeAudio {
    return new FakeAudio(this.src);
  }

  addEventListener(): void {}
}

describe('adaptive score', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('crossfades when a feature changes chapter', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    preloadAudio();
    startMusic(false, 'base');
    setMusicMood('will');
    setMusicMood('vault');
    setMusicMood('seance');
    vi.runAllTimers();

    const state = getAudioDebugState();
    expect(state.mood).toBe('seance');
    expect(state.transitions).toBeGreaterThanOrEqual(3);
    expect(state.active).toBe(true);
    vi.unstubAllGlobals();
  });
});
