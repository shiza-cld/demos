# Daily run: new GTA 6 Shorts → Google Drive

Channel: **Clipped Live** (fan clip channel). Source: Kai Cenat's Twitch VODs, **GTA 6 streams only**.
Goal of each run: 4–6 new captioned vertical Shorts + their YouTube metadata, saved to Google Drive.

## Google Drive
- Folder `Clipped Live`: `1kDe_huLRN615i9nuLtzt4FBuGDQpbb_1`
  - `ready/` `1D2ecbRYKxVL-VD8GV871WWDkRdG6xHyj`: new clips waiting to be posted (mp4 + srt) and one upload-list Doc per run
  - `uploaded/` `1Y8A0cQBnZbU9GjDJY3-PGPK-nnjZBXtq`: clips already posted (moved there after upload)
  - `state.json` (in the `Clipped Live` folder): `{"vods": {"<vod_id>": {"processed_until": <sec>, "final": bool}}, "clips": ["<file name>", ...]}`
- Uploads from Claude are limited to 10 MB per file; `make_clip.py` already encodes under 9.5 MB. Upload with
  `create_file` using `base64Content: "sha256:<hash>:<absolute path>"`, `contentMimeType: video/mp4`,
  `disableConversionToGoogleType: true`, `parentId: <ready folder>`.

## Steps
1. `bash clipped-live/setup.sh`
2. Read `state.json` from Drive (search `title = 'state.json'` with parent `1kDe_huLRN615i9nuLtzt4FBuGDQpbb_1`).
3. `python3 -I clipped-live/find_vods.py 15` → keep `gta6: true` VODs. For each, unprocessed range = `processed_until` → `duration`.
   Prefer the newest material. Process at most ~8 h of audio per run. Ranges from VODs older than 3 days that
   are still unprocessed: skip them (set `processed_until` to the duration). If nothing is new, update nothing
   and finish with a one-line summary.
4. For each range: `python3 -I clipped-live/prepare_vod.py <vod> <from> <hours> <workdir>/<vod>`. It prints
   `processed_until=`. Read `candidates.md` (and `transcript.tsv` around anything promising).
5. Pick the 4–6 best moments (Shorts that work on their own): funny reactions, rage, NPC beef, story shocks,
   hype milestones. 20–60 s each, start 2–5 s before the setup, end right after the punchline.
   Skip: sponsor reads, ad breaks, pause menus/loading screens, dead air, long stretches of slurs,
   sexual content, anything about real private people. Do not repeat a moment already in `state.clips`.
6. For each: `python3 -I clipped-live/make_clip.py <vod> <start> <end> <YYYY-MM-DD>_<nn>_<slug> <outdir>`.
   Open the `.jpg` preview: webcam on top and gameplay below (or full frame on a blur if no webcam was found).
   If the layout is wrong or the clip is mostly a menu, drop it or pick another.
7. Upload each `.mp4` and `.en.srt` to `ready/`.
8. Create a Google Doc in `ready/` titled `<YYYY-MM-DD> — upload list` with, per clip: file name, stream time,
   **Title** (≤ 70 chars, starts with "Kai Cenat", one emoji), **Description** (1–2 sentences + footer below),
   **Tags** (comma-separated, ~10), and a suggested publish slot (one per day, 20:00–23:00 Moscow time).
   Description footer:
   ```
   🎮 Kai Cenat plays GTA 6
   📺 Full stream: twitch.tv/kaicenat
   All credit to @KaiCenat
   #kaicenat #gta6 #shorts #gta #funny #twitch #streamer
   ```
9. Update `state.json` (new `processed_until` per VOD, `final: true` once the VOD is no longer live, add clip names).
10. Finish with a short summary in Russian: how many clips, their titles, and the Drive folder link
    https://drive.google.com/drive/folders/1D2ecbRYKxVL-VD8GV871WWDkRdG6xHyj
