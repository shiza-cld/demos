"""Shared helpers: Twitch VOD playlists and segment downloads."""
import os, re, subprocess
from concurrent.futures import ThreadPoolExecutor

GTA6 = re.compile(r"GTA\s*(6|VII?)\b|GRAND THEFT AUTO\s*(6|VI)\b", re.I)
AUDIO_FMT = "Audio_Only/bestaudio/160p/160p30/worst"
VIDEO_FMT = "1080p60/1080p/1080p30/best[height<=1080]/best"

# A source id names one VOD: "twitch:<vod_id>" or "kick:<channel>:<vod_uuid>".
def vod_page(src):
    parts = src.split(":")
    if parts[0] == "twitch": return f"https://www.twitch.tv/videos/{parts[1]}"
    if parts[0] == "kick": return f"https://kick.com/{parts[1]}/videos/{parts[2]}"
    raise ValueError(f"unknown source {src}")

def videos_page(platform, channel):
    if platform == "twitch": return f"https://www.twitch.tv/{channel}/videos?filter=archives&sort=time"
    if platform == "kick": return f"https://kick.com/{channel}/videos"
    raise ValueError(platform)

def stream_url(src, fmt):
    r = subprocess.run(["yt-dlp", "-f", fmt, "-g", vod_page(src)], capture_output=True, text=True)
    url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if not url: raise RuntimeError(f"no stream url for {src} ({fmt}): {r.stderr[-500:]}")
    return url

def vod_start(url):
    """UTC epoch of the first segment of an HLS playlist (from #EXT-X-PROGRAM-DATE-TIME), or None."""
    import datetime
    body = subprocess.run(["curl", "-sS", "--retry", "5", "--retry-all-errors", "-r", "0-4000", url],
                          capture_output=True, text=True).stdout
    m = re.search(r"#EXT-X-PROGRAM-DATE-TIME:(\S+)", body)
    if not m: return None
    return datetime.datetime.fromisoformat(m.group(1).replace("Z", "+00:00")).timestamp()

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
