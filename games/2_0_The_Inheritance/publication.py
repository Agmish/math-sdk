"""Generate the complete Stake Engine math publication deterministically."""

import argparse
import hashlib
import json
import math
import os
import pickle
import shutil
from pathlib import Path

import zstandard as zstd

from book_builder import allocate_weighted_books, build_book
from math_profile import BOOKS_PER_MODE, MODE_SPECS, RTP, TOTAL_WEIGHT, WIN_CAP


GAME_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = GAME_DIR / "library"
PUBLISH_DIR = LIBRARY_DIR / "publish_files"
CONFIG_DIR = LIBRARY_DIR / "configs"
FORCE_DIR = LIBRARY_DIR / "forces"
LOOKUP_DIR = LIBRARY_DIR / "lookup_tables"
RELEASE_DIR = GAME_DIR / "release"
CONTRACT_PATH = GAME_DIR / "game_contract.json"
FRONTEND_FIXTURE_PATH = GAME_DIR / "frontend" / "src" / "lib" / "fixtures" / "published-books.json"


def generate(book_count: int = BOOKS_PER_MODE) -> dict:
    """Build books, lookup tables, force data, configs, hashes, and release files."""
    for directory in (PUBLISH_DIR, CONFIG_DIR, FORCE_DIR, LOOKUP_DIR, RELEASE_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    _remove_stale_publication_files()

    summaries = {}
    force_index = {}
    frontend_fixtures = {}
    for mode in MODE_SPECS:
        rows = allocate_weighted_books(mode, book_count)
        books_path = PUBLISH_DIR / f"books_{mode.name}.jsonl.zst"
        lookup_path = PUBLISH_DIR / f"lookUpTable_{mode.name}_0.csv"
        base_lookup_path = LOOKUP_DIR / f"lookUpTable_{mode.name}.csv"
        payouts = []
        event_examples = {}
        criteria_books = {}
        fixture_books = []

        compressor = zstd.ZstdCompressor(level=12, threads=-1)
        with books_path.open("wb") as raw, compressor.stream_writer(raw, closefd=False) as compressed:
            lookup_lines = []
            for weighted in rows:
                book = build_book(mode, weighted)
                payout = book["payoutMultiplier"]
                payouts.append(payout)
                compressed.write((json.dumps(book, separators=(",", ":")) + "\n").encode("utf-8"))
                lookup_lines.append(f"{weighted.book_id},{weighted.weight},{payout}\n")
                criteria_books.setdefault(weighted.outcome.key, []).append(weighted.book_id)
                for event in book["events"]:
                    event_examples.setdefault(event["type"], {key: value for key, value in event.items() if key != "index"})
                fixture_categories = {item["criteria"] for item in fixture_books}
                if (
                    (book["payoutMultiplier"] == 0 and "loss" not in fixture_categories)
                    or (book["payoutMultiplier"] > 0 and "positive" not in fixture_categories)
                    or (book["payoutMultiplier"] == round(WIN_CAP * 100) and "max" not in fixture_categories)
                ):
                    category = "loss" if book["payoutMultiplier"] == 0 else "max" if book["payoutMultiplier"] == round(WIN_CAP * 100) else "positive"
                    fixture_books.append({"criteria": category, "book": book})

        lookup_text = "".join(lookup_lines)
        lookup_path.write_text(lookup_text, encoding="utf-8", newline="")
        base_lookup_path.write_text(lookup_text, encoding="utf-8", newline="")
        (CONFIG_DIR / f"event_config_{mode.name}.json").write_text(
            json.dumps(event_examples, indent=2), encoding="utf-8"
        )

        force_records = [
            {
                "search": {"criteria": criterion},
                "timesTriggered": len(book_ids),
                "bookIds": book_ids[:25],
            }
            for criterion, book_ids in sorted(criteria_books.items())
        ]
        (FORCE_DIR / f"force_record_{mode.name}.json").write_text(
            json.dumps(force_records, indent=2), encoding="utf-8"
        )
        force_index[mode.name] = {"criteria": sorted(criteria_books)}

        verification = {
            "file_hash": sha256(books_path),
            "payout_hash": hashlib.md5(pickle.dumps(payouts)).hexdigest(),
            "num_entries": len(payouts),
        }
        (CONFIG_DIR / f"books_{mode.name}.verification.json").write_text(
            json.dumps(verification, indent=2), encoding="utf-8"
        )
        summaries[mode.name] = _mode_summary(mode, rows, books_path, lookup_path)
        frontend_fixtures[mode.name] = {
            item["criteria"]: item["book"]
            for item in fixture_books
        }

    force_path = FORCE_DIR / "force.json"
    force_path.write_text(json.dumps(force_index, indent=2), encoding="utf-8")
    _write_game_contract(summaries)
    _write_frontend_fixtures(frontend_fixtures)
    _write_configs(summaries, force_path)
    _write_math_manifest()
    return summaries


def _write_frontend_fixtures(fixtures: dict) -> None:
    if not FRONTEND_FIXTURE_PATH.parent.parent.parent.exists():
        return
    FRONTEND_FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_FIXTURE_PATH.write_text(json.dumps(fixtures, indent=2), encoding="utf-8")


def _mode_summary(mode, rows, books_path: Path, lookup_path: Path) -> dict:
    weighted_mean = sum(row.weight * row.outcome.payout for row in rows) / TOTAL_WEIGHT
    second_moment = sum(row.weight * (row.outcome.payout / mode.cost) ** 2 for row in rows) / TOTAL_WEIGHT
    normalized_std = math.sqrt(max(0, second_moment - RTP**2))
    hit_weight = sum(row.weight for row in rows if row.outcome.payout > 0)
    zero_weight = sum(row.weight for row in rows if row.outcome.payout == 0)
    below_cost_weight = sum(row.weight for row in rows if row.outcome.payout < mode.cost)
    profitable_weight = sum(row.weight for row in rows if row.outcome.payout > mode.cost)
    feature_weight = sum(
        row.weight
        for row in rows
        if row.outcome.feature not in {"regular", "expanding_wild"}
    )
    return {
        "name": mode.name,
        "title": mode.title,
        "description": mode.description,
        "cost": mode.cost,
        "rtp": weighted_mean / mode.cost,
        "std": round(normalized_std, 4),
        "maxWin": WIN_CAP,
        "bookLength": len(rows),
        "feature": mode.is_feature,
        "buyBonus": mode.is_buybonus,
        "hitRate": hit_weight / TOTAL_WEIGHT,
        "zeroReturnRate": zero_weight / TOTAL_WEIGHT,
        "belowCostRate": below_cost_weight / TOTAL_WEIGHT,
        "profitableRoundRate": profitable_weight / TOTAL_WEIGHT,
        "featureHitRate": feature_weight / TOTAL_WEIGHT,
        "maxWinFrequency": TOTAL_WEIGHT / sum(
            row.weight for row in rows if row.outcome.payout == WIN_CAP
        ),
        "autoEndRoundDisabled": False,
        "books": books_path.name,
        "booksSha256": sha256(books_path),
        "weights": lookup_path.name,
        "weightsSha256": sha256(lookup_path),
    }


def _write_game_contract(summaries: dict) -> None:
    contract = {
        "schemaVersion": 1,
        "game": {
            "id": "2_0_The_Inheritance",
            "title": "The Inheritance",
            "subtitle": "A Blackthorn Estate Mystery",
            "reels": 5,
            "rows": 4,
            "ways": 1024,
            "rtp": RTP,
            "rtpLabel": "96.00%",
            "houseEdge": round(1 - RTP, 6),
            "maxWin": WIN_CAP,
            "eventPayoutScale": 100,
        },
        "symbols": [
            {"id": "CROWN", "label": "The Heiress", "asset": "symbols/heiress.webp", "pays": {"3": 1.0, "4": 5.0, "5": 20.0}},
            {"id": "PORTRAIT", "label": "The Executor", "asset": "symbols/executor.webp", "pays": {"3": 0.5, "4": 2.5, "5": 10.0}},
            {"id": "RING", "label": "Emerald Ring", "asset": "symbols/poison-ring.webp", "pays": {"3": 0.3, "4": 1.5, "5": 5.0}},
            {"id": "WATCH", "label": "Midnight Watch", "asset": "symbols/pocket-watch.webp", "pays": {"3": 0.2, "4": 0.8, "5": 3.0}},
            {"id": "LETTER", "label": "Funeral Letter", "asset": "symbols/lilies.webp", "pays": {"3": 0.1, "4": 0.5, "5": 2.0}},
            {"id": "WILD", "label": "Wax Seal Wild", "asset": "symbols/wax-wild.webp", "special": "wild"},
            {"id": "TESTAMENT", "label": "Testament Scatter", "asset": "symbols/testament.webp", "special": "sealed_will"},
            {"id": "KEY", "label": "Vault Key", "asset": "symbols/vault-scatter.webp", "special": "vault_echoes"},
            {"id": "MIRROR", "label": "Seance Mirror", "asset": "symbols/seance-mirror.webp", "special": "midnight_seance"},
            {"id": "SCATTER", "label": "Blackthorn Crest", "asset": "symbols/stag.webp", "special": "final_codicil"},
        ],
        "modes": [
            {
                "id": mode.name,
                "title": mode.title,
                "description": mode.description,
                "cost": mode.cost,
                "rtp": RTP,
                "maxWin": WIN_CAP,
                "feature": mode.is_feature,
                "buyBonus": mode.is_buybonus,
                "startingSpins": {
                    "SEALED_WILL_BUY": 8,
                    "VAULT_ECHOES_BUY": 6,
                    "MIDNIGHT_SEANCE_BUY": 10,
                    "FINAL_CODICIL_BUY": 11,
                }.get(mode.name),
                "retriggerSpins": 2 if mode.name in {"SEALED_WILL_BUY", "MIDNIGHT_SEANCE_BUY"} else 0,
                "statistics": {
                    key: summaries[mode.name][key]
                    for key in (
                        "hitRate",
                        "zeroReturnRate",
                        "belowCostRate",
                        "profitableRoundRate",
                        "featureHitRate",
                        "maxWinFrequency",
                    )
                },
                "outcomes": [
                    {
                        "id": outcome.key,
                        "payoutMultiplier": outcome.payout,
                        "weight": outcome.weight,
                        "feature": outcome.feature,
                    }
                    for outcome in mode.outcomes
                ],
            }
            for mode in MODE_SPECS
        ],
    }
    CONTRACT_PATH.write_text(json.dumps(contract, indent=2), encoding="utf-8")


def _write_configs(summaries: dict, force_path: Path) -> None:
    fe_config = {
        "providerName": "Agmish",
        "gameName": "The Inheritance",
        "gameID": "2_0_The_Inheritance",
        "rtp": RTP,
        "numReels": 5,
        "numRows": [4, 4, 4, 4, 4],
        "winType": "ways",
        "ways": 1024,
        "betModes": {
            mode.name: {
                "title": mode.title,
                "description": mode.description,
                "cost": mode.cost,
                "feature": mode.is_feature,
                "buyBonus": mode.is_buybonus,
                "rtp": RTP,
                "max_win": WIN_CAP,
            }
            for mode in MODE_SPECS
        },
        "symbols": [
            {"CROWN": {"paytable": {"3": 1.0, "4": 5.0, "5": 20.0}}},
            {"PORTRAIT": {"paytable": {"3": 0.5, "4": 2.5, "5": 10.0}}},
            {"RING": {"paytable": {"3": 0.3, "4": 1.5, "5": 5.0}}},
            {"WATCH": {"paytable": {"3": 0.2, "4": 0.8, "5": 3.0}}},
            {"LETTER": {"paytable": {"3": 0.1, "4": 0.5, "5": 2.0}}},
            {"WILD": {"special_properties": ["wild"]}},
            {"SCATTER": {"special_properties": ["scatter"]}},
            {"KEY": {"special_properties": ["bonus"]}},
            {"TESTAMENT": {"special_properties": ["bonus"]}},
            {"MIRROR": {"special_properties": ["bonus"]}},
        ],
    }
    fe_path = CONFIG_DIR / "fe_config.json"
    fe_path.write_text(json.dumps(fe_config, indent=2), encoding="utf-8")
    shutil.copy2(fe_path, CONFIG_DIR / "config_fe_2_0_The_Inheritance.json")

    shelf = []
    for mode in MODE_SPECS:
        summary = summaries[mode.name]
        force_record = FORCE_DIR / f"force_record_{mode.name}.json"
        shelf.append(
            {
                "name": mode.name,
                "tables": [{"file": summary["weights"], "sha256": summary["weightsSha256"]}],
                "cost": mode.cost,
                "rtp": RTP,
                "std": summary["std"],
                "bookLength": summary["bookLength"],
                "feature": mode.is_feature,
                "autoEndRoundDisabled": False,
                "buyBonus": mode.is_buybonus,
                "maxWin": WIN_CAP,
                "booksFile": {"file": summary["books"], "sha256": summary["booksSha256"]},
                "forceFile": {"file": force_record.name, "sha256": sha256(force_record)},
            }
        )
    backend = {
        "workingName": "The Inheritance",
        "frontendConfig": {"file": fe_path.name, "sha256": sha256(fe_path)},
        "gameID": "2_0_The_Inheritance",
        "rtp": RTP * 100,
        "betDenomination": 100,
        "minDenomination": 1,
        "providerNumber": 2,
        "standardForceFile": {"file": force_path.name, "sha256": sha256(force_path)},
        "bookShelfConfig": shelf,
    }
    (CONFIG_DIR / "config.json").write_text(json.dumps(backend, indent=2), encoding="utf-8")
    (CONFIG_DIR / "math_config.json").write_text(
        json.dumps(
            {
                "game_id": "2_0_The_Inheritance",
                "stateless": True,
                "rtp": RTP,
                "max_win": WIN_CAP,
                "bet_modes": [
                    {"bet_mode": mode.name, "cost": mode.cost, "rtp": RTP, "max_win": WIN_CAP}
                    for mode in MODE_SPECS
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    index = {
        "modes": [
            {
                "name": mode.name,
                "cost": mode.cost,
                "events": summaries[mode.name]["books"],
                "weights": summaries[mode.name]["weights"],
            }
            for mode in MODE_SPECS
        ]
    }
    (PUBLISH_DIR / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    (CONFIG_DIR / "generation_summary.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    (CONFIG_DIR / "par_sheet.json").write_text(
        json.dumps(
            {
                "gameID": "2_0_The_Inheritance",
                "rtp": RTP,
                "houseEdge": round(1 - RTP, 6),
                "maxWin": WIN_CAP,
                "weightScale": TOTAL_WEIGHT,
                "modes": list(summaries.values()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _write_math_manifest() -> None:
    manifest = {
        "schemaVersion": 1,
        "gameID": "2_0_The_Inheritance",
        "rtp": RTP,
        "generatedFrom": "Stake Math SDK",
        "publicationFolder": "games/2_0_The_Inheritance/library/publish_files",
        "contract": {"file": CONTRACT_PATH.name, "sha256": sha256(CONTRACT_PATH)},
        "files": [
            {
                "file": f"library/publish_files/{path.name}",
                "size": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in sorted(PUBLISH_DIR.iterdir())
            if path.is_file()
        ],
    }
    (RELEASE_DIR / "math_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _remove_stale_publication_files() -> None:
    expected_modes = {mode.name for mode in MODE_SPECS}
    for path in PUBLISH_DIR.iterdir():
        if not path.is_file() or path.name == "index.json":
            continue
        if path.name.startswith("books_") or path.name.startswith("lookUpTable_"):
            mode_name = path.name.removeprefix("books_").removesuffix(".jsonl.zst")
            if path.name.startswith("lookUpTable_"):
                mode_name = path.name.removeprefix("lookUpTable_").removesuffix("_0.csv")
            if mode_name not in expected_modes:
                path.unlink()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--books", type=int, default=BOOKS_PER_MODE)
    arguments = parser.parse_args()
    summaries = generate(arguments.books)
    print(json.dumps(summaries, indent=2))


if __name__ == "__main__":
    main()
