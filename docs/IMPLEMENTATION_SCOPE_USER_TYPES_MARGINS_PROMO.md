# Implementation scope: user types, login, margins, and promo pricing

This document outlines a **phased implementation order** so we can add auth, user types, API key selection, margin control, and promotional pricing with **minimal rewrites** and clear dependencies.

**Context:**

- We have multiple LiteAPI keys: **B2C/public**, **CUG** (general), **Employees (CUG)**, **B2B (CUG)**.
- Goal: **Consolidate to two “channels”** — (1) **B2C** for guests, (2) **one CUG** for all logged-in users — and differentiate CUG behaviour by **user type** and **loyalty level** (e.g. Genius) via **margin** and **promo display**, not separate API keys per segment.
- When **user is not logged in (guest)** → use **B2C/public** API key; no below-SSP promo.
- When **user is logged in** → use **CUG** API key; resolve **user type** (member, employee, B2B) and **loyalty level** (e.g. Genius) → set margin; show promo (real and/or configured — see below).

**Placeholder until database is ready:** Implementation will use **placeholder / mock logic** (e.g. in-memory config, env-based defaults, or a small JSON/TS map) for segments and margin resolution until the actual database (Postgres) is set up. The code will be structured so that the same interface is used everywhere; once the DB is available, we swap in the real implementation. Updates will be provided when the database is ready.

---

## Design constraints and decisions

The following are fixed as part of the plan so the rest of the scope stays consistent.

### 1. Promo display: real vs configured (“fake”) discounts

- **SSP-based (real):** When retail &lt; SSP we show “Was SSP” / “Now retail” and “Save X%”. This is a true discount vs the hotel’s suggested public price.
- **Configured / “fake” discount (optional):** We may also want to show a strikethrough “was” price even when retail ≥ SSP, e.g. “10% member discount” by displaying a synthetic “was” (e.g. retail × 1.1) and “now” (retail). So:
  - **Option A:** A config/DB flag or value (e.g. `display_discount_percent: 10`) per user type/loyalty: UI shows “Was (retail × (1 + display_discount_percent/100))” / “Now retail” when we want to present a promo even without SSP.
  - **Option B:** We could pass **extra margin** (e.g. +10%) into the API only for a “list price” we never charge — but that would require two rate calls (list vs actual). Simpler: **one API call** with the real margin (what we charge); **display layer** optionally uses a “display discount %” to compute a synthetic “was” for UI only.

So: **margin sent to LiteAPI** = what we actually charge. **Promo UI** can be (a) real: was = SSP, now = retail when retail &lt; SSP, or (b) configured: was = retail × (1 + display_discount_percent/100), now = retail when we want a “fake” discount. Both can be supported; config/DB can control whether and how much “fake” discount to show per segment.

### 2. Margin from DB; single “final” column for the API

- User types, loyalty levels, and margins should be **configurable without code changes** (add/change user types, loyalty tiers, margins).
- Use a **database** as the source of truth. The **margin passed into the LiteAPI call** must come from a **single final column** (e.g. `effective_margin` or `final_margin`) — i.e. the result of whatever rules (user type, loyalty, account override, etc.) already resolved to one number per user/segment.
- So: we may have tables for user types, loyalty, overrides, etc., but the **resolver’s output** is “one row (or one record) that has **final_margin** (and optionally `additional_markup`, `display_discount_percent`).” No hardcoded margin matrix in code; the API call always reads the final value from the DB (or from a cached copy of that value keyed by user/segment).

### 3. Session and user data stored locally (app / offline-friendly)

- This product is **app-first**. Session and user data (session token, userId, userType, loyaltyLevel, and ideally the resolved **effective_margin** or the keys to look it up) should be **stored locally** so the app does not need to hit the network every time to know “who is this user?” or “what margin do they get?”.
- Flow: when online, sync session and user profile (and margin row if needed); when offline or on launch, read from **local store** (e.g. AsyncStorage, SQLite, or whatever the app uses). Margin resolver can use **cached** user type + loyalty (and optionally cached effective_margin) so rates requests can still send the right margin even if the backend is briefly unreachable, as long as we have a valid cached profile.
- Design so that **session + user profile (+ optional margin)** are one logical “identity blob” we persist and refresh when possible.

