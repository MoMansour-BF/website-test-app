# Implementation Plan: Reactive Search Modal (Where → When → Who Flow)

This plan describes changes to `SearchModal.tsx` and related components so the modal behaves like a **reactive search bar** with a flowing, step-by-step UX (as in the provided reference images), instead of rigid per-step full-screen views.

---

## Design philosophy (apply across the app)

- **Menus and cards must not blend with the background.** Whenever the user is on a “menu” (e.g. dropdown, modal step, date picker, room selector), use a **subtle hover and/or border effect** so that interactive areas are visually distinct from the page background. This applies to the search modal bars, the When calendar, the Who room cards, and any future menus or cards. Avoid flat panels that match the background with no separation.

- **Natural, reactive transitions.** Transitions between buttons, sections, and views (overview ↔ where ↔ when ↔ who, expand/collapse, list appearance) should feel natural and reactive, not instant or jarring. See **Phase 6** for where and how to add them.

---

## Current State Summary

- **SearchModal** is full-screen and shows a single step at a time (`where` | `when` | `who`). The step is controlled by the parent (e.g. `app/page.tsx`) via `step` and `onClose`. Tapping the search card opens the modal with a predetermined step.
- **Where step**: Full-screen search with input and API-driven suggestions (min 2 chars). No “partially open” state with suggested destinations on first open.
- **When step**: Uses `WhenStepContent` + `DateRangeCalendar`. Buttons say “Cancel” and “Done” (no “Next” to advance to Who). Date picker uses Tailwind `slate-*` and `dark:` variants; in the light-themed app this can cause **white-on-white or low-contrast** day text.
- **Who step**: Shows Where/When summary, `RoomSelector`, and a “Done” button that only closes the modal (parent still uses a separate “Search Journeys” on the page to submit).
- **Date logic**: `date-utils.ts` and `DateRangePicker.tsx` already implement the correct range logic (start/end, max 30 days, `compareDay`, `getDaysBetween`, etc.). `DateRangeCalendar` uses the same utilities; the issue is styling and flow, not core logic.
- **RoomSelector**: Supports multiple rooms, adults/children per room, “Add another room” style UX. Can be reused; may need a variant or props to match the “Who?” card design (Room 1, Adults/Children with +/- and “Add another room” link).

---

## Target Behaviour (from reference images and your spec)

1. **Open modal (any entry point)**  
   - Single modal opens with **all three attributes visible**: Where, When, Who.  
   - **Where** is “partially open”: search input + a **suggested destinations** list (placeholder data: e.g. Cairo, Makkah, Hurghada — later pluggable via placeIds/places of our choice).

2. **Where**  
   - Tapping the Where bar expands it to **full-screen search** (current Where UI: input + typeahead from API).  
   - On **place selection**: close full-screen Where, update place, then **automatically open the When/Date Picker** (no need to tap When manually).

3. **When**  
   - Date picker uses **same logic** as existing `date-utils` + `DateRangePicker` (range selection, max 30 days, validation).  
   - **Styling**: Days and labels must be **dark text on light background** (fix white-on-white); align with app design tokens (e.g. `--dark-text`, `--muted-foreground`).  
   - **Collapsed Where card:** At the top of the When view, show a **collapsed/summary card** for the Where choice (e.g. “Where” on the left, selected location like “New Cairo, Cairo Governorate” on the right). **Tapping this card** navigates back to the **Where** step (full-screen Where) so the user can change the destination.  
   - **Next** button: confirms dates and **automatically opens the Who step** (no close then reopen).

