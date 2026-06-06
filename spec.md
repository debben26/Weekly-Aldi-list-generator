# Aldi Weekly Grocery Planner — Phase 1 Implementation Spec

> **For the coding agent (Claude Code):** This is the authoritative build spec for Phase 1. It resolves the ambiguous decisions that an implementer would otherwise have to guess at — read **Section 0 (Resolved Decisions)** first, then implement against the rest. Where this document gives concrete numbers (thresholds, units, rounding), treat them as requirements, not suggestions. Prefer deterministic, tested logic over cleverness. Do not build anything in the "Out of Scope" or "Do not" lists.

---

## 0. Resolved Decisions (read first)

These are the decisions that were under-specified in the original draft and have now been pinned down. They are load-bearing — most of the hard correctness lives here.

1. **Two unit systems, explicitly separated.** Recipes use *recipe units* (cup, tbsp, g, clove). Shopping happens in *purchase units* (bag, gallon, each, lb, 16 oz package). Every `Item` has a `purchase_unit`. Quantity math respects this split (Section 5.3a + Section 8.1a).

2. **Merge never invents quantities it can't compute.** When merging duplicate items, the engine sums quantities *only* when units share a dimension and a conversion exists. Otherwise it keeps one merged row but lists per-source quantities verbatim and shows no fabricated total (Section 8.1a).

3. **Cold start is a first-class case.** Day one has no purchase history. Learned restock cadence requires **≥ 3 prior purchases**; below that, fall back to the manually configured interval, and if neither exists, the item is shown as "no cadence yet" rather than suggested (Section 8.2).

4. **Restock thresholds are concrete.** `ratio = days_since_last_purchase / effective_interval`. `due` if ratio ≥ 1.0, `maybe_due` if 0.8 ≤ ratio < 1.0, `not_due` if < 0.8. Snooze overrides everything (Section 8.2).

5. **Recipe→item mapping is encouraged but has a defined fallback.** Mapping a `RecipeIngredient` to a canonical `Item` is optional. When unmapped, the merge engine falls back to normalized-text + alias matching (Section 8.1b). The UI surfaces unmapped ingredients and nudges mapping, because mapping improves merge quality.

6. **Servings scale.** Recipes store `base_servings`. A meal-plan entry stores `target_servings` (defaults to base). Scalable ingredient quantities are multiplied by `target/base`. Ingredients flagged `scalable = false` (e.g., "to taste", "1 pinch") are not scaled (Section 5.4 + 8.1).

7. **History is frozen by denormalization.** Trip snapshots store denormalized display values (name, quantity, unit, section name, prices, source labels) captured at completion time. They keep an optional `item_id` for analytics joins, but display values never change when the live `Item` is later edited (Section 5.6 + 10.3).

8. **No separate `StoreLayout` table in Phase 1.** A `Store` owns an ordered set of `StoreSection`s. Multiple named layouts are a Phase 2 concern; do not model them now (Section 5.2).

9. **`Aldi-friendly` is computed, not a dead flag.** Items carry a boolean `aldi_friendly`. A recipe's Aldi fit is *derived* from the fraction of its mapped ingredients that are Aldi-friendly (Section 8.4). Seeded items default to Aldi-friendly.

10. **Seed a starter catalog.** Phase 1 seeds ~100 common grocery items (name, default section, purchase unit, Aldi-friendly) so the app is useful before the user enters anything (Section 6.0 + Appendix A).

11. **Auth posture.** Single-user dev mode is fine, but it means no real access control — the app must stay local or behind basic auth until real auth ships. Do not deploy it openly (Section 4.2 + 10.4).

---

## 1. Purpose

Build the foundation for a single-household, single-Aldi-store weekly grocery planning web app: generate a printable, route-ordered weekly checklist; learn from shopping history; support recipes, staples, and pantry; and preserve structured data for later pricing, pickup ordering, multi-user support, and recipe sharing.

Phase 1 builds the *right foundation*, not every future feature.

## 2. Product Vision

A household grocery planning system for one preferred Aldi store. Core value:

