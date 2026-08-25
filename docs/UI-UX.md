# UI/UX Guide — Wrangle

> The instruction manual for building interface in this repo. Read it before touching any component.
> Companions: `REQUIREMENTS.md` (what) · `PLAN.md` (when) · `FEATURES.md` (proposal pool) · `DISCOVERY-LOOP.md` (process)
> §9 is a prioritized audit of the current build — every row has a backlog ID in `DISCOVERY-LOOP.md`.

---

## 0. What Wrangle feels like

Wrangle is opened **20 times a day for 20 seconds**. It is not a place you hang out; it's a tool you flick open, act in, and close. Everything below serves that:

- **Fast over fancy.** Perceived speed is the aesthetic. An optimistic update beats a beautiful spinner.
- **Calm over loud.** Dark, quiet surfaces; one violet accent; color means something or isn't there.
- **Honest over cute.** The app already talks like this — *"No sessions yet — honest hours only."* Keep that voice (§8).
- **One-handed over two.** Primary actions live in the bottom half of a phone screen.

### The signature: the Close
Wrangle's identity is **closing loops** — a task done, an idea promoted, a session logged, an expense captured, a course finished. Every module has exactly one "loop closed" moment, and they all share the same acknowledgment:

- check/state change draws in **200ms** (`--dur-normal`, `--ease-out`), color shifts to `--success`, subtle settle (scale 0.98 → 1)
- a toast appears **only when undo matters** (delete, promote, move) — never for pure celebration
- 🎉 confetti-tier celebration is reserved for **Learned** only. Rarity is what makes it land.

This is the one place we spend boldness. Everything around it stays quiet.

---

## 1. Design tokens (the law)

All color, radius, shadow, and motion come from `app/globals.css` tokens, exposed as Tailwind utilities via `@theme inline` (Tailwind v4, no config file).

| Token | Dark (default) | Meaning |
|---|---|---|
| `--bg` | `#0b0e14` | page |
| `--surface` / `--surface-2` | `#12161f` / `#1a2030` | cards, sheets / nested chips |
| `--border` | `#232b3b` | every border (`* { border-color: var(--border) }`) |
| `--text` / `--muted` | `#e7eaf0` / `#8d95a6` | primary / secondary text |
| `--accent` / `--accent-strong` | `#8b5cf6` / `#a78bfa` | the one accent; strong = focus rings, hovers |
| `--danger` | `#f87171` | destructive only |

**Rules**

1. **Never hardcode a hex in a component.** If a color isn't a token, add the token first.
2. **Add `--success` and `--warning`** (proposed: `#34d399`, `#fbbf24`). Today "done" is ad-hoc `emerald-500` in a dozen places — that's a token with no name. (B66)
3. **One palette source.** Label colors, category colors, and project colors are three hardcoded arrays today. Merge into one `lib/palette.ts` and import everywhere.
4. **Use the motion tokens.** `--dur-fast 120ms`, `--dur-normal 200ms`, `--ease-out` are defined and currently used by nothing. Rule of thumb: enter fast (120ms), settle normal (200ms), nothing exceeds 200ms except the Close (300ms max). `prefers-reduced-motion` zeroes all of it (already wired globally — keep it that way).
5. Light theme is a full token override under `html.light`. Any new token gets both values in the same PR.

---

## 2. Type & numbers

- **Geist Sans** for everything; **Geist Mono for numbers that matter** — money amounts, hours, score chips, the expense keypad — always with `tabular-nums`. A column of `$1,240.00` that doesn't jitter is the cheapest "this app is serious" signal we can buy. (G5-06)
- Sentence case everywhere: headings, buttons, labels. No Title Case, no ALL CAPS except tiny eyebrow labels.
- Type scale in practice: page title `text-lg font-semibold`, section heads `text-sm font-medium text-muted`, body `text-sm`, meta `text-xs text-muted`. Don't invent new sizes per component.

