# Game design — The Inheritance

## Creative pillar

Blackthorn Estate is a 1920s adult gothic mystery about a contested will. The
visual language borrows from period editorial illustration, not from another
slot: ink crosshatching, gouache bloom, rubbed brass, paper fiber, and slightly
irregular framing. The game avoids mythological/fantasy shorthand and does not
use existing provider characters, logos, UI, or trademarked feature names.

The three adult anchors are the Heiress, the Executor, and the veiled Ancestor.
The remaining symbols are estate objects with narrative function. There are no
children, child-like characters, card ranks, or text-only reel symbols.

## Base game

- 5 reels × 4 rows
- 1,024 adjacent-reel ways
- regular wins begin on reel one and require 3+ matching symbols
- Wax Seal Wild substitutes for regular symbols
- an activated Wax Seal expands across its reel
- Testament, Vault, and Mirror are three different scatter families

## Feature 1 — The Sealed Will

Ten free spins begin with one clause:

- **Widow’s Share:** expanding Wax Seals remain sticky in the event sequence.
- **Outsider’s Clause:** every new wild raises the feature multiplier.
- **Secret Heir:** a low-value symbol transforms on each reveal.

The clause is carried inside the same static result book. It is not selected
from prior player history and does not persist after the round.

## Feature 2 — Vault of Echoes

Six estate positions begin locked. Three respins reset whenever a new estate
value locks. Values are collected only inside the same result. Master-key events
can upgrade values. The feature has no progressive or fixed jackpot language.

## Feature 3 — Midnight Séance

Eight initial spins use the Ancestral Mirror to possess reels. A possessed reel
is rendered with spectral ink and becomes wild for its reveal. Additional
possessions raise the spirit multiplier. The returned result-book ID and feature
metadata seed the presentation sequence, so replay reconstructs the same reel
indices, counters, multipliers, and frame payouts.

## Feature 4 — The Final Codicil

One 300× independent bet contains three cinematic phases:

1. five Will reveals build Wax Seal pressure
2. three-reset Vault respins collect estate values
3. three Séance reveals possess the most valuable reels

The UI shows a Will → Vault → Séance timeline. All phases are delivered in one
book, so the feature complies with the stateless rule.

## Engagement principles

Engagement comes from readable feature identity, authored audiovisual feedback,
short-term anticipation, and surprising mechanic combinations. The design does
not use loss-chasing prompts, fake urgency, misleading near-miss declarations,
automatic consecutive bets, concealed costs, persistent pseudo-progress, or
claims that a win is due. Feature confirmations show cost, RTP, maximum win, and
the fact that starting a feature does not guarantee a win.

## Event vocabulary

- `reveal`
- `resultMeta`
- `presentationPlan`
- `clauseSelected`
- `expandWild`
- `vaultState`
- `seancePossess`
- `codicilFusion`
- `winInfo`
- `setTotalWin`
- `finalWin`
- `bookComplete`

Every event has a monotonically increasing index and replay books end with
`bookComplete`.