- Plan the weekly Aldi trip with less repeated effort.
- Combine weekly staples, restock items, pantry status, and selected meals into one clean list.
- Sort the list in the order the household walks the store.
- Preserve shopping/meal/item/quantity/price history so the system gets smarter.
- Keep the data model ready for cost estimation, pickup ordering, multi-user households, and a public recipe hub.

## 3. Scope

### In scope
Single household; one Aldi store; web-first (desktop-optimized); US-only; groceries and grocery-adjacent items; user-defined store sections and route order; printable checkbox list grouped by section; auto-included weekly staples; recurring-but-not-automatic restock items; lightweight pantry status; manual recipe CRUD; selecting 3–4 meals per week with serving scaling; generating a merged grocery list from all sources with source provenance; deterministic restock + meal suggestions; manual/estimated price entry; basic analytics (6-month default); seed starter catalog; future-ready schema.

### Out of scope
Mobile-first in-store mode; multiple households; multiple stores per household; multiple named layouts; receipt upload/parsing; recipe URL import; built-in/public recipe content; calendar sync; live Aldi/Instacart pricing; scraping; in-app pickup ordering; public recipe hub; child/teen accounts; i18n beyond US defaults.

## 4. Technical Architecture

### 4.1 Principles
- Structured relational data, not text blobs.
- Single-household in the UI, but no schema assumptions that block future multi-user.
- Aldi-first, but no business logic hardcoded to Aldi strings.
- Separate canonical items from recipe ingredients, list entries, pantry entries, and future retailer products.
- Preserve source provenance through merges.
- Store historical snapshots, not just the active list, and **freeze them by denormalization**.
- Deterministic algorithms for generation, merging, restock, meal suggestions. No LLM in core business logic.
- LLM usage allowed only later, for messy-text tasks (import cleanup, normalization suggestions, receipt parsing, NL explanations).

### 4.2 Stack
- **Front end:** Next.js (App Router) + React + TypeScript.
- **Styling:** Tailwind CSS.
- **DB:** PostgreSQL preferred; SQLite acceptable for local prototype only if schema stays relational and migration-friendly.
- **ORM:** Prisma.
- **Auth:** single-user dev mode acceptable, but schema includes `User` and `Household`. **No real access control in Phase 1 → keep local or behind basic auth; do not deploy openly.**
- **Shape:** one Next.js app with server actions / route handlers and a relational DB. Not microservices. No desktop packaging in Phase 1, but avoid choices that would block future Tauri/Electron.

### 4.3 Code organization
Business logic lives in services/modules, never inside UI components. Required services:
`GroceryListGenerationService`, `ItemMergeService`, `UnitService`, `RestockSuggestionService`, `MealSuggestionService`, `TripCompletionService`, `PriceObservationService`, `AnalyticsService`. Each pure-logic service is unit-tested (Section 12).

## 5. Domain Model

Exact table names may vary; the concepts must exist. Use soft-delete / `active` flags for reusable config records.

### 5.1 Identity & Household
- **User** — adult account. Phase 1 seeds one.
- **Household** — shared planning unit. Phase 1 one household.
- **HouseholdMember** — links users↔households (owner/admin in Phase 1). Preserve for Phase 2 multi-user.

### 5.2 Store Layout
- **Store** — `brand` (default "Aldi"), `name`, optional location, `is_default`. Owns ordered sections directly.
- **StoreSection** — `store_id`, `name`, `sort_order`, `active`, optional `notes`. Grocery output groups by these in `sort_order`. User can add, rename, reorder, deactivate.
  - *No separate `StoreLayout` entity in Phase 1.* (Phase 2 may add named layouts.)
- Default seeded sections (in order): Produce; Bakery / Bread; Deli / Refrigerated; Meat; Dairy; Frozen; Pantry; Canned Goods; Baking and Spices; Snacks; Household; **Other / Unassigned** (this one must always exist and is the fallback).