### 4. Breadfast integration + standalone + web

- The **same booking/pricing product** will run in three contexts:
  - **Inside Breadfast** — Embedded in an existing app (Breadfast) that already has logged-in users and user IDs. Data structure of Breadfast users is TBD; we must not assume it.
  - **Standalone** — As an independent app (own auth, own users).
  - **Web / desktop** — Possibly the same or a variant; same logic, possibly different auth/session storage.
- Therefore **auth and user identity must be abstracted**: we do not hardcode “we use NextAuth” or “we use Breadfast SDK” everywhere. Instead we define an **adapter (interface)** e.g. “Auth / User identity” with a small contract:
  - **getSession()** — is there a valid session? (and maybe session id / token).
  - **getUserProfile()** or **getUserIdentity()** — for the current user: `userId`, `userType`, `loyaltyLevel` (and optionally pre-resolved `effective_margin` or a segment key for DB lookup).
- **Implementations:**
  - **Breadfast:** Adapter that uses Breadfast’s SDK/API to get session and user; maps their user object to our `userId`, `userType`, `loyaltyLevel` (once we know their structure). May need a small mapping layer or a sync step that writes into our local store and/or our margin DB (e.g. Breadfast userId → our segment).
  - **Standalone:** Adapter that uses our own auth (e.g. NextAuth, Clerk) and our own DB for user type/loyalty.
  - **Web:** Same as standalone or Breadfast, depending on deployment; session storage differs (e.g. cookies vs local storage) but the adapter hides that.
- **Margin and promo logic** stay identical; only the **source of “who is the user?”** (and where we persist it) changes. So: design Phase 1 around this adapter and local storage, not a single auth provider.

---

## Data model: segments and resolution (DB structure)

We need a place to define **who gets which margin** and **how we decide who is who**. A **database** is the right fit: you can add user types, domains, loyalty tiers, and B2B accounts without code deploys; you get a single **effective_margin** (and related columns) per segment; and you can support an admin UI and audit later. Config files or feature-flag services alone don’t handle “domain → segment” and “per-account override” as cleanly; a DB plus optional feature flags for A/B is a solid pattern used by many OTAs.

Below is a **segment-centric** model: one table of **segments** (each row = one pricing bucket with a final margin), and one table of **rules** that resolve “this user” → **segment**. Resolution runs in a fixed **priority order** (e.g. B2B account override first, then email domain, then user type + loyalty, then default). Until the database is provisioned, the same contract (segment + rules → effective_margin) is implemented with **placeholder logic** (e.g. in-memory or config); the real DB will be plugged in once it is set up.

### 1. Why a DB (and when to add something else)

- **DB:** Source of truth for segments and **effective_margin** (and promo knobs). Good for: domain rules (@breadfast.com, .edu), user type + loyalty, B2B account overrides, adding new rule types later (e.g. partner_code). No code change to add a domain or change a margin.
- **Optional later:** Feature-flag / config service (e.g. LaunchDarkly) for **dynamic overrides** (campaigns, A/B tests) that still resolve to a margin value; that value can be “use segment’s effective_margin” or an override. The API still receives one final margin per request; the DB (or cache) remains the place where “segment → effective_margin” lives.

### 2. Core tables

**segments**

| Column | Type | Purpose |
|--------|------|--------|
| `id` | PK (uuid or int) | Stable reference for rules and cache. |
| `name` | string | Human name, e.g. "Employee", "Member Genius", "B2B Travel Agency". |
| `effective_margin` | decimal/null | **The margin sent to LiteAPI.** Null = use account default. |
| `additional_markup` | decimal/null | Optional; LiteAPI `additionalMarkup` if needed. |
| `display_discount_percent` | decimal/null | Optional; for “fake” promo UI (synthetic “was” = retail × (1 + p/100)). |
| `is_cug` | boolean | If true, use CUG key and allow promo display. |
| `created_at`, `updated_at` | timestamp | Audit. |

