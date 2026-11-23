# ETERNYX AI Video — standalone phone footage intake + starter edit project

The AI Video Studio previously offered only a **manual command** to normalize
ordinary phone recordings. The user had to clone the ETERNYX repository,
organize `phone-clips`, run Python/FFmpeg, select the converted MP4s, and
rebuild the first draft timeline. The new **Download runnable phone intake ZIP**
workflow removes the repository clone and repetitive draft setup.

## Real executable workflow

1. Open **AI Video Studio → Local CPU video editor → Import ordinary phone
   footage (24/30/60 FPS)**.
2. Choose 1–8 original MP4/MOV/M4V files (max 64 MiB each), then choose
   the original start offset (0–299 seconds) and 1–60 second trim limit.
3. Select **Download runnable phone intake ZIP**. The browser reads the
   actual selected local clips, SHA-256 hashes each byte, and stores the
   original media unchanged in `eternyx-private-phone-intake.zip`.
   The ZIP also includes the exact reviewed CPU-only converter, 3 original
   Python renderer dependencies, SHA-verified offline launcher, a manifest,
   Windows/macOS/Linux launcher scripts, and instructions.
   **No upload or remote conversion occurs.**
4. Extract the entire private ZIP into a *new* local folder on a computer
   with Python 3.11+ and FFmpeg/FFprobe/libx264 installed. On Windows
   double-click `prepare-phone-windows.cmd`; on macOS/Linux run
   `sh prepare-phone-macos-linux.sh`. To inspect first, run
   `python3 launch_phone_intake.py --check`, followed by `--run`.
5. The launcher recomputes each original recording's exact SHA-256 and byte
   count, validates safe paths and genuine video metadata via FFprobe, and
   reuses `prepare_video_sources.py` for real offline 16 FPS H.264
   transcoding. It preserves aspect ratios, strips original audio and
   container metadata, reports actual decoded frame counts and hashes,
   and never overwrites an existing output directory.
6. On success, `local-video-media/` holds `clip-01.mp4` etc.,
   `preparation-report.json`, and **`eternyx-video-edit-draft.json`**.
   The prepared-clips output is promoted only after all conversions and
   generated draft checks succeed; a failed batch leaves no partial output.
7. Open that saved draft in the same ETERNYX Video Studio and reattach the
   freshly normalized `clip-XX.mp4` originals. The existing draft importer
   recomputes all their bytes and refuses mismatches. Your cuts are now
   editable with the normal visual timeline, undo/redo, sequence preview,
   and user-provided source-rights/caption fields. Complete those rights
   fields before exporting a real final FFmpeg video ZIP.

## What is and is not automated

**Genuine improvements:** source hashing, self-contained downloadable
converter with exact scripts, basic local preflight, actual 24/30/60 FPS
to 16 FPS conversion, source metadata stripping, source integrity checks,
no-overwrite safety, atomic project output, prepared-report hashes,
and a valid draft with a one-second editable first cut for each source.

**Deliberate boundaries:** no AI-generated captions, fake rights claims,
photorealistic text-to-video, cloud processing or browser execution of
Python. The operator still extracts the ZIP, has local FFmpeg/Python,
reopens the draft, selects prepared MP4s and enters actual license/shot
descriptions. Each automatically generated draft leaves caption and
rights fields empty to avoid inventing legal permissions or content.

**Privacy:** the ZIP contains **full original private recordings**.
Keep it offline and do not share the archive unless recipients have
permission. SHA-256 matches are local self-attestation, not licensed
ownership, authenticity certification or a digital signature. Browser
memory limits apply when hashing up to 512 MiB of source footage.

## Testing

`tests/portable-phone-intake.test.mjs` and the dedicated workflow
`.github/workflows/portable-phone-intake.yml` exercise actual ZIP32
CRC extraction, script presence, file-byte equality, unsafe source
refusals, genuine 30 FPS MOV + 24 FPS portrait MP4 conversion through
the extracted shell launcher, 16 FPS actual H264 output/frame counts,
source/output SHA-256, valid versioned draft, exact media reattachment,
input corruption refusal, absence of partial outputs and replay
no-overwrite policy.

Existing browser editor, desktop/mobile acceptance, saved drafts,
portable CPU renderer ZIP and GitGuardian remain part of the standard
CI quality gates.
