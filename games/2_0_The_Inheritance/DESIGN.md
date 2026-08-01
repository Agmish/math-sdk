# Math design contract

## Probability source

`math_profile.py` is authoritative. Every mode has integer weights totaling 1,000,000. For a mode with cost `C`, its lookup table satisfies:

`sum(weight × payoutMultiplierInt) = 0.96 × C × 100 × 1,000,000`

`payoutMultiplierInt` is the RGS integer representation of an x-multiplier (100 = 1.00×). Each profile contains a 15,000× result at one-in-one-million weight and controlled middle outcomes to avoid making feature bets systematically favorable to the player.

## Stateless books

The RGS selects one book using its lookup weight. That book includes the complete result and final payout. No key collection, mansion level, legacy credit, progressive meter, or other player state crosses the round boundary.

Every book guarantees:

1. integer ID matching its lookup row;
2. sequential event indices beginning at zero;
3. 5×4 reveal boards;
4. monotonically increasing `setTotalWin` values;
5. a final `setTotalWin` and `finalWin` equal to `payoutMultiplier`;
6. an integer payout divisible by 10 and capped at 1,500,000 (15,000×).

## Feature event contracts

- Expanding Wild: `reveal → expandWild → expandedBoard → winInfo → finalWin`
- Sealed Will: trigger followed by complete free-spin updates and expanding wild events
- Vault Echoes: trigger followed by six reveal, lock-prize, and vault-state frames
- Midnight Seance: trigger followed by free-spin updates and possessed-reel events
- Final Codicil: codicil fusion followed by complete Will, Vault, and Seance stages

Feature bets with a zero payout still contain and display the complete purchased feature. A zero result is not left open: all modes use `autoEndRoundDisabled: false`.

## Determinism and reproducibility

Book variation uses a stable FNV-1a-derived seed from mode, ID, and outcome. Running the publisher twice with the same source and book count produces byte-identical lookup data and deterministic JSON content. Zstandard output, hashes, force descriptions, and release manifests are rebuilt together.
