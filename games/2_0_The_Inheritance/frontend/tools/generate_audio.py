"""Compose and master the complete original Blackthorn Estate audio suite.

The score and effects are rendered from deterministic synthesis instead of
third-party samples.  The palette is intentionally restrained and cinematic:
felt piano, chamber strings, harp, celesta, distant choir, antique mechanics,
paper, wood, brass and the low resonance of the estate itself.
"""

from __future__ import annotations

import glob
import math
import os
import random
import shutil
import struct
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets" / "audio"
WORK = ROOT / "work" / "audio-render"
MUSIC_RATE = 32_000
EFFECT_RATE = 44_100
OUTPUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)


def midi(note: float) -> float:
    return 440.0 * 2.0 ** ((note - 69.0) / 12.0)


def equal_power_pan(pan: float) -> tuple[float, float]:
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def moving_average(values: np.ndarray, width: int) -> np.ndarray:
    if width <= 1:
        return values.copy()
    padded = np.pad(values, (width, width), mode="reflect")
    cumulative = np.cumsum(np.insert(padded, 0, 0.0))
    averaged = (cumulative[width:] - cumulative[:-width]) / width
    return averaged[width : width + len(values)]


def envelope(
    length: int,
    rate: int,
    attack: float,
    decay: float,
    sustain: float,
    release: float,
) -> np.ndarray:
    if length <= 0:
        return np.zeros(0, dtype=np.float64)
    attack_n = min(length, max(1, int(attack * rate)))
    release_n = min(length - attack_n, max(1, int(release * rate)))
    decay_n = min(length - attack_n - release_n, max(0, int(decay * rate)))
    sustain_n = max(0, length - attack_n - decay_n - release_n)
    pieces = [np.linspace(0.0, 1.0, attack_n, endpoint=False)]
    if decay_n:
        pieces.append(np.linspace(1.0, sustain, decay_n, endpoint=False))
    if sustain_n:
        pieces.append(np.full(sustain_n, sustain))
    if release_n:
        pieces.append(np.linspace(sustain, 0.0, release_n))
    result = np.concatenate(pieces)
    if len(result) < length:
        result = np.pad(result, (0, length - len(result)))
    return result[:length]


def oscillator(
    frequency: float,
    duration: float,
    rate: int,
    harmonics: tuple[tuple[float, float], ...],
    vibrato_rate: float = 0.0,
    vibrato_depth: float = 0.0,
    detune_cents: float = 0.0,
    phase_offset: float = 0.0,
) -> np.ndarray:
    length = max(1, int(duration * rate))
    time = np.arange(length, dtype=np.float64) / rate
    frequency *= 2.0 ** (detune_cents / 1200.0)
    vibrato = vibrato_depth * np.sin(2.0 * math.pi * vibrato_rate * time + phase_offset)
    phase = 2.0 * math.pi * frequency * time + vibrato
    result = np.zeros(length, dtype=np.float64)
    for ratio, amplitude in harmonics:
        result += amplitude * np.sin(phase * ratio + phase_offset * ratio)
    return result


@dataclass
class Mix:
    duration: float
    rate: int
    wrap: bool = False

    def __post_init__(self) -> None:
        self.data = np.zeros((int(self.duration * self.rate), 2), dtype=np.float64)

    def add(self, audio: np.ndarray, start: float, gain: float = 1.0, pan: float = 0.0) -> None:
        if audio.ndim == 1:
            left, right = equal_power_pan(pan)
            stereo = np.column_stack((audio * left, audio * right))
        else:
            stereo = audio
        stereo = stereo * gain
        first = int(round(start * self.rate))
        if self.wrap:
            for offset in range(0, len(stereo), len(self.data)):
                chunk = stereo[offset : offset + len(self.data)]
                indices = (np.arange(len(chunk)) + first + offset) % len(self.data)
                np.add.at(self.data[:, 0], indices, chunk[:, 0])
                np.add.at(self.data[:, 1], indices, chunk[:, 1])
            return
        source_start = max(0, -first)
        destination_start = max(0, first)
        count = min(len(stereo) - source_start, len(self.data) - destination_start)
        if count > 0:
            self.data[destination_start : destination_start + count] += stereo[source_start : source_start + count]

    def note(
        self,
        start: float,
        duration: float,
        note: float,
        velocity: float,
        instrument: str,
        pan: float = 0.0,
        seed: int = 0,
    ) -> None:
        self.add(
            instrument_sample(instrument, midi(note), duration, self.rate, seed),
            start,
            velocity,
            pan,
        )


