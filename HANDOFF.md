# Wrangle — Handoff Guide

> Everything a new developer (or future you) needs to take over this codebase in 10 minutes.

## What this is

**Wrangle** — a PWA that holds four things in one place: **Tasks** (Trello-style kanban per project), **Ideas** (impact/effort scored, promotable to tasks), **Learning** (Want → Learning → Learned pipeline), and **Money** (expense logging with receipts). Solo-first, shareable per-project via invite links.

One sentence: *"what to do, what I'm thinking about, what I'm learning, what I'm spending."*

Full product thinking lives in `docs/` — read in this order:
1. `docs/REQUIREMENTS.md` — locked requirements (R1–R17), feature spec, security checklist
2. `docs/PLAN.md` — phase-by-phase build plan (Phases 0–7 shipped)
3. `docs/DATA-MODEL.md` — schema conventions (UUIDv7, fractional indexes, soft-delete)
4. `docs/DISCOVERY-LOOP.md` — the product process + open backlog (B41–B44)

## Current status (as of this handoff)

| Phase | Scope | State |
|---|---|---|
| 0 | Foundations: DB, auth, shell, theming | ✅ |
| 0.5 | Safety net: Vitest, Playwright, CI, health endpoint, Sentry (dormant) | ✅ |
| 1 | Projects: CRUD, archive/trash, settings, danger zone | ✅ |
| 2 | Kanban: boards/columns/cards, DnD, full cards (checklists, labels, assignees, comments, receipts), activity log | ✅ |
| 3 | Remembered board tabs, idea scoring + promote, filters, per-project search, Today view, quick-add | ✅ |
| 4 | Sharing: hashed invite links, `/join/[token]`, members + roles, rate limits | ✅ |
| 5 | Expenses: keypad entry, receipts via Cloudinary, month summaries (donut + trend), category manager | ✅ |
| 6 | Learning tracker: pipeline, milestones → progress %, session logs, journal, board links | ✅ |
| 7 | PWA: manifest + shortcuts + Share Target, offline SW, install prompts, skeletons, hotkeys | ✅ |
| 8+ | Notifications, realtime, budgets/recurring/CSV, global search, command palette | ⬜ backlog |
| F1–F3 | Flagship "The Loop": Dump v1, Shutdown, Life Wrapped (see `docs/FLAGSHIP-2026.md`) | ✅ |
| F4 | Dump v2 + Wrapped narrative (on-device Gemini Nano) | ⛔ AI-gated (§1.3) |
| F5 | Weekly Review rollup — the middle chapter of the Loop family (`/weekly`) | ✅ |

## Stack

- **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict**
- **Tailwind CSS v4** (CSS-variable design tokens in `app/globals.css`, dark default)
- **PostgreSQL on Neon** via `@neondatabase/serverless` (WebSocket pool) + **Drizzle ORM**
- **Auth.js v5** (next-auth@beta) — Google + GitHub OAuth, **DB sessions**, verified-email account linking
- **zod** validation shared client/server; **Server Actions** for all mutations
- **@dnd-kit** for drag & drop; **fractional-indexing** for order keys
- **marked + sanitize-html** for markdown; **Cloudinary signed uploads** for images/PDFs
- Vitest (unit) + Playwright (e2e) + GitHub Actions CI

## Running locally

```powershell
npm install
npm run dev          # http://localhost:3000  (add "-- -p 3001" if 3000 is taken)
```

Required in `.env.local` (template in `.env.example`):
- `DATABASE_URL` — Neon **pooled** string
- `DIRECT_DATABASE_URL` — Neon direct string (migrations only)
- `AUTH_SECRET` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` — with redirect URIs
  `{origin}/api/auth/callback/google` and `/github` for **whatever origin:port you run on**
- Optional: `CLOUDINARY_*` (receipts/card images), `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (error tracking, dormant until set)

Useful scripts:
```powershell
npm run db:generate     # drizzle-kit generate (schema → SQL)
npm run db:migrate      # apply drizzle/*.sql (idempotent, tracked in drizzle_migrations)
npm test                # vitest unit tests
npm run test:e2e        # playwright (boots its own server on :3100)
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
node scripts/selftest.mjs   # authenticated smoke test vs a running server (SERVER_URL env)
node scripts/backfill-boards.mjs  # seed boards for projects missing them
```

## Architecture map

