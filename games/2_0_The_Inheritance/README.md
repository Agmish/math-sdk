# The Inheritance — Stake Math SDK package

This directory is the single 96.00% RTP math source for **The Inheritance**. It replaces the incompatible legacy package that used a 5×5 line game, three lower-case modes, multiple RTP folders, and player-persistent collection state.

## Submission contract

- Game ID: `2_0_The_Inheritance`
- Layout: 5 reels × 4 rows
- Evaluation: 1,024 ways
- RTP: exactly 96.00% in every mode
- Maximum win: 15,000.00×
- Minimum denomination: 0.01
- Weight range: exactly 1,000,000 per mode
- Book count: 100,000 per mode (the current production recommendation)
- Payout encoding: integer hundredths, minimum non-zero value 10, increments of 10
- Round model: stateless; a selected book contains the entire base/feature result
- Zero-win behavior: `autoEndRoundDisabled` is false for every mode

## Modes

| Mode | Cost | Interaction |
|---|---:|---|
| `BASE` | 1× | 1,024 ways, natural bonuses, expanding wild |
| `HEIRLOOM_ANTE` | 3× | Higher feature frequency, expanding wild |
| `SEALED_WILL_BUY` | 80× | 8 free spins with an expanding wild reel |
| `VAULT_ECHOES_BUY` | 140× | 6 lock-and-respin rounds with key prizes |
| `MIDNIGHT_SEANCE_BUY` | 200× | 10 free spins with a possessed reel |
| `FINAL_CODICIL_BUY` | 300× | Will, Vault, and Seance in one 11-frame sequence |

The complete probability profiles live in `math_profile.py`; generated books never contain hidden or cross-round player state.

## Generate and verify

From the repository root:

```powershell
python games/2_0_The_Inheritance/run.py
```

The command regenerates all books and lookup tables, checks the event semantics and hashes, then runs the Math SDK RGS verifier. Use this to validate without regenerating:

```powershell
python games/2_0_The_Inheritance/run.py --verify-only
```

Run the focused unit tests with:

```powershell
python -m unittest discover games/2_0_The_Inheritance/tests
```

## Uploadable math files

Publish Math in ACP by selecting `games/2_0_The_Inheritance/library/publish_files`. The selected folder has `index.json` directly at its root and contains:

- `index.json`
- one `books_<MODE>.jsonl.zst` per mode
- one `lookUpTable_<MODE>_0.csv` per mode

Do not select `library`, `release`, the game root, or a ZIP file. `release/math_manifest.json` is local integrity evidence and is deliberately outside the selected Math folder.

Publish Front End separately by selecting `games/2_0_The_Inheritance/frontend/dist`. The selected folder has `index.html` directly at its root.

Supporting backend, frontend, event, force, and verification files are in `library/configs` and `library/forces`. `library/configs/submission_verification.json` is the generated evidence report.

Math approval does not by itself approve frontend authentication, `/play` and `/end-round` transport, replay, responsive layout, language, sound, or jurisdiction wording. Those checks require the matching frontend/RGS integration build.
