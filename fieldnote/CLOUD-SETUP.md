# Put Fieldnote online

This guide applies to this project's updated dark-red version. GitHub holds source code; Vercel runs the website; Supabase stores accounts, reports, and private media. All users visit the same Vercel URL and create their own Fieldnote accounts. They do not need GitHub or Supabase accounts.

## 1. Put the updated code in GitHub

Repository: https://github.com/aiedge-buildathon-2026/team17-natural-intelligence

The supplied archive expands into a folder named `fieldnote`. For an existing team repository, keep that folder intact inside the repository rather than overwriting an earlier app.

Using GitHub Desktop:

1. Sign in to the GitHub account with write access to the team repository.
2. Choose **File → Clone repository**, select the repository or paste its URL, and choose a local folder.
3. Create a branch named `fieldnote-cloud` so the team can review the updated version.
4. Extract the updated `fieldnote-source.zip` outside the clone. Copy its `fieldnote` folder into the cloned repository. It should appear as `team17-natural-intelligence/fieldnote/package.json`, with `app`, `public`, `lib`, and `supabase` alongside that file.
5. Review the changed files in GitHub Desktop, commit with a message such as “Update Fieldnote design and cloud setup,” and publish the branch. Open and merge a pull request after team review.

Alternatively, GitHub's **Add file → Upload files** can upload the extracted source folder, including its subfolders. Upload the contents, not the ZIP file alone. GitHub's browser uploader does not apply `.gitignore`: never upload `node_modules`, `.next`, `.env.local`, credentials, or private evidence. The supplied source ZIP excludes dependencies, build output, and local credentials.

If your team instead deliberately installs the application at repository root, `package.json` should be at the root and Vercel's Root Directory should be `./`. This guide assumes the safer nested `fieldnote/` layout for an existing repository.

The bundled GitHub Actions workflow assumes this application is the repository root. For a nested app, place the workflow under the repository-root `.github/workflows/`, set `defaults.run.working-directory: fieldnote`, and set setup-node's `cache-dependency-path: fieldnote/pnpm-lock.yaml`. A workflow left only inside `fieldnote/.github/` will not run automatically.

## 2. Create a Supabase project

1. Sign in at https://supabase.com/dashboard and create a new project for this pilot. Save the database password privately; the website does not need that password as an environment variable.
2. Wait until the project is ready.
3. Open **SQL Editor** and run each of these files, one at a time, in order:
   - `fieldnote/supabase/migrations/001_core.sql`
   - `fieldnote/supabase/migrations/002_assessment.sql`
   - `fieldnote/supabase/migrations/003_private_uploads.sql`
4. Confirm both Storage buckets exist and are private: `evidence-originals` and `evidence-previews`.
5. In **Authentication**, allow new signups, enable email/password, and require email confirmation.

These migrations are for a fresh database. If you already have Fieldnote tables, do not rerun them or delete existing tables. Compare the schemas first and use forward migrations or a separate pilot project.

## 3. Configure signup email delivery

Set up a custom SMTP sender in Supabase Authentication settings using an email service with SMTP support. Enter its host, port, username, password, and authorized sender address in Supabase. Follow the email provider's domain/sender verification instructions.

This is needed for people outside the Supabase project team: Supabase's built-in test sender restricts delivery to pre-authorized team addresses and has a low rate limit. Keep email confirmation enabled. Verify a real confirmation email can reach an ordinary participant before inviting the group.

Official instructions: https://supabase.com/docs/guides/auth/auth-smtp

## 4. Import the GitHub repository into Vercel

1. Sign in at https://vercel.com and add/import a new project from GitHub.
2. Authorize access to `aiedge-buildathon-2026/team17-natural-intelligence` and select it.
3. Set **Root Directory** to `fieldnote` if you followed the nested-folder layout above.
4. Use the **Next.js** framework preset and Node.js 24.
5. Set **Install Command** to `pnpm install --frozen-lockfile` and **Build Command** to `pnpm build --webpack`. Keep the framework's default output settings.
6. Add the environment variables below before deploying. Choose the environments you intend to use, especially Production.

