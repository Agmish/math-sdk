"""Exercise the actual self-contained RTP packages before Stake submission.

This test reads only the selected release folders. It validates that every lookup
entry points to a real book in that same package and that every mode has a
positive total selection weight.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path

import zstandard as zstd

from release_package import MODES, RELEASE_ROOT, validate_release_package
from rtp_profiles import SUPPORTED_RTP_PERCENTAGES


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profiles",
        nargs="+",
        type=int,
        default=list(SUPPORTED_RTP_PERCENTAGES),
        choices=SUPPORTED_RTP_PERCENTAGES,
    )
    return parser.parse_args()


def read_book_ids(path: Path) -> set[int]:
    book_ids: set[int] = set()
    with path.open("rb") as compressed:
        with zstd.ZstdDecompressor().stream_reader(compressed) as reader:
            for line in io.TextIOWrapper(reader, encoding="utf-8"):
                book_ids.add(int(json.loads(line)["id"]))
    if not book_ids:
        raise AssertionError(f"No books found in {path}")
    return book_ids


def validate_mode(release_dir: Path, mode: str) -> tuple[int, int]:
    book_ids = read_book_ids(release_dir / f"books_{mode}.jsonl.zst")
    lookup_ids: set[int] = set()
    total_weight = 0

    with (release_dir / f"lookUpTable_{mode}_0.csv").open(newline="", encoding="utf-8") as handle:
        for book_id, weight, _payout in csv.reader(handle):
            parsed_id = int(book_id)
            parsed_weight = int(weight)
            if parsed_weight < 0:
                raise AssertionError(f"Negative lookup weight for {mode} book {parsed_id}.")
            lookup_ids.add(parsed_id)
            total_weight += parsed_weight

    missing_book_ids = lookup_ids - book_ids
    if missing_book_ids:
        example = min(missing_book_ids)
        raise AssertionError(f"{mode} lookup references a missing packaged book ID: {example}")
    if total_weight <= 0:
        raise AssertionError(f"{mode} lookup has no positive total weight.")
    return len(book_ids), total_weight


def main() -> None:
    args = parse_args()
    for percentage in args.profiles:
        release_dir = RELEASE_ROOT / f"rtp_{percentage}"
        validate_release_package(release_dir)
        for mode in MODES:
            book_count, total_weight = validate_mode(release_dir, mode)
            print(
                f"Release runtime smoke test OK: rtp_{percentage} {mode} "
                f"({book_count} books, total lookup weight {total_weight})"
            )


if __name__ == "__main__":
    main()