def instrument_sample(name: str, frequency: float, duration: float, rate: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    length = max(1, int(duration * rate))
    time = np.arange(length, dtype=np.float64) / rate

    if name == "felt-piano":
        body = oscillator(
            frequency,
            duration,
            rate,
            ((1.0, 1.0), (2.003, 0.34), (3.01, 0.16), (4.04, 0.07), (5.12, 0.03)),
            detune_cents=-0.8,
            phase_offset=rng.uniform(0, math.pi),
        )
        decay = np.exp(-time * (1.45 + frequency / 420.0))
        hammer = moving_average(rng.normal(0, 1, length), max(2, int(rate / 8_000)))
        hammer *= np.exp(-time * 62.0) * 0.11
        return (body * decay + hammer) * envelope(length, rate, 0.004, 0.08, 0.7, min(0.42, duration * 0.38))

    if name in {"violin", "viola", "cello", "strings"}:
        brightness = {"violin": 1.0, "viola": 0.82, "cello": 0.64, "strings": 0.75}[name]
        harmonics = tuple((float(index), brightness / (index ** 1.45)) for index in range(1, 9))
        voices = np.zeros(length)
        for voice, cents in enumerate((-7.0, -2.0, 2.5, 6.5)):
            voices += oscillator(
                frequency,
                duration,
                rate,
                harmonics,
                vibrato_rate=4.7 + voice * 0.18,
                vibrato_depth=0.018 + voice * 0.002,
                detune_cents=cents,
                phase_offset=rng.uniform(0, math.pi),
            ) * (0.25 if name != "strings" else 0.22)
        bow = moving_average(rng.normal(0, 1, length), max(3, int(rate / 4_500))) * 0.017
        env = envelope(length, rate, 0.18 if name != "cello" else 0.13, 0.25, 0.76, min(0.58, duration * 0.35))
        return (voices + bow) * env

    if name == "pizzicato":
        body = oscillator(
            frequency,
            duration,
            rate,
            ((1.0, 1.0), (2.0, 0.42), (3.0, 0.18), (4.0, 0.08)),
            detune_cents=rng.uniform(-2, 2),
        )
        finger = moving_average(rng.normal(0, 1, length), 5) * np.exp(-time * 52.0) * 0.09
        return (body * np.exp(-time * 5.2) + finger) * envelope(length, rate, 0.002, 0.03, 0.75, 0.16)

    if name == "harp":
        partials = ((1.0, 1.0), (2.01, 0.31), (3.03, 0.15), (4.08, 0.08), (5.2, 0.035))
        body = oscillator(frequency, duration, rate, partials, detune_cents=rng.uniform(-1.8, 1.8))
        decay = np.exp(-time * (2.3 + frequency / 900.0))
        nail = moving_average(rng.normal(0, 1, length), 4) * np.exp(-time * 90.0) * 0.07
        return (body * decay + nail) * envelope(length, rate, 0.002, 0.05, 0.72, min(0.35, duration * 0.3))

    if name == "celesta":
        body = oscillator(
            frequency,
            duration,
            rate,
            ((1.0, 1.0), (2.01, 0.43), (3.98, 0.21), (5.42, 0.11), (6.79, 0.06)),
            detune_cents=rng.uniform(-1.2, 1.2),
        )
        return body * np.exp(-time * 2.7) * envelope(length, rate, 0.002, 0.04, 0.72, min(0.48, duration * 0.34))

    if name == "choir":
        voices = np.zeros(length)
        formants = ((1.0, 0.8), (2.0, 0.34), (3.0, 0.2), (4.0, 0.1), (5.0, 0.05))
        for voice, cents in enumerate((-9.0, -3.0, 3.5, 8.0)):
            voices += oscillator(
                frequency,
                duration,
                rate,
                formants,
                vibrato_rate=4.1 + voice * 0.13,
                vibrato_depth=0.011,
                detune_cents=cents,
                phase_offset=rng.uniform(0, math.pi),
            ) * 0.22
        breath = moving_average(rng.normal(0, 1, length), max(4, int(rate / 2_200))) * 0.025
        vowel = 0.84 + 0.16 * np.sin(2 * math.pi * 0.11 * time + rng.uniform(0, math.pi))
        return (voices * vowel + breath) * envelope(length, rate, 0.48, 0.3, 0.82, min(0.75, duration * 0.38))

    if name == "bass":
        body = oscillator(frequency, duration, rate, ((1.0, 1.0), (2.0, 0.23), (3.0, 0.08)))
        return body * envelope(length, rate, 0.08, 0.18, 0.78, min(0.45, duration * 0.3))

    if name == "timpani":
        phase = 2 * math.pi * (frequency * time + 0.5 * (-frequency * 0.18 / max(duration, 0.1)) * time**2)
        body = np.sin(phase) + 0.28 * np.sin(phase * 1.52)
        strike = moving_average(rng.normal(0, 1, length), 7) * np.exp(-time * 34) * 0.22
        return (body * np.exp(-time * 2.4) + strike) * envelope(length, rate, 0.003, 0.06, 0.8, min(0.32, duration * 0.25))

    raise ValueError(f"Unknown instrument: {name}")


def add_room_reverb(audio: np.ndarray, rate: int, circular: bool, amount: float) -> np.ndarray:
    dry = audio.copy()
    result = dry.copy()
    taps = ((0.071, 0.22), (0.109, 0.17), (0.173, 0.13), (0.241, 0.09), (0.337, 0.055))
    for delay, gain in taps:
        offset = int(delay * rate)
        if circular:
            shifted = np.roll(dry, offset, axis=0)
        else:
            shifted = np.zeros_like(dry)
            shifted[offset:] = dry[:-offset]
        result[:, 0] += shifted[:, 1] * gain * amount
        result[:, 1] += shifted[:, 0] * gain * amount
    return result


def master(audio: np.ndarray, rate: int, *, music: bool, circular: bool = False) -> np.ndarray:
    audio = audio - np.mean(audio, axis=0, keepdims=True)
    audio = add_room_reverb(audio, rate, circular, 0.86 if music else 0.62)
    audio = np.tanh(audio * 1.08) / math.tanh(1.08)
    if not circular:
        fade = min(len(audio) // 2, int(rate * 0.012))
        if fade:
            audio[:fade] *= np.linspace(0, 1, fade)[:, None]
            audio[-fade:] *= np.linspace(1, 0, fade)[:, None]
    rms = math.sqrt(float(np.mean(audio**2))) or 1.0
    target_rms = 0.105 if music else 0.118
    audio *= target_rms / rms
    peak = float(np.max(np.abs(audio))) or 1.0
    if peak > 0.88:
        audio *= 0.88 / peak
    return audio


def write_wav(path: Path, audio: np.ndarray, rate: int) -> None:
    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(pcm.tobytes())


def discover_ffmpeg() -> str:
    configured = os.environ.get("FFMPEG_PATH")
    if configured and Path(configured).is_file():
        return configured
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    candidates = sorted(
        glob.glob(
            str(
                Path.home()
                / "AppData"
                / "Local"
                / "WeMod"
                / "app-*"
                / "resources"
                / "app.asar.unpacked"
                / "static"
                / "unpacked"
                / "capture"
                / "release"
                / "bin"
                / "64bit"
                / "ffmpeg.exe"
            )
        ),
        reverse=True,
    )
    if candidates:
        return candidates[0]
    raise RuntimeError("ffmpeg is required to encode the five seamless Ogg music loops; set FFMPEG_PATH.")


def encode_ogg(source: Path, target: Path, ffmpeg: str) -> None:
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-c:a",
            "libvorbis",
            "-q:a",
            "5",
            str(target),
        ],
        check=True,
    )