### 5.3 Item Catalog
- **Item** — canonical grocery/household item. Fields: `canonical_name`, `food` (bool), `aldi_friendly` (bool), `default_section_id`, `notes`, `active`, **plus the unit fields below**.
- **ItemAlias** — `item_id`, `alias_text` (normalized). Drives merge + future import cleanup. e.g. "2% milk", "milk 1 gal", "Friendly Farms milk".
- **Item variant detail** — Phase 1 identity supports meaningful attributes: `size` (e.g., "1 gallon"), `flavor`/`variant` (e.g., "2%", "vanilla"). Store generic identity and meaningful attributes separately; do **not** collapse variants into one opaque string if it prevents future matching.

#### 5.3a Unit fields on Item (the part the draft was missing)
- `purchase_unit` (enum-ish string): how you *buy* it — `each`, `bag`, `box`, `gallon`, `half_gallon`, `lb`, `oz_package`, `dozen`, `bunch`, `can`, `jar`, etc.
- `purchase_unit_size` (optional numeric) + `purchase_unit_size_unit` (optional, e.g., `oz`, `ct`): e.g., shredded cheese = 1 `bag` of `8 oz`.
- `recipe_to_purchase` (optional JSON / related rows): known conversions from a recipe unit to this item's purchase unit, e.g. `{ "cup": 0.25 }` meaning 1 cup ≈ 0.25 bag. Optional; absence is handled gracefully (see 8.1a).
- `dimension` (derived/stored): `volume`, `weight`, `count`, or `package`. Used to decide whether two quantities are even addable.

### 5.4 Recipes & Meal Plans
- **Recipe** — manual only. Fields: `title`, `notes`, `base_servings` (default 4), `prep_time`, `cook_time`, `favorite` (bool), `aldi_fit_status` (derived, see 8.4), visibility/ownership fields for future hub (`visibility`, `owner_user_id`, `is_public`, `moderation_status` — present, unused). Private to household in Phase 1.
- **RecipeIngredient** — `recipe_id`, `raw_text` (always preserved), optional `item_id`, `quantity` (numeric, nullable), `recipe_unit` (e.g., cup/tbsp/g/clove/each, nullable), `optional` (bool), `scalable` (bool, default true), `notes`, `position`.
  - `scalable = false` for things like "to taste", "1 pinch", garnish.
- **MealPlan** — `household_id`, `week_start_date`, `status` (draft/active/completed), `created_at`.
- **MealPlanEntry** — `meal_plan_id`, `recipe_id`, `target_servings` (default = recipe.base_servings), optional `meal_type` (leave flexible; dinner-style default). Selecting a recipe scales its ingredient quantities by `target_servings / base_servings` (scalable ingredients only).

### 5.5 Staples, Restock, Pantry
- **StapleRule** — unifies staples + restock. Fields: `item_id`, `rule_type` (`weekly` | `restock`), `default_quantity`, `default_unit`, `default_section_id`, `active`, `notes`, and for restock: `expected_interval_days` (nullable), `last_purchased_date` (nullable), `snoozed_until` (nullable).
  - **Weekly** (`rule_type = weekly`): auto-included in every generated list.
  - **Restock** (`rule_type = restock`): not auto-added; appears in the weekly restock review when due/maybe-due or added manually.
- **PantryItem** — lightweight on-hand state. `item_id`, `status` (`have` | `low` | `out` | `unknown`), optional `quantity`, `unit`, `last_updated`, `notes`. No exact inventory accounting.

### 5.6 Shopping Lists & Trip History
- **ShoppingList** — active weekly list. `household_id`, `store_id`, `week_start`, `status`, `created_at`, `completed_at`.
- **ShoppingListItem** — one row. `item_id` (nullable for free-text manual adds), `display_name`, `quantity`, `unit`, `section_id`, `checked` (bool), `notes`, `estimated_price`, `paid_price`, `source_summary` (derived label).
- **ShoppingListItemSource** — *required for provenance.* Tracks each contributing source for a row: `source_type` (`weekly_staple` | `restock` | `pantry_review` | `manual` | `recipe`), optional `recipe_id`, and the per-source `quantity` + `unit` as contributed (so the merge can show "1 cup [Tacos] + 1 bag [Staples]").
- **TripSnapshot** — frozen record of a completed week. **Denormalized.** Stores `week_start`, `completed_at`, `store_name`, totals, and child **TripSnapshotItem** rows.
- **TripSnapshotItem** — frozen line: `display_name`, `quantity`, `unit`, `section_name`, `checked`, `estimated_price`, `paid_price`, `source_labels`, and an optional `item_id` for analytics joins only. **Editing the live `Item` later must not change these values.**

