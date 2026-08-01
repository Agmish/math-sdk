# Stake Engine 59-item evidence matrix

This matrix separates evidence produced by the repository from actions only Stake staff or ACP can complete. `PASS` means the repository contains a repeatable automated or reviewed check. `READY` means the artifact is prepared but must be checked in ACP. `EXTERNAL` means code cannot truthfully complete the item.

| # | Requirement | Status | Evidence |
|---:|---|---|---|
| 1 | Valid launch authenticates with RGS | PASS | `frontend/tools/rgs_acceptance.mjs` asserts successful Authenticate and enabled play. |
| 2 | Invalid `rgs_url` or session fails safely | PASS | Acceptance test returns `ERR_ATE`, displays the runtime error, and keeps play disabled. |
| 3 | Spin control sends Play | PASS | Acceptance test records exactly one `/wallet/play` request. |
| 4 | No Stake Engine Loader | PASS | `release_tools.py` scans the production build for the loader string. |
| 5 | Unique title and no restricted title terms | READY | Title is `The Inheritance`; final uniqueness review belongs to Stake compliance. |
| 6 | Appropriate assets and imagery | PASS | Original Blackthorn estate artwork was visually reviewed in the 22-shot smoke set. |
| 7 | Sufficiently distinct title and series | READY | Original contract, symbols, layout, and feature art are supplied; Stake makes the final catalogue comparison. |
| 8 | Thumbnail meets artwork guidelines | READY | Square high-resolution master: `frontend/public/assets/marketing/the-inheritance-thumbnail-master.png`; run the ACP artwork validator before publishing. |
| 9 | Uses all Authenticate betting parameters | PASS | Unit and RGS tests cover `minBet`, `maxBet`, `stepBet`, `defaultBetLevel`, and the exact `betLevels` array. |
| 10 | Restores active-round amount and mode | PASS | Acceptance test restores 0.02 and the mode without another Play request. |
| 11 | Supports and displays currencies | PASS | Standard ISO currency formatting plus SC/GC social-token display is unit tested. |
| 12 | Displays sub-cent payouts | PASS | Six-decimal result formatting is unit tested. |
| 13 | Zero-return round sends no EndRound | PASS | Acceptance and unit tests assert zero EndRound calls. |
| 14 | Insufficient balance sends no Play | PASS | Acceptance test disables play and records no request. |
| 15 | Main game frame is not scrollable | PASS | Desktop, 390×844, and 320×568 layout assertions verify viewport fit. |
| 16 | Space bar is bound to spin | PASS | Keyboard handler prevents scrolling and invokes the same round action when jurisdiction permits. |
| 17 | Rules state RTP and maximum win | PASS | Rules show 96.00% RTP and 15,000× when jurisdiction permits RTP display. |
| 18 | Payout per picture symbol is clear | PASS | Picture award table is generated from the canonical five-symbol paytable. |
| 19 | Win combinations are explained | PASS | Rules explain 3+ matching pictures on adjacent reels from reel one and 1,024-ways multiplication. |
| 20 | Modes include descriptions and costs | PASS | Six modes and 1×/3×/80×/140×/200×/300× costs come from the shared contract. |
| 21 | Free-game and retrigger conditions are clear | PASS | Rules state 8 Will spins (+2), 6 Vault reveals, 10 Séance spins (+2), and the 11-stage Codicil. |
| 22 | General disclaimer is present | PASS | Rules state independent outcomes, no guaranteed result, and long-run RTP. |
| 23 | Desktop/laptop works | PASS | 1440×1000 production screenshot and interaction smoke pass. |
| 24 | Popout S/L works | PASS | Replay and game layouts are exercised at compact and large popout-compatible viewports. |
| 25 | Mobile works | PASS | 390×844 production interaction smoke passes. |
| 26 | Mobile double-tap zoom is disabled | PASS | Fixed viewport meta disables scaling and the game surface uses controlled touch behavior. |
| 27 | Auto play requires confirmation | PASS | Auto Bet/Auto Play opens a fixed-round confirmation before starting and exposes Stop. |
| 28 | High-cost modes require confirmation | PASS | Ante and all four feature modes require explicit confirmation. |
| 29 | Interaction guide is in game information | PASS | Rules include spin, amount, Ante, feature, autoplay, stop, mute, and space-bar instructions. |
| 30 | Sounds can be disabled | PASS | Always-visible Sound On/Off control mutes both music and effects. |
| 31 | English is supported | PASS | English is the canonical copy. |
| 32 | Invalid language does not break display | PASS | Unsupported language values fall back to English. |
| 33 | Five wins per mode match rules | PASS | Math verification records five independently checked examples for every mode. |
| 34 | Mystery probabilities are accurate | PASS | No Mystery Mode is present; probability figures shown for existing modes come from the generated contract. |
| 35 | Stake.US social translation is compliant | PASS | Dedicated social-mode UI and restricted-word browser scan cover controls, features, confirmations, rules, errors, and replay. |
| 36 | Social spin button does not say Bet | PASS | The action is labelled Spin. |
| 37 | Social game information has no restricted words | PASS | Browser scan covers every rules tab in social mode. |
| 38 | Social amount field is not labelled Bet Amount | PASS | It is labelled Play. |
| 39 | Social autoplay avoids Bet terminology | PASS | It is labelled Auto Play. |
| 40 | Social feature label avoids BUY | PASS | It is labelled Features / Play Feature. |
| 41 | Social confirmation avoids restricted terms | PASS | Confirmation copy is transformed and browser-scanned. |
| 42 | Social insufficient-balance error avoids restricted terms | PASS | Error uses `not enough balance`. |
| 43 | SC and GC currencies are supported | PASS | XSC/XGC API codes display as SC/GC. |
| 44 | Social currency has no `$` prefix | PASS | SC/GC formatting is unit tested without a symbol prefix. |
| 45 | Social mode naming follows guidelines | PASS | Player-facing social labels use Play Feature and Play Amount. |
| 46 | Social replay avoids restricted terms | PASS | Replay copy is browser-tested in social mode. |
| 47 | English only in Social Mode | PASS | No alternative-language bundle is shipped. |
| 48 | Replay URL loads the requested event | PASS | Acceptance test calls `/bet/replay/<event>` and presents the returned published book. |
| 49 | Replay supports optional parameters | PASS | Test URL supplies game, version, mode, event, amount, currency, language, device, and social mode. |
| 50 | Replay can play the event again | PASS | Play and Play Again are exercised twice. |
| 51 | Replay shows cost and multiplier | PASS | Acceptance asserts 0.01 SC and the applied multiplier in the banner. |
| 52 | Replay supports Popout S | PASS | Replay is exercised at 360×640 without standard controls. |
| 53 | Bet-level template applied | EXTERNAL | Configure the 0.01–300 template in ACP; runtime will consume the returned levels. |
| 54 | Provably Fair and Replay enabled | EXTERNAL | Enable both switches in ACP after version publication. |
| 55 | Front and Math requests approved | EXTERNAL | Stake reviewers must approve both requests. |
| 56 | Posted in approved Slack channel | EXTERNAL | Stake release workflow action. |
| 57 | Works on older Android and iOS | READY | 320×568 browser gate passes; physical-device sign-off remains manual. |
| 58 | Approval request closed and emoji added | EXTERNAL | Stake/Slack workflow action. |
| 59 | Game released | EXTERNAL | Final release action after Stake approval. |

## Exact ACP selections

- Math: `games/2_0_The_Inheritance/library/publish_files`
- Front End: `games/2_0_The_Inheritance/frontend/dist`

The Math selection must show `index.json` immediately. The Front End selection must show `index.html` immediately. Do not select the parent folders and do not upload the repository or a nested ZIP as either version.
