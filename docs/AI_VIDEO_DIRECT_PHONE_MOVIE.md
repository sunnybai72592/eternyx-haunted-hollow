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

## Next release: final quality and one-launch delivery formats

- The **standard** H.264 output stays at 256×144 landscape / 144×256 portrait /
  256×256 square (16 FPS). The **high** preset outputs 512×288 / 288×512 /
  512×512 with the CPU `medium` H.264 encoder, CRF 19 instead of CRF 23,
  and Lanczos aspect-preserving resampling. Resizing does not invent detail
  absent from the original phone footage. Both presets retain YUV420p and
  streamable faststart MP4.
- Every movie contains verified `video.mp4`, `captions.srt`,
  `preview.html` and `manifest.json`. In the *same* direct movie
  export selector, choose **MP4 only**, **MP4 + selectable-caption MP4**,
  **MP4 + VP9 WebM**, or **all three video files**.
- Optional `video-subtitled.mp4` includes a real `mov_text` subtitle stream
  (not burned-in lettering). Optional `video.webm` is encoded with local
  `libvpx-vp9` and uses no cloud services. The local ffmpeg build must
  support those encoders when selected, and the automatic `--check` preflight
  verifies the needed capabilities before conversion.
- Every requested video is independently checked for **actual decoded frames,
  dimensions, exact codec**, and output SHA-256; an embedded-caption MP4 must
  contain exactly one verified selectable subtitle track. The manifest
  records these real artifacts without falsely claiming digital signatures.
- The complete folder becomes visible only after **all** requested formats
  succeed. If an optional encode fails, no partial finished folder is
  published; genuine already-prepared clips stay available. Existing v1
  movie plans without a delivery field remain valid and produce MP4 + SRT.
- This is still an **offline editor of existing licensed footage**, *not*
  generated AI video. Audio is deliberately absent in the direct phone flow;
  editable SRT is always supplied. There are no extra manual steps beyond
  the existing ZIP extract and launcher.

Acceptance includes actual 24/30 FPS source transcodes, high preset inspection,
real WebM/MP4 subtitle codec and frame verification, option validation, and
backward-compatible MP4-only plans.

## One-launch framing and shareable offline preview

The existing private phone-to-MP4 UI now lets you keep the entire frame
(default letterboxing) or fill the chosen landscape, portrait or square frame.
Fill uses a centered FFmpeg crop after aspect-preserving Lanczos scaling:
genuine source edges may be lost, and it creates no missing scene information.

The same finished project now automatically includes:

- \`poster.png\`: real 0.5-second video frame, encoded as PNG with verified
  dimensions and a SHA-256 manifest receipt.
- \`captions.vtt\`: frame-timed WebVTT from the original human-authored captions,
  along with the existing editable SRT. It does not fabricate speech.
- \`watch.html\`: offline HTML5 video playback with poster and VTT subtitle
  reference, without hosted media, scripts or remote requests. Some browsers
  restrict \`file://\` subtitles; use the selectable-caption MP4 if needed.

All assets are generated within the unpublished delivery staging directory and
are included in \`manifest.json\` with byte size and SHA-256. Any failure prevents
the publication of a partial finished movie while keeping genuine prepared
source clips for recovery. Old direct movie plans default to "contain";
conversion-only packages remain unchanged.
