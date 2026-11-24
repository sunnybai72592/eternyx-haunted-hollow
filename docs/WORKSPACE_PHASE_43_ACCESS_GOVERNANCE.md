# Workspace Phase 43 — Access governance

Verified roster role filters and task assignment counts use the complete existing authorized member/task snapshot. Removal and leave confirmation describe actual assignment impact. Membership controls respect current owner verification; archived owners can manage access as permitted by the existing server RPCs. No new permission.

Invitation metadata is shown for the latest 30 rows only; pending/accepted/revoked/expired views use device time, not an exact complete count. The one-time creation receipt validates role, UUID, token and expiry. Code can be hidden permanently, is not persisted, and expires out of the UI. Clipboard checks current verified scope and local expiry. Server expiry and RPC authorization remain authoritative. Refresh after creating a code to update the loaded history.

No migrations, deployments, dependencies or external services. Dedicated CI covers the access and governance utilities. Authenticated multi-account staging and real browser verification remain necessary.
