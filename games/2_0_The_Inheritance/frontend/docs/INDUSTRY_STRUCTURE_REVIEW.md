# Industry structure review

This review studies interaction and feature architecture only. No provider art,
audio, source code, branded terminology, character, or exact interface was
copied into The Inheritance.

## Wanted Dead or a Wild

Official reference:
https://www.hacksawgaming.com/games/wanted-dead-or-a-wild

Structural lessons:

- The expanding-reel mechanic is the central promise, not a decorative effect.
  Its trigger, expansion, multiplier and win evaluation happen in a readable
  order.
- The three bonus rounds do not merely change their names. One keeps Wilds
  sticky, another increases the chance of multiple expanding reels, and the
  third uses collection followed by a separate payoff phase.
- Feature purchase is separated from ordinary bet selection and presents
  complete rounds as clearly differentiated choices.
- During a feature, the reels remain dominant while counters and multipliers
  occupy compact, persistent positions.

## Pragmatic Play feature patterns

Official references:

- 3 Buzzing Wilds:
  https://www.pragmaticplay.com/en/games/3-buzzing-wilds/
- Excalibur Unleashed overview:
  https://client.pragmaticplay.com/wp-content/uploads/2023/04/Excalibur-Unleashed.pdf
- Forging Wilds:
  https://www.pragmaticplay.com/en/games/forging-wilds/
- Gates of Olympus 1000:
  https://www.pragmaticplay.com/en/games/gates-of-olympus-1000/
- Big Bass Bonanza 1000:
  https://www.pragmaticplay.com/en/games/big-bass-bonanza-1000/

Structural lessons:

- A feature counter stays visible for the entire free-spin or respin sequence.
- Persistent Wild state is shown directly on the grid instead of explained only
  in a side panel.
- A bonus can offer alternate Wild behavior, but the active behavior is chosen
  or revealed before the first free spin and remains legible afterward.
- Hold-and-respin features show the reset counter and locked positions at the
  same time.
- Growing multipliers update after the event that changes them, preserving
  cause and effect.
- Gates keeps cascades, multipliers and free-spin progress visually separate,
  so even a busy chain reaction has a clear order.
- Big Bass uses visible Wild-collection milestones and retriggers to give a
  longer feature an understandable short-term objective.

## Le Bandit and current Stake patterns

Official references:

- Le Bandit:
  https://www.hacksawgaming.com/games/le-bandit
- Stake June 2026 highlights:
  https://stake.com/blog/june-casino-sports-betting-highlights-stats

Structural lessons:

- Le Bandit turns successful positions into persistent Golden Squares. The
  board visibly remembers progress instead of making the player recall it.
- Its three bonus levels escalate one mechanic in a predictable direction:
  persistent positions, then longer persistence, then guaranteed activation.
- Stake's June 2026 summary highlights current interest in cluster wins,
  multiplier Wilds, collect symbols, free spins and clearly purchasable bonus
  rounds. The useful pattern is immediate readability, not copying a theme.

## Applied to The Inheritance

The rebuild now uses:

1. a compact reel-first shell with balance, bet, ante, feature, spin and utility
   controls in one bottom rail
2. a staged Wax Seal sequence: land, lock, spread vertically, reveal the
   multiplier, evaluate the win
3. ten actual Sealed Will free-spin frames with one active clause
4. a visible three-reset Vault of Echoes hold-and-respin sequence
5. eight actual Midnight Séance free spins with a roaming possessed reel
6. an eleven-reveal Final Codicil with Will, Vault and Séance stage tracking
7. dedicated feature-intro and feature-complete states
8. a four-card feature-purchase menu that starts the selected round immediately
9. sequential five-reel stops with individual cabinet sounds and a slowed,
   illuminated stop when an expanding Seal is about to resolve
10. feature-specific event feedback for value locks, collections, multiplier
    rises, chapter transitions, small wins, large wins and maximum wins
11. persistent progress strips for free spins, Vault values and Codicil stages
12. a second-pass hand-painted art system covering twelve picture symbols,
    four feature scenes and the conservatory environment

## Originality guardrails

- The 1920s Blackthorn Estate setting, Wax Seal mechanic, clauses, estate
  objects, character art and color system are original to this project.
- Feature names and audiovisual assets do not use provider trademarks.
- Layout proportions, ornament, typography and animation are authored for this
  game rather than traced from a reference screenshot.
- Engagement is based on legibility, anticipation and mechanic progression,
  without loss-chasing prompts, fake urgency or misleading near-miss claims.