| Variable | Value to enter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon/publishable API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-only service-role key; this is privileged |
| `NEXT_PUBLIC_SITE_URL` | Your final Vercel HTTPS URL; update and redeploy once assigned |
| `NEXT_PUBLIC_DEMO_MODE` | `false` — required for real accounts and submissions |
| `CRON_SECRET` | A long, randomly generated private secret for maintenance |

Get project API values from Supabase's Connect/API settings. Never use a privileged secret as the public key. Never put the service-role key in GitHub, give it a `NEXT_PUBLIC_` prefix, or paste it into a public message. Enter it directly in Vercel's environment settings.

Deploy. Once Vercel assigns the URL, set `NEXT_PUBLIC_SITE_URL` to that exact `https://...vercel.app` address and redeploy. Public environment variables are set at build time; editing them does not change an already-built deployment.

If using a custom domain, add it in Vercel, then use that origin consistently below.

## 5. Connect the production confirmation callback

In Supabase **Authentication → URL Configuration**:

- **Site URL:** your exact production origin, such as `https://YOUR-PROJECT.vercel.app`.
- **Redirect URLs:** add `https://YOUR-PROJECT.vercel.app/auth/callback`.
- For local development, also add `http://127.0.0.1:3000/auth/callback` and/or `http://localhost:3000/auth/callback` if used.

Use the actual domain, without placeholder text. Add a separate exact callback for any staging URL you will test. Confirm signups are allowed and email confirmation is enabled. If a custom email template was edited previously, verify it follows the configured Supabase confirmation flow.

Official guide: https://supabase.com/docs/guides/auth/redirect-urls

## 6. Prove different accounts work

1. Visit the deployed URL. It must show the live Sioux Falls pilot, **not “Demo preview”** or “Connection needed.” A fresh live database should have an empty feed.
2. Choose **Join the community → Create an account**. Use a real email, a chosen display name, and a password of at least 12 characters.
3. Open the confirmation email in the same browser used to sign up. Sign in if asked.
4. Share an observation. Test a camera photo, opt into a public preview only if appropriate, and submit.
5. On a second browser/profile or another device, create and confirm a different account using a different email. Add that person's own account to the same event.
6. Verify the reports remain separate and the assessment factors reflect two accounts. Confirm the first person's email and private original are not available to the second account or a signed-out viewer.
7. Try submitting a second report from the same account on the same event. It should require a correction rather than create a duplicate.

If signup says “Email address not authorized,” fix SMTP. If confirmation redirects to localhost, fix Site URL and redirects. If the site still says demo, set `NEXT_PUBLIC_DEMO_MODE=false` in the correct Vercel environment and redeploy. If the feed cannot load, check all three migrations and all three Supabase connection values in Vercel.

## 7. Set up moderation and ongoing maintenance

After a trusted operator creates and confirms their own account, find its UUID in Supabase Authentication and run this in SQL Editor with the real UUID:

```sql
update public.profiles set role = 'admin' where id = 'CONFIRMED-USER-UUID';
```

That account receives the review queue. Do not let users select their own moderator role.

Configure a trusted scheduler to POST `https://YOUR-DOMAIN/api/maintenance` every five minutes with header `Authorization: Bearer YOUR_CRON_SECRET`. The endpoint accepts POST; do not assume a GET-only scheduler will call it correctly. It records time-based score history and removes expired abandoned uploads. The feed itself computes current scores when read even if maintenance has not run.

Before wider public access, adopt the retention/moderation policies in README, configure backups and monitoring, verify deletion cleanup, and review privacy/security and accessibility. A connected private pilot is a useful next milestone; a successful deployment alone does not complete those operations.

## Branding and About page

- Exact brand red: `#70020F`.
- Anton headings: served locally, with its bundled license in `public/fonts/Anton-OFL.txt`.
- Body: `Arial Unicode MS`, then Arial and system sans-serif. Arial Unicode MS is used when installed on the visitor's device; it is not redistributed.
- `/about` explains the architecture, assessment, media provenance, privacy, moderation, and current limits, and links to the confirmed team repository.

References: https://vercel.com/docs/getting-started-with-vercel · https://vercel.com/docs/environment-variables · https://supabase.com/docs/guides/auth/passwords