### 5.7 Pricing
- **PriceObservation** — `item_id`, `store_id`, `amount`, `currency` (default USD), `quantity_basis`, `unit_price` (derived where unit known), `observed_date`, `source_type` (`manual` | `estimated` | `historical_average` | `future_receipt` | `future_api`), `confidence`, `notes`.
- `ShoppingListItem.estimated_price` and `.paid_price` are stored **separately**. Never collapse into one field.

### 5.8 Future-ready fields (present, unused in Phase 1)
`recipe.visibility`, `recipe.owner_user_id`, `recipe.source_recipe_id`, `recipe.created_by`, `recipe.is_public`, `recipe.moderation_status`, `retailer_product.external_id`, `retailer_product.provider`, `order_provider.*`, `price_observation.source_type`, `price_observation.confidence`.

## 6. Functional Requirements

### 6.0 Seed Data (cold start)
On first run, seed: one user, one household, one Aldi store, the default ordered sections, **and the starter item catalog (~100 items)** from Appendix A — each with a default section, purchase unit, and `aldi_friendly = true` unless noted. The app must be useful immediately, before the user enters anything.

### 6.1 Household & Store Setup
Seeded config creates one household, one Aldi store, one ordered section set. User can view layout; add/rename/reorder/deactivate sections; output respects current order; unsectioned items fall under **Other / Unassigned**.

### 6.2 Item Catalog
Create/edit items (name, default unit/purchase unit, default section, notes, `aldi_friendly`, variant/size/flavor); assign section; add aliases. Acceptance: create "Milk (2%, 1 gallon)"; create "Yogurt" with flavor/size; item lands in correct section on a list; aliases recognized by merge.

### 6.3 Weekly Staples
Create staple from item; store default qty/unit/section; activate/deactivate; auto-include active staples on new lists. Acceptance: active milk staple appears on every new list; deactivating removes it; staples merge with matching meal/manual items and show "Weekly Staples" among sources.

### 6.4 Restock Items
Create restock from item with default qty/unit/section/notes, `expected_interval_days`, `last_purchased_date`, snooze. Not auto-added. Weekly flow shows a restock review of due/maybe-due items. User can add (one action), snooze, skip without deleting the rule, or add any restock item even if not due. Added items land in the right section.

### 6.5 Restock Suggestion Engine
Deterministic + explainable (Section 8.2). Uses manual interval and/or learned cadence (≥3 purchases), respects `snoozed_until`, gives a human-readable reason, same input → same output.

### 6.6 Pantry / On-Hand
Mark items have/low/out/unknown; optional qty/unit. Mark recipe ingredients or items on-hand to exclude from the generated list, with user override to include anyway. low/out can be surfaced as restock/grocery candidates. Stay lightweight. Acceptance: olive oil "have" → a recipe needing olive oil does not force it onto the list unless the user opts in.

### 6.7 Manual Recipe Management
Create/edit recipe (title, notes, `base_servings`, prep/cook time, favorite); add ingredients with `raw_text` + optional `item_id`, `quantity`, `recipe_unit`, `optional`, `scalable`. Acceptance: build "Taco Bowls" with ground beef, rice, salsa, shredded cheese, tortillas, lettuce; map ingredients to items; recipe selectable for a plan.

### 6.8 Meal Planning
Create weekly plan; select ~3–4 recipes; set `target_servings` per entry; add/remove; store `week_start_date`; track meal history on completion. Phase 1 suggestions come only from saved household recipes via deterministic ranking (Section 8.3). Acceptance: select 3 recipes; they generate (scaled) list items; usage saved to meal history when the trip completes.

