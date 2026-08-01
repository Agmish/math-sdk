"""Deterministic, stateless event-book construction for The Inheritance."""

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from math_profile import BOOKS_PER_MODE, ModeSpec, OutcomeSpec


FILLERS = ("RING", "WATCH", "LETTER", "PORTRAIT", "CROWN")
PAYTABLE = {
    "CROWN": {3: 100, 4: 500, 5: 2_000},
    "PORTRAIT": {3: 50, 4: 250, 5: 1_000},
    "RING": {3: 30, 4: 150, 5: 500},
    "WATCH": {3: 20, 4: 80, 5: 300},
    "LETTER": {3: 10, 4: 50, 5: 200},
}
FEATURE_FRAMES = {
    "sealed_will": 8,
    "vault_echoes": 6,
    "midnight_seance": 10,
    "final_codicil": 11,
}


@dataclass(frozen=True)
class WeightedBook:
    book_id: int
    outcome: OutcomeSpec
    weight: int


class Events:
    """Append-only event list with guaranteed sequential indices."""

    def __init__(self):
        self.items: List[dict] = []

    def add(self, event_type: str, **payload) -> None:
        self.items.append({"index": len(self.items), "type": event_type, **payload})


def allocate_weighted_books(mode: ModeSpec, count: int = BOOKS_PER_MODE) -> List[WeightedBook]:
    """Spread each probability band across a varied catalog without changing its weight."""
    outcomes = list(mode.outcomes)
    raw_counts = [outcome.weight * count / 1_000_000 for outcome in outcomes]
    counts = [max(1, int(value)) for value in raw_counts]
    while sum(counts) < count:
        candidates = sorted(
            range(len(outcomes)),
            key=lambda idx: (raw_counts[idx] - int(raw_counts[idx]), outcomes[idx].weight),
            reverse=True,
        )
        for idx in candidates:
            counts[idx] += 1
            if sum(counts) == count:
                break
    while sum(counts) > count:
        idx = max((i for i, value in enumerate(counts) if value > 1), key=lambda i: counts[i])
        counts[idx] -= 1

    rows: List[Tuple[OutcomeSpec, int]] = []
    for outcome, copies in zip(outcomes, counts):
        quotient, remainder = divmod(outcome.weight, copies)
        rows.extend((outcome, quotient + (1 if index < remainder else 0)) for index in range(copies))

    # Interleave outcomes so nearby book IDs do not all share the same presentation.
    random.Random(stable_hash(mode.name)).shuffle(rows)
    return [WeightedBook(index, outcome, weight) for index, (outcome, weight) in enumerate(rows)]


def build_book(mode: ModeSpec, weighted: WeightedBook) -> dict:
    seed = stable_hash(f"{mode.name}:{weighted.book_id}:{weighted.outcome.key}")
    rng = random.Random(seed)
    payout_int = round(weighted.outcome.payout * 100)
    events = Events()

    if mode.name == "HEIRLOOM_ANTE":
        events.add("ante", costMultiplier=mode.cost)
    events.add(
        "presentationPlan",
        seed=f"{seed:08x}",
        feature=weighted.outcome.feature,
        frames=_presentation_frames(weighted.outcome.feature, payout_int),
        phases=(
            ["sealed_will", "vault_echoes", "midnight_seance"]
            if weighted.outcome.feature == "final_codicil"
            else [weighted.outcome.feature]
        ),
    )

    if weighted.outcome.feature == "regular":
        _regular_events(events, rng, payout_int, weighted.outcome)
    elif weighted.outcome.feature == "expanding_wild":
        _expanding_wild_events(events, rng, payout_int)
    else:
        _feature_events(events, rng, payout_int, weighted.outcome.feature, mode.name)

    _assert_book_events(events.items, payout_int)
    return {
        "id": weighted.book_id,
        "payoutMultiplier": payout_int,
        "events": events.items,
        "criteria": weighted.outcome.key,
        "mode": mode.name,
        "resultMeta": {
            "feature": weighted.outcome.feature,
            "costMultiplier": mode.cost,
            "rtpProfile": "96.00",
            "stateless": True,
        },
    }


def _regular_events(events: Events, rng: random.Random, payout_int: int, outcome: OutcomeSpec) -> None:
    board = _neutral_board(rng)
    if payout_int:
        symbol, counts = _ways_shape(outcome.payout)
        board = _neutral_board(rng, {symbol})
        _plant_ways(board, symbol, counts)
    events.add("reveal", board=_wrap_board(board), anticipation=[0, 0, 0, 0, 0], gameType="basegame")
    evaluation = evaluate_ways(board)
    assert evaluation["totalWin"] == payout_int, (outcome.key, evaluation, payout_int)
    _add_ways_win(events, evaluation, "basegame", payout_int)
    events.add("finalWin", amount=payout_int)


