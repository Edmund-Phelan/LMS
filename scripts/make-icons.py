"""PWA icons + WhatsApp link-preview image for BBB Last Man Standing. Run on a Mac (system fonts):
python3 scripts/make-icons.py   → public/icon-192.png, icon-512.png, apple-touch-icon.png, og.png
"""
import json
from PIL import Image, ImageDraw, ImageFont

PITCH, PITCH_DARK, CHALK, GOLD = "#0f5132", "#0a3a24", "#f7f5ef", "#f2b226"
FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
pub = "public/"


def stripes(d, w, h, n=8):
    # Mown-grass stripes.
    for i in range(n):
        if i % 2:
            d.rectangle([i * w / n, 0, (i + 1) * w / n, h], fill=PITCH_DARK)


def ball(d, cx, cy, rx, ry):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=CHALK)
    d.line([cx - rx * 0.45, cy, cx + rx * 0.45, cy], fill=PITCH, width=max(2, int(ry * 0.12)))
    for i in range(-2, 3):
        x = cx + i * rx * 0.18
        d.line([x, cy - ry * 0.22, x, cy + ry * 0.22], fill=PITCH, width=max(2, int(ry * 0.09)))


def icon(size, path):
    s = 1024
    im = Image.new("RGB", (s, s), PITCH)
    d = ImageDraw.Draw(im)
    stripes(d, s, s)
    ball(d, s / 2, s * 0.40, s * 0.30, s * 0.17)
    f = ImageFont.truetype(FONT, int(s * 0.30))
    d.text((s / 2, s * 0.80), "BBB", font=f, fill=GOLD, anchor="mm")
    im.resize((size, size), Image.LANCZOS).save(pub + path)


def og():
    w, h = 1200, 630
    im = Image.new("RGB", (w, h), PITCH)
    d = ImageDraw.Draw(im)
    stripes(d, w, h, 12)
    d.text((w / 2, 150), "BBB", font=ImageFont.truetype(FONT, 150), fill=GOLD, anchor="mm")
    d.text((w / 2, 285), "LAST MAN STANDING", font=ImageFont.truetype(FONT, 120), fill=CHALK, anchor="mm")
    d.text((w / 2, 380), "Champions Cup 2026/27 · pick a team, don't lose", font=ImageFont.truetype(FONT, 46),
           fill=CHALK, anchor="mm")
    teams = json.load(open("src/data/teams.json"))
    n, size, gap = 12, 80, 14
    for row in range(2):
        x0 = (w - (n * size + (n - 1) * gap)) / 2
        for i, t in enumerate(teams[row * n:(row + 1) * n]):
            x, y = int(x0 + i * (size + gap)), 440 + row * (size + 6)
            d.ellipse([x - 4, y - 4, x + size + 4, y + size + 4], fill=CHALK)  # dark crests vanish on green
            c = Image.open(pub + t["crest"]).convert("RGBA").resize((size - 12, size - 12), Image.LANCZOS)
            im.paste(c, (x + 6, y + 6), c)
    im.save(pub + "og.png", optimize=True)


icon(192, "icon-192.png")
icon(512, "icon-512.png")
icon(180, "apple-touch-icon.png")
og()
print("ok")