### 6.9 Aldi-Friendly Logic
Recipes may include some non-Aldi items, but the bulk should be Aldi-available. `aldi_friendly` boolean on items; recipe `aldi_fit_status` **derived** (Section 8.4); label recipes with many likely non-Aldi ingredients. No SKU matching, no live lookup in Phase 1.

### 6.10 Grocery List Generation
Generate from: weekly staples + selected meal ingredients (scaled) + user-selected restock + pantry overrides + manual items. Merge duplicates, preserve sources, sort by store route. Allow editing qty/unit/section/note/checked/estimated/paid; add manual items; remove/exclude. Acceptance: shredded cheese as staple + in Taco Bowls → one merged row preserving both sources; grouped under section headers in route order; user can move an item's section.

### 6.11 Duplicate Merging & Provenance
Merge by canonical item identity + aliases (Section 8.1b), never by blind text concatenation. Sum quantities only when units are compatible (Section 8.1a). Preserve `raw_text` and per-source quantities. Examples: merge "shredded cheese" (tacos) + "shredded cheese" (staples); merge with caution "milk" + "2% milk, 1 gallon"; do **not** auto-merge "vanilla yogurt" + "plain Greek yogurt". Acceptance: user can see why an item is listed; merged rows keep source refs; conflicting variants stay separate unless manually merged.

### 6.12 Printable Checklist
Print-friendly page: section headers in route order; checkbox per item; name/qty/unit/notes visible; source text optionally shown/hidden; clean on US letter; no mobile optimization required.

### 6.13 Complete Trip
"Complete Trip / Finalize Week" — the main Phase 1 history capture (no receipts). Mark list completed; preserve checked state, final quantities, estimated/paid prices, sources; create `TripSnapshot` (+ items, denormalized); create `PriceObservation`s where prices known; update `last_purchased_date` for checked items/restock rules; update meal history; optionally update pantry from user input. Acceptance: completing creates a frozen snapshot; analytics survive later list changes; paper-towel last-purchased updates if checked.

### 6.14 Pricing & Spending
Enter estimated and paid prices separately; store observation date + source type; total estimated list cost when available; total known spend after completion; default USD. Missing prices never break generation or analytics.

### 6.15 Historical Analytics
Default window 6 months. Views: item purchase frequency over time; quantity history; price history (estimated vs paid distinguishable); spend by week/month; spend by section; most-/recently-selected meals; restock history. Handle missing data gracefully. Acceptance: "How many times did we buy milk in 6 months?"; "Which meals do we pick most?"; per-item price history.

## 7. UI / UX

### 7.1 Navigation
Dashboard / This Week · Grocery List · Meal Plan · Recipes · Staples & Restock · Pantry · Store Layout · History / Analytics · Settings.

### 7.2 "This Week" flow
1. Choose week. 2. Review auto-included weekly staples. 3. Select 3–4 meals (set servings). 4. Review due/maybe-due restock. 5. Review pantry exclusions. 6. Generate list. 7. Edit. 8. Print. 9. Complete trip.

### 7.3 UX priorities
Reduce repeated weekly effort; don't force review of every restock item weekly; make the flow fast and predictable; make it obvious *why* each item is listed; make route order easy to configure and trust; keep the printable checklist clean; keep pantry lightweight; no mobile-first build.

## 8. Algorithms (deterministic — concrete rules)

### 8.1 Grocery List Generation
1. Start a `ShoppingList` for household/store/week.
2. Add all active weekly staples (qty from rule).
3. Add ingredients from selected meal-plan recipes, **scaled** by `target_servings / base_servings` for `scalable` ingredients (leave `scalable=false` quantities unchanged).
4. Add user-selected restock items.
5. Apply pantry exclusions (status `have`) unless the user overrides per item.
6. Add manual items.
7. Normalize via canonical `item_id` + aliases (8.1b).
8. Merge duplicates per 8.1a.
9. Preserve a `ShoppingListItemSource` per contributing source (with its own qty/unit).
10. Assign section: manual override → recipe override → item default → **Other / Unassigned**.
11. Sort by section `sort_order`, then display name (or custom order).

