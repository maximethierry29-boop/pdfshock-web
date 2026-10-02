"""Convertit les illustrations générées par IA (art/skin-*-source.jpg) en vrai pixel art pour l'habillage.

1. Réduction sur une grille régulière (les « pixels » d'une image IA sont flous et irréguliers).
2. Teintes froides recentrées sur le bleu de la DA (sarcelle et violet → bleu nuit), teintes chaudes conservées.
3. Quantification sur la palette du site, sans tramage (le tramage de la source survit à la réduction).

Usage : python3 scripts/pixelize.py  → public/skin-left.png, public/skin-right.png (+ aperçus ×4 dans test/)
"""
from PIL import Image
import numpy as np

GRID_W = 192  # largeur de la grille de pixels ; la hauteur suit le ratio de la source
TARGET_HUE, HUE_KEEP = 220, 0.35  # bleu de --accent / ciel ; on garde 35 % de l'écart d'origine

PALETTE = [
    # Rampe bleu nuit → cyan → blanc (fond #0a0e1c, --accent #4f9dff, --accent-cyan #9fe8ff)
    "#04050b", "#0a0e1c", "#0f1630", "#152043", "#1c2a57", "#24376e", "#2f4788", "#3f60a8",
    "#4f9dff", "#6fb4ff", "#9fe8ff", "#c9f1ff", "#ffffff",
    # Neutres (barbe, page du PDF, lettres)
    "#262a33", "#3a4152", "#5f6a85", "#97a3bd", "#c8cbd8", "#f1f2f7",
    # Chauds (bordure du PDF, brûlure, étincelles, peau)
    "#e3242b", "#9e1418", "#3d2622", "#7a5036", "#ffb84d", "#ffe9a8", "#c08a78", "#866262",
]


def palette_image():
    flat = [int(c[i : i + 2], 16) for c in PALETTE for i in (1, 3, 5)]
    pal = Image.new("P", (1, 1))
    pal.putpalette(flat + flat[:3] * (256 - len(PALETTE)))
    return pal


def recolor(img):
    hsv = np.asarray(img.convert("HSV")).astype(float)
    hue = hsv[..., 0] * 360 / 255
    cool = (hue > 150) & (hue < 300)
    hue[cool] = TARGET_HUE + (hue[cool] - TARGET_HUE) * HUE_KEEP
    hsv[..., 0] = hue * 255 / 360
    channels = [Image.fromarray(hsv[..., i].round().clip(0, 255).astype("uint8")) for i in range(3)]
    return Image.merge("HSV", channels).convert("RGB")


def pixelize(name):
    src = Image.open(f"art/skin-{name}-source.jpg").convert("RGB")
    h = round(src.height * GRID_W / src.width)
    small = recolor(src.resize((GRID_W, h), Image.BOX))
    out = small.quantize(palette=palette_image(), dither=Image.Dither.NONE).convert("RGB")
    out.save(f"public/skin-{name}.png", optimize=True)
    out.resize((GRID_W * 4, h * 4), Image.NEAREST).save(f"test/skin-{name}-x4.png")
    print(f"public/skin-{name}.png {GRID_W}×{h}")


for name in ("left", "right"):
    pixelize(name)
