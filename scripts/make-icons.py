"""Draws CatchLog's app icon set from one fish mark (Lucide "fish-symbol", ISC licence):
lime fish (#D8E9A8) on forest (#1C3A2E). Run: python3 scripts/make-icons.py (needs Pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw

FOREST, LIME, WHITE = (0x1C, 0x3A, 0x2E, 255), (0xD8, 0xE9, 0xA8, 255), (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
SS = 4  # supersampling for smooth edges


def cubic(p0, p1, p2, p3, n=64):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


# fish-symbol: M2 16 s9-15 20-4 C11 23 2 8 2 8 (24x24 grid)
FISH = cubic((2, 16), (2, 16), (11, 1), (22, 12)) + cubic((22, 12), (11, 23), (2, 8), (2, 8))[1:]
STROKE = 2.2


def render(size, bg, fg, scale):
    """`scale`: how many pixels one unit of the 24-unit grid takes, at output size."""
    big = size * SS
    im = Image.new('RGBA', (big, big), bg)
    d = ImageDraw.Draw(im)
    u = scale * SS
    pts = [(big / 2 + (x - 12) * u, big / 2 + (y - 12) * u) for x, y in FISH]
    r = STROKE * u / 2
    # A round brush stamped along the curve: even width, round caps and joins, no seams.
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = max(1, int(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / (r / 4)))
        for i in range(steps + 1):
            x, y = x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps
            d.ellipse((x - r, y - r, x + r, y + r), fill=fg)
    return im.resize((size, size), Image.LANCZOS)


CLEAR = (0, 0, 0, 0)
render(1024, FOREST, LIME, 28).save(OUT / 'icon.png')  # iOS + store icon (iOS rounds the corners)
# Android adaptive icon: the system masks to a circle/squircle; keep the mark in the inner 66%.
render(512, CLEAR, LIME, 11).save(OUT / 'android-icon-foreground.png')
Image.new('RGBA', (512, 512), FOREST).save(OUT / 'android-icon-background.png')
render(512, CLEAR, WHITE, 11).save(OUT / 'android-icon-monochrome.png')
render(512, CLEAR, LIME, 20).save(OUT / 'splash-icon.png')  # on the forest splash background
render(48, FOREST, LIME, 1.6).save(OUT / 'favicon.png')
print('icons written to', OUT)
