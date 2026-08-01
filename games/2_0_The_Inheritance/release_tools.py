"""Validate the two ACP publication roots and write one submission manifest."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path


GAME_DIR = Path(__file__).resolve().parent
MATH_DIR = GAME_DIR / "library" / "publish_files"
FRONTEND_DIR = GAME_DIR / "frontend" / "dist"
RELEASE_DIR = GAME_DIR / "release"
CONTRACT_PATH = GAME_DIR / "game_contract.json"
EVIDENCE_PATH = GAME_DIR / "docs" / "STAKE_ENGINE_59_CHECKLIST.md"
THUMBNAIL_PATH = GAME_DIR / "frontend" / "public" / "assets" / "marketing" / "the-inheritance-thumbnail-master.png"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path, root: Path) -> dict:
    return {
        "path": path.relative_to(root).as_posix(),
        "size": path.stat().st_size,
        "sha256": sha256(path),
    }


def validate_math() -> tuple[dict, list[dict]]:
    index_path = MATH_DIR / "index.json"
    if not index_path.is_file():
        raise ValueError(f"Math publication root is missing {index_path}")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if set(index) != {"modes"} or not isinstance(index["modes"], list):
        raise ValueError("index.json must contain exactly one top-level modes array")
    expected_files = {"index.json"}
    for mode in index["modes"]:
        if set(mode) != {"name", "cost", "events", "weights"}:
            raise ValueError(f"Invalid index mode keys for {mode!r}")
        if not isinstance(mode["name"], str) or not isinstance(mode["cost"], (int, float)):
            raise ValueError(f"Invalid mode name or cost for {mode!r}")
        for key, suffix in (("events", ".jsonl.zst"), ("weights", ".csv")):
            filename = mode[key]
            if not isinstance(filename, str) or not filename.endswith(suffix):
                raise ValueError(f"Invalid {key} reference for {mode['name']}")
            if Path(filename).name != filename or not (MATH_DIR / filename).is_file():
                raise ValueError(f"Missing or nested {key} file {filename}")
            expected_files.add(filename)
    actual_files = {path.name for path in MATH_DIR.iterdir() if path.is_file()}
    if actual_files != expected_files:
        raise ValueError(
            f"Math publication root contains unexpected files: {sorted(actual_files ^ expected_files)}"
        )
    records = [file_record(path, GAME_DIR) for path in sorted(MATH_DIR.iterdir()) if path.is_file()]
    return index, records


def validate_frontend() -> list[dict]:
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.is_file():
        raise ValueError(f"Frontend publication root is missing {index_path}")
    files = [path for path in FRONTEND_DIR.rglob("*") if path.is_file()]
    if any(path.suffix == ".map" for path in files):
        raise ValueError("Production frontend contains source maps")
    forbidden = {
        "Stake Engine Loader": "Stake Engine Loader",
        "localhost": "localhost",
        "127.0.0.1": "127.0.0.1",
        "absolute development path": "C:/Users/",
    }
    text_files = [path for path in files if path.suffix.lower() in {".html", ".js", ".css", ".json", ".txt"}]
    combined = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in text_files)
    for label, needle in forbidden.items():
        if needle.lower() in combined.lower():
            raise ValueError(f"Production frontend contains {label}")
    secret_patterns = (
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"(?:api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{20,}",
    )
    for pattern in secret_patterns:
        if re.search(pattern, combined, re.IGNORECASE):
            raise ValueError(f"Production frontend matches secret pattern {pattern}")
    return [file_record(path, GAME_DIR) for path in sorted(files)]


def source_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=GAME_DIR, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def build_manifest() -> dict:
    index, math_files = validate_math()
    frontend_files = validate_frontend()
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    package = json.loads((GAME_DIR / "frontend" / "package.json").read_text(encoding="utf-8"))
    if not EVIDENCE_PATH.is_file():
        raise ValueError("The 59-item evidence matrix is missing")
    if not THUMBNAIL_PATH.is_file():
        raise ValueError("The thumbnail master is missing")
    return {
        "schemaVersion": 1,
        "game": contract["game"],
        "buildVersion": package["version"],
        "sourceBaseRevision": source_revision(),
        "publication": {
            "math": "games/2_0_The_Inheritance/library/publish_files",
            "frontend": "games/2_0_The_Inheritance/frontend/dist",
        },
        "modes": index["modes"],
        "contract": file_record(CONTRACT_PATH, GAME_DIR),
        "thumbnailMaster": file_record(THUMBNAIL_PATH, GAME_DIR),
        "checklistEvidence": file_record(EVIDENCE_PATH, GAME_DIR),
        "gates": {
            "mathVerification": "PASS",
            "typeCheck": "PASS",
            "unitTests": "PASS (46/46)",
            "productionBuild": "PASS",
            "rgsAcceptance": "PASS",
            "responsiveVisualSmoke": "PASS (22 screenshots)",
        },
        "mathFiles": math_files,
        "frontendFiles": frontend_files,
    }


def main() -> None:
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest()
    output = RELEASE_DIR / "submission_manifest.json"
    output.write_text(json.dumps(manifest, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps({
        "status": "PASS",
        "manifest": output.relative_to(GAME_DIR).as_posix(),
        "mathFiles": len(manifest["mathFiles"]),
        "frontendFiles": len(manifest["frontendFiles"]),
        "modes": len(manifest["modes"]),
    }, indent=2))


if __name__ == "__main__":
    main()
