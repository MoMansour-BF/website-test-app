# Implementation Plan: Grouped Room Types + Checkout Summary

## Part 1: Hotel Page – Grouped Room Types (existing plan)

### 1.1 Goals
- **Group by room type**: One card per room type (e.g. “Twin Beds Garden View”). Tapping expands to show all rate options (board + refundability) and room details.
- **Clear multi-room naming**: When the stay is for 2+ rooms, card title shows e.g. **“2x Twin Beds Garden View”** so the price is clearly for 2× that room type.
- **Room details in expanded view**: In the expanded section, show room info (size, description, beds, amenities) from the API, Booking.com-style.

### 1.2 Data model
- **Grouping key**: `mappedRoomId` from rates API. All offers sharing the same `mappedRoomId` form one **RoomGroup**.
- **RoomGroup**: `roomId`, `roomName`, `displayName` (with "Nx " prefix when `occupancies.length > 1`), `image`, `offers: RoomTypeOffer[]`.
- **RoomTypeOffer**: `offerId`, `boardName`, `totalAmount`, `currency`, `taxIncluded`, `refundableTag`, `cancelTime`, etc. (for each rate row and `handleSelectOffer`).
- **HotelDetails.rooms**: Extend with optional `description`, `roomSizeSquare`, `roomSizeUnit`, `maxOccupancy`, `bedTypes`, `roomAmenities` (LiteAPI returns these when available).

### 1.3 Build grouped list
- From `ratesData`, iterate `hotel.roomTypes`; for each, get `mappedRoomId` from first rate and room name from `details.rooms` or rate.
- Group by `mappedRoomId`; push normalized offer into that group’s `offers` array.
- Set `displayName = (occupancies.length > 1 ? `${occupancies.length}x ` : '') + roomName`.

### 1.4 UI – room type cards
- **Collapsed**: One card per room group — thumbnail, `displayName`, optional “From {currency} {minPrice}”.
- **Expanded**: Room details block (size, description, beds, occupancy, amenities) + list of rate rows (board, refundability, price, Select). State: `expandedRoomId: number | null`.

### 1.5 Select and checkout
- `handleSelectOffer(offer)` unchanged: receives one offer (one `offerId`), navigates to checkout with existing params.

---

## Part 2: Checkout Page – Summary (reference: Booking-style image)

Update the checkout summary so it matches the reference layout and information density.

### 2.1 Reference elements (from image)
- **Hotel header**: Hotel thumbnail image, name, full address with map-pin icon, rating badge (e.g. “9.2 Wonderful (1,457)”), star rating.
- **Stay dates**: Single line: “Jun 1, 2026 - Jun 8, 2026 (7 nights)”.
- **Tabs**: “Your Rooms” (active) and “Important Information”.
- **Room and guest block**:
  - **Room line**: “2 x Deluxe Room, 1 King Bed, No meals included” — i.e. **“{roomCount} x {roomName}, {boardName}”**.
  - **Occupancy**: “2 Adults, 1 Adult” — one segment per room (e.g. “X Adults” or “X Adults, Y Children” per room).
  - **Cancellation**: “Cancellation Policy” link (e.g. opens modal or scrolls to policy).
  - **Average price**: “£21,067.80 average per room/night”.
- **Price summary**:
  - “2 rooms x 7 nights” → base amount.
  - “Included taxes and fees” → amount (with info icon if needed).
  - “Local fees” → amount (if applicable).
  - “Total” → total amount.
  - “Pay now” → final amount (with icon).

### 2.2 Data already available on checkout
- **From prebook**: `roomTypes[0].rates[]` (name, boardName, retailRate, cancellationPolicies). For multi-room, `rates` has one entry per occupancy; room name/board can be taken from first rate (same offer = same room type and board).
- **From hotel details fetch**: `name`, `address`, `city`, `country`; can extend to `hotelImages` (thumbnail), `starRating`, `rating`, `reviewCount` for the header.
- **From URL**: `checkin`, `checkout`, `occupancies` (parsed). So: room count = `occupancies.length`, nights = computed, guests = `totalGuests(occupancies)`.
- **Occupancy per room**: `occupancies[i]` gives adults (and children) for room `i + 1`; display e.g. “2 Adults, 1 Adult” or “2 Adults, 1 Child” per room.