PROGRESSIONS: dict[str, list[tuple[int, ...]]] = {
    "base": [
        (38, 50, 53, 57, 64),
        (34, 46, 50, 53, 57),
        (31, 43, 46, 50, 57),
        (33, 45, 52, 55, 61),
        (38, 50, 53, 57, 62),
        (36, 48, 52, 55, 60),
        (34, 46, 50, 53, 57),
        (33, 45, 52, 55, 61),
    ],
    "will": [
        (38, 50, 53, 57, 64),
        (41, 53, 57, 60, 65),
        (34, 46, 50, 53, 60),
        (33, 45, 52, 55, 61),
        (38, 50, 53, 57, 62),
        (29, 41, 48, 53, 57),
        (31, 43, 50, 53, 58),
        (33, 45, 52, 55, 61),
    ],
    "vault": [
        (31, 43, 46, 50, 55),
        (30, 42, 45, 50, 54),
        (34, 46, 50, 53, 57),
        (33, 45, 49, 52, 57),
        (31, 43, 46, 50, 55),
        (36, 48, 51, 55, 60),
        (34, 46, 50, 53, 58),
        (33, 45, 49, 52, 57),
    ],
    "seance": [
        (38, 50, 53, 57, 64),
        (37, 49, 52, 56, 61),
        (41, 53, 56, 60, 65),
        (34, 46, 50, 53, 58),
        (38, 50, 53, 57, 62),
        (36, 48, 51, 55, 60),
        (34, 46, 50, 53, 57),
        (33, 45, 52, 55, 61),
    ],
    "codicil": [
        (38, 50, 53, 57, 62),
        (34, 46, 50, 53, 57),
        (41, 53, 57, 60, 65),
        (33, 45, 52, 55, 61),
        (31, 43, 46, 50, 58),
        (36, 48, 52, 55, 60),
        (34, 46, 50, 53, 60),
        (33, 45, 52, 55, 61),
    ],
}


