"""Exact probability profiles for every submitted bet mode."""

from dataclasses import dataclass
from typing import Tuple


TOTAL_WEIGHT = 1_000_000
RTP = 0.96
WIN_CAP = 15_000.0
BOOKS_PER_MODE = 100_000


@dataclass(frozen=True)
class OutcomeSpec:
    key: str
    payout: float
    weight: int
    feature: str = "regular"


@dataclass(frozen=True)
class ModeSpec:
    name: str
    title: str
    description: str
    cost: float
    is_feature: bool
    is_buybonus: bool
    outcomes: Tuple[OutcomeSpec, ...]


def _smooth_feature_outcomes(cost: int, feature: str) -> Tuple[OutcomeSpec, ...]:
    """Create an exact 96% feature profile with a controlled one-in-a-million cap."""
    fixed = [
        ("quarter", 25 * cost, 100_000),
        ("half", 50 * cost, 100_000),
        ("stake", 100 * cost, 150_000),
        ("one_and_half", 150 * cost, 150_000),
        ("double", 200 * cost, 99_999),
        ("two_and_half", 250 * cost, 99_900),
        ("max_win", 1_500_000, 1),
    ]
    target = 96 * cost * TOTAL_WEIGHT
    current = sum(payout_int * weight for _, payout_int, weight in fixed)
    remaining_value = target - current
    extra_weight, remainder = divmod(remaining_value, 250 * cost)
    crumb_weight, exact_remainder = divmod(remainder, 10)
    if exact_remainder:
        raise ValueError(f"Profile for {feature} cannot be represented in 0.1x increments")
    used = sum(weight for _, _, weight in fixed) + extra_weight + crumb_weight
    loss_weight = TOTAL_WEIGHT - used
    if loss_weight < 0:
        raise ValueError(f"Profile for {feature} exceeds total weight")

    rows = [("loss", 0, loss_weight), *fixed]
    if extra_weight:
        rows.append(("two_and_half_tuning", 250 * cost, extra_weight))
    if crumb_weight:
        rows.append(("exact_rtp_tuning", 10, crumb_weight))
    return tuple(
        OutcomeSpec(key, payout_int / 100, weight, feature)
        for key, payout_int, weight in rows
        if weight
    )


BASE_OUTCOMES = (
    OutcomeSpec("loss", 0, 602_597),
    OutcomeSpec("small_win", 0.4, 190_000),
    OutcomeSpec("ways_win", 0.9, 120_000),
    OutcomeSpec("expanding_wild", 3.0, 60_000, "expanding_wild"),
    OutcomeSpec("sealed_will", 10.0, 20_000, "sealed_will"),
    OutcomeSpec("vault_echoes", 20.0, 5_000, "vault_echoes"),
    OutcomeSpec("midnight_seance", 40.0, 2_000, "midnight_seance"),
    OutcomeSpec("final_codicil", 500.0, 402, "final_codicil"),
    OutcomeSpec("max_win", 15_000.0, 1, "final_codicil"),
)

ANTE_OUTCOMES = (
    OutcomeSpec("loss", 0, 513_869),
    OutcomeSpec("small_win", 0.4, 200_000),
    OutcomeSpec("ways_win", 1.2, 140_000),
    OutcomeSpec("expanding_wild", 3.6, 80_000, "expanding_wild"),
    OutcomeSpec("sealed_will", 10.0, 35_000, "sealed_will"),
    OutcomeSpec("vault_echoes", 25.0, 15_000, "vault_echoes"),
    OutcomeSpec("midnight_seance", 50.0, 14_680, "midnight_seance"),
    OutcomeSpec("final_codicil", 600.0, 1_450, "final_codicil"),
    OutcomeSpec("max_win", 15_000.0, 1, "final_codicil"),
)

MODE_SPECS = (
    ModeSpec("BASE", "Base Game", "1024 ways with natural feature triggers.", 1, True, False, BASE_OUTCOMES),
    ModeSpec(
        "HEIRLOOM_ANTE",
        "Heirloom Ante",
        "Three-times stake with increased feature frequency.",
        3,
        True,
        False,
        ANTE_OUTCOMES,
    ),
    ModeSpec(
        "SEALED_WILL_BUY",
        "Sealed Will",
        "Eight free spins; expanding wild reels remain active for the spin.",
        80,
        False,
        True,
        _smooth_feature_outcomes(80, "sealed_will"),
    ),
    ModeSpec(
        "VAULT_ECHOES_BUY",
        "Vault Echoes",
        "Six lock-and-respin rounds with collected key prizes.",
        140,
        False,
        True,
        _smooth_feature_outcomes(140, "vault_echoes"),
    ),
    ModeSpec(
        "MIDNIGHT_SEANCE_BUY",
        "Midnight Seance",
        "Ten free spins with a possessed expanding reel.",
        200,
        False,
        True,
        _smooth_feature_outcomes(200, "midnight_seance"),
    ),
    ModeSpec(
        "FINAL_CODICIL_BUY",
        "Final Codicil",
        "A three-act sequence combining Will, Vault, and Seance.",
        300,
        False,
        True,
        _smooth_feature_outcomes(300, "final_codicil"),
    ),
)


def validate_profiles() -> None:
    for mode in MODE_SPECS:
        total_weight = sum(outcome.weight for outcome in mode.outcomes)
        weighted_payout_int = sum(round(outcome.payout * 100) * outcome.weight for outcome in mode.outcomes)
        expected = round(RTP * mode.cost * 100 * TOTAL_WEIGHT)
        assert total_weight == TOTAL_WEIGHT, (mode.name, total_weight)
        assert weighted_payout_int == expected, (mode.name, weighted_payout_int, expected)
        assert max(outcome.payout for outcome in mode.outcomes) == WIN_CAP
        assert min((outcome.payout for outcome in mode.outcomes if outcome.payout), default=0) >= 0.1


validate_profiles()
