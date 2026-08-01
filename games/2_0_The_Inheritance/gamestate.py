"""SDK state-class shim; production books are generated deterministically."""

from game_override import GameStateOverride


class GameState(GameStateOverride):
    """The game has no feature or collection state outside a single book."""

    pass
