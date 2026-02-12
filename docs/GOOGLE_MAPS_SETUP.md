# Google Maps API Setup

## API Keys

1. **Create API Key**
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Create API key with name "Hotel Booking Website - Places & Maps"

2. **Enable APIs**
   Required:
   - Places API (New) - for autocomplete and place details
   - Maps JavaScript API - for map rendering

   Optional:
   - Geocoding API - for reverse geocoding (future)

3. **API Restrictions**
   - Application restrictions: HTTP referrers
     - Add your production domain(s)
     - Add localhost:3000 for development
   
   - API restrictions: Restrict key to:
     - Places API (New)
     - Maps JavaScript API

4. **Billing**
   - Places Autocomplete: $2.83 per 1000 sessions
   - Places Details: Included in session (with session token)
   - Monthly free quota: $200 credit
   
   Cost optimization tips:
   - Always use session tokens (autocomplete + details = 1 charge)
   - Filter predictions client-side (reduce detail fetches)
   - Cache place details when possible

## Environment Variables

- **GOOGLE_MAPS_API_KEY** (server-only): Used by `/api/google-places/autocomplete` and `/api/google-places/details`. Set in `.env.local`. Never commit the raw key.
- **NEXT_PUBLIC_GOOGLE_MAPS_API_KEY** (client): Used by map components (results page, hotel page). Optional if you only need server-side Places; required for rendering maps in the browser.

You can use one API key for both server and client; restrict it by HTTP referrer and by the APIs listed above.

## Cost Estimates

Scenario: 10,000 monthly searches
- Autocomplete + Details: 10,000 sessions × $0.00283 = $28.30/month
- Well under $200 free monthly credit ✓

Scenario: 100,000 monthly searches
- Autocomplete + Details: 100,000 sessions × $0.00283 = $283/month
- After $200 credit: $83/month actual cost
