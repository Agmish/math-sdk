# Verification report

## Automated

- Svelte/TypeScript diagnostics: 0 errors, 0 warnings
- Gameplay, presentation, math, RGS, and asset tests: 21 passing
- Dependency audit: 0 known vulnerabilities
- Production build: passed
- Runtime resources: all image and WAV manifest entries exist locally
- Audio quality: 44.1 kHz stereo headers verified for the music loop and sixteen effects
- Browser console/network: no errors or failed resources

## Math publication

- 6 modes
- 100,000 books per mode
- 600,000 total event books
- every JSONL book compressed with zStandard
- every book ID present in its CSV lookup table
- every book payout equals the CSV payout integer
- every mode exactly 96.00% after mode cost
- every mode includes a 15,000× specimen

## Visual scenarios

The visual smoke flow captures:

1. desktop base game
2. desktop feature menu
3. desktop buy confirmation
4. Sealed Will feature intro
5. animated expanding Wax Seal Wild reel
6. Vault of Echoes locked-value respin state with a sequential reel still in motion
7. Midnight Séance possessed-reel expansion
8. Final Codicil stage tracker
9. rules and paytable
10. 390×844 mobile base game
11. 390×844 mobile feature menu

The 390 px layout has no horizontal overflow and renders exactly 5 reels and 20
picture-symbol images. The bonus menu exposes exactly four complete feature
rounds on desktop and mobile.

The live sequence additionally verifies individual reel-stop timing, final-reel
anticipation, Vault lock animation, multiplier-rise feedback, separate small
and large win tiers, and Codicil chapter transitions.
