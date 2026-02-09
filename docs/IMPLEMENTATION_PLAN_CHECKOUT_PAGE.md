# Checkout Page Implementation Plan

**Purpose:** Define a phased revamp of the app’s checkout page (`/checkout`) in implementation priority order. This plan aligns with the **Figma design reference** (see `FIGMA_DESIGNS_ASSESSMENT.md` § 3.6), **Part 2 of IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md** (Booking-style summary, hotel header, Your Rooms, price breakdown), and the current app behaviour (prebook, guest form, LiteAPI payment).

**Scope:** UI, layout, copy, and UX improvements. Prebook/book API contracts, URL params, and routing remain unchanged. The app remains the source of truth for data and flow.

---

## Implementation priority order

Phases are ordered so that **critical** (payment and guest/room data) are done first, then **high** (clarity and features), then **medium** (design system and validation). The page header is first as the shell for all sections.

| Order | Phase | Priority |
|-------|--------|----------|
| 1 | Page header & structure | Foundation |
| 2 | Payment SDK fix | Critical |
| 3 | Guest details per room | Critical |
| 4 | Who is this booking for? | Critical |
| 5 | Room details enhancement | Critical |
| 6 | Price summary improvements | High |
| 7 | Promo code feature | High |
| 8 | Hotel summary card redesign | High |
| 9 | Special requests | High |
| 10 | Design system application | Medium |
| 11 | Validation & error handling | Medium |

---

## Phase 1: Page header & structure

**Priority:** Foundation (do first so the page shell is in place.)

### 1.1 Page header

- **Title:** `"Secure your stay"`
- **Subtitle:** Booking dates and guest count in format:  
  `"2026-03-09 → 2026-03-13 · 2 guests"`
- **Back button:** Top left; navigates back to hotel detail with current search params (checkin, checkout, occupancies).
- **Design:** Use app design system typography and spacing.

### 1.2 Structure

- Keep single-column layout; ensure consistent spacing and section order as in later phases.

**Reference:** Current checkout already has a similar header; align copy and styling with the design system (Phase 10).

---

## Phase 2: Payment SDK fix

**Priority:** Critical — payment must work before polishing the rest.

### 2.1 Current issue

- Payment SDK (LiteAPI) is loaded only when the user clicks “Continue to payment”, which can cause delays or failures when the form is shown.

### 2.2 Required changes

1. **Preload SDK on page mount** (when prebook is available), not on button click.
2. **Show a loading state** while the SDK script is loading/initializing.
3. **Handle SDK errors** with clear, user-facing messages.
4. **Verify:** Script load, initialization timing, console errors, API keys/credentials. Test with sandbox credentials.

### 2.3 Payment section UI

- Preload/initialize so that when the user reaches payment:
  - Payment method selector is shown if there are multiple options.
  - Card fields (from SDK) render in `#payment-element`.
  - “Continue to payment” (or “Complete booking”) is enabled only when the SDK is ready.
- **Sandbox notice:** Keep visible; muted background, smaller text:  
  *“Sandbox mode: use test card 4242 4242 4242 4242, any 3-digit CVC, and any future expiry date.”*

**Note:** Do not change prebook or book API contracts; only fix when and how the payment script is loaded and initialized.

---

## Phase 3: Guest details per room

**Priority:** Critical — correct data per room and API mapping.

### 3.1 Current issue

- Only one guest (first name, last name, email) is collected for the whole booking, regardless of room count.

### 3.2 New structure

**Single room:**

- **Guest details**
  - First name, Last name, Email, Phone (if required).

**Multiple rooms:**

- **Guest details** with tabs or accordion:
  - **Primary guest – Room 1:** First name, Last name, Email, Phone.
  - **Primary guest – Room 2:** Same fields.
  - … one block per room.
- **UI:** Tabs or expandable sections; active/current room clearly indicated; completion checkmark when a room’s required fields are filled.

### 3.3 Validation and API

- **Validation:** All rooms must have primary guest info before “Continue to payment”. Email (and phone if required) format validation.
- **API:** Map guest data per room in the book payload, e.g. `rooms[0].primaryGuest`, `rooms[1].primaryGuest`, in line with existing prebook/book API.

