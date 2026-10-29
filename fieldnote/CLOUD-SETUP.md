# Fieldnote presentation setup

The presentation version runs entirely in the browser. It does not use Supabase, email verification, passwords, Stripe, or server-side account storage.

## Demo profiles

The sign-in panel offers these seven local profiles:

- Cyber-Striker
- Linkis
- Prairie Walker
- Park Walker
- River Observer
- Southside Neighbor
- Review Moderator

Choose a profile to post or review. You can also create a new profile without an email step. Profile changes and reports are saved in the browser for the presentation.

## What is saved locally

Text and profile data use browser storage. Captured media uses browser IndexedDB. The same browser can switch among the demo profiles and see their shared demo feed. Another device or browser has its own separate data; this version does not sync between visitors.

The sample reports are demonstration content, not real submissions by Sioux Falls residents. The seven source-linked news stories remain available in the feed.

## If the live presentation site needs a refresh

The current code sets presentation mode on and does not need environment variables. After the updated `main` branch deploys from Vercel, refresh `https://bylm.vercel.app`. If Vercel is not linked to this repository, import `aiedge-buildathon-2026/team17-natural-intelligence`, set its **Root Directory** to `fieldnote`, choose **Next.js**, and use `pnpm build --webpack` as the build command.

Browser data stays in that browser. Avoid clearing its site data before the presentation.
