#!/usr/bin/env python3
"""Saturday renderer, part 2: 9:16 reels.

For each draft reel post with render_status='pending':
  hook/story scenes (Pexels footage or brand background + on-screen text)
  -> "workout card" scene built from the real catalog data in post.script.workout
  -> app screen scene (live capture of the workout in the Raphyzone app)
  -> end card, with CC0 music underneath. No voiceover: music + on-screen text only. Output: 1080x1920 H.264/AAC, <= 90 s.
Uploads the MP4 (+ a cover PNG) to the social-assets bucket and records the URLs on the post.

  --sample DIR       render a built-in sample reel into DIR (no Supabase needed)
  --local DIR        render posts from Supabase into DIR, skip upload/DB writes
  --week / --force   as in render_images.py
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIXABAY_API_KEY and/or PEXELS_API_KEY (optional: animated brand backgrounds if neither is set),
     APP_URL.
"""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import requests
from PIL import Image, ImageDraw

import render_images as ri
from reel_audio import duration, ffmpeg_exe, pick_music
from reel_footage import find_clip

ROOT = Path(__file__).resolve().parent
W, H, FPS = 1080, 1920, 30
MAX_SECONDS = 88          # Instagram reels via API: 3-90 s
END_CARD_SECONDS = 2.5
MIN_TEXT_SECONDS = 3.0    # enough time to read the on-screen text
CARD_SECONDS = 5.5
APP_SECONDS = 5.5