TRACK_SETTINGS = {
    "base": (66, 1927),
    "will": (69, 1931),
    "vault": (72, 1937),
    "seance": (60, 1941),
    "codicil": (78, 1947),
}


def add_estate_ambience(mix: Mix, seed: int, strength: float, clock: bool) -> None:
    rng = np.random.default_rng(seed)
    length = len(mix.data)
    white_l = rng.normal(0, 1, length)
    white_r = rng.normal(0, 1, length)
    rain_l = white_l - moving_average(white_l, max(2, int(mix.rate * 0.004)))
    rain_r = white_r - moving_average(white_r, max(2, int(mix.rate * 0.0043)))
    wind_l = moving_average(white_l, max(4, int(mix.rate * 0.18)))
    wind_r = moving_average(white_r, max(4, int(mix.rate * 0.21)))
    mix.data[:, 0] += rain_l * strength * 0.008 + wind_l * strength * 0.21
    mix.data[:, 1] += rain_r * strength * 0.008 + wind_r * strength * 0.21
    if clock:
        for moment in np.arange(0.42, mix.duration, 1.82):
            tick = instrument_sample("celesta", midi(88), 0.13, mix.rate, seed + int(moment * 100))
            mix.add(tick, float(moment), 0.025, -0.68)
            mix.add(tick, float(moment + 0.12), 0.017, 0.61)


