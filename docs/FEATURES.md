# Feature Expansion — Wrangle

> The proposal pool. **Nothing here is a commitment** — proposals enter through the discovery loop (`DISCOVERY-LOOP.md`), get triaged into the backlog, and only then touch `REQUIREMENTS.md`/`PLAN.md`. Statuses live in the backlog table (B-numbers below).
> Written cycle 5 (2026-08-24), after Phases 0–3 were built and audited.
> ⚡ **Research pass update:** the flagship question is now answered in **`FLAGSHIP-2026.md`** — "The Loop" (Dump · Shutdown · Life Wrapped), built from three 2025–2026 market sweeps. §3.1 Weekly Review folds into it as the weekly chapter; §3.3/§3.4 become Loop slices.

---

## 1. The unfair advantage

Wrangle's moat is not kanban — Trello does kanban. It's that **tasks, ideas, learning, and money live in one database under one identity**. Every feature below that's marked ★ exploits a join no competitor can do without becoming four products:

- tasks × time → what slipped, what shipped
- learning × tasks → skills turning into shipped work (`card_links` already exists)
- money × projects → what a project actually cost (`expenses.project_id` already exists, unused)
- everything × a week → the Weekly Review

When choosing what to build, prefer the ★ features. Single-module features (budgets, streaks) are catch-up; cross-module features are the pitch.

## 2. Positioning (the sellable one-liner)

**"The 20% of four apps you actually use — wired together, and fast on your phone."**

| Instead of | Wrangle wins because | Wrangle doesn't try to |
|---|---|---|
| Trello | cross-project Today, ideas scoring, money + learning attached | Gantt, sprints, enterprise |
| Todoist | real kanban, receipts, hours | natural-language everything |
| Notion | opens in <2s on 4G, capture in 3 taps | be a wiki/database platform |
| Splitwise / expense apps | spending linked to *why* (projects) | replace your bank |
| Habit/streak apps | honest hours, not gamified guilt | dopamine casino |

---

## 3. Tier 1 — flagship candidates (pick one, G5-01)

### ★ 3.1 Weekly Review — "Your week, wrangled" (B56, promotes B40)
One screen, generated from data already being written (`activities`, `completed_at`, `learning_sessions`, `expenses`):

- **Shipped** — cards completed, grouped by project
- **Slipped** — went overdue this week → one-tap *reschedule all to next week*
- **Learned** — hours by item, milestones ticked
- **Spent** — total, top category, vs last week
- **Captured** — ideas added; highest-score idea → one-tap *promote*

Why it sells: it's the payoff of the four-in-one thesis, it manufactures the weekly-planning ritual that retains users, and **no single-purpose competitor can copy it**. Backlog already suspected this (B40: "could be the app's signature feature"). Schema impact: **none** — pure computed view. Later: a shareable image card of the review (see §5).

### ★ 3.2 Project true cost (B57)
Wire up the dormant `expenses.project_id`: attach expenses to a project, then roll up per project: **money spent + hours logged (via `card_links` → sessions) + cards shipped**. "This side project cost $214 and 31 honest hours." Freelancers and side-project people screenshot this. Schema impact: none — column exists; needs a project picker in the expense sheet + a rollup section in project settings. Unlocks B1 (split & settle-up) later.

### ★ 3.3 Capture ubiquity (B61)
Capture speed is the whole product (S2). Already shipped: share target, app shortcuts, quick-add FAB. Next rungs, cheapest first:

1. **Natural-language dates in quick-add** — "call Ali tomorrow 5pm" parses client-side (`chrono-node`, ~30KB, no AI, no server). Huge feel-win.
2. **Email-in address** — `you@in.wrangle.app` → card in My Space Inbox. Cloudflare Email Workers does this on the free tier.
3. **Telegram bot** — message a bot, get a card. Free API, ~an afternoon of work, makes phone capture instant even without opening the app.

### 3.4 Today as a ritual (extends R15)
Morning: "Plan today" — pick up to 3 cards into a focus list (a flag, not a table). Evening: leftovers prompt *reschedule / done / let go*. Turns the Today view from a list into a habit anchor — retention is the point. Schema impact: `focused_on date` column on cards, nothing else.

---

## 4. Tier 2 — retention & habit

| Feature | Notes | Schema impact (minimalism rule: JSONB > tables) | ID |
|---|---|---|---|
| Recurring cards & expenses | rent, gym, weekly review card; materialize on first view after due, never cron-spam | `recurrence jsonb` on `cards`/`expenses` — no new table | B9/B60 |
| Subscriptions chip | recurring expenses summed: "subscriptions: $43/mo" — a mini-app people pay for elsewhere | derived from recurrence | B60 |
| Budgets + alert | per category/month, bar next to donut, warn at 80% | `budgets` table already shaped in DATA-MODEL | B2 |
| Calendar view + **ICS feed** | ICS first: subscribe in Google Calendar = calendar view for free before building one | `ics_token` on users | B58/B6 |
| ★ Spaced review prompts | "You finished *Postgres course* 3 weeks ago — still true?" resurfaces learning; can spawn a review card | `review_at date` on `learning_items` | B62 |
| Streaks (opt-in) | learning sessions + completed cards; **off by default** — guilt is churn (G3-25 caution stands) | computed, no schema | B3 |
| Command palette ⌘K | jump to project/card, quick actions; power-user lock-in | none | B8 |
| Saved filters | after filters move to URL (B54), saving them is trivial — URL string per project | `saved_filters jsonb` on memberships | B18 |

