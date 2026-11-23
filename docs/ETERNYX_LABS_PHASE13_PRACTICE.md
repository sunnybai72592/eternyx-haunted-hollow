# LABS Phase 13 — Offline practice navigation and session portability

The 90 existing real challenges and 30 tracks are preserved. This phase adds:
1. Text search across tracks, case titles and prompts.
2. Filters for unfinished, locally-checked and bookmarked scenarios.
3. User-controlled bookmarks and pending-review counts.
4. Wraparound navigation directly to the next unfinished case.
5. Manual opt-in JSON export and import of checked-case markers and bookmarks.
6. Strict 16-KiB input bounds, versioned schema, known case-ID and duplicate rejection.

Portable records are editable and **not evidence** of completion, trusted scores,
certifications or account achievements. No answers, credentials or personal
identifiers are exported. No backend calls, browser storage, cloud sync or billing
are involved. Tests cover malformed data and the catalog invariants.

Run: node --test tests/eternyx-labs-practice-session.test.mjs
Then run: npm test && npm run build.
