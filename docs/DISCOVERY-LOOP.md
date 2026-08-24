# Discovery Loop — the requirement-finding orchestrator

The point: keep finding requirements instead of building blind. Run one cycle when a phase ends, or any time you use the app and feel friction.

## The cycle

```
1. USE      → Use the current build (or the vision) for a real task.
2. CAPTURE  → Anything annoying/missing → dump raw into Inbox. No filtering, no grammar.
3. GRILL    → I ask questions (edge cases, permissions, offline, scale, who-else-uses-it).
4. TRIAGE   → Every inbox item becomes a backlog row: now / next / later / never.
5. UPDATE   → Sync decisions into REQUIREMENTS.md (§2/§3/§8), DATA-MODEL.md, PLAN.md.
6. BUILD    → Pick ONE slice. Ship it. Verify it. Go to 1.
```

**Rule: nothing gets built that isn't written down here first. Nothing stays vague — every inbox item becomes a question or a backlog row.**

**Answering rule for grills:** every question has a stated default. Reply with just the ones you disagree with — e.g. *"defaults except G3-04 and G3-17"*. Silence = default = it ships that way, logged in the decisions table.

---

## Inbox (raw capture — anything goes)

_(cycle 4 — 2026-08-23, captured building/reviewing Phases 0–2, pre-usage:_
- _Column rename is double-click only — undiscoverable. Needs visible affordance._
- _Column delete is destructive with NO trash/restore — violates R14 audit._
- _Comments/checklist/labels mutations not optimistic — laggy on phone._
- _Dropping card into "Done" does nothing — G3-12 wants is_done column flag driving completed_at. Schema gap._
- _Card detail shows no created/updated meta (spec lists it)._
- _All-day dues use local-noon hack — revisit at calendar view._
- _Ideas board has zero idea-specific value yet (no impact/effort/score)._
_)_

_(cycle 5 — 2026-08-24, full code/UX audit swept the whole build. Findings promoted straight to backlog **B45–B66**; prioritized detail in `UI-UX.md` §9. Two new companion docs created: **`UI-UX.md`** (interface contract + audit) and **`FEATURES.md`** (sellable/expansion proposal pool). Headline bugs: receipts unviewable (B45), zero error boundaries (B46), Learn ignores timezone (B53), migration journal drift (B64).)_

---

## Grill round 6 — opened cycle 5 research pass (The Loop, see `FLAGSHIP-2026.md`)