### Iconography
Today: 8 hand-rolled SVGs in `components/app/icons.tsx` plus raw glyphs (`⋯ ✕ ✓ ☰ ▲▼`) doing button duty. Glyph-buttons are invisible to screen readers and inconsistent at small sizes. Decision G5-04: adopt **lucide-react** (tree-shaken, ~1KB/icon), replace every glyph-as-control during the a11y pass (B65). Emoji remain welcome as *content* (project icons, categories, types) — never as *controls*.

---

## 3. Layout & density

- App shell: top bar (h-14) · `main max-w-4xl` · right project sidebar ≥`md` · bottom tabs <`md`. Don't add a left sidebar; don't widen main for one feature.
- Spacing rhythm is 4/8px. Cards and rows get `p-3`/`p-4`; sections separate with `space-y-4`/`gap-4`. If you're reaching for `p-[13px]`, stop.
- Kanban columns are 272px fixed, horizontal snap rail. Card chips stay under ~4 lines: title, dots, badges — detail lives in the sheet.
- Touch targets: **44px minimum**, 56px for primary nav (bottom tabs already do this).

---

## 4. Component contracts

Everything below exists in `components/ui/`. **Use these; never rebuild them inline.**

| Component | Contract |
|---|---|
| `Button` | 4 variants (primary/secondary/ghost/danger), 3 sizes. Danger variant *only* on destructive actions. `active:scale-[0.98]` is the pressed state — don't add another. |
| `Modal` | Centered, for **decisions**: confirmations, "move cards where?", type-DELETE. Never for content browsing. |
| `Sheet` | `center` = bottom sheet on mobile (swipe-down dismiss), `side` = right drawer on desktop. For **content and forms**: card detail, add-expense, quick-add. |
| `Toast` | Max 3, polite live region. 4s auto-dismiss, **10s when it carries an action**. The action slot is for Undo — not "View", not marketing. |
| `EmptyState` | Dashed border, icon, title, one-line description, one action. Every list renders one. |
| `Skeleton` | Every route gets a `loading.tsx` that mirrors the real layout's shape (not a spinner, not a blank). |

**Dialog behavior (fix once in `ui/dialog.tsx`, everyone inherits — B50):** Escape closes ✅, focus moves in ✅, focus restores ✅ — but there is **no focus trap, no body scroll lock, no `inert` background** today. All three are required for R17. Native `confirm()` is banned; `members-table.tsx` is the last offender (B51).

**The undo contract (R14).** Every destructive action either:
1. shows a toast with a working **Undo** that restores the exact previous state (column *and* position), or
2. soft-deletes into Trash with 30-day restore.
No third option. Current undo coverage: card delete, idea promote, project trash, expense delete, learning delete. Anything new that deletes joins this list in the same PR.

---

## 5. The four states rule

Plan working rule 2: every shipped slice has the **happy, empty, loading, and error** state. Current reality:

- Empty: good coverage (boards, today, learn columns, expenses, search, trash).
- Loading: `today`, `boards`, `learn`, `money` have skeletons. **The board route — the heaviest page in the app — has none** (B47). Neither do trash/members/settings/search.
- Error: **zero `error.tsx`, `not-found.tsx`, or `global-error.tsx` in the entire app** (B46). Any server hiccup shows the raw Next.js failure page to a user on a phone. This is the single biggest "feels broken" risk in the build.

Rule going forward: a route PR that lacks any of the four states doesn't merge.

---

## 6. Interaction patterns

### 6.1 Optimistic tiers
| Tier | Interactions | Policy |
|---|---|---|
| **1 — must be instant** | drag & drop, complete toggle, checklist tick, label toggle, assignee toggle | Optimistic. Board drag already does manual state + reconcile; extend the rest with React `useOptimistic` (G5-05, B42). Failure = toast + resync, never a frozen UI. |
| **2 — can round-trip** | forms (settings, add-expense, invites), comments send | `useTransition` + server `refresh()` with a pending state on the submit control. |

The tell that tier 1 is broken: ticking a checklist item on 4G and watching nothing happen for a second. That's the current behavior everywhere outside board drag.

