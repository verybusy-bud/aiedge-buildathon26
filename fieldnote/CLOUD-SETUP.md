# Fieldnote presentation setup

The presentation version runs entirely in the browser. It does not use Supabase, email delivery, Stripe, or server-side account storage.

## Create an account

Create a new account with a username, email address, and password. No confirmation email is sent. Passwords are hashed before saving in the browser. Sign in later with the same email and password. There are no preset accounts.

## What is saved locally

Text, profiles, and password hashes use browser storage. Captured media uses browser IndexedDB. Accounts and reports created in the same browser see the same local feed. Another device or browser has its own separate data; this version does not sync between visitors.

The sample reports are demonstration content, not real submissions by Sioux Falls residents. The seven source-linked news stories remain available in the feed.

## If the live presentation site needs a refresh

The current code sets presentation mode on and does not need environment variables. After the updated `main` branch deploys from Vercel, refresh `https://bylm.vercel.app`. If Vercel is not linked to this repository, import `aiedge-buildathon-2026/team17-natural-intelligence`, set its **Root Directory** to `fieldnote`, choose **Next.js**, and use `pnpm build --webpack` as the build command.

Browser data stays in that browser. Avoid clearing its site data before the presentation.
