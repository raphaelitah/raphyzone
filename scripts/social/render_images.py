#!/usr/bin/env python3
"""Saturday renderer, part 1: carousels and the single split image (Pillow).

Reads draft posts with render_status='pending' from Supabase, draws branded
1080x1350 (4:5) PNG slides, uploads them to the public `social-assets` bucket and
stores the URLs in social_posts.asset_urls. Reels are handled by render_reels.py.

  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (or VITE_SUPABASE_URL in .env.local)
  --local DIR     render to DIR and skip upload/DB writes (design iteration)
  --week YYYY-MM-DD   only that week      --force   re-render even if rendered
  --sample        render built-in sample posts (no Supabase needed)
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT = str(ROOT / "assets" / "fonts" / "Inter.ttf")
W, H = 1080, 1350
MARGIN = 88
MAX_SLIDES = 10  # Instagram carousel limit

INDIGO = (80, 72, 229)       # #5048e5, the app's brand colour
INDIGO_DARK = (52, 45, 168)
INK = (11, 11, 20)
PAPER = (246, 245, 255)
WHITE = (255, 255, 255)
MUTED_ON_PAPER = (98, 96, 128)
MUTED_ON_INK = (176, 174, 214)
ACCENT = (255, 209, 102)     # warm highlight


def font(size, weight=700):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([min(32, max(14, size / 4)), weight])
    return f


def wrap(draw, text, fnt, max_w):
    lines = []
    for para in str(text).split("\n"):
        words, line = para.split(), ""
        for word in words:
            trial = f"{line} {word}".strip()
            if draw.textlength(trial, font=fnt) <= max_w:
                line = trial
            else:
                if line:
                    lines.append(line)
                line = word
        lines.append(line)
    return lines


def fit(draw, text, max_w, max_h, start, minimum, weight, spacing=1.12):
    """Largest font size where the wrapped text fits the box."""
    for size in range(start, minimum - 1, -4):
        fnt = font(size, weight)
        lines = wrap(draw, text, fnt, max_w)
        if len(lines) * size * spacing <= max_h:
            return fnt, lines, size
    fnt = font(minimum, weight)
    return fnt, wrap(draw, text, fnt, max_w), minimum


def draw_lines(draw, lines, fnt, size, x, y, fill, spacing=1.12):
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += size * spacing
    return y


def logo(draw, x, y, size, bg=INDIGO, fg=WHITE):
    """The app icon (public/favicon.svg) redrawn at `size` px."""
    s = size / 100
    draw.rounded_rectangle([x, y, x + size, y + size], radius=18 * s, fill=bg)
    for (rx, ry, rw, rh, rr) in [(14, 42, 8, 16, 3), (25, 34, 10, 32, 4), (65, 34, 10, 32, 4), (78, 42, 8, 16, 3), (35, 46, 30, 8, 2)]:
        draw.rounded_rectangle([x + rx * s, y + ry * s, x + (rx + rw) * s, y + (ry + rh) * s], radius=rr * s, fill=fg)


def header(draw, dark, n=None, total=None):
    fg = WHITE if dark else INK
    logo(draw, MARGIN, 72, 64, bg=WHITE if dark else INDIGO, fg=INDIGO if dark else WHITE)
    draw.text((MARGIN + 80, 84), "@raphyzone", font=font(32, 700), fill=fg)
    if n is not None:
        t = f"{n}/{total}"
        draw.text((W - MARGIN - draw.textlength(t, font=font(32, 600)), 84), t, font=font(32, 600), fill=MUTED_ON_INK if dark else MUTED_ON_PAPER)


def new_slide(bg):
    img = Image.new("RGB", (W, H), bg)
    return img, ImageDraw.Draw(img)


def slide_cover(title, subtitle=None):
    img, d = new_slide(INDIGO)
    d.ellipse([W - 520, H - 560, W + 280, H + 240], fill=INDIGO_DARK)  # soft corner shape
    header(d, dark=True)
    fnt, lines, size = fit(d, title, W - 2 * MARGIN, 640, 124, 72, 800, 1.06)
    y = 330
    y = draw_lines(d, lines, fnt, size, MARGIN, y, WHITE, 1.06)
    d.rounded_rectangle([MARGIN, y + 20, MARGIN + 140, y + 30], radius=5, fill=ACCENT)
    if subtitle:
        sf, sl, ss = fit(d, subtitle, W - 2 * MARGIN, 160, 44, 32, 500)
        draw_lines(d, sl, sf, ss, MARGIN, y + 64, MUTED_ON_INK)
    d.text((MARGIN, H - 150), "Swipe  →", font=font(44, 700), fill=WHITE)
    return img


def slide_content(title, body, n, total, dark):
    bg, fg, sub = (INK, WHITE, MUTED_ON_INK) if dark else (PAPER, INK, MUTED_ON_PAPER)
    img, d = new_slide(bg)
    header(d, dark, n, total)
    tf, tl, ts = fit(d, title, W - 2 * MARGIN, 520, 100, 56, 800, 1.08)
    bf = bl = None
    bs = 0
    title_h = len(tl) * ts * 1.08
    body_h = 0
    if body:
        bf, bl, bs = fit(d, body, W - 2 * MARGIN, 560, 52, 34, 500, 1.3)
        body_h = 36 + len(bl) * bs * 1.3
    # centre the block (accent bar + title + body) in the area under the header
    block_h = 40 + title_h + body_h
    top = 190 + max(0, (H - 190 - 120 - block_h) / 2)
    d.rounded_rectangle([MARGIN, top, MARGIN + 96, top + 12], radius=6, fill=ACCENT if dark else INDIGO)
    y = draw_lines(d, tl, tf, ts, MARGIN, top + 50, fg, 1.08)
    if body:
        draw_lines(d, bl, bf, bs, MARGIN, y + 36, sub, 1.3)
    return img


def slide_cta():
    img, d = new_slide(INDIGO)
    d.ellipse([-300, H - 420, 560, H + 440], fill=INDIGO_DARK)
    header(d, dark=True)
    logo(d, MARGIN, 330, 150, bg=WHITE, fg=INDIGO)
    fnt, lines, size = fit(d, "Stop deciding.\nStart training.", W - 2 * MARGIN, 420, 112, 72, 800, 1.06)
    y = draw_lines(d, lines, fnt, size, MARGIN, 540, WHITE, 1.06)
    d.rounded_rectangle([MARGIN, y + 40, W - MARGIN, y + 150], radius=55, fill=WHITE)
    label = "30 days free · link in bio"
    lf = font(46, 800)
    d.text(((W - d.textlength(label, font=lf)) / 2, y + 66), label, font=lf, fill=INDIGO)
    d.text((MARGIN, H - 130), "Workouts, decided.", font=font(38, 600), fill=MUTED_ON_INK)
    return img


def slide_split(title, body):
    """Save-for-later weekly split: one row per line of 'Day — focus'."""
    img, d = new_slide(PAPER)
    header(d, dark=False)
    tf, tl, ts = fit(d, title, W - 2 * MARGIN, 300, 92, 56, 800, 1.06)
    y = draw_lines(d, tl, tf, ts, MARGIN, 190, INK, 1.06) + 36
    rows = [r.strip() for r in str(body).split("\n") if r.strip()][:7]
    row_h = min(130, (H - y - 200) // max(len(rows), 1))
    for i, row in enumerate(rows):
        m = re.split(r"\s+[—–-]\s+|:\s+", row, maxsplit=1)
        day, focus = (m[0], m[1]) if len(m) == 2 else (f"Day {i + 1}", row)
        rest = bool(re.search(r"rest|off|walk|mobility|recover", focus, re.I))
        top = y + i * row_h
        d.rounded_rectangle([MARGIN, top, W - MARGIN, top + row_h - 14], radius=26, fill=WHITE if rest else INDIGO)
        pf = font(34, 800)
        d.text((MARGIN + 32, top + (row_h - 14 - 34) / 2 - 4), day.upper()[:6], font=pf, fill=MUTED_ON_PAPER if rest else ACCENT)
        ff, fl, fs = fit(d, focus, W - 2 * MARGIN - 230, row_h - 30, 46, 28, 700, 1.1)
        draw_lines(d, fl[:2], ff, fs, MARGIN + 190, top + (row_h - 14 - min(len(fl), 2) * fs * 1.1) / 2, INK if rest else WHITE, 1.1)
    d.text((MARGIN, H - 120), "Save this  ·  @raphyzone", font=font(36, 700), fill=INDIGO)
    return img


def render_post(post):
    slides = post.get("slides") or []
    if post["kind"] == "single_split":
        s = slides[0]
        return [slide_split(s.get("title", post["hook"]), s.get("body", ""))]
    out = [slide_cover(slides[0].get("title") or post["hook"], slides[0].get("body") or None)]
    body = slides[1:]
    cta_needed = len(body) + 1 < MAX_SLIDES
    total = 1 + len(body) + (1 if cta_needed else 0)
    for i, s in enumerate(body):
        out.append(slide_content(s.get("title", ""), s.get("body", ""), i + 2, total, dark=(i % 2 == 1)))
    if cta_needed:
        out.append(slide_cta())
    return out[:MAX_SLIDES]


SAMPLES = [
    {"kind": "carousel_humour", "slot": 2, "hook": "Decision fatigue is the real workout", "slides": [
        {"title": "Decision fatigue is the real workout", "body": "A field guide for people who never start training"},
        {"title": "The 20-minute scroll", "body": "You opened the app to train. It's been 20 minutes. You've chosen nothing."},
        {"title": "The hotel gym staring contest", "body": "Four dumbbells, one bench, zero ideas."},
        {"title": "Chest day or legs?", "body": "Whichever you pick, you will wonder if it was the right one."},
        {"title": "Same plan, rearranged again", "body": "That's not programming. That's procrastination with a spreadsheet."}]},
    {"kind": "single_split", "slot": 6, "hook": "Save this 3-day split", "slides": [
        {"title": "Save this 3-day split", "body": "Mon — Push (Chest + Triceps)\nTue — Rest or walk\nWed — Pull (Back + Biceps)\nThu — Mobility flow\nFri — Super Legs\nSat — Rest\nSun — Rest"}]},
]


def load_env():
    p = Path.cwd() / ".env.local"
    if p.exists():
        for line in p.read_text().splitlines():
            m = re.match(r"^([^#=]+)=(.*)$", line)
            if m and not os.environ.get(m.group(1).strip()):
                os.environ[m.group(1).strip()] = m.group(2).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local")
    ap.add_argument("--week")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--sample", action="store_true")
    a = ap.parse_args()

    if a.sample:
        out = Path(a.local or "social-out")
        out.mkdir(parents=True, exist_ok=True)
        for p in SAMPLES:
            for i, img in enumerate(render_post(p), 1):
                img.save(out / f"sample-{p['kind']}-{i}.png")
        print(f"Wrote samples to {out}")
        return

    load_env()
    base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    hdr = {"apikey": key, "authorization": f"Bearer {key}"}

    q = {"select": "*", "kind": "in.(carousel_humour,carousel_smarter,single_split)", "status": "in.(draft,approved)", "order": "week_start,slot"}
    if not a.force:
        q["render_status"] = "in.(pending,failed)"
    if a.week:
        q["week_start"] = f"eq.{a.week}"
    posts = requests.get(f"{base}/rest/v1/social_posts", headers=hdr, params=q, timeout=30)
    posts.raise_for_status()
    failed = 0
    for post in posts.json():
        tag = f"{post['week_start']}/slot{post['slot']}"
        try:
            images = render_post(post)
            urls = []
            for i, img in enumerate(images, 1):
                name = f"{post['week_start']}/{post['slot']}-{post['kind']}/slide-{i:02d}.png"
                if a.local:
                    path = Path(a.local) / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    img.save(path)
                    continue
                import io
                buf = io.BytesIO()
                img.save(buf, "PNG", optimize=True)
                r = requests.post(f"{base}/storage/v1/object/social-assets/{name}", data=buf.getvalue(), timeout=60,
                                  headers={**hdr, "content-type": "image/png", "x-upsert": "true", "cache-control": "max-age=3600"})
                r.raise_for_status()
                urls.append(f"{base}/storage/v1/object/public/social-assets/{name}")
            if not a.local:
                patch = {"asset_urls": urls, "render_status": "rendered", "render_error": None, "updated_date": "now()"}
                r = requests.patch(f"{base}/rest/v1/social_posts", params={"id": f"eq.{post['id']}"}, json=patch, headers={**hdr, "content-type": "application/json"}, timeout=30)
                r.raise_for_status()
            print(f"Rendered {tag}: {len(images)} image(s)")
        except Exception as err:  # keep going; record the failure on the row
            failed += 1
            print(f"FAILED {tag}: {err}", file=sys.stderr)
            if not a.local:
                requests.patch(f"{base}/rest/v1/social_posts", params={"id": f"eq.{post['id']}"},
                               json={"render_status": "failed", "render_error": str(err)[:500]},
                               headers={**hdr, "content-type": "application/json"}, timeout=30)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