#### 8.1a Quantity aggregation rule (the important one)
For a merge group (same canonical item, or matched per 8.1b):
- Determine each contribution's `dimension` from its unit.
- **If all contributions share one dimension AND conversions to the item's `purchase_unit` exist:** convert each to purchase units, sum, then **round up to the next whole purchase unit** (you can't buy 1.3 bags). Store one `quantity` + `purchase_unit`.
- **If dimensions differ, or any conversion is missing:** do **not** fabricate a total. Keep a single merged row, set `quantity = null` (or the largest single contribution as a hint), and expose the per-source breakdown verbatim, e.g. `needs: 1 cup [Taco Bowls] + 1 bag [Weekly Staples]`. The UI lets the user resolve it manually.
- Always preserve all sources and all `raw_text`.

#### 8.1b Match/merge key
1. Primary key: `item_id` when both rows have one and variant attributes are compatible.
2. Fallback when an `item_id` is missing: normalize text (lowercase, trim, strip punctuation, singularize) and match against `Item.canonical_name` and `ItemAlias.alias_text`.
3. **Never merge on conflicting meaningful variants** (e.g., "vanilla yogurt" vs "plain Greek yogurt"). When in doubt, keep separate; the user can merge manually.

### 8.2 Restock Suggestion
For each active `restock` StapleRule:
1. If `snoozed_until` is in the future → state `snoozed`, skip suggesting.
2. Compute `effective_interval_days`:
   - `learned_median` = median of day-gaps between purchases **iff ≥ 3 prior purchases**; else null.
   - If `learned_median` exists → use it (prefer learned cadence).
   - Else if `expected_interval_days` set → use it.
   - Else → state "no cadence yet"; do not suggest (show in a "needs a cadence" area).
3. `days_since = today − last_purchased_date` (if `last_purchased_date` is null and an interval is configured, treat as due).
4. `ratio = days_since / effective_interval_days`.
   - `ratio ≥ 1.0` → **due**
   - `0.8 ≤ ratio < 1.0` → **maybe_due**
   - `ratio < 0.8` → **not_due**
5. `confidence`: `high` if learned from ≥5 obs; `medium` if 3–4 obs or manual interval; `low` otherwise.
6. Reason string, e.g. "Usually purchased every 42 days; last purchased 45 days ago." / "Manual interval every 30 days." / "Snoozed until Jul 15."
7. Sort suggestions by state (due → maybe_due), then confidence, then section route.
8. Same inputs always yield the same output. No LLM.

States: `due`, `maybe_due`, `not_due`, `snoozed`, `no_cadence`, `manually_added`.

### 8.3 Meal Suggestion (saved recipes only)
Deterministic score from: `favorite` (boost), `recently_used` (penalty by recency), `aldi_fit_status` (boost for higher fit), pantry overlap (boost for recipes using on-hand items), estimated cost (boost for lower known cost). No AI-generated recipes. Define weights as named constants so the ranking is testable and stable.

### 8.4 Aldi Fit (derived)
For a recipe, over ingredients that are mapped to items: `fit = (# aldi_friendly mapped items) / (# mapped items)`.
- `fit ≥ 0.8` → `good`
- `0.5 ≤ fit < 0.8` → `medium`
- `fit < 0.5` → `low`
- If too few ingredients are mapped to judge (e.g., < 50% mapped), → `unknown` and prompt mapping. No live product lookup.

## 9. Future-Ready Notes
Schema (not UI) should anticipate: Phase 2 — adult multi-user; built-in recipe suggestions; recipe URL import; total-order cost estimate; in-app pickup ordering via official partner APIs (not scraping); product matching; substitution/out-of-stock; predefined Aldi layout templates. Phase 3 — receipt import; public recipe hub; publishing/stars/forking; moderation/visibility; analytics from real receipts/orders. Build none of these now.

## 10. Non-Functional Requirements

