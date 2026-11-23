# ETERNYX — Direct phone footage to finished offline H.264 movie

The AI Video Studio now offers a shorter, genuinely working alternative to
the two-stage phone-footage conversion and editor-draft workflow:

1. Select **one to eight original MP4, MOV or M4V phone recordings**.
2. Enter an accurate **human-written caption** and your real recording
   rights/permission reference for **each** selected clip. Nothing is
   auto-generated or guessed. Select **1–3 seconds per clip**, output
   aspect ratio (landscape/portrait/square), and standard or high quality.
   The footage must actually contain enough decoded frames after the
   selected common start offset.
3. Click **Download direct-to-finished-MP4 project ZIP** in the existing
   `Import ordinary phone footage` section.
4. Extract `eternyx-private-phone-movie.zip` onto your own computer. It
   includes your original unchanged **private** recordings, the reviewed
   FFmpeg conversion and editor code, a strict human-authored v1 movie
   plan, and cross-platform scripts. No repository checkout or pip package.
5. Install Python 3.11+, FFmpeg, FFprobe and libx264 locally if absent.
   Run `finish-phone-movie-windows.cmd` on Windows or
   `sh finish-phone-movie-macos-linux.sh` on macOS/Linux. Optionally
   run `python3 finish_phone_movie.py --check` beforehand.
6. The runner checks original SHA-256, byte sizes, media duration and
   codecs; verifies every caption and permission note; normalizes all
   phone recordings to actual constant **16 FPS H.264**; validates the
   resulting decoded frames and output SHA-256; creates an actual v2
   storyboard with the verified prepared clip hashes; and calls the
   existing trusted **`render_video_timeline.render`**.
7. If successful, `phone-movie-output/` contains a real
   `video.mp4`, `captions.srt`, `preview.html`, and
   `manifest.json` with actual encoded frame count, video SHA-256
   and the precise human captions and source rights. The optional
   editable `local-video-media/eternyx-video-edit-draft.json` is also
   produced so the project can be refined later.

## Correctness, security and limitations

- **No arbitrary text-to-video generation.** This produces a real movie
  by converting and assembling your existing recordings. The private
  original clips are included unmodified in the downloadable ZIP.
- **No fake captions, permissions, ownership claims, models or credits.**
  All visible text comes from the user. Usage rights must be legitimate.
- The browser builds and downloads the ZIP; it does not execute Python,
  decode arbitrary phone video via FFmpeg, or produce the completed MP4.
  Conversion and rendering run **locally** on the user's machine.
- The encoded MP4 is a real 16 FPS video. Captions are in a separate
  SRT sidecar, not burned into the MP4. The direct renderer does not
  add music; converted source audio is intentionally removed.
- Up to 8 cuts at 1–3 seconds each are supported, maximum 30 seconds
  total per the existing renderer contract. A source shorter than its
  requested cut after decoding causes a clear error, not a fabricated
  still frame or substitute.
- Full original SHA-256 and source rights are verified before CPU
  processing. Existing outputs cannot be overwritten. If normalization
  succeeds but final render fails, the prepared clips and editable draft
  remain for recovery, but **no partial final movie is published**.
- The original conversion-only ZIP/launchers remain fully compatible.
  The direct movie export is optional.
- No GPU, cloud AI API, remote media upload, subscription, backend
  migration or download of models is introduced.

## Acceptance

The extended `.github/workflows/portable-phone-intake.yml` runs both
the original verified conversion suite and
`tests/portable-phone-movie.test.mjs`. The new tests:

- Extract the actual ZIP and verify CRC, script files, original bytes,
  movie plan, captions, rights and package names.
- Reject blank rights, fabricated or unsafe captions, wrong source order,
  unauthorized output presets and unsupported shot lengths.
- Generate real **30 FPS MOV** and **24 FPS MP4** fixtures, execute the
  bundled offline converter/renderer, and inspect actual H.264 codec,
  output dimensions, 16 FPS, exact frame count, video hash, real SRT
  captions and human rights receipts.
- Prove no overwrite of an existing completed movie, no rendered output
  from tampered original bytes, and refusal to invent frames when a
  recording is too short.
- Verify that the Studio actually exposes the direct-render fields and
  makes no media-upload or external AI job requests.
