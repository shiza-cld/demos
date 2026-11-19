"""List GTA-6-titled VODs of every streamer in streamers.json, with the part recorded in the last N hours.
usage: python3 -I find_vods.py [since_hours=24] [per_channel=5]
Per VOD: src, streamer, tier, title, start_utc, duration, and new_from/new_to = offsets (sec) of the material
recorded since now - since_hours (null when nothing new)."""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json, subprocess, sys, time
from common import GTA6, YTDLP, videos_page, stream_url, vod_start, AUDIO_FMT

since_h = float(sys.argv[1]) if len(sys.argv) > 1 else 24
n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
now = time.time(); cutoff = now - since_h * 3600
streamers = json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "streamers.json"), encoding="utf-8"))
out = []
for s in streamers:
    r = subprocess.run([*YTDLP, "--flat-playlist", "--playlist-end", str(n), "--print",
                        "%(id)s\t%(title)s\t%(duration)s", videos_page(s["platform"], s["channel"])],
                       capture_output=True, text=True, timeout=180)
    for line in r.stdout.splitlines():
        vid, title, dur = (line.split("\t") + ["", ""])[:3]
        if not GTA6.search(title): continue
        src = f"twitch:{vid.lstrip('v')}" if s["platform"] == "twitch" else f"kick:{s['channel']}:{vid}"
        dur = float(dur) if dur not in ("NA", "") else None
        try: start = vod_start(stream_url(src, AUDIO_FMT))
        except Exception: start = None
        new_from = new_to = None
        if start and dur and start + dur > cutoff:
            new_from, new_to = max(0.0, cutoff - start), dur
        out.append({"streamer": s["name"], "tier": s["tier"], "src": src, "title": title,
                    "start_utc": time.strftime("%Y-%m-%d %H:%M", time.gmtime(start)) if start else None,
                    "duration": dur, "new_from": new_from, "new_to": new_to})
print(json.dumps(out, ensure_ascii=True, indent=1))
