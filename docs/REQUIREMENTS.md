# Requirements — **Wrangle**

> Living document. Every discovery-loop cycle updates this file.
> Status legend: ✅ decided · 🔶 proposed (needs your call) · ❓ open question · ⛔ explicit non-goal
> Companions: `PLAN.md` (build order) · `DATA-MODEL.md` (schema) · `DISCOVERY-LOOP.md` (process + open grill) · `UI-UX.md` (interface rules + audit) · `FEATURES.md` (sellable/expansion proposal pool) · `FLAGSHIP-2026.md` (the researched big swing: The Loop)

---

## 1. Vision

A **PWA + web app** (no native builds, no app stores) that holds four things in one place:

- **Tasks** — Trello-style kanban, organised **project-wise**
- **Ideas** — cheap capture, promote the good ones into tasks
- **Learning** — what you want to learn, what you're on, what you finished
- **Money** — what you spent, on what, with the receipt

One sentence: *"what to do, what I'm thinking about, what I'm learning, what I'm spending."*

### 1.1 Personas / usage modes
| Mode | Who | What they need |
|------|-----|----------------|
| **Solo daily driver** | you, on your phone, 20×/day | capture in <3 taps, see today, tick things off |
| **Solo weekly review** | you, on desktop | drag things around, plan, look at spend chart |
| **Shared project** | 1–5 friends/colleagues you invite by link | see the same board, edit cards, never see your personal stuff |
| **Viewer** | someone you show progress to | read-only, no accidental edits |

### 1.2 Success criteria (what "it worked" means)
- S1 — You stop using Trello/Notes/whatever for a full week without missing them.
- S2 — Capture a task from phone lock screen to saved card in **≤ 3 taps + typing**.
- S3 — Board with 200 cards opens in **< 1.5s** on 4G mid-range Android.
- S4 — A friend joins a project from a link on their phone and can edit within 60 seconds, and **provably cannot** see any other project.
- S5 — Log an expense with a receipt photo in **< 15 seconds**.

### 1.3 Non-goals (⛔ say no on purpose)
- ⛔ Native iOS/Android apps, app store presence
- ⛔ Multi-tenant SaaS, billing, teams-of-teams, org admin
- ⛔ Gantt charts, sprints, story points, time-tracking-for-invoicing
- ⛔ Multi-currency conversion with live FX rates (single currency, see R12)
- ⛔ Full offline **editing** in v1 (read-cache only — sync conflicts are a project of their own)
- ⛔ AI features in v1 (no auto-summaries, no chatbot). Revisit only after MVP is used for 2 weeks.

---

## 2. Core requirements (locked)

| # | Requirement | Status |
|---|-------------|--------|
| R1 | Task lists organised by **project** | ✅ |
| R2 | **Kanban board** like Trello (drag & drop cards) | ✅ |
| R3 | Right sidebar with **project tabs** (drawer on mobile) | ✅ |
| R4 | Top tabs switching **To-Do / Ideas / Work** — three separate boards per project | ✅ |
| R5 | Login with **Google + GitHub** OAuth only (no passwords, no magic links) | ✅ |
| R6 | **Share link** → join one specific project via token | ✅ |
| R7 | Built on **Next.js**, secure by default, all authz server-side | ✅ |
| R8 | Database = **PostgreSQL on Neon** | ✅ **locked** — see §4.1 |
| R9 | Images in **Cloudinary** (attachments, receipts, avatars), signed uploads only | ✅ |
| R10 | **PWA**: installable, offline read, no app stores | ✅ |
| R11 | Mobile = **native-app-like** experience (design delegated to me) | ✅ see §3.9 |
| R12 | **Single currency = USD** (your call, grill R2), stored in minor units (integer), currency code column present from day 1 | ✅ |
| R13 | **Dark theme default**, light toggle, respects `prefers-color-scheme` on first visit | ✅ |
| R14 | Everything destructive is **undoable** (toast undo) or **restorable** (trash, 30 days) | ✅ new |
| R15 | **Cross-project "Today"** view — the one thing Trello can't do for you | ✅ new, MVP+1 |
| R16 | **Export my data** (JSON + CSV) and **delete my account** — self-serve | ✅ new |
| R17 | Keyboard-usable on desktop, screen-reader-safe drag & drop | ✅ new |

---

## 3. Feature set

