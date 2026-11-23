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


## Guided desktop runner — no manual FFmpeg command

The new ZIP also includes `launch_portable_video.py` and two optional
desktop launchers:

- Windows: double-click `launch-video-windows.cmd`
- macOS / Linux: `sh launch-video-macos-linux.sh`

These launch a small standard-library Tkinter window with **Render verified
MP4** and **Cancel and clean** controls. Tkinter is supplied with many Python
installations but may be absent on headless, minimal or some macOS systems.
The window reports **real stages** (preflight, rendering, verification) rather
than invented percentage progress or fixed render-time promises. Files remain
entirely on the user's machine.

If Tkinter or a graphical desktop is unavailable, these work in a terminal:

```sh
python3 launch_portable_video.py --check
python3 launch_portable_video.py --run
```

On Windows, `py -3 launch_portable_video.py --check` and
`py -3 launch_portable_video.py --run` are equivalent.

### What the new safety and convenience layer actually does

1. **Read-only preflight** checks Python 3.11+, installed FFmpeg/FFprobe with
   libx264, manifest format, original source SHA-256, exact 16 FPS CFR and
   decoded frame counts, rights references, approved shot positions, audio,
   source inventory, selected profile/quality, and availability of an unused
   output directory. `--check` produces JSON and does not render.
2. **Single-click local execution** passes only fixed, validated arguments
   to the repository's original Python/FFmpeg renderer. It does not use the
   shell to interpolate filenames, download programs, or contact cloud APIs.
3. **Isolated staging and cancellation** creates an independent temporary
   output directory. The launcher stops the process group (including FFmpeg)
   on cancellation or timeout and deletes incomplete temporary output.
   Staged videos are never published as if rendering succeeded.
4. **Actual completion verification** rechecks the rendered MP4 SHA-256 and
   frame count against the renderer manifest, confirms the original storyboard
   SHA-256, profile and quality, and requires the real preview and subtitle
   files before promoting the complete output directory.
5. **No destructive retries**: if `eternyx-video-output` already exists,
   the launcher refuses to replace it. Move or rename a previous output
   before starting another render; original input media is never modified.
6. **Offline CI acceptance** generates real licensed-test fixtures, extracts
   the same bundle produced in the web editor, runs `--check` then
   `--run`, and verifies a real 16 FPS H264 MP4 with audio, SRT and preview.
   Extra tests cover cancellation cleanup, forged receipts, missing FFmpeg,
   symlinked source paths and exact output no-overwrite behavior.

A desktop launcher does **not** make video generation run in the hosted
browser. The user must still extract the ZIP and have Python/FFmpeg installed.
This feature improves video-editing usability, not model visual fidelity,
natural-language text-to-video generation, or provider availability.
