#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""
Trim raster art to real transparency.

Some generated PNGs ship with a *baked-in* background — a pale checkerboard
or a near-white fill the model painted as its idea of "transparent". On a dark
page that renders as an ugly grey box. This script removes the background and
crops to the subject:

  1. Mark "background candidate" pixels = light AND low-chroma (the pale
     checkerboard / near-white fill), plus anything already transparent.
  2. Keep only the candidate regions that are *connected to the image border*
     and knock their alpha to 0. Interior light pixels (a robot's white face,
     a screen highlight) are enclosed by darker outlines, so they are NOT
     border-connected and survive.
  3. Eat a 1px anti-alias halo around the removed background.
  4. Crop to the remaining opaque bounding box (+ small padding).

Usage:
  uv run scripts/trim-images.py <image...>            # trim in place
  uv run scripts/trim-images.py --pad 12 a.png b.png  # custom padding
  uv run scripts/trim-images.py --out-dir out/ a.png  # write copies elsewhere

Idempotent: a clean transparent PNG trims to itself (minus stray margins).
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# A pixel is "background-like" when it is bright and nearly grey/desaturated.
# The pale checkerboard and near-white fills both satisfy this; saturated robot
# bodies, navy code cards and the teal hologram do not.
LIGHT_MIN = 170   # max RGB channel above this = bright
CHROMA_MAX = 48   # (max-min) below this = low saturation
HALO_LIGHT_MIN = 150
HALO_CHROMA_MAX = 70
ALPHA_KEEP = 8    # alpha above this counts as "subject" for cropping


def trim(arr: np.ndarray, pad: int) -> np.ndarray:
    rgb = arr[:, :, :3].astype(int)
    alpha = arr[:, :, 3]
    mx = rgb.max(axis=2)
    chroma = mx - rgb.min(axis=2)

    bg_cand = ((mx > LIGHT_MIN) & (chroma < CHROMA_MAX)) | (alpha < 16)

    # Connected components; keep only those touching the border = real background.
    labels, _ = ndimage.label(bg_cand)
    border = np.concatenate(
        [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
    )
    border_labels = [v for v in np.unique(border) if v != 0]
    bg = np.isin(labels, border_labels)

    out = arr.copy()
    out[bg, 3] = 0

    # Eat a 1px light halo so anti-aliased checkerboard edges don't linger.
    halo = ndimage.binary_dilation(bg, iterations=1) & ~bg
    halo &= (mx > HALO_LIGHT_MIN) & (chroma < HALO_CHROMA_MAX)
    out[halo, 3] = 0

    # Crop to remaining subject.
    opaque = out[:, :, 3] > ALPHA_KEEP
    ys, xs = np.where(opaque)
    if len(xs) == 0:
        return out
    y0 = max(0, int(ys.min()) - pad)
    x0 = max(0, int(xs.min()) - pad)
    y1 = min(out.shape[0], int(ys.max()) + 1 + pad)
    x1 = min(out.shape[1], int(xs.max()) + 1 + pad)
    return out[y0:y1, x0:x1]


def main() -> int:
    ap = argparse.ArgumentParser(description="Trim baked backgrounds to alpha.")
    ap.add_argument("images", nargs="+", help="PNG files to trim")
    ap.add_argument("--pad", type=int, default=8, help="transparent padding (px)")
    ap.add_argument("--out-dir", default=None, help="write copies here instead of in place")
    args = ap.parse_args()

    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)

    for path in args.images:
        im = Image.open(path).convert("RGBA")
        before = os.path.getsize(path)
        trimmed = trim(np.array(im), args.pad)
        dst = os.path.join(args.out_dir, os.path.basename(path)) if args.out_dir else path
        Image.fromarray(trimmed).save(dst, optimize=True)
        h, w = trimmed.shape[:2]
        print(
            f"{os.path.basename(path):24} {im.width}x{im.height} -> {w}x{h}  "
            f"{before // 1024}KB -> {os.path.getsize(dst) // 1024}KB"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
