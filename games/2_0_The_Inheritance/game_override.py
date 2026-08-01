"""Stateless SDK game-state compatibility class."""

from game_executables import GameExecutables


class GameStateOverride(GameExecutables):
    """Intentionally contains no cross-round or player-persistent state."""

    pass
