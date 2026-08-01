# The Inheritance

**A Blackthorn Estate Mystery** — an original 5×4, 1,024-ways slot built for
the Stake Engine frontend/RGS contract.

This rebuild answers the previous submission feedback directly:

- twelve cohesive hand-painted picture symbols; no card-rank or text-only reel symbols
- a second-pass gouache-and-pen visual direction with brush texture, crosshatching, and imperfect print grain
- four genuinely different feature systems
- expanding wild reels, individually timed reel stops, lock and collection
  motion, count-up win tiers, anticipation, and mobile/mini-player layouts
- a true moving picture-symbol reel strip plus four original animated WebP
  chapter films for bonus entry, retriggers, and Codicil stage changes
- five CC0 mystery scores with chapter crossfades plus nineteen original 44.1 kHz stereo effects
- adaptive music ducking under wild, collection, and major-win stingers; loss
  outcomes do not receive celebratory win audio
- sequential free-spin and respin presentation with persistent counters,
  feature intros, stage transitions, and completion summaries
- six exact 96.00% modes, each with 100,000 static event books

## Feature set

1. **Wax Seal Wild** — substitutes and expands over a complete reel.
2. **The Sealed Will** — Testament free spins with Widow’s Share, Outsider’s
   Clause, or Secret Heir behavior.
3. **Vault of Echoes** — hold-and-respin estate values with a three-respin reset.
   The final collection visibly sums every locked value; it is explicitly not a jackpot.
4. **Midnight Séance** — ancestral Mirrors possess reels and escalate a spirit
   multiplier only when the spirit visits a new reel.
5. **The Final Codicil** — a premium single-round sequence combining Will,
   Vault, and Séance without persistent state.

## Commands

```text
npm install
npm run dev
npm run verify
npm run visual:smoke
```

`npm run verify` regenerates 600,000 math books, checks every compressed book
against its lookup payout, type-checks the client, runs gameplay/asset/RGS
tests, and creates the production frontend build.

## Stake boundaries

- Frontend app manifest: `apps/the-inheritance/app.manifest.json`
- RGS publish set: `games/the_inheritance/library/publish_files`
- Math generator: `math/inheritance_model.py`
- Byte-level publication verifier: `math/verify_publish.py`
- Production frontend: `dist`

The runtime accepts Stake launch parameters such as `sessionID`, `rgs_url`,
`lang`, `device`, `social`, and `replay`. It passes the selected uppercase mode
ID and base bet to `RGSClient.Play`, uses RGS-provided bet levels, closes each
round, and hydrates returned event arrays into the visual book contract.

On localhost, every base spin and purchased feature is drawn from the same
one-million-weight outcome table used to build the publication files. Losses,
below-cost returns and profitable rounds are all possible. The interface labels
this as local weighted math. Connected Stake/RGS play always presents the
server-supplied result.

Music provenance and CC0 source links are recorded in
`public/assets/audio/MUSIC-LICENSES.md`.

## Locked math profile

Every mode has 96.00% theoretical RTP and a 4.00% theoretical house edge.
Feature payout multipliers apply to the base bet, while mode cost is the base
bet multiplied by the listed cost. A positive return can therefore still be a
net loss when it is below the mode cost.

| Mode | Cost | RTP | Max | Static books |
|---|---:|---:|---:|---:|
| `BASE` | 1× | 96.00% | 15,000× | 100,000 |
| `HEIRLOOM_ANTE` | 3× | 96.00% | 15,000× | 100,000 |
| `SEALED_WILL_BUY` | 80× | 96.00% | 15,000× | 100,000 |
| `VAULT_ECHOES_BUY` | 100× | 96.00% | 15,000× | 100,000 |
| `MIDNIGHT_SEANCE_BUY` | 120× | 96.00% | 15,000× | 100,000 |
| `FINAL_CODICIL_BUY` | 300× | 96.00% | 15,000× | 100,000 |

### Casino risk profile

| Mode | Zero return | Return below cost | Profitable round |
|---|---:|---:|---:|
| `BASE` | 60.260% | 91.260% | 8.740% |
| `HEIRLOOM_ANTE` | 52.049% | 86.049% | 13.951% |
| `SEALED_WILL_BUY` | 31.884% | 81.894% | 18.106% |
| `VAULT_ECHOES_BUY` | 39.978% | 67.984% | 14.016% |
| `MIDNIGHT_SEANCE_BUY` | 42.967% | 83.967% | 16.033% |
| `FINAL_CODICIL_BUY` | 52.013% | 69.000% | 31.000% |

Payout multipliers use the Stake SDK integer convention: 100 units = 1.00×.
The generator verifies the published one-million-row weights directly in
integer space, so every mode is exactly 96.00%, not a rounded simulation estimate
or a hidden post-generation rebalance.

`math/generated/publish_manifest.json` records the size and SHA-256 digest of
every file in the upload set so the verified artifacts can be checked again
after transfer.

## Production gates

The project is submission-shaped, but two account-specific steps remain:

1. upload final image/audio assets to the Stake Engine CDN and remap the local
   development paths
2. run the official Stake Math SDK/ACP upload and format-verification workflow
   under the team’s provider/game IDs

Do not alter feature rules or math after approval; Stake treats approval as tied
to specific frontend and math versions.

## Reference documentation

- Stake Engine approval guidelines: https://stake-engine.com/docs/approval-guidelines
- Frontend communication checks: https://stake-engine.com/docs/approval-guidelines/front-end-communication
- Math quick start: https://stake-engine.com/docs/math/quick-start
- Static math file format: https://stake-engine.com/docs/math/math-file-format
- Official Math SDK: https://github.com/StakeEngine/math-sdk
