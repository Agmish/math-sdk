import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const publicRoot = join(repoRoot, 'public');

type AssetEntry = {
  path: string;
};

type AssetManifest = {
  images: AssetEntry[];
  tileAssets: AssetEntry[];
  audioManifest: string;
};

type AudioManifest = {
  music: Record<string, string>;
  effects: Record<string, string>;
  voices: Record<string, string>;
};

function localPath(publicPath: string): string {
  return join(publicRoot, publicPath.replace(/^\//, ''));
}

function wavDataChunk(buffer: Buffer): { offset: number; length: number } {
  let chunkOffset = 12;
  while (chunkOffset + 8 <= buffer.length) {
    const name = buffer.subarray(chunkOffset, chunkOffset + 4).toString('ascii');
    const length = buffer.readUInt32LE(chunkOffset + 4);
    if (name === 'data') return { offset: chunkOffset + 8, length };
    chunkOffset += 8 + length + (length % 2);
  }
  throw new Error('WAV data chunk is missing');
}

describe('runtime asset manifests', () => {
  it('references only existing local image files', () => {
    const manifest = JSON.parse(
      readFileSync(join(publicRoot, 'assets', 'asset_manifest.json'), 'utf8'),
    ) as AssetManifest;
    const entries = [...manifest.images, ...manifest.tileAssets];

    for (const entry of entries) {
      expect(entry.path).not.toMatch(/^https?:\/\//);
      expect(existsSync(localPath(entry.path))).toBe(true);
    }
  });

  it('references only existing local audio files with valid containers', () => {
    const manifest = JSON.parse(
      readFileSync(join(publicRoot, 'assets', 'audio_manifest.json'), 'utf8'),
    ) as AudioManifest;
    const audioPaths = [
      ...Object.values(manifest.music),
      ...Object.values(manifest.effects),
      ...Object.values(manifest.voices),
    ];

    for (const audioPath of audioPaths) {
      expect(audioPath).not.toMatch(/^https?:\/\//);
      expect(existsSync(localPath(audioPath))).toBe(true);
      const header = readFileSync(localPath(audioPath));
      if (audioPath.endsWith('.wav')) {
        expect(header.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(header.readUInt16LE(22)).toBe(2);
        expect(header.readUInt32LE(24)).toBe(44_100);
        const data = wavDataChunk(header);
        const sampleCount = data.length / 2;
        let absoluteTotal = 0;
        let peak = 0;
        const dataEnd = Math.min(header.length, data.offset + data.length);
        for (let offset = data.offset; offset + 1 < dataEnd; offset += 2) {
          const sample = Math.abs(header.readInt16LE(offset)) / 32_768;
          absoluteTotal += sample;
          peak = Math.max(peak, sample);
        }
        expect(sampleCount / 2 / 44_100).toBeGreaterThan(0.1);
        expect(absoluteTotal / sampleCount).toBeGreaterThan(0.005);
        expect(peak).toBeGreaterThan(0.15);
        expect(peak).toBeLessThan(0.9);
      } else {
        expect(audioPath.endsWith('.ogg')).toBe(true);
        expect(header.subarray(0, 4).toString('ascii')).toBe('OggS');
        expect(header.length).toBeGreaterThan(200_000);
      }
    }
    expect(Object.keys(manifest.effects)).toHaveLength(20);
    expect(Object.keys(manifest.music)).toHaveLength(5);
  });
});
