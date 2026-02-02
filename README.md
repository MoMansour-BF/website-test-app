# LiteAPI Booking Website

A modern hotel booking application built with Next.js 14, powered by LiteAPI.

## Features

- 🔍 Search hotels by destination or AI-powered vibe search
- 📅 Smart date pickers with auto-adjustment
- 🏨 Hotel details with reviews and sentiment analysis
- 💳 Integrated payment via LiteAPI Payment SDK
- 📱 Responsive dark theme design

## Environment Variables

Create a `.env.local` file with:

```env
LITEAPI_API_KEY=your_liteapi_key_here
NEXT_PUBLIC_LITEAPI_ENV=live  # or "sandbox" for testing
```

## Local Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

## Deployment (Replit)

1. Import this repository to Replit
2. Add environment secrets (LITEAPI_API_KEY, NEXT_PUBLIC_LITEAPI_ENV)
3. Click "Run" - Replit will automatically install dependencies

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- LiteAPI for hotel data & payments
