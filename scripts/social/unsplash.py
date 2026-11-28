"""Background photos from the Unsplash API for the still-image posts.

API guideline duties handled here and by the caller: credit the photographer and
Unsplash (on the image, in the caption and, with links, on the review page) and
ping the photo's download_location when it is used. The photos are composed into
our own artwork, so the rendered slides are hosted by us, not hotlinked.

Env: UNSPLASH_ACCESS_KEY (optional: plain brand backgrounds without it).
"""
import hashlib
import io
import os
import re

import requests
from PIL import Image, ImageOps

API = "https://api.unsplash.com"
UTM = "utm_source=raphyzone&utm_medium=referral"

QUERIES = {
    "carousel_humour": ["gym bag", "empty gym", "person phone gym", "locker room"],
    "carousel_smarter": ["barbell weights", "weight plates", "training notebook gym", "deadlift"],
    "single_split": ["dumbbell rack", "gym equipment", "kettlebells", "barbell dark"],
    "single_workout": ["gym workout", "dumbbell training", "bodyweight exercise", "gym floor"],
}

# Catalog equipment -> (search query, word the photo's description must contain),
# most recognisable piece of kit first.
GEAR = {
    "kettlebell": ("kettlebell workout", r"kettle ?bell"),
    "barbell": ("barbell lifting", r"barbell|weightlift|deadlift"),
    "dumbbell": ("dumbbell workout", r"dumb ?bell"),
    "pull-up bar": ("pull up bar exercise", r"pull[- ]?up|chin[- ]?up"),
    "medicine ball": ("medicine ball workout", r"medicine ball|wall ball"),
    "jump rope": ("jump rope", r"jump(ing)? ?rope|skipping"),
    "rower": ("rowing machine", r"rowing machine|rower"),
    "skierg": ("ski erg", r"ski ?erg"),
    "bike": ("exercise bike gym", r"bike|cycl"),
    "sled": ("sled push gym", r"sled"),
}

_CREDIT_LINE = re.compile(r"\n*^Photo by .+ on Unsplash$", re.M)


def _auth(key):
    return {"Authorization": f"Client-ID {key}", "Accept-Version": "v1"}


def _digest(text):
    return hashlib.sha1(text.encode()).hexdigest()


def _search(key, query, used, must_show=None):
    r = requests.get(f"{API}/search/photos", headers=_auth(key), timeout=30,
                     params={"query": query, "orientation": "portrait", "content_filter": "high", "per_page": 30})
    r.raise_for_status()
    photos = [p for p in r.json().get("results", []) if p["id"] not in used]
    if must_show:  # search results are loose: keep those whose description names the kit
        photos = [p for p in photos if re.search(must_show, f"{p.get('alt_description') or ''} {p.get('description') or ''}", re.I)]
    return photos


def find_photo(kind, seed, used, size, equipment=()):
    """Return (image, meta) for this post, or (None, None) when there is no key, result or connection.

    With `equipment`, a photo showing one of those pieces of kit is preferred; the
    kind's general queries are the fallback.
    """
    key = os.environ.get("UNSPLASH_ACCESS_KEY")
    queries = QUERIES.get(kind)
    if not key or not queries:
        return None, None
    query = queries[int(_digest(seed), 16) % len(queries)]
    try:
        photos = []
        for gear in [g for g in GEAR if g in equipment][:2]:  # two tries, to stay light on the rate limit
            photos = _search(key, GEAR[gear][0], used, GEAR[gear][1])
            if photos:
                break
        photos = photos or _search(key, query, used)
        if not photos:
            return None, None
        p = min(photos, key=lambda x: _digest(f"{seed}{x['id']}"))
        w, h = size
        # urls.raw already carries the ixid parameter, which must be kept.
        img_r = requests.get(f"{p['urls']['raw']}&w={w}&h={h}&fit=crop&crop=entropy&fm=jpg&q=85", timeout=60)
        img_r.raise_for_status()
        img = ImageOps.fit(Image.open(io.BytesIO(img_r.content)).convert("RGB"), size)
        meta = {
            "id": p["id"],
            "photographer": p["user"]["name"],
            "photographer_url": f"{p['user']['links']['html']}?{UTM}",
            "photo_url": f"{p['links']['html']}?{UTM}",
            "download_location": p["links"]["download_location"],
        }
    except (requests.RequestException, OSError, KeyError, ValueError) as err:
        print(f"  photo lookup failed: {err}")
        return None, None
    used.add(meta["id"])
    return img, meta


def track_download(meta):
    """Tell Unsplash the photo was used. Raises, so an untracked photo is never attached to a post."""
    r = requests.get(meta["download_location"], headers=_auth(os.environ["UNSPLASH_ACCESS_KEY"]), timeout=30)
    r.raise_for_status()


def credit_caption(caption, meta):
    """Caption with exactly one credit line for `meta` (none when meta is None)."""
    body = _CREDIT_LINE.sub("", caption or "").rstrip()
    return f"{body}\n\nPhoto by {meta['photographer']} on Unsplash" if meta else body
