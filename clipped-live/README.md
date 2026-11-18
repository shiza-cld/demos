# Clipped Live — Kai Cenat GTA 6 Shorts pipeline

Turns Twitch VODs into vertical YouTube Shorts (1080×1920) with burned-in English captions.

| Script | What it does |
|---|---|
| `setup.sh` | installs yt-dlp, faster-whisper, fonts, Whisper models |
| `find_vods.py [n]` | recent channel VODs as JSON, flags GTA 6 titles and the live one |
| `prepare_vod.py <vod> <from_sec> <hours> <dir>` | downloads audio, transcribes, writes `candidates.md` (loudness + reaction-keyword peaks with transcript) |
| `make_clip.py <vod> <start> <end> <name> <dir>` | cuts the range, finds the webcam, builds the vertical layout, captions (word highlight, slurs masked), HEVC under 9.5 MB, `.srt`, preview `.jpg` |
| `camdetect.py <video>` | finds the webcam overlay box |

`DAILY.md` is the checklist the scheduled daily run follows.
