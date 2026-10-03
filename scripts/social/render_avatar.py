"""Render the Instagram profile picture: full-bleed brand indigo with the app's dumbbell mark."""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 1080
SCALE = 1.1  # enlarge the favicon dumbbell slightly; still well inside the circular crop
BG = "#5048e5"
# (x, y, w, h, radius) in the favicon's 100x100 space (public/favicon.svg)
PARTS = [(14, 42, 8, 16, 3), (25, 34, 10, 32, 4), (65, 34, 10, 32, 4),
         (78, 42, 8, 16, 3), (35, 46, 30, 8, 2)]

def main():
    ss = 4  # supersample for smooth edges
    img = Image.new("RGB", (SIZE * ss, SIZE * ss), BG)
    d = ImageDraw.Draw(img)
    k = SIZE * ss / 100 * SCALE
    off = SIZE * ss * (1 - SCALE) / 2
    for x, y, w, h, r in PARTS:
        d.rounded_rectangle([x * k + off, y * k + off, (x + w) * k + off, (y + h) * k + off],
                            radius=r * k, fill="white")
    out = Path(__file__).parent / "assets" / "profile_picture.png"
    img.resize((SIZE, SIZE), Image.LANCZOS).save(out)
    print(out)

if __name__ == "__main__":
    main()
