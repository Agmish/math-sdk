# Stake Engine submission scope

## Math package — verified

- six mode names, costs, and file references agree;
- all referenced book and lookup files exist;
- each mode contains 100,000 production outcomes;
- book IDs, payout arrays, and lookup rows agree;
- every mode is exactly 96.00% RTP;
- every mode is capped at 15,000×;
- each weight range totals 1,000,000;
- payout values are valid unsigned integer hundredths in 0.10× increments;
- every feature bet has distinct, complete event sequences;
- expanding wild animation events exist in base, ante, Will, and Codicil results;
- force records and SHA-256 references exist and validate;
- the canonical publication folder is stateless and contains one RTP profile;
- the official Math SDK RGS verification completes successfully.

## Frontend and RGS package — verified

- successful and failed authentication are covered by the RGS acceptance gate;
- live Play, winning settlement, zero-return settlement, insufficient balance, and active-round restore are tested;
- dynamic bet levels, six-decimal currencies, sub-cent display, and SC/GC formatting are tested;
- published-book rendering powers new rounds, restored rounds, and replay;
- autoplay confirmation, high-cost confirmation, keyboard behavior, sound controls, and jurisdiction flags are tested;
- desktop, popout, 390×844, and 320×568 layouts pass the production visual gate;
- Stake.US terminology is scanned in the built social-mode experience;
- the production build and its exact `dist` publication root pass the release scan.

## External completion

ACP configuration and Stake-staff decisions remain external: the 0.01–300 bet-level template, artwork-validator sign-off, physical older-device checks, Provably Fair and Replay switches, Front and Math approvals, Slack notification, and the final release. These are recorded as `READY` or `EXTERNAL` in `STAKE_ENGINE_59_CHECKLIST.md`; they are not represented as completed by repository files.
