# Hotel Detail Page Revamp – Implementation Plan

**Scope:** `/hotel/[hotelId]` — UI/UX enhancements, room selection overhaul, search bar integration, and design system alignment. **No implementation in this doc; plan only.**

**References:**
- **Brand & design:** [FIGMA_DESIGNS_ASSESSMENT.md](./FIGMA_DESIGNS_ASSESSMENT.md) (design system, app vs Figma mapping)
- **Room grouping & checkout:** [IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md](./IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md) (grouping by `mappedRoomId`, RoomGroup/RoomTypeOffer model)
- **Figma reference:** `figma designs/src/app/components/HotelDetailPage.tsx` (gallery, tabs, room blocks, rating badge, CTA)

---

## 0. Brand Language (Design System)

Apply consistently across all new or updated hotel-detail components.

| Token / area | Value / guidance |
|--------------|------------------|
| **Primary** | `--primary: #057A5A`, hover `--primary-hover: #046349` (from `app/globals.css`) |
| **Text** | `--dark-text: #20373A`; muted `--muted-foreground: #6B7280` |
| **Background** | `--light-bg: #F6F6F6`; cards white or subtle border |
| **Accent / border** | `--ocean-blue: #4EABBB`, `--sky-blue: #ABC5D1` (Figma: teal accents → align with `--primary` for CTAs) |
| **Typography** | `font-family: 'Delight', 'Outfit', -apple-system, …`; scale 28/22/18/16/14/12px; semibold labels |
| **Radius** | `--radius: 0.75rem`; cards/sheets: rounded-2xl/3xl as in Figma |
| **Menus & cards** | Interactive areas (dropdowns, modals, room cards) must **not** blend with background — use subtle border and/or hover so they are visually distinct (per FIGMA_DESIGNS_ASSESSMENT §1.2). |
| **CTAs** | Primary green buttons; pill/rounded-full for main actions; use CSS variables, not raw teal classes. |

**App as source of truth:** Routing (Next.js, URL params), APIs, auth, locale, currency, and booking flow stay unchanged. Figma is **visual reference** only.

---

## How to Use This Plan

**Phases are in execution order.** Complete Phase 1 first, then **Phase 1.5** (modal refinements), then 2, 3, 4, 5. Each phase has a clear outcome before moving to the next. Within a phase, do the tasks in the order listed (later tasks often depend on earlier ones).

**Status:** Phase 1 and Phase 1.5 are implemented. Phases 2–5 (and the considerations below) remain for future work.

---

## Vital Considerations (Apply in Later Phases)

These are not tied to a single phase but must be kept in mind and can be implemented or reinforced in later phases. They are critical for clarity and correctness.

- **Number of rooms visible at every step:** Ensure the room count (e.g. "1 room", "2 rooms", or "for X room(s)") is clear throughout the flow: in the search/date bar, in the price context line above room cards ("Prices are total for Y nights for **Z room(s)**"), in the room detail modal (e.g. when showing "From EGP X total" or rate cards), and on checkout. Users should never be unsure how many rooms their selection or price refers to.

- **Taxes and pay-at-property unchanged and apparent:** Keep the existing logic for **taxes included** vs **pay at property** (sum of `taxesAndFees` where `included: false`) exactly as implemented. Surface it clearly wherever prices are shown: e.g. "incl. taxes & fees", "+ taxes & fees", or "(+ EGP X taxes and fees at property)" on rate cards, in the room modal, and in checkout. Do not remove or hide this distinction when adding new UI (e.g. rate customization or new card layouts).

---

## PHASE 1: Room Selection (Data + Core UX)

**Outcome:** Room rates are correct and non-duplicated; users choose rooms via horizontal cards and a detail sheet.

### 1.1 Fix Room Rate Deduplication Logic

**Current behavior:** Grouping is by `mappedRoomId` (one card per room type). Each `roomType` from the API contributes one offer; the API can return multiple `roomTypes` for the same room with the same board + refundability but different `offerId`, leading to duplicate-looking rows (e.g. two "Room Only Non-Refundable" for the same room).

**Target behavior:**