### 3.1 Projects & navigation
- Create / rename / archive / delete (→ trash) projects; **color + emoji** icon
- **Right sidebar**: project list, collapsible on desktop, slide-over drawer on mobile, reorderable, "archived" section collapsed
- Personal default project auto-created on signup: **"My Space"** (cannot be deleted, can be renamed)
- Per-project areas: Boards (To-Do/Ideas/Work) · Members · Settings · *(Expenses attach later)*
- Project settings: name, emoji, color, default board, member list, danger zone (archive/delete/transfer)
- ✅ **Inbox capture** — a global `+` that saves to `My Space → To-Do` when you don't want to pick a project yet

### 3.2 Kanban / tasks
**Board & columns**
- Columns: custom names, add/rename/delete/reorder, color accent, collapse column
- Default seed per new board: To-Do → `Backlog · Doing · Done`; Ideas → `Raw · Shortlist · Promoted`; Work → `Todo · In Progress · Blocked · Done`
- Column delete requires "move cards where?" prompt (never silently destroy cards)
- 🔶 WIP limits — off by default, later

**Cards (full-featured in v1, per decision)**
- title, rich-ish description (markdown), labels (per-project palette), due date (+ optional time), assignees, checklist/subtasks with progress bar, attachments (Cloudinary), comments, cover color/image, created/updated meta
- Card detail = **desktop right side-panel / mobile full-screen sheet**, URL-addressable (`?card=<id>`) so it's shareable and back-button works
- Actions: duplicate, move to another column/board/project, archive, delete (trash), copy link
- **Promote idea → task**: moves the card to the To-Do board with an activity entry + toast undo (a move, not a copy — one card, one truth)
- Drag & drop: mouse, touch (long-press ~180ms), and **keyboard** (space to lift, arrows, space to drop) with live-region announcements
- Ordering via **fractional index strings** — no "reindex the whole column" writes (see `DATA-MODEL.md` §3)
- **Optimistic UI** everywhere; server rejects stale writes via `updatedAt` check and the client re-syncs

**Finding things**
- Filter bar: label · assignee · due (overdue/today/week/none) · has attachment · text
- Search across cards in the current project (Postgres full-text + trigram fallback for typos); global search later
- Saved filters per project (🔶 later)
- Bulk select (desktop: shift-click / mobile: long-press multi) → move, label, archive (🔶 later)

**Recurrence & reminders**
- 🔶 Recurring cards (daily/weekly/monthly/custom) — G3-11
- Due-date reminders: in-app badge in v1; web push in phase 8

### 3.3 To-Do / Ideas / Work
- Three separate boards per project, top tab switcher, tab state remembered per project
- Ideas board extras: **impact (1–5)** and **effort (1–5)** fields → auto "score" chip, sort by score
- Work board is the "shipping" board — same schema, different default columns
- 🔶 Board names editable / add a 4th board — schema supports N boards from day 1, UI exposes 3

### 3.4 Cross-project views (R15)
- **Today**: everything due today or overdue, across all projects, grouped by project, tick-off inline
- **Upcoming**: next 7 days
- **Assigned to me**: across shared projects
- These are read-and-tick views, not full boards — deliberately simple

### 3.5 Sharing & permissions
- Owner/admin generates invite link `…/join/<token>` — token 32-byte random, **stored hashed**, expiry (default 7 days), max uses (default 10), revocable, list of active invites
- Join flow: not logged in → OAuth → auto-join → land inside the project
- Roles: **owner / admin / member / viewer**
  | Action | viewer | member | admin | owner |
  |---|:--:|:--:|:--:|:--:|
  | see board / cards / comments | ✅ | ✅ | ✅ | ✅ |
  | create / edit / move cards | — | ✅ | ✅ | ✅ |
  | comment | — | ✅ | ✅ | ✅ |
  | manage columns / labels | — | — | ✅ | ✅ |
  | invite / remove members, change roles | — | — | ✅ | ✅ |
  | delete project, transfer ownership | — | — | — | ✅ |
- Leave project (owner must transfer first); remove member; change role
- ✅ **Expenses are never shared** while they're a personal module — enforced by there being no project link yet
- 🔶 Approval-required invites / join requests — later

### 3.6 Expenses (standalone in v1, project-linkable later)
- Entry: amount, category, date, note, optional payment method, receipt photo
- Categories: seeded set (Food, Transport, Bills, Shopping, Health, Fun, Other) + user CRUD with emoji/color
- Summary: month total, by-category donut, 6-month trend bar, biggest expenses list
- Month switcher; "this month vs last month" delta
- `projectId` **nullable from day 1** so per-project attribution can land later without a migration circus
- Money stored as **integer minor units** + `currency` column (never floats)
- 🔶 Recurring/subscription expenses · 🔶 income & balance · 🔶 budgets + alerts · 🔶 CSV import/export · 🔶 receipt OCR · 🔶 split & settle-up (only meaningful after project-linking)