## 5. Tier 3 — growth loops (each user recruits the next)

| Feature | The loop | ID |
|---|---|---|
| ★ Public read-only project page | "building in public" link on socials → footer: *Wrangled by …* → visitor signs up. `public_token` nullable on projects, strips members/comments, server-rendered, noindex optional | B59 (expands B7) |
| Weekly Review share card | OG-image render of §3.1 ("Shipped 12 · Learned 6h · Spent $89") — the tweetable artifact | with B56 |
| Project templates | "Job hunt", "Course launch", "Wedding" — template = JSONB snapshot of boards/columns/labels; a public gallery later is SEO | B10 |
| Invite polish | invite link previews (OG tags on `/join/*` — no data leak, just branding) so shared links look real in chats | small, with B59 |

## 6. Tier 4 — heavy bets (only if usage earns them)

- **Offline write queue** (B5) — the schema was *designed* for this (client-generated UUIDv7, fractional positions, idempotent moves). IndexedDB mutation log + replay + `expected_updated_at` conflict toasts. The single biggest PWA differentiator, and the riskiest build in this file. After Phase 7, never before.
- **Realtime boards** (B4) — plan's ladder stands: 30s polling → SSE → Pusher only if needed.
- **AI pack** — ⛔ gated by the non-goal until the MVP has 2 weeks of real use. When the gate opens, the honest wins are: weekly-review narrative ("you keep slipping design tasks"), receipt OCR (B27), idea clustering/dedupe, "break this card into a checklist". All optional, all off by default, all clearly labeled. AI as seasoning, not the meal.

## 7. If it gets big — monetization sketch (G5-02)

Current stance: personal, non-commercial, $0/mo. **The first paying user changes the infrastructure math**, so decide intent before building any paid feature:

| | Free (today) | "Pro" sketch (~$3–4/mo) |
|---|---|---|
| Projects | 50 | unlimited |
| Uploads | 100MB | 2–5GB |
| Features | everything core | OCR/AI pack, ICS, public pages, email-in |
| Team size | 20/project | unchanged (teams-of-teams stays a non-goal) |

Costs the moment money changes hands: Vercel Hobby is **non-commercial** → Pro $20/mo; Neon free likely → ~$19/mo under real load; plus Cloudinary. Floor ≈ **$40–60/mo → ~15–20 subscribers to break even.** Also prerequisites: a real domain (share links and OAuth on `wrangle.vercel.app` are brand-dead and migration-hostile — buy the domain *now* even if never charging, G5-03), export/delete (B29) shipped, and a privacy page. Alternative big-paths if subscriptions feel wrong: open-source core + hosted convenience, or a one-time "founder license". Default: **stay free until a month of real multi-user usage says otherwise.**

## 8. Impact × effort (the honest table)

| Feature | Impact | Effort | Cross-module ★ | Verdict |
|---|---|---|---|---|
| Weekly Review (B56) | ●●●● | ●● | ★ | the flagship — schedule after Phase 6 |
| NL dates in quick-add | ●●● | ● | | do with Phase 7 polish |
| Project true cost (B57) | ●●● | ●● | ★ | after expenses prove out (Phase 5 + week of use) |
| ICS feed (B58) | ●●● | ● | | quiet killer — tiny effort |
| Activity feed UI (B21) | ●●● | ● | | data already written; overdue |
| Recurring + subscriptions (B60) | ●●● | ●● | | first "money" delighter |
| Public project page (B59) | ●●● | ●● | | first growth loop |
| Email-in / bot capture (B61) | ●● | ●● | | after share-target proves usage |
| Spaced review (B62) | ●● | ● | ★ | cheap and novel |
| Templates (B10) | ●● | ●● | | when a 2nd real user exists |
| Command palette (B8) | ●● | ●● | | desktop-weeks feature |
| Budgets (B2) | ●● | ●● | | wait for real spend data |
| Streaks (B3) | ● | ● | | opt-in only, late |
| Offline writes (B5) | ●●●● | ●●●●● | | earn it first |
| AI pack | ●●● | ●●●● | ★ | ⛔ gated (non-goal §1.3) |

## 9. What NOT to build (extends REQUIREMENTS §1.3)

- Per-board ACLs, org roles, teams-of-teams — the permission matrix stays 4 roles.
- Time-tracking for invoicing — hours stay honest, not billable.
- Full YNAB parity (envelopes, reconciliation, bank sync) — Wrangle tracks *spending with context*, it is not a finance app.
- A social layer (feeds, follows, likes) — public pages are read-only artifacts, not a network.
- A plugin system — the discovery loop is the plugin system.
