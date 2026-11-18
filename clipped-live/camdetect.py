# Find the streamer's webcam box (left-docked overlay) in a 1920x1080 stream recording.
# Scores candidate boxes by edge strength along their border, averaged over several frames.
import subprocess, numpy as np

def frames(path, n=6, dur=None):
    if dur is None:
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                   capture_output=True, text=True).stdout or 10)
    out = []
    for k in range(n):
        t = dur * (k + 0.5) / n
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1",
                              "-vf", "scale=1920:1080", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                             capture_output=True).stdout
        if len(raw) == 1920 * 1080:
            out.append(np.frombuffer(raw, np.uint8).reshape(1080, 1920).astype(np.float32))
    return out

def detect(path, widths=(392, 480, 560, 640), aspect=220 / 392):
    """Return (x, y, w, h) of the webcam box, or None if no confident match."""
    fs = frames(path)
    if not fs: return None
    gx = np.mean([np.abs(np.diff(f, axis=1)) for f in fs], axis=0)  # vertical edges
    gy = np.mean([np.abs(np.diff(f, axis=0)) for f in fs], axis=0)  # horizontal edges
    best = (0, None)
    for w in widths:
        h = int(round(w * aspect))
        right = gx[:, w - 2:w + 1].max(axis=1)                       # right border, per row
        cr = np.concatenate([[0], np.cumsum(right)])
        for y in range(0, 1080 - h, 2):
            r = (cr[y + h] - cr[y]) / h
            top = gy[y - 1:y + 1, :w].max(axis=0).mean() if y > 0 else 0
            bot = gy[y + h - 1:y + h + 1, :w].max(axis=0).mean() if y + h < 1079 else 0
            s = min(r, max(top, bot)) + 0.25 * (r + top + bot)
            if s > best[0]: best = (s, (0, y, w, h))
    score, box = best
    return box if score > 25 else None

if __name__ == "__main__":
    import sys; print(detect(sys.argv[1]))
