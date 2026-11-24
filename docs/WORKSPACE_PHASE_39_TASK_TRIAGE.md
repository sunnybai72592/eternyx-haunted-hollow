# Workspace Phase 39 — Task triage and complete workload drilldowns

All six workload metrics now use the existing verified filtered list: outstanding,
in progress, overdue, upcoming (today through seven days), urgent outstanding and
completed. Empty or outside-roster counts have no drilldown. Each drilldown replaces
search, priority, assignment, status and sort deliberately and returns to List view.

New composable filters: Due today, No due date (outstanding only), In progress.
Reset restores the default filters and sort without changing layout or data.
Filter buttons expose pressed state. Due-date sorting keeps null dates after all
real dates, including the year-9999 boundary; upcoming arithmetic uses UTC day values.

The existing dependency-free Workspace workload workflow covers the added tests.
No database writes, new migrations, persistence, or external services. Real browser
and staging checks for team switches, revocation, and all drilldowns remain necessary.