| # | Question | Default |
|---|---|---|
| G6-01 | Commit to **The Loop** (Dump · Shutdown · Life Wrapped) as the post-MVP flagship, with Weekly Review (B56) folding into the Shutdown family? | Yes — it's the researched convergence of capture + ritual + growth |
| G6-02 | Dump v1 ships **heuristics-only** (chrono-node dates + amount regex + prefix keywords), AI classify later? | Yes — respects the AI gate (§1.3), still feels magic for dates/amounts |
| G6-03 | Wrapped cadence + unlock gate? | Monthly, unlocks at 15 active days (quiet progress meter, never guilt); yearly edition automatic |
| G6-04 | Streak stance locked: consistency-rate + non-resetting cumulative counts + "never miss twice", **no breakable streaks ever**? | Yes — 2026 research says streak-guilt is churn |
| G6-05 | On-device-AI split brain (Prompt API desktop / transformers.js-WebGPU Android / heuristics everywhere) as the standing AI architecture — no server-side LLM calls, no metering, ever? | Yes — it's the moat *and* the cost model |
| G6-06 | "Let go" verb in Shutdown clears the due date without completing or deleting — acceptable third state? | Yes — guilt-free deferral is the ritual's point |
| G6-07 | Day timeline / time-block view (the category's most-paywalled feature) — worth a free lightweight version? | Backlog (B73) — after the Loop, not before |
| G6-08 | Wrangle MCP server (drive your boards from Claude/ChatGPT — TickTick/Linear shipped this in 2026)? | Backlog (B72) — an afternoon of fun once the API surface stabilizes |

---

## Grill round 5 — opened cycle 5 (UX audit + feature-expansion decisions)

| # | Question | Default |
|---|---|---|
| G5-01 | Flagship next big feature — **Weekly Review** (FEATURES §3.1)? | Yes — schedule after Phase 6; it's the four-in-one payoff |
| G5-02 | Any intent to ever charge? (changes Vercel Hobby legality + infra floor, FEATURES §7) | No for now — revisit after 1 month of real multi-user use |
| G5-03 | Buy a real domain now (OAuth callbacks + share-link permanence)? | Yes — cheap insurance even if never charging |
| G5-04 | Icons: keep 8 hand-rolled SVGs + glyph buttons, or adopt lucide-react? | Adopt lucide during the a11y pass (B65) |
| G5-05 | Optimistic strategy for checklist/labels/comments (B42)? | React `useOptimistic` per mutation; board drag keeps its manual state |
| G5-06 | Geist Mono + `tabular-nums` for all money/hours/score numbers? | Yes (UI-UX §2) |
| G5-07 | Service worker: keep hand-rolled `sw.js` or migrate to Serwist? | Keep hand-rolled until Phase 7 offline work outgrows it |
| G5-08 | Trash says "N days left" but the purge cron doesn't exist yet | Cron ships Phase 9 as planned; until then copy reads "kept at least 30 days" |

---

## Grill round 4 — opened cycle 4 (Phase 3 decisions)

| # | Question | Default |
|---|---|---|
| G4-01 | Idea score formula? | `impact*2 − effort` (range −3…+5), shown as signed chip |
| G4-02 | Sort ideas by score persisted? | Client-side toggle, resets on nav; persistence later |
| G4-03 | Promote idea lands where? | Same project → To-Do → Backlog end; undo restores original column+position |
| G4-04 | Search scope v1? | Current project, title+description, english FTS + pg_trgm fallback, top 30 |
| G4-05 | "Today" boundary semantics? | User's calendar day via stored timezone; all-day counts all day; Upcoming = next 7 days excl. today |
| G4-06 | Quick-add target when no My Space? | Error toast (My Space is auto-created, so this = data corruption signal) |
| G4-07 | Filters persist across navigation? | Session-only; saved filters stay B18 |
| G4-08 | Done-column completion (G3-12)? | Implement now: `columns.is_done`, seeded true on Done columns; move into/out sets/clears completed_at |

---

## Grill round 3 — open now

### A. Product shape
| # | Question | Default if you don't answer |
|---|---|---|
| G3-01 | Who else touches this in month 1 — nobody, one person, a small group? | You + 1–2 people on **one** shared project |
| G3-02 | Are the three board names fixed, or should you be able to rename/add boards per project? | Fixed 3 in the UI, schema allows N; renaming lands later |
| G3-03 | Is the **Today** cross-project view MVP-critical or Phase 3? | Phase 3 (right after boards work) |
| G3-04 | Assignees in v1 even though you're mostly solo? | Yes — schema + minimal UI now, avoids a painful retrofit |
| G3-05 | Comments in v1? | Yes, plain markdown, no @mentions until Phase 8 |
| G3-06 | Global quick-capture (`+` that doesn't ask which project)? | Yes → `My Space → To-Do` |
| G3-07 | Do you want a "Work" *project* separate from the "Work" *board*? Right now Work is a board inside every project — is that actually how your head works? | Keep as a board; revisit after a week of use |

### B. Kanban mechanics
| # | Question | Default |
|---|---|---|
| G3-08 | Subtasks: checklist items only, or should subtasks be real cards? | Checklist items only |
| G3-09 | Idea → task: move the card (one truth, history preserved) or copy it (idea stays)? | **Move**, with undo |
| G3-10 | Due dates: all-day only, or date + optional time? | Date + optional time |
| G3-11 | Recurring cards (rent, gym, weekly review) — do you actually need them, and how soon? | Backlog, Phase 10 |
| G3-12 | Does "Done" column = completed, or is there a separate ✅ completed flag? (matters for Today view and stats) | Separate `completed_at` flag, auto-set when dropped in a column marked "is done column" |
| G3-13 | Card limit warnings / WIP limits? | Off |
| G3-14 | Should a card be movable across **projects**, not just columns? | Yes, from card menu (labels/assignees get dropped with a warning) |

### C. Expenses
| # | Question | Default |
|---|---|---|
| G3-15 | Expenses only, or income + running balance too? | Expenses only in v1 |
| G3-16 | Track payment method (cash / card / bank / JazzCash-style wallet)? | One optional free-text field now, enum later if you use it |
| G3-17 | Currency: you picked **USD** in grill R2 — confirm that's what you'll actually type daily (PKR if you spend in rupees)? | **USD** stays unless you say otherwise |
| G3-18 | Recurring/subscription expenses? | Backlog |
| G3-19 | Budgets with alerts — v1 or later? | Later |
| G3-20 | Does anyone else ever need to see your expenses? | No — personal only until project-linking exists |

### D. Learning
| # | Question | Default |
|---|---|---|
| G3-21 | What's the typical unit — a course, a book, a broad skill ("get good at Postgres")? | Generic item with a `type` field covering all |
| G3-22 | Progress %: manual slider, or derived from milestones you tick? | Milestones drive it; manual override allowed |
| G3-23 | Should learning items create tasks on a board? | Yes — "add to board" makes one linked card |
| G3-24 | Hours: manual entry per session, or a start/stop timer? | Manual session log (a timer you forget to stop lies to you) |
| G3-25 | Weekly hour goal / streak pressure — motivating or guilt-inducing for you? | Skip for now (backlog) |

### E. Sharing & permissions
| # | Question | Default |
|---|---|---|
| G3-26 | Invite defaults: expiry and max uses? | 7 days, 10 uses, revocable |
| G3-27 | Can a `member` invite others, or admin+ only? | Admin+ only |
| G3-28 | Someone joins a project — should they see the **whole** project (all 3 boards) or per-board access? | Whole project; per-board ACLs are a rabbit hole |
| G3-29 | Should invitees be restricted to specific emails, or is a link-holder enough? | Link-holder is enough (token is secret + expiring) |

### F. Platform & ops
| # | Question | Default |
|---|---|---|
| G3-30 | Your main phone — iOS or Android? (changes push, install UX, gesture tuning) | Assuming **Android**; iOS needs the PWA installed before push works at all |
| G3-31 | ORM: **Drizzle** or Prisma? | Drizzle |
| G3-32 | Domain name for the deploy (needed for OAuth callback URLs)? | `wrangle.vercel.app` until you buy one |
| G3-33 | Notifications in v1: in-app only, web push, or none? | In-app only |
| G3-34 | Sentry + Vercel Analytics OK (free tiers, some data leaves your box)? | Yes |
| G3-35 | Is this Vercel deploy commercial in any way? (Hobby tier is non-commercial) | Personal, non-commercial |

### G. Standing questions (asked every cycle, forever)
- Who used it and what broke?
- What took too many taps?
- What data did you want on screen that wasn't there?
- What happens with 2 users? 20 users? 2,000 cards? A 50-column board?
- What happens offline, on 3G, on a locked phone, mid-drag?
- What did you still open Trello/Notes/WhatsApp-to-self for this week? ← the most valuable question in this file

---

## Backlog

| ID | Feature / idea | Source | Status |
|----|----------------|--------|--------|
| B1 | Expense splitting + settle-up | initial brief | later (needs project-linked expenses) |
| B2 | Budgets per category + alerts | proposal | later |
| B3 | Streaks / weekly learning goal | proposal | later |
| B4 | Realtime collaboration (SSE/Pusher) | proposal | later (phase 8) |
| B5 | Offline editing + sync queue | proposal | later (risky — after PWA basics) |
| B6 | Calendar view of tasks | proposal | later |
| B7 | Public read-only share view | proposal | later |
| B8 | Command palette ⌘K | proposal | nice-to-have |
| B9 | Recurring tasks | proposal | later (G3-11) |
| B10 | Project templates | proposal | nice-to-have |
| B11 | **Today / Upcoming cross-project view** | cycle 2 | **next** (phase 3) — the reason to leave Trello |
| B12 | **Global quick-add + Share Target API** | cycle 2 | **next** (phase 3/7) |
| B13 | **Trash + 30-day restore + undo toasts** | cycle 2 | **now** (phase 2) |
| B14 | **Card detail as URL (`?card=`)** | cycle 2 | **now** (phase 2) |
| B15 | Keyboard DnD + a11y announcements | cycle 2 | now (phase 2) |
| B16 | Search (full-text + trigram typo tolerance) | cycle 2 | next (phase 3) |
| B17 | Filters (label/assignee/due/text) | cycle 2 | next (phase 3) |
| B18 | Saved filters / views | cycle 2 | later |
| B19 | Bulk select + bulk move/label/archive | cycle 2 | later |
| B20 | Move card across projects | cycle 2 | next (G3-14) |
| B21 | Activity feed (project + card history) | cycle 2 | now (phase 2, write rows) / UI phase 3 |
| B22 | In-app notification inbox | cycle 2 | phase 8 |
| B23 | Web push + due reminders | cycle 2 | phase 8 |
| B24 | @mentions in comments | cycle 2 | phase 8 |
| B25 | Learning milestones + session log | cycle 2 | now (phase 6) |
| B26 | Learning item → board card link | cycle 2 | now (phase 6) |
| B27 | Expense receipt OCR (auto-fill amount) | cycle 2 | later |
| B28 | CSV import/export (expenses + cards) | cycle 2 | phase 9 |
| B29 | Full data export + account delete | cycle 2 | phase 9 (non-negotiable before sharing publicly) |
| B30 | Weekly pg_dump backup script | cycle 2 | phase 0.5 |
| B31 | Playwright authz suite (stranger sees 404) | cycle 2 | **now** (phase 4, written earlier) |
| B32 | Rate limiting (auth, invites, uploads) | cycle 2 | phase 4 |
| B33 | EXIF stripping on uploads | cycle 2 | phase 5 |
| B34 | Column virtualization past 100 cards | cycle 2 | phase 7 |
| B35 | Install prompt + app shortcuts | cycle 2 | phase 7 |
| B36 | Update-available SW prompt | cycle 2 | phase 7 |
| B37 | Timezone-correct due dates | cycle 2 | now (phase 2) |
| B38 | Card cover images | cycle 2 | nice-to-have |
| B39 | Archive vs delete distinction for projects | cycle 2 | phase 1 |
| B40 | Weekly review screen (what got done, what slipped, what you spent, hours learned) | cycle 2 | 🔶 needs decision — could be the app's signature feature |
| B41 | Column delete → soft-delete + restore (undo) instead of hard delete | cycle 4 audit | **now-ish** (R14 violation) |
| B42 | Optimistic comments/checklist/labels mutations | cycle 4 | later (perf polish, phase 7) |
| B43 | Card meta (created/updated/by) shown in detail | cycle 4 | phase 2b leftover |
| B44 | Global cross-project search | cycle 4 | later (after per-project search proves out) |
| B45 | 🐛 Receipts unviewable: `receipt_url` never written, edit drops receipts | cycle 5 audit | **now** (bug) |
| B46 | Error boundaries: `error.tsx` + `not-found.tsx` + `global-error.tsx` (zero exist) | cycle 5 audit | **now** (plan rule 2) |
| B47 | Board route `loading.tsx` (heaviest page has no skeleton) | cycle 5 audit | **now** |
| B48 | `/boards` real hub — placeholder copy is live in primary nav | cycle 5 audit | next |
| B49 | User settings page: theme persist + system option, timezone, currency, avatar | cycle 5 audit | next |
| B50 | Dialog a11y: focus trap + scroll lock + `inert` (fix once in `ui/dialog`) | cycle 5 audit | next (R17) |
| B51 | Replace native `confirm()` in members-table with Modal | cycle 5 audit | next |
| B52 | Expense category management UI (actions exist, unreachable) | cycle 5 audit | next |
| B53 | 🐛 Learn uses UTC instead of `users.timezone` | cycle 5 audit | **now** (bug) |
| B54 | Filter state in URL (shareable, survives nav; unlocks B18) | cycle 5 audit | later |
| B55 | Column drag-reorder + project drag-reorder | cycle 5 audit | later |
| B56 | **Weekly Review** screen (promotes B40) — flagship candidate | FEATURES §3.1 | 🔶 G5-01 |
| B57 | Project true cost: wire `expenses.project_id` + hours rollup | FEATURES §3.2 | later (after Phase 5 proves out) |
| B58 | ICS calendar feed (subscribe in Google Calendar) | FEATURES §4 | later (tiny effort, high value) |
| B59 | Public read-only project page (expands B7; first growth loop) | FEATURES §5 | later |
| B60 | Recurring expenses + subscriptions total chip (`recurrence` JSONB) | FEATURES §4 | later |
| B61 | Capture rungs: NL dates (chrono-node) · email-in · Telegram bot | FEATURES §3.3 | later (NL dates with Phase 7) |
| B62 | Spaced-repetition review prompts on learned items | FEATURES §4 | later |
| B63 | README rewrite (still create-next-app boilerplate) | cycle 5 audit | **now** |
| B64 | 🐛 Migration journal drift: 3 hand-written SQL files outside drizzle journal, colliding prefixes | cycle 5 audit | **now** (ops risk) |
| B65 | Icon system: lucide-react, kill glyph-buttons, `next/image` avatars | cycle 5 audit | next (G5-04) |
| B66 | `--success`/`--warning` tokens, one palette source, wire motion tokens | cycle 5 audit | later |
| B67 | ⚡ **The Dump v1** — hold-FAB brain dump → sorted tray (heuristics: chrono-node + amount regex) | FLAGSHIP §2 | next-ish (with Phase 7) |
| B68 | On-device AI split brain: Prompt API (desktop) · transformers.js/WebGPU (Android) · heuristics fallback | FLAGSHIP §2 | ⛔ gated (AI gate §1.3) |
| B69 | ⚡ **Life Wrapped** — monthly 9:16 share cards, archetype + plot-twist stat, 15-day unlock | FLAGSHIP §4 | later (needs a month of Shutdown data) |
| B70 | ⚡ **The Shutdown** — plan-today (pick 3) + evening close (tomorrow/done/let go) + `day_reviews` | FLAGSHIP §3 | next (absorbs B56/B40) |
| B71 | Anti-streak momentum stats: consistency %, cumulative counts, never-miss-twice | FLAGSHIP §3 | with B70 |
| B72 | Wrangle MCP server (drive boards from Claude/ChatGPT) | FLAGSHIP research | later (G6-08) |
| B73 | Day timeline / lightweight time-block view — the category's most-paywalled feature, free here | FLAGSHIP research | later (G6-07) |

Statuses: `now` · `next` · `later` · `never` · `🔶 needs decision`

---

## Session log

| Date | Cycle | Outcome |
|------|-------|---------|
| 2026-08-21 | 0 | Created docs; captured initial brief; first grill round |
| 2026-08-21 | 1 | Locked: Postgres, 3 boards, expenses standalone + nullable project link, full cards v1, learning pipeline, dark default, Vercel, name **Wrangle** |
| 2026-08-21 | 2 | **DB locked = Neon** (0.5 GB free, no inactivity pause). Added `DATA-MODEL.md`. New requirements R12–R17 (currency in minor units, undo/trash, Today view, export/delete, a11y). Non-goals + success criteria written. Backlog expanded B11–B40. Grill round 3 opened (35 questions, all with defaults). |
| 2026-08-21 | 3 | Improv set promoted to `docs/` root as single source of truth (`improv/` deleted). Cite artifacts stripped; ORM ref fixed G3-24→G3-31; currency re-locked to **USD** (G3-17 default updated). Neon free-tier claims verified against neon.com: 0.5 GB storage, 100 CU-h/project/mo, 100 projects, 10 branches, scale-to-zero 5 min, 6-h restore window, limits suspend compute until next cycle. `.env.example` + local `.env` scaffolded. |
| 2026-08-23 | 4 | Phases 0–2 built and verified. AUTH_SECRET set; `/api/auth/providers` verified 200 (Google+GitHub live). Cycle 4 run pre-usage: 8 friction items captured to inbox; grill round 4 opened (G4-01…08, all defaults applied → logged as decisions); backlog +B41–B44. Phase 3 scope locked: remembered board tab, ideas scoring + promote, filters, project search (FTS+trgm), Today/Upcoming with tick-off, quick-add. `columns.is_done` schema gap fixed this phase per G4-08. |
| 2026-08-24 | 5 | Full code/UX audit (agent-swept, every route/component/action). Two new docs: **`UI-UX.md`** (interface contract: tokens, component contracts, four-states rule, optimistic tiers, voice, P0–P2 audit) and **`FEATURES.md`** (proposal pool: ★ cross-module features as the moat, flagship = Weekly Review, growth loops, monetization constraints incl. Vercel Hobby non-commercial). Backlog +B45–B66; grill round 5 opened (G5-01…08, defaults stated). Bugs: receipts unviewable (B45), zero error boundaries (B46), Learn on UTC (B53), migration drift (B64). `PLAN.md` gained Phase 3.5 (UX hardening) from the P0 list. |
| 2026-08-24 | 5b | **Market research pass** — three parallel sweeps of 2025–2026 sources (productivity-app features/pricing/sentiment · viral recap & habit mechanics · web-platform + on-device AI status). Convergence written up as **`FLAGSHIP-2026.md`: The Loop** (Dump → Shutdown → Life Wrapped). Key facts: Todoist Ramble = the loved AI pattern (assistive voice capture, $5/mo); Sunsama sells the shutdown ritual at $16–20/mo; Spotify Wrapped 2025 biggest ever, Strava's paywalled recap backlash makes *free* recaps a story; Chrome Prompt API (Gemini Nano) stable for web Q2 2026 desktop-only, WebGPU default in all browsers → unlimited private $0 on-device AI is a real 2026-only window; streak-guilt is documented churn. Backlog +B67–B73; grill round 6 opened (G6-01…08). B56/B40 fold into the Shutdown family. |
