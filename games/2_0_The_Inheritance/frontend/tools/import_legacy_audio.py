"""Prepare the user-provided audio from the earlier Inheritance build.

The full score is rotated and crossfaded into a seamless loop without changing
its composition. The two matching effects are converted to runtime WAV files
and loudness-normalized for predictable browser playback.
"""

from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-audio"
OUTPUT = ROOT / "public" / "assets" / "audio"
OUTPUT.mkdir(parents=True, exist_ok=True)


def discover_binary(name: str) -> str:
    configured = os.environ.get(f"{name.upper()}_PATH")
    if configured and Path(configured).is_file():
        return configured
    installed = shutil.which(name)
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
                / f"{name}.exe"
            )
        ),
        reverse=True,
    )
    if candidates:
        return candidates[0]
    raise RuntimeError(f"{name} is required; set {name.upper()}_PATH.")


def duration_seconds(path: Path, ffprobe: str) -> float:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def prepare_music(ffmpeg: str, ffprobe: str) -> None:
    source = SOURCE / "The Inheritance.mp3"
    duration = duration_seconds(source, ffprobe)
    rotation = min(8.0, duration / 8.0)
    crossfade = min(6.0, rotation * 0.75)
    filter_graph = (
        f"[0:a:0]atrim=start={rotation}:end={duration},asetpts=PTS-STARTPTS[main];"
        f"[1:a:0]atrim=start=0:end={rotation},asetpts=PTS-STARTPTS[head];"
        f"[main][head]acrossfade=d={crossfade}:c1=tri:c2=tri,"
        "loudnorm=I=-17:TP=-1.5:LRA=9[out]"
    )
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-i",
            str(source),
            "-filter_complex",
            filter_graph,
            "-map",
            "[out]",
            "-c:a",
            "libvorbis",
            "-q:a",
            "6",
            "-ar",
            "48000",
            str(OUTPUT / "music-inheritance.ogg"),
        ],
        check=True,
    )


def prepare_effect(source_name: str, output_name: str, ffmpeg: str, target_loudness: int) -> None:
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(SOURCE / source_name),
            "-map",
            "0:a:0",
            "-af",
            f"loudnorm=I={target_loudness}:TP=-2:LRA=7,aresample=44100",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(OUTPUT / output_name),
        ],
        check=True,
    )


def main() -> None:
    ffmpeg = discover_binary("ffmpeg")
    ffprobe = discover_binary("ffprobe")
    prepare_music(ffmpeg, ffprobe)
    prepare_effect("Inheritance Spin.mp3", "spin-whisper.wav", ffmpeg, -19)
    prepare_effect("scatter landing.mp3", "omen-tease.wav", ffmpeg, -17)
    print("Imported the earlier Inheritance score, spin and scatter audio.")


if __name__ == "__main__":
    main()