### 10.1 Reliability
List generation is deterministic and repeatable. Missing optional data (price, unit, alias, section) never breaks workflows. A default **Other / Unassigned** section always exists.

### 10.2 Maintainability
Business logic in the services named in 4.3, never in UI components. Core deterministic logic is tested (Section 12).

### 10.3 Data Integrity
Never delete historical snapshots when editing live recipes/items. Soft-delete / `active` flags for reusable config. Preserve `raw_text` even when mapped. Keep estimated vs paid distinct. **Snapshots are denormalized and frozen** — editing a live `Item` must not alter any `TripSnapshotItem`.

### 10.4 Privacy & Locality
US-only, single-household. Recipes/history private by default. No public sharing. Design so user data can later be exported/deleted. **No real access control in Phase 1 → run local or behind basic auth only.**

## 11. Milestones (each ends with the "done when" gate)

- **M1 — Project & Data Foundation.** Next.js shell; schema + migrations; seed user/household/Aldi store/sections **and starter catalog**; basic nav. *Done when:* app loads; user can view seeded household/store/sections/items; core tables exist.
- **M2 — Store Layout & Item Catalog.** Section management; Item CRUD; section assignment; aliases + variant + **unit fields**. *Done when:* user can set route order and create/section items with purchase units.
- **M3 — Staples, Restock, Pantry.** Weekly staples; restock items; pantry status; restock engine (8.2). *Done when:* staples auto-add; restock review works incl. cold-start fallback; pantry `have` suppresses additions.
- **M4 — Recipes & Meal Planning.** Recipe CRUD; ingredient→item mapping; weekly plan with `target_servings`; saved-recipe suggestions; Aldi fit derived. *Done when:* select 3–4 recipes; scaled ingredients feed generation.
- **M5 — List Generation & Printing.** Generation service (8.1); merge service (8.1a/b) incl. incompatible-unit handling; source preservation; editable list UI; printable checkbox view. *Done when:* route-sorted merged list from all sources; clean print grouped by route.
- **M6 — Complete Trip, History, Pricing.** Complete-trip workflow; frozen snapshots; price entry/observations; analytics (6-month default). *Done when:* completed trips persist historically; item/meal/qty/price history viewable; restock uses real history.

## 12. Testing Requirements (core logic must have tests)

Behavioral minimums:
- Active weekly staples are included; deactivated are not.
- Restock due from manual interval; due from purchase history (≥3 obs).
- **Cold start:** <3 obs falls back to manual interval; no interval + <3 obs → `no_cadence`, not suggested.
- `maybe_due` boundary: ratio 0.8 and 0.999 → maybe_due; 1.0 → due; 0.79 → not_due.
- Snoozed items hidden until snooze date passes.
- Pantry `have` suppresses a recipe ingredient; user override re-adds it.
- Duplicate items merge on matching canonical identity.
- **Quantity aggregation:** same-dimension + conversion → summed and rounded up to whole purchase units.
- **Incompatible units do not fabricate a total** → row keeps per-source breakdown.
- Conflicting variants do not auto-merge.
- Source provenance preserved after merge (with per-source quantities).
- **Serving scaling:** scalable ingredient scales by target/base; `scalable=false` does not.
- Route sorting follows section order; unsectioned → Other / Unassigned.
- Completing a trip creates a frozen snapshot; **editing the item afterward does not change the snapshot**.
- Completing a trip updates last-purchased date.
- Estimated and paid prices stored separately.
- Aldi fit thresholds (0.8 / 0.5 / unknown) classify correctly.
- Analytics default to 6 months.

## 13. Guardrails

**Do not:** build live Aldi/Instacart scraping; build public recipe sharing; build receipt OCR/import; build mobile-first in-store mode; store list items as raw text only; lose provenance on merge; **fabricate a merged quantity across incompatible units**; delete history on edit; **mutate snapshots when live items change**; hardcode a single global route outside the store/section model; use an LLM for restock/merge/meal-fit decisions; collapse estimated vs paid into one field; deploy without auth.

