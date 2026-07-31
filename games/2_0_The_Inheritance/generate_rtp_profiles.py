"""Generate, verify, and package selectable RTP editions for The Inheritance."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys


GAME_DIR = Path(__file__).resolve().parent
REPO_ROOT = GAME_DIR.parents[1]
for import_path in (str(GAME_DIR), str(REPO_ROOT)):
    if import_path not in sys.path:
        sys.path.insert(0, import_path)

from game_config import GameConfig  # noqa: E402
from game_optimization import OptimizationSetup  # noqa: E402
from gamestate import GameState  # noqa: E402
from optimization_program.run_script import OptimizationExecution  # noqa: E402
from release_package import build_release_packages  # noqa: E402
from rtp_profiles import (  # noqa: E402
    DEFAULT_RTP_PERCENTAGE,
    RTP_ENV_VAR,
    SUPPORTED_RTP_PERCENTAGES,
)
from src.write_data.write_configs import generate_configs  # noqa: E402


MODES = ("base", "scatter_boost", "bonus")
LIBRARY_DIR = GAME_DIR / "library"
PROFILE_ROOT = LIBRARY_DIR / "rtp_profiles"
REPORT_PATH = GAME_DIR / "docs" / "RTP_PROFILE_VALIDATION.json"
STATIC_ARTIFACT_MANIFEST_PATH = GAME_DIR / "docs" / "STATIC_RELEASE_ARTIFACT_MANIFEST.json"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def lookup_metrics(path: Path, cost: float) -> dict[str, float | int]:
    total_weight = 0
    weighted_payout = 0
    hit_weight = 0
    max_payout = 0
    rows = 0

    with path.open(newline="", encoding="utf-8") as handle:
        for book_id, weight, payout_cents in csv.reader(handle):
            del book_id
            parsed_weight = int(weight)
            payout = int(payout_cents) / 100
            total_weight += parsed_weight
            weighted_payout += parsed_weight * payout
            if payout > 0:
                hit_weight += parsed_weight
            max_payout = max(max_payout, payout)
            rows += 1

    average_payout = weighted_payout / total_weight
    return {
        "rows": rows,
        "rtp": average_payout / cost,
        "hitRate": hit_weight / total_weight,
        "maxPayoutMultiplier": max_payout,
        "totalWeight": total_weight,
    }


def copy_profile_artifacts(game: GameState, percentage: int) -> Path:
    destination = PROFILE_ROOT / f"rtp_{percentage}"
    destination.mkdir(parents=True, exist_ok=True)

    files = [
        game.output_files.configs["paths"]["be_config"],
        game.output_files.configs["paths"]["fe_config"],
        game.output_files.configs["paths"]["math_config"],
        game.output_files.configs["paths"]["manifest"],
    ]
    for mode in MODES:
        files.append(game.output_files.lookups[mode]["paths"]["optimized_lookup"])

    for raw_path in files:
        source = Path(raw_path)
        shutil.copy2(source, destination / source.name)
    return destination


def restore_profile(game: GameState, percentage: int) -> None:
    source = PROFILE_ROOT / f"rtp_{percentage}"
    config_destinations = {
        "config.json": Path(game.output_files.configs["paths"]["be_config"]),
        f"config_fe_{game.config.game_id}.json": Path(game.output_files.configs["paths"]["fe_config"]),
        "math_config.json": Path(game.output_files.configs["paths"]["math_config"]),
        "index.json": Path(game.output_files.configs["paths"]["manifest"]),
    }
    for filename, destination in config_destinations.items():
        shutil.copy2(source / filename, destination)
    for mode in MODES:
        destination = Path(game.output_files.lookups[mode]["paths"]["optimized_lookup"])
        shutil.copy2(source / destination.name, destination)


def build_profile(percentage: int, threads: int) -> tuple[GameState, dict]:
    os.environ[RTP_ENV_VAR] = str(percentage)
    GameConfig._instance = None
    config = GameConfig()
    game = GameState(config)
    OptimizationSetup(config)
    generate_configs(game)
    OptimizationExecution.run_all_modes(config, MODES, threads)
    generate_configs(game)

    destination = copy_profile_artifacts(game, percentage)
    mode_report = {}
    for bet_mode in config.bet_modes:
        mode = bet_mode.get_name()
        lookup = destination / f"lookUpTable_{mode}_0.csv"
        metrics = lookup_metrics(lookup, float(bet_mode.get_cost()))
        target = float(bet_mode.get_rtp())
        metrics["targetRtp"] = target
        metrics["absoluteError"] = abs(float(metrics["rtp"]) - target)
        metrics["lookupSha256"] = file_sha256(lookup)
        mode_report[mode] = metrics

    metadata = {
        "profile": f"rtp_{percentage}",
        "targetRtp": config.rtp,
        "sharedBooks": [f"books_{mode}.jsonl.zst" for mode in MODES],
        "modes": mode_report,
    }
    with (destination / "profile.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    return game, metadata


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profiles",
        nargs="+",
        type=int,
        default=list(SUPPORTED_RTP_PERCENTAGES),
        choices=SUPPORTED_RTP_PERCENTAGES,
    )
    parser.add_argument("--threads", type=int, default=max(1, min(12, os.cpu_count() or 1)))
    parser.add_argument(
        "--active-profile",
        type=int,
        default=DEFAULT_RTP_PERCENTAGE,
        choices=SUPPORTED_RTP_PERCENTAGES,
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reports = []
    last_game = None
    for percentage in args.profiles:
        print(f"Generating The Inheritance RTP {percentage}%")
        last_game, report = build_profile(percentage, args.threads)
        reports.append(report)

    if args.active_profile not in args.profiles:
        raise ValueError("The active profile must be included in --profiles.")
    restore_profile(last_game, args.active_profile)
    os.environ[RTP_ENV_VAR] = str(args.active_profile)

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "activeProfile": f"rtp_{args.active_profile}",
        "profiles": reports,
        "note": "Generated books are shared; each RTP edition has separate optimized lookup weights and configs.",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(output, handle, indent=2)
    print(f"Wrote {REPORT_PATH}")

    from dev_static_release_artifact_test import build_manifest, normalized_json  # noqa: PLC0415

    STATIC_ARTIFACT_MANIFEST_PATH.write_text(
        normalized_json(build_manifest()),
        encoding="utf-8",
    )
    print(f"Wrote {STATIC_ARTIFACT_MANIFEST_PATH}")

    release_packages = build_release_packages(args.profiles)
    print("Validated standalone RTP release packages:")
    for package in release_packages:
        print(f"- {package['profile']}: {package['path']}")


if __name__ == "__main__":
    main()
