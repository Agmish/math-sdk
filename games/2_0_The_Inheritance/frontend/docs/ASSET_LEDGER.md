# Asset ledger

## Visuals

All project visuals were created specifically for The Inheritance with the
built-in image-generation workflow, then cropped and color-finished locally.
No provider sample art, Stake branding, stock art, or third-party game assets
are used at runtime.

| Runtime asset | Source | Purpose |
|---|---|---|
| `blackthorn-hall.webp` | `blackthorn-conservatory-v2.png` | 16:9 conservatory environment |
| `heiress`, `executor`, `raven-key`, `stag` | `inheritance-characters-v2.png` | Four character picture symbols |
| `poison-ring`, `pocket-watch`, `candelabrum`, `lilies` | `inheritance-heirlooms-v2.png` | Four heirloom picture symbols |
| `testament`, `vault-scatter`, `seance-mirror`, `wax-wild` | `inheritance-specials-v2.png` | Four feature picture symbols |
| `features/*.webp` | `inheritance-features-v2.png` | Four narrative feature panels |

The source PNGs are retained under `art/source/`. `tools/prepare_assets.py`
contains the deterministic crop and WebP preparation steps.

### Second-pass environment prompt

Original welcoming 1920s manor conservatory at night; rain-streaked windows,
warm lamps, carved walnut, lilies and a distant grandfather clock; clear
central negative space for reels; hand-painted editorial gouache and pen with
brush edges, irregular crosshatching, paper tooth and imperfect color
registration; emerald, oxblood, parchment, brass and moonlit teal; no text,
logos, modern objects, trademarks, or glossy 3D styling.

### Picture-symbol prompts

Three exact 2×2 atlases covering the Heiress, Executor, raven and white stag;
emerald ring, midnight pocket watch, candelabrum and lilies; sealed Testament,
brass Vault, teal Séance Mirror and crimson Wax Wild. Every cell uses the same
emerald ground, imperfect brass cartouche, gouache brush texture and lively ink
line. No alphabet letters, captions, watermarks, children, trademarks, or
cross-cell overlap.

### Feature-scene prompt

Exact 2×2 feature atlas: Sealed Will at a green reading lamp, open Vault with
heirloom lockboxes, elegant Midnight Séance, and Final Codicil in the
conservatory. Hand-painted gouache and energetic pen line with distinct
narrative composition; no text, logos, UI, children, or copied slot art.

## Audio

The bundled chamber score and sixteen responsive effects are synthesized from
source by `tools/generate_audio.py`; no third-party samples are used. Every
runtime file is 44.1 kHz stereo. Repeated cabinet actions receive tiny playback
variations in the client so reel stops and locks do not sound mechanically
identical.

| Event | Runtime file |
|---|---|
| ambient chamber score | `music-blackthorn-loop.wav` |
| reel movement | `spin-whisper.wav` |
| individual reel stop | `reel-stop.wav` |
| expanding Wild | `wax-stamp.wav` |
| vault value lock | `vault-lock.wav` |
| value collection | `coin-collect.wav` |
| multiplier rise | `multiplier-rise.wav` |
| normal win | `win-chime.wav` |
| large win | `big-win.wav` |
| maximum win | `max-inheritance.wav` |
| button | `button-paper.wav` |
| anticipation | `omen-tease.wav` |
| Will intro | `will-open.wav` |
| Vault intro | `vault-open.wav` |
| Séance intro | `seance-rise.wav` |
| Codicil chapter transition | `chapter-turn.wav` |
| free-spin retrigger | `retrigger.wav` |

Final Suno or studio replacements may use the same filenames and event map so
no code or replay behavior changes.