### 3.4 Styling

- Use app form input components; clear labels and hierarchy.

---

## Phase 4: Who is this booking for?

**Priority:** Critical — drives pre-fill and contact for the booking.

### 4.1 Placement

- After the hotel card, before guest details.

### 4.2 Section: “Who is this booking for?”

- **Options (radio/toggle):**
  - **Myself** (default selected)
  - **Someone else**

### 4.3 Logic

- **Myself:** Pre-fill guest details from logged-in user (name, email, phone if available). Fields can remain editable.
- **Someone else:** Show the same guest fields but do not pre-fill from user; these become the primary contact for the booking.

### 4.4 UI

- Clear selected state; match app button/control styles (Phase 10).

---

## Phase 5: Room details enhancement

**Priority:** Critical — clarity and trust in “Your Rooms”.

### 5.1 “Your Rooms” section

- **Title:** “Your Rooms” and, if multiple rooms, total count: “Your Rooms (2)”.
- **Per room:** Clearly separate “Room 1”, “Room 2”, etc.

### 5.2 Per-room content

For each room show:

- **Room type name** (larger, bold): e.g. “Classic Room, Breakfast Included”.
- **Guest count:** e.g. “2 Adults” (with icon).
- **Amenities/inclusions:** Icons for breakfast, WiFi, etc. when available.
- **Bed type** (if available): e.g. “1 King Bed” or “2 Twin Beds”.
- **Cancellation:** e.g. “Non-refundable · Cancellation policy applies” with tappable info icon for details.
- **Average nightly rate:** e.g. “EGP 10508.72 average per room/night”.

### 5.3 Styling and hierarchy

- Strong visual hierarchy (larger headings, clear sections).
- **Cancellation:** Colour coding — e.g. red for non-refundable, green for free cancellation.

### 5.4 Data source

- Use prebook `roomTypes[].rates[]` (name, boardName, cancellationPolicies) and hotel details where available; align with IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT Part 2.

---

## Phase 6: Price summary improvements

**Priority:** High.

### 6.1 Structure (keep, clarify)

- Price summary
  - 1 room × 4 nights → EGP X
  - Included taxes and fees (i) → EGP X
  - Local fees (i) → EGP X
  - Discount (if promo applied) → -EGP X (green, strikethrough on original total if needed)
  - **Total** → EGP X (large, bold)
  - Pay now → EGP X (bold)
  - Pay at property → EGP X (lighter/muted)

### 6.2 UI changes

- **Amounts:** Larger font sizes; bold total.
- **Colour:**
  - Regular lines: standard text colour.
  - Discount: green, optional strikethrough on original.
  - Total: prominent/primary colour.
  - Pay now: highlighted/primary.
  - Pay at property: muted/secondary.
- **(i) info icons:** Tappable; show tooltip (or short modal) explaining “Included taxes and fees” and “Local fees”.

### 6.3 Data

- Keep using prebook price, `includedTaxesAndFeesTotal`, `localFeesTotal`, and total as today; add discount line when Phase 7 (promo) is implemented.

---

## Phase 7: Promo code feature

**Priority:** High.

### 7.1 Placement

- Between “Your Rooms” and “Price summary”.

### 7.2 UI

- **Collapsed:** “Have a promo code?” with expand icon.
- **Expanded:**
  - Text input: “Enter promo code”
  - “Apply” button
  - Area for validation message (success/error).

### 7.3 Logic

- **Apply:** Validate promo via API (endpoint TBD or stubbed).
- **Valid:** Add “Discount” line in price summary (green, negative amount); show original total with strikethrough; update final total; message e.g. “Promo code applied!”.
- **Invalid:** Message e.g. “Invalid or expired code”; allow retry.
- **Persistence:** If user navigates away and returns (e.g. back to hotel then to checkout again), keep applied promo if still valid (e.g. store in session or prebook context if API supports it).

---

## Phase 8: Hotel summary card redesign

**Priority:** High.

### 8.1 Replace current basic card

- Use a **detailed list-card** style consistent with the app’s list card (e.g. results/hotel list).

### 8.2 Card content

