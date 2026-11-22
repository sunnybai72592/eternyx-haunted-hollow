# ETERNYX Services — service-request foundation

## Purpose

Services is the managed-service enquiry gateway, separate from self-service
Explore/pillar workbenches and the subscription hub. Six scoped categories lead to
an authenticated project brief; customers can see their saved requests and
customer-visible updates. An administrator verified by public.is_admin() can
review and update statuses. No automatic fulfillment is claimed.

## Delivered

1. Service landing page with six scoped categories, prominent request CTA,
   tracker, review disclosures and self-service links.
2. Account-owned validated project brief. Success requires a confirmed database
   insertion and returned row ID.
3. Private customer tracker showing real statuses and administrator updates.
4. Admin-only review queue with persisted status and customer-facing messages.
5. RLS and column grants limiting reads to owners/admins, inserts to account
   owners and status updates to verified admins. Contract regression tests.

## Activation and release gates

1. Apply and review the migration in
   supabase/migrations/20261122201000_service_requests.sql using the existing
   reviewed deployment process. Merging a PR is not a substitute for applying SQL.
2. Confirm public.is_admin() trusts only server-assigned admin grants.
3. Run npm test and npm run build, then inspect in the browser as an anonymous
   visitor, two different authenticated users and a verified administrator.
4. Verify user A cannot read user B's records, insert with B's user_id or alter
   status/client_update. A verified admin can read and change status/update, but
   cannot rewrite the original customer brief. Anonymous users cannot access
   customer records.
5. Verify errors are visible if the schema is absent or persistence fails.
   Review mobile layout and keyboard-only navigation.

## Commercial boundaries

These are enquiries, not orders. No prices, capacity claims, service-level
guarantees, checkout, subscriptions, customer file uploads, or unattended AI
actions are enabled. Any work requires feasibility review, written authorization,
a separate scope agreement and separate commercial approval.

The existing Contact page and business enquiry inbox remain intact for general
visitor correspondence. Future phases may include contracts, proposals, orders,
invoicing, private attachments and delivery milestones after backend review.