# Monetization v1 validation

- Nineteen automated tests pass, including all five SQL migrations, Stripe signature verification/tamper rejection, duplicate/out-of-order webhook reconciliation, paid access/refund/expiry/mode rules, collection ownership and RLS grants, admin-only sponsorship review, campaign eligibility and organic/ad separation, plus all previous free simulation tests.
- TypeScript and the production Webpack build pass. Local HTTP checks confirm unconfigured purchases, sponsorship writes and webhooks return 503; forged checkout return IDs do not activate access and the public Supporter directory remains empty.
- Desktop Supporter, contribution/custom amount, and application pages inspected. Responsive render snapshots at 390px inspected; live framing headers remained unchanged.
- Stripe/Supabase credentials were unavailable. Hosted test/live Checkout, actual portal settings, provider delivery, and live database integration were not claimed as tested. Payments and application submission correctly show unavailable in browser simulation.
- Supplied live URL returned Vercel 404 during inspection. Setup is documented in MONETIZATION.md.

---

# Current version: complete browser simulation

The default app needs no Supabase project, credentials, migrations, SMTP, or server-side storage. Earlier live-backend notes below apply only to the optional live implementation.

## Simulation checks (October 28, 2026)

- Twelve automated tests pass, including in-memory IndexedDB tests for account confirmation, media upload/finalization, access rules, expiry, and deletion of stored blobs. Core tests cover grouped reports, serialization, limits, corrections, follows, flags, appeals, review and deletion.
- TypeScript checks and the production Webpack build pass with simulation enabled by default and no Supabase connection.
- Browser walkthrough passed: create and confirm a test account; submit a story with a clearly labeled sample image; generate a preview; follow and reload; switch reporters; add a report and see the score change; flag the story; switch to the test moderator; save a review and inspect its audit entry. No Supabase connection was configured.
- Real cameras, screen-reader review, storage exhaustion, and the full browser/device matrix remain unverified. The sample-capture flow validates media processing without camera access.
- This is local simulation, not secure authentication/private storage or shared cross-device hosting. Simulated stories and browser hashes are not verified news or server provenance.

---

# Validation record

Checked locally on October 28, 2026. This is a newly authored project, not a verified copy of the historical implementation.

## Passed

- Production build with Next.js 16.4.3 and Webpack; TypeScript validation.
- Assessment tests: no score versus zero, recency boundaries, conflict penalty, score cap and moderator points.
- File-signature checks reject unsupported content and distinguish supported containers.
- All three SQL migrations execute in a PostgreSQL-compatible PGlite instance with minimal Supabase auth/storage schema stubs.
- Database integration tests cover duplicate reports, separate accounts, distinct file hashes, score parity, moderator permissions, quarantined report exclusion, event removal/restoration, 12-report limit, pending deletion, function/table grants, assessment history and single-use upload finalization.
- Browser checks: demo feed rendering, search filtering, distinct witness accounts, assessment factors/caveats, and demo submission blocking.
- Local HTTP checks: homepage 200; demo report/media submission 503; unauthenticated maintenance 403.

## Not verified or not provisioned

- Real Supabase email delivery, PKCE confirmation, sessions, cross-account access, Storage tokens or media upload/finalization. No project credentials were supplied.
- Hosted Vercel deployment or GitHub push. No destination repository was connected in this workspace.
- Real mobile cameras, target-device/browser matrix, slow-network performance, screen-reader audit or adversarial security review.
- Operational moderation staffing, maintenance scheduler, monitoring, backups and restore drills. Setup instructions are supplied; these services are not provisioned.
- Completed deletion/retention operations against live systems. Operator cleanup is implemented, with manual review and backup expiry explicitly required before completion.
- Reliable AI-generated-content detection. No detector is integrated. The implemented approach is capture restrictions, provenance, flags, moderator review and appeals, with limitations disclosed.

The source is ready for connection and live integration testing. It should not be described as production-ready until the launch steps in README are completed.

## Branding and About update

Updated to exact brand red #70020F, removed the promotional sidebar note, feed introduction panel and decorative right rail, and bundled Anton with its license. Body text uses local Arial Unicode MS/Arial fallbacks. Browser review confirmed the simplified feed and the /about page, including links to the team repository. TypeScript validation passes. No authentication, database or storage behavior was changed by this update.

## Sioux Falls local-news update

Added keyword/theme search, related-event suggestions, atomic exact-match grouping, and moderator-controlled grouping through forward migration 004. Automated checks cover theme search, combined keywords, time/place boundaries, same-account deduplication, different-occurrence opt-out, exclusion of hidden events, moderator authorization, preservation of reports/evidence/follows, score recalculation, and refusal to discard overlapping accounts. Live cloud configuration remains unverified.
