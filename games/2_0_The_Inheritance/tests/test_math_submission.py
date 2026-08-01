"""Fast source-level regression tests for The Inheritance math package."""

import sys
import unittest
from pathlib import Path


GAME_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_DIR.parents[1]
for path in (REPO_ROOT, GAME_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from book_builder import allocate_weighted_books, build_book, evaluate_ways  # noqa: E402
from game_config import GameConfig  # noqa: E402
from math_profile import MODE_SPECS, RTP, TOTAL_WEIGHT, WIN_CAP  # noqa: E402


class MathSubmissionTests(unittest.TestCase):
    def test_config_contract(self):
        config = GameConfig()
        self.assertEqual(config.num_rows, [4] * 5)
        self.assertEqual(config.win_type, "ways")
        self.assertEqual(config.rtp, RTP)
        self.assertEqual(config.wincap, WIN_CAP)
        self.assertEqual([mode.get_name() for mode in config.bet_modes], [mode.name for mode in MODE_SPECS])

    def test_profiles_are_exact(self):
        for mode in MODE_SPECS:
            self.assertEqual(sum(outcome.weight for outcome in mode.outcomes), TOTAL_WEIGHT)
            weighted = sum(round(outcome.payout * 100) * outcome.weight for outcome in mode.outcomes)
            self.assertEqual(weighted, round(RTP * mode.cost * 100 * TOTAL_WEIGHT))
            self.assertEqual(max(outcome.payout for outcome in mode.outcomes), WIN_CAP)

    def test_catalog_keeps_weights_and_ids(self):
        for mode in MODE_SPECS:
            rows = allocate_weighted_books(mode, 100)
            self.assertEqual(len(rows), 100)
            self.assertEqual([row.book_id for row in rows], list(range(100)))
            self.assertEqual(sum(row.weight for row in rows), TOTAL_WEIGHT)

    def test_each_outcome_builds_a_complete_book(self):
        for mode in MODE_SPECS:
            rows = allocate_weighted_books(mode, 100)
            seen = set()
            for row in rows:
                if row.outcome.key in seen:
                    continue
                seen.add(row.outcome.key)
                book = build_book(mode, row)
                self.assertEqual(book["events"][-1]["type"], "finalWin")
                self.assertEqual(book["events"][-1]["amount"], book["payoutMultiplier"])
                self.assertTrue(book["resultMeta"]["stateless"])

    def test_visible_ways_events_match_their_boards(self):
        for mode in MODE_SPECS[:2]:
            for row in allocate_weighted_books(mode, 100):
                book = build_book(mode, row)
                board = None
                for event in book["events"]:
                    if event["type"] in {"reveal", "expandedBoard"}:
                        board = [[symbol["name"] for symbol in reel] for reel in event["board"]]
                    if event["type"] == "winInfo" and event.get("evaluationSource") == "visibleWays":
                        multiplier = event["wins"][0]["multiplier"]
                        self.assertEqual(evaluate_ways(board, multiplier)["totalWin"], event["totalWin"])


if __name__ == "__main__":
    unittest.main()
