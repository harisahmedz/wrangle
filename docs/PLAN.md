# Build Plan — Wrangle

> Every phase ends with something you can click. Ship one slice, verify it, then move.
> Stack in `REQUIREMENTS.md` §4 · schema in `DATA-MODEL.md` · process in `DISCOVERY-LOOP.md` · interface rules in `UI-UX.md` · proposal pool in `FEATURES.md`.
> **Rule: no phase starts before `node_modules/next/dist/docs/` has been checked for that phase's APIs.**

---

## The cut line

```
Phase 0 → 1 → 2 → 3          = MVP (usable solo, replaces Trello for you)
Phase 4 → 5 → 6              = the full pitch (shared + money + learning)
Phase 7                      = feels like an app
Phase 8+                     = only if usage proves the need
```
Stop and *use it for a week* at the end of Phase 3 and again at Phase 7. Cycle the discovery loop each time.

---

## Phase 0 — Foundations
- [ ] Read bundled Next.js docs for breaking changes (routing, server actions, caching, metadata)
- [ ] Neon project + **two branches** (`main`, `dev`); pooled connection string in env
- [ ] ORM setup (Drizzle) + first migration: `users, accounts, sessions, projects, memberships`
- [ ] Auth.js v5: Google + GitHub, DB sessions, account linking on verified email
- [ ] `(app)` protected route group + middleware; `requireMembership()` helper stubbed and unit-tested
- [ ] App shell: desktop (top bar + right project sidebar) / mobile (bottom tabs); dark default + toggle
- [ ] Design tokens (CSS vars): color, spacing, radius, elevation, motion; base components: Button, Input, Sheet, Modal, Toast, Skeleton, EmptyState
- [ ] `.env.example`, README run instructions, seed script skeleton

**Done when:** you log in with Google *and* GitHub (same account), see an empty shell on desktop and phone, and toggling theme persists.

## Phase 0.5 — Safety net (do it now, not later)
- [ ] Vitest + one test on `requireMembership`
- [ ] Playwright + one smoke test: login → see shell
- [ ] GitHub Actions: typecheck · lint · test · build
- [ ] Sentry wired (client + server), `/api/health`

**Done when:** a red PR can't merge.

## Phase 1 — Projects
- [ ] Project CRUD: create, rename, emoji + color picker, archive, delete → trash
- [ ] Right sidebar: project list, active state, reorder, archived section; mobile drawer
- [ ] "My Space" auto-created on signup; cannot be deleted
- [ ] Membership rows written on create (owner); role enum enforced
- [ ] Project settings page + danger zone

**Done when:** you create 3 projects, switch between them on phone and desktop, and archiving hides one without losing it.

## Phase 2 — Kanban core (the spine)
- [ ] Schema: boards, columns, cards, labels, checklist_items, comments, attachments
- [ ] Seed 3 boards + default columns on project create
- [ ] Column CRUD + reorder; delete requires "move cards where?"
- [ ] Card create (inline, top or bottom of column), edit, archive, delete + **undo toast**
- [ ] Drag & drop: mouse + touch + **keyboard**, fractional positions, optimistic move
- [ ] Card detail: URL-addressable (`?card=`), desktop side-panel / mobile full-screen sheet
- [ ] Card fields: description (markdown, sanitized), due date (+all-day), labels, checklist with progress, assignees
- [ ] Attachments via Cloudinary **signed** upload + thumbnail + delete
- [ ] Comments (plain markdown)
- [ ] Activity rows written on create/move/complete

**Done when:** you run one real week of your own tasks on it, on your phone, and don't want to reach for Trello. Board with 200 seeded cards still opens fast.

## Phase 3 — Three boards, filters, Today
- [ ] Top tab switcher To-Do / Ideas / Work, remembered per project
- [ ] Ideas: impact/effort inputs, score chip, sort-by-score
- [ ] **Promote idea → task** (move + activity + undo)
- [ ] Filter bar: label · assignee · due · text
- [ ] Search within project (full-text + trigram)
- [ ] **Today / Upcoming cross-project view** (R15) with inline tick-off
- [ ] Quick-add sheet from the global `+` (defaults to My Space → To-Do)

**Done when:** switching boards feels instant, and "Today" is the screen you open first in the morning.

> 🛑 **Discovery loop cycle here.** Use it for 5+ days. Capture friction. Re-triage before Phase 4.

## Phase 3.5 — UX hardening (cycle-5 audit P0s, detail in `UI-UX.md` §9)
- [ ] 🐛 Receipts viewable: write `receipt_url` on confirm; edit preserves/replaces the receipt (B45)
- [ ] 🐛 Learn uses `users.timezone`, not UTC (B53)
- [ ] `error.tsx` + `not-found.tsx` + `global-error.tsx` in house style; `loading.tsx` for board + trash routes (B46/B47)
- [ ] Dialog focus trap + scroll lock + `inert` in `ui/dialog.tsx`; kill the last native `confirm()` (B50/B51)
- [ ] `/boards` becomes a real hub — no placeholder copy in primary nav (B48)
- [ ] Settings page: persist theme to `users.theme` (+ system option), timezone, currency (B49)
- [ ] Migration journal reconciled — one source of truth for applied SQL (B64)
- [ ] README rewritten: setup, env, migrate, seed, deploy (B63)