4. **Who**  
   - Layout like second image: “Who?” header, **collapsed summary cards for previous choices** at the top, then **Room 1** card with Adults (Ages 13+) and Children (0–17) with +/- controls, “+ Add another room”, “Need to book 9+ rooms? Contact us”, and a **Done** (or **Search**) button.  
   - **Collapsed Where and When cards:** At the top of the Who view, show **two** collapsed/summary cards: (1) **Where** — “Where” on the left, selected location on the right; (2) **When** — “When” on the left, selected date range (e.g. “Feb 16 – 19”) on the right. **Tapping the Where card** navigates back to the **Where** step; **tapping the When card** navigates back to the **When** step. This lets the user jump back to edit either choice without going through overview.  
   - **Done/Search** button: confirms occupancies and **initiates search** (navigate to `/results?...` with placeId, placeName, checkin, checkout, occupancies). Modal closes.

5. **Reactive flow**  
   - No rigid “step” from parent: modal manages internal “view” state (overview vs where-fullscreen vs when vs who).  
   - Parent can open the modal with an optional **initial view** (e.g. for quick edit: open straight to Where / When / Who).  
   - Same modal can be opened from home, listing, and hotel page with same behaviour.

6. **Homepage: direct menu open**  
   - On the homepage search card, the three options (Destination, Dates, Rooms/Guests) are **separately tappable**. Tapping **Destination** opens the modal with `view = 'where'`. Tapping **Dates** opens with `view = 'when'`. Tapping **Rooms/Guests** opens with `view = 'who'`. This allows quick edits without opening the overview first. If a field is not yet filled, the label/placeholder should make that clear (e.g. “Add dates”, “Add guests”).

7. **Results and hotel pages: search bar entry**  
   - On the hotel list page (`/results`) and hotel details page (`/hotel/[hotelId]`), the entry point to the search modal is a **single collapsed search bar**: one bar showing destination (with sub-address when set), dates, and guests summary. Tapping this bar opens `SearchModal` (e.g. in overview). Style like reference images: white/light background, rounded, subtle border/shadow; optional back/filter icons.

8. **Destination display: always show sub-address**  
   - Whenever a destination is selected, show the **sub-address** (e.g. “Cairo, Egypt”) in addition to the primary name (e.g. “Cairo”). Use primary name bold/prominent, sub-address smaller/lighter (e.g. `formattedAddress` or “City, Country”). Apply in: collapsed search bar (home, results, hotel), modal overview bars, collapsed Where card on When/Who views, and any other place the destination is referenced.

---

## Implementation Order

Implement in the following order to minimise rework and keep the app working after each step.

**Assumption:** Phases 1–3 are already implemented. The plan below keeps them for reference; the next steps to execute are **Phase 4** (icons), **Phase 5** (entry points, search bar, direct open, sub-address), then **Phase 6** (transitions).

---

### Phase 1: Modal layout and “overview” state (all three attributes visible)

**Goal:** When the user opens the modal (from anywhere), they see one screen with Where, When, and Who as three rows (like the first image). Where is “partially open” (suggestions visible); When and Who are collapsed rows (“Add dates”, “Add guests”).

1. **Introduce internal view state inside SearchModal**
   - Add state: `view: 'overview' | 'where' | 'when' | 'who'`.
   - When modal opens, set `view = 'overview'` (ignore or map from parent `step` only for initial open if needed).
   - Keep existing props: `placeId`, `placeLabel`, `query`, `checkin`, `checkout`, `occupancies`, and all handlers.

2. **Implement overview UI in SearchModal**
   - Single scrollable layout with:
     - **Where bar**: Clickable row showing place label or “Where?” / “Search destinations”. When expanded in overview, show search input + **suggested destinations** list below.
     - **When bar**: Clickable row showing date range or “Add dates”.
     - **Who bar**: Clickable row showing guests summary or “Add guests”.
   - “Clear all” and “Search” at bottom (Search disabled until minimum required fields are set; optional for Phase 1 to just close or do nothing).

3. **Suggested destinations (placeholder)**
   - Add a small config or constant (e.g. `SUGGESTED_DESTINATIONS`) of placeholder items: e.g. Cairo, Makkah, Hurghada. Each item: `placeId`, `displayName`, optional `formattedAddress`.
   - In overview, when Where is “partially open”, show these below the search field. On click, treat like API suggestion: call `onPlaceSelect` + `onQueryChange`, then switch to **When** view (auto-open date picker).

