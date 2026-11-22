# ETERNYX Automation — signed inbound webhooks (Phase 2B)

## Capabilities after deployment

- Register up to 5 signed triggers per account, at most one per saved workflow.
- One-time random 256-bit signing key; only AES-256-GCM ciphertext and IV are stored, not plaintext.
- Explicit enable, disable, rotate, delete controls. New and rotated keys default to disabled.
- HMAC-SHA256 over exact JSON bytes, 10-digit Unix timestamp ±300 seconds, and unique request UUID.
- Server recomputes the stored, owner-scoped deterministic text workflow. No arbitrary scripts or outbound connections.
- Shared 30 runs/account/24h cap, request-key replay defense, private metadata-only history.
- Versioned credentials fence in-flight requests from previous keys after rotation.
- No autonomous scheduling, external-write tools, subscriptions, or AI generation is activated.

## Configuration

1. Review the PR tests and isolated SQL acceptance.
2. Apply the signed webhook migration after the manual Automation migration.
3. Generate a 32-byte random encryption master key, encode it as 64 hex digits, store ONLY as the Edge Function secret AUTOMATION_WEBHOOK_ENCRYPTION_KEY. Do not commit it or expose it in frontend VITE configuration. Back it up securely, as loss invalidates encrypted trigger keys.
4. Deploy the updated automation-control and new automation-webhook Edge Functions. The webhook endpoint sets verify_jwt=false in config.toml by design: it enforces mandatory HMAC itself.
5. In ETERNYX, sign in, select a saved workflow, Load triggers, Create trigger, copy the one-time key securely, then explicitly Enable.
6. Review upstream gateway/WAF abuse controls before exposing this signed endpoint to untrusted internet-scale traffic. This milestone does not include global invalid-signature rate limiting.

## Client protocol

POST: https://YOUR_PROJECT.supabase.co/functions/v1/automation-webhook

Required headers:
- Content-Type: application/json
- x-eternyx-timestamp: 10-digit Unix seconds, UTC
- x-eternyx-request-id: new UUID v4 per distinct event
- x-eternyx-signature: sha256= plus 64 lowercase hex characters

Body must contain only triggerId and input, for example:

    {"triggerId":"YOUR_TRIGGER_UUID","input":"Alpha\nalpha\nBeta"}

HMAC secret is the 32 raw bytes obtained by decoding the one-time signing key from hex. Sign these exact UTF-8 bytes:

    timestamp + "\n" + requestId + "\n" + exactJsonBody

Each newline above is the byte 0x0A. The signing key itself is NEVER sent with the request.

### Node.js 22 example

~~~js
import { createHmac, randomUUID } from "node:crypto";

const url = process.env.ETERNYX_WEBHOOK_URL;
const secret = process.env.ETERNYX_WEBHOOK_SIGNING_KEY;
const triggerId = process.env.ETERNYX_WEBHOOK_TRIGGER_ID;
if (!url || !/^[0-9a-f]{64}$/i.test(secret || "") || !triggerId)
  throw new Error("Configure private webhook URL, signing key and trigger ID.");

const timestamp = String(Math.floor(Date.now() / 1000));
const requestId = randomUUID();
const body = JSON.stringify({ triggerId, input: "Alpha\nalpha\nBeta" });
const signature = createHmac("sha256", Buffer.from(secret, "hex"))
  .update(timestamp + "\n" + requestId + "\n" + body, "utf8")
  .digest("hex");
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-eternyx-timestamp": timestamp,
    "x-eternyx-request-id": requestId,
    "x-eternyx-signature": "sha256=" + signature,
  },
  body,
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || "Webhook rejected");
console.log({ runId: result.runId, output: result.output });
~~~

## Safety and cost

HTTPS is required in production. Do not place passwords or credentials inside saved workflow step literals or webhook inputs. Raw outputs are returned only in the signed response; logs persist counts and operation metadata. The endpoint enforces a 14,000-byte total request limit, 12,000-character input limit, 30,000-character output limit, 12 workflow steps and 2,500 lines. Host-provided compute and DB calls may incur charges, even with no GPU or third-party AI.

Verify signing and replay, rotation/pause races, cross-owner controls, private credential grants, build and SQL acceptance before activating traffic.
