# Data Model — Wrangle

> Draft schema. Postgres (Neon). Change here first, then migrate.
> Conventions decided once, applied everywhere — see §1.

## 1. Conventions

| Rule | Choice | Why |
|---|---|---|
| Primary keys | **UUIDv7** (time-sortable) stored as `uuid` | sortable like an int, generatable on the client → safe for optimistic UI and future offline sync |
| Timestamps | `created_at`, `updated_at` (`timestamptz`, UTC), auto-updated | timezone rendering happens in the UI |
| Soft delete | `deleted_at timestamptz NULL` on user-visible entities | trash + 30-day restore (R14) |
| Ordering | `position text` — **fractional index string** | insert between two cards = one row update, no column reindex |
| Money | `amount_minor bigint` + `currency char(3)` | never floats. 12.34 USD = `1234`, `'USD'` |
| Dates due | `due_date date` **or** `due_at timestamptz` + `is_all_day bool` | "tomorrow" ≠ "tomorrow 00:00 UTC" |
| Enums | Postgres enums for stable sets, text+check for volatile ones | migrations are cheaper for text |
| Cascades | `ON DELETE CASCADE` from project downward; users are never hard-deleted without export | data hygiene |
| Naming | `snake_case` tables/columns, plural tables | boring is good |

### 1.1 Fractional indexing (the important one)
`position` is a base-62 string. Card between `"a0"` and `"a1"` becomes `"a0V"`. Moving a card = **one UPDATE**, not N. Use a small library (`fractional-indexing`) rather than hand-rolling. Add a `UNIQUE (column_id, position)` constraint and handle collisions by re-generating; run a rebalance job only if strings exceed ~50 chars (basically never at your scale).

---

## 2. Entities

### Identity
```
users            id, name, email (unique, citext), image_url, timezone,
                 theme ('dark'|'light'|'system'), currency, onboarded_at,
                 created_at, updated_at, deleted_at
accounts         Auth.js standard (provider, provider_account_id, tokens)
sessions         Auth.js standard (session_token, user_id, expires)
```
Account linking: same **verified** email across Google/GitHub → one user row.

### Projects & membership
```
projects         id, name, emoji, color, owner_id → users,
                 is_personal bool, archived_at, position,
                 created_at, updated_at, deleted_at
memberships      id, project_id, user_id, role project_role,
                 joined_at, invited_by
                 UNIQUE (project_id, user_id)
enum project_role = owner | admin | member | viewer
```
Every read path resolves `memberships` first. There is no other way in.

### Boards, columns, cards
```
boards           id, project_id, kind board_kind, name, position
enum board_kind  = todo | ideas | work            -- N boards allowed, UI shows 3

columns          id, board_id, name, color, position, wip_limit int NULL,
                 is_collapsed bool, created_at, deleted_at

cards            id, column_id, board_id (denormalised for fast board queries),
                 project_id (denormalised for authz + cross-project views),
                 title, description text (markdown), position,
                 due_at timestamptz NULL, is_all_day bool,
                 completed_at timestamptz NULL,
                 impact smallint NULL, effort smallint NULL,   -- ideas board
                 cover_color, cover_image_public_id,
                 created_by, created_at, updated_at, deleted_at
```
`project_id` on cards is denormalised on purpose: the Today view and every authz check need it without a 3-table join. Enforce with a trigger or always-write-both in one transaction.

```
labels           id, project_id, name, color            -- per-project palette
card_labels      card_id, label_id  (PK both)
card_assignees   card_id, user_id  (PK both)
checklist_items  id, card_id, text, is_done, position
comments         id, card_id, author_id, body, created_at, updated_at, deleted_at
attachments      id, card_id NULL, expense_id NULL, learning_item_id NULL,
                 cloudinary_public_id, url, mime, bytes, width, height,
                 uploaded_by, created_at
                 CHECK (exactly one parent id is not null)
```

