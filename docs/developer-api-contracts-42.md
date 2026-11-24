# Developer Studio 4.2 — API contract and anonymous boundary testing

The project-linked API suite now supports optional JSON (including application/*+json), HTML, or plain-text response content-type expectations, in addition to HTTP status and response-header latency. Older suites remain valid. The expected type is a fixed enum; report exports retain only a classification, never raw headers, bodies, query strings or request paths. A missing observable header fails an explicit content-type check.

For authorized services, a GET/HEAD expected 401 or 403 can check the anonymous denial boundary. It does not validate logged-in access, tenant isolation, RLS, or production readiness. Requests remain explicit, sequential, credential-free, CORS-constrained, redirect-refusing and limited to saved scenarios. Use only authorized targets. No extra backend, credentials or paid service.

The suite rejects mixed project IDs or duplicate scenario IDs before sending traffic. Cancellation overrides a late response; body streaming is cancelled when possible because this is a response-header-only contract. Cross-tab storage changes refresh the suite. Export is available only for a completed, uncancelled run matching the current project and scenario snapshot; any change requires rerunning. Partial results remain visible for diagnosis, not current acceptance evidence.

Local Chrome exercises the real loopback HTML response and a deliberately wrong JSON contract, including stale-export blocking. Manual hosted staging acceptance continues to save synthetic settings without sending API suite requests. Protected authenticated testing and actual hosted staging are not verified by this change.
