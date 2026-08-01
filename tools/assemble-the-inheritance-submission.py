"""Assemble the two exact Stake ACP roots plus auditable submission evidence."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / "games" / "2_0_The_Inheritance"
MATH_SOURCE = GAME_DIR / "library" / "publish_files"
FRONTEND_SOURCE = GAME_DIR / "frontend" / "dist"
SOURCE_MANIFEST = GAME_DIR / "release" / "submission_manifest.json"
CONTRACT = GAME_DIR / "game_contract.json"
CHECKLIST = GAME_DIR / "docs" / "STAKE_ENGINE_59_CHECKLIST.md"
ARTIFACT_ROOT = ROOT / "artifacts" / "the-inheritance-submission"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def directory_index(directory: Path) -> list[dict[str, int | str]]:
    files = []
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Submission bundle cannot contain symlinks: {path}")
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(directory).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )
    return files


def verify_inventory(manifest: dict, key: str, source_root: Path) -> None:
    records = manifest.get(key)
    if not isinstance(records, list):
        raise RuntimeError(f"Submission manifest is missing {key}")
    expected = {}
    for record in records:
        path = GAME_DIR / record["path"]
        try:
            relative = path.relative_to(source_root).as_posix()
        except ValueError as exc:
            raise RuntimeError(f"Manifest path escaped {source_root}: {path}") from exc
        expected[relative] = record
        if not path.is_file() or path.stat().st_size != record["size"]:
            raise RuntimeError(f"Submission file size validation failed: {path}")
        if sha256_file(path) != record["sha256"]:
            raise RuntimeError(f"Submission file hash validation failed: {path}")
    actual = {
        path.relative_to(source_root).as_posix()
        for path in source_root.rglob("*")
        if path.is_file()
    }
    if actual != set(expected):
        raise RuntimeError(f"Manifest inventory does not exactly match {source_root}")


def main() -> None:
    if not (MATH_SOURCE / "index.json").is_file():
        raise RuntimeError("Canonical Math root is missing index.json")
    if not (FRONTEND_SOURCE / "index.html").is_file():
        raise RuntimeError("Canonical Front End root is missing index.html")

    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    verify_inventory(manifest, "mathFiles", MATH_SOURCE)
    verify_inventory(manifest, "frontendFiles", FRONTEND_SOURCE)

    resolved_artifact = ARTIFACT_ROOT.resolve()
    resolved_workspace = ROOT.resolve()
    if not resolved_artifact.is_relative_to(resolved_workspace) or resolved_artifact == resolved_workspace:
        raise RuntimeError("Artifact output escaped the repository workspace")
    if ARTIFACT_ROOT.exists():
        shutil.rmtree(ARTIFACT_ROOT)

    math_target = ARTIFACT_ROOT / "math"
    frontend_target = ARTIFACT_ROOT / "frontend"
    evidence_target = ARTIFACT_ROOT / "evidence"
    shutil.copytree(MATH_SOURCE, math_target, symlinks=False)
    shutil.copytree(FRONTEND_SOURCE, frontend_target, symlinks=False)
    evidence_target.mkdir(parents=True)
    shutil.copy2(SOURCE_MANIFEST, evidence_target / "source-submission-manifest.json")
    shutil.copy2(CONTRACT, evidence_target / "game-contract.json")
    shutil.copy2(CHECKLIST, evidence_target / "stake-engine-59-checklist.md")

    bundle_manifest = {
        "schemaVersion": 2,
        "game": manifest["game"],
        "buildVersion": manifest["buildVersion"],
        "commit": os.getenv("GITHUB_SHA", "local"),
        "acpSelections": {
            "math": "math",
            "frontend": "frontend",
        },
        "modes": manifest["modes"],
        "sourceManifestSha256": sha256_file(SOURCE_MANIFEST),
        "math": directory_index(math_target),
        "frontend": directory_index(frontend_target),
        "evidence": directory_index(evidence_target),
        "officialRequirements": {
            "engineSetup": "https://stakeengine.github.io/math-sdk/math_docs/general_overview/",
            "mathFormat": "https://stakeengine.github.io/math-sdk/rgs_docs/data_format/",
            "productionBooks": "https://stakeengine.github.io/math-sdk/math_docs/quickstart/",
            "frontendPublishing": "https://stakeengine.github.io/math-sdk/simple_example/simple_example/",
            "rgs": "https://stakeengine.github.io/math-sdk/rgs_docs/RGS/",
        },
    }
    (ARTIFACT_ROOT / "submission-manifest.json").write_text(
        json.dumps(bundle_manifest, indent=2) + "\n", encoding="utf-8"
    )
    (ARTIFACT_ROOT / "README.txt").write_text(
        "The Inheritance - canonical Stake Engine submission\n\n"
        "In Stake ACP, select the repository folder games/2_0_The_Inheritance/library/publish_files for Math.\n"
        "index.json must be directly visible in that selected folder.\n\n"
        "Select games/2_0_The_Inheritance/frontend/dist for Front End.\n"
        "index.html must be directly visible in that selected folder.\n\n"
        "The math/ and frontend/ directories in this proof artifact are exact hashed copies of those roots.\n"
        "The evidence/ directory is review material and must not be selected as either ACP version.\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        json.dumps(
            {
                "status": "PASS",
                "artifact": str(ARTIFACT_ROOT),
                "mathFiles": len(bundle_manifest["math"]),
                "frontendFiles": len(bundle_manifest["frontend"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