### 6.2 URL is state
- `?card=<id>` (board) and `?item=<id>` (learn) are the pattern: **anything you'd want to link, share, or back-button out of lives in the URL.**
- Filters are currently component-local — lost on refresh, unshareable, and un-linkable from a future Weekly Review ("3 overdue → *view them*"). Move the FilterBar to `searchParams` (B54).
- `?m=YYYY-MM` on Money already does this right. Copy it.

### 6.3 Keyboard map
Existing (keep working, test in CI eventually):

| Key | Where | Does |
|---|---|---|
| `Space` → arrows → `Space` | board | lift / move / drop card (dnd-kit) |
| `Enter` | card chip | open detail |
| `Enter` / `Shift+Enter` / `Esc` | inline add | submit / newline / cancel |
| `⌘/Ctrl+Enter` | comments, learning notes | send |
| `Esc` | any dialog | close |

Reserved (don't squat on these): `⌘K` command palette (B8) · `/` focus search · `n` new card · `t` go to Today.

### 6.4 Drag & drop rules
- Sensors stay: pointer 5px, touch 180ms long-press, keyboard. Any new draggable surface (columns B55, learning pipeline) uses the same three.
- Every drop announces via live region (dnd-kit announcements — the desktop hint line is not a substitute).
- Fractional-index the position, one-row update, optimistic move, reconcile on failure. This is already right on cards — don't regress it.

---

## 7. Mobile & PWA rules

- Bottom tabs + center FAB are the phone chrome. New top-level surfaces must earn a tab; everything else reaches via Today, a board, or the FAB.
- Sheets, not modals, on mobile. Full-screen sheet for card detail, bottom sheet for creation. Swipe-down dismiss already works — keep the drag handle visible.
- Safe-area insets on anything pinned to an edge (already done on header/tabs/FABs — new pinned UI copies it).
- The expense keypad is the capture benchmark: **amount → category chip → save in under 15 seconds**. Any new capture flow (quick-add, learning session) is measured against it.
- SW is hand-rolled (`public/sw.js`), registered in production only: network-first pages with offline fallback, cache-first static, update prompt. Offline is **read-only** — writes fail loudly with a toast, no silent queue (queue is a Tier-4 bet, see FEATURES.md).
- Share Target and app shortcuts land on `/today` with query params → `QuickAddTrigger`. New entry points follow this pattern: URL param in, custom event, strip the param.

---

## 8. Copy & voice

Wrangle's voice is **dry, direct, slightly wry** — a competent friend, not a mascot. *"No sessions yet — honest hours only"* is the house style.

| Rule | Do | Don't |
|---|---|---|
| Buttons say what happens | "Save changes", "Delete column" | "Submit", "OK", "Yes" |
| Same verb through a flow | Promote → "Promoted to To-Do" | Promote → "Card moved successfully!" |
| Errors: what + what now | "Couldn't save — you're offline. It's still here; try again when you're back." | "Something went wrong." / "Oops!" |
| Empty states invite | "Nothing due today. Plan tomorrow, or enjoy it." | "No data found." |
| No apology theater | "That didn't save. Retry?" | "We're so sorry for the inconvenience…" |
| Numbers are blunt | "3 overdue" | "You have a few items that may need attention" |

Sentence case. Plain verbs. No exclamation marks outside the 🎉 Learned moment. English-only for now, but no user-facing string lives outside a component's top-level constants (keeps the i18n door open, R17 note).

---

## 9. UX audit — prioritized (cycle 5, 2026-08-24)

> **Status 2026-08-25 (cycle 8):** P0 fully resolved — B45 receipts, B46 boundaries (incl. `global-error.tsx`), B47 board loading, B48 boards hub, B53 learn tz, B64 journal reconciled (`0xxx` generated / `1xxx` supplement namespaces). P1 resolved — B42 optimistic tier-1 (useOptimistic), B49 `/settings`, B50 focus trap + scroll lock + inert in `ui/dialog.tsx`, B51 last native `confirm()` gone, B54 filters live in the URL, B63 README rewritten. P2 resolved — `--success`/`--warning` tokens (B66a), palette merged into `lib/palette.ts` (B66b), column + project drag-reorder via shared `reorderById` helper (B55), dead `cards.cover_image_public_id` column dropped (`1005_supplement_drop_cover_image.sql`) — the other "schema with no UI" items gained UI since the cycle-5 audit and stay. Lucide icon pass (B65) intentionally deferred.

Found by full code sweep. Every row has a backlog ID; P0s are scheduled as **Phase 3.5** in `PLAN.md`.

### P0 — bugs & broken promises
| What | Where | Fix | ID |
|---|---|---|---|
| **Receipts are unviewable.** Upload stores `receiptPublicId` but `receipt_url` is never written; edit path drops receipts entirely. The 📎 indicator can never appear. | `add-expense-sheet.tsx`, `updateExpense` | Write `receipt_url` on confirm; preserve/replace on edit; render a tappable thumb | B45 |
| **No error boundaries anywhere.** A DB blip shows the raw Next.js error page. | whole app | `error.tsx`, `not-found.tsx`, `global-error.tsx` in house style | B46 |
| **Board route has no `loading.tsx`** — the heaviest page blanks on navigation. | `p/[projectId]/b/[kind]` | Column-shaped skeleton | B47 |
| **`/boards` is a placeholder** — a primary bottom-tab destination still says "boards … land in Phase 2." | `app/(app)/boards/page.tsx` | Real hub: per-project board cards, counts, last activity | B48 |
| **Learn ignores the user's timezone** — sessions date against UTC while Today does it right. | `learning.ts` `todayKey("UTC")` | Use `users.timezone` like `/today` | B53 |
| **Migration journal drift** — 3 hand-written SQL files outside the drizzle journal with colliding prefixes; `drizzle-kit` and the runtime migrator disagree about reality. | `drizzle/` | Reconcile into one journal, renumber | B64 |

### P1 — daily friction
| What | Fix | ID |
|---|---|---|
| Checklist/labels/comments round-trip the server before updating (laggy on phone — the cycle-4 inbox already flagged it) | `useOptimistic` per §6.1 | B42 |
| No settings page: theme not persisted server-side (no "system" option despite the enum), timezone/currency/avatar unsettable, `/settings` is proxy-guarded but 404s | Build `/settings`; persist theme to `users.theme` | B49 |
| Dialogs: no focus trap / scroll lock / `inert` | Fix once in `ui/dialog.tsx` | B50 |
| Native `confirm()` in members-table (only place; jarring) | Use `Modal` like danger-zone does | B51 |
| Expense categories: server actions exist, zero UI to add/archive | Category manager in Money | B52 |
| Activity table written on ~15 verbs, **never displayed** — free feature sitting in the DB | Project feed + card history panel (B21's UI half) | B21 |
| Filter state dies on navigation | Filters → URL | B54 |
| README is create-next-app boilerplate | Setup, env, migrate, seed, deploy | B63 |

### P2 — polish
| What | ID |
|---|---|
| Column drag-reorder (drop-target only today); project reorder is hover ▲▼ buttons | B55 | ✅ shipped — columns drag by grip handle, sidebar projects too; ▲▼ kept |
| Icons: lucide, kill glyph-buttons, label everything | B65 | deferred (deliberate) |
| `--success`/`--warning` tokens; retire ad-hoc emerald; wire motion tokens | B66 | ✅ tokens shipped; motion-token wiring still open |
| Schema features with no UI: `wip_limit`, `is_collapsed`, `columns.color`, card covers — ship or remove from schema | (G3-13 / B38) | ✅ all have UI now except `cover_image_public_id`, which was dropped |
| Avatars via raw `<img>` — move to `next/image` during icon pass | B65 |
| Trash counts down to 0 but no purge cron exists — copy says less than the truth until Phase 9 ships it | G5-08 |

**What's already right (don't regress):** the undo-toast pattern, the expense keypad, swipe-down sheets, snap-scroll columns, `?card=` URLs, timezone-correct Today, signed uploads, the empty-state coverage, dark-first theming with no flash.
