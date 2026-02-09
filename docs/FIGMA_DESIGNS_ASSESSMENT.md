# Figma Designs Folder – Assessment & Implementation Scope

**Purpose:** Study and assess the `figma designs/` folder. The **app is the source of truth**; this doc scopes what would be needed to bring the app’s UI in line with these designs without breaking existing behavior. **No implementation**—assessment only.

---

## 1. What’s in the Figma Designs Folder

### 1.1 Structure

- **Root:** `Guidelines.md`, `ATTRIBUTIONS.md`, `package.json`, `vite.config.ts`, `postcss.config.mjs`, logo assets (`Logo Full.png`, `Logo Small.png`).
- **Design system:** `src/styles/` — `theme.css`, `fonts.css`, `index.css`, `tailwind.css` (brand colors, typography, CSS variables).
- **App shell:** `src/app/App.tsx` — single-page state machine: `home` → `search` | `listings` | `detail` | `checkout` | `confirmation`.
- **Page components (design reference):**
  - `HomePage.tsx` — hero, search card, popular destinations, featured hotels, footer, bottom nav.
  - `SearchModal.tsx` — full-screen search: Where / When / Who steps; recent searches; date picker; room/guest selector.
  - `ListingsPage.tsx` — results list with filters, hotel cards, map button, bottom nav.
  - `HotelDetailPage.tsx` — gallery, tabs (Rooms & Rates, About, Amenities, Reviews, Location), room cards, price summary.
  - `CheckoutPage.tsx` — hotel summary, stay dates, guest details, promo code, payment (card), price breakdown.
  - `ConfirmationPage.tsx` — success state, booking reference, hotel card, check-in/out, actions (View, Download, Calendar), “What’s Next”.
- **Shared design components:**
  - `BrandLogo.tsx` — icon vs full wordmark; sizes sm/md/lg; “Journeys by Breadfast” (note: design says “Breadfast”, app uses “Breakfast” — confirm which is correct).
  - `figma/ImageWithFallback.tsx` — image with error fallback (inline SVG placeholder).
- **UI library:** `src/app/components/ui/` — shadcn-style components (button, input, badge, calendar, dialog, etc.); many are unused in the design pages but available.

### 1.2 Design System (from `theme.css` and components)

- **Brand colors:** Primary `#057A5A`, hover `#046349`, dark text `#20373A`, light bg `#F6F6F6`, accent `#4EABBB`, border `#ABC5D1`.
- **Typography:** Delight / Outfit; 28/22/18/16/14/12px scale; semibold labels.
- **Layout:** Light background (`#F6F6F6`), white cards, rounded-2xl/3xl, full-width bottom nav, optional topographic background (asset ref in App.tsx).
- **CTAs:** Primary green buttons (`#057A5A`), pill/rounded-full for key actions; teal used in Figma for accents (e.g. `teal-600` in Listings/Detail/Checkout/Confirmation) — align with `--primary` for consistency.

- **Design philosophy — menus and cards:** We never want menus or cards to blend with the background. Whenever the user is on a “menu” (dropdown, modal step, date picker, room selector, etc.), use a **subtle hover and/or border effect** so interactive areas are visually distinct from the page. Apply to search modal bars, calendar, room cards, and any future panels.

### 1.3 Attribution

- **ATTRIBUTIONS.md:** shadcn/ui (MIT), Unsplash (photos). No change to app licensing if we only adopt patterns/colors/layout from the design code.

---

## 2. App vs Figma: Route & Flow Mapping

| Figma (state)   | App route              | Notes |
|-----------------|------------------------|--------|
| home            | `/` (app/page.tsx)     | App has place/vibe search, date range, occupancy; no hero, no “Popular Destinations” or “Featured Hotels”. |
| search          | (no dedicated route)   | App: destination + dates + occupancy on home and in results; no full-screen “SearchModal” with Where/When/Who steps. |
| listings        | `/results`             | Same intent; different layout, filters, and card design. |
| detail          | `/hotel/[hotelId]`     | Same intent; app has real API, room groups, expand/collapse; design has static tabs and room block. |
| checkout        | `/checkout`            | Same intent; app has prebook, guest form, payment; design is static layout reference. |
| confirmation    | `/confirmation`       | Same intent; app reads booking from API/params; design is static success UI. |

