#!/usr/bin/env python3
"""Generates the app icon into iosApp/Ehon/Assets.xcassets/AppIcon.appiconset.

The mark is the app's own visual language: cut-paper shapes, the same circle-and-triangle
primitives a child sticks onto a page, in Organic's terracotta and sage on a cream ground.
Two overlapping shapes read as collage rather than as a generic blob, and the offset shadow
says the top one was just pressed down — which is what ぺたぺた means.

Deliberately calm. Every competing children's app icon is saturated, so warm and quiet is
the differentiator on a crowded home screen, not a compromise.
"""
from __future__ import annotations

import json
import math
import pathlib

from PIL import Image, ImageDraw, ImageFilter

OUT = pathlib.Path(__file__).resolve().parent.parent / "iosApp/Ehon/Assets.xcassets/AppIcon.appiconset"

CREAM = (245, 234, 216)
TERRACOTTA = (198, 113, 57)
SAGE = (122, 138, 94)
INK = (46, 43, 37)

# Everything is expressed as a fraction of the canvas so the mark is resolution-free.
S = 1024
SUPERSAMPLE = 4


def polygon(cx, cy, r, sides, rotation_deg):
    return [
        (
            cx + r * math.cos(math.radians(rotation_deg) + i * 2 * math.pi / sides),
            cy + r * math.sin(math.radians(rotation_deg) + i * 2 * math.pi / sides),
        )
        for i in range(sides)
    ]


def draw_mark(background, shape_a, shape_b, shadow_alpha=70):
    """Cream ground, sage triangle behind, terracotta circle pressed down on top."""
    n = S * SUPERSAMPLE
    img = Image.new("RGB", (n, n), background)

    def shadow_for(draw_fn, offset, blur, alpha):
        layer = Image.new("L", (n, n), 0)
        draw_fn(ImageDraw.Draw(layer), offset)
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        tinted = Image.new("RGB", (n, n), INK)
        img.paste(tinted, (0, 0), layer.point(lambda v: int(v * alpha / 255)))

    tri_centre = (0.585 * n, 0.44 * n)
    tri_r = 0.30 * n

    def tri(draw, off):
        draw.polygon(
            polygon(tri_centre[0] + off, tri_centre[1] + off, tri_r, 3, -90),
            fill=255,
        )

    circ_centre = (0.415 * n, 0.575 * n)
    circ_r = 0.245 * n

    def circ(draw, off):
        draw.ellipse(
            [circ_centre[0] - circ_r + off, circ_centre[1] - circ_r + off,
             circ_centre[0] + circ_r + off, circ_centre[1] + circ_r + off],
            fill=255,
        )

    shadow_for(tri, 0.018 * n, 0.022 * n, shadow_alpha)
    ImageDraw.Draw(img).polygon(polygon(*tri_centre, tri_r, 3, -90), fill=shape_b)

    # The top shape's shadow is offset further: it is the one being pressed down.
    shadow_for(circ, 0.026 * n, 0.028 * n, shadow_alpha + 20)
    ImageDraw.Draw(img).ellipse(
        [circ_centre[0] - circ_r, circ_centre[1] - circ_r,
         circ_centre[0] + circ_r, circ_centre[1] + circ_r],
        fill=shape_a,
    )

    return img.resize((S, S), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    variants = {
        # Light: the mark as designed.
        "icon-light.png": draw_mark(CREAM, TERRACOTTA, SAGE),
        # Dark: same shapes on the ink ground, so it reads on a dark home screen.
        "icon-dark.png": draw_mark(INK, TERRACOTTA, SAGE, shadow_alpha=0),
        # Tinted: iOS recolours a greyscale mark, so only the value structure matters.
        "icon-tinted.png": draw_mark((36, 36, 36), (232, 232, 232), (150, 150, 150), shadow_alpha=0),
    }
    for name, image in variants.items():
        image.save(OUT / name)
        print(f"  {name}")

    contents = {
        "images": [
            {"filename": "icon-light.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"},
            {"filename": "icon-dark.png", "idiom": "universal", "platform": "ios", "size": "1024x1024",
             "appearances": [{"appearance": "luminosity", "value": "dark"}]},
            {"filename": "icon-tinted.png", "idiom": "universal", "platform": "ios", "size": "1024x1024",
             "appearances": [{"appearance": "luminosity", "value": "tinted"}]},
        ],
        "info": {"author": "xcode", "version": 1},
    }
    (OUT / "Contents.json").write_text(json.dumps(contents, indent=2))

    root = OUT.parent / "Contents.json"
    root.write_text(json.dumps({"info": {"author": "xcode", "version": 1}}, indent=2))
    print(f"  wrote {OUT}")


if __name__ == "__main__":
    main()
