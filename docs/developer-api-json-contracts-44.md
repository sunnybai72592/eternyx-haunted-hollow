# Developer Studio 4.4 — bounded JSON integration contracts

Project-linked GET checks can optionally verify the existence or JSON type of one own field (string, number, boolean, object, array, null). Use a dotted path with at most 12 segments and canonical numeric array indexes. HEAD and non-JSON response expectations cannot use this option. Prototype-sensitive segments and unknown contract fields are rejected. Existing scenarios and v1 exports remain compatible.

The runner reads at most 64 KiB of decoded response-stream bytes when status and JSON media type pass. Other cases cancel unused response bodies. Missing fields, wrong types, invalid JSON and oversized bodies fail explicitly. Time budgets include body reading when selected. Cancellation and timeout take precedence. Reports retain only the fixed outcome code, not the field path, field value, raw body or header. Saved suite definitions include the requested field path/type, not response values. Do not put secrets in names or paths. Browser requests remain explicit, sequential, credential-free, CORS-constrained and redirect-refusing, with no referrer URL.

This is a real local contract-testing feature, not proof of authenticated authorization, hosted staging, or production release readiness. Tests use standard Response streams and negative cases without contacting external hosts.
