"""Download audio of a VOD range, transcribe it, and write candidate highlight windows for review.
usage: python3 -I prepare_vod.py <src> <from_sec> <max_hours> <out_dir>   (src: twitch:<id> or kick:<channel>:<uuid>)
writes: transcript.tsv (abs_sec<TAB>text), candidates.md, and prints processed_until=<sec>"""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import sys, os, json, subprocess, numpy as np
from common import stream_url, playlist, fetch, concat, AUDIO_FMT

src, t_from, max_h, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
os.makedirs(out, exist_ok=True)
segs = [s for s in playlist(stream_url(src, AUDIO_FMT)) if s[0] >= t_from - 0.01]
segs = [s for s in segs if s[0] < t_from + max_h * 3600]
if not segs: print("processed_until=%d" % t_from); print("NOTHING_NEW"); sys.exit(0)
start, until = segs[0][0], segs[-1][0] + segs[-1][1]
audio = concat(fetch(segs, f"{out}/aseg"), f"{out}/audio.m4a", ["-vn", "-c:a", "aac", "-b:a", "96k"])

pcm = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                   capture_output=True).stdout, np.float32)
# loudness per second relative to local 5-min median -> peaks (screams / laughter / hype)
n = len(pcm) // 16000
db = 20 * np.log10(np.sqrt((pcm[:n * 16000].reshape(n, 16000) ** 2).mean(1) + 1e-10))
rel = db - np.array([np.median(db[max(0, i - 150):i + 150]) for i in range(n)])
score = np.convolve(rel, np.ones(20) / 20, mode="same")

from faster_whisper import WhisperModel
m = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=os.cpu_count())
segs_t, _ = m.transcribe(pcm, language="en", vad_filter=True, beam_size=1)
lines = []
with open(f"{out}/transcript.tsv", "w") as f:
    for s in segs_t:
        lines.append((start + s.start, s.text.strip())); f.write(f"{start + s.start:.0f}\t{s.text.strip()}\n"); f.flush()

# reaction keywords add to the score of the second they occur in
KW = ("no way", "what the", "oh my god", "bro what", "are you serious", "crying", "hilarious", "i'm dead",
      "on god", "hold on", "yo yo", "chat", "let's go", "w's", "shut up", "why would", "wait wait")
for t, txt in lines:
    i = int(t - start)
    if 0 <= i < n and any(k in txt.lower() for k in KW): score[max(0, i - 10):i + 10] += 0.6

k = max(6, int(3 * (until - start) / 3600))          # ~3 candidates per hour
picked = []
for i in np.argsort(-score):
    if all(abs(i - j) > 90 for j in picked): picked.append(int(i))
    if len(picked) >= k: break
def hms(t): t = int(t); return f"{t//3600}:{t%3600//60:02d}:{t%60:02d}"
with open(f"{out}/candidates.md", "w") as f:
    f.write(f"# {src} candidates ({hms(start)}–{hms(until)})\n\n")
    for i in sorted(picked):
        c = start + i
        f.write(f"## {hms(c)} (sec {c:.0f}, score {score[i]:.1f})\n")
        for t, txt in lines:
            if c - 60 <= t <= c + 45: f.write(f"{t:.0f}: {txt}\n")
        f.write("\n")
print(f"processed_until={until:.0f}")
