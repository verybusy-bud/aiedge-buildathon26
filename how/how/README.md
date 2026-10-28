# Fieldnote

Fieldnote is a privacy-oriented Sioux Falls pilot for comparing separate observations of local events. It keeps witness accounts distinct, makes corrections visible, and communicates uncertainty. It does not decide whether an event is true.

## Run locally

1. Install Node.js 20.9 or later and pnpm.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env.local`.
4. For a local UI preview without a Supabase project, set `NEXT_PUBLIC_DEMO_MODE=true`. Demo reports are illustrative and cannot be submitted to.
5. Run `pnpm dev` and open `http://localhost:3000`.

For a real backend, create a Supabase project and follow the cloud setup below. Leave demo mode off outside local development.

## Cloud setup

GitHub is the source-code repository. It is not the database, authentication service, or private media store. This project uses Supabase for those services and can be deployed from GitHub to Vercel or another Next.js host.

1. Create a Supabase project. In Project Settings → API, copy the project URL and public anon/publishable key. Copy the service-role key separately; it is server-only.
2. Apply both SQL files in `supabase/migrations/` in filename order using the Supabase SQL editor or the Supabase CLI. This creates the tables, row-level security rules, private storage buckets, moderation routines, and scoring triggers.
3. In Supabase Authentication, enable email/password sign-in and email confirmation. Add `http://localhost:3000/auth/callback` to local redirect URLs. Later add the production callback URL, for example `https://YOUR_DOMAIN/auth/callback`, and set the production Site URL.
4. Set these environment variables locally and in the hosting provider’s project settings:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — server only; never prefix with `NEXT_PUBLIC_`
   - `NEXT_PUBLIC_SITE_URL` — local URL during development and the deployed origin in production
   - `NEXT_PUBLIC_DEMO_MODE=false`

5. Push the source to your GitHub repository when ready. In Vercel, import that repository, add the environment variables, and deploy. After adding a domain, add its `/auth/callback` URL to Supabase’s redirect allowlist. Re-deploy after changing environment variables.
6. To enable moderators, create a normal user account first, then have a trusted project administrator add its user ID to `public.moderator_roles` using the Supabase SQL editor. Never expose this table to public signup or client-side writes.

The app will show an unconfigured state until valid Supabase settings are provided. Credentials are not included in this repository. Publishing source code alone does not create a live app or connect a database.

## Evidence and privacy

- Emails stay private; public reports use a chosen display name.
- Public locations are user-entered approximate labels. This version does not collect GPS coordinates.
- Camera access starts only when a user presses “Open camera.” Captures go to a private storage bucket. A sanitized image preview is created only if the submitter opts in; video and unapproved media remain private.
- The server checks file signatures and size, calculates SHA-256, and records receipt time. The client-supplied capture time is labeled as such and is not trusted as proof.
- Original evidence is available by short-lived signed URL to the submitting account and authorized moderators.
- Deletion currently records a request for human processing; it does not automatically erase a Supabase account. Explain and implement the retention workflow before public launch.
- The basic database rate limit is 12 witness reports per account per 24 hours. Production use should add broader abuse controls, backups, monitoring, and an operational deletion/moderation process.

## Event assessment score

The shared score is computed in Postgres and returned to every client; users cannot set it. The dial ranges from 0 to 5:

- Distinct account points: 0 for one account, 1 for two accounts, 2 for three or more.
- Capture provenance: 0.5 per eligible server-recorded capture, up to 1 point.
- Recency: 1 point when the latest server-received witness report is within six hours, 0.5 within 24 hours, otherwise 0.
- Moderator assessment: 1 point only when a moderator records corroboration; “under review” alone adds no points.
- Conflicting status: subtracts 1 point. The final result is bounded from 0 to 5.

The score is an evidence-and-corroboration summary, not a probability of truth. Multiple accounts do not prove independent sources, capture checks do not prove the depicted event is genuine, and a high score is not a guarantee. An event with no witness report has no score yet. Changes and the component values are kept in `assessment_history`.

## Limitations before public launch

The score and sample feed are explanatory prototype features, not a validated trust model. Email verification does not establish legal identity. Browser capture cannot prove the scene was unstaged or the device uncompromised. Public previews can still expose sensitive content, so review consent and retention carefully. Arrange a security and privacy review, backups, monitoring, incident response, and a clear moderation/deletion operation before inviting the public.
