# Daily run: 6–8 new GTA 6 Shorts from several streamers

Channel: **Clipped Live** (fan clip channel, English captions). **GTA 6 gameplay only.**
The owner reads Russian: write the final summary in Russian; titles/descriptions/tags in English.

## Who to clip (`streamers.json`)
- **Tier 1 — paid clipping campaigns (Reach / Whop Content Rewards):** Lacy, JasonTheWeen, and CORE clips
  (2+ of Lacy / JasonTheWeen / Stable Ronaldo / Marlon / Silky / Adapt on screen). Make **4–5** of the day's clips here.
- **Tier 2:** Kai Cenat, xQc, Jynxzi, Agent00, N3on. **Tier 3:** Lirik, Asmongold. Make **2–3** clips here,
  rotating streamers day to day (`state.rotation`) so each one shows up regularly.
- Not reachable from the cloud: IShowSpeed (YouTube blocks cloud downloads). Skip.

## Google Drive (optional)
If Google Drive tools (`mcp__Google_Drive__*`) are available in this session:
- Folder `Clipped Live`: `1kDe_huLRN615i9nuLtzt4FBuGDQpbb_1`; sub-folder `ready/`: `1D2ecbRYKxVL-VD8GV871WWDkRdG6xHyj`
- `state.json` in `Clipped Live` (id `1wA48-gRjxK0HVHNj6diSZ7QXBADXM8BP`): `{"sources": {...}, "clips": [{"name","src","start","end"}], "rotation": n}`
  — read it to avoid repeats, update it at the end.
- Videos never go to Drive (connector uploads are capped at ~3 MB); only `state.json` and the upload-list Doc.
If Drive is not available: skip it. Repeats are still avoided because each run only takes material recorded in
the last 24 h (`find_vods.py`) and never ranges listed in `done.json`; put the upload list in a Markdown file
and send it with SendUserFile instead of the Doc.

## Steps
1. `bash clipped-live/setup.sh` (from the repo root).
2. If Drive is available, read `state.json`. Always read `clipped-live/done.json`.
3. `python3 -I clipped-live/find_vods.py 24 5 > vods.json` — GTA-6-titled VODs of every streamer, with
   `new_from`/`new_to` = the part recorded in the last 24 h (null = nothing new). Also skip anything already
   covered by `state.json` (`processed_until`) when you have it.
4. Pick sources: all tier-1 VODs with new material, plus 2 tier-2/3 streamers by rotation (`state.rotation`, or
   day-of-year mod 7 without Drive). For each, take the **newest** stretch of the new part:
   `from = max(new_from, new_to − H·3600)` with H = 2.5 (tier 1) or 2 (tier 2/3). Total audio per run ≤ ~10 h.
5. Before transcribing, confirm it is really GTA 6 gameplay (titles like "GTA 6 SOON" are not):
   `python3 -I clipped-live/peek.py <src> peek_<name>.jpg 6 <from> <to>` and look at the image.
6. `python3 -I clipped-live/prepare_vod.py <src> <from> <H> work/<name>` → read `work/<name>/candidates.md`
   (and `transcript.tsv` around promising spots).
7. Choose the moments. Good: funny reactions, rage, NPC beef, story shocks, wild chases, hype milestones,
   streamers interacting. 20–55 s, start 2–4 s before the setup, end right after the punchline.
   For campaign clips the streamer must be the main focus (webcam visible, he is the one reacting) and the
   clip must not make him look bad. Skip: sponsor reads, gambling, ad breaks, menus/loading screens, dead air,
   long runs of slurs, sexual content, anything about private people. Never repeat a moment in `state.clips` or `done.json`.
8. Build each: `python3 -I clipped-live/make_clip.py <src> <start> <end> <YYYY-MM-DD>_<nn>_<streamer>_<slug> out`
   Look at every `out/*.jpg`: webcam on top and gameplay below (or full frame on a blur). If the webcam crop
   is wrong or the clip is mostly a menu, rebuild with other bounds or drop it.
9. Send all finished `out/*.mp4` and `out/*.en.srt` to the user with SendUserFile (status `proactive`).
10. Create a Google Doc in `ready/` (or, without Drive, a Markdown file sent with SendUserFile) titled `<YYYY-MM-DD> — Clipped Live upload list`. Per clip:
    file name · streamer · source + stream time · **Title** (≤ 70 chars, starts with the streamer's name,
    1 emoji) · **Description** (1–2 sentences + footer) · **Tags** (~10) · **Campaign** (which pool, if any) ·
    publish slot. Footer:
    ```
    🎮 <Streamer> plays GTA 6
    📺 Full stream: <twitch.tv/... or kick.com/...>
    All credit to @<Streamer>
    #<streamer> #gta6 #shorts #gta #funny #twitch #streamer
    ```
    Campaign clips additionally need the streamer's name in the title and the campaign hashtags
    (`#Lacy`, `#JasonTheWeen`, `#CORE` + one per CORE member shown). They must be **published right away, not
    scheduled**, and the link submitted in Content Rewards within 30 minutes. Mark them "PUBLISH NOW + SUBMIT".
    Non-campaign clips: one scheduled slot each, spread 2–3 h apart between 18:00 and 23:30 Moscow time.
11. If Drive is available, update `state.json` (processed_until per source, new clips, rotation + 1).
12. Final message in Russian: number of clips, a line per clip (streamer — title — campaign or not),
    and the Doc link (if any).