def compose_track(mood: str) -> np.ndarray:
    bpm, seed = TRACK_SETTINGS[mood]
    rng = random.Random(seed)
    first_movement = PROGRESSIONS[mood]
    chords = first_movement + first_movement
    beat = 60.0 / bpm
    bar = beat * 3.0
    duration = bar * len(chords)
    mix = Mix(duration, MUSIC_RATE, wrap=True)
    melody_patterns = {
        "base": (74, 72, 69, 65, 74, 72, 77, 73, 77, 74, 72, 69, 76, 74, 70, 73),
        "will": (77, 76, 72, 69, 77, 74, 70, 73, 81, 77, 76, 72, 79, 77, 74, 73),
        "vault": (67, 66, 70, 69, 67, 72, 70, 69, 70, 67, 66, 62, 72, 70, 67, 69),
        "seance": (81, 80, 77, 82, 81, 79, 77, 73, 86, 84, 81, 82, 84, 81, 79, 73),
        "codicil": (74, 77, 81, 80, 79, 82, 77, 73, 77, 81, 86, 84, 82, 81, 79, 73),
    }
    melody = melody_patterns[mood]

    add_estate_ambience(mix, seed, 1.0 if mood == "base" else 0.62, mood in {"base", "vault"})

    for bar_index, chord in enumerate(chords):
        start = bar_index * bar
        human = rng.uniform(-0.016, 0.016)
        root = chord[0]

        if mood == "seance":
            for note_index, note in enumerate(chord[1:]):
                mix.note(start - 0.09, bar + 0.58, note, 0.034, "choir", -0.38 + note_index * 0.25, seed + bar_index * 19 + note)
            mix.note(start, bar + 0.4, root, 0.047, "bass", -0.08, seed + bar_index)
        else:
            string_instrument = "strings" if mood in {"base", "codicil"} else "viola"
            for note_index, note in enumerate(chord[1:4]):
                mix.note(start - 0.05, bar + 0.42, note, 0.034 if mood != "codicil" else 0.045, string_instrument, -0.55 + note_index * 0.5, seed + bar_index * 17 + note)
            mix.note(start, bar + 0.22, root, 0.052 if mood != "codicil" else 0.068, "cello", -0.18, seed + bar_index)

        second_movement = bar_index >= len(first_movement)
        arpeggio = (2, 4, 3, 1, 2, 3) if second_movement else (1, 3, 2, 4, 3, 2)
        for pulse, chord_index in enumerate(arpeggio):
            note = chord[min(chord_index, len(chord) - 1)] + (12 if pulse in {3, 5} else 0)
            note_start = start + pulse * bar / 6.0 + human + rng.uniform(-0.012, 0.012)
            if mood == "vault":
                instrument = "pizzicato"
                velocity = 0.058
                note -= 12 if pulse % 2 == 0 else 0
            elif mood == "seance":
                instrument = "celesta"
                velocity = 0.042
                note += 12
            elif mood == "codicil":
                instrument = "harp"
                velocity = 0.064
            else:
                instrument = "felt-piano"
                velocity = 0.056 if mood == "base" else 0.062
            mix.note(note_start, beat * 1.15, note, velocity, instrument, -0.42 + pulse * 0.17, seed + bar_index * 101 + pulse)

        lead_instrument = "celesta" if mood == "seance" else "violin" if mood in {"will", "codicil"} else "felt-piano"
        lead_note = melody[bar_index]
        mix.note(start + beat * 1.42, beat * 1.22, lead_note, 0.038 if mood != "codicil" else 0.052, lead_instrument, 0.38, seed + 500 + bar_index)

        if second_movement and bar_index % 2 == 1:
            counter_note = chord[2] + 12
            counter_instrument = "celesta" if mood == "seance" else "pizzicato" if mood == "vault" else "harp"
            mix.note(start + beat * 0.68, beat * 0.9, counter_note, 0.032, counter_instrument, -0.48, seed + 640 + bar_index)

        if mood == "vault":
            mix.note(start + beat * 2.53, 0.55, root - 12, 0.035, "timpani", -0.12, seed + 700 + bar_index)
        if mood == "codicil" and bar_index in {0, 3, 4, 7}:
            mix.note(start, 1.2, root - 12, 0.064, "timpani", -0.2, seed + 800 + bar_index)
            mix.note(start + beat * 2.55, beat * 0.8, melody[bar_index] + 12, 0.035, "choir", 0.2, seed + 900 + bar_index)
        if mood == "will" and bar_index in {1, 5}:
            mix.note(start + beat * 2.18, beat, lead_note + 7, 0.031, "harp", 0.63, seed + 950 + bar_index)

    return master(mix.data, mix.rate, music=True, circular=True)


