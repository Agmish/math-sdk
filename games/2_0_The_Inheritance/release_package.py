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
FORCES_DIR = LIBRARY_DIR / "forces"
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


def _read_json(path: Path) -> dict[str, Any]:
    with require_file(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def _file_record(path: Path) -> dict[str, Any]:
    require_file(path)
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def _force_files(config: dict[str, Any]) -> dict[str, str]:
    """Return every force artifact referenced by a generated config file."""
    references: dict[str, str] = {}
    standard = config.get("standardForceFile")
    if isinstance(standard, dict) and standard.get("file") and standard.get("sha256"):
        references[str(standard["file"])] = str(standard["sha256"])

    for mode_config in config.get("bookShelfConfig", []):
        force_file = mode_config.get("forceFile")
        if isinstance(force_file, dict) and force_file.get("file") and force_file.get("sha256"):
            references[str(force_file["file"])] = str(force_file["sha256"])
    return references


def _find_force_source(filename: str, profile_dir: Path) -> Path:
    """Locate a generated force file and reject an ambiguous result."""
    direct_candidates = (
        profile_dir / filename,
        FORCES_DIR / filename,
        CONFIG_DIR / filename,
        PUBLISH_DIR / filename,
        LIBRARY_DIR / filename,
        GAME_DIR / filename,
    )
    for candidate in direct_candidates:
        if candidate.is_file():
            return candidate

    matches = sorted(path for path in GAME_DIR.rglob(filename) if path.is_file())
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        paths = ", ".join(str(path) for path in matches)
        raise FileNotFoundError(f"Force artifact {filename} is ambiguous. Found: {paths}")

    locations = ", ".join(str(candidate) for candidate in direct_candidates)
    raise FileNotFoundError(f"Force artifact {filename} was referenced but not found. Checked: {locations}")


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

    # config.json references fe_config.json, while the SDK also generates a
    # game-named frontend config. Preserve both and validate the alias hash.
    copy_required(profile_dir / f"config_fe_{GAME_ID}.json", release_dir / "fe_config.json")


def _copy_shared_files(profile_dir: Path, release_dir: Path) -> None:
    for mode in MODES:
        copy_required(PUBLISH_DIR / f"books_{mode}.jsonl.zst", release_dir / f"books_{mode}.jsonl.zst")

    for mode in MODES:
        copy_required(CONFIG_DIR / f"event_config_{mode}.json", release_dir / f"event_config_{mode}.json")
        copy_required(
            CONFIG_DIR / f"books_{mode}.verification.json",
            release_dir / f"books_{mode}.verification.json",
        )

    profile_config = _read_json(profile_dir / "config.json")
    for filename in _force_files(profile_config):
        copy_required(_find_force_source(filename, profile_dir), release_dir / filename)


def _validate_hash(path: Path, expected_hash: str, description: str) -> None:
    actual_hash = sha256(require_file(path))
    if actual_hash != expected_hash:
        raise AssertionError(f"{description} hash does not match config.json.")


def validate_release_package(release_dir: Path) -> dict[str, Any]:
    """Validate all files and hashes required by one independent release folder."""
    index = _read_json(release_dir / "index.json")
    config = _read_json(release_dir / "config.json")
    profile = _read_json(release_dir / "profile.json")

    profile_name = str(profile.get("profile", ""))
    if profile_name != release_dir.name:
        raise AssertionError(f"Profile metadata {profile_name!r} does not match folder {release_dir.name!r}.")
    if abs(float(profile.get("targetRtp")) - float(config.get("rtp")) / 100) > 1e-12:
        raise AssertionError("Profile target RTP does not match config.json RTP.")

    index_modes = {entry["name"]: entry for entry in index.get("modes", [])}
    if set(index_modes) != set(MODES):
        raise AssertionError(f"Release index has unexpected modes: {sorted(index_modes)}")

    config_modes = {entry["name"]: entry for entry in config.get("bookShelfConfig", [])}
    if set(config_modes) != set(MODES):
        raise AssertionError(f"Release config has unexpected modes: {sorted(config_modes)}")

    frontend_config = config.get("frontendConfig", {})
    frontend_file = frontend_config.get("file")
    frontend_hash = frontend_config.get("sha256")
    if not frontend_file or not frontend_hash:
        raise AssertionError("Release config.json does not declare frontendConfig file and hash.")
    _validate_hash(release_dir / str(frontend_file), str(frontend_hash), "Frontend config")

    for mode in MODES:
        index_entry = index_modes[mode]
        config_entry = config_modes[mode]
        if float(index_entry.get("cost")) != float(config_entry.get("cost")):
            raise AssertionError(f"{mode} cost differs between index.json and config.json.")

        require_file(release_dir / str(index_entry["events"]))
        require_file(release_dir / str(index_entry["weights"]))

        table = config_entry["tables"][0]
        _validate_hash(release_dir / str(table["file"]), str(table["sha256"]), f"{mode} lookup")

        books_file = config_entry["booksFile"]
        _validate_hash(release_dir / str(books_file["file"]), str(books_file["sha256"]), f"{mode} books")

        verification_path = release_dir / f"books_{mode}.verification.json"
        verification = _read_json(verification_path)
        if verification.get("file_hash") != sha256(release_dir / str(books_file["file"])):
            raise AssertionError(f"{mode} book verification hash does not match the packaged book.")
        require_file(release_dir / f"event_config_{mode}.json")

    for filename, expected_hash in _force_files(config).items():
        _validate_hash(release_dir / filename, expected_hash, f"Force file {filename}")

    return {
        "profile": profile_name,
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
    _copy_shared_files(profile_dir, release_dir)

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

    return release_dir, validate_release_package(release_dir)


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
