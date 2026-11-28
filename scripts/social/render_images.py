#!/usr/bin/env python3
"""Saturday renderer, part 1: carousels and the single split / workout image (Pillow).

Reads draft posts with render_status='pending' from Supabase, draws branded
1080x1350 (4:5) PNG slides, uploads them to the public `social-assets` bucket and
stores the URLs in social_posts.asset_urls. Reels are handled by render_reels.py.
Carousel covers and the split image sit on an Unsplash photo (see unsplash.py),
recorded in social_posts.script.photo and credited on the image and in the caption.

  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (or VITE_SUPABASE_URL in .env.local)
  --local DIR     render to DIR and skip upload/DB writes (design iteration)
  --week YYYY-MM-DD   only that week      --force   re-render even if rendered
  --sample        render built-in sample posts (no Supabase needed)
  UNSPLASH_ACCESS_KEY    optional; plain brand backgrounds without it
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

from unsplash import credit_caption, find_photo, track_download

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


def photo_slide(photo, credit, tint):
    """The photo under a dark wash (so white text stays readable), credited bottom right."""
    img = Image.blend(photo, Image.new("RGB", photo.size, INK), tint)
    d = ImageDraw.Draw(img)
    text = f"Photo: {credit} / Unsplash"
    cf = font(24, 600)
    d.text((W - MARGIN - d.textlength(text, font=cf), H - 52), text, font=cf, fill=WHITE)
    return img, d


def slide_cover(title, subtitle=None, photo=None, credit=None):
    if photo:
        img, d = photo_slide(photo, credit, 0.62)
    else:
        img, d = new_slide(INDIGO)
        d.ellipse([W - 520, H - 560, W + 280, H + 240], fill=INDIGO_DARK)  # soft corner shape
    header(d, dark=True)
    fnt, lines, size = fit(d, title, W - 2 * MARGIN, 540 if subtitle else 640, 124, 72, 800, 1.06)
    y = 300
    y = draw_lines(d, lines, fnt, size, MARGIN, y, WHITE, 1.06)
    d.rounded_rectangle([MARGIN, y + 60, MARGIN + 140, y + 70], radius=5, fill=ACCENT)
    if subtitle:
        sf, sl, ss = fit(d, subtitle, W - 2 * MARGIN, 160, 44, 32, 500)
        draw_lines(d, sl, sf, ss, MARGIN, y + 126, WHITE if photo else MUTED_ON_INK)
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


def slide_split(title, body, photo=None, credit=None):
    """Save-for-later weekly split: one row per line of 'Day — focus'."""
    img, d = photo_slide(photo, credit, 0.55) if photo else new_slide(PAPER)
    header(d, dark=bool(photo))
    tf, tl, ts = fit(d, title, W - 2 * MARGIN, 300, 92, 56, 800, 1.06)
    y = draw_lines(d, tl, tf, ts, MARGIN, 190, WHITE if photo else INK, 1.06) + 36
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
    d.text((MARGIN, H - 120), "Save this  ·  @raphyzone", font=font(36, 700), fill=WHITE if photo else INDIGO)
    return img


def slide_workout(title, body, photo=None, credit=None):
    """One featured workout: a summary line, then one card per exercise (up to 10).

    Fewer cards get taller, with larger text and wider gaps; the whole block is then
    centred between the header and the footer, so short lists neither hug the top
    nor stretch to fill the page.
    """
    img, d = photo_slide(photo, credit, 0.55) if photo else new_slide(PAPER)
    header(d, dark=bool(photo))
    meta, *rows = [r.strip() for r in str(body).split("\n") if r.strip()]
    rows = rows[:10]
    n = max(len(rows), 1)
    area_top, area_bottom = 190, H - 160
    tf, tl, ts = fit(d, title, W - 2 * MARGIN, 220, 104 if n <= 5 else 88, 52, 800, 1.06)
    mf, ml, ms = fit(d, meta, W - 2 * MARGIN, 96, 40 if n <= 7 else 34, 28, 700)
    head_gap = max(28, 76 - 6 * n)  # between the summary line and the first card
    head_h = len(tl) * ts * 1.06 + 18 + len(ml) * ms * 1.12 + head_gap
    gap = max(10, min(28, 40 - 4 * n))
    card_h = int(min(150, (area_bottom - area_top - head_h - gap * (n - 1)) // n))
    block_h = head_h + n * card_h + (n - 1) * gap
    top = area_top + (area_bottom - area_top - block_h) * 0.45  # a touch above true centre
    y = draw_lines(d, tl, tf, ts, MARGIN, top, WHITE if photo else INK, 1.06) + 18
    y = draw_lines(d, ml, mf, ms, MARGIN, y, ACCENT if photo else INDIGO) + head_gap
    text_w = W - 2 * MARGIN - 72
    # one text size for every card: the largest at which all rows stay on one line
    size = max(30, min(50, int(card_h * 0.42)))
    while size > 30 and any(d.textlength(r, font=font(size, 700)) > text_w for r in rows):
        size -= 2
    for i, row in enumerate(rows):
        card_top = y + i * (card_h + gap)
        d.rounded_rectangle([MARGIN, card_top, W - MARGIN, card_top + card_h], radius=min(30, card_h * 0.3), fill=WHITE)
        rf, rl, rs = font(size, 700), wrap(d, row, font(size, 700), text_w), size
        if len(rl) > 1:
            rf, rl, rs = fit(d, row, text_w, card_h - 12, size, 22, 700, 1.1)
        shown = rl[:2]
        # centre on the visible letters, not the font's line box
        text_top = card_top + (card_h - (len(shown) - 1) * rs * 1.1 - rs * 1.2) / 2
        draw_lines(d, shown, rf, rs, MARGIN + 36, text_top, INK, 1.1)
    d.text((MARGIN, H - 120), "Save this  ·  @raphyzone", font=font(36, 700), fill=WHITE if photo else INDIGO)
    return img


def render_post(post, photo=None, credit=None):
    slides = post.get("slides") or []
    if post["kind"] == "single_split":
        s = slides[0]
        return [slide_split(s.get("title", post["hook"]), s.get("body", ""), photo, credit)]
    if post["kind"] == "single_workout":
        s = slides[0]
        return [slide_workout(s.get("title", post["hook"]), s.get("body", ""), photo, credit)]
    out = [slide_cover(slides[0].get("title") or post["hook"], slides[0].get("body") or None, photo, credit)]
    body = slides[1:]
    cta_needed = len(body) + 1 < MAX_SLIDES
    total = 1 + len(body) + (1 if cta_needed else 0)
    for i, s in enumerate(body):
        out.append(slide_content(s.get("title", ""), s.get("body", ""), i + 2, total, dark=(i % 2 == 1)))
    if cta_needed:
        out.append(slide_cta())
    return out[:MAX_SLIDES]


SAMPLES = [
    {"kind": "single_workout", "slot": 6, "hook": "Save this full-body session", "slides": [
        {"title": "Sample Full Body", "body": "30 min · 4 rounds · Dumbbell, Bench / Box\nDumbbell Goblet Squat × 12\nDumbbell Bench Press × 10\nSingle Arm Dumbbell Row × 10\nDumbbell Romanian Deadlift × 12\nPlank × 40s"}]},
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

    load_env()
    if a.sample:
        out = Path(a.local or "social-out")
        out.mkdir(parents=True, exist_ok=True)
        for p in SAMPLES:
            photo, meta = find_photo(p["kind"], f"sample/{p['slot']}", set(), (W, H))
            for i, img in enumerate(render_post(p, photo, meta and meta["photographer"]), 1):
                img.save(out / f"sample-{p['kind']}-{i}.png")
        print(f"Wrote samples to {out}")
        return

    base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    hdr = {"apikey": key, "authorization": f"Bearer {key}"}

    q = {"select": "*", "kind": "in.(carousel_humour,carousel_smarter,single_split,single_workout)", "status": "in.(draft,approved)", "order": "week_start,slot"}
    if not a.force:
        q["render_status"] = "in.(pending,failed)"
    if a.week:
        q["week_start"] = f"eq.{a.week}"
    posts = requests.get(f"{base}/rest/v1/social_posts", headers=hdr, params=q, timeout=30)
    posts.raise_for_status()
    rows = requests.get(f"{base}/rest/v1/social_posts", headers=hdr, timeout=30,
                        params={"select": "id:script->photo->>id", "script->photo": "not.is.null", "order": "week_start.desc", "limit": 200})
    rows.raise_for_status()
    used = {r["id"] for r in rows.json()}  # recent photos, so the feed does not repeat itself
    failed = 0
    for post in posts.json():
        tag = f"{post['week_start']}/slot{post['slot']}"
        try:
            equipment = ((post.get("script") or {}).get("workout") or {}).get("equipment") or ()
            photo, meta = find_photo(post["kind"], tag, used, (W, H), equipment)
            images = render_post(post, photo, meta and meta["photographer"])
            if meta and not a.local:
                track_download(meta)
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
                script = {k: v for k, v in (post.get("script") or {}).items() if k != "photo"}
                if meta:
                    script["photo"] = meta
                patch = {"asset_urls": urls, "render_status": "rendered", "render_error": None, "updated_date": "now()",
                         "script": script, "caption": credit_caption(post.get("caption"), meta)}
                if meta and post["status"] == "approved":
                    patch["status"] = "draft"  # new artwork needs a person to approve it again
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
