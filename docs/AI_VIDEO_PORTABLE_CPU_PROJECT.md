# ETERNYX — Portable one-click CPU video project

The AI Video Studio's **Local CPU video editor** can export a fully
self-contained `eternyx-offline-video-project.zip`. This is a genuine
end-to-end offline video-editing workflow, not generative text-to-video.

## Included in a single download

- The exact validated v2 storyboard and caption-preview SRT.
- **Only** original, unmodified MP4 files still referenced by your edited
  timeline (unused/private source clips are intentionally omitted).
- An optional licensed local WAV, MP3 or M4A soundtrack with its SHA-256
  and rights reference preserved.
- The actual production-grade standard-library CPU renderer:
  `render_video_timeline.py`, `assemble_video_storyboard.py`,
  `audit_video_render.py` copied from the same repository revision.
- A standalone `render-windows.cmd` launcher and
  `render-macos-linux.sh` launcher. No repo cloning or pip install.
- `bundle-manifest.json` with original source names, actual content
  SHA-256 hashes, byte counts, frame count, output profile and quality.
- `README.txt` with requirements and safe extraction instructions.

**No uploads:** All original media is read and SHA-256 verified in the
browser, then included in a classic UTF-8, uncompressed, CRC-32-verified ZIP.
Source bytes are not transcoded or modified. Browser resources are bounded
(8 clips at most 64 MiB each, soundtrack at most 16 MiB, 18 ZIP entries
maximum, ZIP offsets limited to classic ZIP32). The bundle itself may be
large because it contains the actual source media. Avoid sharing the archive
or storing it on an untrusted computer.

## Producing the finished MP4

1. Choose already-CFR 16 FPS local MP4 footage in the Studio. Enter human
   captions and real usage-rights references, shot start frames/durations
   and optionally an audio track.
2. Press **Download complete CPU video project (.zip)**. A local SHA-256
   mismatch, unvalidated timeline, unsafe file, or incomplete rights
   record causes the export to fail closed.
3. Extract the ZIP into a **new** folder on a machine with Python 3.11+ and
   FFmpeg/FFprobe (libx264) on the PATH.
4. On Windows, run `render-windows.cmd`. On Linux/macOS, run
   `sh render-macos-linux.sh`.
5. The actual renderer produces a new `eternyx-video-output/` directory
   containing `video.mp4`, `captions.srt`, `manifest.json` and
   `preview.html`. The renderer re-verifies exact source hashes, decoded
   frame counts, 16 FPS, media dimensions, and the encoded MP4; it refuses
   overwriting an existing output directory.

Optional audio is mixed only when a verified soundtrack is present. Original
source-video audio is removed. Captions remain an editable SRT sidecar
rather than being burned into MP4s.

## Verified integration versus claims

`.github/workflows/portable-cpu-video-project.yml` runs
`node --test tests/portable-video-bundle.test.mjs`. It generates real
16 FPS source MP4 and WAV audio, builds the same ZIP module used by the browser,
extracts it through Python's `zipfile` (verifying ZIP CRC), executes the
included shell launcher, then verifies the actual output H264 frame count,
dimensions, audio track, SRT, preview and SHA-256. It confirms source privacy,
ZIP structure, rights and hash refusal, and no-overwrite behavior.

This workflow is a substantial improvement over downloading only JSON and
copying commands. **It is not one-click video generation in the hosted browser:**
users must extract and run the local offline launcher, and there is no
photorealistic AI text-to-video model involved. It requires no paid GPU, no
external AI API and no backend deployment.
