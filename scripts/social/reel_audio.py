"""Voiceover (Kokoro, Apache-2.0) and background music (CC0 tracks from Wikimedia Commons)."""
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
KOKORO_ONNX = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
KOKORO_VOICES = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
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


_kokoro = None


def _get_kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        model = download(KOKORO_ONNX, CACHE / "kokoro.int8.onnx")
        voices = download(KOKORO_VOICES, CACHE / "kokoro-voices.bin")
        _kokoro = Kokoro(str(model), str(voices))
    return _kokoro


def synth(text, out_wav):
    """Write a voiceover WAV for `text`. TTS_ENGINE=say uses macOS `say` (local testing only)."""
    out_wav = Path(out_wav)
    if os.environ.get("TTS_ENGINE") == "say":
        aiff = out_wav.with_suffix(".aiff")
        subprocess.run(["say", "-v", "Samantha", "-r", "175", "-o", str(aiff), text], check=True)
        return aiff
    import soundfile as sf
    k = _get_kokoro()
    samples, sr = k.create(text, voice=os.environ.get("TTS_VOICE", "af_heart"), speed=1.05, lang="en-us")
    sf.write(str(out_wav), samples, sr)
    return out_wav


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
    p = subprocess.run([ffmpeg_exe(), "-i", str(path)], capture_output=True, text=True)
    import re
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m:
        raise RuntimeError(f"cannot read duration of {path}")
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
