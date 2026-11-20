# ETERNYX VPN / proxy / Tor network access — staged implementation

## Status as of 2026-11-20
**Policy and tests only; NOT deployed, NOT detecting VPNs, NOT blocking traffic.**
This PR makes a reviewed, conservative policy and testable rules candidate. It does
not create a firewall, provision Cloudflare, buy threat intelligence, or change
Supabase production. Do not advertise VPN blocking as live.

## Why a website alone cannot enforce this
- Browsers cannot reliably inspect VPN-app state. Network reputation works on
  the request's public IP and is imperfect; residential proxies can evade it.
- Eternyx uses a Lovable-hosted frontend with direct Supabase Auth, Data API,
  Storage and Edge Function calls. A WAF only in front of the website does
  **not** protect `*.supabase.co` endpoints; UI popups or frontend redirects
  are bypassable. Supabase server-side request enforcement requires separately
  verified and applied controls; do not trust caller-supplied X-Forwarded-For.
- Payment provider webhooks, GitHub CI, and authorized uptime checks must not
  be broken by an indiscriminate VPN rule. Avoid bypass based solely on a client
  header. No bypass should weaken Supabase RLS, JWT verification or rate limiting.

## Deployment stages — an explicit operator change, not this PR
1. Verify the intended public hostname is actually proxied through Cloudflare,
   not a DNS-only record, and that the account has the required WAF capabilities.
   Keep origin access restrictions and a tested rollback plan.
2. Choose a maintained IP reputation source or a Cloudflare plan with managed
   anonymizer lists. Confirm lawful data use, accuracy, pricing, expiry and update
   schedule. Never label all datacenter or foreign IPs as VPNs.
3. Create a Cloudflare **custom IP list** named
   `eternyx_confirmed_anonymizer_ips`. Populate only confirmed, reviewed
   anonymizer exit addresses. The repository DOES NOT populate this list.
4. For **each approved and proxied hostname**, install a custom WAF rule
   corresponding to this candidate expression, replacing the placeholder with
   the actual verified hostname:
   
   ```
   (http.host eq "REPLACE_WITH_VERIFIED_ETERNYX_HOSTNAME" and ip.src in $eternyx_confirmed_anonymizer_ips)
   ```
   
   Begin with **Log** action (where the plan supports it), or non-blocking
   Security Analytics observation, not Block. Validate matches against known
   benign connections and intentional VPN tests (IPv4 and IPv6).
5. Review false positives; add an accessible support/appeal path and time-bounded
   emergency rollback. If explicitly approved, trial Managed Challenge and only
   then Block for high-confidence detections. Keep unknown reputation **allowed**.
6. Separately secure direct Supabase entry points. First verify the actual
   trusted client-IP provenance in the deployed gateway; upstream
   `cf-connecting-ip` or `x-forwarded-for` must not be accepted merely because
   the header exists. Avoid breaking authentication, AI workers, webhooks,
   or existing row-level-security policies. Use test accounts and a separate
   staging project, not production fixtures.
7. Verify website, each API route, direct Supabase bypass attempts, login,
   mobile/desktop, VPN on/off, multiple VPN providers, Tor, CGNAT,
   IPv6, legitimate corporate networks, support appeals, and rollback.
   Record observed outcomes, not fabricated pass/fail claims.

## Exit requirements before declaring 'VPN blocked'
- A correctly proxied site AND relevant API perimeter enforced.
- A real, currently updated anonymizer detection source and measurable accuracy.
- Green reproducible staging evidence, measured false positives, approved cost.
- Explicit human approval to flip the enforcement action.
- Continued authentication, RLS, session handling and abuse protections.

References:
- https://developers.cloudflare.com/waf/tools/lists/managed-lists/
- https://developers.cloudflare.com/waf/concepts/
- https://supabase.com/docs/guides/functions
