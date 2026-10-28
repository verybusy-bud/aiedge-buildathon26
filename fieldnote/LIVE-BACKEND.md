# Optional live backend

The default app is a complete browser simulation and needs none of the setup below. To opt into live Supabase services, explicitly set `NEXT_PUBLIC_SIMULATION_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false` before building, then follow this guide.

# Fieldnote

Start with [CLOUD-SETUP.md](CLOUD-SETUP.md) for the GitHub → Supabase → Vercel walkthrough and multi-account signup checks.

A Next.js 16 / React / TypeScript application for Sioux Falls news and local events, with keyword/theme search and separate firsthand accounts grouped under one event. Sioux Falls is the initial pilot. Supabase provides authentication, Postgres and private media storage. Vercel hosts the application; GitHub stores its source.

## Run locally

Requires Node.js 20.9+ and pnpm 11.25.0.

```sh
pnpm install
```

Copy `.env.example` to `.env.local`. For an illustrative preview, explicitly set `NEXT_PUBLIC_DEMO_MODE=true`, then run `pnpm dev --webpack`. The demo has five illustrative events and cannot submit reports, media, follows or moderation changes. With demo false and missing credentials the app shows a connection-needed state, never fake live reports.

For a live connection, set demo false and configure the Supabase values below. Start with `pnpm dev --webpack`. Open http://127.0.0.1:3000. The production build is `pnpm build --webpack`; `pnpm start` serves that build. Webpack avoids a Windows restricted-environment junction error with the default Turbopack engine; both are supported by Next.js 16.

## Supabase setup

This is a new implementation with four ordered migrations. It was not recovered from or applied to an earlier Fieldnote database. Do not apply these blindly to an existing database: compare its schema and add forward migrations instead.

Apply in filename order through Supabase SQL tooling:

1. `supabase/migrations/001_core.sql`
2. `supabase/migrations/002_assessment.sql`
3. `supabase/migrations/003_private_uploads.sql`
4. `supabase/migrations/004_local_news_grouping.sql`

Enable email/password authentication **and require email confirmation**. Set the Site URL to the deployment origin. Allow `https://YOUR-DOMAIN/auth/callback` and the exact localhost/127.0.0.1 callback origins used for development. Signup uses the PKCE callback route. Configure SMTP delivery, password strength and authentication rate limits in Supabase before opening registration.

Set these variables in `.env.local` locally and in the Vercel project environment for hosting:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged credential |
| `NEXT_PUBLIC_SITE_URL` | Canonical application origin |
| `NEXT_PUBLIC_DEMO_MODE` | `false` in production |
| `CRON_SECRET` | Long random secret for maintenance calls |

Never commit `.env.local`, expose the service-role key, or prefix it with `NEXT_PUBLIC_`. Public environment values are baked into a Next.js build; redeploy after changes, including switching demo mode off.

All application tables enable RLS and deny direct anonymous/authenticated table access. Server APIs verify the current session and only then call service-only database functions. Public feed output is explicitly projected and excludes emails, original storage paths and restricted audit payloads. The service role bypasses RLS, so server authorization and service-only function grants are security-critical.

Appoint the first trusted administrator through the Supabase SQL editor, using the UUID of an already-confirmed account:

```sql
update public.profiles set role='admin' where id='CONFIRMED-USER-UUID';
```

Only a trusted operator should run this. Signup metadata never sets roles. Appoint moderators through an equivalent controlled operator process, and document every appointment.

## Deploy through Vercel

Commit source and lockfile to your chosen GitHub repository. Exclude `node_modules`, `.next`, `.env.local` and private evidence. Import the repository into Vercel, set the root directory to this app folder if using a larger repository, select Next.js, and set the build command to `pnpm build --webpack`. Set environment values, deploy, then confirm the production site URL and auth redirects match. GitHub Pages is not suitable for these server routes.

No GitHub push or hosted deployment has been performed by generating this project. No live credentials are included.

