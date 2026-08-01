# Stake submission readiness

## Complete

- [x] Original second-pass theme, title treatment, conservatory background, symbol bank, and feature art
- [x] Original art sources retained for twelve picture symbols, four feature scenes, and the environment
- [x] Twelve picture symbols; no rank letters or text-only reel symbols
- [x] Four distinct bonus systems plus an expanding base wild
- [x] Expanding Wild lands, locks, spreads vertically, reveals its multiplier, then evaluates the win
- [x] Feature purchase launches the selected round immediately after confirmation
- [x] Every round uses five individually timed reel stops with cabinet movement and landing feedback
- [x] Free-spin rounds retain remaining-spin, mechanic, multiplier, and total-win state
- [x] Vault hold-and-respin state shows locked positions and the three-reset counter together
- [x] Final Codicil shows the active Will, Vault, or Séance stage throughout the round
- [x] Feature rules, trigger explanation, mode cost, theoretical RTP, and max win
- [x] Picture paytable with 3/4/5-symbol payouts
- [x] Special-symbol values and behavior
- [x] RGS-provided bet-level support
- [x] Balance, bet, total cost, win, max bet, rules, feature menu, and sound controls
- [x] Spacebar spin and Escape modal close
- [x] No one-click automatic consecutive betting
- [x] Buy confirmation shows exact total, RTP, max, and no-guaranteed-win wording
- [x] `social=true` replaces restricted buy/bet wording in player-facing controls
- [x] Replay URL parsing and event-book hydration
- [x] Desktop, 390 px mobile, and compact responsive layouts
- [x] No horizontal mobile overflow
- [x] No broken image, audio, favicon, or network requests in visual smoke tests
- [x] Original 44.1 kHz stereo chamber score and sixteen event-specific effects
- [x] Humanized pitch variation for repeated buttons, reel stops, value locks, and collections
- [x] 100,000 static outcomes for each of six modes
- [x] Exact integer-weighted 96.00% RTP for every mode
- [x] 15,000× max-win specimen in every mode
- [x] zStandard JSONL books, CSV lookup tables, and `index.json`
- [x] Byte-level payout equality between every book and lookup row
- [x] No jackpots, cross-round persistent progression, gamble, continuation, or early cashout
- [x] No Stake branding in game assets
- [x] No children or child-like characters
- [x] No runtime third-party calls
- [x] Dependency audit reports zero known vulnerabilities

## Account-specific production steps

- [ ] Assign the final Stake provider number and ACP game/version IDs
- [ ] Upload image and audio files to the Stake Engine CDN
- [ ] Replace local `/assets/...` development URLs with returned CDN URLs
- [ ] Run the official Stake Math SDK `execute_all_tests` workflow
- [ ] Upload the six-mode `publish_files` set through ACP
- [ ] Confirm all supported currencies and team-selected languages in ACP
- [ ] Capture ACP replay URLs for loss, normal win, each feature, big win, and max win
- [ ] Attach the asset ledger and final commercial-use evidence to the review request
- [ ] Freeze frontend and math versions before requesting approval

## Reviewer blurb

The Inheritance is a hand-painted 1,024-ways 1920s mystery set in Blackthorn
Estate. Sequential cabinet stops and expanding Wax Seal Wilds lead into three
distinct features: a clause-changing free-spins will, a hold-and-respin estate
vault, and a roaming reel-possession séance. The premium Final Codicil combines
all three in one stateless cinematic round.