```
app/
  layout.tsx            root: fonts, theme init (no-FOUC), SW register, install prompt
  page.tsx              landing (redirects to /today when signed in)
  signin/               OAuth buttons (inline server actions → signIn)
  join/[token]/         invite redemption: logged-out → OAuth → join; idempotent
  manifest.ts           PWA manifest (shortcuts, Share Target)
  api/auth/[...nextauth]/  Auth.js handlers
  api/health/           DB ping
  (app)/                AUTHENTICATED shell group (proxy.ts guards, layout re-checks)
    layout.tsx          topbar + right sidebar + bottom tabs + hotkeys + toast provider
    today/              cross-project due/overdue/next-7-days, tick-off, onboarding
    shutdown/           The Loop · Shutdown: plan-today focus, evening close, consistency
    wrapped/            The Loop · Life Wrapped: monthly recap + 9:16 share cards
    boards/             project grid
    money/              month switcher, summary, donut/trend, expense list
    learn/              Want/Learning/Learned pipeline + ?item= detail sheet
    trash/              projects + cards + expenses, restore within 30 days
    p/[projectId]/      /b/[kind] boards · /settings · /members · /activity · /search
components/
  app/                  top-bar, side-projects, mobile-drawer, bottom-tabs, hotkeys, theme-toggle
  ui/                   Button, Input, Modal/Sheet, Toast (undo), Skeleton, EmptyState
  kanban/               board-view (DnD orchestration), column, card-chip, card-detail, tabs, quick-add, today-list
  projects/             dialogs + forms (new project, settings, danger zone, share, members)
  expenses/             add-sheet (keypad), list, charts (SVG donut/trend), category manager
  learn/                pipeline card, detail sheet, add button
  pwa/                  sw-register (offline banner + update toast), install-prompt, triggers
lib/
  authz.ts              requireMembership(projectId, minRole) — THE authz gate (404s strangers)
  kanban/               actions (server), detail-actions, phase3-actions, activity, search, score, seed, types
  actions/              projects, invites, expenses, learning, shutdown, dump, wrapped, auth, types (ActionResult)
  dump/                 Dump v1 heuristic parser + Web Speech hook
  shutdown/             pure consistency stats (anti-streak)
  wrapped/              month windows, pure recap stats, deterministic archetype
  sharing/              permissions matrix (pure), tokens (hash), ratelimit (Postgres fixed-window)
  validation/           zod schemas per domain
  money.ts, dates.ts, markdown.ts, cloudinary.ts, uuid.ts
db/                     schema.ts (all tables) + index.ts (lazy Neon pool + drizzle)
drizzle/                SQL migrations (applied by scripts/migrate.mjs, tracked)
proxy.ts                Next 16 proxy (NOT middleware): cookie-presence gate + last-board cookie
public/sw.js            hand-rolled service worker (see gotchas)
scripts/                migrate, backfill-boards, selftest, gen-icons
```

**Authz rule (non-negotiable):** every server action / page resolves membership via `requireMembership(projectId, minRole)` first. Strangers get **404** (not 403) — never leak existence. `proxy.ts` is only a first-line cookie check; it is not authorization.

## Data & migrations

