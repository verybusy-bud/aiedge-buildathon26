# FieldNote

Reliable local information, without the noise. A simple Sioux Falls news and events app with food, traffic, special-event, and community filters. Reports about the same event appear together while each person's account stays separate.

## No Supabase required

This version runs a complete **browser-local simulation by default**. No account keys, database, migrations, email service, or environment file are needed.

```sh
pnpm install
pnpm dev --webpack
```

Open http://127.0.0.1:3000. Requires Node.js 20.9+ and pnpm 11.25.0.

## Try the full flow

1. Choose **Switch test account** and select a sample reporter, or create a display name and click **Confirm & continue** to simulate email confirmation. No real email or password is requested.
2. Choose **Report something**. Enter a headline, theme, approximate location and firsthand account. Use an existing event suggestion to keep reports together.
3. Try **Use sample capture** to exercise uploads without a camera. It creates an image labeled SIMULATED CAPTURE. Optionally consent to a public preview, then submit. Camera capture is also available on supported devices over HTTPS/localhost.
4. Switch to another reporter and add an account to the same event. The listing remains one story with separate reports and a recalculated context score.
5. Follow a story, flag a concern, and switch to **Review moderator → Review queue** to review it. Test corrections, appeals, quarantine/removal/restoration, and grouping duplicate listings.
6. Reload: reports, media and follows persist. Each tab has its own selected identity, so two tabs can demonstrate different accounts against the same browser-local records.
7. A test account can delete itself and its local reports/media from its account panel. No cloud backups are created.

## What is simulated

| Capability | Implementation |
|---|---|
| Accounts and confirmation | Local test identities and an in-app confirmation step; no email or password |
| Database | Browser localStorage, with mutation locks where supported |
| Media storage | IndexedDB blobs; no upload to a server |
| Upload intents | Local owner/report/expiry and one-time finalization checks |
| Provenance | Browser-calculated SHA-256 and local capture time, explicitly not server verification |
| Image previews | Browser re-encoding, with submitter consent |
| Grouping and scores | Same-event matching, separate accounts, distinct hashes, recency and moderator factors |
| Follows and updates | Local records with UI refresh and same-origin tab updates |
| Moderation | Test moderator, concerns, appeals, decisions, audit trail and restoration |
| Cleanup | Expired pending captures cleaned on activity; local account/media deletion |

**Limits:** This is not shared multi-user hosting. Each browser origin has its own records. Different devices, browsers, or visitors do not share reports. Test accounts and private-media access are workflow demonstrations, not secure authentication or confidentiality. Anyone with access to browser storage can inspect/change data. Use test information. Clearing browser/site data removes saved records; storage quotas and browser privacy settings apply. Downloaded/exported copies are outside the app.

Sample stories are illustrative, not current Sioux Falls news. The context score is not a truth guarantee or a validated credibility model. No AI detector is integrated.

## Put the simulation online

Import the GitHub repository into Vercel. Set Root Directory to `fieldnote` and Build Command to `pnpm build --webpack`. No Supabase settings are needed. Simulation defaults on when `NEXT_PUBLIC_SIMULATION_MODE` is unset; you may explicitly set it to `true`. Redeploy after environment changes. See [CLOUD-SETUP.md](CLOUD-SETUP.md).

## Optional real backend

The previous Supabase server routes, authorization, SQL migrations, storage processing, and cleanup scripts remain available, but the simulation does not call them. Only an explicit `NEXT_PUBLIC_SIMULATION_MODE=false` opts into live services. See [LIVE-BACKEND.md](LIVE-BACKEND.md) for the separate setup and launch requirements. Live auth/storage have not been validated against a real project in this workspace.

## Design and source

Brand red: **#70020F**. Headings use locally bundled Anton under the included SIL Open Font License. Body text uses Arial Unicode MS where installed, with Arial fallback. No external font requests. Technical information is linked from `/about` and collapsed by default.

Repository: https://github.com/aiedge-buildathon-2026/team17-natural-intelligence

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build --webpack
```

Tests cover scoring, search/themes, database behavior for the optional backend, and the simulation's grouping, persistence serialization, moderation, appeals, identity checks, limits and deletion. See [VALIDATION.md](VALIDATION.md) for browser checks and remaining limits.
