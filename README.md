# LiteAPI Booking Website

A modern hotel booking application built with Next.js 14, powered by LiteAPI.

## Features

- 🔍 Search hotels by destination or AI-powered vibe search
- 📅 Smart date pickers with auto-adjustment
- 🏨 Hotel details with reviews and sentiment analysis
- 💳 Integrated payment via LiteAPI Payment SDK
- 📱 Responsive dark theme design

## Environment Variables

**Never commit real API keys.** Use `.env.local` (gitignored) for local development.

Copy from `.env.example` and set values:

```env
# Required for Phase 2 (guest vs logged-in keys)
LITEAPI_KEY_B2C=your_b2c_public_key_here
LITEAPI_KEY_CUG=your_cug_key_here

# Optional fallback if you only set one key
# LITEAPI_API_KEY=...

# Payment (this one is public, used in browser)
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
# NEXT_PUBLIC_LITEAPI_ENV=live
```

- **B2C key** is used for **guests** (not logged in).
- **CUG key** is used for **logged-in** users.
- Keys are read **only on the server** (API routes); they are never sent to the browser.

## Local Development

```bash
npm install
cp .env.example .env.local   # then edit .env.local with your real keys
npm run dev
```

Visit `http://localhost:3000`

### Testing B2C vs CUG (Phase 2)

1. **Guest (B2C):** Open the app in an incognito window (or log out). Search for a hotel (e.g. destination + dates). Requests use `LITEAPI_KEY_B2C`.
2. **Logged-in (CUG):** Log in via `/login`, then run the same search. Requests use `LITEAPI_KEY_CUG`.
3. **Checkout:** Complete a search → hotel → room → checkout. Prebook and book use the same key as the session (B2C if guest, CUG if logged in).

If keys are missing, the API will return an error; check that `.env.local` has both `LITEAPI_KEY_B2C` and `LITEAPI_KEY_CUG` set.

## Deployment (Replit)

1. Import this repository to Replit
2. Add **Secrets**: `LITEAPI_KEY_B2C`, `LITEAPI_KEY_CUG` (and optionally `LITEAPI_API_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_LITEAPI_ENV`)
3. Click "Run" - Replit will automatically install dependencies

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- LiteAPI for hotel data & payments
