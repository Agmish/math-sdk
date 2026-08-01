"""Prepare the hand-painted Blackthorn art direction for the web client.

The source paintings stay in ``art/source`` as authorship and crop references.
This script creates deterministic, web-sized symbol, feature, and backdrop
assets without relying on runtime canvas cropping.
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
SOURCES = ROOT / "art" / "source"


def crop_grid(
    source_name: str,
    output_dir: str,
    names: list[str],
    columns: int,
    rows: int,
    output_size: tuple[int, int],
    inset: int = 2,
) -> None:
    source_path = SOURCES / source_name
    target_dir = ASSETS / output_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGB")
    width, height = source.size

    for index, name in enumerate(names):
        column = index % columns
        row = index // columns
        left = round(column * width / columns) + inset
        top = round(row * height / rows) + inset
        right = round((column + 1) * width / columns) - inset
        bottom = round((row + 1) * height / rows) - inset
        tile = source.crop((left, top, right, bottom))
        tile = tile.resize(output_size, Image.Resampling.LANCZOS)
        tile.save(target_dir / f"{name}.webp", "WEBP", quality=91, method=6)


def prepare_background() -> None:
    source = Image.open(SOURCES / "blackthorn-conservatory-v2.png").convert("RGB")
    source = source.resize((2048, 1152), Image.Resampling.LANCZOS)
    source = ImageEnhance.Color(source).enhance(1.02)
    source = ImageEnhance.Contrast(source).enhance(1.05)
    source = source.filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=4))
    source.save(ASSETS / "blackthorn-hall.webp", "WEBP", quality=90, method=6)


def main() -> None:
    crop_grid(
        "inheritance-characters-v2.png",
        "symbols",
        [
            "heiress",
            "executor",
            "raven-key",
            "stag",
        ],
        columns=2,
        rows=2,
        output_size=(560, 560),
    )
    crop_grid(
        "inheritance-heirlooms-v2.png",
        "symbols",
        [
            "poison-ring",
            "pocket-watch",
            "candelabrum",
            "lilies",
        ],
        columns=2,
        rows=2,
        output_size=(560, 560),
    )
    crop_grid(
        "inheritance-specials-v2.png",
        "symbols",
        [
            "testament",
            "vault-scatter",
            "seance-mirror",
            "wax-wild",
        ],
        columns=2,
        rows=2,
        output_size=(560, 560),
    )
    crop_grid(
        "inheritance-features-v2.png",
        "features",
        ["sealed-will", "vault-echoes", "midnight-seance", "final-codicil"],
        columns=2,
        rows=2,
        output_size=(900, 900),
        inset=4,
    )
    prepare_background()


if __name__ == "__main__":
    main()