- Every margin/promo change is “edit this row” or “add a new segment and a rule pointing to it”. The **API call always uses `effective_margin`** (and optional `additional_markup`) from the resolved segment row.

**segment_rules**

| Column | Type | Purpose |
|--------|------|--------|
| `id` | PK | — |
| `segment_id` | FK → segments.id | Which segment this rule assigns. |
| `rule_type` | enum/string | How we match: see below. |
| `rule_value` | JSONB or columns | Depends on rule_type. |
| `priority` | int | Lower = evaluated first. First match wins. |
| `created_at`, `updated_at` | timestamp | — |

**Rule types and `rule_value`**

- **`email_domain`** — Assign segment by email domain.
  - **Exact domain:** `rule_value = {"domain": "breadfast.com"}`. Match: normalize email (lowercase), extract domain after `@`, compare.
  - **Suffix (e.g. .edu):** `rule_value = {"suffix": "edu"}`. Match: email’s domain part ends with `.edu` (e.g. `user@uni.edu`).
  - Lets you add new domains (breadfast.com, edu, company.com) without code.

- **`user_type_loyalty`** — Assign segment by (user_type, loyalty_level) from the auth adapter or from your own profile.
  - `rule_value = {"user_type": "member", "loyalty_level": "genius"}`. Optional: allow null loyalty to mean “any” (e.g. `{"user_type": "member"}`).
  - Use when Breadfast (or your auth) sends user_type/loyalty and you want “member + genius → this segment”.

- **`b2b_account`** — Per-account override (e.g. travel agency).
  - `rule_value = {"account_id": "uuid-or-external-id"}`. Match: current user’s `account_id` (or org id) equals.
  - “Something else” for B2B: you can add more rule_type values later (e.g. `partner_code`, `company_domain`) and store the key in `rule_value`; resolution code just branches on `rule_type`.

- **`default`** (optional) — Single rule with highest priority number (e.g. 999) and no match condition: “if no other rule matched, use this segment”. Typically “Member” with your default margin.

### 3. Resolution order (recommended)

Inputs: `email` (or domain), `account_id` (if any), `user_type`, `loyalty_level` (from adapter or your DB).

1. Load all `segment_rules` ordered by `priority` ASC.
2. For each rule in order:
   - **b2b_account:** if `account_id` present and matches `rule_value.account_id` → return rule.segment_id.
   - **email_domain:** extract domain from email; if matches `rule_value.domain` (exact) or `rule_value.suffix` (domain ends with `.suffix`) → return rule.segment_id.
   - **user_type_loyalty:** if (user_type, loyalty_level) matches rule_value → return rule.segment_id.
3. If no rule matched, use **default** segment (the one with rule_type=default or the segment_id you define as default in config).
4. Load **segment** by id → return `effective_margin`, `additional_markup`, `display_discount_percent`, `is_cug`.

So: **B2B override first**, then **domain** (so @breadfast.com always gets employee even if provider says “member”), then **user_type + loyalty**, then **default**. Guest (no session) never hits the DB; channel = B2C, no segment.

### 4. Example data (sketch)

**segments**

| id | name | effective_margin | display_discount_percent | is_cug |
|----|------|------------------|---------------------------|--------|
| 1 | Employee | 5 | 10 | true |
| 2 | Member Genius | 7 | 5 | true |
| 3 | Member | 10 | 0 | true |
| 4 | B2B Travel Agency | 0 | null | true |
| 5 | Student (future) | 8 | 5 | true |

**segment_rules**

| segment_id | rule_type | rule_value | priority |
|------------|-----------|------------|----------|
| 4 | b2b_account | {"account_id": "agency-uuid-1"} | 10 |
| 1 | email_domain | {"domain": "breadfast.com"} | 20 |
| 5 | email_domain | {"suffix": "edu"} | 25 |
| 2 | user_type_loyalty | {"user_type": "member", "loyalty_level": "genius"} | 30 |
| 3 | default | {} or null | 999 |

