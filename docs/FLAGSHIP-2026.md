# Flagship 2026 — **The Loop**

> The research-backed big swing. Three market sweeps (2025–2026 sources, digested in §1) all point at the same opening.
> Status: 🔶 proposal — decided via **grill round 6** (`DISCOVERY-LOOP.md`). Slices marked ⚡ need **no AI** and dodge the AI gate (`REQUIREMENTS.md` §1.3); everything else waits for it.
> Companions: `FEATURES.md` (the wider pool — Weekly Review B56 folds into this) · `UI-UX.md` (the Close, voice, tokens)

---

## 0. The pitch

**Wrangle already has an identity: closing loops.** The Loop turns that into one connected flagship system:

```
 CAPTURE ─────────► RETENTION ─────────► GROWTH ──────► new users
 The Dump           The Shutdown         Life Wrapped        │
 (voice/text →      (daily close +       (monthly/yearly     │
  AI files it        weekly review        share cards)       │
  into 4 buckets)    ritual)                                  │
      ▲                                                       │
      └───────────────────────────────────────────────────────┘
```

One sentence for the landing page: **"Dump your brain. Close your day. Wrap your month."**

And the kicker no funded competitor can say: the AI runs **in your browser, on your device — unlimited, private, $0.** Their per-request LLM bills make "free unlimited AI" impossible; our on-device architecture makes it the default.

---

## 1. What 2026 rewards (research digest)

