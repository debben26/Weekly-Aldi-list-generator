# Aldi Weekly Grocery Planner

A single-household, single-Aldi-store weekly grocery planning app. It generates a printable,
route-ordered checklist by merging weekly staples, scaled recipe ingredients, restock
suggestions, pantry status, and manual additions — and preserves frozen shopping history so
restock suggestions improve over time.

Built to `spec.md` (the authoritative Phase 1 spec). All business logic is deterministic and
lives in named services; there is no LLM in the core logic.

## Stack

- **Next.js (App Router) + React + TypeScript**, Tailwind CSS
- **PostgreSQL** via **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Vitest** for unit + integration tests
- Local single-user dev mode — **no auth in Phase 1**, so keep it local (the DB binds to
  `127.0.0.1` only). Do not deploy openly.

## Prerequisites

- Node 20+ and npm
- Docker Desktop (for the local Postgres container)

## Setup & run

```bash
docker compose up -d        # start local Postgres (localhost:5432)
npm install
cp .env.example .env        # DATABASE_URL (matches docker-compose)
npm run db:migrate          # apply schema migrations
npm run db:seed             # 1 user/household, Aldi store, 12 sections, ~100 catalog items
npm run dev                 # http://localhost:3000
```

The seed is idempotent, so the app is useful on first run and re-seeding is safe.

## The weekly flow

Dashboard → **Store Layout** (route order) · **Items** (catalog, units, aliases, variants) ·
**Staples & Restock** (auto staples + deterministic restock review) · **Pantry** (have/low/out) ·
**Recipes** (ingredients, item mapping, Aldi-fit) · **Meal Plan** (pick 3–4, serving scaling) →
**Grocery List** (generate → merged, route-sorted, editable → **print**) → **Complete trip** →
**History** (6-month analytics).

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Fast unit tests (pure services, no DB) |
| `npm run test:integration` | DB integration tests (`*.itest.ts`; needs Postgres up) |
| `npm run db:migrate` / `db:seed` | Prisma migrate / seed |
| `npm run db:studio` | Prisma Studio (browse the DB) |
| `npm run db:reset` | Drop + re-migrate + re-seed |
| `npm run lint` | ESLint |

## Architecture

- **Services** (`src/services/`) hold all deterministic business logic, each unit-tested:
  `GroceryListGenerationService`, `ItemMergeService`, `UnitService`, `RestockSuggestionService`,
  `MealSuggestionService`, `TripCompletionService`, `PriceObservationService`, `AnalyticsService`.
  Thresholds and ranking weights are named constants in `src/lib/constants.ts`.
- **Pages/actions** (`src/app/`) are thin: server components read via Prisma; server actions
  mutate. DB orchestration that's too heavy for a pure service lives next to its route
  (e.g. `grocery-list/generate.ts`, `grocery-list/complete.ts`, `*/data.ts`).
- **Prisma schema** (`prisma/schema.prisma`) covers all of spec §5. Trip snapshots are
  **denormalized and frozen**: `TripSnapshotItem` stores display values and keeps `item_id` as a
  plain column (no FK), so editing a live `Item` never mutates history (proven by
  `complete.itest.ts`).

## Key correctness rules (spec §8)

- **Unit aggregation (8.1a):** quantities are summed and rounded up to whole purchase units
  **only** when units share a dimension and a conversion exists; otherwise the row keeps a
  verbatim per-source breakdown and no fabricated total.
- **Merge provenance (8.1b):** match on `item_id` + aliases, fall back to normalized text only
  when unmapped; never auto-merge conflicting variants; every merged row keeps all its sources.
- **Restock cold start (8.2):** learned cadence needs ≥3 prior purchases, else the manual
  interval, else `no_cadence`. Thresholds: `due ≥ 1.0`, `maybe_due ≥ 0.8`.
- **Serving scaling (8.1):** scale by `target/base`, but leave `scalable = false` ingredients
  untouched.

## Phase 1 scope

Implements spec milestones M1–M6. Out of scope (do **not** add): scraping, receipt OCR,
public/imported recipes, live pricing, in-app ordering, mobile-first mode, multi-store/household.
The schema is kept forward-compatible for those later phases.