Result: @breadfast.com → Employee (5% margin, 10% display discount); @uni.edu → Student; member + genius → Member Genius; travel agency by account_id → B2B; everyone else logged-in → Member.

### 5. Where user_type / loyalty come from

- **Option A — From provider (Breadfast):** Auth adapter returns user_type and loyalty_level; you use them in `user_type_loyalty` rules. Domain rules still run first so @breadfast.com → employee overrides provider.
- **Option B — From our DB only:** You have a **user_profiles** table (userId, email, user_type, loyalty_level, account_id, …). After login you sync from Breadfast (userId, email) and either (1) derive user_type from domain in code and write it to user_profiles, or (2) resolve segment by domain in segment_rules and don’t store user_type. For “display this user’s tier” in UI, you can store the resolved segment_id or segment name on the profile when you resolve.
- **Option C — Hybrid:** Domain → segment in DB; user_type/loyalty from Breadfast for rules that need them; optional user_profiles to cache resolved segment_id and margin for local storage so the app doesn’t hit the API every time.

### 6. Summary

- **DB** = segments (with **effective_margin** as the single “final” column for the API) + segment_rules (domain, user_type_loyalty, b2b_account, default).
- **Domain:** Use **email_domain** rules with `domain` (exact) or `suffix` (e.g. edu); add B2B via **b2b_account** or future rule types (partner_code, etc.).
- **Resolution:** Priority order (B2B → domain → user_type_loyalty → default); first match → segment → effective_margin (and promo fields). No hardcoded margins in code; all behaviour is data-driven.

---

## Phase 0: Decide and document API key strategy (no code)

**Goal:** Lock the key model so later phases don’t assume the wrong setup.

**Decisions:**

1. **Keys in use:**
   - **B2C key** — used for all **guest** (not logged-in) traffic. Default margin stays in LiteAPI dashboard for this account (e.g. 10%).
   - **CUG key** — used for all **logged-in** traffic. Margin will be **per-request** based on user type + loyalty (we pass `margin` / `additionalMarkup` in the API call). We do **not** maintain separate keys for “CUG”, “Employees”, “B2B”; one CUG key, behaviour by margin + UI.

2. **Environment:** Store two keys (e.g. `LITEAPI_KEY_B2C`, `LITEAPI_KEY_CUG`). Prebook/book and any other LiteAPI calls that are “in session” use the same key that was used for the rates call (so prebook must be called in a context where we know channel).

3. **Document** this in the repo (e.g. in this doc or a short “API keys” section) so everyone knows: guest = B2C key, logged-in = CUG key; segment = user type + loyalty, applied via margin and promo display.

4. **Single "is logged in" flag** — Key selection is determined by **one** flag: whether the user is logged in or not (derived from session status). There is no separate "is CUG" vs "is B2C" flag: **not logged in** ⇒ B2C key; **logged in** ⇒ CUG key. User type and loyalty are used only *after* we're on CUG (for margin and promo), not for choosing the key.

**Output:** Clear rule: “Which key do we use?” → guest → B2C; logged-in → CUG. No code changes yet.

---

## Phase 1: Auth + user identity (adapter, user type, loyalty, local storage)

**Goal:** We can reliably know “is this user logged in?” and, if yes, “what is their user type and loyalty level?” — in a way that works **inside Breadfast**, **standalone**, and **web**, with **session and user data stored locally** so the app doesn’t always need the network. No pricing or API key logic yet.

**Scope:**

1. **Auth / identity adapter (interface)** — Define a small contract that all environments implement:
   - **getSession()** — returns session or null (guest). Session may include token / userId for the host (Breadfast or our own backend).
   - **getUserProfile()** (or **getUserIdentity()**) — for the current user: `userId`, `userType`, `loyaltyLevel`. Source depends on implementation (Breadfast API, our DB, JWT, etc.).
   - Implementations:
     - **Standalone / web:** Our own auth (e.g. NextAuth, Clerk) and our own DB or JWT for user type/loyalty.
     - **Breadfast:** Adapter that calls Breadfast’s APIs/SDK to get session and user; maps their response to our `userId`, `userType`, `loyaltyLevel` (mapping TBD when Breadfast data structure is known). May need a backend bridge that “translates” Breadfast user → our segment.
   - API routes and app code use the **adapter**, not a specific provider, so swapping Breadfast vs standalone only swaps the implementation.

