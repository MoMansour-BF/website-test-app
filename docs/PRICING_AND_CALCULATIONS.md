# Website pricing and calculations (single source of truth)

This document is based on **LiteAPI’s official documentation**. It defines how we interpret rate/prebook responses and how we display and calculate prices on the website.

**References:**

- [Hotel Rates API JSON Data Structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure)
- [Revenue Management and Commission](https://docs.liteapi.travel/docs/revenue-management-and-commission)

**Backend configuration:** The current API has a **default margin of 10%** set in the backend (account commission settings). This margin is the seller’s commission on each booking.

---

## 1. API response structure (LiteAPI)

### Top level

- **`data`** — Array of booking details per hotel (rates search) or the prebook/prebookHotelRate object (prebook response).

### Per hotel (inside `data`)

- **`hotelId`** — Hotel identifier.
- **`roomTypes`** — Array of **offers**. Each element is one bookable offer (often called “room type” or “offer” in the API). Rooms and rates are used somewhat interchangeably: each **rate** corresponds to one **room** in the booking; with multiple occupancies there are multiple rates per offer.

### Per offer / room type (inside `roomTypes[]`)

- **`offerId`** — Required for prebook. Encodes all data for every rate in this offer. One offerId = one bookable offer = one total price for the whole booking.
- **`rates`** — One rate per requested occupancy. Each rate is tied to one occupancy (room); use `occupancyNumber` (1, 2, 3…) when assigning guests at the Book step.
- **`offerRetailRate`** — **Total amount** in the requested currency to book **this entire offer** (all rooms). Includes commission and included taxes/fees from every rate. Sum of all `rates[].retailRate.total` for this offer equals this amount.
- **`suggestedSellingPrice`** (at offer level) — Combined **SSP** across all rates. “How much the entire offer needs to be listed for publicly” (see Revenue Management doc).
- **`offerInitialPrice`** — Combined hotel price; usually ignored unless using hotel-specific discounts.

### Per rate (inside `rates[]`)

- **`retailRate.total[]`** — **The total due to book this room.** This is the amount the customer pays for this room. It **includes** the commission (see `commission[]`) and any taxes/fees with `included: true` (see `retailRate.taxesAndFees`). Only one object in the array: `{ amount, currency }`.
- **`retailRate.suggestedSellingPrice[]` (SSP)** — “The price you will find this room sold for publicly.” When selling publicly, this is the price to display for the room. Source (e.g. `providerDirect`) may be present.
- **`retailRate.taxesAndFees[]`** — Taxes/fees for this rate. Each entry: `amount`, `currency`, `included` (true = already in `retailRate.total`; **false = pay at property**, i.e. “local fees”). Can be an array, combined values, or `null` (all included, no breakdown).
- **`commission[]`** — Commission applied to this rate. `amount`, `currency`. This is the seller’s commission (from the margin %).
- **`cancellationPolicies`** — `refundableTag` (e.g. RFN / NRFN), `cancelPolicyInfos`, etc.

---

## 2. Offer-level total: what the customer pays

- **Source of truth for the booking total:** Use the **offer-level** total that represents “amount needed to book this offer (all rooms)”:
  - **Prebook response:** top-level **`price`** (and `currency`) on the prebook object (e.g. `prebookHotelRate.price`). This is the total the customer must pay.
  - **Rates response (before prebook):** **`offerRetailRate`** on the chosen `roomTypes[]` item — same idea: total to book that offer.

LiteAPI states that if you add up all `retailRate.total` for each rate in the offer, it should equal **offerRetailRate** (and, for prebook, the top-level **price**). So:

- **Use `price` (prebook) or `offerRetailRate` (rates) as the single total** for checkout, payment, and any “total price” display.
- **Do not** derive the total by summing per-room totals in our own code when the API provides this offer-level field.

---

## 3. Per-rate breakdown (API definitions)

| API field | Meaning (from LiteAPI) |
|-----------|------------------------|
| **`retailRate.total[0]`** | Total due to book **this room**. Includes commission and any taxes/fees with `included: true`. |
| **`retailRate.suggestedSellingPrice[0]` (SSP)** | Price the room is sold for publicly (hotel’s suggested minimum public price). Use when displaying “public” or “list” price. |
| **`commission[0]`** | Commission amount (seller’s margin) for this rate. |
| **`retailRate.taxesAndFees[]`** | Taxes/fees. `included: true` ⇒ already in `retailRate.total`; `included: false` ⇒ pay at property. |

So conceptually:

- **Retail total (per room)** = amount customer pays for that room = base/selling component + commission + included taxes/fees.
- **SSP** = hotel’s suggested public selling price (for display/compliance; see Revenue Management).

---

## 4. Revenue management and margin (LiteAPI)

- **Margin** — Percentage commission the seller earns. Passed in rates calls or taken from **account default**.  
  - **Current setup:** **10% margin** is set in the backend (account commission settings).  
  - `margin: 0` → net rate (no commission). Any other value → commission added to the rate; seller earns that margin.
- **Suggested Selling Price (SSP)** — Hotel’s recommended **minimum** selling price.  
  - **At or above SSP** → OK to show and sell publicly.  
  - **Below SSP** → only in closed user groups (e.g. app-only, logged-in users, bundled offers) to avoid rate violations.

So our 10% margin is applied to the rate; the resulting **retail** total is what the customer pays, and the **commission** in the response is our earnings from that margin.

---

## 5. Our website convention (display)

We follow the API provider’s best practice and show:

- **Total for the booking** — Always from **offer-level** `price` (prebook) or `offerRetailRate` (rates), plus `currency`. Use for checkout total, payment, and any “total” for that offer.
- **Per-room breakdown** (if we show it):
  - **“Price before taxes and fees”** (selling price) — The room price before our commission and before taxes/fees.  
    - **Option A (recommended):** `sellingPrice = retailRate.total[0].amount - commissionTotal - includedTaxesAndFeesAmount` (same currency).  
    - **Option B:** Use **`retailRate.suggestedSellingPrice[0].amount`** as the “public/suggested price” when we want to show SSP; then “taxes and fees” below would be `retailRate.total[0].amount - suggestedSellingPrice[0].amount` (one combined line for our commission + taxes).
  - **“Taxes and fees”** (one line) — **Commission + taxes** for that room:  
    - `(commission[0].amount ?? 0) + sum(retailRate.taxesAndFees[] where included, by amount)` (same currency).  
    - Only include amounts that are already in the retail total (`included: true`); exclude pay-at-property if we show “price before taxes and fees” as above.

So on the site we show one “selling price” and one “taxes and fees” total per room, and one **offer-level total** for the booking.

---

## 6. Sample (prebook) — quick reference

- **Offer level**
  - `price`: **16558.64** EGP ← use as **checkout total**
  - `currency`, `offerId`, `checkin`, `checkout`, `rooms`, etc.

- **Per rate (e.g. 2 rates = 2 rooms):**
  - `retailRate.total[0].amount`: **8279.31** EGP (per room) → 2 × 8279.31 ≈ 16558.62 ≈ `price`
  - `retailRate.taxesAndFees[0].amount`: **653.14** EGP, `included: true`
  - `retailRate.suggestedSellingPrice[0].amount`: **7526.65** EGP (SSP)
  - `commission[0].amount`: **752.65** EGP

So: **offer-level `price`** = total to charge; **per-room `retailRate.total`** = total for that room (includes commission and included taxes). For display we derive “selling price” and “taxes and fees” as in section 5.

---

## 7. Summary table

| What | Where (API) | Use on website |
|------|-------------|----------------|
| **Pay now (all rooms)** | Prebook: `price` + `currency`. Rates: `offerRetailRate`. | Amount customer pays online; equals sum of `retailRate.total` (excludes pay-at-property). |
| **Total (all rooms)** | Pay now + local fees. | Checkout “Total” when local fees exist; otherwise same as Pay now. |
| **Included taxes and fees** | Commission + `retailRate.taxesAndFees[]` where `included: true`. | Checkout line “Included taxes and fees” (with optional info icon). |
| **Local fees** | `retailRate.taxesAndFees[]` where `included: false`. | Checkout “Local fees” and “Pay at property”; show only if > 0. |
| **Base (rooms × nights)** | Pay now − included taxes and fees. | Checkout “X room(s) × Y night(s)” line. |
| **Offer identifier** | `offerId` | Prebook, book, and all flows tied to this price. |
| **Margin** | Account default (backend). | Drives commission in the response. |

## 8. Checkout and results display (reference alignment)

- **Results (hotel cards):** Show **price per night** as the main amount (e.g. “E£19,711 / night”), then one line: “{nights} night(s), {rooms} room(s), incl. taxes & fees” (or “+ taxes & fees” if not included). No breakdown on the card.
- **Checkout (price summary):** Order: (1) “X room(s) × Y night(s)” → base amount; (2) “Included taxes and fees” (i) → amount; (3) “Local fees” (i) → amount if any; (4) “Total” → Pay now + Local fees; (5) “Pay now” → prebook `price`; (6) “Pay at property” → local fees amount if any, with disclaimer about exchange rate.

No implementation changes in this doc; it is the reference for consolidating pricing and calculations across the site.
