# team17-natural-intelligence
AiEdge Buildathon 2026 · Team 17: Natural Intelligence

## Fieldnote

The updated Fieldnote application is in [`fieldnote/`](fieldnote/), with the #70020F design, Anton headings, a simple local-news feed, and a complete browser-local simulation. No Supabase project is required.

- [Deploy the no-backend simulation](fieldnote/CLOUD-SETUP.md)
- [Application documentation](fieldnote/README.md)
- [Validation and remaining launch requirements](fieldnote/VALIDATION.md)

For Vercel, set **Root Directory** to `fieldnote` and **Build Command** to `pnpm build --webpack`. Simulation is on by default. Test accounts, reporting, media, follows, moderation, and deletion run in the browser without backend setup. Separate visitors do not share records; see the application documentation for the simulation limits.