- Schema lives in `db/schema.ts`. Change there first, then `npm run db:generate` + `npm run db:migrate`.
- **Do NOT use `drizzle-kit push`** — its own websocket stalls in this environment; generate + migrate is the reliable path.
- Conventions (enforced by existing code): UUIDv7 PKs (client-generatable), `created_at/updated_at` everywhere user-visible, `deleted_at` soft-delete (trash = 30-day restore), `position` fractional-index strings (single-row reorder writes), money = `amount_minor bigint` + `currency char(3)`.
- Neon free tier: 0.5 GB, compute sleeps after 5 min (first query wakes it — that's the occasional slow first load).

## Auth specifics

- **DB sessions** (`sessions` table, `authjs.session-token` cookie, 30 days).
- Account linking: same **verified** email across Google/GitHub → one user row (`allowDangerousEmailAccountLinking` + both providers only expose verified emails).
- Signup hook (`events.createUser` in `auth.ts`) auto-creates **My Space** (personal project, undeletable) + owner membership + 3 seeded boards with default columns + 7 expense categories — all in one transaction.
- `db/index.ts` constructs a **real** Drizzle instance eagerly (the Drizzle adapter does an `is()` brand check — a lazy proxy fails it) but tolerates a missing `DATABASE_URL` until the first query so CI builds work without secrets.

## Gotchas (learned the hard way)

1. **Port 3000** is often occupied by another local app — Playwright is configured to boot its own server on **:3100** for this reason.
2. **Turbopack is the default** builder; Serwist's webpack plugin doesn't run under it, so `public/sw.js` is hand-rolled (network-first navigations w/ last-good-page cache, cache-first statics, offline fallback, skipWaiting update flow). If you switch to webpack builds you can swap in Serwist.
3. **`next lint` is removed in Next 16** — use `npx eslint .` directly; build does not lint.
4. Async request APIs everywhere: `await cookies()`, `await params`, `await searchParams` (Next 16 requirement).
5. `react-hooks/purity` flags `Date.now()` in render — compute time in SQL (`now()`) or behind a timeout when it's genuinely per-request data.
6. Inline `"use server"` functions are **not allowed in client components** — put them in `lib/actions/*` files instead.
7. Raw SQL scripts must supply UUIDs explicitly — Drizzle's `$defaultFn` is JS-side only.
8. **Migrations have two namespaces** in `drizzle/`: `0xxx` = drizzle-kit generated (rename semantic before committing), `1xxx_supplement_*` = hand-written raw SQL (CHECK constraints, FTS/trgm indexes). Both applied by `scripts/migrate.mjs`, tracked by filename in `drizzle_migrations`. Renaming an already-applied file requires updating its hash row too.
9. **The migrate script doesn't load `.env.local` by itself** — run `node --env-file=.env.local scripts/migrate.mjs`.
10. Theme persistence: one mechanism — `localStorage['wrangle-theme']` (`dark|light|system`, missing ≡ system) + `html.light`; the init script in `app/layout.tsx` live-follows OS changes while in system mode. Settings and top-bar toggle both write this pair; keep it that way.
11. **Streamed routes return soft-404s**: any route with a `loading.tsx` (board, today, learn, money, trash, wrapped, weekly…) flushes its shell with HTTP 200 before the server component runs — so `requireMembership`'s `notFound()` renders in-stream with status 200. Authz still holds (strangers see the not-found UI, never project data); the selftest IDOR checks assert "denied & no leak" rather than strict 404 status for exactly this reason.

## Testing

- `npm test` — 104 unit tests (authz matrix, permissions, dates/timezones, money, markdown sanitizer, learning logic, board seeding integration vs real Neon; Loop: shutdown consistency stats ×11, dump parser ×19, wrapped stats/archetype ×29; weekly review windows/stats ×15, reorderById ×5).
- `npm run test:e2e` — anonymous smoke + authz redirects (full two-user OAuth e2e is still open — needs test credentials or a test-auth strategy).
- `node scripts/selftest.mjs` — injects two temp users + sessions into Neon, hits every protected route over HTTP (including the stranger→404 IDOR checks), cleans up after. Run against any live server with `SERVER_URL`.

## Known gaps / next steps

- **Flagship next**: nothing in the ⚡ family remains — day closes (`/shutdown`), week reviews (`/weekly`), month wraps (`/wrapped`) all ship. Next is the AI gate decision: Dump v2 (B68) after 2 real weeks of MVP use.
- **AI gate** (REQUIREMENTS §1.3): Dump v2 (Prompt API classify) + Wrapped narrative line stay blocked until 2 real weeks of MVP use.
- **CI**: first run may need Playwright browser install tuning (`npx playwright install --with-deps chromium` is in the workflow).
- **Lighthouse pass** (§3.11 budgets) not yet run on real hardware.
- Backlog: column soft-delete purge cron, global search, command palette (⌘K), optimistic comments/checklists, budgets/recurring/CSV export, notifications (Phase 8), realtime (Phase 8), lucide icon pass (B65, deferred).
- `docs/FEATURES.md`, `docs/FLAGSHIP-2026.md`, `docs/UI-UX.md` — newer product docs; reconcile with `REQUIREMENTS.md` before building more.
- Sentry is wired but dormant — set the DSNs when you want eyes on production errors; source-map upload stays disabled until `SENTRY_AUTH_TOKEN` exists.

## Deploy (when ready)

Vercel + Neon: set the same env vars in Vercel (production → Neon `main` branch), add production OAuth redirect URIs, run `npm run db:migrate` as a deploy step (never auto-on-boot). Hobby tier is fine for personal, non-commercial use.
