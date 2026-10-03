"""Stock footage from Pexels, else Pixabay (both free API keys; both licences allow commercial use, no attribution)."""
import hashlib
import os
from pathlib import Path

import requests

from reel_audio import CACHE, UA, download


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
    videos = [v for v in r.json().get("videos", []) if f"pexels{v['id']}" not in used and v.get("duration", 0) >= min(min_seconds, 6)]
    if not videos:
        return None
    videos.sort(key=lambda v: hashlib.sha1(f"{seed}{v['id']}".encode()).hexdigest())
    v = videos[0]
    files = [f for f in v["video_files"] if f.get("file_type") == "video/mp4" and (f.get("width") or 0) >= 720 and (f.get("height") or 0) > (f.get("width") or 0)]
    if not files:
        return None
    files.sort(key=lambda f: abs((f["width"] or 0) - 1080))
    used.add(f"pexels{v['id']}")
    return download(files[0]["link"], CACHE / "footage" / f"pexels{v['id']}.mp4")


def _pixabay(query, min_seconds, seed, used):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return None
    r = requests.get(
        "https://pixabay.com/api/videos/",
        params={"key": key, "q": query[:100], "video_type": "film", "safesearch": "true", "per_page": 20},
        headers=UA, timeout=30,
    )
    r.raise_for_status()
    hits = [h for h in r.json().get("hits", []) if f"pixabay{h['id']}" not in used and h.get("duration", 0) >= min(min_seconds, 6)]
    if not hits:
        return None
    hits.sort(key=lambda h: hashlib.sha1(f"{seed}{h['id']}".encode()).hexdigest())
    h = hits[0]
    # Pixabay clips are mostly landscape: the renderer centre-crops to 9:16, so prefer the biggest file.
    for size in ("large", "medium", "small"):
        v = h["videos"].get(size)
        if v and v.get("url") and (v.get("height") or 0) >= 720:
            used.add(f"pixabay{h['id']}")
            # Downloaded and cached, never hotlinked (Pixabay API terms).
            return download(v["url"], CACHE / "footage" / f"pixabay{h['id']}.mp4")
    return None


def find_clip(query, min_seconds, seed, used):
    """Return a local mp4 path for `query`, or None (no key / no result -> caller uses a brand background)."""
    for provider in (_pixabay, _pexels):
        try:
            clip = provider(query, min_seconds, seed, used)
        except requests.RequestException as err:
            print(f"  footage lookup failed ({provider.__name__[1:]}): {err}")
            continue
        if clip:
            return clip
    return None
