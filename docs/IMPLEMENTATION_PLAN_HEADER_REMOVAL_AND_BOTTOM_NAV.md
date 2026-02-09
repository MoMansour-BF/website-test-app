# Implementation Plan: Per-Route Chrome — Home Header, Results Pill + Bottom Nav

**Scope:** Replace the global top header with **per-route chrome**. **Homepage:** collapsible header (full logo left, login right) **+ same bottom nav as results**. **Search list (results):** no header; pill-shaped search bar row (back + pill + filters) + **collapsible bottom nav**. **Hotel detail, checkout, confirmation:** notes only for future implementation.

**Bottom nav (Home + Results):** Home (highlighted on homepage, routes to `/` from list) | Search (opens SearchModal) | **Profile** (navigates to **Profile page** — same as “settings”: one brand-aligned page with guest state, login option, language, and currency).

**Reference:** User-provided image — pill-shaped search bar with back left, filters right. Brand design language: Journeys by Breadfast (tokens in `app/globals.css`, font stack Delight/Outfit).

**No implementation in this doc — plan and phases only. Do not implement hotel detail CTA, checkout, or confirmation chrome yet.**

**Note:** Phase 1 is already implemented. Phase 1.5 and subsequent phases refine and extend it.

---

## 0. Brand design language (reminder)