### 3.7 Learning tracker
- Item types: `course · book · video · article · skill · other`
- Pipeline: **Want to learn → Learning → Learned** (kanban-ish or list, same DnD primitives)
- Fields: title, type, source URL, why-I-care note, target date, progress %, hours logged
- **Milestones** checklist (e.g. "Section 1–4") — ticking milestones drives progress %; manual override allowed
- **Session log**: add hours with a date + note (this is what makes "hours" trustworthy)
- Resources (links) + notes journal per item, markdown
- 🎉 "Learned" completion moment + archive
- ✅ **Link learning → tasks**: "add to board" creates a card in a chosen project's To-Do, linked back to the learning item
- 🔶 Weekly hour goal · 🔶 streaks · 🔶 spaced-repetition review prompts

### 3.8 Activity, notifications, undo
- Per-project activity feed + per-card history ("Ali moved *Design DB* to Done", "Sara joined")
- In-app notification inbox: mentions, assignments, invites accepted, due-today digest
- Toast **Undo** on: delete card, move card, archive, bulk actions (10s window)
- **Trash**: deleted cards/projects/expenses restorable for 30 days, then hard-purged by a cron

### 3.9 PWA & mobile experience (my call, as delegated)
- Manifest with maskable icons, `display: standalone`, theme color, **app shortcuts** (New task / Today / New expense)
- **Share Target API**: share a link/text from any app → Wrangle opens the quick-add sheet pre-filled (this alone makes it feel native)
- Service worker (Serwist): app shell precache, stale-while-revalidate for data reads, offline banner
- Bottom tab bar: `Today · Boards · ➕ · Money · Learn` (Profile lives in the top-right avatar)
- Kanban on mobile: horizontal snap-scroll between columns, long-press drag with haptic-ish feedback, tap card → full-screen sheet, swipe-down to dismiss
- Pull-to-refresh, skeleton loaders, safe-area insets, no rubber-band jank, 44px minimum touch targets
- Install prompt: capture `beforeinstallprompt`, show a subtle banner on second visit, iOS gets a "Add to Home Screen" hint sheet instead
- Note: **iOS web push only works after the PWA is installed** (iOS 16.4+) — plan notifications accordingly

### 3.10 Accessibility & i18n (R17)
- Contrast AA in both themes; visible focus rings; `prefers-reduced-motion` respected
- Full keyboard path for: create card, move card, open detail, close sheet (focus trap + restore)
- Screen-reader live regions for drag results and toasts
- All timestamps stored UTC, rendered in the **user's timezone** (stored on the user row, detected on signup); "all-day" due dates stored as plain dates, not timestamps
- Copy is English-only in v1; no hardcoded strings in components that would block i18n later

### 3.11 Performance budgets
- LCP < 2.0s on 4G mid-tier Android for board view; TTI < 3s
- Route JS ≤ 200KB gzipped for the board route
- Columns virtualize past 100 cards; card lists paginate at 500
- Every list query has a covering index; zero N+1 (assert with query logging in dev)
- Server Components by default; client JS only where interaction demands it

### 3.12 Limits & abuse guards (pick numbers now, enforce in code)
| Thing | Limit v1 |
|---|---|
| projects per user | 50 |
| members per project | 20 |
| cards per column | 500 (soft warn at 300) |
| attachments per card | 10, ≤ 10MB each, images/pdf only |
| upload volume per user | 100MB total (Cloudinary free tier guard) |
| invites created | 10 / project / hour |
| auth attempts | 20 / IP / 10min |
| comment length | 5,000 chars |

### 3.13 The Loop — flagship (✅ ⚡ slices shipped, see `FLAGSHIP-2026.md`)
- **The Dump v1** (B67): hold ➕ FAB / quick-add mic / "Sort this…" → say or paste anything → heuristic parse (chrono-node dates, amount regex, prefix cues) → review tray with recast/edit/remove → confirm-before-save into cards / expenses / learning_sessions. Assistive, never autonomous. Speech via Web Speech API (`processLocally` where supported).
- **The Shutdown** (B70/B71): `/shutdown` — morning plan-today (focus ≤3 cards via `cards.focused_on`), evening leftovers with exactly three verbs (**→ tomorrow · ✓ done · let go**), one-glance day summary (closes · learning minutes · spend), one-line day note, close-the-day ritual persisted in `day_reviews`. Anti-streak by design: consistency rate ("closed 5 of 7 days"), non-resetting cumulative counts, never-miss-twice nudge — **no breakable streaks ever**.
- **Life Wrapped** (B69): `/wrapped` monthly recap — deterministic archetype, cross-domain plot-twist stat, all-time counters; 9:16 story cards rendered to canvas → Web Share (files) with download fallback; unlocks at **15 active days** shown as a quiet progress meter. Free forever.
- ⛔ Dump v2 / narrative line (on-device Gemini Nano etc.) stay behind the AI gate (§1.3) — architecture locked to on-device-only, no server LLM calls, no metering (G6-05).