2. **User type and loyalty level** — For each logged-in user we need `userType` (e.g. member, employee, b2b) and `loyaltyLevel` (e.g. none, genius). These may live in **our DB** (keyed by userId from Breadfast or our auth) so we can add/change user types and loyalty without changing Breadfast. Adapter then returns whatever our system considers “current user profile” (from DB or from Breadfast + mapping).

3. **Local storage of session + user data** — For the app (and optionally web):
   - After login or session refresh, **persist** session + user profile (userId, userType, loyaltyLevel) to **local store** (e.g. AsyncStorage, secure store, or cookies on web).
   - On app launch or when needing “current user”, read from local store first; optionally refresh from network when available. Margin resolver (Phase 3) can use this cached profile so we don’t block on the network every time.
   - Design so the same “identity blob” (session + profile) is what we store and what the adapter exposes (server can read from request/session; app can read from local store and optionally sync with server).

4. **Guest** — No session ⇒ treat as guest. No user type or loyalty; we’ll use this later for “channel = B2C”.

**Deliverables:**

- Auth/identity **adapter interface** and at least one implementation (standalone or placeholder for Breadfast).
- Login / sign-up (and logout) working for standalone (and contract ready for Breadfast).
- Session and user profile available server-side (e.g. from adapter in API routes) and on the client.
- **Local storage** of session + user profile so the app can use identity without always being online.
- A way to get `{ userId, userType, loyaltyLevel }` for the current user when logged in.

**What we do *not* do yet:** Change which API key we use, change margin, or show promo pricing. Rates continue to use the current single key and default margin.

**Why first:** Every later phase depends on “who is this user?”. The adapter + local storage design ensures we can plug in Breadfast later and support app + web without rewrites.

---

## Phase 2: API key selection by channel (guest vs logged-in) ✅ Implemented

**Goal:** Rates (and any other LiteAPI calls that depend on “channel”) use the correct key: **B2C key for guests, CUG key for logged-in**.

**Scope:**

1. **Resolve channel** — In every API route that calls LiteAPI (rates search, hotel rates, and later prebook/book if they must use the same key):
   - If no valid session (or no session) → **channel = `b2c`**.
   - If valid session → **channel = `cug`**.

2. **Select key** — Use `LITEAPI_KEY_B2C` when channel is `b2c`, `LITEAPI_KEY_CUG` when channel is `cug`. Pass the chosen key into your LiteAPI client/request (e.g. `liteapi.ts` accepts an optional key override, or you have two clients).

3. **Prebook / book** — Use the **same channel/key** as the user’s journey. So when the user clicks “book” from a CUG session, the prebook and book calls must use the CUG key. Easiest: prebook/book run in the same request context as rates (same session), so they use the same “resolve channel → key” logic. No need to pass key from client; server resolves from session.

4. **No margin changes yet** — Keep using the account default margin for each key (e.g. B2C dashboard 10%, CUG dashboard whatever it is). Do **not** pass `margin` or `additionalMarkup` in the request yet.

**Deliverables:**

- Rates search and hotel rates use B2C key for guests, CUG key for logged-in.
- Prebook (and book) use the same key as the session’s channel.
- Env: `LITEAPI_KEY_B2C`, `LITEAPI_KEY_CUG` (or equivalent).

**Why this order:** Validates “two keys, two channels” with minimal behaviour change (only which key is used). Margin logic comes next so we don’t mix “key selection” and “margin resolver” in one big step.

---

## Phase 3: Margin resolver (DB with final margin column) ✅ Implemented (placeholder)

**Goal:** For **CUG** requests, the **margin passed into the LiteAPI call** comes from a **DB record with a single final column** (e.g. `effective_margin`). User types, loyalty, and overrides are configurable in the DB; no hardcoded margin matrix in code. B2C stays on account default (no margin param).