def _expanding_wild_events(events: Events, rng: random.Random, payout_int: int) -> None:
    board = _neutral_board(rng, {"LETTER", "WILD"})
    reel = 2
    origin_row = rng.randrange(4)
    _plant_ways(board, "LETTER", (3, 1))
    board[reel][origin_row] = "WILD"
    events.add("reveal", board=_wrap_board(board), anticipation=[0, 0, 1, 0, 0], gameType="basegame")
    expanded = [{"reel": reel, "row": row} for row in range(4)]
    expanded_board = [list(column) for column in board]
    expanded_board[reel] = ["WILD"] * 4
    base_evaluation = evaluate_ways(expanded_board)
    assert base_evaluation["totalWin"] > 0
    applied_multiplier = payout_int / base_evaluation["totalWin"]
    assert applied_multiplier in {2.5, 3.0}
    events.add(
        "expandWild",
        reel=reel,
        originRow=origin_row,
        multiplier=applied_multiplier,
        positions=expanded,
    )
    events.add("expandedBoard", board=_wrap_board(expanded_board), reel=reel)
    evaluation = evaluate_ways(expanded_board, applied_multiplier)
    assert evaluation["totalWin"] == payout_int
    _add_ways_win(events, evaluation, "basegame", payout_int)
    events.add("finalWin", amount=payout_int)


def _feature_events(
    events: Events,
    rng: random.Random,
    payout_int: int,
    feature: str,
    mode_name: str,
) -> None:
    buy_mode = mode_name.endswith("_BUY")
    trigger_board = _neutral_board(rng)
    trigger_symbol = {
        "sealed_will": "TESTAMENT",
        "vault_echoes": "KEY",
        "midnight_seance": "MIRROR",
        "final_codicil": "SCATTER",
    }[feature]
    trigger_positions = []
    for reel in (0, 2, 4):
        row = rng.randrange(4)
        trigger_board[reel][row] = trigger_symbol
        trigger_positions.append({"reel": reel, "row": row})

    events.add("featureIntro", label=_feature_label(feature), mode=mode_name, feature=feature)
    events.add(
        "reveal",
        board=_wrap_board(trigger_board),
        anticipation=[0, 0, 1, 2, 3],
        gameType="basegame",
    )
    events.add(
        "featureTrigger",
        feature=feature,
        source="feature_bet" if buy_mode else "natural",
        positions=trigger_positions,
    )

    retrigger = _has_retrigger(feature, payout_int)
    if feature == "sealed_will":
        frames = 10 if retrigger else 8
        _will_sequence(events, rng, _split_win(payout_int, frames), 0, retrigger=retrigger)
    elif feature == "vault_echoes":
        _vault_sequence(events, rng, _split_win(payout_int, 6), 0)
    elif feature == "midnight_seance":
        frames = 12 if retrigger else 10
        _seance_sequence(events, rng, _split_win(payout_int, frames), 0, retrigger=retrigger)
    else:
        parts = _split_win(payout_int, 11)
        events.add("codicilFusion", stages=["will", "vault", "seance"])
        total = _will_sequence(events, rng, parts[:5], 0, stage="will")
        total = _vault_sequence(events, rng, parts[5:8], total, stage="vault")
        _seance_sequence(events, rng, parts[8:], total, stage="seance")
    events.add("featureComplete", feature=feature, totalWin=payout_int)
    events.add("finalWin", amount=payout_int)


