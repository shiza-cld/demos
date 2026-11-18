"""Find the streamer's webcam in a 1920x1080 stream recording.

1. Detect faces in frames sampled across the clip; the webcam face is the one that stays in (almost) the same
   place in most frames (game characters move around, the streamer's face does not).
2. Look for a rectangular overlay border around that face (edge strength along the four sides).
3. If there is no clear border (e.g. a cut-out / green-screen webcam), crop a 16:9 box around the face.
Returns (x, y, w, h) in 1920x1080 pixels, or None when no stable face is found.
"""
import subprocess, numpy as np, cv2

W, H = 1920, 1080
_face = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_prof = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")

def frames(path, n=10):
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                               capture_output=True, text=True).stdout or 10)
    out = []
    for k in range(n):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{dur * (k + 0.5) / n:.2f}", "-i", path, "-frames:v", "1",
                              "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
        if len(raw) == W * H: out.append(np.frombuffer(raw, np.uint8).reshape(H, W))
    return out

def stable_face(fs):
    """Median face box among detections that agree in position across frames, else None."""
    dets = []
    for k, f in enumerate(fs):
        small = cv2.resize(f, (W // 2, H // 2))
        for casc in (_face, _prof):
            for (x, y, w, h) in casc.detectMultiScale(small, 1.1, 5, minSize=(24, 24)):
                dets.append((k, 2 * x, 2 * y, 2 * w, 2 * h))
    best = []
    for _, x, y, w, h in dets:
        cx, cy = x + w / 2, y + h / 2
        grp = [d for d in dets if abs(d[1] + d[3] / 2 - cx) < 0.6 * w and abs(d[2] + d[4] / 2 - cy) < 0.6 * h]
        if len({d[0] for d in grp}) > len({d[0] for d in best}): best = grp
    if len({d[0] for d in best}) < max(3, int(0.4 * len(fs))): return None
    return tuple(int(np.median([d[i] for d in best])) for i in range(1, 5))

def border_box(fs, face):
    """Best-scoring rectangle (by edge strength on its sides) that contains the face; (score, box)."""
    fx, fy, fw, fh = face
    s = 2                                            # work at half resolution
    g = [cv2.resize(f, (W // s, H // s)).astype(np.float32) for f in fs]
    gx = np.mean([np.abs(np.diff(f, axis=1, prepend=f[:, :1])) for f in g], axis=0)
    gy = np.mean([np.abs(np.diff(f, axis=0, prepend=f[:1, :])) for f in g], axis=0)
    gx = np.maximum(gx, np.roll(gx, 1, axis=1)); gy = np.maximum(gy, np.roll(gy, 1, axis=0))
    Px = np.cumsum(np.pad(gx, ((1, 0), (0, 0))), axis=0)   # vertical sums of vertical edges
    Py = np.cumsum(np.pad(gy, ((0, 0), (1, 0))), axis=1)   # horizontal sums of horizontal edges
    hw, hh = W // s, H // s
    best = (0.0, None)
    for aspect in (9 / 16, 3 / 4):
        for w in range(max(int(2.2 * fw / s), 80), min(int(9 * fw / s), hw), 4):
            h = int(round(w * aspect))
            if h >= hh: continue
            xs = np.arange(max(0, (fx + fw) // s - w), min(hw - w, fx // s) + 1, 2)
            ys = np.arange(max(0, (fy + fh) // s - h), min(hh - h, fy // s) + 1, 2)
            if not len(xs) or not len(ys): continue
            X, Y = np.meshgrid(xs, ys)
            top = (Py[Y, X + w] - Py[Y, X]) / w
            bot = (Py[np.minimum(Y + h, hh - 1), X + w] - Py[np.minimum(Y + h, hh - 1), X]) / w
            lef = (Px[Y + h, X] - Px[Y, X]) / h
            rig = (Px[Y + h, np.minimum(X + w, hw - 1)] - Px[Y, np.minimum(X + w, hw - 1)]) / h
            sides = np.stack([top, bot, lef, rig])
            # a side lying on the frame edge has no visible border: count it as average
            at_edge = np.stack([Y == 0, Y + h >= hh - 1, X == 0, X + w >= hw - 1])
            mean_inner = np.where(at_edge, 0, sides).sum(0) / np.maximum(1, (~at_edge).sum(0))
            sides = np.where(at_edge, mean_inner, sides)
            sc = 0.6 * sides.min(0) + 0.4 * sides.mean(0)
            i = np.unravel_index(np.argmax(sc), sc.shape)
            if sc[i] > best[0]: best = (float(sc[i]), (int(X[i]) * s, int(Y[i]) * s, w * s, h * s))
    return best

def detect(path):
    fs = frames(path)
    if not fs: return None
    face = stable_face(fs)
    if face is None: return None
    score, box = border_box(fs, face)
    if box and score > 12: return box
    fx, fy, fw, fh = face                            # no clear border: 16:9 crop around the face
    w = min(W, int(fw * 4.2)); h = int(w * 9 / 16)
    x = int(np.clip(fx + fw / 2 - w / 2, 0, W - w)); y = int(np.clip(fy + fh * 0.5 - h * 0.45, 0, H - h))
    return (x, y, w, h)

if __name__ == "__main__":
    import sys, json
    fs = frames(sys.argv[1]); face = stable_face(fs)
    print(json.dumps({"face": face, "border": border_box(fs, face) if face else None, "box": detect(sys.argv[1])}))
