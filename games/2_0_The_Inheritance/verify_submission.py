"""Semantic checks beyond the SDK's basic book/lookup parser."""

import hashlib
import io
import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Dict, Iterator, List

import zstandard as zstd

from book_builder import evaluate_ways
from math_profile import BOOKS_PER_MODE, MODE_SPECS, RTP, TOTAL_WEIGHT, WIN_CAP
from publication import CONFIG_DIR, FORCE_DIR, PUBLISH_DIR, RELEASE_DIR, sha256
from utils.analysis.distribution_functions import get_etl_cvar_p5k_10k_vales


REQUIRED_FEATURE_EVENTS = {
    "SEALED_WILL_BUY": {"featureTrigger", "freeSpinTrigger", "updateFreeSpin", "expandWild", "featureAward", "retrigger", "featureComplete"},
    "VAULT_ECHOES_BUY": {"featureTrigger", "vaultState", "lockPrize", "featureAward", "featureComplete"},
    "MIDNIGHT_SEANCE_BUY": {"featureTrigger", "freeSpinTrigger", "seancePossess", "featureAward", "retrigger", "featureComplete"},
    "FINAL_CODICIL_BUY": {
        "featureTrigger",
        "codicilFusion",
        "expandWild",
        "vaultState",
        "seancePossess",
        "featureComplete",
    },
}


def verify_submission(expected_books: int = BOOKS_PER_MODE) -> dict:
    index_path = PUBLISH_DIR / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    expected_modes = [mode.name for mode in MODE_SPECS]
    assert [mode["name"] for mode in index["modes"]] == expected_modes
    assert len({mode["name"] for mode in index["modes"]}) == len(expected_modes)

    config = json.loads((CONFIG_DIR / "config.json").read_text(encoding="utf-8"))
    assert config["gameID"] == "2_0_The_Inheritance"
    assert config["rtp"] == RTP * 100
    assert config["minDenomination"] == 1
    assert config["betDenomination"] == 100
    assert config["standardForceFile"]["sha256"] == sha256(FORCE_DIR / "force.json")

    tasks = [
        (mode, index_mode, shelf, expected_books)
        for mode, index_mode, shelf in zip(MODE_SPECS, index["modes"], config["bookShelfConfig"])
    ]
    configured_workers = int(os.environ.get("INHERITANCE_VERIFY_WORKERS", os.cpu_count() or 1))
    worker_count = max(1, min(len(tasks), configured_workers))
    if worker_count == 1:
        mode_results = map(_verify_mode, tasks)
        results = dict(mode_results)
    else:
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            results = dict(executor.map(_verify_mode, tasks))

    report = {
        "status": "PASS",
        "gameID": "2_0_The_Inheritance",
        "stateless": True,
        "modeCount": len(results),
        "results": results,
        "mathManifestSha256": sha256(RELEASE_DIR / "math_manifest.json"),
    }
    (CONFIG_DIR / "submission_verification.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8", newline="\n"
    )
    return report