- **Group by room type:** Keep grouping by `mappedRoomId` (one card per room type) per IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.
- **Within each room group, deduplicate by rate tier:** Define a "tier" as a combination of **board type + refundability** (e.g. `boardName` + `refundableTag` or normalized cancellation label). For each tier, keep **only the cheapest offer** (by `totalAmount`).
- **Sort offers within a room:** Apply a consistent order, e.g.:
  1. Room Only (Non-refundable)
  2. Room Only (Refundable)
  3. Breakfast Included (Non-refundable)
  4. Breakfast Included (Refundable)
  5. Half Board, Full Board, etc. (then by refundability within each)

**Implementation notes:**

- Build `roomGroups` from `ratesData` as today; then for each group's `offers` array: group by tier key, take `min(totalAmount)` per tier, then sort by the canonical order above.
- No change to `handleSelectOffer(offerId)` or checkout params; still one `offerId` per selection.

### 1.2 Room List: Horizontal Scroll

- **Replace vertical stack** of room cards with a **horizontal scroll** container.
- **Snap:** Optional but recommended (e.g. `scroll-snap-type: x mandatory`, `scroll-snap-align: start` on each card).
- **Peek:** Show ~20% of the next card to afford discovery (e.g. card width ~80% of container or similar).
- **Scroll indicators:** Optional dots or "1 of N" for current card.

### 1.3 Room Card Redesign

Each room card in the horizontal list should show:

- **Room image:** Larger than current thumbnail, rounded corners (`rounded-2xl` or design radius).
- **Room name/type:** Bold, prominent (`displayName` from RoomGroup).
- **Rate type badge:** One badge per card for the **cheapest** rate tier (e.g. "Non-refundable" or "Free cancellation") — or show "From X rates" if multiple tiers after deduplication.
- **Price:** "From {currency} {minTotal} total" (for stay; keep "total" to avoid confusion with per-night).
- **Amenities row:** 4–5 icons max (e.g. sleeps, wifi, breakfast) from room metadata or first offer.
- **"View details" link/button:** Secondary style; opens room detail modal/sheet (see 1.4).

**Design:** Cards must have clear border/hover so they don't blend with background (design philosophy). Use white or light card bg and `--sky-blue` or muted border.

### 1.4 Room Detail Modal/Sheet

On "View details" (or tap on card if desired):

- **Bottom sheet or modal** (prefer sheet on mobile for consistency with SearchModal).
- **Content:**
  - **Image gallery:** Swipeable carousel of room photos (`roomMeta.photos` or hotel fallback).
  - **Full room description** (`roomMeta.description`).
  - **Amenities list** (full `roomAmenities`).
  - **Bed type info** (`bedTypes`).
  - **Size/capacity** (roomSizeSquare, roomSizeUnit, maxOccupancy).
  - **Cancellation policy** for each offer tier (or for selected tier).
  - **"Select this room" CTA** — if multiple tiers, either "Select cheapest" or list of tier buttons that each trigger `handleSelectOffer(offer)` and close sheet.
- **Styling:** Use design tokens; sheet should have distinct background/border. Animation: reuse `--modal-enter-duration` / `--modal-exit-duration` from globals.

---

## PHASE 1.5: Room Detail Modal Refinements

**Outcome:** Room detail modal is easy to close, shows a clean room description, lets users customize rate (cancellation + board) with clear pricing, and surfaces amenities with “Show more.” Assumes Phase 1 (including 1.4 Room Detail Modal) is already implemented.

**Design reference:** Expedia-style “RATES & CANCELLATION” discrete rate cards (total + per-night, green “Select this rate”); “Customize your stay” modal with cancellation and board toggles and live price update.

### 1.5.1 Close / Collapse Control

- **X button:** Add a clear close (X) control in the room detail modal/sheet (e.g. top-left or top-right of the modal header).
- **Behavior:** On tap, close/collapse the modal using the same exit animation as the rest of the app (`--modal-exit-duration`).
- **Accessibility:** Use `aria-label="Close"` and ensure focus is returned appropriately when the modal closes.

### 1.5.2 Room Description Formatting