---

## 4. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 App Router + React 19 + TS strict | already scaffolded |
| Styling | Tailwind CSS v4 + CSS variables for theming | already installed |
| **DB** | **PostgreSQL on Neon** ✅ locked | see §4.1 |
| ORM | **Drizzle** (recommended) or Prisma | Drizzle = smaller cold starts on serverless, SQL-shaped; Prisma fine if you prefer the DX — pick once, §4.2 |
| Auth | Auth.js (NextAuth v5), Google + GitHub, DB session strategy | account linking on same verified email |
| Files | Cloudinary, **signed** uploads, transformations for thumbs | your requirement |
| DnD | `@dnd-kit` or Atlassian pragmatic-drag-and-drop | touch + keyboard support |
| Data flow | Server Components + Server Actions; TanStack Query only where client-side caching earns it | less client JS |
| Validation | zod, schemas shared client/server | one source of truth |
| PWA | Serwist | manifest + SW |
| Charts | Recharts (or visx if bundle hurts) | expenses summary |
| Testing | Vitest (unit) + Playwright (critical flows) | see PLAN Phase 0.5 |
| Errors/analytics | Sentry (free tier) + Vercel Analytics | know when it breaks |
| Hosting | Vercel + Neon | ✅ |

### 4.1 ✅ DB decision: **Neon Postgres** (locked)
Your bar was "≥ 50–100 MB free". Checked August 2026:
- **Neon free**: 0.5 GB storage per project, 100 compute-hours per project per month, no credit card, up to 100 projects, and compute scales to zero after 5 minutes idle and resumes in a few hundred ms on the next query — 500 MB is **5–10× your bar**, and the app auto-wakes.
- **Supabase free**: 500 MB DB too, but free projects auto-pause after one week of inactivity and you must un-pause from the dashboard — that's a dead link when a friend opens your invite on day 8. Disqualifying for a shared app.
- Neon also gives **DB branching** (copy-on-write) which is genuinely useful for testing migrations. The free plan's history/restore window is capped at 6 hours and extra branches beyond the plan allowance aren't available on Free — fine for now, but it means **backups are your job** (see §7.4).
- Rough capacity: this schema is text-heavy but tiny per row. 500 MB ≈ *hundreds of thousands* of cards. Images live in Cloudinary, not Postgres. You will not hit the cap on this app.
- Escape hatch: it's plain Postgres with a standard connection string, so Railway/Supabase/self-host migration is a `pg_dump` away. No lock-in.

**Guardrails to set up on day 1:** connection pooling (use Neon's pooled connection string — serverless functions open lots of connections), and a monthly reminder to check CU-hours since hitting a monthly limit suspends compute until the next cycle.

### 4.2 ❓ ORM: Drizzle vs Prisma — G3-31
Default if you don't answer: **Drizzle** (lighter on serverless, migrations via drizzle-kit, raw SQL when needed).

> ⚠️ Repo note (AGENTS.md): this Next.js version has breaking changes vs older model knowledge — **read `node_modules/next/dist/docs/` before writing code**, every phase.

---

## 5. Security checklist (expanded)

**AuthZ**
- One helper: `requireMembership(projectId, minRole)` — every server action / route handler calls it first. No exceptions, no "the client already checked".
- Every query is scoped by `userId` or membership join. IDOR is the #1 realistic bug here.
- Card/board/column/expense/learning reads all resolve up to a project (or owner) before returning anything.
- Write a Playwright test that logs in as user B and tries to open user A's project/card/expense by ID. It must 404 (not 403 — don't leak existence).

**AuthN**
- Auth.js DB sessions, httpOnly + secure + sameSite=lax cookies, session rotation on privilege change
- OAuth account linking only on **verified** matching email
- Middleware protects the `(app)` route group; server-side re-check anyway (middleware is not authz)

**Input & transport**
- zod on every server action input; parse, don't trust; reject unknown keys
- CSP headers (no `unsafe-eval`), HSTS, `X-Content-Type-Options`, Referrer-Policy
- Rate limiting (Upstash Redis free tier or Postgres-backed) on: auth callback, invite create, invite redeem, upload sign, comment create
- Markdown rendered with a sanitizer allow-list (no raw HTML) — stored-XSS in a card description is the easy own-goal