def _will_sequence(
    events: Events,
    rng: random.Random,
    wins: List[int],
    running: int,
    stage: str = "sealed_will",
    retrigger: bool = False,
) -> int:
    total_spins = len(wins)
    starting_spins = total_spins - 2 if retrigger else total_spins
    events.add("freeSpinTrigger", feature=stage, totalFs=starting_spins)
    for spin, win in enumerate(wins, start=1):
        board = _neutral_board(rng, {"WILD", "TESTAMENT"})
        reel = (spin + 1) % 5
        origin_row = rng.randrange(4)
        board[reel][origin_row] = "WILD"
        retrigger_positions: List[dict] = []
        if retrigger and spin == max(2, starting_spins // 2):
            for trigger_reel in (0, 2, 4):
                row = (spin + trigger_reel) % 4
                if trigger_reel == reel and row == origin_row:
                    row = (row + 1) % 4
                board[trigger_reel][row] = "TESTAMENT"
                retrigger_positions.append({"reel": trigger_reel, "row": row})
        events.add("updateFreeSpin", amount=spin - 1, total=total_spins, stage=stage)
        events.add("reveal", board=_wrap_board(board), anticipation=[0, 0, 0, 0, 0], gameType="freegame")
        positions = [{"reel": reel, "row": row} for row in range(4)]
        events.add(
            "expandWild",
            reel=reel,
            originRow=origin_row,
            multiplier=1,
            positions=positions,
            stage=stage,
        )
        if retrigger_positions:
            events.add(
                "retrigger",
                feature=stage,
                addedSpins=2,
                totalFs=total_spins,
                symbol="TESTAMENT",
                positions=retrigger_positions,
            )
        running += win
        _add_feature_award(events, win, "WILD", positions, "sealedWillAward", "freegame", running, stage)
    return running


def _vault_sequence(
    events: Events,
    rng: random.Random,
    wins: List[int],
    running: int,
    stage: str = "vault_echoes",
) -> int:
    locked: List[dict] = []
    for respin, prize in enumerate(wins, start=1):
        position = {"reel": (respin * 2) % 5, "row": (respin - 1) % 4}
        locked.append({**position, "value": prize})
        board = _neutral_board(rng, {"KEY"})
        for item in locked:
            board[item["reel"]][item["row"]] = "KEY"
        events.add("reveal", board=_wrap_board(board), anticipation=[0, 1, 1, 2, 2], gameType="respin")
        events.add("vaultState", locks=len(locked), respins=max(0, len(wins) - respin), collected=sum(x["value"] for x in locked), stage=stage)
        events.add("lockPrize", position=position, value=prize, stage=stage)
        running += prize
        _add_feature_award(events, prize, "KEY", [position], "vaultCollection", "respin", running, stage)
    return running


def _seance_sequence(
    events: Events,
    rng: random.Random,
    wins: List[int],
    running: int,
    stage: str = "midnight_seance",
    retrigger: bool = False,
) -> int:
    multiplier = 1
    total_spins = len(wins)
    starting_spins = total_spins - 2 if retrigger else total_spins
    events.add("freeSpinTrigger", feature=stage, totalFs=starting_spins)
    for spin, win in enumerate(wins, start=1):
        reel = (spin * 3) % 5
        multiplier = min(5, multiplier + (1 if spin % 3 == 0 else 0))
        board = _neutral_board(rng, {"WILD", "MIRROR"})
        board[reel] = ["WILD", "MIRROR", "WILD", "MIRROR"]
        retrigger_positions: List[dict] = []
        if retrigger and spin == max(2, starting_spins // 2):
            for trigger_reel in (0, 2, 4):
                row = (spin + trigger_reel) % 4
                board[trigger_reel][row] = "MIRROR"
                retrigger_positions.append({"reel": trigger_reel, "row": row})
        events.add("updateFreeSpin", amount=spin - 1, total=total_spins, stage=stage)
        events.add("reveal", board=_wrap_board(board), anticipation=[0, 0, 1, 2, 3], gameType="freegame")
        events.add("seancePossess", reels=[reel], multiplier=multiplier, stage=stage)
        if retrigger_positions:
            events.add(
                "retrigger",
                feature=stage,
                addedSpins=2,
                totalFs=total_spins,
                symbol="MIRROR",
                positions=retrigger_positions,
            )
        positions = [{"reel": reel, "row": row} for row in (0, 2)]
        running += win
        _add_feature_award(events, win, "MIRROR", positions, "spiritAward", "freegame", running, stage)
    return running


def _add_ways_win(events: Events, evaluation: dict, game_type: str, total: int) -> None:
    amount = evaluation["totalWin"]
    if amount:
        events.add(
            "winInfo",
            totalWin=amount,
            wins=evaluation["wins"],
            positions=evaluation["positions"],
            gameType=game_type,
            evaluationSource="visibleWays",
        )
        events.add("setWin", amount=amount, winLevel=_win_level(amount))
    events.add("setTotalWin", amount=total)


def _add_feature_award(
    events: Events,
    amount: int,
    symbol: str,
    positions: List[dict],
    source: str,
    game_type: str,
    total: int,
    stage: str,
) -> None:
    if amount:
        events.add(
            "featureAward",
            symbol=symbol,
            amount=amount,
            positions=positions,
            stage=stage,
            evaluationSource=source,
        )
        events.add(
            "winInfo",
            totalWin=amount,
            wins=[
                {
                    "symbol": symbol,
                    "kind": len(positions),
                    "ways": None,
                    "basePay": amount,
                    "multiplier": 1,
                    "win": amount,
                    "positions": positions,
                }
            ],
            positions=positions,
            gameType=game_type,
            evaluationSource=source,
        )
        events.add("setWin", amount=amount, winLevel=_win_level(amount))
    events.add("setTotalWin", amount=total)


def _neutral_board(rng: random.Random, excluded: set | None = None) -> List[List[str]]:
    """Build a board with no accidental left-to-right regular-symbol win."""
    available = [symbol for symbol in FILLERS if symbol not in (excluded or set())]
    if len(available) < 2:
        available = list(FILLERS)
    offset = rng.randrange(len(available))
    reel_symbols = [available[(offset + reel) % len(available)] for reel in range(5)]
    if reel_symbols[1] == reel_symbols[0]:
        reel_symbols[1] = available[(offset + 1) % len(available)]
    return [[reel_symbols[reel]] * 4 for reel in range(5)]


def _plant_ways(board: List[List[str]], symbol: str, counts: Iterable[int]) -> List[dict]:
    positions = []
    for reel, count in enumerate(counts):
        for row in range(count):
            board[reel][row] = symbol
            positions.append({"reel": reel, "row": row})
    return positions


def _ways_shape(payout: float) -> Tuple[str, Tuple[int, int, int]]:
    if payout == 0.4:
        return "LETTER", (2, 2, 1)
    if payout == 0.9:
        return "RING", (3, 1, 1)
    if payout == 1.2:
        return "RING", (2, 2, 1)
    return "PORTRAIT", (2, 3, 1)


def evaluate_ways(board: List[List[str]], multiplier: float = 1.0) -> dict:
    """Independently calculate all adjacent-reel ways represented on a board."""
    wins = []
    all_positions = []
    total = 0
    for symbol, pays in PAYTABLE.items():
        counts = []
        positions = []
        for reel_index, reel in enumerate(board):
            matches = [
                {"reel": reel_index, "row": row}
                for row, candidate in enumerate(reel)
                if candidate in {symbol, "WILD"}
            ]
            if not matches:
                break
            counts.append(len(matches))
            positions.extend(matches)
        kind = len(counts)
        if kind < 3:
            continue
        ways = math.prod(counts)
        base_pay = pays[kind]
        win = round(base_pay * ways * multiplier)
        wins.append(
            {
                "symbol": symbol,
                "kind": kind,
                "ways": ways,
                "basePay": base_pay,
                "multiplier": multiplier,
                "win": win,
                "positions": positions,
            }
        )
        all_positions.extend(positions)
        total += win
    unique_positions = list({(item["reel"], item["row"]): item for item in all_positions}.values())
    return {"totalWin": total, "wins": wins, "positions": unique_positions}


def _has_retrigger(feature: str, payout_int: int) -> bool:
    if feature == "sealed_will":
        return payout_int >= 20_000
    if feature == "midnight_seance":
        return payout_int >= 50_000
    return False


def _presentation_frames(feature: str, payout_int: int) -> int:
    frames = FEATURE_FRAMES.get(feature, 1)
    return frames + (2 if _has_retrigger(feature, payout_int) else 0)


def _wrap_board(board: List[List[str]]) -> List[List[Dict[str, object]]]:
    result = []
    for reel in board:
        wrapped = []
        for symbol in reel:
            item: Dict[str, object] = {"name": symbol}
            if symbol == "WILD":
                item["wild"] = True
            elif symbol == "SCATTER":
                item["scatter"] = True
            wrapped.append(item)
        result.append(wrapped)
    return result


def _split_win(payout_int: int, frames: int) -> List[int]:
    units, remainder = divmod(payout_int // 10, frames)
    return [(units + (1 if index < remainder else 0)) * 10 for index in range(frames)]


def _feature_label(feature: str) -> str:
    return {
        "sealed_will": "The Sealed Will",
        "vault_echoes": "Vault of Echoes",
        "midnight_seance": "Midnight Seance",
        "final_codicil": "The Final Codicil",
    }[feature]


def _win_level(amount: int) -> int:
    multiplier = amount / 100
    for level, threshold in enumerate((0.1, 1, 2, 5, 15, 30, 50, 100, 500), start=1):
        if multiplier < threshold:
            return level
    return 10


def _assert_book_events(events: List[dict], payout_int: int) -> None:
    assert [event["index"] for event in events] == list(range(len(events)))
    assert events[-1] == {"index": len(events) - 1, "type": "finalWin", "amount": payout_int}
    totals = [event["amount"] for event in events if event["type"] == "setTotalWin"]
    assert totals and totals[-1] == payout_int
    assert all(left <= right for left, right in zip(totals, totals[1:]))


def stable_hash(value: str) -> int:
    state = 2_166_136_261
    for byte in value.encode("utf-8"):
        state ^= byte
        state = state * 16_777_619 & 0xFFFFFFFF
    return state