- **Problem:** Room description from the API is often HTML (e.g. `<p><strong>2 Twin Beds</strong></p><p>344-sq-foot...</p><br/><p><b>Internet</b> - Free WiFi</p><p><b>Sleep</b> - ...</p>`). Displaying this raw is messy.
- **Approach:**
  - **Option A (recommended):** Parse the HTML safely (e.g. strip script/style, allow only safe tags) and render as structured content: treat `<strong>`/`<b>` as section labels (e.g. “Internet”, “Sleep”, “Bathroom”), and the following text as body. Render as clean sections (label bold, content below) instead of raw paragraphs and `<br/>`.
  - **Option B:** Use a minimal HTML sanitizer and render with constrained typography (single font size, no nested divs); then apply CSS so `<p>`, `<strong>`, `<b>` map to consistent label/body styles.
- **Result:** User sees readable blocks (e.g. “**Internet** – Free WiFi”, “**Sleep** – Egyptian cotton linens…”) without visible tags or broken layout. Preserve line breaks and list-like content where it aids readability.

### 1.5.3 Rate Customization (Customize Your Stay)

- **Goal:** Let users choose cancellation policy and board type inside the room modal; show only combinations that exist for this room; update the displayed price to match the selection.
- **UI:** A “Customize your stay” block inside the room detail modal (or a small sub-modal/sheet using the same design tokens). Include:
  - **Cancellation policy:** Radio (or toggle) options – e.g. “Non-refundable”, “Free cancellation until [date]” – **only for policies that exist** for this room’s offers.
  - **Board / extras:** Radio (or toggle) options – e.g. “Room Only”, “Breakfast Included”, “Half Board” – **only for board types that exist** for this room.
  - **Live price:** Show **total** and **per night** for the currently selected combination; update when the user changes cancellation or board (e.g. “EGP X total · EGP Y/night” or “$X total” with “$Y/night” below).
- **Data:** Derive options from the room’s `offers` (after deduplication). If the room has only non-refundable rates, show only that; if it has both Room Only and Breakfast Included, show both. Selection state drives which offer’s price is shown and which `offerId` is used when the user taps “Select this rate”.
- **Design:** Use app design tokens (primary for selected state, borders so options don’t blend with background). Optional: show “+ EGP 0” or “+ EGP X” per option to indicate delta from base, if that fits the product.

### 1.5.4 Rates & Cancellation Clarity (Discrete Rate Cards)

- **Goal:** Make each rate option clearly distinct and show total + per-night explicitly (Expedia-style).
- **Section:** Add a “RATES & CANCELLATION” (or equivalent) heading above the rate options in the modal.
- **Per-option card:** For each available rate (board + cancellation combination), show one card with:
  - **Board type** (e.g. “Room Only”, “Breakfast Included”) – bold, prominent.
  - **Cancellation policy** (e.g. “Non-refundable” or “Free cancellation until …”) – secondary/muted text.
  - **Pricing:** “EGP X total · EGP Y/night” (or “{currency} X total · {currency} Y/night”) on one line so both total and per-night are clear.
  - **Action:** Primary green button “Select this rate” (brand `--primary`).
- **Differentiation:** Use subtle color or border so cards don’t all look identical (e.g. slightly different background or left border for refundable vs non-refundable). Ensure the selected state in the customization block (1.5.3) is visually consistent with the corresponding rate card if both are shown.
- **Scope:** Only show rate options that exist for this room (no placeholder cards for combinations the API doesn’t return).

### 1.5.5 Amenities Summary in Modal

- **Goal:** Surface room amenities in the modal without overwhelming; allow expansion for full list.
- **Content:** Use `roomMeta.roomAmenities` (and, if needed, amenities parsed from the room description) to build a list.
- **UI:** Show the **top few** (e.g. 5–6) amenities as a short list. Add a **“Show more”** control (link or button) that expands to show the full list (or scrolls to more in-place).
- **Placement:** In the room detail modal, after or alongside the room description and before (or after) the rates section, so users see key amenities before choosing a rate.

---

## PHASE 2: Conversion and Navigation

**Outcome:** Sticky CTA and header/carousel improve conversion and first impression.

### 2.1 Sticky CTA Button

- **Floating bottom CTA:** Label "Select a room" or "View rooms".
- **Behavior:**
  - Sticky to bottom of viewport; full-width with safe-area padding (e.g. `pb-safe`).
  - **Visible** while user is above the room selection section.
  - **Hidden** when room section enters view (e.g. via `IntersectionObserver` or scroll threshold).
  - On tap → **smooth scroll** to room selection section (e.g. `#rooms` or ref).