The Figma flow is **state-driven (useState)** in one App; the app is **URL-driven (Next.js)** with API calls and real data. Any implementation must preserve URL-based routing, search params (checkin, checkout, occupancies, placeId, etc.), and existing API contracts.

---

## 3. Scope: What Would Be Needed (Without Breaking the App)

### 3.1 Global / Shell

- **Layout & theme**
  - Introduce design tokens (e.g. from `theme.css`) into the app: primary/secondary colors, typography scale, radius. Option: merge into `app/globals.css` or a shared `theme.css` import.
  - Switch from current dark slate (`bg-slate-950`, `text-slate-50`) to light theme (`#F6F6F6` background, `#20373A` text) **or** keep dark and only adopt components/patterns — decision needed.
- **Layout container**
  - App uses `max-w-md mx-auto` in `layout.tsx`; design assumes similar mobile-first width. No structural change required; optional topographic background is a design enhancement.
- **Header**
  - Replace or restyle `AppHeader` to match design: BrandLogo (icon) left, user/account right; ensure locale/currency and auth still work (design shows a single “Users” icon).
- **Bottom navigation**
  - Design has a 3-item bottom bar (Explore, Wishlist, Log in). App has no bottom nav. Adding it would require: route highlighting, links to `/`, wishlist (if any), and login/account — and hiding or reusing the current header actions (locale, currency, user).
- **Footer**
  - Design home has a footer (logo, tagline, Explore/Support links, social, copyright). App has no footer. Optional; likely only on home or a few pages.

### 3.2 Home (`/`)

- **Current:** Form-focused (place/vibe, dates, occupancies) and submit to `/results`.
- **Design:** Hero image, headline, search card (destination, check-in/out, guests), “Popular Destinations”, “Featured Hotels”.
- **Scope:**
  - Add hero + headline + search card **around** existing form (or replace form UI with card-style layout while keeping same state and submit behavior).
  - “Popular Destinations” and “Featured Hotels” are static in design; in app they could be static, or driven by API/config later — low risk.
  - No change to current search logic (placeId, checkin, checkout, occupancies) or navigation to `/results`.

### 3.3 Search (Where / When / Who)

- **Current:** Destination + dates + occupancies on home; `DateRangePicker` and `RoomSelector` in app; no full-screen modal.
- **Design:** Full-screen SearchModal with steps: Where (recent + suggested + typeahead), When (horizontal calendar, date type tabs), Who (rooms + adults/children per room).
- **Scope:**
  - If adopting the modal: implement as a client component (e.g. `SearchModal`) that reads/writes the same URL params or context (placeId, placeName, checkin, checkout, occupancies). Opening “Where are you going?” could open this modal instead of inline input; form submit still goes to `/results?...`.
  - Reuse or align with existing `DateRangePicker` and `RoomSelector` so date and occupancy logic stay single source of truth; only the “When” and “Who” **layout** would mirror the design.
  - Recent/suggested destinations: optional; can be static or later wired to API.

### 3.4 Listings (`/results`)

- **Current:** Real search API, hotel list, filters/sort, hotel cards with price/rating/refundability, link to `/hotel/[hotelId]`.
- **Design:** Filter pills (Price, Star Rating, Guest Rating, Free), card layout with image, rating badge, amenities icons, cancellation, price.
- **Scope:**
  - Restyle cards and header to match design (layout, typography, colors, rating badge).
  - Map button: design has a floating “MAP” button; app may or may not have map — add only if desired.
  - Bottom nav: if added globally, show here with “Explore” (or “Search”) active.
  - **Do not** change: data shape, API usage, URL params, or navigation to `/hotel/[hotelId]`.

### 3.5 Hotel Detail (`/hotel/[hotelId]`)

- **Current:** Real details + rates, grouped room types, expand/collapse, select offer → checkout. Already aligned with `IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md` (grouped rooms, displayName “Nx …”, etc.).
- **Design:** Gallery, thumbnails, tabs (Rooms & Rates, About, Amenities, Reviews, Location), room blocks, price summary, “Continue to Checkout”.
- **Scope:**
  - Visual alignment: gallery and thumbnails style, tab bar, room card look (image, name, bed, amenities, cancellation, price), primary button style.
  - Keep existing: room grouping, offer selection, navigation to `/checkout` with all current params and prebook flow.
  - “About” / “Amenities” / “Reviews” / “Location”: use existing `HotelDetails` and API data where available; design is a layout/content reference.

