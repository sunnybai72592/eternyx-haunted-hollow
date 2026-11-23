# ETERNYX AI Video — Interactive frame-accurate editing timeline

This feature upgrades **Local CPU Video Editor** from purely form-based
shot fields into a visible, proportional timeline. It uses the **same
existing underlying editing state** and remains compatible with the
v2 local FFmpeg storyboard, private portable project ZIP, and the
saved/reopenable JSON editing drafts introduced in PR #523.

## What works in the browser

- Each cut is a selectable, width-proportional bar with its true
  source filename, position and duration at **16 frames/second**.
- A global timeline scrubber maps each selected timeline frame to its exact
  referenced **original source frame** and approximate browser seek
  time. Dedicated Previous/Next controls move by one frame.
- The original video plays in a local in-browser viewer. It seeks to the
  chosen source position and pauses at the original cut's out-point.
  The editable human caption appears separately, with a toggle.
- **Split at playhead** makes two clips referencing the same original MP4,
  with correct contiguous source offsets, unchanged total frame duration,
  matching original captions/rights and preserved endpoint fades.
- **Duplicate cut** inserts another copy of selected original footage,
  subject to the existing 8-shot and 30-second project ceilings.
- **Move left/right** reorders cuts; **Remove cut** deletes one without
  allowing an empty project.
- **Join next** merges contiguous cuts only when source, caption and rights
  match and there are no internal fade effects to discard.
- **Trim/extend source in/out by one frame** updates exact original frame
  positions and recalculates legal fade lengths, refusing negative frames,
  out-of-bounds source offsets and project durations.
- Keyboard: while focused on a cut button use Left/Right arrows to select
  adjacent cuts, Home/End to jump. The active cut has visible focus and
  `aria-pressed` feedback. Touch-friendly buttons and scrollable bar
  work on mobile.
- Source preview never uploads video, runs FFmpeg, guesses scene content or
  claims the browser player is a rendered output. The browser cannot
  guarantee source video is constant-frame-rate 16 FPS; the offline CPU
  renderer still validates that before a finished MP4 is produced.

## Save, resume and export

All timeline edits write the same `shots` state used by existing
manual per-shot fields. No duplicate catalog or simulated timeline data
is introduced. A saved `eternyx-video-edit-draft.json` preserves split,
duplicated, reordered and trimmed shots alongside human caption and rights
notes. Reopening a saved draft still requires verifying original media
bytes using SHA-256. The **Download complete CPU video project (.zip)**
command reads the updated sequence automatically; the existing
Windows/macOS/Linux offline renderer exports actual H.264.

## Testing and boundaries

`tests/local-video-timeline.test.mjs` checks ten pure and integration
scenarios: exact global-to-source frame mapping, cut boundary handling,
split fade/provenance integrity, duplication limits, in/out nudges,
lossless joins, reorder/delete, draft/save schema compatibility, malformed
timeline rejection, and browser UI accessibility/static wiring. Dedicated
workflow `.github/workflows/local-video-precision-timeline.yml`
blocks regressions alongside the main application build and browser checks.

This improves the **real editing workflow** and is not an AI text-to-video
model or photorealistic generation milestone. There are no new paid
AI APIs, GPU requirements, uploads, cloud storage or subscriptions.