### 1.1 Capture is the AI feature people actually love
- Todoist's headline 2026 feature is **Ramble** — speak unstructured thoughts, get organized tasks with dates/priorities — bundled unlimited into a $5/mo plan ([TechCrunch, 2026](https://techcrunch.com/2026/01/21/todoists-app-now-lets-you-add-tasks-to-your-to-do-list-by-speaking-to-its-ai/)). TickTick 8.x shipped AI voice input + transcription (2026).
- Sentiment across 2025–26 reviews: users like AI that **captures faster, reschedules gracefully, stays optional**; they churn on AI that takes over, meters credits, or bundles "AI employees" — Motion's $29–299/mo credit-metered pivot is the category's cautionary tale ([temporal.day, 2026](https://temporal.day/blog/motion-pricing-2026-why-users-leaving)). Nobody complains an app has too *little* AI.

### 1.2 The ritual is a product people pay $16–20/mo for
- Sunsama's entire premium is a guided ritual: morning plan, timeboxing, **daily shutdown with reflection**, Friday weekly review — users call it "the single best productivity app I've used" while its feature set is thin ([sunsama.com](https://www.sunsama.com/features/daily-planning-and-shutdown), 2025). Akiflow ("Daily Rituals"), Ellie, and Morgen all copied the shutdown in 2025–26.
- Apple's 2025 iPhone App of the Year was **Tiimo** — a calm, visual, neurodivergent-friendly day planner. Calm beats feature-max ([MacRumors, 2025](https://www.macrumors.com/2025/12/04/apple-announces-2025-app-store-award-winners/)).

### 1.3 Wrapped-style recaps are the strongest free growth loop in consumer apps
- Spotify Wrapped 2025 = biggest ever: 200M+ users in 24h, **500M+ shares, +41% YoY** ([TechCrunch, 2025](https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day)). Copycats everywhere: Duolingo, YouTube Recap, Amazon, Monzo's "Year in Monzo", even Actual Budget.
- **Strava paywalled its recap in Dec 2025 and got flamed for it** ([road.cc, 2025](https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425)) — a *free* recap is now itself a marketing story.
- What makes recaps get shared: identity narrative (archetype labels), personal superlatives, one surprising "plot twist" stat, 9:16 story-sized cards, one-tap share. Duolingo designs stat screens to screenshot aspect ratios and measures screenshots as a growth metric ([Startup Spells](https://startupspells.com/p/duolingo-screenshot-tracking-viral-strategy)).
- Rosebud (AI journal, $6M seed 2025) gates its Wrapped behind ~20 entries — **the shareable artifact doubles as the retention mechanism** ([TechCrunch, 2025](https://techcrunch.com/2025/06/04/rosebud-lands-6m-to-scale-its-interactive-ai-journaling-app/)).

### 1.4 The platform finally allows all of this for $0 (the 2026 window)
- **Chrome's Prompt API (Gemini Nano) went stable for web pages in Chrome 148 (Q2 2026)** — free-form on-device LLM calls with JSON-schema structured output. Desktop Chrome/Edge only; **not on Android Chrome yet** ([developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api), 2026). Summarizer/Translator stable since Chrome 138 (2025).
- **On-device speech-to-text shipped**: Web Speech API with `processLocally: true` in Chrome 139 (Aug 2025, desktop); classic Web Speech still works free on Android. Whisper via transformers.js is practical in-browser now that **WebGPU is default in every major browser incl. Android Chrome (Jan 2026)** ([web.dev, 2026](https://web.dev/blog/webgpu-supported-major-browsers)).
- Real deployments exist: Trip.com parses NL queries on-device ("unlimited queries, zero budget"), Yahoo! Japan moderates comments client-side ([Chrome I/O 2026](https://developer.chrome.com/blog/build-new-features-using-built-in-ai-in-chrome-io2026)).
- Also 2026-notable: streak-guilt is now a documented liability (streak anxiety, abstinence-violation effect); the approved mechanics are consistency-rate, non-resetting cumulative counts, "never miss twice" ([cohorty, 2025](https://blog.cohorty.app/the-psychology-of-streaks-why-they-work-and-when-they-backfire/)). And time-block/calendar views are the **single most-paywalled feature** in the category (Todoist Pro, TickTick Premium) — free is a differentiator.

---

## 2. Surface 1 — **The Dump** (capture)

Hold the ➕ FAB (tap = quick-add, hold = Dump), or hit the mic in the quick-add sheet, or share text in via the existing Share Target. Say or paste *anything*; Wrangle splits it into the four buckets and shows a review tray. **Assistive, never autonomous** — nothing saves until you confirm.

```
 ┌──────────────────────────────┐      ┌──────────────────────────────┐
 │  ●  Listening…         0:07  │      │  Sorted — 4 things        ✕  │
 │                              │      │ ┌──────────────────────────┐ │
 │  "spent 8.50 on fuel         │      │ │ 💸 Expense  $8.50        │ │
 │   yesterday… idea: dark      │      │ │ Fuel · Transport · yday  │ │
 │   mode for the blog…         │  →   │ ├──────────────────────────┤ │
 │   call Ali tomorrow at 5…    │      │ │ 💡 Idea → Blog · Ideas   │ │
 │   did 40 minutes of the      │      │ │ Dark mode for the blog   │ │
 │   postgres course"           │      │ ├──────────────────────────┤ │
 │                              │      │ │ ☑ Task → My Space        │ │
 │           ⏹ Done             │      │ │ Call Ali · tue 5:00 pm   │ │
 └──────────────────────────────┘      │ ├──────────────────────────┤ │
                                       │ │ 📚 +40 min → Postgres    │ │
   tap a row to edit · tap the         │ └──────────────────────────┘ │
   type chip to recast it              │ ┌──────────────────────────┐ │
                                       │ │       Save all 4         │ │
                                       │ └──────────────────────────┘ │
                                       └──────────────────────────────┘
```

**The split-brain architecture (progressive enhancement, $0 at every rung):**

| Rung | Where | How | Ships |
|---|---|---|---|
| ⚡ **Heuristic parse** | everywhere | `chrono-node` dates + amount/currency regex + prefix keywords ("idea:", "spent", "learned/min") | v1 — no AI, dodges the AI gate |
| Speech in | Android + desktop | Web Speech API (free; on-device w/ `processLocally` on desktop Chrome 139+) | v1 |
| **On-device LLM classify** | desktop Chrome/Edge | Prompt API (Gemini Nano, stable Chrome 148) with `responseConstraint` JSON schema → typed items | v2, post-gate |
| Android classify upgrade | Android Chrome | transformers.js on WebGPU (small zero-shot classifier or Whisper for audio) — or wait for Nano-on-Android ("planned 2026") | v2/v3 |

Schema impact: **none.** Items materialize straight into existing tables (`cards`, `expenses`, `learning_sessions`). The tray is client state.

**Marketing line:** *"Dump your brain. Wrangle sorts it. The AI lives in your browser — nothing leaves your device, nothing is metered, nothing costs us (or you) a cent."*

---

## 3. Surface 2 — **The Shutdown** (retention)

The Sunsama ritual, but Wrangle's version sees all four modules — no single-domain app can render this screen.

```
 ┌──────────────────────────────┐
 │  Shutdown · Tue 24 Aug       │
 │                              │
 │  2 left from today           │
 │  ○ Fix receipt bug           │
 │     [→ tmrw] [✓ done] [let go]│
 │  ○ Email the plumber         │
 │     [→ tmrw] [✓ done] [let go]│
 │                              │
 │  Today: 5 closed · 40m       │
 │  learned · $8.50 spent       │
 │                              │
 │  One line about today…       │
 │  ┌────────────────────────┐  │
 │  └────────────────────────┘  │
 │                              │
 │       Close the day ✓        │
 └──────────────────────────────┘
```

- **Morning:** "Plan today" — pick up to 3 cards into focus (`focused_on date` on cards; already proposed in FEATURES §3.4). ⚡ no AI.
- **Evening:** leftovers get exactly three verbs — *tomorrow / done / let go* ("let go" clears the due date guilt-free); a one-glance day summary; an optional one-line note. Closing the day is itself a Close (UI-UX §0). ⚡ no AI.
- **Weekly:** Sunday rolls the week up — this *is* Weekly Review B56, now the middle chapter of a family: **day closes → week reviews → month wraps.**
- Anti-streak by design: we show **consistency rate** ("closed 5 of 7 days") and non-resetting cumulative counts, never a breakable streak. "Never miss twice" nudge only.
- Reminder: in-app until Phase 8 push exists; then a single quiet evening notification.

Schema impact (minimalism): one tiny table `day_reviews (user_id, date, note, closed bool)` — day notes are unbounded time-series, so a real table beats JSONB here; everything else on the screen is computed.

---

## 4. Surface 3 — **Life Wrapped** (growth)

Monthly (and a yearly grand edition) recap: 5–7 vertical 9:16 story cards, rendered to shareable images (canvas → Web Share API with files — solid on Android).

```
 ┌────────────────────────┐  Card deck:
 │      AUGUST 2026       │   1. Archetype  — "The Builder-Scholar"
 │                        │      (deterministic: ratios of closes/
 │        THE             │       ideas/hours/spend — no AI needed)
 │   BUILDER-SCHOLAR      │   2. Shipped    — 47 cards, best project
 │                        │   3. Learned    — 21 honest hours, top item
 │   47 cards shipped     │   4. Spent      — $312, top category
 │   21 honest hours      │   5. Plot twist — one cross-domain surprise:
 │   $312 spent           │      "your cheapest week was your most
 │   9 ideas captured     │       productive one" · "$4.20 per
 │                        │       learning hour"
 │  plot twist: your      │   6. All-time   — non-resetting counters:
 │  cheapest week was     │      "412 loops closed since March"
 │  your most productive  │   7. Closer     — subtle wordmark footer
 │                        │      (the only branding — the card is a
 │  412 closed all-time   │       favor to the user, not an ad)
 │             wrangle ▪  │
 └────────────────────────┘
```

- **The plot-twist stat is the moat.** Superlatives that need tasks × learning × money in one database — Trello, Todoist, YNAB, and Duolingo structurally cannot compute them.
- **Rosebud-style gate:** unlocks at ~15 active days in the month, shown as quiet progress ("9/15 days — your August wrap is building"). The share artifact doubles as the habit loop.
- **Free forever, loudly** — while Strava charges $80/yr for theirs. That contrast is a launch post by itself.
- Optional post-gate garnish: Gemini Nano writes the one-line month narrative on desktop; templates elsewhere. The 2024 Spotify lesson: recaps must feel *specific and true* — data first, AI seasoning only.

Schema impact: **none required** (all computed from existing rows + `activities`). Optional later: `wrapped_snapshots` JSONB cache per month.

---

## 5. Why this wins

| | Todoist / TickTick | Sunsama | Motion | Rosebud / journals | **Wrangle Loop** |
|---|---|---|---|---|---|
| Voice → filed into tasks **and** money **and** learning | tasks only | — | tasks only | — | ✅ four buckets |
| AI cost to vendor | per-request (paywalled) | — | metered credits | per-request | **$0 on-device** |
| Privacy story | cloud | cloud | cloud | cloud | **never leaves device** |
| Shutdown ritual across life domains | — | tasks only ($16–20/mo) | — | reflection only | ✅ tasks+hours+spend |
| Wrapped with cross-domain plot twists | — | — | — | own data only | ✅ unique joins |
| Price | $5/mo | $16–20/mo | $29+/mo | subscription | **free** |

The strategic read from all three sweeps: **the Sunsama lane (calm ritual) + the Todoist lane (cheap assistive capture) + the Wrapped lane (free identity artifact) are all open simultaneously to a four-module app, and the on-device-AI window is open now** — native apps can't reuse the code, funded apps can't afford free-unlimited, and cross-browser parity won't force everyone else in before ~2027.

## 6. Honest constraints

1. **The AI gate stands** (REQUIREMENTS §1.3): no AI until the MVP has 2 real weeks of use. The ⚡ slices (heuristic Dump, Plan/Shutdown, Wrapped) need zero AI — the flagship starts shipping *before* the gate opens.
2. **Gemini Nano is desktop-only today** (Win/mac/Linux Chrome/Edge, ~22GB free disk, ~9K token context). It is progressive enhancement, never a dependency. Android's web story is Whisper/transformers.js on WebGPU or waiting for Google's promised per-API Android rollout.
3. **Wrapped needs a month of real data.** Build order is fixed: Shutdown (creates the daily data + habit) → Dump (accelerates capture) → Wrapped (harvests both).
4. **Don't become Motion.** Every AI action shows its work in a review tray, is optional, and is never metered. The moment the AI files something wrong with no easy recast, trust is gone.
5. iOS Safari: no share-target, push only when installed — the Loop targets Android + desktop first, matching actual usage (G3-30).

## 7. Build order & wiring

| Slice | Needs | Phase fit | Backlog |
|---|---|---|---|
| ⚡ Plan-today + Shutdown + day_reviews | nothing new | after Phase 7 polish | B70 |
| ⚡ Dump v1 (heuristics: chrono-node + amount regex) | quick-add plumbing (exists) | with Phase 7 | B67 |
| ⚡ Wrapped monthly (computed + canvas share cards) | 1 month of Shutdown data | Phase 8 window | B69 |
| Dump v2 (Prompt API classify, desktop) | AI gate open | post-gate | B68 |
| Wrapped narrative line (Nano, desktop) | AI gate open | post-gate | B68 |
| Android classify (transformers.js/WebGPU) | v2 proven | later | B68 |

Grill round 6 (`DISCOVERY-LOOP.md`) holds the open decisions with defaults. Weekly Review **B56 folds into the Shutdown family** rather than shipping standalone.
