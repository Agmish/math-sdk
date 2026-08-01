# The Inheritance asset bank

Runtime visuals and audio are bundled with the static frontend and indexed in
the asset manifests. The production build uses relative URLs so the complete
archive can be hosted below its assigned Stake Engine CDN game/version path.

- `blackthorn-hall.webp`: 16:9 hand-inked/gouache environment.
- `symbols/*.webp`: twelve picture symbols cropped from the authored atlas.
- `features/*.webp`: four chapter illustrations cropped from the authored feature atlas.
- `audio/music-inheritance.ogg`: the user's earlier Inheritance score, imported
  and looped by `tools/import_legacy_audio.py`.
- `audio/spin-whisper.wav` and `audio/omen-tease.wav`: signature effects from
  the user's earlier Inheritance build.
- remaining `audio/*.wav`: original project-generated cabinet and result cues.

The PNG source atlases are retained under `art/source/` as crop and authorship references.
Detailed soundtrack provenance is retained in `audio/MUSIC-LICENSES.md`.
