"""List recent Kai Cenat VODs whose title mentions GTA 6, as JSON (newest first)."""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json, subprocess, sys
from common import CHANNEL, GTA6

n = int(sys.argv[1]) if len(sys.argv) > 1 else 15
r = subprocess.run(["yt-dlp", "--flat-playlist", "--playlist-end", str(n), "--print",
                    "%(id)s\t%(title)s\t%(duration)s",
                    f"https://www.twitch.tv/{CHANNEL}/videos?filter=archives&sort=time"],
                   capture_output=True, text=True)
live = subprocess.run(["yt-dlp", "--print", "%(title)s", f"https://www.twitch.tv/{CHANNEL}"],
                      capture_output=True, text=True).returncode == 0
vods = []
for i, line in enumerate(r.stdout.splitlines()):
    vid, title, dur = line.split("\t")
    vods.append({"id": vid.lstrip("v"), "title": title, "duration": float(dur) if dur not in ("NA", "") else None,
                 "gta6": bool(GTA6.search(title)), "still_live": live and i == 0})
print(json.dumps({"channel_live": live, "vods": vods}, ensure_ascii=False, indent=1))