**Placeholder first, then DB:** Implement the margin resolver with **placeholder logic** until the database is set up (e.g. a function that returns fixed or config-driven values for `userType` + `loyaltyLevel` → `effective_margin` / `display_discount_percent`, matching the same output shape). All call sites use a single interface (e.g. `getMarginForRequest(session, channel)`). When the real DB (Postgres, segments + segment_rules) is available, replace the placeholder implementation with the DB-backed one; no changes to callers. Updates will be provided once the database is ready.

**Scope:**

1. **DB as source of truth** (or placeholder that mimics it) — Store user types, loyalty levels, and margin rules in the **database**. Schema can evolve (add user types, loyalty tiers, per-account overrides). The critical point: the value we send to LiteAPI must be read from a **final / effective column** (e.g. `effective_margin`, or `final_margin`) — i.e. the result of your rules (user type + loyalty + any overrides) resolved to one number per user/segment. That column is what the resolver returns; no formula in code that builds margin from multiple columns.

2. **Resolver logic** — Inputs: `channel`, `userId?`, `userType?`, `loyaltyLevel?`, optional `accountId` (e.g. for B2B). Output: `{ margin?: number, additionalMarkup?: number, displayDiscountPercent?: number }` (the last for optional “fake” promo in Phase 5).
   - If channel is `b2c`: return nothing (use LiteAPI account default).
   - If channel is `cug`: look up the **one row/record** that applies (e.g. by userType + loyaltyLevel, or by userId/accountId override). Read **effective_margin** (and optional additional_markup, display_discount_percent) from that record. Return those. No hardcoded fallbacks; if no row found, define a safe default (e.g. in DB as a “default” segment) or fail closed.

3. **Use in rates routes** — In rates search and hotel rates:
   - After resolving channel and selecting key, if channel is `cug`, call margin resolver (with session’s userId, userType, loyaltyLevel).
   - Pass returned `margin` (and `additionalMarkup` if present) into the LiteAPI request body.
   - Optionally cache the resolved margin in the user’s local profile so the app can send it or display “member price” without hitting the DB every time (refresh when session/profile is refreshed).

**Deliverables:**

- DB table(s) for segments (user type, loyalty, etc.) with a **final column** (e.g. `effective_margin`) used for the API call.
- `getMarginForRequest(session, channel)` that reads from DB and returns `{ margin, additionalMarkup?, displayDiscountPercent? }`.
- CUG users get margin from DB; guests unchanged. Margins and segments are editable without code deploy.

**Why here:** Promo display (Phase 5) needs the right retail and SSP; retail is correct only if we send the right margin. Margin from a single DB column keeps rules flexible and code simple.

---

## Phase 4: Expose “show promo pricing” and promo type (CUG) to the front-end

**Goal:** The UI knows when it’s allowed to show a “was / now” promo and **which kind**: (a) **real** (SSP-based: retail &lt; SSP), or (b) **configured** (e.g. “display 10% off” using a synthetic “was” from `displayDiscountPercent`). CUG only.

**Scope:**

1. **Rules for showing promo:**
   - **Real discount:** User is CUG, we have SSP and retail, and **retail &lt; SSP** → show “Was SSP” / “Now retail” / “Save X%”.
   - **Configured (“fake”) discount:** User is CUG, we have retail, and the segment has **display_discount_percent** (from Phase 3 DB) set (e.g. 10) → show “Was (retail × (1 + display_discount_percent/100))” / “Now retail” / “Save display_discount_percent%”. No SSP required. This is optional; if the column is null/zero, don’t show fake discount.
   - Both can be supported: e.g. if retail &lt; SSP we use real; else if display_discount_percent is set we use fake; else no promo.

2. **What the client needs:** (a) “Is user CUG?” (from session/adapter). (b) Per offer: retail, SSP (for real promo). (c) Per segment (or from API): optional `displayDiscountPercent` (for fake promo). So the client (or API response) must have access to `displayDiscountPercent` when we want to show fake discount — e.g. from the margin resolver response cached in profile, or from a small “promo config” in the rates API response.

