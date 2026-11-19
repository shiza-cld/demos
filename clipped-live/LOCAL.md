# Running Clipped Live on the owner's Windows PC (find → cut → save → upload)

This is the checklist for a Claude session running **locally on the owner's computer** with the browser
logged in to the YouTube channel **Clipped Live**. The owner reads Russian: talk to them in Russian;
titles, descriptions and tags are in English.

## 0. One-time setup (skip what is already installed)
Work folder: the folder this session was opened in (`YTshorts`). Layout inside it:
```
YTshorts/
  demos/                 ← this repo (code lives in demos/clipped-live)
  clips/YYYY-MM-DD/      ← finished Shorts (.mp4, .en.srt, .jpg preview, upload_list.md)
  work/                  ← temporary downloads (delete after each run)
  state.json             ← what has been clipped and uploaded
```
1. Tools (PowerShell; ask before installing):
   `winget install -e --id Python.Python.3.12`, `winget install -e --id Gyan.FFmpeg`, `winget install -e --id Git.Git`
   Then open a new terminal so PATH updates. Check: `python --version`, `ffmpeg -version`, `git --version`, `curl --version`.
2. Code: `git clone -b ccr-85f391c5-yln7yo https://github.com/shiza-cld/demos.git demos`
   (later runs: `git -C demos pull`).
3. Python packages: `python -m pip install -U yt-dlp faster-whisper numpy "opencv-python-headless<5"`
4. First run downloads the Whisper models (~0.5 GB) automatically.
5. If `state.json` does not exist, create it with
   `{"sources": {}, "clips": [], "uploaded": [], "rotation": 0}` and copy the clip list from
   `demos/clipped-live/done.json` into `"clips"` (those moments are already on the channel).

Run scripts as `python -I demos/clipped-live/<script>.py ...` from the `YTshorts` folder.

## 1. Daily run
Follow `DAILY.md` for **choosing streamers and moments** (tiers, paid campaigns, what makes a good Short,
what to skip), with these differences for the local PC:
- `find_vods.py 24 5` → only material recorded in the last 24 h; also skip anything in `state.json`.
- Build clips **in full quality**: add `--full` to every `make_clip.py` call, output to `clips/YYYY-MM-DD/`.
- Check every `.jpg` preview (webcam on top, gameplay below, captions readable). Rebuild or drop bad ones.
- Target **6–8 clips per day**: 4–5 from tier 1 (Lacy, JasonTheWeen, CORE), 2–3 from tier 2/3 by rotation.
- Write `clips/YYYY-MM-DD/upload_list.md` with title / description / tags / campaign / publish slot per clip
  (format and footer as in DAILY.md step 10).
- Update `state.json` (sources processed, clips made). Delete `work/` when done.

## 2. Upload to YouTube (browser)
Use the browser tools available in this session (e.g. Claude in Chrome). In **studio.youtube.com**:
1. Check the top-right avatar is the **Clipped Live** channel. If not, stop and ask the owner.
2. For each clip in `upload_list.md`: Create → Upload video → pick the .mp4. Fill **Title**, **Description**,
   **Tags** (Show more), audience **"No, it's not made for kids"**, category **Gaming**, video language **English**.
   Upload the `.en.srt` as English subtitles if the Subtitles step is offered.
3. Visibility:
   - Campaign clips (marked **PUBLISH NOW + SUBMIT**): only if the owner has joined that campaign in Whop Content
     Rewards (`state.json` → `"campaigns_joined": [...]`, ask the owner once). Then publish **Public now**,
     copy the link, and submit it in Content Rewards (whop.com → Content Rewards → the campaign → Submit)
     within 30 minutes. If the owner has not joined, schedule it like the others.
   - Everything else: **Schedule**, one per slot from the upload list (18:00–23:30 Moscow time, 2–3 h apart).
4. After each upload add the file name + video link to `state.json` → `"uploaded"`.
5. Stop and tell the owner if YouTube shows: a copyright claim, a daily upload limit, a request to verify the
   phone number, or any warning you do not understand. Never click "dispute" or accept claims on their behalf.

On the very first run, show the owner the filled form of the first video and wait for "ок" before publishing.
After that, upload without asking unless something unusual happens.

## 3. Report (in Russian)
How many clips were made and uploaded, one line per clip: streamer — title — scheduled time or "опубликовано +
отправлено в кампанию", plus anything that went wrong.
