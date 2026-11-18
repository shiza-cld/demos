"""Shared helpers: Twitch VOD playlists and segment downloads."""
import os, re, subprocess
from concurrent.futures import ThreadPoolExecutor

CHANNEL = "kaicenat"
GTA6 = re.compile(r"GTA\s*(6|VI)\b|GRAND THEFT AUTO\s*(6|VI)\b", re.I)

def stream_url(vod, fmt):
    r = subprocess.run(["yt-dlp", "-f", fmt, "-g", f"https://www.twitch.tv/videos/{vod}"],
                       capture_output=True, text=True)
    url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if not url: raise RuntimeError(f"no stream url for {vod} ({fmt}): {r.stderr[-500:]}")
    return url

def playlist(url):
    """[(start_sec, dur_sec, segment_url)] for an HLS media playlist (handles '-muted.ts' names)."""
    body = subprocess.run(["curl", "-sS", "--retry", "8", "--retry-all-errors", url],
                          capture_output=True, text=True, check=True).stdout
    base, t, dur, out = url.rsplit("/", 1)[0], 0.0, None, []
    for line in body.splitlines():
        if line.startswith("#EXTINF:"): dur = float(line[8:].split(",")[0])
        elif line and not line.startswith("#") and dur is not None:
            out.append((t, dur, line if line.startswith("http") else f"{base}/{line}")); t += dur; dur = None
    return out

def fetch(segs, folder, workers=16):
    """Download segments in parallel; returns local paths in order."""
    os.makedirs(folder, exist_ok=True)
    def one(i_seg):
        i, (_, _, u) = i_seg
        p = os.path.join(folder, f"{i:06d}.ts")
        if not (os.path.exists(p) and os.path.getsize(p) > 1000):
            subprocess.run(["curl", "-sS", "--retry", "8", "--retry-all-errors", "--retry-delay", "2", "-o", p, u],
                           check=True)
        return p
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(one, enumerate(segs)))

def concat(paths, out, extra=()):
    lst = out + ".txt"
    with open(lst, "w") as f: f.writelines(f"file '{p}'\n" for p in paths)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, *extra, out], check=True)
    return out
