# Workspace Phase 41 — Verified task collaboration

Exact comment and checklist pages are checked for scope, duplicates, shape and limits before publication. Refreshes carry independent read receipts; superseded responses cannot replace the current task snapshot. Failed latest reads clear displayed rows and block writes. Drafts remain in the open task but are cleared on identity changes or confirmed current-scope actions. A synchronous action lock protects duplicate submission before React updates. Server RPC and RLS remain authoritative.

Comment search, author/redacted filters, chronological sorting, checklist open/completed filters and actual completion progress are local views. Redacted bodies are never rendered or searched. No new permissions, tables, external services or dependencies. Dedicated offline CI includes discussion tests; authenticated browser and staging concurrency/revocation tests remain release gates.
