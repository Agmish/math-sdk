"""Canonical Stake Engine release proof for The Inheritance."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / "games" / "2_0_The_Inheritance"
FRONTEND_DIR = GAME_DIR / "frontend"
FRONTEND_OUTPUT = FRONTEND_DIR / "dist"
MATH_OUTPUT = GAME_DIR / "library" / "publish_files"
SUBMISSION_MANIFEST = GAME_DIR / "release" / "submission_manifest.json"
CHECKLIST = GAME_DIR / "docs" / "STAKE_ENGINE_59_CHECKLIST.md"
ARTIFACTS = ROOT / "artifacts"

EXPECTED_MODES = {
    "BASE": 1,
    "HEIRLOOM_ANTE": 3,
    "SEALED_WILL_BUY": 80,
    "VAULT_ECHOES_BUY": 140,
    "MIDNIGHT_SEANCE_BUY": 200,
    "FINAL_CODICIL_BUY": 300,
}
OFFICIAL_REQUIREMENTS = {
    "engineSetup": "https://stakeengine.github.io/math-sdk/math_docs/general_overview/",
    "mathFormat": "https://stakeengine.github.io/math-sdk/rgs_docs/data_format/",
    "productionBooks": "https://stakeengine.github.io/math-sdk/math_docs/quickstart/",
    "frontendPublishing": "https://stakeengine.github.io/math-sdk/simple_example/simple_example/",
    "rgs": "https://stakeengine.github.io/math-sdk/rgs_docs/RGS/",
}


def run(command: list[str], *, cwd: Path = ROOT, timeout: int = 300) -> None:
    print("$ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True, timeout=timeout)


def npm_command() -> str:
    executable = shutil.which("npm")
    if not executable:
        raise RuntimeError("npm is required to verify the canonical frontend")
    return executable


def validate_publication_roots() -> dict:
    index_path = MATH_OUTPUT / "index.json"
    if not index_path.is_file():
        raise RuntimeError("Math publication root is missing index.json")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if set(index) != {"modes"} or not isinstance(index["modes"], list):
        raise RuntimeError("index.json must contain exactly one modes array")

    actual_modes = {mode.get("name"): mode.get("cost") for mode in index["modes"]}
    if actual_modes != EXPECTED_MODES:
        raise RuntimeError(f"Unexpected Stake mode contract: {actual_modes!r}")

    expected_math_files = {"index.json"}
    for mode in index["modes"]:
        if set(mode) != {"name", "cost", "events", "weights"}:
            raise RuntimeError(f"Invalid index keys for {mode!r}")
        for key, suffix in (("events", ".jsonl.zst"), ("weights", ".csv")):
            filename = mode[key]
            if not isinstance(filename, str) or not filename.endswith(suffix):
                raise RuntimeError(f"Invalid {key} filename for {mode['name']}")
            if Path(filename).name != filename:
                raise RuntimeError(f"Nested Math reference is not allowed: {filename}")
            path = MATH_OUTPUT / filename
            if not path.is_file() or path.stat().st_size == 0:
                raise RuntimeError(f"Missing or empty Math file: {filename}")
            expected_math_files.add(filename)

    actual_math_files = {path.name for path in MATH_OUTPUT.iterdir() if path.is_file()}
    if actual_math_files != expected_math_files or len(actual_math_files) != 13:
        raise RuntimeError(
            "Math root must contain only index.json and the six referenced book/CSV pairs"
        )
    if any(path.is_dir() or path.is_symlink() for path in MATH_OUTPUT.iterdir()):
        raise RuntimeError("Math publication root cannot contain nested directories or symlinks")

    frontend_index = FRONTEND_OUTPUT / "index.html"
    if not frontend_index.is_file():
        raise RuntimeError("Frontend publication root is missing index.html")
    frontend_files = [path for path in FRONTEND_OUTPUT.rglob("*") if path.is_file()]
    if len(frontend_files) != 51:
        raise RuntimeError(f"Expected 51 frontend files, found {len(frontend_files)}")
    if any(path.is_symlink() for path in FRONTEND_OUTPUT.rglob("*")):
        raise RuntimeError("Frontend publication root cannot contain symlinks")
    index_html = frontend_index.read_text(encoding="utf-8")
    if "./assets/" not in index_html:
        raise RuntimeError("Frontend index must use Vite-relative ./assets/ paths")
    if not any(path.suffix == ".js" for path in frontend_files):
        raise RuntimeError("Frontend publication root has no compiled JavaScript")

    manifest = json.loads(SUBMISSION_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("publication") != {
        "math": "games/2_0_The_Inheritance/library/publish_files",
        "frontend": "games/2_0_The_Inheritance/frontend/dist",
    }:
        raise RuntimeError("Submission manifest contains incorrect ACP publication roots")
    if manifest.get("modes") != index["modes"]:
        raise RuntimeError("Submission manifest mode contract does not match index.json")
    if len(manifest.get("mathFiles", [])) != 13 or len(manifest.get("frontendFiles", [])) != 51:
        raise RuntimeError("Submission manifest file inventory is incomplete")
    if manifest.get("game", {}).get("rtp") != 0.96:
        raise RuntimeError("Submission manifest RTP must be 96.00%")
    if manifest.get("game", {}).get("maxWin") != 15000.0:
        raise RuntimeError("Submission manifest maximum win must be 15,000x")

    checklist_rows = sum(
        1
        for line in CHECKLIST.read_text(encoding="utf-8").splitlines()
        if line.startswith("|") and line.split("|", 2)[1].strip().isdigit()
    )
    if checklist_rows != 59:
        raise RuntimeError(f"Stake evidence matrix must contain 59 rows, found {checklist_rows}")

    return {
        "status": "PASS",
        "gameId": "2_0_The_Inheritance",
        "rtp": "96.00%",
        "houseEdge": "4.00%",
        "maxWin": "15000x",
        "modes": EXPECTED_MODES,
        "outcomesPerMode": 100_000,
        "mathFiles": len(actual_math_files),
        "frontendFiles": len(frontend_files),
        "checklistRows": checklist_rows,
        "publication": manifest["publication"],
        "officialRequirements": OFFICIAL_REQUIREMENTS,
        "commit": os.getenv("GITHUB_SHA", subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()),
    }


def main() -> None:
    npm = npm_command()
    run([sys.executable, "games/2_0_The_Inheritance/run.py", "--verify-only"], timeout=900)
    run(
        [sys.executable, "-m", "unittest", "discover", "games/2_0_The_Inheritance/tests"],
        timeout=180,
    )
    for script, timeout in (
        ("check", 180),
        ("test", 180),
        ("build", 180),
        ("production:gates", 600),
        ("release:manifest", 180),
    ):
        run([npm, "run", script], cwd=FRONTEND_DIR, timeout=timeout)

    summary = validate_publication_roots()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    summary_path = ARTIFACTS / "the-inheritance-ci-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)
    print("The Inheritance canonical Stake release proof: OK", flush=True)


if __name__ == "__main__":
    main()
