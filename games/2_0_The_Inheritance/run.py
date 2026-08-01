"""One-command publication and verification entry point."""

import argparse
import json
import sys
from pathlib import Path


GAME_DIR = Path(__file__).resolve().parent
REPO_ROOT = GAME_DIR.parents[1]
for path in (REPO_ROOT, GAME_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from game_config import GameConfig  # noqa: E402
from math_profile import BOOKS_PER_MODE  # noqa: E402
from publication import generate  # noqa: E402
from utils.rgs_verification import execute_all_tests  # noqa: E402
from verify_submission import verify_submission  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--books", type=int, default=BOOKS_PER_MODE)
    parser.add_argument("--verify-only", action="store_true")
    arguments = parser.parse_args()

    if not arguments.verify_only:
        generate(arguments.books)
    report = verify_submission(expected_books=arguments.books)
    execute_all_tests(GameConfig())
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