## Assessment

Postgres `assessment` is authoritative. Two accounts earn 1 point; three or more earn 2. Distinct file hashes from finalized captures earn 0.5 each, capped at 1. Latest visible report receipt within six hours earns 1, within 24 earns 0.5. Explicit moderator corroboration adds 1; conflicting status subtracts 1. Clamp to 0–5. No visible accounts means no score. Quarantined/removed reports and their captures do not contribute. Hidden events are excluded from the public feed.

Scores are computed at read time, including time decay without new posts. Database triggers record changes when reports, evidence or event status change. Run the maintenance endpoint every five minutes to record time-based score transitions and clean abandoned uploads. For example, use a trusted scheduler to POST `/api/maintenance` with `Authorization: Bearer YOUR_CRON_SECRET`. Do not put the secret in the URL. An external scheduler is required; this repository does not provision one. Alert on non-2xx responses.

The frontend reference calculation is tested against the database on representative scenarios. This is a transparent evidence summary, not a validated credibility model, AI detector, proof of independent witnesses or truth probability.

## Media

Camera capture uses `getUserMedia` and MediaRecorder in supported browsers, with HTTPS/localhost required. No gallery/file import control is provided. The server cannot prove an upload actually came from an uncompromised camera: capture-method metadata is an assertion and a modified client can bypass browser controls. Do not market this as reliable AI filtering. Moderation is the enforcement path; no AI detector is currently integrated.

Upload intents are object-specific and expire after two hours. The browser sends up to 25 MB directly to the private originals bucket using an upsert-disabled signed token. The server downloads the stored object, checks size and signature against its MIME type, hashes it and finalizes the intent once under a database lock. Optional image previews are re-encoded with Sharp to WebP without original metadata. Originals/video stay private; previews are delivered through visibility checks and 60-second signed URLs. Previously issued links may remain usable for up to that minute after removal. Cached or downloaded media cannot be recalled.

Signature checks do not fully decode or establish safety of every video container; video stays private. Images are decoded when creating previews with a pixel limit. Complete adversarial media/security review and assess memory use at the 25 MB limit before public launch. Camera recordings are silent, at most 60 seconds, and limited by size. Report rate is 12 per account per rolling 24 hours; media intents 36/day and four per report. These are account limits, not proof of one person per account.

Expired-intent maintenance waits five minutes past expiry, removes originals and possible previews, and marks the intent cleaned. Database finalization rejects expired intents, deleted accounts and hidden reports/events. Retries do not create duplicate reports; failed evidence uploads can be retried or skipped after the report is saved.

## Moderation and appeals

Confirmed users can flag events/reports or appeal decisions from their account page. Limit: 20 concerns/account/day. Moderators access the private queue from the sidebar. They can change event statuses, quarantine/remove/restore content, resolve concerns and inspect restricted corrections/audit records. Users see pending/reviewed status for their own concerns. Follows and updates are in-app polling (60 seconds); no email/push notifications are implied.

Pilot operating policy: prohibit fabricated firsthand accounts, synthetic/manipulated evidence presented as capture, harassment, doxxing and private addresses. Allow disclosed writing assistance that does not invent observations. Review specific evidence and context; detector outputs alone are not proof. Quarantine while reviewing material concerns, record the reason, restore when appropriate, and allow appeal. Set staffed response targets, an escalation contact and independent appeal reviewers before launching. These operational staffing arrangements are not provisioned by the app.

## Deletion and retention

Users request deletion in their account. The database blocks further content actions while deletion is pending. A trusted operator runs:

```sh
node --env-file=.env.local scripts/delete-account.mjs USER_UUID
```

The script requires a real deletion request and waits for outstanding upload tokens to expire plus five minutes. It removes all files under the owner prefix, including abandoned objects, clears the account's concerns and personal correction payloads, removes their reports and empty event shells, then deletes the auth account. It is retryable when an operation fails. It leaves the request at `active_cleanup_complete_review_and_backups_pending`, never automatically claims complete deletion.

