# Connect Fieldnote to Supabase

Fieldnote already contains the shared-service code for email accounts, reports, source-linked stories, and private evidence uploads. The hosted site currently runs its browser-only simulation. Connecting Supabase turns that off and makes confirmed accounts and reports available from every device.

## Before you start

You said this Supabase project has no Fieldnote SQL migrations yet. That means it can receive the full migration sequence once, in order. These migrations create the app schema, access controls, upload handling, grouping and monetization tables, and seven source-linked starter stories. The starter stories contain source-linked editorial summaries and zero witness reports.

Keep the Supabase project dashboard open. Do not send any keys in chat. In particular, the service-role key must stay private.

## 1. Create the database tables

1. In Supabase, open your Fieldnote project and select **SQL Editor**.
2. Choose **New query**.
3. Open each file from `fieldnote/supabase/migrations` in the GitHub repository, copy its full contents, paste it into a new SQL Editor query, and click **Run**.
4. Run them in this exact order, waiting for a success result each time:
   - `001_core.sql`
   - `002_assessment.sql`
   - `003_private_uploads.sql`
   - `004_local_news_grouping.sql`
   - `005_monetization.sql`
   - `006_editorial_starter_events.sql`

Do not run a later file before an earlier one. If any query reports an error, stop and share a screenshot of the error with secrets hidden; do not rerun earlier migrations blindly.

## 2. Enable verified email accounts

1. In Supabase, open **Authentication → Providers → Email** and enable email/password sign-in.
2. Require email confirmation.
3. Open **Authentication → URL Configuration**. Set the Site URL to `https://bylm.vercel.app`.
4. Add this redirect URL exactly: `https://bylm.vercel.app/auth/callback`.
5. Configure email delivery under Authentication. Before public signup, connect an SMTP sender you control; the default sender may have low-volume/testing limits.

People must confirm their email before reporting. Each confirmed account has its own profile; its reports are shared through the same project database.

## 3. Connect Vercel to the GitHub source

The Vercel project must deploy the current repository: `aiedge-buildathon-2026/team17-natural-intelligence`. The Fieldnote app lives in its `fieldnote` folder. In Vercel, check **Settings → Git** and confirm that repository and production branch `main` are selected. Set **Root Directory** to `fieldnote`, framework to **Next.js**, and build command to `pnpm build --webpack`.

## 4. Add the Supabase settings to Vercel

In Vercel, open the Fieldnote project’s **Settings → Environment Variables**. Add these for **Production** (and Preview if you want to test preview deployments):

| Name | Value to copy from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret; mark it sensitive and never prefix it with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | `https://bylm.vercel.app` |
| `NEXT_PUBLIC_SIMULATION_MODE` | `false` |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `CRON_SECRET` | A new, long random value kept private |

Paste the service-role key only into Vercel’s private environment-variable field. Never put it in GitHub, a public page, or chat. Do not add Stripe settings unless you are intentionally setting up payments.

## 5. Redeploy and check it

1. Save the environment variables and redeploy the latest `main` commit from Vercel.
2. Open `https://bylm.vercel.app` and confirm the simulation banner and sample-account controls are gone.
3. Create an account with your email and confirm the message arrives. Sign in after confirming.
4. Open a starter story and submit one firsthand report. Open Fieldnote on another device, sign in with a separate confirmed email, and check that the same story and report appear there. New reports refresh automatically about once per minute.

The seven starter summaries are inserted into the shared database by migration 006, so they appear on all devices. User reports and captured evidence are saved centrally; the evidence originals remain private.

## If a step looks different

Supabase and Vercel may update their dashboard labels. Send me a screenshot of the page you are on, with project keys, email addresses, and tokens hidden, and I can guide you from that exact screen.