# ---------- frames (Pillow) ----------
def gradient_bg(top=ri.INDIGO, bottom=ri.INDIGO_DARK):
    img = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def caption_overlay(text):
    """Transparent 1080x1920 layer with the on-screen text in a rounded dark pill, lower-middle."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fnt, lines, size = ri.fit(d, text, W - 2 * 120, 460, 92, 54, 800, 1.12)
    block_h = len(lines) * size * 1.12
    widest = max(d.textlength(l, font=fnt) for l in lines)
    top = 1180
    pad = 44
    d.rounded_rectangle([(W - widest) / 2 - pad, top - pad, (W + widest) / 2 + pad, top + block_h + pad - 10], radius=44, fill=(11, 11, 20, 170))
    y = top
    for l in lines:
        d.text(((W - d.textlength(l, font=fnt)) / 2, y), l, font=fnt, fill=(255, 255, 255, 255))
        y += size * 1.12
    return img


def workout_card(facts):
    img = Image.new("RGB", (W, H), ri.INK)
    d = ImageDraw.Draw(img)
    d.ellipse([W - 600, -300, W + 300, 600], fill=ri.INDIGO_DARK)
    ri.logo(d, 88, 110, 72)
    d.text((184, 126), "@raphyzone", font=ri.font(36, 700), fill=ri.WHITE)
    d.text((88, 300), "TODAY'S WORKOUT", font=ri.font(38, 800), fill=ri.ACCENT)
    tf, tl, ts = ri.fit(d, facts["name"], W - 176, 300, 120, 64, 800, 1.05)
    y = ri.draw_lines(d, tl, tf, ts, 88, 360, ri.WHITE, 1.05) + 10
    meta = " · ".join(x for x in [f"{int(facts['minutes'])} min" if facts.get("minutes") else None, (str(facts.get("format") or "").upper() if len(str(facts.get("format") or "")) <= 5 else str(facts.get("format") or "").title()) or None, ", ".join(facts.get("equipment") or []).title() or None] if x)
    mf, ml, ms = ri.fit(d, meta, W - 176, 140, 44, 30, 600)
    y = ri.draw_lines(d, ml, mf, ms, 88, y, ri.MUTED_ON_INK) + 36
    items = [(b.get("label"), it) for b in facts["blocks"] for it in b["items"]][:9]
    row_h = min(140, int((H - y - 260) / max(len(items), 1)))
    y += max(0, int((H - y - 260 - row_h * len(items)) / 3))  # sit the list a little lower when it is short
    for i, (_, it) in enumerate(items):
        top = y + i * row_h
        d.rounded_rectangle([88, top, W - 88, top + row_h - 14], radius=26, fill=(30, 30, 52))
        d.ellipse([112, top + (row_h - 14 - 52) / 2, 164, top + (row_h - 14 - 52) / 2 + 52], fill=ri.INDIGO)
        n = str(i + 1)
        nf = ri.font(30, 800)
        d.text((138 - d.textlength(n, font=nf) / 2, top + (row_h - 14) / 2 - 20), n, font=nf, fill=ri.WHITE)
        ef, el, es = ri.fit(d, it, W - 176 - 120, row_h - 28, 42, 26, 700, 1.05)
        ri.draw_lines(d, el[:2], ef, es, 190, top + (row_h - 14 - min(len(el), 2) * es * 1.05) / 2, ri.WHITE, 1.05)
    return img


def app_scene_frame(shot_path, headline):
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    hf, hl, hs = ri.fit(d, headline, W - 160, 200, 74, 48, 800, 1.08)
    ri.draw_lines(d, hl, hf, hs, 80, 90, ri.WHITE, 1.08)
    shot = Image.open(shot_path).convert("RGB")
    pw = 780
    ph = int(shot.height * pw / shot.width)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph], radius=60, fill=255)
    x, y = (W - pw) // 2, 330
    # soft shadow + device bezel
    d.rounded_rectangle([x - 14, y - 14, x + pw + 14, y + min(ph, H - y + 60) + 14], radius=72, fill=(20, 18, 70))
    img.paste(shot, (x, y), mask)
    return img


def end_card():
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    ri.logo(d, (W - 200) // 2, 560, 200, bg=ri.WHITE, fg=ri.INDIGO)
    f1 = ri.font(110, 800)
    for i, line in enumerate(["Stop deciding.", "Start training."]):
        d.text(((W - d.textlength(line, font=f1)) / 2, 820 + i * 124), line, font=f1, fill=ri.WHITE)
    pill = "30 days free · link in bio"
    pf = ri.font(52, 800)
    d.rounded_rectangle([110, 1160, W - 110, 1290], radius=65, fill=ri.WHITE)
    d.text(((W - d.textlength(pill, font=pf)) / 2, 1196), pill, font=pf, fill=ri.INDIGO)
    return img


def cover_frame(hook):
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    ri.logo(d, 88, 150, 80)
    d.text((196, 170), "@raphyzone", font=ri.font(40, 700), fill=ri.WHITE)
    fnt, lines, size = ri.fit(d, hook, W - 176, 700, 130, 76, 800, 1.06)
    y = ri.draw_lines(d, lines, fnt, size, 88, 640, ri.WHITE, 1.06)
    d.rounded_rectangle([88, y + 24, 238, y + 36], radius=6, fill=ri.ACCENT)
    return img


# ---------- ffmpeg ----------
def run(cmd):
    p = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode:
        raise RuntimeError(f"ffmpeg failed: {' '.join(map(str, cmd))[:300]}\n{p.stderr[-1500:]}")


ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "160k"]


def silent_audio_chain(d):
    return f"anullsrc=r=44100:cl=stereo,atrim=0:{d:.3f},asetpts=N/SR/TB[a]"


def animated_gradient(seed):
    """ffmpeg lavfi source: slowly rotating indigo gradient, used when no stock footage is available."""
    return (f"gradients=s={W}x{H}:r={FPS}:c0=0x5048e5:c1=0x3a33b8:c2=0x6c64ff:c3=0x2a2488:nb_colors=4:"
            f"speed=0.03:type=linear:seed={seed}")


def build_scene(out, d, bg, overlay=None, bg_is_video=False, fade=True, bg_lavfi=None):
    """One scene: background (video loop or still) and optional text overlay, d seconds, with a silent audio track."""
    ff = ffmpeg_exe()
    cmd = [ff, "-y"]
    if bg_lavfi:
        cmd += ["-f", "lavfi", "-i", bg_lavfi]
    else:
        cmd += (["-stream_loop", "-1", "-i", bg] if bg_is_video else ["-loop", "1", "-framerate", str(FPS), "-i", bg])
    if overlay:
        cmd += ["-loop", "1", "-framerate", str(FPS), "-i", overlay]
    vf = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1"
    if bg_is_video:
        vf += ",eq=brightness=-0.12:saturation=1.05"
    vf += "[bg]"
    if overlay:
        vf += ";[bg][1:v]overlay=0:0:format=auto[v0]"
    else:
        vf = vf.replace("[bg]", "[v0]")
    vf += f";[v0]{'fade=t=in:st=0:d=0.2,' if fade else ''}format=yuv420p[v]"
    af = silent_audio_chain(d)
    run(cmd + ["-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", f"{d:.3f}"] + ENC + [out])


def concat(parts, out, tmp):
    lst = Path(tmp) / "concat.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run([ffmpeg_exe(), "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])


def mix_music(video, music, start, total, out):
    af = (f"[1:a]atrim=0:{total:.2f},asetpts=N/SR/TB,loudnorm=I=-18:TP=-2,afade=t=in:d=1,"
          f"afade=t=out:st={max(total - 2.5, 0):.2f}:d=2.5[m];"
          "[0:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]")
    run([ffmpeg_exe(), "-y", "-i", video, "-ss", str(start), "-i", music, "-filter_complex", af, "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-ar", "44100", "-b:a", "160k", "-movflags", "+faststart", out])


# ---------- reel assembly ----------
def render_reel(post, work, app_shot_fn):
    """Returns (mp4_path, cover_png_path, music_title)."""
    work = Path(work)
    script = post["script"]
    facts = script.get("workout")
    seed = post["id"]
    used_clips = set()
    parts = []

    # 1. story scenes from the LLM script
    for i, sc in enumerate(script["scenes"]):
        d = max(float(sc.get("seconds", 4)), MIN_TEXT_SECONDS)
        clip = find_clip(sc.get("footage_query") or "gym workout", d, f"{seed}{i}", used_clips)
        bg = clip
        is_video = bool(clip)
        lavfi = None if clip else animated_gradient(int(hashlib.sha1(f"{seed}{i}".encode()).hexdigest()[:6], 16))
        ov = work / f"ov{i}.png"
        caption_overlay(sc.get("on_screen_text") or "").save(ov)
        out = work / f"scene{i}.mp4"
        build_scene(out, d, bg, overlay=ov if sc.get("on_screen_text") else None, bg_is_video=is_video, bg_lavfi=lavfi)
        parts.append(out)

    # 2. workout card, straight from catalog data
    if facts:
        card = work / "card.png"
        workout_card(facts).save(card)
        out = work / "scene_card.mp4"
        build_scene(out, CARD_SECONDS, card)
        parts.append(out)

    # 3. app screen (live capture)
    shot = app_shot_fn(facts["name"]) if facts else None
    if shot:
        frame = work / "app.png"
        app_scene_frame(shot, script["app_scene"].get("headline") or "Pick it. Press start.").save(frame)
        out = work / "scene_app.mp4"
        build_scene(out, APP_SECONDS, frame)
        parts.append(out)

    # 4. end card
    ec = work / "end.png"
    end_card().save(ec)
    out = work / "scene_end.mp4"
    build_scene(out, END_CARD_SECONDS, ec)
    parts.append(out)

    joined = work / "joined.mp4"
    concat(parts, joined, work)
    total = duration(joined)
    if total > MAX_SECONDS:
        raise RuntimeError(f"Reel is {total:.1f}s, over the {MAX_SECONDS}s limit; shorten the script.")

    music, start, title = pick_music(script.get("music_mood") or "upbeat", seed)
    final = work / "final.mp4"
    if music:
        mix_music(joined, music, start, total, final)
    else:
        joined.rename(final)
    cover = work / "cover.png"
    cover_frame(post["hook"]).save(cover)
    return final, cover, title


def app_capture(work, base_url):
    def fn(workout_name):
        out = Path(work) / "app"
        try:
            subprocess.run(["node", str(ROOT / "record_app.mjs"), workout_name, str(out)] + ([base_url] if base_url else []),
                           check=True, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180, cwd=ROOT.parent.parent)
            return out / "app-1.png"
        except Exception as err:  # the reel still works without the app scene
            print(f"  app capture failed ({err}); continuing without the app scene", file=sys.stderr)
            return None
    return fn


SAMPLE = {
    "id": "sample", "hook": "Hotel gym. 30 minutes. Zero thinking.",
    "script": {
        "scenes": [
            {"seconds": 4, "on_screen_text": "No plan. 30 minutes.", "footage_query": "hotel gym"},
            {"seconds": 4, "on_screen_text": "Scrolling is not training", "footage_query": "man scrolling phone gym"},
        ],
        "workout": {"workout_id": "e3c35bfeb3555ea6354b84d5", "name": "Chelsea", "minutes": 30, "difficulty": "intermediate", "format": "EMOM", "equipment": ["pull-up bar", "bodyweight"],
                    "blocks": [{"label": "A", "type": "superset", "rounds": 30, "items": ["Strict Pronated Pull-up × 5", "Push-Up × 10", "Air Squat × 15"]}]},
        "app_scene": {"headline": "Let Raphyzone decide."}, "music_mood": "driving",
    },
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample")
    ap.add_argument("--local")
    ap.add_argument("--week")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    ri.load_env()
    base_app = os.environ.get("APP_URL")

    if a.sample:
        Path(a.sample).mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            final, cover, music = render_reel(SAMPLE, tmp, app_capture(tmp, base_app))
            (Path(a.sample) / "sample-reel.mp4").write_bytes(Path(final).read_bytes())
            (Path(a.sample) / "sample-cover.png").write_bytes(Path(cover).read_bytes())
        print(f"Sample reel written to {a.sample} (music: {music})")
        return

    base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    hdr = {"apikey": key, "authorization": f"Bearer {key}"}
    q = {"select": "*", "kind": "in.(reel_workout,reel_travel)", "status": "in.(draft,approved)", "order": "week_start,slot"}
    if not a.force:
        q["render_status"] = "in.(pending,failed)"
    if a.week:
        q["week_start"] = f"eq.{a.week}"
    r = requests.get(f"{base}/rest/v1/social_posts", headers=hdr, params=q, timeout=30)
    r.raise_for_status()
    failed = 0
    for post in r.json():
        tag = f"{post['week_start']}/slot{post['slot']}"
        try:
            with tempfile.TemporaryDirectory() as tmp:
                final, cover, music = render_reel(post, tmp, app_capture(tmp, base_app))
                prefix = f"{post['week_start']}/{post['slot']}-{post['kind']}"
                if a.local:
                    Path(a.local, prefix).mkdir(parents=True, exist_ok=True)
                    Path(a.local, prefix, "reel.mp4").write_bytes(Path(final).read_bytes())
                    Path(a.local, prefix, "cover.png").write_bytes(Path(cover).read_bytes())
                    print(f"Rendered {tag} (music: {music})")
                    continue
                urls = []
                for name, path, ctype in (("reel.mp4", final, "video/mp4"), ("cover.png", cover, "image/png")):
                    up = requests.post(f"{base}/storage/v1/object/social-assets/{prefix}/{name}", data=Path(path).read_bytes(), timeout=300,
                                       headers={**hdr, "content-type": ctype, "x-upsert": "true", "cache-control": "max-age=3600"})
                    up.raise_for_status()
                    urls.append(f"{base}/storage/v1/object/public/social-assets/{prefix}/{name}")
                patch = {"asset_urls": urls, "render_status": "rendered", "render_error": None, "updated_date": "now()"}
                requests.patch(f"{base}/rest/v1/social_posts", params={"id": f"eq.{post['id']}"}, json=patch,
                               headers={**hdr, "content-type": "application/json"}, timeout=30).raise_for_status()
                print(f"Rendered {tag} (music: {music})")
        except Exception as err:
            failed += 1
            print(f"FAILED {tag}: {err}", file=sys.stderr)
            if not a.local:
                requests.patch(f"{base}/rest/v1/social_posts", params={"id": f"eq.{post['id']}"},
                               json={"render_status": "failed", "render_error": str(err)[:500]},
                               headers={**hdr, "content-type": "application/json"}, timeout=30)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
