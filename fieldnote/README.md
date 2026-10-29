# Fieldnote

Reliable local information, without the noise. Fieldnote organizes Sioux Falls news and events, keeps reports about the same event together, and leaves each person's firsthand account separate.

## Presentation demo

The current presentation build uses browser-local simulation only. No Supabase connection, email confirmation, passwords, or payment credentials are used. Seven ready-to-select profiles are included: Cyber-Striker, Linkis, Prairie Walker, Park Walker, River Observer, Southside Neighbor, and Review Moderator. People can also create another local profile without email verification.

Reports, profiles, bookmarks, and image captures stay in that browser. On the Vercel presentation site, each browser has its own local records; different visitors and devices do not share data. The sample witness reports are for demonstration and are not real reports from Sioux Falls residents.

## Local development

Requires Node.js 20.9+ and pnpm 11.25.0.

```sh
pnpm install
pnpm dev --webpack
```

Open http://127.0.0.1:3000. The presentation build uses the same browser-local simulation.

## Starter stories

The feed includes seven source-linked Sioux Falls news stories and six pre-filled local event examples. New reports stay separate under the profile that submitted them.

## Trust and privacy

A corroboration score is context, not a truth guarantee. Multiple accounts may not be independent. The app does not currently include an AI detector. Camera evidence is checked for file type and provenance, but capture does not prove a scene is genuine. Source links stay attached to editorial summaries.

## Visual style and source

Brand red: **#70020F**. Headings use Anton; body text uses Arial Unicode MS where installed, with Arial fallback. Technical information is linked from `/about`.

Repository: https://github.com/aiedge-buildathon-2026/team17-natural-intelligence

## Optional backend work

Supabase and payment integrations remain in the repository for later, but this presentation build does not use them. `CLOUD-SETUP.md` describes the browser-local presentation setup. `LIVE-BACKEND.md` is retained as a separate future deployment reference.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm exec next build --webpack
```
