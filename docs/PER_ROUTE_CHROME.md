# Per-route chrome (reference)

Applied after Implementation Plan: Header Removal and Bottom Nav (Phases 1–4).

## Route rules

| Route | Top chrome | Bottom chrome | Notes |
|-------|------------|---------------|-------|
| **Home (`/`)** | Collapsible header: full logo (left), Profile (right). Safe area top. | Bottom nav: Home \| Search \| Profile. Collapses on scroll down. Safe area bottom. | Header + nav both collapse on scroll. |
| **Results (`/results`)** | No header. Pill row only: back + pill + filters. Safe area top. | Same bottom nav. Collapses on scroll. | Search opens SearchModal; Profile → `/profile`. |
| **Profile (`/profile`)** | In-page header: back to **Home** + "Profile" title. Safe area top. | Bottom nav (same). Profile tab highlighted. Back goes to Home to avoid Profile ↔ Login loop. | Search in nav opens Home. |
| **Login (`/login`)** | In-page: back (top left) to Profile. | Bottom nav (same). Profile tab highlighted. | Search in nav opens Home. |
| **Hotel detail (`/hotel/[hotelId]`)** | Back button only (top left). | None. | Future: hovering CTA out of scope. |
| **Checkout / Confirmation** | In-page header only. | None. | No search bar, no bottom nav; scope when building. |

## Z-index (stack order, low → high)

- **z-10:** Results pill row, Profile header, Hotel detail header, in-page sticky sections.
- **z-20:** Bottom nav (Home + Results only).
- **z-30:** Home header.
- **z-50:** Modals (SearchModal, filter panel, date picker overlay). Profile and Login are full routes, not overlays.

Modals (z-50) always sit above header and bottom nav so chrome never covers modal content.

## Safe areas

- **Bottom nav:** `pb-[max(0.5rem, env(safe-area-inset-bottom))]`.
- **Headers / pill row:** `pt-[max(0.75rem, env(safe-area-inset-top))]` (or equivalent) for notched devices.

## Profile page = settings

Single destination for account, language, and currency. Guest default with "Log in"; when logged in: account info, Log out, Language, Currency. No separate Settings; Home header "Profile" and bottom nav "Profile" both go to `/profile`.
