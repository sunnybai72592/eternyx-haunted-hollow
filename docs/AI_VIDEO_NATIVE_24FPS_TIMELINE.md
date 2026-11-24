# ETERNYX AI Video — genuine 24 FPS in the main visual CPU editor

The previous 24 FPS phone-movie path can reopen its own edits, but the main
visual timeline only understood 16 FPS frame positions. The main editor now
adds an explicit **Cinematic · native 24 FPS / up to 720p** mode.

## How to use

1. In **AI Video Studio → Local CPU video editor**, select **Cinematic** before
   importing original or normalized 24 FPS constant-frame-rate H.264 MP4 clips.
   The editor works entirely in the browser; it does not upload media.
2. Add 1–8 source cuts, scrub source frames, trim, split, reorder, duplicate,
   join and edit fades; human captions and rights references are required
   before export. All operations use the actual 24 FPS timebase. Save a
   metadata-only editable project draft and reopen it after reattaching all
   source files with exact SHA-256 checks.
3. Download the existing runnable portable ZIP, extract it and launch the
   included Windows or macOS/Linux script; Python and local FFmpeg verify
   original source hashes, actual 24 FPS CFR decoded frames, 720p-class
   dimensions, subtitles, render receipts and the finished MP4.

**Cinematic output**: landscape 1280×720, portrait 720×1280, square 720×720.
Up to 30 seconds / 720 rendered frames and a 60-second/1440-frame maximum
decoded source. Real sources must actually decode at 24 FPS CFR; 16/30 FPS
clips are **not** relabeled or magically transformed. To normalize phone
recordings, use the existing direct phone intake converter first.

**Backward compatibility**: Standard/High remain 16 FPS with the original
480-frame timeline, saved drafts, subtitles and portable ZIP conventions.
Export quality and saved draft quality determine the timebase. Existing
metadata-only project drafts continue to use the same versioned format.
Switching between 16 and 24 FPS converts frame indices only if their
positions, durations and fade lengths can be represented exactly; otherwise
the editor refuses instead of silently rounding. Switching modes resets
undo/redo history to prevent cross-timebase restoration of stale frames.

The local output receipt and browser integrity reviewer require real
decoded frame counts, FPS, dimensions, duration, SHA-256 and frame-accurate
subtitle timing. This is editing user-owned footage, not a neural
text-to-video generator. No paid GPU, external AI API, network rendering
or automatic account storage is required. Browsers can only approximate
source preview seeking; offline FFmpeg's real decoded-frame check remains
authoritative.
