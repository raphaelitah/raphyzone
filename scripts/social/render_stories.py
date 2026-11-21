#!/usr/bin/env python3
"""Renders the 9:16 Story teaser image for each post (Pillow) and stores its URL in
social_posts.story_asset_url. The publisher posts it as an Instagram Story right after
the post goes live. The story shows the post's hook and a "new post" cue; it never
mentions plans or pricing.

  --local DIR   render to DIR and skip upload/DB writes     --sample   built-in samples
  --week YYYY-MM-DD  only that week                         --force    re-render existing
"""
import argparse
import hashlib
import io
import os
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw

import render_images as ri  # shared fonts, colours and text helpers

SW, SH = 1080, 1920
# Instagram overlays its own UI on the top ~250px and bottom ~340px of a Story: keep text inside.
TOP, BOTTOM = 260, SH - 360

CUE = {"reel": "New reel", "carousel": "New carousel", "single": "New post"}


def cue_for(kind):
    return CUE["reel"] if kind.startswith("reel") else CUE["carousel"] if kind.startswith("carousel") else CUE["single"]


def story_image(post):
    img = Image.new("RGB", (SW, SH), ri.INDIGO)
    d = ImageDraw.Draw(img)
    d.ellipse([SW - 560, SH - 900, SW + 360, SH + 20], fill=ri.INDIGO_DARK)  # soft corner shape
    ri.logo(d, ri.MARGIN, TOP, 72, bg=ri.WHITE, fg=ri.INDIGO)
    d.text((ri.MARGIN + 92, TOP + 14), "@raphyzone", font=ri.font(36, 700), fill=ri.WHITE)

    fnt, lines, size = ri.fit(d, post["hook"], SW - 2 * ri.MARGIN, 700, 128, 72, 800, 1.06)
    block_h = len(lines) * size * 1.06 + 60
    y = TOP + 160 + max(0, (BOTTOM - (TOP + 160) - 260 - block_h) / 2)
    y = ri.draw_lines(d, lines, fnt, size, ri.MARGIN, y, ri.WHITE, 1.06)
    d.rounded_rectangle([ri.MARGIN, y + 20, ri.MARGIN + 140, y + 30], radius=5, fill=ri.ACCENT)

    label = f"{cue_for(post['kind'])}  ·  now on the feed"
    lf = ri.font(44, 800)
    pw = d.textlength(label, font=lf) + 80
    top = BOTTOM - 170
    d.rounded_rectangle([ri.MARGIN, top, ri.MARGIN + pw, top + 110], radius=55, fill=ri.WHITE)
    d.text((ri.MARGIN + 40, top + 28), label, font=lf, fill=ri.INDIGO)
    return img


SAMPLES = [
    {"kind": "reel_workout", "hook": "Four minutes of staring at the dumbbells"},
    {"kind": "carousel_smarter", "hook": "Did you actually get stronger?"},
    {"kind": "single_split", "hook": "Save this 3-day split"},
]


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
            story_image(p).save(out / f"story-{p['kind']}.png")
        print(f"Wrote story samples to {out}")
        return

    ri.load_env()
    base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    hdr = {"apikey": key, "authorization": f"Bearer {key}"}

    q = {"select": "id,week_start,slot,kind,hook,story_asset_url", "status": "in.(draft,approved)", "order": "week_start,slot"}
    if a.week:
        q["week_start"] = f"eq.{a.week}"
    posts = requests.get(f"{base}/rest/v1/social_posts", headers=hdr, params=q, timeout=30)
    posts.raise_for_status()
    failed = 0
    for post in posts.json():
        tag = f"{post['week_start']}/slot{post['slot']}"
        try:
            if not post.get("hook"):
                continue
            # the file name carries a hash of the hook, so a redone post (new hook) gets a fresh story
            tag_hash = hashlib.sha1(post["hook"].encode()).hexdigest()[:8]
            name = f"{post['week_start']}/{post['slot']}-{post['kind']}/story-{tag_hash}.png"
            if not a.force and (post.get("story_asset_url") or "").endswith(name):
                continue
            img = story_image(post)
            if a.local:
                path = Path(a.local) / name
                path.parent.mkdir(parents=True, exist_ok=True)
                img.save(path)
                continue
            buf = io.BytesIO()
            img.save(buf, "PNG", optimize=True)
            r = requests.post(f"{base}/storage/v1/object/social-assets/{name}", data=buf.getvalue(), timeout=60,
                              headers={**hdr, "content-type": "image/png", "x-upsert": "true", "cache-control": "max-age=3600"})
            r.raise_for_status()
            url = f"{base}/storage/v1/object/public/social-assets/{name}"
            r = requests.patch(f"{base}/rest/v1/social_posts", params={"id": f"eq.{post['id']}"},
                               json={"story_asset_url": url, "updated_date": "now()"},
                               headers={**hdr, "content-type": "application/json"}, timeout=30)
            r.raise_for_status()
            print(f"Story image {tag}")
        except Exception as err:  # keep going; a missing story never blocks the post
            failed += 1
            print(f"FAILED story {tag}: {err}", file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
