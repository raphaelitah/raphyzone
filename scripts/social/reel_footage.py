"""Stock footage from Pexels, else Pixabay (both free API keys; both licences allow commercial use, no attribution)."""
import hashlib
import os
from pathlib import Path

import requests

from reel_audio import CACHE, UA, download


def find_clip(query, min_seconds, seed, used):
    """Return a local mp4 path for `query`, or None (no key / no result -> caller uses a brand background)."""
    return _pexels(query, min_seconds, seed, used) or _pixabay(query, min_seconds, seed, used)


def _pixabay(query, min_seconds, seed, used):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return None
    r = requests.get(
        "https://pixabay.com/api/videos/",
        params={"key": key, "q": query, "per_page": 30, "safesearch": "true"},
        headers=UA, timeout=30,
    )
    r.raise_for_status()
    hits = [h for h in r.json().get("hits", []) if f"pb{h['id']}" not in used and h.get("duration", 0) >= min(min_seconds, 6)]
    # Pixabay has no orientation filter: prefer portrait, then landscape (caller crops to 9:16).
    def pick(h):
        for size in ("large", "medium"):
            f = h["videos"].get(size) or {}
            if f.get("url") and (f.get("width") or 0) >= 720:
                return f
        return None
    cands = [(h, pick(h)) for h in hits]
    cands = [(h, f) for h, f in cands if f]
    cands.sort(key=lambda hf: (hf[1]["height"] <= hf[1]["width"], hashlib.sha1(f"{seed}{hf[0]['id']}".encode()).hexdigest()))
    if not cands:
        return None
    h, f = cands[0]
    used.add(f"pb{h['id']}")
    return download(f["url"], CACHE / "footage" / f"pb{h['id']}.mp4")


def _pexels(query, min_seconds, seed, used):
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return None
    r = requests.get(
        "https://api.pexels.com/videos/search",
        params={"query": query, "orientation": "portrait", "size": "medium", "per_page": 15},
        headers={**UA, "Authorization": key}, timeout=30,
    )
    r.raise_for_status()
    videos = [v for v in r.json().get("videos", []) if v["id"] not in used and v.get("duration", 0) >= min(min_seconds, 6)]
    if not videos:
        return None
    videos.sort(key=lambda v: hashlib.sha1(f"{seed}{v['id']}".encode()).hexdigest())
    v = videos[0]
    files = [f for f in v["video_files"] if f.get("file_type") == "video/mp4" and (f.get("width") or 0) >= 720 and (f.get("height") or 0) > (f.get("width") or 0)]
    if not files:
        return None
    files.sort(key=lambda f: abs((f["width"] or 0) - 1080))
    used.add(v["id"])
    return download(files[0]["link"], CACHE / "footage" / f"{v['id']}.mp4")