def noise_burst(duration: float, rate: int, seed: int, smooth: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1, int(duration * rate))
    if smooth > 1:
        noise = moving_average(noise, smooth)
    return noise


def chirp(duration: float, rate: int, start_frequency: float, end_frequency: float) -> np.ndarray:
    time = np.arange(int(duration * rate), dtype=np.float64) / rate
    slope = (end_frequency - start_frequency) / max(duration, 0.001)
    phase = 2 * math.pi * (start_frequency * time + 0.5 * slope * time**2)
    return np.sin(phase)


def effect_mix(duration: float) -> Mix:
    return Mix(duration, EFFECT_RATE, wrap=False)


def impact(duration: float, frequency: float, seed: int) -> np.ndarray:
    length = int(duration * EFFECT_RATE)
    time = np.arange(length) / EFFECT_RATE
    body = chirp(duration, EFFECT_RATE, frequency * 1.12, frequency * 0.78)
    wood = noise_burst(duration, EFFECT_RATE, seed, 9)
    return body * np.exp(-time * 8.2) + wood * np.exp(-time * 29.0) * 0.34


def compose_effects() -> dict[str, np.ndarray]:
    effects: dict[str, np.ndarray] = {}

    mix = effect_mix(0.94)
    length = len(mix.data)
    time = np.arange(length) / EFFECT_RATE
    whoosh = noise_burst(mix.duration, EFFECT_RATE, 1101, 5)
    air = whoosh - moving_average(whoosh, 380)
    movement = chirp(mix.duration, EFFECT_RATE, 46, 310)
    curve = envelope(length, EFFECT_RATE, 0.04, 0.16, 0.76, 0.27)
    mix.add(air * curve, 0, 0.12, -0.28)
    mix.add(air[::-1] * curve, 0, 0.08, 0.32)
    mix.add(movement * curve * (0.75 + 0.25 * np.sin(2 * math.pi * 8.2 * time)), 0, 0.09)
    effects["spin-whisper.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(0.27)
    mix.add(impact(0.27, 92, 1102), 0, 0.66)
    mix.note(0.035, 0.2, 74, 0.07, "celesta", 0.18, 1102)
    effects["reel-stop.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(0.15)
    click = impact(0.15, 155, 1103) * 0.55
    paper = noise_burst(0.15, EFFECT_RATE, 1104, 17) * np.exp(-np.arange(len(click)) / EFFECT_RATE * 38)
    mix.add(click + paper * 0.17, 0, 0.66)
    effects["button-paper.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(1.32)
    mix.add(impact(0.55, 58, 1105), 0, 0.85)
    mix.note(0.09, 1.12, 38, 0.16, "timpani", -0.15, 1105)
    for index, note in enumerate((62, 65, 69, 74)):
        mix.note(0.19 + index * 0.08, 0.95, note, 0.07, "choir", -0.46 + index * 0.29, 1110 + index)
    mix.note(0.56, 0.72, 86, 0.09, "celesta", 0.52, 1115)
    effects["wax-stamp.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(0.46)
    mix.add(impact(0.3, 72, 1116), 0, 0.75)
    mix.note(0.045, 0.31, 47, 0.14, "timpani", -0.18, 1116)
    mix.note(0.095, 0.28, 83, 0.075, "celesta", 0.35, 1117)
    effects["vault-lock.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(1.05)
    for index, note in enumerate((74, 77, 81, 86, 89)):
        mix.note(index * 0.085, 0.76, note, 0.095, "celesta", -0.55 + index * 0.27, 1120 + index)
    mix.note(0.18, 0.72, 62, 0.045, "harp", -0.2, 1129)
    effects["coin-collect.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(1.18)
    for index, note in enumerate((57, 62, 65, 69, 74, 77, 81)):
        mix.note(index * 0.105, 0.72, note, 0.07, "harp", -0.64 + index * 0.21, 1130 + index)
    mix.note(0.48, 0.65, 86, 0.065, "celesta", 0.5, 1139)
    effects["multiplier-rise.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(1.64)
    length = len(mix.data)
    rising = noise_burst(mix.duration, EFFECT_RATE, 1140, 33)
    rising *= np.linspace(0, 1, length) ** 1.6 * np.linspace(1, 0.25, length)
    mix.add(rising, 0, 0.08, -0.2)
    mix.add(chirp(mix.duration, EFFECT_RATE, 98, 285) * envelope(length, EFFECT_RATE, 0.28, 0.2, 0.58, 0.36), 0, 0.08, 0.2)
    mix.note(1.17, 0.42, 88, 0.055, "celesta", 0.55, 1141)
    effects["omen-tease.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(2.42)
    paper = noise_burst(2.1, EFFECT_RATE, 1142, 23)
    paper_env = np.sin(np.linspace(0, math.pi, len(paper))) ** 1.4
    mix.add(paper * paper_env, 0.05, 0.06, -0.45)
    for index, note in enumerate((50, 57, 62, 65, 69)):
        mix.note(0.23 + index * 0.12, 1.72, note, 0.064, "strings", -0.54 + index * 0.27, 1145 + index)
    mix.note(1.08, 1.12, 86, 0.078, "harp", 0.48, 1155)
    effects["will-open.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(2.62)
    groan = chirp(1.8, EFFECT_RATE, 66, 41) + noise_burst(1.8, EFFECT_RATE, 1160, 31) * 0.42
    mix.add(groan * np.sin(np.linspace(0, math.pi, len(groan))) ** 0.7, 0, 0.16)
    mix.add(impact(0.7, 49, 1161), 0.58, 0.78)
    for index, note in enumerate((31, 43, 50, 55)):
        mix.note(0.72 + index * 0.08, 1.55, note, 0.07, "cello", -0.45 + index * 0.28, 1165 + index)
    effects["vault-open.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(2.82)
    spectral = noise_burst(2.82, EFFECT_RATE, 1170, 72)
    spectral *= np.sin(np.linspace(0, math.pi, len(spectral))) ** 1.2
    mix.add(spectral, 0, 0.075)
    for index, note in enumerate((50, 57, 62, 65, 69)):
        mix.note(0.05 + index * 0.1, 2.45, note, 0.056, "choir", -0.58 + index * 0.29, 1175 + index)
    for index, note in enumerate((86, 89, 93)):
        mix.note(1.08 + index * 0.17, 1.1, note, 0.058, "celesta", 0.25 + index * 0.19, 1185 + index)
    effects["seance-rise.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(3.46)
    mix.note(0, 1.35, 38, 0.14, "timpani", -0.28, 1188)
    paper = noise_burst(1.72, EFFECT_RATE, 1189, 19)
    paper *= np.sin(np.linspace(0, math.pi, len(paper))) ** 1.35
    mix.add(paper, 0.18, 0.075, -0.5)
    for index, note in enumerate((50, 57, 62, 65, 69, 74, 77)):
        instrument = "cello" if index < 2 else "strings" if index < 5 else "harp"
        mix.note(0.34 + index * 0.13, 2.15, note, 0.07, instrument, -0.62 + index * 0.21, 1189 + index)
    for index, note in enumerate((50, 57, 62, 65)):
        mix.note(1.18, 1.92, note, 0.045, "choir", -0.42 + index * 0.28, 1198 + index)
    mix.note(2.08, 1.08, 89, 0.075, "celesta", 0.58, 1203)
    effects["codicil-open.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(1.84)
    paper = noise_burst(1.25, EFFECT_RATE, 1190, 15)
    paper *= np.sin(np.linspace(0, math.pi, len(paper))) ** 1.5
    mix.add(paper, 0, 0.095, -0.45)
    for index, note in enumerate((50, 57, 62, 69, 74)):
        mix.note(0.18 + index * 0.11, 1.18, note, 0.072, "harp", -0.5 + index * 0.25, 1210 + index)
    effects["chapter-turn.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(2.08)
    for index, note in enumerate((69, 74, 77, 81, 86, 89, 93)):
        mix.note(index * 0.105, 1.35, note, 0.083, "harp" if index < 4 else "celesta", -0.65 + index * 0.22, 1220 + index)
    mix.note(0.64, 1.22, 62, 0.06, "choir", 0, 1230)
    effects["retrigger.wav"] = master(mix.data, EFFECT_RATE, music=False)

    def win_cue(name: str, notes: tuple[int, ...], duration: float, strength: float, seed: int) -> None:
        cue = effect_mix(duration)
        spacing = min(0.15, duration * 0.11)
        for index, note in enumerate(notes):
            instrument = "felt-piano" if index == 0 else "harp" if index < len(notes) - 1 else "celesta"
            cue.note(index * spacing, duration * 0.72, note, strength, instrument, -0.45 + index * (0.9 / max(1, len(notes) - 1)), seed + index)
        cue.note(spacing * 1.4, duration * 0.64, notes[0] - 12, strength * 0.38, "cello", -0.12, seed + 20)
        effects[name] = master(cue.data, EFFECT_RATE, music=False)

    win_cue("win-low.wav", (62, 69), 0.78, 0.09, 1220)
    win_cue("win-chime.wav", (62, 65, 69, 74), 1.22, 0.085, 1230)
    win_cue("win-medium.wav", (57, 62, 65, 69, 74), 1.58, 0.09, 1240)
    win_cue("win-high.wav", (50, 57, 62, 65, 69, 74, 77), 2.28, 0.092, 1250)

    mix = effect_mix(3.42)
    mix.note(0, 1.25, 38, 0.13, "timpani", -0.25, 1260)
    for index, note in enumerate((50, 57, 62, 65, 69, 74, 77, 81, 86)):
        instrument = "strings" if index < 5 else "harp" if index < 8 else "celesta"
        mix.note(0.13 + index * 0.12, 2.05, note, 0.075, instrument, -0.62 + index * 0.15, 1265 + index)
    for index, note in enumerate((50, 57, 62, 65)):
        mix.note(1.12, 2.05, note, 0.052, "choir", -0.42 + index * 0.28, 1280 + index)
    effects["big-win.wav"] = master(mix.data, EFFECT_RATE, music=False)

    mix = effect_mix(6.65)
    mix.note(0, 1.5, 38, 0.15, "timpani", -0.3, 1290)
    mix.note(0.42, 1.25, 33, 0.12, "timpani", 0.28, 1291)
    fanfare = (50, 57, 62, 65, 69, 74, 77, 81, 86, 89, 93, 98)
    for index, note in enumerate(fanfare):
        instrument = "cello" if index < 3 else "strings" if index < 8 else "harp" if index < 10 else "celesta"
        mix.note(0.18 + index * 0.18, 2.65, note, 0.082, instrument, -0.68 + index * 0.12, 1295 + index)
    for index, note in enumerate((38, 50, 53, 57, 62, 65, 69)):
        mix.note(2.18, 4.05, note, 0.06, "choir" if index > 1 else "cello", -0.55 + index * 0.18, 1320 + index)
    mix.note(3.35, 2.65, 98, 0.072, "celesta", 0.58, 1330)
    effects["max-inheritance.wav"] = master(mix.data, EFFECT_RATE, music=False)

    return effects


def main() -> None:
    ffmpeg = discover_ffmpeg()
    for mood in ("base", "will", "vault", "seance", "codicil"):
        print(f"Composing {mood} score...")
        audio = compose_track(mood)
        source = WORK / f"music-{mood}.wav"
        write_wav(source, audio, MUSIC_RATE)
        encode_ogg(source, OUTPUT / f"music-{mood}.ogg", ffmpeg)

    print("Designing estate sound effects...")
    for name, audio in compose_effects().items():
        write_wav(OUTPUT / name, audio, EFFECT_RATE)

    print("Audio suite complete.")


if __name__ == "__main__":
    main()
