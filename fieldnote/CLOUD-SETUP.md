# Deploy FieldNote without Supabase

The current version is a browser-local simulation. Vercel serves the website; visitors' browsers simulate accounts, records, uploads, moderation, and deletion. No Supabase project or database setup is required.

1. In Vercel, import `aiedge-buildathon-2026/team17-natural-intelligence` from GitHub.
2. Set **Root Directory** to `fieldnote`.
3. Use the **Next.js** preset and Node.js 24.
4. Set **Install Command** to `pnpm install --frozen-lockfile` and **Build Command** to `pnpm build --webpack`.
5. No environment variables are required. `NEXT_PUBLIC_SIMULATION_MODE` defaults to simulation when unset; explicitly set it to `true` if desired. If an older deployment sets it to `false`, change it to `true` and redeploy.
6. Deploy. If the repository is already connected, push changes to the deployment branch and let Vercel redeploy, or trigger a redeployment in its dashboard.
7. Open the deployed URL. It should show **Interactive simulation**. Use **Switch test account**, or create and confirm a test name. Try a report with **Use sample capture**, then switch identities to contribute another report or moderate.

No Supabase keys, SQL migrations, SMTP sender, or email callback URLs are required for this version. Existing Supabase settings are ignored by the simulation; do not expose privileged keys in public environment variables.

**Important distinction:** Different visitors do not share a backend. Each browser has its own saved records and simulated accounts. Tabs on the same browser origin share records, while each tab can select a different test identity. Clearing site data clears the simulation. A genuine shared local-news service would require a separately configured shared backend and real authentication.

For the optional live-service path, use [LIVE-BACKEND.md](LIVE-BACKEND.md). It is not part of this simulation deployment.
