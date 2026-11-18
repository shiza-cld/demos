"""Build one vertical YouTube Short (1080x1920) with burned-in English captions from a Twitch VOD range.

usage: python3 -I make_clip.py <src> <start_sec> <end_sec> <name> <out_dir>   (src: twitch:<id> or kick:<channel>:<uuid>)

Outputs in <out_dir>:
  <name>.mp4      HEVC, 30 fps, sized to fit under 10 MB (Google Drive upload limit from Claude)
  <name>.en.srt   captions for uploading separately to YouTube
  <name>.jpg      preview frame, to check the layout
  <name>.txt      what was said (for writing the title/description)
"""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import sys, os, re, json, subprocess
import numpy as np
from faster_whisper import WhisperModel
from common import stream_url, playlist, fetch, concat, VIDEO_FMT
import camdetect

src, t0, t1, name, out_dir = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
MAX_BYTES = 9.0 * 1024 * 1024          # stay safely under the 10 MB Drive limit
work = os.path.join(out_dir, "_work", name); os.makedirs(work, exist_ok=True)

# 1) fetch the HLS segments covering [t0, t1] and cut the exact range
segs = [s for s in playlist(stream_url(src, VIDEO_FMT))
        if s[0] + s[1] > t0 and s[0] < t1]
if not segs: sys.exit(f"range {t0}-{t1} not in {src}")
raw = os.path.join(work, "raw.mp4")
concat(fetch(segs, os.path.join(work, "seg")), raw,
       ["-ss", f"{t0 - segs[0][0]:.3f}", "-t", f"{t1 - t0:.3f}", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "16", "-r", "30", "-c:a", "aac", "-b:a", "192k"])
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw],
                           capture_output=True, text=True).stdout)

# 2) transcribe with word timestamps
audio = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", raw, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                     capture_output=True).stdout, np.float32)
def transcribe(model_name, **kw):
    m = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count())
    segments, _ = m.transcribe(audio, language="en", word_timestamps=True, condition_on_previous_text=False, **kw)
    return [(w.start, w.end, w.word.strip()) for s in segments for w in (s.words or []) if w.word.strip()]
words = None
for model_name, kw in (("small.en", dict(beam_size=5, vad_filter=True)),
                       ("small.en", dict(beam_size=1, vad_filter=False)),
                       ("base.en", dict(beam_size=1, vad_filter=True))):
    try:
        words = transcribe(model_name, **kw); break
    except (IndexError, ValueError):   # rare faster-whisper word-alignment failure: try the next setting
        continue
words = words or []

# mask slurs (YouTube guidelines); glue split tokens like "16 .8" -> "16.8"
def clean(w): return re.sub(r"(?i)\bn(i|1)gg(a|as|er|ers|uh|az)\b", lambda m: "N" + "*" * (len(m.group(0)) - 1), w)
merged = []
for a, b, w in words:
    w = clean(w)
    if merged and re.match(r"^[.,'%]\w", w):
        pa, _, pw = merged[-1]; merged[-1] = (pa, b, pw + w)
    else:
        merged.append((a, b, w))
words = merged
open(os.path.join(out_dir, name + ".txt"), "w").write(" ".join(w for _, _, w in words) + "\n")

# 3) captions: <=3 words, <=1.4 s, break on pauses / sentence ends; current word highlighted yellow
groups, cur = [], []
for w in words:
    if cur and (len(cur) >= 3 or w[1] - cur[0][0] > 1.4 or w[0] - cur[-1][1] > 0.5 or re.search(r"[.?!]$", cur[-1][2])):
        groups.append(cur); cur = []
    cur.append(w)
if cur: groups.append(cur)