- **Typography:** `font-family: 'Delight', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (already in `body`, `app/globals.css`).
- **Tokens:** `--primary` (#057A5A), `--primary-hover`, `--dark-text`, `--light-bg`, `--ocean-blue`, `--sky-blue`, `--muted`, `--muted-foreground`, `--radius`. Light mode default.
- **Motion:** Use existing `--modal-enter-duration`, `--expand-duration`; respect `prefers-reduced-motion` for collapse/expand.
- **Consistency:** All chrome (header, pill bar, bottom nav) must use these tokens and font.

---

## 1. Per-route chrome (target state)

| Route | Top chrome | Bottom chrome | Notes |
|-------|------------|----------------|-------|
| **Home (`/`)** | **Collapsible header:** full logo (top left), **Profile** (top right → Profile page). | **Same bottom nav:** Home (highlighted) \| Search (opens SearchModal) \| **Profile** (→ Profile page). | Header + bottom nav both collapse on scroll. |
| **Results (`/results`)** | No header. **Pill row only:** back + pill-shaped search bar + filters. | **Same bottom nav:** Home (→ `/`) \| Search (opens SearchModal) \| **Profile** (→ Profile page). | Bottom nav collapses on scroll. |
| **Hotel detail (`/hotel/[hotelId]`)** | **Back button only** (top left). | None. **Future:** hovering CTA “Select room” (not in scope). | Hotel detail will be fully revamped. |
| **Checkout / Confirmation** | In-page header only. | None. | No search bar, no bottom nav; scope later. |

**Profile page (same as “settings”):** One brand-aligned page (e.g. `/profile`). **Default:** shows **Guest** state (e.g. “Guest” or “You’re browsing as a guest”) with an **option to log in** (demo login — update how it looks for the demo). **Also on the page:** **Language** (en/ar) and **Currency** editing. When logged in: account info (name, email, etc.), Log out, plus Language and Currency. The home header right control is **Profile** (links to this page; when guest it can show “Log in” or “Profile” and still go to the Profile page where they can log in).

---

## 2. Homepage — collapsible header + bottom nav

### Design spec

- **Top (header):**
  - **Left:** Full logo. **Right:** **Profile** (links to Profile page; when guest can show “Log in” or “Profile”; when logged in, avatar or “Profile” — same destination: the Profile page).
  - Header **collapses on scroll down**, **reappears on scroll up**; respect `prefers-reduced-motion`.
- **Bottom:** **Same bottom nav as results** (see Section 3). Three items: Home (highlighted when on `/`), Search (opens SearchModal), **Profile** (navigates to Profile page). Collapses on scroll down, reappears on scroll up.
- **Styling:** Header and nav use brand tokens and font. Nav: `fixed bottom-0`, white, border-top, safe-area inset.
- **Where:** Home only for the header; home and results for the bottom nav (same component, route-aware).

### Implementation focus

- Home shows **HomeHeader** (logo + login/profile) and **BottomNav** (shared with results). Content has bottom padding for the nav. Collapse behaviour applies to both header and nav on home.

---

## 3. Search list page (results) — no header, pill row + collapsible bottom nav

### Top: pill-shaped search bar row (no header)

- **Layout (one row):** Back (left) | Pill bar (destination, dates · guests; opens SearchModal) | Filters (right). List controls below. No logo, no login on this page.

### Bottom: collapsible bottom nav (shared with Home)

- **Content (three items):**
  - **Home:** Links to `/`. **Highlighted when on homepage** (`/`); not highlighted on results. Icon + label “Home”.
  - **Search:** Opens **SearchModal** (no navigation). Icon + label “Search”.
  - **Profile:** **Navigates to the Profile page** (`/profile`). Icon + label “Profile”. Same page as “settings” — one destination for account, language, and currency (see Section 3.1).
- **Behaviour:** Collapses on scroll down, reappears on scroll up. Same styling as on home.
- **Where:** Rendered on **Home** and **Results** only (same component; pathname used for Home highlight and for where Search modal is anchored).

### 3.1 Profile page (same as settings)

- **One page** at `/profile`. Brand-aligned; uses design tokens and font. **Profile and “settings” are the same thing** — this page holds everything.
- **Default (guest):** Show **Guest** state clearly (e.g. “You’re browsing as a guest” or “Guest”). Provide an **option to log in** (demo login as currently supported; **update how it looks** so the login entry point is clear and on-brand). No separate “Settings” menu — this page is the only place for account + locale.
- **When logged in:** Account info (name, email, user type, etc.), **Log out**, plus the same Language and Currency controls.
- **Always on the page (guest or logged in):** **Language** (en/ar) and **Currency** editing — same behaviour as current AppHeader (e.g. `LocaleCurrencyContext`); style to match the page.
- Home header right control is **Profile** (links here; when guest, label can be “Log in” or “Profile” — either way navigation goes to Profile page where they can log in).

---

## 4. Hotel detail page — back only; future CTA (notes only, no implementation)

- **Target:** Back button only (top left). No header, no bottom nav. **Future:** hovering CTA “Select room” when page is revamped. No implementation in this plan.

---

## 5. Checkout and confirmation — no search, no bottom nav (notes only, no implementation)

- No search bar, no bottom nav. In-page header only. Scope when building those flows.

---

## 6. Phased implementation plan (Home + Results)

### Phase 1: Route-aware layout and results bottom nav — **IMPLEMENTED**

**Goal:** Remove global AppHeader. Results gets fixed bottom nav (Home, Search, Profile). Home gets header (logo + login). No collapse yet.

**Status:** Done. Results have bottom nav; home has header. Bottom nav is results-only in this phase; Profile is placeholder.

---

### Phase 1.5: Bottom nav on Home + Profile page (replaces Profile placeholder)

**Goal:** Use the **same bottom nav on the homepage** as on the results page. The third item stays **“Profile”** and **navigates to the Profile page** (`/profile`). Profile page is **the same as settings**: one brand-aligned page with guest (default), login option (demo; update how it looks), language, and currency. Home header right = **Profile** (links to this page).

**Tasks:**

1. **Bottom nav on Home**
   - Render the **same** bottom nav component on the **home page** (e.g. via LayoutClient pathname or home page composition). Reuse the same three-item nav; ensure Home and Results both get it so one shared `BottomNav` is used on `/` and `/results` only.

2. **Home item: active state**
   - **Home** tab: **Highlighted** when current route is `/` (e.g. primary colour or bold). When on `/results`, Home is not highlighted and tapping it navigates to `/`.

3. **Profile item → Profile page**
   - Third bottom nav item: **Profile** (icon + label). Tapping it **navigates to `/profile`** (the Profile page). No separate “Settings” — Profile page is the single destination for account, language, and currency.

4. **Profile page (same as settings)**
   - Add **Profile page** at `/profile`. Brand-aligned layout; design tokens and font.
   - **Default (guest):** Show **Guest** state (e.g. “You’re browsing as a guest”). Provide an **option to log in** — demo login as-is, but **update how it looks** (clear, on-brand entry point; e.g. primary button “Log in” or “Sign in”).
   - **Always on page:** **Language** (en/ar) and **Currency** selectors — reuse `LocaleCurrencyContext` and behaviour from `AppHeader`; style to match the page.
   - **When logged in:** Account info (name, email, etc.), **Log out**, plus the same Language and Currency. Reuse `AuthContext`.

5. **Content padding on Home**
   - Home page main content must have **bottom padding** (e.g. `pb-20` or `pb-24`) so content is not covered by the fixed bottom nav when visible.

6. **Home header right = Profile**
   - Home header right control: **Profile** (links to `/profile`). When guest, label can be “Log in” or “Profile” — either way it goes to the Profile page where they can log in. When logged in, “Profile” or avatar; same destination.

**Deliverable:** Bottom nav on both Home and Results. Home tab highlighted on `/`. Profile (bottom nav and header) goes to Profile page. Profile page: guest default with updated login look, language, currency; when logged in, account + log out + language + currency. No separate Settings; Profile is the single page.

---

### Phase 2: Home header (full logo + login/profile) and pill row consistency

**Goal:** Home has the proper collapsible header (full logo left, login/profile right). Results top row remains back + pill + filters with brand styling. Bottom nav is already on both routes after Phase 1.5.

**Tasks:**

1. **HomeHeader component**
   - Full logo (top left). Right: **Profile** (links to `/profile`; when guest can show “Log in” or “Profile”; when logged in, avatar or “Profile”). Collapsible on scroll (Phase 3). Used only on home.

2. **Home page**
   - Render `HomeHeader` at top and shared `BottomNav` at bottom. Hero and search card in between with bottom padding for nav.

3. **Results page**
   - Top block: back + pill (destination, dates · guests) + Filters only. List controls below. Brand styling. Bottom nav already present (Phase 1.5); ensure Search opens SearchModal and Profile links to Profile page.

4. **Search in BottomNav**
   - On both Home and Results, “Search” opens SearchModal (callback or context). On Home, modal can use default or last-used search state; on Results, current search params.

**Deliverable:** Home: full logo + Profile header + bottom nav. Results: pill row only + bottom nav. Profile page as in Phase 1.5 (guest, login option, language, currency). Brand design language applied.

---

### Phase 3: Collapse on scroll (home header + bottom nav on both routes)

**Goal:** Home header and bottom nav (on both Home and Results) collapse on scroll down and reappear on scroll up. Respect `prefers-reduced-motion`.

**Tasks:**

1. **Scroll detection**
   - Shared hook: scroll direction + threshold (e.g. 60px). Use on home for header and nav; on results for nav only.

2. **HomeHeader collapse**
   - Collapsed: translate off-screen (e.g. `translateY(-100%)`). Expanded: visible. Transition with `var(--expand-duration)`; in `prefers-reduced-motion: reduce`, no animation or always visible.

3. **BottomNav collapse (Home + Results)**
   - Collapsed: translate off-screen (e.g. `translateY(100%)`). Expanded: visible. Same transition and reduced-motion handling. Content padding unchanged so layout is stable when nav reappears.

4. **Accessibility**
   - Keyboard access; optional screen reader announcement for collapse/expand. When collapsed, ensure a way to expand (e.g. scroll up or minimal affordance).

**Deliverable:** Home header and bottom nav (both routes) collapse on scroll down, reappear on scroll up; reduced motion respected.

---

### Phase 4: Polish and edge cases

**Goal:** Safe areas, z-index, route rules, and Profile page (settings) experience documented and applied.

**Tasks:**

1. **Route rules**
   - Home = collapsible header + bottom nav. Results = pill row + bottom nav. Hotel detail = back only (no CTA in this plan). Checkout / confirmation = in-page only, no search, no bottom nav.

2. **Safe area**
   - Bottom nav: `env(safe-area-inset-bottom)`. Header: optional `env(safe-area-inset-top)` for notched devices.

3. **Z-index**
   - Header and pill row below modals. Bottom nav below SearchModal. Profile page is a full route; no overlay. Consistent scale.

4. **Profile page**
   - Profile page is the single “settings” destination: guest default (with updated login look), language, currency; when logged in, account + log out + language + currency. Home header “Profile” and bottom nav “Profile” both go here. No separate Settings; Profile = settings.

**Deliverable:** Documented per-route chrome; safe areas and z-index correct; Profile page (same as settings) consistent; no regressions.

---

## 7. Implementation order summary

| Phase | Focus | Outcome |
|-------|--------|--------|
| **1** | Route-aware layout, results bottom nav | **Done.** No global AppHeader. Results: pill row + BottomNav (Home, Search, Profile). Home: header (logo + login). |
| **1.5** | Bottom nav on Home + Profile page | Bottom nav on **Home** and Results. Home tab highlighted on `/`. **Profile** (nav + header) → **Profile page** (same as settings): guest default, login option (updated demo look), language, currency. |
| **2** | Home header + pill row | HomeHeader full logo + login/profile. Results: pill row only. Brand styling. Bottom nav unchanged. |
| **3** | Collapse on scroll | Home header and bottom nav (both routes) collapse on scroll down, reappear on scroll up. |
| **4** | Polish | Safe areas, z-index, route rules, Profile page (settings) experience. |

---

## 8. Notes for future pages (reference when building)

### Hotel detail (`/hotel/[hotelId]`)

- **Top:** Back button only (top left). **Bottom:** No bottom nav. **Future:** hovering CTA “Select room” when revamping. Do not implement in this plan.

### Checkout (`/checkout`)

- No search bar, no bottom nav. In-page header only. Scope in a later plan.

### Confirmation (`/confirmation`)

- No search bar, no bottom nav. In-page header only. Scope in a later plan.

---

## 9. Out of scope / do not change

- **SearchModal:** No change to steps or API; only where it’s triggered (pill, bottom nav “Search”).
- **URL and API:** No new params; back links and search flow unchanged.
- **Auth, Locale, Currency:** Logic unchanged; placement on Profile page (same as settings).
- **Hotel detail revamp, checkout, confirmation:** No implementation of their chrome in this plan; notes only.

---

## 10. Dependencies and references

- **Brand:** `app/globals.css`; IMPLEMENTATION_PLAN_HOTEL_LIST_PAGE_DESIGN.md.
- **Current header:** `src/components/AppHeader.tsx` (reuse auth, language, currency for HomeHeader and Profile page).
- **Layout:** `src/components/LayoutClient.tsx` (route-based chrome; bottom nav on `/` and `/results`).
- **Home:** `app/page.tsx` (HomeHeader + BottomNav + padding).
- **Results:** `app/results/page.tsx` (pill row + BottomNav).
- **Profile:** `app/profile/page.tsx` (Profile page — same as settings; guest, login option, language, currency).
- **Figma:** `figma designs/src/app/components/HomePage.tsx`; `ListingsPage.tsx`.
- **Reference image:** Pill-shaped search bar with back (left), filters (right).

No code in this document — use it as the phased plan when implementing. Phase 1 is done; Phase 1.5 and beyond extend it. Do not implement hotel detail CTA, checkout, or confirmation chrome in this scope.