3. **Data:** Offer-level **retail** and **SSP** in the data the UI receives (LiteAPI: `offerRetailRate`, `suggestedSellingPrice`). For configured discount, client needs `displayDiscountPercent` (from resolver/DB, or passed in API response for CUG).

**Deliverables:**

- Clear rules: “show real promo” = CUG + retail &lt; SSP + SSP exists; “show configured promo” = CUG + display_discount_percent set + retail exists.
- Client (or server response) has what it needs to decide “show promo” and “use SSP vs synthetic was”. No UI change yet.

---

## Phase 5: Promo pricing UI (was / now, % off — real and configured)

**Goal:** Where we show a price (results list, hotel page, optionally checkout), show “Was X” (struck through), “Now retail”, and “Save Z%” when Phase 4 conditions are met — either **real** (was = SSP) or **configured** (was = retail × (1 + display_discount_percent/100)).

**Scope:**

1. **Results list** — For each hotel/offer:
   - If CUG and **real**: retail &lt; SSP and SSP exists → show “Was SSP” / “Now retail” / “Save X%”.
   - Else if CUG and **configured**: display_discount_percent set → show “Was (retail × (1 + p/100))” / “Now retail” / “Save p%”.
   - Else: show only retail.
2. **Hotel page** — Same per offer card: was/now when applicable (real or configured).
3. **Checkout (optional)** — If we have SSP for the prebooked offer, show “You’re saving X vs list price” for real discount; if only configured discount, same synthetic “was” message if desired.
4. **Fallback** — When no promo applies (no SSP and no display_discount_percent, or not CUG): show only retail.
5. **Priority** — If both real and configured could apply (e.g. retail &lt; SSP and display_discount_percent is set), prefer **real** (SSP-based) so the discount is truthful.

**Deliverables:**

- Reusable “price with promo” component or helper: given (retail, SSP?, displayDiscountPercent?, showPromo), render “was X / now retail” (X = SSP or synthetic) or just “retail”.
- Results and hotel page use it; checkout optional.
- Copy and styling: e.g. “Was X”, “Now Y”, “Save Z%” (or “Member discount” / “Genius discount”), CUG-only.

**Why last among these:** Depends on auth (CUG), key (CUG key), margin (Phase 3, and optional display_discount_percent from DB), and the “show promo” rules. No dependency on dynamic margin (Phase 6).

---

## Phase 6 (optional / later): Dynamic margin (campaigns, A/B, overrides)

**Goal:** Margin can change by campaign, A/B test, or per-account override, not only by user type + loyalty.

**Scope:**

- Add inputs to the margin resolver: e.g. campaign code, experiment variant, B2B account override from DB.
- Resolver order: e.g. campaign override → A/B → user type + loyalty → default. No change to key selection or promo display; only “what margin do we pass?” becomes richer.

Can be done after Phase 5 so the core flow (auth → key → margin by segment → promo) is stable.

---

## Dependency summary

```
Phase 0 (key strategy)       → no code, doc only
Phase 1 (auth + identity)    → adapter + local storage; works for Breadfast, standalone, web
Phase 2 (key selection)      → depends on Phase 1 (session = channel)
Phase 3 (margin resolver)    → depends on Phase 1 (userType, loyalty); margin from DB final column
Phase 4 (show promo / type)  → depends on Phase 1 (CUG), Phase 2 (CUG key), Phase 3 (display_discount_percent)
Phase 5 (promo UI)           → depends on Phase 4; real (SSP) and/or configured (fake) discount
Phase 6 (dynamic margin)     → depends on Phase 3; optional; still reads final margin from DB/cache
```

**Suggested implementation order:** 0 → 1 → 2 → 3 → 4 → 5 → (6 later).

This order keeps rewrites minimal: auth adapter and local storage first (so Breadfast and standalone can plug in), then key selection, then margin from DB, then promo rules (real + configured), then UI. Margin and user types stay configurable in the DB; the API always uses the final margin column.