**Done when:** working rule 2 holds on every shipped route, and nothing in the app says "lands in Phase 2".

## Phase 4 — Sharing
- [ ] Invite create UI: role, expiry, max uses; token shown once; active-invite list + revoke
- [ ] `/join/[token]`: logged out → OAuth → join → land in project; idempotent; expired/revoked/used-up states
- [ ] Members UI: list, change role, remove, leave, transfer ownership
- [ ] Server-side permission checks on **every** action (audit pass, checklist per action)
- [ ] Rate limits on invite create/redeem
- [ ] **Playwright authz suite**: user B cannot read/write user A's project, board, card, comment, attachment, expense (expect 404)

**Done when:** a friend joins from their phone, edits a card, and the authz suite is green.

## Phase 5 — Expenses
- [ ] Schema: expense_categories (seeded), expenses (with nullable `project_id`)
- [ ] Add-expense sheet: amount keypad, category chips, date, note — target < 15s
- [ ] Receipt photo upload (compress client-side, strip EXIF, Cloudinary)
- [ ] List by month + month switcher; edit/delete + undo
- [ ] Summary: month total, by-category donut, 6-month trend, this-vs-last-month delta
- [ ] 🔶 budgets · recurring · CSV export — backlog

**Done when:** you log a real receipt from your phone and the monthly breakdown matches your bank.

## Phase 6 — Learning tracker
- [ ] Schema: items, milestones, sessions, resources, notes
- [ ] Pipeline UI Want → Learning → Learned (drag or tap-to-advance)
- [ ] Item detail: type, source URL, why-note, target date, milestones (drive progress %), hours via session log
- [ ] Resources + notes journal
- [ ] "Add to board" → creates a linked card
- [ ] Learned archive + 🎉 completion moment
- [ ] 🔶 weekly goal / streaks — backlog

**Done when:** you track one real course from Want → Learned and the hours are honest.

## Phase 7 — PWA + mobile polish
- [ ] Manifest (maskable icons, theme color, **shortcuts**: New task / Today / New expense)
- [ ] SW hardening: hand-rolled `public/sw.js` already ships precache/offline-fallback/update-prompt — keep it or adopt Serwist (G5-07); add SWR data caching either way
- [ ] **Share Target**: share a link into Wrangle → quick-add prefilled
- [ ] Install prompt handling (Android `beforeinstallprompt`, iOS A2HS hint)
- [ ] Offline read of last-seen boards; graceful write failure ("saved when you're back" is Phase 8, not now — fail loudly instead)
- [ ] Gesture polish: column snap-scroll, long-press drag, swipe-down dismiss, pull-to-refresh
- [ ] Skeletons everywhere, safe-area insets, 44px targets, reduced-motion, focus rings
- [ ] Lighthouse PWA + perf pass against §3.11 budgets

**Done when:** installed on your home screen, survives airplane mode read-only, and nothing about it says "website".

## Phase 8 — Notifications & realtime (only if earned)
- [ ] In-app notification inbox (mentions, assignment, invite accepted, due-today)
- [ ] Web push subscriptions + due-date reminders (remember: iOS needs the PWA installed)
- [ ] Live board updates: start with 30s polling on visible board → SSE → Pusher only if that's not enough
- [ ] Optional email digest

## Phase 9 — Account, data, trust
- [ ] Profile: name, avatar (Cloudinary), timezone, currency, theme
- [ ] Export all data (JSON + CSV per module)
- [ ] Delete account (hard, with export offered first)
- [ ] Trash UI + 30-day purge cron (Vercel Cron) + Cloudinary cleanup
- [ ] Weekly `pg_dump` backup script documented

## Phase 10 — Nice-to-haves backlog
Recurring tasks · calendar view · saved filters · bulk actions · command palette ⌘K · project templates · public read-only share view · budgets · expense splitting · streaks · i18n · card→card dependencies · offline editing with sync queue.

## The flagship track — **The Loop** (post-Phase-7, research-backed, see `FLAGSHIP-2026.md`)
Ordered slices; each is independently shippable and the ⚡ ones need no AI (they dodge the §1.3 AI gate):
1. ⚡ **Shutdown** — plan-today (pick 3, `focused_on`), evening close (tomorrow / done / let go), `day_reviews`, consistency stats (B70/B71)
2. ⚡ **Dump v1** — hold-FAB voice/text brain dump → heuristic sorted tray (chrono-node + amount regex) (B67)
3. ⚡ **Life Wrapped** — monthly 9:16 share cards after a month of Shutdown data (B69)
4. **Dump v2 + Wrapped narrative** — on-device Prompt API, desktop, only after the AI gate opens (B68)

---

## Working rules
1. One slice per PR. If a PR touches two phases, split it.
2. Every slice ships with: the happy path, the empty state, the error state, and the loading state. A feature without an empty state is unfinished.
3. Every destructive action ships with undo or trash.
4. Every new read path gets an authz check *and* a test that it blocks a stranger.
5. Before each phase: skim the bundled Next docs. After each phase: run the discovery loop.
