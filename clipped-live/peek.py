"""Contact sheet of frames spread across a VOD (to confirm it is GTA 6 gameplay and see the layout).
usage: python3 -I peek.py <src> <out.jpg> [n=6] [from_sec] [to_sec]
Also saves the 1080p segment frames as <out>_<k>.png for webcam detection tests."""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import sys, os, subprocess, tempfile
from common import stream_url, playlist

src, out = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
segs = playlist(stream_url(src, "360p/360p30/480p/480p30/worst"))
a = float(sys.argv[4]) if len(sys.argv) > 4 else 0
b = float(sys.argv[5]) if len(sys.argv) > 5 else segs[-1][0] + segs[-1][1]
tmp = tempfile.mkdtemp()
tiles = []
for k in range(n):
    t = a + (b - a) * (k + 0.5) / n
    s = min(segs, key=lambda x: abs(x[0] + x[1] / 2 - t))
    ts, jpg = os.path.join(tmp, f"{k}.ts"), os.path.join(tmp, f"{k}.jpg")
    subprocess.run(["curl", "-sS", "--retry", "5", "--retry-all-errors", "-o", ts, s[2]], check=True)
    h, m = int(s[0] // 3600), int(s[0] % 3600 // 60)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2", "-i", ts, "-frames:v", "1", "-vf",
                    f"scale=480:270,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                    f"text='{h}h{m:02d}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black", jpg], check=True)
    tiles.append(jpg)
cols = 3
args = sum((["-i", t] for t in tiles), [])
layout = "|".join(f"{(i % cols) * 480}_{(i // cols) * 270}" for i in range(len(tiles)))
subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex",
                f"xstack=inputs={len(tiles)}:layout={layout}:fill=black", out], check=True)
print(out)