4. **Tapping the Where bar**
   - From overview, clicking the Where row sets `view = 'where'` and shows the **full-screen Where** content (current search input + API suggestions). Back button or close returns to `view = 'overview'` with Where collapsed.

5. **Parent API**
   - Consider changing prop from `step: SearchModalStep` to optional `initialStep` or drop it: modal decides initial view (e.g. always `overview`). Parent only passes `open` and `onClose` and the same data/handlers. Update `app/page.tsx` (and any results/hotel page that opens the modal) to open the modal without setting a step, or set a single “open” state.

**Deliverable:** Opening the modal shows the overview with three bars; Where can expand to show placeholder suggestions; clicking Where goes full-screen search; back returns to overview.

---

### Phase 2: When (date picker) – logic and styling

**Goal:** Date picker works and is readable (dark text); uses the **same interaction logic as the original search modal / DateRangePicker** (pre-Figma); “Next” advances to Who. Visual style matches the reference image: dark-on-light, selected day = dark circle with white number, range = light grey fill; menus/cards have subtle hover/border (design philosophy).

#### 2.1 Date range interaction logic (preserve existing behaviour)

The calendar must follow the same logic as `DateRangePicker.tsx` `handleDaySelect` and `date-utils`:

- **No past days:** User cannot select a day before today. Disable past days visually and ignore clicks (already via `minDate` / `isPastDay`).
- **First tap:** Selects **check-in**. That day is highlighted as the start date (single selected day).
- **Second tap:** If the clicked day is **after** check-in, it becomes **check-out**. The range is set; **days in between** show a **light grey shade** (range fill). If the clicked day is on or before check-in, treat it as a new check-in (start = clicked day, end = null).
- **Third tap (when a full range is already selected):** **Reset** the range. The new tap becomes the **new check-in** (start = clicked day, end = null). Next tap will set check-out again. This is the same as in `DateRangePicker`: when `endDate != null`, the next click sets `startDate = date`, `endDate = null`.
- **Max range:** Cap at 30 days (existing `MAX_RANGE_DAYS`); if the user picks an end date more than 30 days after start, set end to start + 29 days.
- **Implementation note:** `SearchModal`’s current `WhenStepContent` uses a slightly different state update (it does not always treat “third tap” as “new check-in”). Phase 2 must align with `DateRangePicker`’s `handleDaySelect` so that when both start and end exist, the next click clears end and sets start to the clicked date. Reuse or mirror that logic in the When view (either in `WhenStepContent` or in a shared handler).

#### 2.2 Date picker colors (reference image)

Apply a dark-on-light scheme so nothing is white-on-white:

- **Background:** White (or `--light-bg`) for the calendar area.
- **Unselected dates:** **Dark grey/black text** on the light background (e.g. `--dark-text` or equivalent dark grey). No white or very light text on white.
- **Selected day (check-in, or single selected day):** **Dark grey/almost black circular background** with **white text** (like the “9” in the reference). Same for check-out day if desired, or a ring + fill for consistency.
- **Range (days between check-in and check-out):** **Light grey shade** for the cells between start and end (e.g. `--muted` or a light grey). Text on those days remains readable (dark).
- **Past days:** Muted/greyed out and disabled (e.g. `--muted-foreground`), with optional strikethrough.
- **Month title and weekday headers:** Dark text (e.g. `--dark-text`, `--muted-foreground`) so they are clearly visible.
- Avoid Tailwind `dark:` variants that assume a dark page background; the modal is light. Use design tokens (`--dark-text`, `--primary`, etc.) so the calendar looks correct on the light modal.

#### 2.3 Menus / cards in When view (design philosophy)