- **Styling:** Primary background (`--primary`), white text, elevation/shadow for visibility; match app button styles.

### 2.2 Header and Hero Carousel

- **Back button** (top left): Navigate to `/results` with current search params (existing behavior); restyle to match design (e.g. circular, light bg, shadow) as in Figma `HotelDetailPage`.
- **Share button** (top right): Native share when available (`navigator.share`), else fallback (copy link or toast “Link copied”).
- **Heart / wishlist button** (top right, next to share): Wire to existing `FavoriteHotelsContext` if present; toggle favorite state; use brand primary for filled state.
- **Hero → image carousel:**
  - Replace single hero image with a **carousel** using `hotelImagesForGallery` (or details `hotelImages` + `main_photo`).
  - **Dot indicators** at bottom; optional thumbnail strip below (Figma has “1/12” + thumbnails).
  - **Image counter badge** (e.g. “1/24”) bottom-right, over image.
  - Swipe/scroll or arrow controls; tap image still opens full `ImageGallery` as today.

**Design note:** Header overlay (back, share, heart) should sit over first carousel frame with sufficient contrast (e.g. white/light bg with shadow per Figma).

---

## PHASE 3: Trust, Context, and Search

**Outcome:** Property summary and sentiment sections build trust; search bar and in-place update let users change dates/guests without losing context.

### 3.1 Property Summary Section

- **Hotel name:** Keep prominent (h1/h2); ensure typography uses design scale (e.g. 22px bold).
- **Star rating** (below name): If `details.starRating` exists, show star display (e.g. ★★★★☆) and optional “X-star hotel” text; use brand-compliant color (e.g. amber/gold for stars).
- **Review score badge** (Figma: teal box “9.2” + “Wonderful”):
  - Numeric score (e.g. “8.4”) from `details.rating`.
  - Label from score band (e.g. “Excellent”, “Wonderful”, “Very Good”) — reuse existing logic in page.
  - Review count: “Based on 147 reviews” from `details.reviewCount`.
  - **Tappable:** entire badge links/scrolls to **reviews section** (anchor or in-page section).
- **Address:** Keep single line (address, city, country); optional MapPin icon.

### 3.2 Highlights Section (Keep Existing, Restyle)

- **Pill/chip style** to match Expedia/Figma: rounded pills, light border or background so they don’t blend with page (per design philosophy).
- Icons for each highlight where feasible (reuse or add from `Icons` or design set).
- Horizontal scroll if list is long; ensure touch-friendly hit areas.

### 3.3 “Guests Liked” / “Keep in Mind” (Keep Existing, Restyle)

- **Guests liked:** Light background (e.g. subtle green/positive tint), bullet list.
- **Keep in mind:** Darker/muted background, bullet list.
- Preserve data source: `details.sentiment_analysis.pros` / `cons`.
- Use design tokens for borders and text so both cards feel distinct from page background.

### 3.4 Date/Guest Selector Bar

- **Placement:** Below hero carousel, above highlights (or below property summary).
- **Display:** Current search params in one tappable bar:
  - Location: `placeName` or “Add destination”
  - Dates: e.g. “Feb 17 – Feb 19” (reuse `formatRangeShort` and existing date state)
  - Guests: e.g. “1 Rm, 2 Gst” (reuse `occupancies` summary)
- **Interaction:** Entire bar tappable → opens existing **SearchModal** (same as current “search bar” in header) with same initial values; on “Search”, apply 3.5.

**Design:** Bar should look like a single card/row (border, padding) so it’s clearly interactive (design philosophy).

### 3.5 Search Update Logic (In-Place)

When user confirms search from the modal **from the hotel detail page**:

- **Do not navigate away** from `/hotel/[hotelId]`.
- **Update URL** with new `checkin`, `checkout`, `placeId`, `placeName`, `occupancies` (and `placeAddress` if used).
- **Keep** current hotel `details` in state (no refetch of details).
- **Refetch only room rates:** Call `/api/rates/hotel` with new params; replace `ratesData` and thus `roomGroups`.
- **Loading:** Show loading state on the **room section** (e.g. skeleton cards or spinner); do not show full-page loader.
- **Scroll:** Maintain scroll position (do not jump to top).
- **Price context:** Update the line above room list (e.g. “Prices are total for X nights for Y room(s)”) using new `nights` and `occupancies`.

