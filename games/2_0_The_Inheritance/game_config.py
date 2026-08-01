"""Stake Math SDK configuration for The Inheritance."""

import os

from src.config.betmode import BetMode
from src.config.config import Config
from src.config.distributions import Distribution

from math_profile import MODE_SPECS, RTP, WIN_CAP


class GameConfig(Config):
    """Single source of truth for the submitted six-mode game."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = "2_0_The_Inheritance"
        self.provider_name = "Agmish"
        self.provider_number = 2
        self.game_name = "The Inheritance"
        self.working_name = "The Inheritance"
        self.output_regular_json = False
        self.min_denomination = 0.01
        self.wincap = WIN_CAP
        self.win_type = "ways"
        self.rtp = RTP
        self.construct_paths()

        self.num_reels = 5
        self.num_rows = [4] * self.num_reels
        self.include_padding = True
        self.paytable = {
            (5, "CROWN"): 20.0,
            (4, "CROWN"): 5.0,
            (3, "CROWN"): 1.0,
            (5, "PORTRAIT"): 10.0,
            (4, "PORTRAIT"): 2.5,
            (3, "PORTRAIT"): 0.5,
            (5, "RING"): 5.0,
            (4, "RING"): 1.5,
            (3, "RING"): 0.3,
            (5, "WATCH"): 3.0,
            (4, "WATCH"): 0.8,
            (3, "WATCH"): 0.2,
            (5, "LETTER"): 2.0,
            (4, "LETTER"): 0.5,
            (3, "LETTER"): 0.1,
        }
        self.special_symbols = {
            "wild": ["WILD"],
            "scatter": ["SCATTER"],
            "bonus": ["KEY"],
            "multiplier": [],
        }
        self.freespin_triggers = {
            self.basegame_type: {3: 8, 4: 10, 5: 12},
            self.freegame_type: {3: 3, 4: 4, 5: 5},
        }
        self.anticipation_triggers = {self.basegame_type: 2, self.freegame_type: 2}

        reels = {"BR0": "BR0.csv", "FR0": "FR0.csv"}
        self.reels = {
            name: self.read_reels_csv(os.path.join(self.reels_path, filename))
            for name, filename in reels.items()
        }
        self.padding_reels = {"basegame": self.reels["BR0"]}
        self.bet_modes = [self._make_bet_mode(mode) for mode in MODE_SPECS]
        self.opt_params = {mode.name: None for mode in MODE_SPECS}

    def _make_bet_mode(self, mode):
        distributions = []
        for outcome in mode.outcomes:
            distributions.append(
                Distribution(
                    criteria=outcome.key,
                    fixed_amt=max(1, outcome.weight),
                    win_criteria=outcome.payout,
                    conditions={
                        "reel_weights": {
                            self.basegame_type: {"BR0": 1},
                            self.freegame_type: {"FR0": 1},
                        }
                    },
                )
            )
        return BetMode(
            name=mode.name,
            cost=mode.cost,
            rtp=RTP,
            max_win=WIN_CAP,
            auto_close_disabled=False,
            is_feature=mode.is_feature,
            is_buybonus=mode.is_buybonus,
            distributions=distributions,
        )
