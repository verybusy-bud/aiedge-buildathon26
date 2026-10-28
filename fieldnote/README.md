# Fieldnote

Reliable local information, without the noise. Fieldnote organizes Sioux Falls news and events, keeps reports about the same event together, and leaves each person's firsthand account separate.

## Shared accounts and reports

Fieldnote's hosted backend uses Supabase for email-confirmed accounts, PostgreSQL reports, and private evidence storage. For a new Supabase project, follow [CLOUD-SETUP.md](CLOUD-SETUP.md) and apply migrations 001–006 in order. The live backend code is already in place; hosting credentials and the database setup are still required.

To share reports across devices, the hosted app must use the real backend. Browser simulation is only for local development and keeps data inside that browser.

## Local development

Requires Node.js 20.9+ and pnpm 11.25.0.

```sh
pnpm install
pnpm dev --webpack
```

Open http://127.0.0.1:3000. By default, local development uses browser simulation. No real account or payment is created. To run against a configured Supabase project, set `NEXT_PUBLIC_SIMULATION_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false`, then configure the values in `.env.local` using `.env.example` as a guide. See [LIVE-BACKEND.md](LIVE-BACKEND.md).

## Starter stories

The first version includes seven source-linked Sioux Falls news stories. Each has an AI-written summary disclosure and a link to the published report. They start with zero firsthand reports; user accounts can add their own observations. Migration `006_editorial_starter_events.sql` seeds the same stories into Supabase for all visitors.

## Trust and privacy

A corroboration score is context, not a truth guarantee. Multiple accounts may not be independent. The app does not currently include an AI detector. Camera evidence is checked for file type and provenance, but capture does not prove a scene is genuine. Source links stay attached to editorial summaries.

## Design and source

Brand red: **#70020F**. Headings use locally bundled Anton under the included SIL Open Font License. Body text uses Arial Unicode MS where installed, with Arial fallback. No external font requests. Technical information is linked from `/about` and collapsed by default.

Repository: https://github.com/aiedge-buildathon-2026/team17-natural-intelligence

## Checks

```sh
pnpm typecheck
pnpm test
pnpm exec next build --webpack
```