# 4) layout: webcam on top + centre of gameplay below, or (no webcam found) full frame over a blurred fill
cam = camdetect.detect(raw)
if cam:
    x, y, w, h = cam
    cam_h = int(min(810, max(540, round(1080 * h / w)))) // 2 * 2      # webcam strip height in the Short
    target = 1080 / cam_h                                               # crop the webcam box to that aspect
    if w / h > target: nw, nh = int(h * target), h
    else: nw, nh = w, int(w / target)
    x, y, w, h = x + (w - nw) // 2, y + (h - nh) // 2, nw // 2 * 2, nh // 2 * 2
    game_h = 1920 - cam_h
    cw = int(round(1080 * 1080 / game_h)) // 2 * 2                     # centre slice of the gameplay
    fc = (f"[0:v]split[a][b];[a]crop={w}:{h}:{x}:{y},scale=1080:{cam_h}:flags=lanczos,setsar=1[cam];"
          f"[b]crop={cw}:1080:{(1920 - cw) // 2}:0,scale=1080:{game_h}:flags=lanczos,setsar=1[game];"
          "[cam][game]vstack[base]")
    cap_y = cam_h + 92
else:
    fc = ("[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=30:3,eq=brightness=-0.15[bg];"
          "[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2[base]")
    cap_y = 1450

def ts(t):
    t = max(0, t); return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"
ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
       "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
       "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
       "MarginR, MarginV, Encoding",
       "Style: Cap,DejaVu Sans,78,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,5,60,60,0,1",
       "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
for i, g in enumerate(groups):
    end = g[-1][1] + 0.25
    if i + 1 < len(groups): end = min(end, groups[i + 1][0][0])
    for j in range(len(g)):
        ws, we = (g[j][0] if j else g[0][0]), (g[j + 1][0] if j + 1 < len(g) else end)
        txt = " ".join(("{\\c&H00E5FF&}" + x[2].upper() + "{\\c&HFFFFFF&}") if k == j else x[2].upper()
                       for k, x in enumerate(g))
        ass.append(f"Dialogue: 0,{ts(ws)},{ts(we)},Cap,,0,0,0,,{{\\pos(540,{cap_y})}}{txt}")
subs = os.path.join(work, "subs.ass"); open(subs, "w").write("\n".join(ass) + "\n")
fc += f";[base]ass={subs}[v]"

# 5) two-pass HEVC encode sized to fit MAX_BYTES
abr = 128_000
vbr = int(max(600_000, (MAX_BYTES * 8 * 0.97) / dur - abr))
out = os.path.join(out_dir, name + ".mp4"); plog = os.path.join(work, "x265")
common_args = ["-filter_complex", fc, "-map", "[v]", "-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx265",
               "-preset", "medium", "-b:v", str(vbr), "-tag:v", "hvc1"]
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, *common_args,
                "-x265-params", f"pass=1:stats={plog}:log-level=error", "-an", "-f", "null", "-"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, *common_args,
                "-x265-params", f"pass=2:stats={plog}:log-level=error", "-map", "0:a", "-c:a", "aac",
                "-b:a", str(abr), "-af", "loudnorm=I=-14:TP=-1.5", "-movflags", "+faststart", out], check=True)
size = os.path.getsize(out)
if size > 9.8e6: sys.exit(f"{out} is {size} bytes: over the Drive limit")

# 6) .srt + preview frame
def st(t): return f"{int(t//3600):02d}:{int(t%3600//60):02d}:{int(t%60):02d},{int(round(t*1000))%1000:03d}"
with open(os.path.join(out_dir, name + ".en.srt"), "w") as f:
    for i, g in enumerate(groups, 1):
        nxt = groups[i][0][0] if i < len(groups) else 1e9
        f.write(f"{i}\n{st(g[0][0])} --> {st(min(g[-1][1] + 0.2, nxt))}\n{' '.join(x[2] for x in g)}\n\n")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * 0.45:.2f}", "-i", out, "-frames:v", "1",
                "-vf", "scale=360:-2", os.path.join(out_dir, name + ".jpg")], check=True)
print(json.dumps({"file": out, "bytes": size, "seconds": round(dur, 1), "webcam": cam, "words": len(words)}))