def _verify_mode(task: tuple) -> tuple[str, dict]:
    """Verify one complete mode; modes run independently across CPU processes."""
    mode, index_mode, shelf, expected_books = task
    assert index_mode["name"] == shelf["name"] == mode.name
    assert index_mode["cost"] == shelf["cost"] == mode.cost
    books_path = PUBLISH_DIR / index_mode["events"]
    lookup_path = PUBLISH_DIR / index_mode["weights"]
    assert books_path.is_file() and lookup_path.is_file()
    assert shelf["booksFile"]["sha256"] == sha256(books_path)
    assert shelf["tables"][0]["sha256"] == sha256(lookup_path)
    assert shelf["autoEndRoundDisabled"] is False

    lookup = _read_lookup(lookup_path)
    assert len(lookup) == expected_books
    assert all(row[0] == expected_id for expected_id, row in enumerate(lookup))

    total_weight = sum(row[1] for row in lookup)
    weighted_payout = sum(weight * payout for _, weight, payout in lookup)
    exact_rtp = weighted_payout / total_weight / 100 / mode.cost
    top_one_percent_average = _tail_average(lookup, mode.cost, 0.01)
    distribution = defaultdict(int)
    for _, weight, payout in lookup:
        distribution[payout / 100] += weight
    prob5k, prob10k, etl10k, etl40b, cvar = get_etl_cvar_p5k_10k_vales(
        distribution, mode.cost, total_weight
    )
    assert total_weight == TOTAL_WEIGHT
    assert weighted_payout == round(RTP * mode.cost * 100 * TOTAL_WEIGHT)
    assert abs(exact_rtp - RTP) < 1e-12
    assert max(row[2] for row in lookup) == round(WIN_CAP * 100)
    assert all(weight > 0 for _, weight, _ in lookup)
    assert all(payout >= 0 and payout % 10 == 0 for _, _, payout in lookup)
    assert sum(1 for _, _, payout in lookup if payout > 0) >= 5
    assert top_one_percent_average < 800
    assert prob5k <= 0.01
    assert prob10k <= 0.005
    assert etl40b <= 0.9
    assert etl10k <= 0.8
    assert cvar <= 800

    event_counts = Counter()
    criteria = Counter()
    review_samples = []
    book_count = 0
    for book_count, book in enumerate(_iter_books(books_path), start=1):
        expected_id, _, expected_payout = lookup[book_count - 1]
        assert book["id"] == expected_id == book_count - 1
        assert book["payoutMultiplier"] == expected_payout
        _verify_book(book)
        criteria[book["criteria"]] += 1
        event_counts.update(event["type"] for event in book["events"])
        if book["payoutMultiplier"] > 0 and len(review_samples) < 5:
            review_samples.append(
                {
                    "bookId": book["id"],
                    "criteria": book["criteria"],
                    "payoutMultiplier": book["payoutMultiplier"] / 100,
                    "finalEvent": book["events"][-1]["type"],
                }
            )
    assert book_count == expected_books
    assert REQUIRED_FEATURE_EVENTS.get(mode.name, set()).issubset(event_counts)
    if mode.name in {"BASE", "HEIRLOOM_ANTE"}:
        assert event_counts["expandWild"] > 0
        assert event_counts["featureTrigger"] > 0

    return mode.name, {
        "books": book_count,
        "weight": total_weight,
        "rtp": f"{exact_rtp * 100:.2f}%",
        "maxWin": f"{max(row[2] for row in lookup) / 100:.2f}x",
        "topOnePercentAverage": f"{top_one_percent_average:.4f}x stake",
        "threeStarVolatility": {
            "prob5k": round(prob5k, 6),
            "prob10k": round(prob10k, 6),
            "etl40b": round(etl40b, 6),
            "etl10k": round(etl10k, 6),
            "cvar": round(cvar, 6),
            "status": "PASS",
        },
        "criteria": dict(sorted(criteria.items())),
        "eventTypes": sorted(event_counts),
        "reviewSamples": review_samples,
        "sha256": sha256(books_path),
    }


def _read_lookup(path: Path) -> List[tuple]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        book_id, weight, payout = line.split(",")
        rows.append((int(book_id), int(weight), int(payout)))
    return rows


def _iter_books(path: Path) -> Iterator[dict]:
    """Decode one book at a time so large releases never exhaust CI memory."""
    with path.open("rb") as source, zstd.ZstdDecompressor().stream_reader(source) as reader:
        text_stream = io.TextIOWrapper(reader, encoding="utf-8")
        for line in text_stream:
            if line.strip():
                yield json.loads(line)


