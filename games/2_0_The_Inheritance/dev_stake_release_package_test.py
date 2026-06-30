"""Build or validate standalone Stake release packages for The Inheritance.

Run after RTP generation. Each package contains its own index, lookups, books,
configs, event schemas, and a release manifest so it can be delivered without
relying on sibling folders.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from release_package import RELEASE_ROOT, build_release_packages, validate_release_package
from rtp_profiles import SUPPORTED_RTP_PERCENTAGES


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profiles",
        nargs="+",
        type=int,
        default=list(SUPPORTED_RTP_PERCENTAGES),
        choices=SUPPORTED_RTP_PERCENTAGES,
        help="RTP editions to build or validate.",
    )
    parser.add_argument(
        "--build",
        action="store_true",
        help="Rebuild packages before validating them.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.build:
        build_release_packages(args.profiles)

    for percentage in args.profiles:
        release_dir = RELEASE_ROOT / f"rtp_{percentage}"
        validation = validate_release_package(release_dir)
        print(
            f"The Inheritance release package OK: rtp_{percentage} "
            f"({len(validation['files'])} files, target RTP {validation['targetRtp']})"
        )


if __name__ == "__main__":
    main()