- The When view itself is a “menu”/panel: give it a **subtle border or shadow** so it doesn’t blend with the background (e.g. `border-[var(--sky-blue)]` or light shadow).
- Calendar day cells: **hover state** with a subtle border or background change so the user sees which day is under the cursor (e.g. light grey hover that’s distinct from the default background).

#### 2.4 Collapsed Where card on When view (tap to go back)

- When `view === 'when'`, at the **top** of the When view (below the header/back control), show a **collapsed Where summary card**: one row/card with “Where” on the left and the selected location (e.g. `placeLabel` or “Search destinations”) on the right. Style it like the reference: light grey, rounded, visually distinct (design philosophy: border/hover so it doesn’t blend).
- **Tap behaviour:** When the user taps this collapsed Where card, set `view = 'where'` so they are taken to the full-screen Where step to change the destination. No need to go via overview.

#### 2.5 When view flow and Next button

- When `view === 'when'`, show header “When?” (and back to overview if desired), then the **collapsed Where card** (see 2.4), then `DateRangeCalendar` + footer with “Next” (and optionally “Reset” or “Cancel”).
- **Next** button: call `onDatesChange` with current range (same validation as today: default end = start+1 if missing, cap at 30 days), then set `view = 'who'` (do not call `onClose()`).
- **Auto-open When after place selection:** In full-screen Where, when user selects a place, call `onPlaceSelect` and `onQueryChange`, then set `view = 'when'` so the date picker opens automatically.

**Deliverable:** Choosing a place opens the When view; When view shows collapsed Where card at top, tap takes user back to Where; date picker uses the original range logic (no past, first tap = check-in, second = check-out, middle days shaded, third tap = new check-in); colors match the reference (dark circle + white number for selected, light grey range, dark text elsewhere); When panel and day cells have subtle hover/border; “Next” saves dates and opens Who.

---

### Phase 3: Who step and “Done” = search

**Goal:** Who view matches second image (Room 1, Adults/Children, “Add another room”, Contact us, Done). Done button runs the search and closes the modal. **Collapsed Where and When cards** at the top allow jumping back to edit previous steps.

1. **Collapsed Where and When cards on Who view (tap to go back)**
   - At the **top** of the Who view (below the header), show **two** collapsed summary cards in the same style as the When view’s Where card:
     - **Where card:** “Where” on the left, selected location (e.g. `placeLabel`) on the right. **Tap** → set `view = 'where'` (navigate to full-screen Where).
     - **When card:** “When” on the left, selected date range (e.g. `dateRangeText`: “Feb 16 – 19”) on the right. **Tap** → set `view = 'when'` (navigate to When/date picker).
   - Use the same card styling as the collapsed Where card on the When view (light grey, rounded, subtle border/hover per design philosophy). Order: Where first, then When, then the main “Who?” content.
   - This lets the user edit Where or When from the Who step without going back through overview.

2. **Who view layout**
   - Header: “Who?” with optional back. Then the **collapsed Where and When cards** (see above), then the main occupancy section.
   - One card per room: “Room N”, Adults (Ages 13 or above) with +/- , Children (Ages 0–17) with +/-. Match design (dashed “+ Add another room” button, “Need to book 9 or more rooms? Contact us” link).
   - Reuse `RoomSelector` logic (occupancies, `onOccupanciesChange`, MIN/MAX rooms and guests) but optionally create a **Who-step-specific** layout component that matches the image (same data, different UI layout) or adapt `RoomSelector` with a prop for “compact card” mode.

3. **Done / Search button**
   - Single primary button at bottom: “Done” or “Search”. On click:
     - Call `onOccupanciesChange` if any local state (or already bound).
     - **Trigger search**: either call a new callback e.g. `onSearch()` from the parent, or have the modal use `router.push('/results?...')` with current `placeId`, `placeLabel`, `checkin`, `checkout`, `occupancies` (and `mode` if applicable). Then call `onClose()`.
   - Parent (e.g. `app/page.tsx`) must either: provide `onSearch` that performs `doSearch()` and closes, or the modal receives `router`/params and navigates itself. Prefer one clear contract (e.g. `onSearch` with no args, parent reads its own state and navigates).

