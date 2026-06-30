"""Build and verify self-contained Stake release folders for The Inheritance.

RTP editions share deterministic compressed books but use profile-specific lookup
weights and configuration. This module copies the exact shared books into every
release folder so each selected RTP edition can be delivered independently.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any


GAME_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = GAME_DIR / "library"
PUBLISH_DIR = LIBRARY_DIR / "publish_files"
PROFILE_ROOT = LIBRARY_DIR / "rtp_profiles"
CONFIG_DIR = LIBRARY_DIR / "configs"
RELEASE_ROOT = LIBRARY_DIR / "release"

GAME_ID = "2_0_The_Inheritance"
MODES = ("base", "scatter_boost", "bonus")


def sha256(path: Path) -> str:
    """Return the SHA-256 hash for a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: Path) -> Path:
    """Return a required file or raise a clear packaging error."""
    if not path.is_file():
        raise FileNotFoundError(f"Missing required release artifact: {path}")
    return path


def copy_required(source: Path, destination: Path) -> None:
    """Copy an artifact while ensuring the source exists."""
    shutil.copy2(require_file(source), destination)


def _copy_profile_files(profile_dir: Path, release_dir: Path) -> None:
    profile_files = [
        "config.json",
        f"config_fe_{GAME_ID}.json",
        "math_config.json",
        "index.json",
        "profile.json",
        *[f"lookUpTable_{mode}_0.csv" for mode in MODES],
    ]
    for filename in profile_files:
        copy_required(profile_dir / filename, release_dir / filename)

    # config.json refers to fe_config.json. Keep the SDK-named file too, and
    # add this exact alias so the package is internally resolvable.
    copy_required(profile_dir / f"config_fe_{GAME_ID}.json", release_dir / "fe_config.json")


def _copy_shared_files(release_dir: Path) -> None:
    for mode in MODES:
        copy_required(PUBLISH_DIR / f"books_{mode}.jsonl.zst", release_dir / f"books_{mode}.jsonl.zst")

    for mode in MODES:
        copy_required(CONFIG_DIR / f"event_config_{mode}.json", release_dir / f"event_config_{mode}.json")
        copy_required(
            CONFIG_DIR / f"books_{mode}.verification.json",
            release_dir / f"books_{mode}.verification.json",
        )


def _file_record(path: Path) -> dict[str, Any]:
    require_file(path)
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def _read_json(path: Path) -> dict[str, Any]:
    with require_file(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_release_package(release_dir: Path) -> dict[str, Any]:
    """Validate that a release folder resolves every required static artifact."""
    index = _read_json(release_dir / "index.json")
    config = _read_json(release_dir / "config.json")
    profile = _read_json(release_dir / "profile.json")

    index_modes = {entry["name"]: entry for entry in index.get("modes", [])}
    if set(index_modes) != set(MODES):
        raise AssertionError(f"Release index has unexpected modes: {sorted(index_modes)}")

    for mode in MODES:
        entry = index_modes[mode]
        require_file(release_dir / entry["events"])
        require_file(release_dir / entry["weights"])

    frontend_file = config.get("frontendConfig", {}).get("file")
    if not frontend_file:
        raise AssertionError("Release config.json does not declare frontendConfig.file.")
    require_file(release_dir / frontend_file)

    config_modes = {entry["name"]: entry for entry in config.get("bookShelfConfig", [])}
    if set(config_modes) != set(MODES):
        raise AssertionError(f"Release config has unexpected modes: {sorted(config_modes)}")

    for mode in MODES:
        entry = config_modes[mode]
        table = entry["tables"][0]
        table_path = require_file(release_dir / table["file"])
        if sha256(table_path) != table["sha256"]:
            raise AssertionError(f"{mode} lookup hash does not match config.json.")

        books_file = entry["booksFile"]
        books_path = require_file(release_dir / books_file["file"])
        if sha256(books_path) != books_file["sha256"]:
            raise AssertionError(f"{mode} books hash does not match config.json.")

    for mode in MODES:
        require_file(release_dir / f"event_config_{mode}.json")
        require_file(release_dir / f"books_{mode}.verification.json")

    return {
        "profile": profile.get("profile"),
        "targetRtp": profile.get("targetRtp"),
        "validatedAt": datetime.now(timezone.utc).isoformat(),
        "files": [_file_record(path) for path in sorted(release_dir.iterdir()) if path.is_file()],
    }


def build_release_package(percentage: int) -> tuple[Path, dict[str, Any]]:
    """Build a self-contained release folder for one RTP percentage."""
    profile_name = f"rtp_{percentage}"
    profile_dir = PROFILE_ROOT / profile_name
    require_file(profile_dir / "profile.json")

    release_dir = RELEASE_ROOT / profile_name
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True, exist_ok=True)

    _copy_profile_files(profile_dir, release_dir)
    _copy_shared_files(release_dir)

    validation = validate_release_package(release_dir)
    release_manifest = {
        "manifestVersion": 1,
        "gameId": GAME_ID,
        "rtpProfile": profile_name,
        "artifactPolicy": (
            "Self-contained export. Compressed books are byte-identical across RTP editions, "
            "while each package includes the matching RTP-specific lookup weights and config files."
        ),
        **validation,
    }
    with (release_dir / "release_manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(release_manifest, handle, indent=2)

    # Validate once more with the final manifest included in the directory.
    validation = validate_release_package(release_dir)
    return release_dir, validation


def build_release_packages(percentages: list[int] | tuple[int, ...]) -> list[dict[str, Any]]:
    """Build and validate one self-contained package for every requested RTP edition."""
    results = []
    for percentage in percentages:
        release_dir, validation = build_release_package(percentage)
        results.append(
            {
                "profile": f"rtp_{percentage}",
                "path": str(release_dir.relative_to(GAME_DIR)),
                "validation": validation,
            }
        )
    return results
