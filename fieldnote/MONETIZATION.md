# Fieldnote monetization v1

The free browser simulation is preserved. **Payments and paid benefits are never simulated.** Commerce and advertising use real authenticated server accounts and the existing Supabase/Postgres path. In browser simulation, purchase buttons and application submission are unavailable, and no paid access is granted.

## What is implemented

- `/supporter`: configurable $5/month and $50/year membership, explicit recurring terms, Supporter badge, four profile accents and private bookmark collections.
- `/support`: $5/$15/$25 or custom $1–$1,000 **one-time contributions** in USD. Contributions do not confer membership or affect moderation/ranking.
- `/account`: verified subscription state, cancellation-at-period-end date, Stripe customer portal for management/cancellation, and profile accent controls.
- `/collections`: create/delete collections, add/remove stories, and open saved stories. Ordinary following stays free. Collections are retained but unavailable when membership is inactive.
- `/advertise`: application fields, policy agreement, private database storage and confirmed-account submission limits.
- `/advertise/admin`: server-enforced **admin** review, approval/rejection, draft creation, manually recorded pricing terms, scheduling, pausing and ending placements, plus audit history. Ordinary moderators and simulated identities cannot operate this queue.
- Ads show **Advertisement** and sponsor name in feed and detail views. Content enters the ordinary event/report pipeline and can be flagged, quarantined, removed, corrected and restored. Hiding the original sponsored report or event hides the placement. Rejecting an application pauses its placements. Ended placements cannot restart; create a new reviewed placement if needed.
- At most one ad after each 15 organic posts. A placement appears at most once in a feed session. Session memory is not an analytics/targeting identifier. Campaign dates and state determine eligibility; there is no behavioral targeting or sale of user data. Sponsored events are excluded from organic ranking, even when a campaign ends, and cannot be merged into organic stories.

The Supporter badge means financial support only. It does not verify identity or accuracy. Test-mode badges say “test.” Payments do not change evidence scores, organic ranking, access to basic posting/reporting, or moderation standards. No automatic AI detector has been added; the existing capture rules, provenance caveats, policies and review remain in place.

## Required setup before taking payments

1. Configure the **real account backend**, following `LIVE-BACKEND.md`: Supabase URL, public anon/publishable key, server-only service-role key, confirmed email/password authentication, correct Site URL/callback, and reliable confirmation email delivery.
2. Apply migrations `001`–`005` in filename order on a fresh database. On a database already running migrations 001–004, apply **only `005_monetization.sql`**. Never rerun earlier migrations blindly. It adds RLS-protected billing, private collections, ad applications, placements, service-only reconciliation functions and organic/sponsored separation.
3. Set the environment below in Vercel. Start with Stripe **test mode**. Redeploy after public environment changes.
4. In Stripe, create two active USD recurring prices, initially **500 cents/month** and **5000 cents/year**, interval count 1. Copy their Price IDs into server environment settings. Published configured amounts must match the provider prices; checkout refuses mismatches. Contributions use server-validated Checkout price data, not a client-provided Price ID.
5. Configure Stripe’s customer portal: allow billing/payment-method management and cancellation **at period end**. Disable arbitrary plan changes for this first version, or limit them to the configured/allowlisted Supporter prices. Configure your business information and support contact in Stripe.
6. Register an HTTPS webhook at `https://YOUR-DEPLOYED-ORIGIN/api/stripe/webhook` using Stripe API version **2026-09-30.endive**, matching the pinned Stripe 23 SDK. Copy its signing secret into the server environment. Configure the event types below.
7. Test actual hosted Checkout, portal cancellation, invoice failure, refund and signed webhook delivery with a real Stripe test account and real test users. Then switch to a live key, live Price IDs, live webhook endpoint secret, and `STRIPE_MODE=live`. Test/live customers and access are separated in the database.

| Environment variable | Value |
|---|---|
| `NEXT_PUBLIC_SIMULATION_MODE` | `false` for real commerce; the default simulation cannot buy benefits |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | Real project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon/publishable API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged key, server only |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS deployment origin, no trailing slash, e.g. `https://bylm.vercel.app` if that domain is serving this project |
| `STRIPE_MODE` | `test` initially, then `live` |
| `STRIPE_SECRET_KEY` | Matching `sk_test_…` or `sk_live_…`, server only |
| `STRIPE_WEBHOOK_SECRET` | Matching endpoint’s `whsec_…`, server only |
| `STRIPE_SUPPORTER_MONTHLY_PRICE_ID` | Active monthly recurring Price ID |
| `STRIPE_SUPPORTER_YEARLY_PRICE_ID` | Active yearly recurring Price ID |
| `SUPPORTER_MONTHLY_CENTS` | Optional, default `500` |
| `SUPPORTER_YEARLY_CENTS` | Optional, default `5000` |
| `STRIPE_LEGACY_PRICE_IDS` | Optional comma-separated older Supporter Price IDs to honor existing subscribers after a price change |

