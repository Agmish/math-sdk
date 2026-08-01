"""Build short original animated-WebP chapter transitions from the game's artwork.

The motion is deliberately restrained: a slow camera push, drifting fog, ink
vignette and a chapter-specific light sweep. Animated WebP keeps the transition
sharper and much smaller than GIF while remaining an ordinary local image asset.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FEATURES = ROOT / "public" / "assets" / "features"
OUTPUT = ROOT / "public" / "assets" / "transitions"
SIZE = (960, 540)
FRAMES = 28
FRAME_MS = 52

SCENES = {
    "will": ("sealed-will.webp", (135, 38, 30), (255, 188, 112)),
    "vault": ("vault-echoes.webp", (101, 68, 25), (255, 206, 111)),
    "seance": ("midnight-seance.webp", (12, 91, 83), (137, 255, 235)),
    "codicil": ("final-codicil.webp", (99, 35, 29), (248, 210, 132)),
}


def cover(image: Image.Image, size: tuple[int, int], zoom: float, pan_x: float) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height) * zoom
    width, height = round(image.width * scale), round(image.height * scale)
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    left = round((width - target_w) * (0.5 + pan_x))
    top = round((height - target_h) * 0.46)
    left = max(0, min(width - target_w, left))
    top = max(0, min(height - target_h, top))
    return resized.crop((left, top, left + target_w, top + target_h))


def vignette() -> Image.Image:
    mask = Image.new("L", SIZE, 0)
    pixels = mask.load()
    cx, cy = SIZE[0] / 2, SIZE[1] / 2
    for y in range(SIZE[1]):
        for x in range(SIZE[0]):
            distance = math.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2)
            pixels[x, y] = round(max(0, min(190, (distance - 0.34) * 210)))
    return mask.filter(ImageFilter.GaussianBlur(18))


def render_scene(name: str, source_name: str, tint: tuple[int, int, int], light: tuple[int, int, int]) -> None:
    source = Image.open(FEATURES / source_name).convert("RGB")
    shade = vignette()
    rng = random.Random(f"blackthorn-transition:{name}")
    dust = [
        (rng.randrange(SIZE[0]), rng.randrange(SIZE[1]), rng.uniform(0.7, 2.2), rng.randrange(20, 75))
        for _ in range(42)
    ]
    frames: list[Image.Image] = []

    for index in range(FRAMES):
        progress = index / FRAMES
        wave = math.sin(progress * math.tau)
        image = cover(source, SIZE, 1.045 + 0.018 * wave, 0.018 * wave)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = ImageEnhance.Color(image).enhance(0.88)

        grade = Image.new("RGBA", SIZE, (*tint, 42))
        image = Image.alpha_composite(image.convert("RGBA"), grade)

        sweep = Image.new("RGBA", SIZE, (0, 0, 0, 0))
        sweep_draw = ImageDraw.Draw(sweep)
        sweep_x = round(-SIZE[0] * 0.35 + progress * SIZE[0] * 1.7)
        sweep_draw.polygon(
            [
                (sweep_x - 170, 0),
                (sweep_x + 45, 0),
                (sweep_x + 270, SIZE[1]),
                (sweep_x + 50, SIZE[1]),
            ],
            fill=(*light, 26),
        )
        image = Image.alpha_composite(image, sweep.filter(ImageFilter.GaussianBlur(38)))

        fog = Image.new("RGBA", SIZE, (0, 0, 0, 0))
        fog_draw = ImageDraw.Draw(fog)
        offset = round(wave * 72)
        for band in range(4):
            y = SIZE[1] - 34 - band * 38
            fog_draw.ellipse(
                (-240 + offset + band * 210, y - 56, 720 + offset + band * 210, y + 70),
                fill=(*light, 9 + band * 2),
            )
        image = Image.alpha_composite(image, fog.filter(ImageFilter.GaussianBlur(36)))

        particle_layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
        particle_draw = ImageDraw.Draw(particle_layer)
        for x, y, radius, opacity in dust:
            particle_y = (y - progress * 76) % SIZE[1]
            particle_x = (x + wave * 18) % SIZE[0]
            particle_draw.ellipse(
                (
                    particle_x - radius,
                    particle_y - radius,
                    particle_x + radius,
                    particle_y + radius,
                ),
                fill=(*light, opacity),
            )
        image = Image.alpha_composite(image, particle_layer.filter(ImageFilter.GaussianBlur(0.45)))

        black = Image.new("RGBA", SIZE, (2, 7, 6, 0))
        black.putalpha(shade)
        image = Image.alpha_composite(image, black)
        frames.append(image.convert("RGB"))

    target = OUTPUT / f"chapter-{name}.webp"
    frames[0].save(
        target,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        quality=72,
        method=4,
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, (source, tint, light) in SCENES.items():
        render_scene(name, source, tint, light)
    print(f"Generated {len(SCENES)} animated chapter transitions in {OUTPUT}")


if __name__ == "__main__":
    main()