Operator completion checklist: review shared event titles/locations and third-party audit text for the deleted person's information; redact as required without exposing other witnesses; verify bucket prefixes and database references; document when all retained backups containing the data expire or are safely destroyed. Then update the request using its retained request ID to `complete` with `completed_at=now()`.

**Proposed pilot retention policy, requiring operator adoption:** pending uploads expire at two hours and are cleaned by maintenance; live reports/evidence remain until deletion or moderation removal; complete active-system deletion within 30 days of a request; retain ordinary backups at most 30 days; restrict moderation records and redact personal data during deletion review. Supabase/hosting backup settings and legal exceptions must be checked and configured to match before these become user-facing promises. Until adopted/configured, retention and deletion SLA are launch blockers.

## Validation and operations

Run `pnpm typecheck`, `pnpm test`, and `pnpm build --webpack`. Tests execute all three SQL migrations in a local PostgreSQL-compatible PGlite instance with minimal auth/storage schema stubs. They exercise scoring, deduplication, moderation exclusions, duplicate reports, limits, service-function permissions and one-time finalization. This does not substitute for real Supabase Auth/Storage/RLS end-to-end testing.

Before public launch, use separate accounts to verify confirmation/callback, cross-user access denial, private original denial, signed upload expiry, invalid files, preview consent, quarantine/restoration, appeals, deletion and backup expiry. Review on real phones with cameras and weak connections, keyboard/screen readers and target browsers. Validate that people understand the score limitations.

Enable deployment and Supabase error monitoring, authentication-abuse controls, backups/PITR as appropriate, and a tested restore procedure. Assign on-call ownership; document credential rotation, takedowns, security incidents and recovery objectives. Conduct privacy/security review and a restore drill. Public reads currently cap the pilot feed at the latest 200 created events; broader geographic feeds and pagination need design before expanding beyond the pilot.

The app is a PWA shell with manifest/icons and responsive layout; it deliberately has no offline cache of witness or private evidence and does not support offline submissions. Brand color is #70020F. Anton is bundled locally with its SIL Open Font License. Body text uses Arial Unicode MS when installed, falling back to Arial and system sans-serif. The app makes no external font requests. A dedicated /about page explains technical details and links to https://github.com/aiedge-buildathon-2026/team17-natural-intelligence.

Technical references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).

## Local news, themes, and grouping

The feed focuses on Sioux Falls. Theme filters include Food, Traffic, Special events, Local news, Environment, Public services, and Community. Search matches keywords across headlines, approximate locations, categories, and visible report text; theme words expand to related vocabulary. Multiple query terms must all match. This is search over community reports, not an external news aggregator. The pilot feed still loads the latest 200 event listings.

New-report forms suggest up to three related loaded events using headline word overlap, approximate location, and observation time within 24 hours. Selecting a suggestion adds a separate report to that event. On submission, Postgres also groups matching normalized headlines and locations if an existing visible report is within six hours of the submitted observation time, across categories and under a transaction lock. Matching is a heuristic; observation time is user-asserted, and a submitter can explicitly keep a different occurrence separate. The same account cannot add another report to the same event or inflate its account count. The form keeps a duplicate draft unsaved and lets its author open their existing report.

Moderators can group existing duplicate listings. Reports and linked media remain intact, follows are deduplicated, concerns and audit references move to the kept event, and the source listing records its destination. Grouping is refused if an account has reports in both listings, so neither account is silently lost. Corroboration returns to under review unless either listing is conflicting. The score is recalculated using the existing factors; prior scores are never simply added. No existing listings are bulk-merged automatically.

**Upgrade:** on a project that already applied 001–003, apply only `004_local_news_grouping.sql`, then deploy this version. A fresh project applies all four in order. Do not rerun the earlier migrations.