No Stripe publishable key is needed: the server creates hosted Checkout/portal sessions and the browser follows their URLs. Never place Stripe secrets in a `NEXT_PUBLIC_` variable, a Git commit, or chat. The existing `CRON_SECRET` remains relevant to the optional backend’s ordinary maintenance, not payment confirmation.

For administrator access, a trusted operator must appoint a confirmed real account in `profiles.role='admin'`. Signup metadata and browser-simulation roles cannot appoint admins. Sponsorship pricing is recorded and settled manually; no ad auction or automatic ad billing is implemented.

### Webhook events

Select:

```
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
invoice.updated
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
customer.deleted
```

For local integration testing, use Stripe CLI webhook forwarding to `/api/stripe/webhook` and use the CLI’s signing secret. Use test cards from Stripe’s documentation. Mock tests in this repository do not charge money or seed fake paid accounts.

## Authorization, ordering and failure policy

- The server derives the customer from the authenticated, email-confirmed user, never an incoming customer/user ID. Portal sessions are created only for that user’s stored customer. Origin checks and server-side amount/plan validation guard writes. Checkout preparation uses a short database lease; pending sessions are reused and duplicate subscriptions are refused.
- The webhook verifies the raw body with Stripe’s signature and timestamp tolerance. Unsigned/tampered bodies are rejected. Processed event IDs are unique.
- Events trigger a **fresh read of current Stripe state**. Event payload status/metadata flags do not grant access. A per-customer expiring lease with a fencing token prevents concurrent/stale workers from overwriting newer reconciliation. Subscription/payment changes and the processed event marker commit together in one Postgres function. Failed/busy processing returns an error for Stripe to retry. Duplicate/out-of-order events do not revive a canceled or refunded membership.
- Access requires an active recognized subscription, a paid latest invoice backed by successful charges, an unexpired paid period, and no full refund or unresolved/lost dispute for that period. Trialing, incomplete, past-due, unpaid, paused or canceled subscriptions do not grant benefits. No grace period is offered in v1.
- Cancellation at period end retains access until the verified period expires. Expiration is checked at read/write time even if no webhook arrives. Current-period full refunds revoke benefits; partial refunds retain access while a net payment remains. A later paid renewal can restore access. Refunds are processed by operators in Stripe; Fieldnote records them through reconciliation. Winning/closed-warning disputes can restore access after current Stripe state is verified.
- Checkout success redirects only show pending state until the user’s own server-side payment/subscription record confirms the result. Contributions have confirmed, pending, cancelled, expired, failed, partial/full refund and dispute states. No client flag grants paid access.
- Benefits are enforced again in service-only database functions. Browser roles have no direct billing/collection/advertising table grants. Public badge output exposes only user ID, active badge/accent, test label and access expiry; no email, customer ID, invoices, card information or ad contact data is exposed publicly.

Reconciliation paginates a customer’s provider records. Monitor webhook errors and delivery latency; failed deliveries must be retried/replayed. No card details are stored by Fieldnote. Financial records contain provider references, amounts, statuses and processing times, not raw webhook/customer payment payloads.

## Deletion and operations

New purchases/benefit changes are blocked after an account requests deletion; billing management remains available. The operator deletion script now requires matching Stripe credentials for every billed test/live customer and confirms cancellation of remaining provider subscriptions **before** removing account data. If both modes exist, operators can provide `STRIPE_TEST_SECRET_KEY` and `STRIPE_LIVE_SECRET_KEY` for that cleanup script only. It must stop if cancellation cannot be verified.

Billing rows are detached from the removed profile for financial reconciliation/retention; paid accents and collections cascade with the profile. Sponsored references become null if their source content is deleted, so those placements cannot display. Operators must review/redact Stripe customer PII, ad contact data, shared content and retained audit/financial records under the adopted retention policy before marking a deletion complete. Retention, webhook monitoring and administrator staffing remain operational setup, not a claimed completed service.

## Validation and remaining limits

Tests cover actual Stripe signature construction/verification, tampering, event idempotency and out-of-order refreshes using provider mocks; real Postgres-compatible migration execution, entitlement expiry/refund/mode rules, collection ownership, server-only grants, administrator permissions, ad approval/scheduling/pausing/hiding, ended campaigns, organic ranking exclusion and ad density/repetition. Existing simulation/reporting tests remain passing.

Local desktop pages and 390px responsive **render snapshots** were inspected. Live mobile hardware, real Stripe-hosted sessions, portal configuration, real Supabase/Auth/RLS/Storage integration and live payments remain unverified because credentials were not supplied. At inspection, `https://bylm.vercel.app/` returned Vercel `404 NOT_FOUND`; confirm the correct deployment/domain and Root Directory `fieldnote` before registering production callbacks/webhooks.

Primary references: [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions), [Customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [Invoice payments](https://docs.stripe.com/api/invoice-payment/list).