**Edge case:** If user changes destination (placeId), consider whether to redirect to results or stay on hotel — plan: stay on hotel and only refresh rates (hotelId is already fixed).

---

## PHASE 4: Design System Integration

**Outcome:** Entire page uses design tokens and matches app style guide.


### 4.1 Apply Design Language

- **Colors:** Replace hardcoded slate/emerald with CSS variables (`--primary`, `--dark-text`, `--light-bg`, `--sky-blue`, `--muted`, `--muted-foreground`). Use `var(--primary)` for CTAs and key accents.
- **Typography:** Use design scale (28/22/18/16/14/12px) and weights (semibold labels, regular body); ensure font stack is Delight/Outfit.
- **Spacing:** Consistent margins/padding/gaps (e.g. section gaps, card padding) aligned with other app pages.
- **Radius:** Use `var(--radius)` or rounded-2xl/3xl for cards and sheets.
- **Shadows:** Use existing elevation patterns for sticky CTA and overlays.
- **Buttons:** Primary = green (var(--primary)), secondary = outline or muted; pill for main CTAs where appropriate.
- **Cards:** White or light bg, border so they don’t blend with `--light-bg` (see §0).

Update **all** hotel-detail components (header, summary, highlights, sentiment cards, review badge, room cards, bar, sticky CTA, modals) to use these tokens and patterns so the page matches the rest of the app and Figma intent.

---

## PHASE 5: Placeholders (Later)

**Outcome:** Reserved space and section headers for future map, policies, and recommendations; no real content yet.

- **Map section:** Reserve space; content “Map view coming soon.”
- **Important information:** Collapsed section header; on tap show “Coming soon” (or future policy content).
- **Policies section:** Same as above — collapsed header, “Coming soon” on tap.
- **“You May Also Like”:** Omit for now; can be added later below reviews.

---

**Execution order:** Do Phase 1 → **1.5** → 2 → 3 → 4 → 5 in that order. Priority is encoded in the phase order; no separate priority list.

---

## TESTING CHECKLIST

- [ ] No duplicate rate tiers per room (only one “Room Only Non-Refundable” etc. per room).
- [ ] Room rates sorted in agreed order (Room Only NRF → RF → Breakfast NRF → RF → …).
- [ ] Horizontal scroll works smoothly; snap and peek behave as specified.
- [ ] Sticky CTA hides when room section is in view; tap scrolls to rooms.
- [ ] Room modal/sheet opens with gallery, details, and “Select this room” (or per-tier select).
- [ ] **Phase 1.5:** Room modal has X to close; description renders as clean sections (no raw HTML mess); "Customize your stay" updates price when cancellation/board change; rate cards show "X total · Y/night" and are visually distinct; amenities show top few + "Show more".
- [ ] Changing search from hotel page updates only room section and URL; no full navigation.
- [ ] Loading state shown only on room block during rate refetch.
- [ ] Design matches app style guide (tokens, typography, cards distinct from background).
- [ ] Works across screen sizes (mobile-first; max-w-md layout preserved).
- [ ] Back button returns to results with correct search params.
- [ ] Share and wishlist buttons work (share: native or copy; wishlist: context if available).

---

## DEPENDENCIES & NOTES

- **Existing plan:** IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT Part 1 is the source of truth for room grouping and data model; this plan extends it with deduplication, layout (horizontal + card design), and modal.
- **APIs:** No new endpoints; reuse `/api/hotel/details` and `/api/rates/hotel`. Prebook/checkout flow unchanged.
- **Routing:** All navigation remains Next.js (Link, router.push, search params). Hotel page must preserve `hotelId`, `placeId`, `placeName`, `checkin`, `checkout`, `occupancies` in URL when opening search or returning from checkout.
- **Figma:** HotelDetailPage shows teal-600 for CTAs and rating badge; app standard is `--primary` (#057A5A) for consistency.
- **Vital considerations:** When implementing or refining later phases, apply the two items in **Vital Considerations (Apply in Later Phases)**: room count visible at every step, and taxes/pay-at-property logic unchanged and apparent.
