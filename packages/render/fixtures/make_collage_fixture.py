"""Builds fixtures/recap-collage.json (25 tracks, 5x5) (gitignored: embeds third-party cover art).

Covers come from the public iTunes Search API, 300x300 JPEG, base64-encoded the
way the bot would pass them (decisions/2026-10-07-lucky-render-rust-sidecar.md).
"""

import base64
import http.client
import json
import pathlib
import ssl
import urllib.parse

TRACKS = [
    ("夜に駆ける", "YOASOBI", 14),
    ("Get Lucky", "Daft Punk", 12),
    ("Birds of a Feather", "Billie Eilish", 11),
    ("Kifak Inta", "فيروز", 10, "Fairuz Kifak Inta"),
    ("Tsunami", "עומר אדם", 9, "Omer Adam"),
    ("Группа крови", "Кино", 9, "Kino Gruppa Krovi"),
    ("晴天", "周杰倫", 8, "Jay Chou Qing Tian"),
    ("DtMF", "Bad Bunny", 8),
    ("Espresso", "Sabrina Carpenter", 7),
    ("Blinding Lights", "The Weeknd", 7),
    ("APT.", "ROSÉ & Bruno Mars", 7, "Rose Bruno Mars APT"),
    ("Mr. Brightside", "The Killers", 6),
    ("Feel Good Inc.", "Gorillaz", 6),
    ("Tití Me Preguntó", "Bad Bunny", 6),
    ("Dynamite", "BTS", 5),
    ("Anti-Hero", "Taylor Swift", 5),
    ("Bohemian Rhapsody", "Queen", 5),
    ("Águas de Março", "Elis Regina & Tom Jobim", 5, "Elis Regina Tom Jobim Aguas de Marco"),
    ("Smells Like Teen Spirit", "Nirvana", 4),
    ("HUMBLE.", "Kendrick Lamar", 4),
    ("Levitating", "Dua Lipa", 4),
    ("Do I Wanna Know?", "Arctic Monkeys", 4),
    ("Midnight City", "M83", 3),
    ("Garota de Ipanema", "João Gilberto", 3, "Joao Gilberto Garota de Ipanema"),
    ("An extremely long title that keeps going well past any slot width the card could ever show, repeated to reach two hundred characters in total", "Unknown", 3, None),
]


def fetch(url):
    # The artwork URL comes from the API response, so only https on Apple
    # hosts is allowed. HTTPSConnection cannot open file:// or other schemes.
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname or ""
    if parts.scheme != "https" or not (host == "apple.com" or host.endswith((".apple.com", ".mzstatic.com"))):
        raise ValueError(f"refusing to fetch {url!r}")
    # Explicit default context: certificate and hostname verification on.
    conn = http.client.HTTPSConnection(host, timeout=10, context=ssl.create_default_context())
    try:
        conn.request("GET", parts.path + (f"?{parts.query}" if parts.query else ""))
        resp = conn.getresponse()
        if resp.status != 200:
            raise ValueError(f"HTTP {resp.status} for {url!r}")
        return resp.read()
    finally:
        conn.close()


def cover(term):
    if term is None:
        return None
    q = urllib.parse.urlencode({"term": term, "entity": "song", "limit": 1})
    results = json.loads(fetch(f"https://itunes.apple.com/search?{q}"))["results"]
    if not results:
        return None
    url = results[0]["artworkUrl100"].replace("100x100", "300x300")
    return base64.b64encode(fetch(url)).decode()


top = []
for t in TRACKS:
    title, author, plays = t[:3]
    term = t[3] if len(t) > 3 else f"{author} {title}"
    top.append({"title": title, "author": author, "plays": plays, "cover": cover(term)})
    print(title, "cover" if top[-1]["cover"] else "no cover")

fixture = json.loads((pathlib.Path(__file__).parent / "recap-poc.json").read_text())
fixture["topTracks"] = top
(pathlib.Path(__file__).parent / "recap-collage.json").write_text(json.dumps(fixture, ensure_ascii=False))
