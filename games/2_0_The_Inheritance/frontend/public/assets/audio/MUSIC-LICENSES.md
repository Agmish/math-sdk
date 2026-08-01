# Audio provenance

The principal soundtrack and two signature effects come from the user's earlier
**The Inheritance** build:

| Runtime asset | User-provided source |
| --- | --- |
| `music-inheritance.ogg` | `source-audio/The Inheritance.mp3` |
| `spin-whisper.wav` | `source-audio/Inheritance Spin.mp3` |
| `omen-tease.wav` | `source-audio/scatter landing.mp3` |

`tools/import_legacy_audio.py` preserves the composition, creates a seamless
loop, normalizes browser loudness, and converts the two effects to 44.1 kHz
stereo PCM. The same full-length score is used for every game mode; bonus
features enter at different movements of the recording.

The remaining cabinet cues are original project-generated effects with no
third-party samples. Rights for the three user-provided recordings remain with
the user and should be retained with the Stake Engine submission records.
