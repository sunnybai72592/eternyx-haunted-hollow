# ETERNYX AI Video — Save and resume an editable local timeline

This project-save workflow complements ETERNYX's actual CPU editor, which
produces a portable private FFmpeg ZIP. Previously closing/reloading the browser
lost the selected media, cuts, captions and soundtrack settings. Now the editor
can export a **small, versioned editing draft** and restore it after reattaching
the **exact original private files**.

## Save a work-in-progress

In **AI Video Studio → Local CPU Video Editor**, select source MP4s and
optionally a licensed soundtrack, edit shot cuts, start frames, durations,
human captions, usage-rights notes, fade-in/out lengths, audio volume,
output shape and quality. Give the project a meaningful title.

Select **Save editable project draft (.json)**. The browser downloads
`eternyx-video-edit-draft.json`, containing the editing state and each
original source filename, byte count and SHA-256 fingerprint.

Drafts deliberately allow **unfinished or empty** captions and rights
references, so an editor can pause before the project is ready for export.
When rendering or packaging the final project, the existing strict storyboard
validation still requires valid human captions and source rights references.

**The draft is not the finished video.** No original MP4, soundtrack, object
URL, base64-encoded media, cloud link, access token, third-party API data,
Python execution or device filesystem path is stored in its JSON.

## Reopen later, without losing work

1. Open AI Video Studio on the same or another suitable computer.
2. Choose the saved `eternyx-video-edit-draft.json` in **Open a previously
   saved draft**. The current timeline remains untouched while the draft is
   inspected, even if the file is malformed.
3. The editor shows the required original MP4 and optional audio filenames,
   approximate sizes and SHA-256 prefixes.
4. Select **all the original local files** at once. The browser reads their
   real bytes, rechecks each SHA-256 and exact byte count, validates safe
   filenames and fails closed if any file is missing, duplicated or altered.
5. Only when every file matches, the editor replaces the old timeline in
   one state update with the saved cut order, offsets, fades, captions,
   rights, source videos, soundtrack/volume, output profile and project title.
   Old temporary browser media URLs are revoked and new URLs are created
   only for the verified media.
6. Resume editing. Export a new draft or produce the **complete portable CPU
   video project ZIP**. Actual rendering still runs locally with Python 3.11+
   and FFmpeg/FFprobe/libx264.

If any required source is unavailable, cancel the pending restoration to
return to the existing timeline. The browser does not reconstruct, replace
or silently reuse missing original footage. Source frames are still fully
checked by the offline FFmpeg renderer before export.

## Privacy, compatibility, failure behavior

- **No media upload or automatic browser persistence.** Draft saving is
  explicit, and local source files are selected by the operator again.
- **Strict schema and bounds:** versioned format, 32 KiB JSON, maximum 8
  original clips, 8 editable cuts, 480 total frames at 16 FPS, maximum
  original source sizes (64 MiB video / 16 MiB audio), and supported
  landscape/portrait/square output shapes.
- **No forged project data:** unknown fields and malformed hashes, filenames,
  unsafe text, non-integer frames, unsupported formats and duplicated files
  are rejected. Even a file with the correct filename and length is rejected
  if its contents differ from the original SHA-256.
- **Transactional restore:** pending draft selection never replaces the
  current timeline until *all* source media checks complete. Failed
  reattachment does not commit partial edits or mismatched soundtracks.
- **Rights:** user-entered usage-rights references are metadata, not proof
  of licensing. Keep original rights records.

A draft is a human editable local video-editing project, **not a model
checkpoint, natural-language prompt-to-video generator, remote job,
or complete rendered MP4**. The workflow requires no GPU, paid AI API,
external storage or subscription.

The dedicated test workflow `.github/workflows/local-video-edit-draft.yml`
runs the real offline draft roundtrip, exact local source-byte verification,
malformed/tampered/extra/missing file rejection, work-in-progress fields,
no-media privacy assertions, and Studio integration.
