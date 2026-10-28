# team17-natural-intelligence
AiEdge Buildathon 2026 · Team 17: Natural Intelligence

## Fieldnote

The updated Fieldnote application is in [`fieldnote/`](fieldnote/), with the #70020F design, Anton headings, private evidence handling, and a technical About page.

- [Cloud setup: GitHub, Supabase, and Vercel](fieldnote/CLOUD-SETUP.md)
- [Application documentation](fieldnote/README.md)
- [Validation and remaining launch requirements](fieldnote/VALIDATION.md)

For Vercel, set **Root Directory** to `fieldnote` and **Build Command** to `pnpm build --webpack`. Configure Supabase and set `NEXT_PUBLIC_DEMO_MODE=false` to enable real accounts and reporting. Keep all server credentials in deployment environment settings.

The earlier application remains in `how/`.
