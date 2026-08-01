"""Compatibility layer for the SDK inheritance chain."""

from game_calculations import GameCalculations


class GameExecutables(GameCalculations):
    """No persistent executable state is used by the publication pipeline."""

    pass