**Deliverable:** Who view shows collapsed Where and When cards at top (tap Where → Where step, tap When → When step); main content matches the second image; Done/Search runs the full search and closes the modal.

---

### Phase 4: Icon consistency (assumes Phases 1–3 done)

**Goal:** Use the same icons for Destination, Dates, and Rooms/Guests on the homepage, inside the search modal (overview and when collapsed), and on the results/hotel search bar. No mismatch between entry points and modal.

1. **Audit and define**
   - **Destination:** One icon (e.g. location pin / map pin) used everywhere: homepage search card (Destination row), modal overview Where bar, collapsed Where card on When/Who views, results/hotel search bar. Use the same component (e.g. `MapPinIcon` from `Icons.tsx`) or asset.
   - **Dates:** One icon (e.g. calendar) used everywhere: homepage Dates row, modal overview When bar, collapsed When card on Who view, results/hotel search bar.
   - **Rooms/Guests:** One icon (e.g. people/users) used everywhere: homepage Rooms/Guests row, modal overview Who bar, results/hotel search bar.
   - Confirm these match the reference images (green/accent color for icons in the collapsed card style).

2. **Apply consistently**
   - Homepage: ensure the three segments use the same icons as the modal.
   - SearchModal (overview and collapsed cards): use the same icons.
   - Results and hotel page search bar (Phase 5): when implemented, use the same icons for any inline display (if the bar shows icons) or at least the same visual language.
   - If the design uses uppercase labels (“DESTINATION”, “DATES”, “ROOMS/GUESTS”) in one place, decide whether to align that across homepage and modal or keep modal more conversational (“Where?”, “When?”, “Who?”); document the choice.

**Deliverable:** Single set of icons for the three search attributes; used on homepage, in SearchModal (overview + collapsed), and on the results/hotel search bar. No inconsistent iconography.

---

### Phase 5: Entry points, search bar on results/hotel, direct menu open, destination sub-address

**Goal:** Two distinct entry-point behaviours: (1) Homepage — tapping one of the three options (Destination, Dates, Guests) opens the modal **directly to that menu** for quick edit; (2) Results and hotel pages — a **single search bar** (like images 2 and 3) that opens the modal when tapped. Plus: destination always shown with sub-address; Clear all and Search on overview; modal accepts optional initial view.

1. **Homepage: three tappable options, direct open to corresponding view**
   - The homepage search card has **three distinct areas**: Destination, Dates, Rooms/Guests (with icons per Phase 4). Each is **individually tappable**.
   - **Tapping Destination** opens the modal with **initial view = `'where'`** (user lands on full-screen Where). No overview first.
   - **Tapping Dates** opens the modal with **initial view = `'when'`** (user lands on the date picker).
   - **Tapping Rooms/Guests** opens the modal with **initial view = `'who'`** (user lands on the Who step).
   - **Unfilled state:** If a field is not yet filled (e.g. no destination, no dates, or default guests), the label or placeholder must make that clear: e.g. “Where are you going?”, “Add dates”, “Add guests”. So a quick tap on “Dates” when empty still opens the When view and the user sees they need to add dates.
   - **SearchModal API:** Support an optional prop such as `initialView?: 'overview' | 'where' | 'when' | 'who'`. When the parent opens the modal with `initialView = 'where'`, the modal opens in Where view instead of overview. Same for `when` and `who`. Default remains `overview` when not specified (e.g. when opening from the results/hotel search bar).

