# ETERNYX AI Video — Full-sequence local preview and export readiness

This milestone adds a **multi-cut original-video preview** and an
**actionable, per-cut offline export audit** to the existing Local CPU
Video Editor. It operates on the same editing state as the interactive
timeline, bounded undo/redo journal, private saved JSON drafts and
verified self-contained FFmpeg project ZIP. It introduces no second
editor, fake media player, cloud upload or model inference.

## What the in-browser preview really does

- Uses only original selected local `blob:` MP4 URLs already present in
  the editor, never remote URLs, constructed API calls or uploads.
- Plays the current project’s **actual cut order** across different
  original MP4 files, including repeated reuse of the same source and
  individual source in/out positions.
- At each cut boundary it advances to the next correct original source
  and frame offset, not a fabricated assembled source.
- Provides Play/Pause, Previous/Next cut, frame-accurate **timeline
  mapping**, and a scrubber spanning the entire editing sequence.
- Shows a simple overlay of the existing human-written caption. Source
  audio is muted: no assumption that the local browser can mix an
  independently licensed soundtrack.
- Reports missing source media, unsupported browser decoding or
  insufficient original duration instead of silently using a different
  file. Each original source is mounted only from a local `blob:` URL.
- The browser's actual playback timing/seek accuracy is approximate.
  **The preview is NOT a finished rendered MP4**: it does not produce
  the encoded final video, burn captions, guarantee frame-accurate
  decoding, apply exact FFmpeg fades, normalize resolution, or mix
  the licensed soundtrack. The offline Python/FFmpeg renderer remains
  the authority for constant-frame-rate 16FPS, actual source frames
  and H.264 output.

## Actionable export review

The **Full sequence source preview & export readiness** panel checks
project metadata against the exact same `buildLocalVideoBoard`
contract used by the downloaded FFmpeg project. It reports:

- Missing/case-colliding original sources or absent source SHA-256/size
  receipts, invalid source names, missing cut references;
- Invalid start frames/durations or source ceilings (960 frames),
  cut count (maximum 8), total duration (maximum 480 frames at 16FPS),
  and unsupported fade lengths;
- Missing human captions or source usage-rights references, including
  unfinished drafts which remain saveable but are not render-ready;
- Unsafe/out-of-range optional soundtrack, absent audio rights,
  invalid 0–100% volume or filename collision;
- Unsupported output shape/quality, and unused source MP4s omitted
  from the portable ZIP; and
- Explicitly unverified source decoding/CFR, soundtrack mix and
  actual licensing until the user runs the offline renderer.

Each cut has an **Edit shot N** action that scrolls to its actual editable
shot fields; errors are actionable and never silently auto-repaired.
The status **Storyboard ready for offline source verification** means
the browser-side v2 serializer accepts the metadata, **not** that a
valid H.264, legal license or professional output has been verified.

## QA and privacy

The dedicated workflow
`.github/workflows/local-video-sequence-review.yml` runs the real
`tests/local-video-sequence-review.test.mjs` suite covering valid
storyboard compatibility; human caption and rights issues; missing
and duplicate media; per-cut frame/fade limits; soundtrack issues;
three-cut playback across two different original source MP4s; frame
boundary mapping; automatic next-cut/end detection; unsafe media
refusal; and exact UI wiring.

The existing working Python FFmpeg project ZIP, output review and
local verified draft/undo workflows remain unchanged. There are no
paid GPUs, remote AI APIs, new dependencies, account storage,
subscriptions or media uploads. This is an honest editing and
preflight milestone, not a cinematic generative-video model.