def _verify_book(book: Dict) -> None:
    assert isinstance(book["id"], int)
    assert isinstance(book["payoutMultiplier"], int)
    assert book["resultMeta"]["stateless"] is True
    assert not _contains_persistent_text(book)
    events = book["events"]
    assert events and all(event["index"] == index for index, event in enumerate(events))
    assert events[-1]["type"] == "finalWin"
    assert events[-1]["amount"] == book["payoutMultiplier"]
    totals = [event["amount"] for event in events if event["type"] == "setTotalWin"]
    assert totals and totals[-1] == book["payoutMultiplier"]
    assert all(left <= right for left, right in zip(totals, totals[1:]))
    running_total = 0
    latest_board = None
    latest_feature_award = None
    latest_expand_positions = []
    for event in events:
        if event["type"] == "reveal":
            board = event["board"]
            assert len(board) == 5 and all(len(reel) == 4 for reel in board)
            assert all("name" in symbol for reel in board for symbol in reel)
            latest_board = [[symbol["name"] for symbol in reel] for reel in board]
        elif event["type"] == "expandedBoard":
            latest_board = [[symbol["name"] for symbol in reel] for reel in event["board"]]
        elif event["type"] == "expandWild":
            latest_expand_positions = event["positions"]
            assert len(latest_expand_positions) == 4
        elif event["type"] == "featureTrigger":
            trigger_symbol = {
                "sealed_will": "TESTAMENT",
                "vault_echoes": "KEY",
                "midnight_seance": "MIRROR",
                "final_codicil": "SCATTER",
            }[event["feature"]]
            assert latest_board is not None
            assert all(latest_board[item["reel"]][item["row"]] == trigger_symbol for item in event["positions"])
        elif event["type"] == "retrigger":
            assert event["addedSpins"] == 2
            assert len(event["positions"]) == 3
            assert latest_board is not None
            assert all(
                latest_board[item["reel"]][item["row"]] == event["symbol"]
                for item in event["positions"]
            )
        elif event["type"] == "featureAward":
            assert event["amount"] > 0
            latest_feature_award = event
            if event["symbol"] == "WILD":
                assert event["positions"] == latest_expand_positions
            else:
                assert latest_board is not None
                assert all(
                    latest_board[item["reel"]][item["row"]] in {event["symbol"], "WILD"}
                    for item in event["positions"]
                )
        elif event["type"] == "winInfo":
            source = event.get("evaluationSource")
            if source == "visibleWays":
                assert latest_board is not None
                multiplier = event["wins"][0]["multiplier"] if event["wins"] else 1
                evaluation = evaluate_ways(latest_board, multiplier)
                assert evaluation["totalWin"] == event["totalWin"]
                assert evaluation["wins"] == event["wins"]
                assert evaluation["positions"] == event["positions"]
            else:
                assert latest_feature_award is not None
                assert latest_feature_award["amount"] == event["totalWin"]
                assert latest_feature_award["evaluationSource"] == source
                assert latest_feature_award["positions"] == event["positions"]
        elif event["type"] == "setWin":
            running_total += event["amount"]
        elif event["type"] == "setTotalWin":
            assert event["amount"] == running_total
    assert running_total == book["payoutMultiplier"]


def _contains_persistent_text(value: object) -> bool:
    """Match the prior serialized-text guard without re-encoding every book."""
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, dict):
            if any("persistent" in str(key).lower() for key in current):
                return True
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)
        elif isinstance(current, str) and "persistent" in current.lower():
            return True
    return False


def _tail_average(lookup: List[tuple], cost: float, fraction: float) -> float:
    remaining = round(TOTAL_WEIGHT * fraction)
    total = 0.0
    for _, weight, payout in sorted(lookup, key=lambda row: row[2], reverse=True):
        used = min(remaining, weight)
        total += used * payout / 100 / cost
        remaining -= used
        if remaining == 0:
            break
    assert remaining == 0
    return total / round(TOTAL_WEIGHT * fraction)


def main() -> None:
    print(json.dumps(verify_submission(), indent=2))


if __name__ == "__main__":
    main()
