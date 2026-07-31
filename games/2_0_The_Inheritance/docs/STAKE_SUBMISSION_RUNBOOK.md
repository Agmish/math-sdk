# The Inheritance — Stake Submission Runbook

## Purpose

Create one independent static-math submission folder for each approved RTP edition.
Every folder is self-contained: it includes the matching RTP lookup tables,
configuration, frontend configuration, compressed books, force artifacts, event
schemas, verification files, and a release manifest.

## Preconditions

Run from the repository root after installing the project dependencies.

```powershell
python -m pip install -r requirements.txt
```

The generated source artifacts must exist before packaging:

- `games/2_0_The_Inheritance/library/publish_files/books_*.jsonl.zst`
- `games/2_0_The_Inheritance/library/configs/event_config_*.json`
- all force files referenced by each generated `config.json`

## Build all RTP editions

```powershell
$env:THE_INHERITANCE_RTP='97'
python games/2_0_The_Inheritance/generate_rtp_profiles.py
```

This generates and validates:

```text
library/release/rtp_92
library/release/rtp_93
library/release/rtp_94
library/release/rtp_95
library/release/rtp_96
library/release/rtp_97
```

## Submission checks

Run both commands successfully before any upload:

```powershell
python games/2_0_The_Inheritance/dev_stake_release_package_test.py
python games/2_0_The_Inheritance/dev_release_package_runtime_smoke_test.py
```

The first check confirms that every file referenced by `index.json` and
`config.json` exists inside each release folder and matches its SHA-256 hash.
The second check opens the actual compressed books in each release folder and
confirms that every lookup-table book ID exists in that same package.

## Upload rule

Upload exactly one selected RTP folder as a complete unit. Do not upload only
its lookup tables or only its books. The frontend RTP setting must match the
release folder being deployed. RTP is a deployment choice and must never be
player selectable.

## Required evidence to retain

For the selected RTP edition, retain:

- the complete release folder;
- `release_manifest.json`;
- `RTP_PROFILE_VALIDATION.json`;
- console output from both submission checks;
- the generated frontend build configured for the same RTP edition.

## Stop conditions

Do not submit when any of the following occurs:

- a required force artifact is missing;
- an index/config file references a missing file;
- any SHA-256 verification fails;
- a lookup points to a missing book ID;
- the frontend RTP configuration differs from the selected release profile.
