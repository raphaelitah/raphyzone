"""Background music (CC0 tracks from Wikimedia Commons) and ffmpeg helpers."""
import hashlib
import json
import os
import shutil
import subprocess
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
UA = {"User-Agent": "RaphyzoneSocialBot/1.0 (https://raphyzone.pages.dev; raphael.itah@gmail.com)"}
CACHE = Path(os.environ.get("SOCIAL_CACHE", Path.home() / ".cache" / "raphyzone-social"))


def download(url, dest, headers=UA):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, headers=headers, stream=True, timeout=120, allow_redirects=True) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.rename(dest)
    return dest


def _commons_license(file_title):
    r = requests.get(
        "https://commons.wikimedia.org/w/api.php",
        params={"action": "query", "format": "json", "titles": f"File:{file_title}", "prop": "imageinfo",
                "iiprop": "extmetadata", "iiextmetadatafilter": "LicenseShortName"},
        headers=UA, timeout=30,
    )
    r.raise_for_status()
    page = next(iter(r.json()["query"]["pages"].values()))
    return page.get("imageinfo", [{}])[0].get("extmetadata", {}).get("LicenseShortName", {}).get("value")


def pick_music(mood, seed):
    """Download (cached) a CC0 track for `mood`; returns (path, start_seconds, title)."""
    tracks = json.loads((ROOT / "music.json").read_text())[mood if mood in ("calm", "driving", "upbeat") else "upbeat"]
    order = sorted(range(len(tracks)), key=lambda i: hashlib.sha1(f"{seed}{i}".encode()).hexdigest())
    for i in order:
        t = tracks[i]
        lic = _commons_license(t["file"])
        if lic != "CC0":
            print(f"Skipping '{t['file']}': licence is {lic!r}, not CC0")
            continue
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(t["file"])
        path = download(url, CACHE / "music" / t["file"].replace(" ", "_"))
        return path, t.get("start", 0), t["file"]
    return None, 0, None


def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def duration(path):
    """Duration in seconds, read from ffmpeg's banner (no ffprobe needed)."""
    p = subprocess.run([ffmpeg_exe(), "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    import re
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m:
        raise RuntimeError(f"cannot read duration of {path}")
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