2. **Results page and hotel details page: single search bar entry**
   - On **`/results`** (hotel list) and **`/hotel/[hotelId]`** (hotel details), the entry point to the search modal is a **single collapsed search bar**, not three separate boxes. Match the reference (images 2 and 3):
     - One horizontal bar: white/light background, rounded corners, subtle border or shadow (design philosophy).
     - **Content:** Primary line = destination (e.g. “Homes in New Cairo” or “Hurghada, Red Sea Govern…”); secondary line = dates and guests (e.g. “Feb 16 – 19 · Add guests” or “Feb 20-21 • 2 travelers”). Use **destination with sub-address** when available (see item 4 below).
     - Optional: back arrow (left), filter/sliders icon (right) as in the reference.
   - **Tap behaviour:** Tapping this bar opens `SearchModal` with **initial view = `'overview'`** (or no initialView) so the user sees all three attributes and can edit any.
   - Ensure the same search state (placeId, placeLabel, checkin, checkout, occupancies) is passed into the modal from results/hotel pages (e.g. from URL params or page state).

3. **Overview actions and modal API**
   - “Clear all”: reset place, dates, occupancies via existing handlers; stay on overview.
   - “Search” button: enabled when required fields are set; on click, run search (navigate or `onSearch`), then close.
   - Modal: parent passes `open`, `onClose`, data/handlers, and optional `initialView`. Modal manages `view` internally; no parent `step` state required.

4. **Destination display: always show sub-address**
   - When a destination is selected, **always** show the sub-address (e.g. “Cairo, Egypt”) wherever the destination is displayed. Pattern: **primary** = main name (e.g. “Cairo”, or “New Cairo”); **secondary** = sub-address in smaller/lighter text (e.g. `formattedAddress` from places API: “Cairo, Egypt” or “Cairo Governorate”). See image 4 (Cairo with “Cairo, Egypt” below).
   - **Apply in:** Homepage search card (Destination row); modal overview Where bar; collapsed Where card on When view; collapsed Where card on Who view; **results page search bar**; **hotel details page search bar**; any suggestion row or confirmation text that shows the place.
   - **Data:** Ensure `formattedAddress` (or equivalent) is stored when a place is selected (e.g. from `onPlaceSelect`) and passed down so every consumer can show “Primary / Sub-address”. If the API only returns displayName, consider deriving or storing a short sub-address (e.g. “City, Country”) where possible.

5. **Accessibility and small UX**
   - Focus management when switching view; Escape key behaviour; “Add dates” / “Add guests” from overview open When/Who correctly.

**Deliverable:** Homepage: tapping Destination/Dates/Guests opens modal straight to that view; results and hotel pages: one search bar that opens modal in overview; destination always shown with sub-address in collapsed bar and all references; Clear all and Search work; modal accepts `initialView`.

---

### Phase 6: Natural reactive transitions

**Goal:** Add natural, reactive transitions between each button, section, and menu so the modal feels fluid rather than instant or rigid.

1. **Where to add transitions**
   - **Modal open/close:** When the modal appears or dismisses (e.g. from the search card), use a short fade and/or slide (e.g. slide up from bottom or fade in). Keep duration subtle (e.g. 200–300 ms).
   - **View changes (overview ↔ where ↔ when ↔ who):** When switching between overview, full-screen Where, When, and Who, animate the transition. Options: crossfade, slide (e.g. next view slides in from right, back slides from left), or slide + fade. Avoid instant swap so the user perceives a clear “step” change.
   - **Overview section expand/collapse:** When “Where” is partially open (suggestions visible) vs collapsed, or when the user taps When/Who bars to expand (if applicable), animate height/opacity so the expansion or collapse feels reactive (e.g. CSS transition on height/max-height or use a small duration for the content appearing).
   - **Lists and suggestions:** When suggested destinations or search results appear, consider a light stagger (e.g. items fade/slide in with a tiny delay each) or a single fade-in so the list doesn’t pop in abruptly.
   - **Buttons and interactive elements:** Optional: very short transition on hover/active (e.g. background or border already covered by design philosophy; can add a 100–150 ms transition for smoothness).