- **Hotel image:** Larger, rounded corners (match list card).
- **Hotel name:** Bold, prominent.
- **Address:** With location pin icon.
- **Star rating:** Visual stars (e.g. ★★★★★).
- **Review score badge:** e.g. “9.0 Wonderful (5,159)”.
- **Check-in/Check-out:** “Mar 9, 2026 – Mar 13, 2026 (4 nights)”.

### 8.3 Styling

- Reuse or mirror the existing list card component and design pattern; keep alignment with FIGMA_DESIGNS_ASSESSMENT and design system (Phase 10).

---

## Phase 9: Special requests

**Priority:** High.

### 9.1 Placement

- After guest details, before payment.

### 9.2 UI

- **Collapsed:** “Special requests (optional)” with expand icon; subtitle: “Not guaranteed, but the property will do its best.”
- **Expanded:** Multi-line textarea; placeholder e.g. “E.g., early check-in, high floor, adjacent rooms…”.
- **Limit:** 500 characters; show counter.
- **Validation:** Optional — no blocking validation.

### 9.3 Styling and API

- Match form input design system. Send special requests in book payload only if backend supports it; otherwise store for future use or omit.

---

## Phase 10: Design system application

**Priority:** Medium — apply consistently across checkout.

### 10.1 Apply app design language

- **Colours:** Use app palette (including primary, secondary, success/error).
- **Typography:** Use app scale (headings, body, captions).
- **Spacing:** Standard spacing units.
- **Cards/containers:** App card and container styles.
- **Buttons:** Primary, secondary, outline styles.
- **Inputs:** App input components.
- **Icons:** App icon set and sizes.
- **Shadows/elevation:** Per app standards.

### 10.2 Checkout-specific

- Replace generic dark cards with app card component where appropriate.
- Use app form inputs and buttons for CTAs.
- Use app success/error and loading indicators.
- Align with Figma design reference (FIGMA_DESIGNS_ASSESSMENT § 3.6) without changing behaviour or APIs.

---

## Phase 11: Validation & error handling

**Priority:** Medium.

### 11.1 Before “Continue to payment”

- All guest details complete **per room** (Phase 3).
- Valid email format(s); valid phone format(s) if required.
- Payment SDK loaded and ready (Phase 2).
- If “Who is this booking for?” is “Someone else”, ensure those fields are filled.

### 11.2 Inline errors

- Red text below invalid fields; clear messages.
- On submit attempt, scroll to first error.

### 11.3 Edge cases

- Prebook missing or expired: clear message and option to go back to hotel.
- Payment init failure: user-friendly message and retry or support hint.

---

## Dependencies and references

- **FIGMA_DESIGNS_ASSESSMENT.md** — Checkout scope (§ 3.6): align summary and layout with design; keep prebook/guest/payment logic and API.
- **IMPLEMENTATION_PLAN_ROOM_AND_CHECKOUT.md** — Part 2: hotel header (image, name, address, rating), stay dates, “Your Rooms” (room line, occupancy, cancellation, average per room/night), price breakdown (rooms×nights, taxes/fees, total, pay now).
- **Current app:** `app/checkout/page.tsx` — prebook on mount, hotel details fetch, single guest form, payment script on “Continue to payment”, price breakdown from prebook; URL params: hotelId, offerId, checkin, checkout, occupancies.
- **Figma reference:** `figma designs/src/app/components/CheckoutPage.tsx` — layout and section order only; app remains source of truth for data and flow.

---

## Summary

| Phase | Focus |
|-------|--------|
| 1 | Page header and structure |
| 2 | Payment SDK preload and readiness |
| 3 | Guest details per room (tabs/accordion, API mapping) |
| 4 | “Who is this booking for?” (Myself / Someone else) |
| 5 | Your Rooms: richer content and hierarchy |
| 6 | Price summary clarity and (i) tooltips |
| 7 | Promo code (UI + validation + discount line) |
| 8 | Hotel summary card (list-card style) |
| 9 | Special requests (optional textarea) |
| 10 | Design system across checkout |
| 11 | Validation and error handling |

No code changes are implied by this document; it is a planning and implementation-order reference only.
