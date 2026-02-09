# Plan: Search Card as Overlay + Greyed-Out Fields

**Scope:** Home page only. Align with the provided Figma HTML and reference image so the search module (1) **hovers/overlays** between the hero and the section below, and (2) the three fields look **greyed out**.

**No implementation in this doc — plan only.**

---

## 1. Current state vs Figma

| Aspect | Current app | Figma HTML / image |
|--------|-------------|----------------------|
| **Card position** | Card is **inside** the hero, vertically centered with the headline. | Card is **outside** the hero: hero ends, then a wrapper with **negative margin top** (`-mt-16`) pulls the card **up** so it overlaps the bottom of the hero and sits between hero and “Popular Destinations”. |
| **Hero content** | Headline + subtitle + card all centered together. | Hero is a **tall block** (e.g. 420px); **only** headline + subtitle at the **bottom** of the hero. No card inside the hero. |
| **Field styling** | Label above (dark text), then a row (icon + value). No per-field background. | **Each** of the three areas is a **single grey box**: rounded row with icon, label, and value/placeholder **inside** one container (`bg-slate-50`, border). Labels and values use **muted/grey** typography so the whole thing reads as “greyed out”. |
| **Labels** | Uppercase, dark text. | Uppercase, **grey** (e.g. `text-slate-400`), very small (e.g. 10px). |
| **Values / placeholder** | Placeholder or value in muted or dark text. | Placeholder and current values in **muted grey** (e.g. `placeholder-slate-400`, or `text-slate-500` for the dates/guests text) so they look inactive until filled. |

---

## 2. Desired outcome (plan)

### 2.1 Overlay / hover position

- **Hero**
  - Keep a single hero block (e.g. increase height to ~400–420px to match Figma, or keep 340px).
  - Hero contains **only** the background image, gradient (and optional topo pattern), and the **text block** (headline + subtitle) anchored at the **bottom** of the hero (e.g. `flex flex-col justify-end` + padding), **no** search card inside the hero.
- **Search card**
  - Rendered **after** the hero in the DOM (sibling to the hero, before “Popular Destinations”).
  - Wrapper: e.g. `px-4 -mt-16 relative z-20` (or equivalent with design tokens).
    - `-mt-16`: negative margin pulls the card **up** so it overlaps the bottom of the hero.
    - `z-20`: card sits above hero and above the next section.
    - `px-4`: horizontal padding so the card doesn’t touch the viewport edges.
  - Card: same as now (white, rounded-2xl, shadow, border) so it clearly “floats” between hero and content below.

**Result:** The search module visually “hovers” between the hero image and the second section, as in the reference.

### 2.2 Greyed-out fields

- **Structure (per field)**
  - One **clickable row** per field (Destination, Dates, Rooms/Guests).
  - Each row is a **single container**: e.g. `flex items-center gap-3 p-3 rounded-xl bg-[var(--muted)]` or `bg-slate-50` and a light border so it reads as a grey box (design tokens preferred for consistency).
- **Label**
  - Small, uppercase, **grey**: e.g. 10px, bold, `text-slate-400` or `text-[var(--muted-foreground)]`.
  - Figma uses “Destination”, “Dates”, “Rooms/Guests” (no “CHECK IN – OUT” or “GUESTS” only); we can keep current copy or match Figma.
- **Value / placeholder**
  - **Destination:** Placeholder “Where are you going?” and selected place name in **muted grey** (e.g. `text-slate-500` or `placeholder-slate-400`), not strong dark text, so it always looks “greyed out”.
  - **Dates:** Display string (e.g. “Oct 12 – 15” or “Add dates”) in the same muted grey.
  - **Rooms/Guests:** Display string (e.g. “1 Rm, 2 Gst”) in the same muted grey.
- **Icon**
  - Keep the green/primary icon (e.g. MapPin, Calendar, Users) inside each grey row so the row stays recognizable and tappable.

**Result:** All three fields look like grey, inactive-style blocks; tap behaviour (open search modal for Where/When/Who) and form state (place, dates, occupancies) stay the same.

### 2.3 What stays the same

- **Logic:** No change to modal open/close, step (where/when/who), or submission (same params, same navigation to `/results`).
- **Markup intent:** Each “field” remains a button (or input for destination if we keep it) that opens the modal; only layout and styling change.
- **Accessibility:** Keep focus and aria where applicable; labels remain associated with the controls.

---

## 3. Implementation checklist (when you implement)

1. **Hero**
   - Remove the search card from inside the hero.
   - Position hero text at bottom (e.g. `justify-end` + padding).
   - Optionally increase hero height (e.g. 420px) and add topo pattern if desired.
2. **Card wrapper**
   - Add a wrapper div after the hero: `px-4 -mt-16 relative z-20`.
   - Put the existing search card (form) inside this wrapper.
3. **Card layout**
   - Keep one card; ensure max-width/centering (e.g. `max-w-md mx-auto`) so it doesn’t stretch full width on large screens.
4. **Field rows**
   - Replace current “label above + row” with a **single row per field**: grey rounded container, icon + label + value/placeholder inside.
   - Use muted/grey text for labels and for all values/placeholders so the three fields read as greyed out.
5. **Button**
   - Keep “Search Journeys” CTA as is (primary green, full width).
6. **Sections below**
   - “Popular Destinations” and “Featured Hotels” stay as they are; only spacing might need a small tweak so the overlayed card doesn’t collide (e.g. section already has padding/margin that works with `-mt-16`).

---

## 4. Summary

- **Overlay:** Hero contains only background + text; search card is in a **sibling** wrapper with **negative margin top** and **higher z-index** so it sits between hero and the next section.
- **Greyed out:** Each of the three fields is a **grey box** (rounded row) with **grey label** and **grey value/placeholder** text; behaviour (open modal, submit) unchanged.

No code changes in this step — use this plan when you’re ready to implement.
