# Workspace Phase 40 — Scheduling and export integrity

- One Gregorian date validator for task drafts, list filtering and the calendar. Years 0001–9999; invalid leap dates rejected before save.
- Correct last-week arithmetic and null-last completed schedule sorting.
- Standards-compatible one-day iCalendar event on the final supported date, strict UUID shape, bounded timestamp and validated metadata.
- CSV formula-prefix protection includes Unicode compatibility forms and leading tabs/newlines. Forbidden controls are replaced in CSV and iCalendar output; ordinary line breaks and Unicode are retained. No claim of universal spreadsheet safety.
- Both explicit local downloads remove their link and revoke their object URL even when activation throws.
- Seven additional regression groups in the existing dedicated Workspace workflow.

Exports remain intentionally local and scoped to the currently authorized visible rows. No database migration or backend change. Existing pseudonym labels and data-access controls are retained. Real browser downloads, actual spreadsheet/calendar importer compatibility and authenticated staging still require verification.
