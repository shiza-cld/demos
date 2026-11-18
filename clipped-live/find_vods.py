"""List recent GTA 6 VODs for every streamer in streamers.json, as JSON.
usage: python3 -I find_vods.py [per_channel=5]"""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json, subprocess, sys
from common import GTA6, videos_page

n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
streamers = json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "streamers.json")))
out = []
for s in streamers:
    r = subprocess.run(["yt-dlp", "--flat-playlist", "--playlist-end", str(n), "--print",
                        "%(id)s\t%(title)s\t%(duration)s\t%(timestamp)s", videos_page(s["platform"], s["channel"])],
                       capture_output=True, text=True, timeout=180)
    for line in r.stdout.splitlines():
        vid, title, dur, ts = (line.split("\t") + ["", "", ""])[:4]
        if not GTA6.search(title): continue
        src = f"twitch:{vid.lstrip('v')}" if s["platform"] == "twitch" else f"kick:{s['channel']}:{vid}"
        out.append({"streamer": s["name"], "tier": s["tier"], "src": src, "title": title,
                    "duration": float(dur) if dur not in ("NA", "") else None,
                    "timestamp": int(float(ts)) if ts not in ("NA", "") else None})
print(json.dumps(out, ensure_ascii=False, indent=1))
