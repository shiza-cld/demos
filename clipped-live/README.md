# Clipped Live — GTA 6 Shorts pipeline

Turns Twitch / Kick VODs of the streamers in `streamers.json` into vertical YouTube Shorts (1080×1920) with burned-in English captions.

| Script | What it does |
|---|---|
| `setup.sh` | installs yt-dlp, faster-whisper, fonts, Whisper models |
| `streamers.json` | who to clip, tiers, paid clipping campaigns and their rules |
| `find_vods.py [since_hours] [n]` | GTA-6-titled VODs of every streamer as JSON, with the part recorded in the last N hours |
| `done.json` | moments already clipped by hand, never to repeat |
| `peek.py <src> <out.jpg> [n] [from] [to]` | contact sheet of frames, to confirm GTA 6 gameplay and see the layout |
| `prepare_vod.py <src> <from_sec> <hours> <dir>` | downloads audio, transcribes, writes `candidates.md` (loudness + reaction-keyword peaks with transcript) |
| `make_clip.py <src> <start> <end> <name> <dir>` | cuts the range, finds the webcam, builds the vertical layout, captions (word highlight, slurs masked), HEVC under 9.5 MB, `.srt`, preview `.jpg` |
| `camdetect.py <video>` | finds the webcam: stable face + overlay border, any corner, cut-out webcams too |

Source ids: `twitch:<vod_id>` or `kick:<channel>:<vod_uuid>`.

`DAILY.md` is the checklist the scheduled daily run follows.
