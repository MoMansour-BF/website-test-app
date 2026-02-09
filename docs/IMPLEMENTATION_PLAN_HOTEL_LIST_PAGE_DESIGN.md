# Implementation Plan: Hotel List Page Design (Results)

**Scope:** `/results` (hotel list page) only. Adapt the Figma design and reference images to the app’s existing logic and features. **Do not change behaviour or APIs** — only layout, visual hierarchy, and styling so the page feels less “messy and busy” and matches the revamped brand (Journeys by Breadfast, light mode, design tokens).

**Focus areas:**  
1. **Consolidated, reactive search summary as the search bar** — one block (Phase 1 + 2) where the summary is the entry to `SearchModal`.  
2. **Hotel cards** (Figma-inspired layout, favorite hearts with persisted IDs, same data and links).  
3. **Polish:** Transitions, map view placeholder, and brand typography.

**No implementation in this doc — plan and phases only.**

---

## 0. Brand alignment — typography

The entire site must use the correct brand font stack:

```css
font-family: 'Delight', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- **Where:** Apply globally (e.g. on `body` in `app/globals.css`). Ensure this is set so all pages, including the results page, inherit it.
- **Font loading:** If Delight and/or Outfit are not yet loaded, add them (e.g. `next/font`, Google Fonts, or self-hosted `@font-face`). Fallbacks ensure readable text if custom fonts fail to load.
- **Scope:** When implementing the hotel list page (and any other revamped pages), do not override this font stack; use it for headings and body so the site matches the design language.

---

## 1. Current state (brief)

- **Layout:** Results page lives inside the app shell; `AppHeader` (logo, Log in, language, currency) is already above the page content.
- **Page “header” block:** Back link (←) to home, title (e.g. destination name or “Matches for your vibe”), and a line with raw dates and guest count (e.g. `checkinParam → checkoutParam · X guests`). This is separate from the search bar.
- **Search bar:** One full-width tappable bar (dark slate) showing place name, optional address, and “date range · guests”. Tapping opens `SearchModal` (overview or step-based). Editing in the modal and “Search” navigates to `/results` with new params. **Logic is correct;** the problem is visual clutter and duplication (title + subtext + bar all say similar things in different ways).
- **List controls:** Sticky block with “X hotels in {location}”, a `<select>` for sort (Recommended, Price, Rating), and a “Filters” button. Dark slate styling.
- **Hotel cards:** Horizontal layout (image left ~140px, content right). Each card shows name, address, rating/reviews, refundability, price per night + total, optional tags. Link to `/hotel/[id]` with full search params. Dark slate theme.
- **Data and behaviour:** URL params (placeId, placeName, checkin, checkout, occupancies, mode); one `POST /api/rates/search`; sort is client-side; filter panel is placeholder. All of this **stays as is**.

---

## 2. Design direction (from reference images and Figma)

- **One unified header block (Phase 1 + 2):** The header area should feel like **one block**: back control + **search bar that is the summary** + optional wishlist icon, then directly below (still part of the same visual block) the list controls (count, sort, filters, map). The **summary is the search bar** — i.e. the single tappable element that shows destination, dates, and guests is the entry point to `@/components/SearchModal.tsx`. Copy the reference image pattern (pill-shaped bar with icon, destination, dates · travelers) but using our design language (primary green for icon, light grey/white pill, design tokens, brand font).
- **Search bar (the summary):**
  - One pill-shaped or rounded-full bar: left = search/location icon (primary green, circular or prominent); center = **Line 1:** destination (bold, can truncate e.g. “Hurghada, Red Sea Govern...”); **Line 2:** formatted date range + “ · ” + guests (e.g. “Feb 20–21 · 2 travelers” or “1 Rm, 2 Gst”). Right side of the bar: optional wishlist/saved icon (e.g. suitcase-with-heart or heart) for future use.
  - Tapping this bar opens `SearchModal`; no separate “summary row” plus “card” — the bar itself is the only search summary and entry. Back arrow stays left of the bar (or integrated so the whole thing is one block).
- **List controls in the same block:** Directly under the search bar (no gap that suggests a new section): “X hotels in {destination}” (or “X+ properties”), then Sort dropdown and Filters button. Optionally a **Map** button (placeholder for future map view feature, same treatment as Filters). All in one visual container (same background/border) so Phase 1 and 2 feel like one block.
- **Hotel cards (Figma ListingsPage as reference):** Vertical card (image on top, content below). Image with **heart (favorite)** top-right — functional: toggle adds/removes hotel ID from a “favorite hotels” list (see Phase 2). Content: name, location, rating badge, refundability, price (primary green). Same `Link` and data as today. **Favorite hotels** are persisted (localStorage for now; server-side later) and can be used on the homepage in place of “Featured Hotels” (cards linking to hotel detail).
- **Typography:** Use the brand font stack (Section 0) everywhere on this page.

---

## 3. Principles (reminder)

- **App is source of truth.** URL params, `/api/rates/search`, sort/filter behaviour, and `SearchModal` flow do not change. Only the results page’s **layout and styling** change (plus the placeholder “favorite hotels” state and homepage reuse).
- **One block, one entry point.** Phase 1 and 2 are one visual block. The search bar **is** the summary and the only entry point to edit search (opens `SearchModal`).
- **Brand alignment.** Use design tokens (e.g. `--primary`, `--dark-text`, `--light-bg`, `--sky-blue`), light mode, and the **brand font stack** (Section 0). Avoid leftover dark-slate-only styles so the page matches the home page and header.
- **Accessibility and semantics.** Keep back link, heading for the list, and focus management when opening/closing the modal.

---

## 4. Phased implementation plan

### Phase 1: One-block header (search bar as summary + list controls)

**Goal:** The entire header feels like **one block**. The **summary is the search bar** — a single pill-shaped (or rounded) bar that shows destination, dates, and guests and is the **entry point to `SearchModal`**. Directly below it, in the same visual block, list controls (count, sort, filters, map placeholder). Copy the reference image layout using our design language (tokens, brand font, primary green icon).

**Tasks:**

1. **Single header block layout**
   - One container (e.g. light grey or white background, subtle border, rounded corners) that holds:
     - **Row 1:** Back button (left, circular or pill, to `/`) + **search bar (center/flex-1)** + optional wishlist/saved icon (right, for future use).
     - **Row 2:** List controls: “X hotels in {destination}” (or “X+ properties”), then **Sort** dropdown (“Sort: Recommended”, same options), **Filters** button, and **Map** button (placeholder: same treatment as Filters — visible, tappable, no behaviour yet or “Coming later”).
   - No separate “title row” and “search card” — the only search summary is the bar itself. Tapping the bar opens `SearchModal`; same props and `doSearchFromModal` as today.

2. **Search bar (the summary)**
   - Pill-shaped or rounded-full bar; visually distinct (e.g. `bg-slate-50` or light grey, border) so it doesn’t blend with the background.
   - **Left:** Search/location icon in primary green (e.g. MapPinIcon or SearchIcon in a circular accent if desired).
   - **Center:** Two lines: (1) Destination (bold, truncate if long, e.g. “Hurghada, Red Sea Govern...”); (2) formatted date range + “ · ” + guests (e.g. “Feb 20–21 · 2 travelers” or “1 Rm, 2 Gst”), smaller, muted.
   - **Right (optional):** Wishlist/saved icon (suitcase-with-heart or heart) for future use.
   - Hover/focus state so it’s clearly tappable. Opens `SearchModal` on tap.

3. **List controls (same block)**
   - Same behaviour: `allHotels.length`, `sortOrder`/`setSortOrder`, `filterPanelOpen`/`setFilterPanelOpen`. Add **Map** button: same styling as Filters, no action yet (or open a “Map view coming soon” placeholder).
   - Styling: use design tokens and brand font; ensure the block doesn’t blend with the page (border or background).

4. **Sticky (optional)**
   - Decide if this whole block sticks below `AppHeader` on scroll; document and implement consistently.

**Deliverable:** One unified header block: back + search bar (summary = entry to SearchModal) + optional wishlist icon; below it in the same block, count + Sort + Filters + Map (placeholder). Behaviour unchanged; design language applied.

---

### Phase 2: Hotel cards (Figma-inspired layout + favorite hotels)

**Goal:** Redesign each hotel card to a vertical, Figma-style layout (image on top, content below) with brand colours and clear hierarchy. Add a **favorite hotels** placeholder: store liked hotel IDs (localStorage now; server-side later); heart on each card toggles favorite; homepage can show liked hotels in place of Featured Hotels.

**Tasks:**

1. **Favorite hotels — state and persistence**
   - Introduce a **“favorite hotels”** concept: a list of hotel IDs (e.g. `string[]`) that the user has liked.
   - **Persistence:** Store in **localStorage** for now (e.g. key `journeys_favorite_hotel_ids` or similar). Later this can be synced to the server; the plan only requires a placeholder variable/context that reads and writes this list.
   - **Toggle:** On each hotel card, a heart icon (top-right on the image). Tapping it adds or removes that hotel’s ID from the favorite list. Heart is filled (e.g. primary colour) when the hotel is in the list, outline when not. No API call for toggle; only localStorage (and future server sync when implemented).
   - **Homepage reuse:** On the homepage, in place of (or in addition to) the current “Featured Hotels” placeholder section, show **“Your liked hotels”** (or “Saved for later”) when the favorite list is non-empty: for each liked hotel ID, fetch or display hotel name and image (e.g. call existing hotel details API or use a small cache) and render a card that links to `/hotel/[id]`. If the list is empty, keep showing the current Featured Hotels placeholder. This ties Phase 2 to a small homepage change so liked hotels are visible and useful.

2. **Card structure**
   - **Vertical layout:** Image on top (full width, fixed height e.g. h-48 or h-52), content below in a white/light card body.
   - **Image:** Use `hotel.main_photo`; fallback when missing. **Heart (favorite)** top-right on the image: toggles the hotel ID in the favorite list (see above).
   - **Body:** Hotel name (bold), location/address (muted), rating/reviews badge (when available), refundability line, price (primary green, “/ night” and optionally total). Same data and logic as today.

3. **Data mapping (no logic change for search)**
   - Name, location, rating, reviewCount, refundability, price: same as today. Same `Link` to `/hotel/[id]` with same `hrefParams`. No change to URL or API for the list itself.

4. **Styling**
   - Card: white/light background, rounded corners, border or shadow; design tokens and brand font. Optional amenities/tags as today.

5. **Loading and empty states**
   - Keep `ResultsLoading`; optionally match vertical card shape. Empty and error states unchanged.

**Deliverable:** Vertical hotel cards with functional heart (favorite); favorite hotel IDs persisted in localStorage; homepage shows “Your liked hotels” cards (by ID, name + image, link to detail) when list is non-empty, else Featured Hotels placeholder.

---

### Phase 3: Polish, transitions, and map view placeholder

**Goal:** Styling and transitions so the page feels responsive and on-brand; add a **Map view** button as a placeholder for a future feature (like Filters).

**Tasks:**

1. **Styling and transitions**
   - **Transitions:** Add subtle transitions for interactive elements: search bar hover/focus, card hover (e.g. shadow or scale), heart toggle (e.g. fill animation), modal open/close if not already covered by SearchModal. Use CSS transitions or existing design tokens (e.g. `--modal-enter-duration` in globals.css). Respect `prefers-reduced-motion` where applicable.
   - **Styling:** Ensure spacing, typography (brand font), and colours are consistent with the rest of the app. Back button, count, sort, and filter pills/buttons clearly tappable with hover/focus states. Destination sub-address/country in the search bar when available (e.g. “Cairo” / “Egypt”).

2. **Map view button**
   - In the same header block as Sort and Filters, add a **Map** button. Same visual treatment as Filters (pill or button, same style). **Placeholder only:** no map behaviour yet; can show “Coming soon” or do nothing when tapped, same as the current Filters panel placeholder. This reserves the slot for the future map view feature.

3. **Consistency**
   - Filter panel (when implemented per HOTEL_LIST_IMPROVEMENT_PLAN.md): style to match light theme and card style. Back button and spacing aligned with home page and design language.

**Deliverable:** Polished results page with transitions and consistent styling; Map button visible and styled, behaviour deferred; brand font and tokens applied throughout.

---

## 5. Implementation order summary

| Phase | Focus | Outcome |
|-------|--------|--------|
| **1** | One-block header | Back + search bar (summary = entry to SearchModal) + optional wishlist icon; below it in same block: count, Sort, Filters, **Map** (placeholder). One unified block; design language applied. |
| **2** | Hotel cards + favorites | Vertical cards; heart toggles “favorite hotels” (localStorage list of hotel IDs); homepage shows “Your liked hotels” cards (by ID → name/image, link to detail) when list non-empty. |
| **3** | Polish + map placeholder | Styling and transitions (hover, focus, heart, modal); Map button visible and styled, no behaviour yet; brand font and tokens throughout. |

---

## 6. Out of scope (do not change)

- **URL and API:** No new query params for search; no change to `POST /api/rates/search` or to how sort/filter state is applied. Favorite hotels are client-side (localStorage) only in this plan.
- **SearchModal:** No change to modal steps or Where/When/Who flow; only the results page’s **entry point** (the search bar) and its visual design.
- **App header:** Logo, Log in, language, currency stay as in `AppHeader`; no structural change.
- **Hotel detail and checkout:** No change to `/hotel/[hotelId]` or `/checkout`; this plan is only for the list page (and minimal homepage reuse for liked hotels).

---

## 7. Dependencies and references

- **Brand typography:** Apply `font-family: 'Delight', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;` globally (Section 0). Ensure Delight/Outfit are loaded (e.g. in `app/globals.css` or layout).
- **Design tokens:** Use `app/globals.css` tokens (`--primary`, `--dark-text`, `--light-bg`, `--sky-blue`, etc.); align with home page and PLAN_SEARCH_CARD_OVERLAY_AND_GREYED_FIELDS.
- **SearchModal:** Entry point is `@/components/SearchModal.tsx`; Phase 1 makes the search bar the single trigger (same props and `doSearchFromModal`).
- **Reactive search modal plan:** IMPLEMENTATION_PLAN_REACTIVE_SEARCH_MODAL.md — “Results and hotel pages: search bar entry” and “Destination display: always show sub-address” align with Phase 1 and Phase 3.
- **Figma reference:** `figma designs/src/app/components/ListingsPage.tsx` for card layout; reference image for pill-shaped search bar — adapt with our design language.
- **Filters/caching:** HOTEL_LIST_IMPROVEMENT_PLAN.md for future filter implementation; Map view is a separate future feature; this plan adds only placeholders.

No code in this document — use it as the phased plan when implementing the hotel list page design.