2. **Implementation approach**
   - Prefer CSS transitions/animations where possible (e.g. `transition` on opacity, transform, height). For view changes, either:
     - Use a single content area and animate the entering/leaving content (e.g. with React state + CSS classes or a small animation library), or
     - Use a shared layout that slides/fades the whole panel when `view` changes.
   - Keep durations consistent: e.g. 200–250 ms for view changes, 150–200 ms for expand/collapse, 200–300 ms for modal open/close. Avoid long delays that feel sluggish.
   - Respect `prefers-reduced-motion`: if the user has reduced motion enabled, skip or shorten animations (e.g. instant or very short fade only).

3. **Scope**
   - Apply transitions inside the SearchModal flow (overview, where, when, who) and for modal entry/exit. No need to change transitions on the rest of the app unless desired; Phase 6 is scoped to the reactive search modal experience.

**Deliverable:** Modal open/close and view/section changes use natural, reactive transitions; lists and expand/collapse feel smooth; reduced motion is respected. The modal feels fluid and reactive rather than rigid.
---

## File and component checklist

| Item | Action |
|------|--------|
| `src/components/SearchModal.tsx` | Phases 1–3: view state; overview; Where/When/Who views; collapsed cards (tap to go back); Done = search. Support **initialView** prop (Phase 5). When step: same day-select logic as DateRangePicker. Hover/border on bars and collapsed cards. **Phase 6:** Transitions. |
| `src/components/DateRangePicker/DateRangeCalendar.tsx` | Phase 2: design tokens (dark text, selected = dark circle + white, range = light grey); hover/border on day cells. |
| `src/components/RoomSelector.tsx` | Optional: “card” or “who-step” variant for Who view. |
| `src/components/Icons.tsx` (or shared icons) | **Phase 4:** Single set of icons for Destination (pin), Dates (calendar), Rooms/Guests (people); used on homepage, in modal, and on results/hotel search bar. |
| `app/page.tsx` | **Phase 5:** Three tappable segments (Destination, Dates, Rooms/Guests); each opens modal with **initialView** = that step. Show destination with sub-address; “Add dates” / “Add guests” when empty. `onSearch` or modal navigates. |
| `app/results/page.tsx` | **Phase 5:** Single **search bar** (destination + dates + guests summary, sub-address when set); tap opens SearchModal (overview). Same icons (Phase 4). |
| `app/hotel/[hotelId]/page.tsx` | **Phase 5:** Same search bar as results; tap opens SearchModal. Destination with sub-address. |
| Place/destination data | Store and pass **formattedAddress** (sub-address) when place selected; show “Primary / Sub-address” everywhere (Phase 5 item 4). |
| Suggested destinations | Constant in SearchModal (e.g. Cairo, Makkah, Hurghada) with placeId, displayName, formattedAddress. |

---

## Summary order

*(Phases 1–3 are assumed implemented.)*

1. **Phase 1:** Overview layout + three bars + Where partially open + full-screen Where on tap + internal `view` state; hover/border on bars.  
2. **Phase 2:** Date picker logic and colors; When view with collapsed Where card (tap → Where); “Next” → Who; auto-open When after place select.  
3. **Phase 3:** Who view with collapsed Where + When cards (tap → respective step); Room 1 card, Add room, Contact us; Done = search; hover/border.  
4. **Phase 4:** **Icon consistency** — same icons (Destination, Dates, Rooms/Guests) on homepage, in SearchModal (overview + collapsed), and on results/hotel search bar.  
5. **Phase 5:** **Entry points:** (a) Homepage: three tappable options open modal **directly to that view** (Where / When / Who) via `initialView`; unfilled state clear. (b) Results and hotel pages: **single search bar** (like images 2 and 3) that opens modal when tapped. (c) **Destination sub-address** everywhere: always show e.g. “Cairo, Egypt” in collapsed bar and all references. Clear all and Search on overview.  
6. **Phase 6:** Natural reactive transitions: modal open/close, view changes, section expand/collapse, list appearance; respect `prefers-reduced-motion`.

Do not implement yet; this plan is for review and then execution in the order above.
