# ETERNYX AI Video — Undo/redo and original-cut playback

The Local CPU Video Editor now has a **shared 40-step undo/redo journal**
for all edits made in the existing form fields and interactive timeline.

## What works

- **Undo cut edit / Redo cut edit** buttons restore editable cuts,
  their source offsets, captions, rights notes, fade settings and
  precise 16 FPS lengths. Undo covers manual form changes, timeline
  splitting, duplication, one-frame trimming and cut reordering.
- **Keyboard shortcuts** when a timeline control is focused:
  Ctrl/Cmd+Z to undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo.
  Text inputs and other editable fields retain their native undo behavior.
- **Bounded, branching history**: at most 40 snapshots, no-ops do not
  consume history, and making a new edit after undo permanently clears
  the old redo branch.
- **Media isolation**: history records only the seven editable per-cut
  metadata fields. Original MP4/WAV bytes, File/Blob objects and object
  URLs are never stored in it, uploaded or persisted automatically.
- **Safe project resets**: selecting a new source set or successfully
  reopening a verified saved draft resets undo and redo, so older
  cut states cannot refer to media whose browser object URLs were revoked.
- **Drag-to-reorder on desktop**: drag a timeline cut to another position.
  The same action is available through the Move left/right buttons for
  keyboard/touch users. Captions, rights, fade lengths, source hashes
  and total duration remain unchanged by rearrangement.
- **Play selected cut** previews the original locally selected MP4
  from the cut's in-point and stops at its out-point. Browser playback
  updates the frame cursor approximately; it is not a rendered timeline
  or a cross-shot playback engine.
- **Exact original-source limits**: the timeline still validates cuts
  against 1–8 shots, 16 FPS, 30 seconds total and original-source
  frame bounds. The standalone Python/FFmpeg renderer remains responsible
  for verifying actual decoded constant-frame-rate media before
  generating a real H.264 export.

## Working with drafts and projects

All edits use the **same** local `shots` state. Existing
`eternyx-video-edit-draft.json` save/resume and the self-contained
offline renderer ZIP receive the edited timeline, not a mock copy.
Only new media import / successful reopening replaces the current
journal with a fresh session.

Undo/redo is **not** a backup or autosave: the journal disappears if
the browser tab closes. Save an editable JSON draft to preserve work.
It currently tracks *shot edits*, not audio recording or source-file
selection. Native browser preview seeks can be imprecise; no promise
of exact frame decoding is made before local FFmpeg validation.

`tests/local-video-edit-history.test.mjs` and
`.github/workflows/local-video-edit-history.yml` verify full undo/redo,
branch invalidation, 40-step bounds, safe source resets, private
metadata isolation, real draft/storyboard compatibility, drag-reorder,
keyboard navigation and local source preview wiring.

No cloud upload, API inference, paid GPU, subscription or new database
is involved. This is a real **local video-editing UX** upgrade, not
photorealistic generative text-to-video.