**Invites**
- 32-byte random token, shown once, **only the hash stored**, expiry + max uses + revoke, single-use option, join is idempotent
- Redeeming an invite never elevates an existing member's role

**Uploads**
- Cloudinary **signed** upload params generated server-side, per-user folder, allow-list mime + size, strip EXIF GPS from receipts/photos
- Store the `public_id` and delete from Cloudinary when the card/expense is purged from trash

**Secrets & ops**
- No secrets in client components; `NEXT_PUBLIC_` audit before each deploy
- Rotate OAuth secrets if the repo ever goes public
- Dependabot on; `npm audit` in CI

---

## 6. Data model
Moved to **`DATA-MODEL.md`** — entities, enums, ordering strategy, money handling, soft-delete, indexes.

---

## 7. Ops & delivery

### 7.1 Environments
- `local` (Neon dev branch) · `preview` (Vercel PR previews → dev branch) · `production` (Neon main branch)
- `.env.example` committed; real envs in Vercel only

### 7.2 CI (GitHub Actions)
`typecheck → lint → unit tests → build → playwright smoke` on every PR. Migrations run as a deploy step, never auto-applied on boot.

### 7.3 Observability
Sentry for exceptions (client + server), structured server logs with request id, a `/api/health` that pings the DB.

### 7.4 Backups (your job on Neon free)
Weekly `pg_dump` to your own storage — scripted, one command, documented in the README. Free tier PITR is only ~6 hours.

### 7.5 Cost model (target: $0/month)
| Service | Free allowance | What blows it up |
|---|---|---|
| Vercel Hobby | personal, non-commercial | commercial use → $20/mo Pro |
| Neon Free | 0.5 GB storage, 100 CU-h/project/mo | always-on traffic, big attachments in DB (don't) |
| Cloudinary Free | credit-based | full-size receipt photos — always upload transformed/compressed |
| Sentry / Upstash | small free tiers | noisy errors, per-request rate-limit checks |

---

## 8. Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-08-21 | Docs live in `docs/` | single source of truth |
| 2026-08-21 | Mobile = bottom nav + sheets + swipe kanban | native feel without native code |
| 2026-08-21 | PostgreSQL over MySQL | JSON/arrays, full-text, `gen_random_uuid`, better hosting options |
| 2026-08-21 | To-Do/Ideas/Work = 3 separate boards per project | grill R1 |
| 2026-08-21 | Expenses standalone v1, `projectId` nullable from day 1 | grill R1/R2 |
| 2026-08-21 | Learning = pipeline + progress % + hours | grill R1 |
| 2026-08-21 | Realtime later; offline = read-only cache | grill R1 |
| 2026-08-21 | Kanban cards full-featured in v1 | grill R2 |
| 2026-08-21 | Dark default, light toggle | grill R2 |
| 2026-08-21 | Deploy: Vercel + Neon | grill R2 |
| 2026-08-21 | Name = **Wrangle** | grill R2 |
| 2026-08-21 | **DB locked: Neon Postgres** (0.5 GB free, no inactivity pause, branching) | grill R3 §4.1 |
| 2026-08-21 | **Card ordering = fractional index strings**, IDs = UUIDv7 | sync-safe, no reindex writes |
| 2026-08-21 | **Money = integer minor units + currency code**, never floats | correctness |
| 2026-08-21 | **Trash + 30-day restore + toast undo** on all destructive actions | R14 |
| 2026-08-21 | **Cross-project Today view** added as MVP+1 | the reason to leave Trello |
| 2026-08-21 | **Share Target API + app shortcuts** in PWA scope | capture speed = the whole product |
| 2026-08-21 | Card detail is **URL-addressable** (`?card=`) | back button + sharing |
| 2026-08-21 | Non-goals list written (§1.3) | scope control |
| 2026-08-25 | **The Loop committed as flagship**; G6 defaults shipped: heuristics-first Dump, 15-day Wrapped unlock, no breakable streaks ever, on-device-only AI architecture, "let go" third state | grill round 6 |
| 2026-08-25 | ⚡ flagship slices shipped: Dump v1, Shutdown, Life Wrapped (`day_reviews` + `cards.focused_on` migration) | PLAN flagship track 1–3 |

---

## 9. Open questions
Live in `DISCOVERY-LOOP.md`. Grill rounds 3–6 are decided/closed on silence; the standing questions (§G there) run every cycle.