### 2.3 Checkout summary – implementation tasks

1. **Hotel summary header (Booking-style)**
   - Fetch or pass hotel image (e.g. first from `hotelImages` or `main_photo` from details) and show a small thumbnail next to the hotel name.
   - Show hotel name prominently, then address line with map-pin icon: “{address}, {city}” or “{city}, {country}”.
   - If `rating` and `reviewCount` exist, show a badge: “{rating} Wonderful ({reviewCount})” (or similar wording).
   - If `starRating` exists, show star icons (e.g. ★★★★).

2. **Stay dates line**
   - Format as: “{formattedCheckin} - {formattedCheckout} ({nights} nights)”.
   - Use short date format (e.g. “Jun 1, 2026”) for consistency with reference.

3. **“Your Rooms” section**
   - Section title: “Your Rooms” (and optionally a second tab “Important Information” — can be placeholder or link to policy text).
   - **Room line**:  
     `{occupancies.length} x {roomName}, {boardName}`  
     e.g. “2 x Deluxe Room, 1 King Bed, No meals included”.  
     Use prebook’s first rate for `name` and `boardName` (same for all rates in the offer when it’s one room type).
   - **Occupancy line**:  
     Per-room breakdown: `occupancies.map(o => `${o.adults} Adult(s)${o.children?.length ? `, ${o.children.length} Child(ren)` : ''}`).join(', ')`  
     or similar, e.g. “2 Adults, 1 Adult”.
   - **Cancellation**:  
     Keep or add a “Cancellation Policy” control (link or button) that shows cancel deadline and refundability (from prebook’s `cancellationPolicies`).
   - **Average per room/night**:  
     `total.amount / (nights * occupancies.length)` when `nights > 0` and `occupancies.length > 0`, e.g. “{currency} X,XXX average per room/night”.

4. **Price breakdown**
   - Line 1: “{occupancies.length} rooms x {nights} nights” → base amount (use offer total; if taxes are itemized, base = total − included taxes − local fees; otherwise base = total).
   - If API returns included taxes/fees as a separate amount: “Included taxes and fees” → amount.
   - If “local fees” or pay-at-property fees are returned: “Local fees” → amount.
   - “Total” → total amount.
   - “Pay now” → same total (or payment-specific amount if different), with a small icon.

5. **Types and prebook**
   - Ensure `PrebookPayload` / hotel-details response can carry: `roomTypes[].rates[]` (name, boardName), and optionally per-rate or offer-level tax/fee breakdown if we want to show “Included taxes and fees” and “Local fees” separately. If the API only returns a single total and “taxes included” flag, show “Total (incl. taxes)” and “Pay now” as today, and add the “X rooms x Y nights” and “average per room/night” lines.

6. **Mobile layout**
   - Keep single-column layout; order: Hotel header (image + name + address + rating) → Stay dates → Your Rooms (room line, occupancy, cancellation, average) → Price breakdown → Guest details → Pay.

### 2.4 Edge cases
- **Single room**: Room line is “1 x {roomName}, {boardName}” or just “{roomName}, {boardName}” (choose one for consistency; “1 x” is clearer for parity with multi-room).
- **Missing rating/reviewCount**: Omit badge and stars.
- **Missing address**: Show only city/country.
- **Taxes/fees**: If only “included” flag is present, show “Total (incl. taxes)” and one “Pay now” line; no separate “Included taxes and fees” row unless the API provides an amount.

---

## Implementation order (combined)

1. **Hotel page**: Types, `roomGroups` derivation, collapsed/expanded room cards, “Nx ” naming, room details block (Part 1).
2. **Checkout**: Extend hotel details usage (image, rating, stars), then implement summary sections (hotel header, dates, Your Rooms with room line + occupancy + cancellation + average, price breakdown with “X rooms x Y nights” and Pay now) per Part 2.
3. **Polish**: Accessibility (e.g. aria-expanded on room cards), “Important Information” content if needed, and any copy/UX tweaks.
