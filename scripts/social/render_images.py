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
ROWS_PER_SLIDE = 7

INDIGO = (80, 72, 229)       # #5048e5, the app's brand colour
INDIGO_DARK = (52, 45, 168)
INK = (11, 11, 20)
PAPER = (246, 245, 255)
WHITE = (255, 255, 255)
MUTED_ON_PAPER = (98, 96, 128)
MUTED_ON_INK = (176, 174, 214)
ACCENT = (255, 209, 102)     # warm highlight


# Brand colour rotates per post so the grid does not look identical week after week.
THEMES = [
    ((80, 72, 229), (52, 45, 168)),    # indigo (the app's brand colour)
    ((13, 118, 122), (8, 80, 88)),     # teal
    ((196, 66, 38), (140, 40, 22)),    # ember
    ((126, 52, 160), (86, 30, 118)),   # plum
]


def set_theme(i):
    global INDIGO, INDIGO_DARK
    INDIGO, INDIGO_DARK = THEMES[i % len(THEMES)]


def theme_for(post):
    from datetime import date
    y, m, d = (int(x) for x in str(post["week_start"]).split("-"))
    return (date(y, m, d).toordinal() // 7 + int(post.get("slot", 0))) % len(THEMES)


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
    label = "Try it free · link in bio"
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


def meta_line(w):
    bits = [f"{round(float(w['minutes']))} min"] if w.get("minutes") else []
    if w.get("format"):
        bits.append(str(w["format"]).replace("_", " ").upper())
    eq = [e for e in (w.get("equipment") or []) if e != "bodyweight"]
    bits.append(", ".join(eq).title() if eq else "No equipment")
    return "  ·  ".join(bits)


def block_title(b):
    t = str(b.get("label") or b.get("type") or "Work").replace("_", " ").strip().title()
    if b.get("rounds"):
        t += f"  ·  {b['rounds']} rounds"
    return t


def slide_workout_card(w):
    """The whole workout on one screen, made to be saved."""
    img, d = new_slide(PAPER)
    header(d, dark=False)
    tf, tl, ts = fit(d, w["name"], W - 2 * MARGIN, 240, 88, 52, 800, 1.06)
    y = draw_lines(d, tl, tf, ts, MARGIN, 180, INK, 1.06) + 6
    d.text((MARGIN, y), meta_line(w), font=font(34, 700), fill=INDIGO)
    y += 70
    rows = []
    for b in w["blocks"]:
        rows.append(("h", block_title(b)))
        rows += [("i", it) for it in b["items"]]
    avail = H - y - 130
    row_h = min(84, avail / max(len(rows), 1))
    fs = int(min(40, row_h * 0.5))
    for kind, text in rows:
        if kind == "h":
            d.rounded_rectangle([MARGIN, y + 4, W - MARGIN, y + row_h - 4], radius=18, fill=INDIGO)
            d.text((MARGIN + 26, y + (row_h - fs) / 2 - 3), text.upper(), font=font(max(fs - 6, 22), 800), fill=ACCENT)
        else:
            f = font(fs, 600)
            while d.textlength(text, font=f) > W - 2 * MARGIN - 70 and fs > 22:
                fs -= 2
                f = font(fs, 600)
            d.ellipse([MARGIN + 8, y + row_h / 2 - 7, MARGIN + 22, y + row_h / 2 + 7], fill=INDIGO)
            d.text((MARGIN + 46, y + (row_h - fs) / 2 - 3), text, font=f, fill=INK)
        y += row_h
    d.text((MARGIN, H - 100), "Save this  ·  @raphyzone", font=font(34, 700), fill=INDIGO)
    return img


def slide_workout_cover(w, hook):
    img, d = new_slide(INDIGO)
    d.ellipse([W - 520, H - 560, W + 280, H + 240], fill=INDIGO_DARK)
    header(d, dark=True)
    d.text((MARGIN, 300), meta_line(w).upper(), font=font(34, 800), fill=ACCENT)
    fnt, lines, size = fit(d, w["name"], W - 2 * MARGIN, 560, 120, 64, 800, 1.06)
    y = draw_lines(d, lines, fnt, size, MARGIN, 370, WHITE, 1.06)
    sf, sl, ss = fit(d, hook, W - 2 * MARGIN, 160, 44, 30, 500)
    draw_lines(d, sl, sf, ss, MARGIN, y + 30, MUTED_ON_INK)
    d.text((MARGIN, H - 150), "Swipe  →", font=font(44, 700), fill=WHITE)
    return img


def slide_workout_block(title, items, n, total, dark):
    bg, fg = (INK, WHITE) if dark else (PAPER, INK)
    img, d = new_slide(bg)
    header(d, dark, n, total)
    tf, tl, ts = fit(d, title, W - 2 * MARGIN, 200, 80, 48, 800, 1.06)
    y = draw_lines(d, tl, tf, ts, MARGIN, 200, ACCENT if dark else INDIGO, 1.06) + 30
    row_h = min(150, (H - y - 150) / max(len(items), 1))
    fs = int(min(52, row_h * 0.45))
    y += max(0, (H - y - 150 - row_h * len(items)) / 3)
    for i, text in enumerate(items):
        top = y + i * row_h
        d.rounded_rectangle([MARGIN, top, W - MARGIN, top + row_h - 14], radius=24, fill=(38, 38, 58) if dark else WHITE)
        f = font(fs, 700)
        while d.textlength(text, font=f) > W - 2 * MARGIN - 130 and fs > 24:
            fs -= 2
            f = font(fs, 700)
        d.text((MARGIN + 28, top + (row_h - 14 - fs) / 2 - 3), f"{i + 1}", font=font(fs, 800), fill=ACCENT if dark else INDIGO)
        d.text((MARGIN + 90, top + (row_h - 14 - fs) / 2 - 3), text, font=f, fill=fg)
    return img


def slide_workout_text(title, body, n, total, dark):
    return slide_content(title, body, n, total, dark)


def render_workout_carousel(post):
    w = (post.get("script") or {}).get("workout")
    if not w:
        raise ValueError("workout post has no script.workout")
    parts = [("cover", None)]
    for b in w["blocks"]:
        items = b["items"]
        chunks = [items[i:i + ROWS_PER_SLIDE] for i in range(0, len(items), ROWS_PER_SLIDE)] or [[]]
        for ci, c in enumerate(chunks):
            parts.append(("block", (block_title(b) + (f" ({ci + 1}/{len(chunks)})" if len(chunks) > 1 else ""), c)))
    fmt = next((s for s in (post.get("slides") or [])[1:] if s.get("title") == w.get("format")), None)
    if fmt:
        parts.append(("format", fmt))
    parts = parts[:MAX_SLIDES - 1]
    total = len(parts) + 1
    out = []
    for i, (k, v) in enumerate(parts):
        if k == "cover":
            out.append(slide_workout_cover(w, post["hook"]))
        elif k == "block":
            out.append(slide_workout_block(v[0], v[1], i + 1, total, dark=(i % 2 == 0)))
        else:
            out.append(slide_workout_text(str(v["title"]).replace("_", " ").upper(), v.get("body", ""), i + 1, total, dark=(i % 2 == 0)))
    out.append(slide_cta())
    return out


def render_post(post):
    set_theme(theme_for(post))
    if post["kind"] == "single_workout":
        w = (post.get("script") or {}).get("workout")
        if not w:
            raise ValueError("workout post has no script.workout")
        return [slide_workout_card(w)]
    if post["kind"] == "carousel_workout":
        return render_workout_carousel(post)
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


_W = {"name": "Dumbbell Ladder", "minutes": 30, "format": "AMRAP", "equipment": ["dumbbell", "bench / box"], "blocks": [
    {"label": "warm-up", "rounds": 2, "items": ["Arm circles × 10", "Bodyweight squat × 10", "Cat-cow × 8"]},
    {"label": "main set", "rounds": 4, "items": ["Dumbbell goblet squat × 12", "Dumbbell bench press × 10", "Bent-over row × 10", "Reverse lunge × 8", "Plank hold × 40s"]}]}

SAMPLES = [
    {"kind": "single_workout", "slot": 1, "week_start": "2026-11-23", "hook": "30 minutes, already decided", "script": {"workout": _W}, "slides": []},
    {"kind": "carousel_workout", "slot": 2, "week_start": "2026-11-23", "hook": "30 minutes, already decided", "script": {"workout": _W},
     "slides": [{"title": "Dumbbell Ladder"}, {"title": "AMRAP", "body": "As many rounds as possible: do the listed moves in order, round after round, until the clock runs out."}]},
    {"kind": "carousel_humour", "slot": 2, "week_start": "2026-11-23", "hook": "Decision fatigue is the real workout", "slides": [
        {"title": "Decision fatigue is the real workout", "body": "A field guide for people who never start training"},
        {"title": "The 20-minute scroll", "body": "You opened the app to train. It's been 20 minutes. You've chosen nothing."},
        {"title": "The hotel gym staring contest", "body": "Four dumbbells, one bench, zero ideas."},
        {"title": "Chest day or legs?", "body": "Whichever you pick, you will wonder if it was the right one."},
        {"title": "Same plan, rearranged again", "body": "That's not programming. That's procrastination with a spreadsheet."}]},
    {"kind": "single_split", "slot": 6, "week_start": "2026-11-23", "hook": "Save this 3-day split", "slides": [
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

    q = {"select": "*", "kind": "in.(carousel_humour,carousel_smarter,single_split,single_workout,carousel_workout)", "status": "in.(draft,approved)", "order": "week_start,slot"}
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
