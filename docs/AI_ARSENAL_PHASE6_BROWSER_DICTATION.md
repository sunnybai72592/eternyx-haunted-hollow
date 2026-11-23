# ETERNYX AI Arsenal — Phase 6: real opt-in browser dictation

## Delivered
1. Real microphone dictation in browsers exposing SpeechRecognition or webkitSpeechRecognition, with explicit permission/consent and start/stop actions. No fake transcription results.
2. Final and interim speech recognition output are distinguished. Recognition results are recomputed from the browser snapshot instead of appending duplicate final segments.
3. Strict caps (12,000 local recognized characters, 3,500 characters for optional chat summarization), error handling, and no invisible truncation.
4. The user can edit/verify recognized text, copy it, download it as text, and transfer it to the browser speech preview.
5. Optional *real AI Chat* summarization of the reviewed transcript, using the existing authenticated chat endpoint, account \`ai.chat\` credits and stored chat history. No automatic inference or retries.
6. Unsupported browser, denied microphone permission, no speech match, and interrupted microphone sessions have clear states; recognition aborts on page unmount.
7. Revised AI Arsenal Audio Studio status and regression tests for the full boundary.

## Important privacy and capability boundaries
- Browser speech recognition is **not guaranteed to be on-device**. Chrome, Edge, and other vendors may transmit microphone audio to their own servers. ETERNYX does not control that processing. Do not dictate sensitive or proprietary content without authorization.
- Microphone recognition is **live dictation** only, NOT transcription of an uploaded MP3/WAV. Uploaded files still have only local preview and a preparation note. No fabricated transcription is shown for uploaded media.
- The optional AI summarization **does** submit the selected text to the external AI Chat backend when clicked; it consumes \`ai.chat\` credits, and conversation history is saved. Speech dictation alone does not use ETERNYX AI Chat credits.
- The new workflow does not introduce a paid transcription API, another model, server-side audio storage, or any AI Video functionality.
- SpeechRecognition browser support varies; only run when the constructor is available. Editing the transcript invalidates previous AI summaries, but already-sent requests cannot be cancelled or refunded automatically.

## Staging acceptance
- [ ] Test allowed microphone permissions and denied permission in desktop Chrome/Edge, plus unsupported browsers.
- [ ] Speak multiple phrases, observe interim text and final transcript once each; ensure no duplicate segments after repeated recognition snapshots.
- [ ] Stop, edit, copy, download and read aloud the recognized text.
- [ ] Close the page while listening; verify the browser recognition session is aborted, no further state updates occur.
- [ ] Enter overly long text to confirm AI summary refuses without truncation or backend call.
- [ ] Verify explicit AI summary click, account credits, error mapping, chat history and stale-result invalidation after edits.
- [ ] Confirm uploaded audio files still stay local and are never silently submitted for transcription.
- [ ] Test mobile browser compatibility and small-screen accessibility.
- [ ] No AI Video changes. Native scanned-PDF OCR and embedding-based document search remain separate, staging-dependent work.