**Do:** keep logic modular and tested; use deterministic services; preserve raw + normalized data; store enough structure for future pickup/pricing; keep the UI focused on the weekly flow; **handle missing data and cold start gracefully**.

## 14. Definition of Done

A user can: configure one Aldi route; manage items (with purchase units); create weekly staples; create restock items; track simple pantry status; manually create recipes; select 3–4 recipes (with serving scaling) for a week; generate a merged, route-sorted list from staples + restock + pantry + manual + recipe ingredients; **see why each item is present (with source quantities)**; print a clean checkbox list grouped by route; complete the trip; view 6-month item/meal/qty/price history; and get deterministic, explainable restock suggestions — including sensible behavior on day one with no history.

The architecture must remain ready for cost estimation, in-app pickup ordering, adult multi-user households, receipt import, and public recipe sharing in later phases.

---

## Appendix A — Starter Catalog (seed)

Seed roughly 100 common items. Each row: `name | default_section | purchase_unit | aldi_friendly`. Below is a representative subset to implement directly; expand to ~100 by following the same pattern (the agent may add obvious common groceries to fill out each section). All `aldi_friendly = true` unless a clearly specialty item.

**Produce:** Bananas | Produce | bunch | true · Apples | Produce | bag | true · Onions | Produce | bag | true · Garlic | Produce | each | true · Carrots | Produce | bag | true · Bell Peppers | Produce | each | true · Lettuce | Produce | each | true · Tomatoes | Produce | each | true · Potatoes | Produce | bag | true · Avocados | Produce | each | true

**Bakery / Bread:** Sandwich Bread | Bakery / Bread | loaf | true · Tortillas (flour) | Bakery / Bread | bag | true · Bagels | Bakery / Bread | bag | true · Hamburger Buns | Bakery / Bread | bag | true

**Deli / Refrigerated:** Sliced Turkey | Deli / Refrigerated | oz_package | true · Hummus | Deli / Refrigerated | each | true

**Meat:** Ground Beef | Meat | lb | true · Chicken Breast | Meat | lb | true · Bacon | Meat | oz_package | true · Ground Turkey | Meat | lb | true

**Dairy:** Milk (2%) | Dairy | gallon | true · Eggs | Dairy | dozen | true · Butter | Dairy | box | true · Shredded Cheese | Dairy | bag | true · Greek Yogurt | Dairy | each | true · Sour Cream | Dairy | each | true · Cream Cheese | Dairy | each | true

**Frozen:** Frozen Vegetables | Frozen | bag | true · Frozen Berries | Frozen | bag | true · Frozen Pizza | Frozen | each | true · Ice Cream | Frozen | each | true

**Pantry:** Rice | Pantry | bag | true · Pasta | Pantry | box | true · Pasta Sauce | Pantry | jar | true · Salsa | Pantry | jar | true · Olive Oil | Pantry | each | true · Peanut Butter | Pantry | jar | true · Cereal | Pantry | box | true · Oats | Pantry | each | true

**Canned Goods:** Black Beans | Canned Goods | can | true · Diced Tomatoes | Canned Goods | can | true · Corn | Canned Goods | can | true · Chicken Broth | Canned Goods | each | true

**Baking and Spices:** Flour | Baking and Spices | bag | true · Sugar | Baking and Spices | bag | true · Salt | Baking and Spices | each | true · Black Pepper | Baking and Spices | each | true · Baking Soda | Baking and Spices | box | true

**Snacks:** Tortilla Chips | Snacks | bag | true · Crackers | Snacks | box | true · Granola Bars | Snacks | box | true

**Household:** Paper Towels | Household | each | true · Toilet Paper | Household | each | true · Dish Soap | Household | each | true · Dishwasher Pods | Household | each | true · Trash Bags | Household | box | true · Laundry Detergent | Household | each | true

*Add `recipe_to_purchase` hints where obvious (e.g., Shredded Cheese: `{"cup": 0.5}` for an 8 oz bag ≈ 2 cups; Milk: `{"cup": 0.0625}` for 1 gallon = 16 cups). Leave unknown conversions empty — the merge engine handles their absence per 8.1a.*