### Invites
```
invites          id, project_id, token_hash (unique), role project_role,
                 created_by, expires_at, max_uses int, used_count int,
                 revoked_at, created_at
invite_redemptions  invite_id, user_id, redeemed_at   -- audit + idempotency
```
Plaintext token is shown **once** at creation and never stored.

### Activity
```
activities       id, project_id, actor_id, entity_type, entity_id,
                 verb ('created'|'moved'|'completed'|'joined'|…),
                 meta jsonb, created_at
```
Single append-only table powers both the project feed and the card history. Index `(project_id, created_at desc)` and `(entity_type, entity_id, created_at desc)`.

### Notifications
```
notifications    id, user_id, type, title, body, link, entity_id,
                 read_at, created_at
push_subscriptions  id, user_id, endpoint, p256dh, auth, user_agent, created_at
```

### Expenses (standalone v1, project-linkable later)
```
expense_categories  id, user_id, name, emoji, color, is_archived, position
expenses            id, user_id,
                    project_id NULL,          -- ← the future-proof column
                    category_id, amount_minor bigint, currency char(3),
                    spent_on date, note, payment_method text NULL,
                    receipt_public_id NULL,
                    created_at, updated_at, deleted_at
```
Indexes: `(user_id, spent_on desc)`, `(user_id, category_id, spent_on)`.
Later additions (already shaped for): `budgets(user_id, category_id, period, amount_minor)`, `expense_splits(expense_id, user_id, share_minor, settled_at)`, `recurring_expenses(...)`.

### Learning
```
learning_items   id, user_id, title, type learning_type, status learning_status,
                 source_url, why_note, target_date date NULL,
                 progress_pct smallint, hours_logged numeric(6,2),
                 completed_at, position,
                 created_at, updated_at, deleted_at
enum learning_type   = course | book | video | article | skill | other
enum learning_status = want | learning | learned

learning_milestones  id, item_id, text, is_done, position
learning_sessions    id, item_id, happened_on date, minutes int, note
learning_resources   id, item_id, url, title, note
learning_notes       id, item_id, body, created_at        -- journal
card_links           id, card_id, learning_item_id        -- "add to board"
```
`progress_pct` is derived from milestones when milestones exist, else manual.

### Housekeeping
```
trash_purge_log  id, entity_type, entity_id, purged_at    -- cron output
rate_limits      key text pk, count int, window_start     -- if not using Upstash
```

---

## 3. Query patterns to design for

| View | Query shape | Index needed |
|---|---|---|
| Board load | columns of board + cards where `board_id = ? and deleted_at is null` order by position | `cards(board_id, position) where deleted_at is null` |
| Today | cards where `project_id in (my projects) and due_at <= today and completed_at is null` | `cards(project_id, due_at) where completed_at is null and deleted_at is null` |
| Search | `to_tsvector(title || description)` GIN + `pg_trgm` on title | GIN + trgm |
| Month spend | expenses where `user_id = ? and spent_on between ? and ?` | `(user_id, spent_on desc)` |
| Activity feed | `(project_id, created_at desc)` limit 50 | composite |

Board load target: **one round trip** — one query for columns, one for cards, assembled in the server component. No per-card queries, ever.

---

## 4. Concurrency & optimistic UI
- Client generates the UUIDv7 and the new `position`, renders immediately, then calls the server action.
- Server actions take `expected_updated_at` for edits; mismatch → return the fresh row and the client reconciles with a "someone else changed this" toast.
- Moves are idempotent: same card, same target position, applied twice = same result.

## 5. Migration discipline
- One migration per PR, forward-only, reversible where cheap.
- Never rename+drop in one deploy: add → backfill → switch reads → drop later.
- Test every migration on a **Neon dev branch** first (copy-on-write, seconds to create, free).
- Seed script: 1 user, 2 projects, 3 boards each, ~40 cards, 20 expenses, 5 learning items — needed for dev, demos, and Playwright.