### 3.6 Checkout (`/checkout`)

- **Current:** Prebook-based, hotel summary, stay dates, guest form, payment (LiteAPI), price breakdown, “Complete Booking”.
- **Design:** Same sections in a slightly different order/look: hotel card with image, stay dates, guest details, promo code, payment block, price breakdown.
- **Scope:**
  - Align with **Part 2 of IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md** (Booking-style summary: hotel header with image/address/rating, “Your Rooms” with room line + occupancy + cancellation + average per room/night, price breakdown with “X rooms x Y nights” and “Pay now”).
  - Restyle to design: card borders, typography, primary button; keep all existing prebook/guest/payment logic and API calls.
  - No removal of current fields or flow.

### 3.7 Confirmation (`/confirmation`)

- **Current:** Reads booking (and guest) from URL/API/storage, shows status and details.
- **Design:** Success icon, “Booking Confirmed!”, booking reference, hotel card, check-in/out, room, total paid, “View Booking”, “Download Receipt”, “Add to Calendar”, “What’s Next”.
- **Scope:**
  - Restyle to match design; ensure booking reference, hotel name, dates, room, total paid come from existing confirmation data.
  - Actions: “View Booking Details”, “Download Receipt”, “Add to Calendar” — implement only if/when backend or client logic exists; otherwise placeholder or hide.

### 3.8 Shared Components

- **BrandLogo**
  - Add to app (or reuse from design folder): icon + full wordmark, sizes. Fix “Breadfast” vs “Breakfast” with product.
- **ImageWithFallback**
  - App already uses real images (and possibly Next.js `Image`); add a small fallback component only if we want the same error state as design.
- **Design system**
  - Buttons, inputs, labels: app may use Tailwind only; optionally introduce shadcn-style components (button, input, label) and theme variables so Figma’s look is consistent. Risk: avoid duplicating form behavior (e.g. validation, submission).

---

## 4. Dependencies & Risks

- **Existing plan:** `IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md` already defines checkout summary and hotel page room grouping. Figma design should be treated as **visual reference** for that plan, not a second source of truth for data or flow.
- **Auth / locale / currency:** Design does not show header locale/currency selectors or login flow. Any restyle of header or bottom nav must preserve or re-home these (e.g. in profile/wishlist or a menu).
- **Routing:** All navigation must stay Next.js-based (Link, router.push, search params). No in-memory state machine like the Figma App.
- **APIs:** No new API contracts; only UI and layout. Prebook, book, hotel details, rates, places — unchanged.
- **Responsiveness:** Design is mobile-first (max-width style). App is already `max-w-md`; keep that and test on small/large viewports when applying new styles.

---

## 5. Suggested Implementation Order (When You Implement)

1. **Theme and tokens** — Add design tokens (colors, type, radius) and optionally light theme; keep existing layout structure.
2. **Header and branding** — BrandLogo, header layout; keep auth + locale + currency.
3. **Home** — Hero + search card + optional destinations/hotels sections without changing search logic.
4. **Results** — Card and filter restyle only.
5. **Hotel detail** — Visual alignment with design; keep grouped rooms and offer selection.
6. **Checkout** — Align summary and layout with IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT Part 2 + design.
7. **Confirmation** — Restyle; wire actions if backend/client support exists.
8. **Search modal (optional)** — Where/When/Who full-screen flow if desired; must sync with existing params and components.
9. **Bottom nav and footer (optional)** — Add and wire routes/actions.

---

## 6. Summary

- **Figma folder:** Self-contained Vite + React design reference with theme, page components, and shadcn-style UI. Not wired to the app’s APIs or routing.
- **App remains source of truth:** URLs, params, API usage, auth, locale, currency, and booking flow stay as they are.
- **Implementation = adopt design system and restyle pages** so that layout, colors, typography, and components match the design, without changing data flow or behavior. The most sensitive areas are header (auth/locale/currency), checkout (prebook/payment), and any new bottom nav or search modal (must stay in sync with existing state/URLs).

No code changes were made; this document is for planning only.
