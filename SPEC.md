# todo-lora — Technical Specification

> v10 (MVP) · Last updated 2026-04-20
> Companion to `PROMPT.md`. The prompt is the concise brief; this file is the detailed implementation contract.
> Design direction lives in §6.9 (Anthropic / Claude aesthetic with concrete tokens).

---

## 0. Status

This document drives MVP implementation. All §15 blockers are resolved; remaining items in §15 are v2 notes only.

### 0.1 Scope posture

MVP is **local-development-only**. The app runs on the owner's macOS machine against local Postgres + MinIO in Docker. Production deployment is **deferred** — it will be designed when the team is ready to ship, not before. See §12.2.

The stack choices still stand (Next.js + Postgres + MinIO + Better-Auth + Drizzle). Keep runtime config environment-driven so a future deployment is not painful, but the coder does **not** write Caddyfiles, production Dockerfiles, deploy scripts, VPS config, TLS, backups, monitoring, or ops hardening in this cycle.

Other posture rules that still apply even without a production target:

- Attachment media is never routed through any image optimizer (see §7.2). Presigned MinIO URLs stay the contract.
- The browser never receives direct database credentials (§2.2).
- EXIF stripping is mandatory before image attachments are accepted (§7.3.1).
- No external operational integrations (error tracking, uptime monitoring, analytics) — deferred to post-pilot.

---

## 1. Constraints

- **Team:** ~5 users. No complex roles. Everyone reads and writes everything.
- **MVP velocity** is the primary optimisation. Avoid abstractions that do not buy immediate product value.
- **Local dev only in MVP.** Production deployment is deferred — design the app so it can be containerized and deployed later, but do not build deploy tooling now.
- **v2 Telegram ingestion is a known goal.** Not in MVP scope; the ingest endpoint, provenance columns, and HMAC secret will be added together with the v2 bot (§11).
- **Realtime is a product feature.** A status change by one user should reach other clients within ~1 second in normal conditions.
- **Mobile-first reads (Лора), desktop-first writes (operator).** One responsive layout; no Trello-style horizontal board.
- **No managed hot-path services.** No external error tracking, no external uptime monitor, no analytics in MVP.

---

## 2. Architecture principles

### 2.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Node runtime | **Node.js 22 LTS** | Pinned in Docker base image and `.nvmrc`. Supported until April 2027 |
| Frontend framework | **Next.js 15** App Router + **React 19** | Local: `pnpm dev`; `pnpm build` is a verification gate, not a deployment target |
| Styling | **Tailwind CSS 4** + **shadcn/ui** *as unstyled primitives* | v4 is a major upgrade over v3 — CSS-based config, `@import "tailwindcss"`, no JS `tailwind.config.ts`. Restyle shadcn primitives to match §6.9 Anthropic/Claude aesthetic |
| Database | **Postgres 18** in Docker | Sole source of truth for the MVP; production is deferred |
| Auth | **Better-Auth ^1** inside the Next.js app | Sessions stored in Postgres. Sign-in is by per-user login code (§8); no email/SMTP in the loop |
| Object storage | **MinIO** in Docker (rolling) | S3-compatible; private bucket only; presigned browser upload/download |
| Realtime | Postgres `LISTEN/NOTIFY` + lightweight Next.js SSE endpoint | No separate realtime service |
| ORM / migrations | **Drizzle ORM ^0.44** + **Drizzle Kit** | Typed queries + committed SQL migration artifacts |
| Validation | **Zod 4** | Shared UI ↔ API schemas |
| Rate limiting | In-memory token bucket per process | Applied to the login route. Single local app process = single bucket is adequate for MVP |
| Image processing | **sharp** (rolling) | Server-side EXIF strip (§7.3.1) |
| Password hashing | **argon2id** via `@node-rs/argon2` | Used for login-code hashes in §8 |
| Server runtime | Next.js server actions + route handlers | All business reads and writes flow through the app server |
| Logs / DB inspection | Docker logs + local SQL tools | Use TablePlus, Drizzle Studio, or pgAdmin as needed; no bundled runtime studio |
| Language / package manager | **TypeScript 5.8+** strict + **pnpm 10** | — |
| Testing | **Vitest 3** + **testcontainers** + **Playwright 1.5x** + **axe-playwright** | Cover well at all levels (unit, integration against real Postgres, E2E, accessibility); specifics at the AI-coder's discretion |
| Lint / format | **ESLint** (typescript-eslint) + **Prettier** | Standard configs |

### 2.2 Server-side access boundary

Simple and non-negotiable:

- The browser never holds a Postgres connection.
- The browser never talks to Postgres directly.
- All reads and writes flow through **Next.js server actions / route handlers**.
- Authorization happens in server code using the authenticated **Better-Auth session**.
- UI-level hiding is convenience only; the server boundary is the actual security boundary.

Concrete consequences:

- Feed reads, task detail reads, mutations, upload-intent creation, and presigned-URL generation all happen server-side.
- The app server uses Drizzle against Postgres and an S3-compatible client against MinIO.
- Audit fields such as `created_by`, `last_edited_by`, and `task_events.actor_id` are always set explicitly by server code from the Better-Auth session. **Do not use DB defaults for actor attribution.**
- The browser receives only the minimum data needed to render and only time-limited MinIO presigned URLs for object access.
- The browser never lists buckets, never derives object keys, and never receives long-lived MinIO credentials.

### 2.3 Single source of truth for schema

Database shape and evolution live in the repo and nowhere else:

- App tables, enums, indexes, constraints, triggers, and Better-Auth-owned tables all live in the same Postgres database.
- Migrations are authored locally via `drizzle-kit generate`.
- Generated SQL artifacts are committed to the repo.
- Migrations are applied via `drizzle-kit migrate` against local Postgres.
- Drizzle is the typed query layer used by the app runtime.

---

## 3. Repository layout

```
/todo-lora
├── PROMPT.md
├── SPEC.md
├── app/                                # Next App Router
│   ├── (feed)/page.tsx                 # main screen
│   ├── new/page.tsx                    # task creation form (§6.6)
│   ├── task/[id]/page.tsx              # task detail route (§6.7)
│   ├── api/realtime/feed/route.ts      # SSE endpoint
│   └── ...
├── components/
├── lib/
│   ├── auth/                           # Better-Auth config + session helpers
│   ├── db/                             # Drizzle client + transactions
│   ├── storage/                        # MinIO S3 client + presign helpers
│   ├── realtime/                       # LISTEN/NOTIFY bridge + SSE helpers
│   ├── validation/                     # Zod schemas shared by UI ↔ server actions
│   └── fsm/                            # status transition rules
├── drizzle/
│   ├── schema/                         # schema definitions used by Drizzle
│   └── migrations/                     # committed SQL artifacts
├── public/
├── docker-compose.dev.yml              # local Postgres + MinIO
└── ...
```

This is the intended repository shape. Treat it as guidance for architectural responsibilities, not as path/name micromanagement. Equivalent clean structure is acceptable if the boundaries remain clear.

---

## 4. Data model

Five core application entities:

1. `topics` — seeded reference data
2. `tasks` — single wide table covering all 3 task types; source of truth for the feed
3. `attachments` — images and URL references linked to tasks
4. `task_events` — lightweight audit log
5. Better-Auth tables — users, sessions, verification state, and related auth records stored in the same Postgres database

### 4.1 Enums

- `task_type` ∈ { `custom`, `content_task`, `note` }
- `task_status` ∈ { `draft`, `in_progress`, `done`, `delivered`, `cancelled` }
- `task_priority` ∈ { `low`, `medium`, `high` }
- `payment_model` ∈ { `full`, `unlock` }
- `agreement_state` ∈ { `pending`, `confirmed`, `rejected` } — Custom-only
- `attachment_kind` ∈ { `image`, `url` }

`task_source` (values `manual` / `telegram_bot` / `api`) is deferred to v2 along with the ingestion API (§11). All MVP rows are implicitly `manual`.

Legacy vocabulary such as `delivery_state`, `ready`, and `finished` is removed from the data model.

### 4.2 `topics`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `slug` | text | no | | Stable machine identifier (e.g. `customs`) |
| `name` | text | no | | Display label |
| `sort_order` | int | no | | Lower = higher in feed |
| `tg_topic_id` | int | yes | | For v2 Telegram mapping; null in MVP |
| `archived_at` | timestamptz | yes | | Soft archive only |
| `created_at` | timestamptz | no | `now()` | |

**Constraints:**

- Unique on `slug`
- Unique on `sort_order` where `archived_at IS NULL`

All topics are rendered equally in the feed — same expand/collapse behavior, same card layout. There is no "primary" vs "quiet" distinction at either the schema or rendering level.

Topics are reference data, not a closed enum. New topics can be added by inserting new rows into `topics`; no schema change is required. MVP does **not** include a public topic-admin UI, so topic creation happens through an owner/admin operational path (Drizzle seed update or direct SQL over an SSH-tunneled connection).

### 4.3 `tasks`

**Common columns (all types):**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `type` | task_type | no | | |
| `topic_id` | uuid | no | | FK → `topics(id)` |
| `title` | text | no | | |
| `description` | text | yes | | |
| `status` | task_status | no | `draft` | Universal lifecycle — §6 |
| `priority` | task_priority | yes | | |
| `deadline_on` | date | yes | | Day-based deadline only in MVP; no time-of-day semantics |
| `assignee_id` | uuid | yes | | FK → Better-Auth user row |
| `requester_id` | uuid | yes | | FK → Better-Auth user row |
| `created_by` | uuid | no | | FK → Better-Auth user row; always set server-side |
| `last_edited_by` | uuid | yes | | FK → Better-Auth user row; always set server-side |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | Bumped on every UPDATE |

**Custom-only columns (CHECK-enforced to NULL for non-custom):**

| Column | Type | Notes |
|---|---|---|
| `buyer_handle` | text | Social handle |
| `buyer_display_name` | text | Human-readable name if known |
| `platform` | text | `Fansly`, `OnlyFans`, etc.; free text in MVP |
| `payment_model` | payment_model | |
| `amount_cents` | int | Total price |
| `amount_collected_cents` | int | Paid so far |
| `duration_min_seconds` | int | Optional; UI enters minutes, stored as seconds |
| `duration_max_seconds` | int | Optional; if equal to min, rendered as a single value |
| `agreement_state` | agreement_state | Custom-only; nullable; orthogonal to `status` |

`agreement_state` exists **only** on `custom` tasks. It is removed from `content_task` and `note`.

`note` rows are team-shared in MVP. There is no private-note visibility model.

**Provenance / ingestion columns.** Deferred to v2 together with the ingest API (§11). `source`, `tg_chat_id`, `tg_topic_id`, `tg_message_id`, `fragment_id`, `raw_text`, `external_id`, and `first_human_edit_at` are **not** in the MVP schema. They will be added by migration when the bot ships.

**CHECK constraints:**

- `type <> 'custom'` implies all Custom-only columns, including `agreement_state`, are NULL.
- `status = 'delivered'` implies `type = 'custom'`.
- `amount_collected_cents <= amount_cents` when both are non-null.
- `payment_model = 'unlock'` implies `amount_cents IS NOT NULL`.

**Indexes:**

- `btree (topic_id, status)` — primary feed path
- `btree (deadline_on) WHERE status NOT IN ('delivered', 'cancelled') AND NOT (type <> 'custom' AND status = 'done')` — supports active-feed deadline filters

**Trigger / write discipline:**

- `updated_at` is bumped on every UPDATE.
- Human-facing server mutations set `created_by` / `last_edited_by` explicitly from the Better-Auth session.

### 4.4 `attachments`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `task_id` | uuid | no | | FK → `tasks(id) ON DELETE CASCADE` |
| `kind` | attachment_kind | no | | `image` \| `url` |
| `object_key` | text | yes | | Required when `kind='image'`; canonical MinIO object key |
| `url` | text | yes | | Required when `kind='url'` |
| `mime_type` | text | yes | | |
| `size_bytes` | bigint | yes | | |
| `original_name` | text | yes | | Stored for UI only; never logged |
| `caption` | text | yes | | Stored for UI only; never logged |
| `sort_order` | int | no | `0` | |
| `uploaded_by` | uuid | yes | | FK → Better-Auth user row |
| `created_at` | timestamptz | no | `now()` | |

**CHECK:**

- `(kind = 'image' AND object_key IS NOT NULL AND url IS NULL)`
- `(kind = 'url' AND url IS NOT NULL AND object_key IS NULL)`

**Provenance / idempotency columns.** Deferred to v2 together with ingest (§11). `source` and `external_id` and the `(task_id, source, external_id)` partial unique index are **not** in the MVP schema. They will be added by migration when the bot ships.

### 4.5 `task_events`

One row per user-visible change. Durable audit trail for all human activity.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | |
| `task_id` | uuid | no | FK → `tasks(id) ON DELETE CASCADE` |
| `actor_id` | uuid | no | FK → Better-Auth user row |
| `event_type` | text | no | `created` \| `status_changed` \| `edited` \| `attachment_added` \| `attachment_removed` \| `cancelled` \| `reopened` |
| `payload` | jsonb | yes | Changed-field snapshot |
| `created_at` | timestamptz | no | `now()` |

**Index:** `btree (task_id, created_at DESC)`.

`actor_source`, `bot_updated`, and `ingest_rejected` are deferred to v2 with the ingest API (§11).

### 4.6 Server-side boundary & DB roles

The database is never a browser-facing surface.

| Surface | Browser direct access | Notes |
|---|---|---|
| Next.js pages / route handlers | yes | Local dev uses the Next.js dev server; production TLS is deferred |
| Postgres | no | App server only |
| Better-Auth session tables | no | Accessed by the app only |
| MinIO bucket listing / admin API | no | Never exposed to end users |
| MinIO object reads / writes | only via presigned URLs | Short-lived, object-scoped, server-issued |
| DB inspection tools | no direct end-user access | Devs/admins use TablePlus, Drizzle Studio, or pgAdmin as needed |

Recommended DB roles:

- **`app` role:** used by the Next.js app for reads/writes
- **`migrator` role:** used by `drizzle-kit migrate`
- **Optional read-only admin role:** for manual inspection over SSH tunnel

The app role should be scoped to only the schema objects the product actually uses. That is defense in depth, not the primary authorization boundary.

---

## 5. Topics — seed

For MVP, the starting app-level topic set is fixed to the 9 topics below. This list does **not** need to mirror Telegram topics 1:1; `todo-lora` owns its own information architecture. New topics can be added later through the `topics` table without changing the schema. MVP does not include a public admin UI for topic creation.

| slug | display name | sort_order |
|---|---|---|
| `customs` | Customs | 10 |
| `sets` | Sets | 20 |
| `life` | Life | 30 |
| `fyp` | FYP | 40 |
| `ppv` | PPV | 50 |
| `sextings` | Sextings | 60 |
| `reddit` | Reddit | 70 |
| `instagram` | Instagram | 80 |
| `pictures` | Pictures | 90 |

`sort_order` leaves gaps so reordering does not require renumbering. All topics are rendered equally in the feed; there is no primary/quiet split.

---

## 6. Status workflow

One lifecycle enum covers all three task types. `delivered` is Custom-only at the DB level.

### 6.1 Lifecycle

```
                                             (Custom only)
draft ──► in_progress ──► done ──────────────► delivered
  │            │           │
  └────────────┴───────────┴──────────────────► cancelled
```

| Status | Meaning | Russian UI label | Valid for |
|---|---|---|---|
| `draft` | Brief exists but work has not really started | «Черновик» | all types |
| `in_progress` | Actively being worked on | «В работе» | all types |
| `done` | Execution complete | «Готово» | all types |
| `delivered` | Custom handed off to buyer; terminal success for Customs | «Доставлено» | `custom` only |
| `cancelled` | Terminal — not done, not coming back | «Отменено» | all types |

Older working vocabulary such as "finished" or "processing" (which appeared in early drafts) maps to `done` and `in_progress` respectively.

### 6.2 Custom-only: `agreement_state`

`agreement_state` tracks pre-production agreement with the buyer and is separate from the main lifecycle.

| Value | Meaning | Russian UI label |
|---|---|---|
| `pending` | Brief received; awaiting confirmation of price/scope | «ожидает подтверждения» |
| `confirmed` | Buyer agreed; shoot may proceed confidently | «подтверждено» |
| `rejected` | Buyer declined; operator will usually move the task to `cancelled` | «отклонено» |

Rules:

- Present only on `custom`.
- Nullable at all times.
- Rendered as a sub-chip on the card while it is still operationally active.
- Not used on `content_task` or `note`.

### 6.3 Transition rules

Server-side FSM (`lib/fsm/taskStatus.ts`) remains permissive for the trusted 5-person team.

**Custom:**

- Forward: `draft → in_progress → done → delivered`
- Cancel: any non-terminal → `cancelled`
- Reopen: `cancelled → draft`
- Rollback one step: `delivered → done`, `done → in_progress`, `in_progress → draft`

**Content-task and Note:**

- Forward: `draft → in_progress → done`
- Cancel: any non-terminal → `cancelled`
- Reopen: `cancelled → draft`
- Rollback one step: `done → in_progress`, `in_progress → draft`
- Attempting `done → delivered` on a non-Custom is rejected server-side and would also fail the DB CHECK

### 6.4 Feed visibility rules

The default feed surfaces **active** work. “Active” is type-specific and now aligned to the PRD status model:

| Type | Active unless |
|---|---|
| `custom` | `status IN ('delivered', 'cancelled')` |
| `content_task` | `status IN ('done', 'cancelled')` |
| `note` | `status IN ('done', 'cancelled')` |

Implications:

- A `custom` task at `done` stays in the active feed because it still has operational value until it reaches `delivered`.
- `content_task` and `note` leave the active feed at `done`.
- `delivery_state` does not exist anywhere in the read or write logic.

**Completed-work visibility in MVP.**

The PRD explicitly says the team needs to see what is done, so completed cards do not disappear entirely. Each topic section therefore includes a collapsed **“Recently completed”** subsection:

- `custom` rows with `status = 'delivered'`
- `content_task` and `note` rows with `status = 'done'`
- Window: last 7 days by `updated_at`, newest first
- Default state: collapsed

**Filter behaviour** (`Все` / `Просрочено` / `Сегодня` / `На неделе`):

- `Все` = active cards plus the per-topic collapsed “Recently completed” subsection
- Deadline filters apply to active cards with non-null `deadline_on`
- Cancelled tasks do not appear on the main screen in MVP

### 6.5 Feed rendering rules

#### Sort order within each topic

Active cards are sorted:

1. `priority` — `high` > `medium` > `low` > NULL
2. `deadline_on` — earlier first, NULLs last
3. `updated_at` DESC — tiebreaker

Reference SQL shape:

```sql
ORDER BY
  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
  deadline_on ASC NULLS LAST,
  updated_at DESC
```

The "Recently completed" subsection (per §6.4) sorts by `updated_at` DESC only.

#### Deadline chip colors

Computed against "today" in `Europe/Moscow`:

| State | Condition | Chip |
|---|---|---|
| Overdue | `deadline_on < today` | red |
| Imminent | `today ≤ deadline_on ≤ today + 3` | amber |
| Comfortable | `deadline_on > today + 3` | green |
| None | `deadline_on IS NULL` | no chip |

Label text (Russian, with correct plural forms):

- Overdue: «просрочено N дней» / «N день» / «N дня»
- Imminent & Comfortable: «сегодня» / «завтра» / «через N дней»

Plural selection uses the standard Russian rule (1, 2–4, 5+) — a small helper is sufficient; no i18n framework.

#### Filter semantics and timezone

All "today" / "this week" math is computed server-side in `Europe/Moscow`. The client does not send a timezone; the server resolves it from app config.

| Filter | SQL predicate (active cards only) |
|---|---|
| `Все` | no extra predicate; includes collapsed Recently Completed per topic |
| `Просрочено` | `deadline_on < today_msk` |
| `Сегодня` | `deadline_on = today_msk` |
| `На неделе` | `deadline_on BETWEEN today_msk AND today_msk + 6` (inclusive) |

Overdue tasks are **not** also shown in `Сегодня` — the filters are disjoint by intent.

#### Money display (Custom only)

Rendered on card and detail view:

| `payment_model` | Collection state | Display |
|---|---|---|
| `full` | — | `$X` |
| `unlock` | partial (`amount_collected_cents < amount_cents`) | `$Y / $X · unlock` |
| `unlock` | complete (`amount_collected_cents = amount_cents` or NULL) | `$X · unlock` |

Amounts render from `amount_cents / 100` with a `$` prefix and no decimal when the value is a whole dollar (`$100`, `$230`, not `$100.00`).

#### Currency

USD only in MVP. No locale switching, no currency selector, no FX. The `$` prefix is hard-coded in the money renderer.

### 6.6 Task creation form

#### Entry point

Dedicated page at `/new`. Not a modal.

Reasons: deep-linkable, works cleanly on mobile Safari, native back-button returns to the feed, and avoids modal focus-trap / scroll issues on small screens. The `+ Новая ТЗ` button in the sticky header links here.

#### Type selector

Three segmented buttons at the top of the page: `Custom` / `Content` / `Note`. Switching types swaps the visible field set below; common fields already filled (`title`, `topic_id`, `priority`, `deadline_on`, `description`) are preserved.

#### Fields per type

Fields marked `*` block submission until filled.

**Custom**

- Topic* — dropdown from `topics`; default last-used by current user or `Customs`
- Title*
- Buyer handle* — free text
- Buyer display name — free text; optional
- Platform* — dropdown `Fansly` / `OnlyFans` / `Other` (`Other` reveals a free-text input); default last-used
- Payment model* — toggle `Full` / `Unlock`; default `Full`
- Total amount, $* — numeric, integer dollars in UI (stored as cents)
- Collected, $ — numeric, default `0`
- Duration min, minutes — numeric, optional
- Duration max, minutes — numeric, optional; if equal to min, the card renders a single value («5 мин»), otherwise a range («4–5 мин»)
- Priority* — `Высокий` / `Средний` / `Низкий`; default `Средний`
- Deadline* — date picker (date granularity only)
- Agreement state — `ожидает` / `подтверждено` / `отклонено`; default `ожидает`
- Description — multi-line, optional
- Attachments — URL attachments always; image attachments gated by §7.3.1

**Content**

- Topic*
- Title*
- Requester* — dropdown from Better-Auth users
- Assignee — dropdown from users; defaults to Лора and may be hidden in MVP while she is the sole assignee
- Priority*
- Deadline*
- Description
- Attachments

**Note**

- Topic*
- Title*
- Description
- Deadline — optional
- Priority — optional

#### Smart defaults

- Topic — last topic the current user created a task in (per-user, per-type memory)
- Platform (Custom) — last platform the current user used
- Priority — `medium`
- Agreement state (Custom) — `pending`
- Payment model (Custom) — `full`

#### Validation

- Zod schemas live in `lib/validation/` and are shared between client-facing forms and server actions where useful.
- Client shows inline errors under the field on blur and on submit.
- Submit button stays disabled until all required fields are valid.
- Error messages are in Russian, short, and actionable («Укажите ник покупателя», «Сумма должна быть больше 0»).

#### Post-save behavior

On success, navigate to `/` and briefly highlight the newly created card (~1.5s subtle background flash). No "Save and add another" in MVP — entries are one-at-a-time.

On server-side failure (validation or transport), show an inline toast with a Russian message and keep form state so the operator can fix and retry.

#### Attachments during creation

- URL attachments are accepted and saved with the task on submit.
- Image attachments stay disabled in the UI until §7.3.1 EXIF stripping ships. Attempts to upload before then show a short inline hint: «Загрузка картинок временно недоступна».

### 6.7 Task detail view

Detail is a **separate route**: `/task/[id]`. Not a modal.

Reasons:

- Deep-linkable — pasteable into Telegram and shared with the team
- Native back-button behavior on mobile Safari
- Survives full-page reload without losing URL context

Detail page responsibilities:

- Render all task fields grouped by relevance (identity → money/agreement for Custom → timing → description → attachments)
- Expose the FSM controls (status transitions, cancel, reopen; agreement state for Custom)
- Allow editing individual fields or entering a single "Редактировать" mode — either is acceptable, but every mutation must go through the server actions in §10
- Show the most recent `task_events` entries (audit log) at the bottom, collapsed by default

### 6.8 UI copy, empty and error states

**Copy.** All UI copy is Russian, inlined directly in the source. No i18n framework ships in MVP.

**Empty states.**

- Empty topic section (filtered out or genuinely empty): one muted line — «Пока ничего.»
- Empty filter result (e.g., `Просрочено` with no overdue tasks): same muted line, scoped to the filtered view
- First-ever load with no tasks at all: «Пока ничего. Добавьте первую ТЗ через кнопку ‘Новая ТЗ’.»

**Error states.**

- Server action failure: inline toast with a short Russian message and a «Повторить» action.
- Route-level uncaught error: standard Next.js `error.tsx` boundary showing «Что-то пошло не так.» and a «Обновить» button.
- 404 (unknown task ID): «Такой задачи нет или её удалили.»
- `changeStatus` returning 409 (OCC stale per §9.3): show «Задачу только что изменили. Обновляем…» and refetch the affected card automatically.

### 6.9 Design direction

**Aesthetic.** The target look is **Anthropic / Claude** — warm, literary, considered. Cream surfaces, a single terracotta accent, serif headings paired with a clean sans-serif body, generous whitespace, subtle paper grain, soft 1px borders instead of shadows. It should read like a quiet well-set document, not a SaaS admin panel.

Reference sites for calibration: `claude.ai`, `anthropic.com`. Take tone and density from there, not from generic Material / Ant / Chakra UIs.

**Typography.** Fraunces (serif) for page and section titles, Inter (sans) for everything else. Both via Google Fonts. Use Fraunces' variable `opsz` axis for optically-sized large titles. Money and numeric counters use tabular numerals so columns align.

**Palette family.** Warm paper cream for surfaces, muted warm grays for text and borders, terracotta for the single accent color. Semantic chips in muted red / amber / green / gray — no brighter than a "stamped on letterhead" feel. Exact hex values are at the coder's discretion as long as the family and hierarchy hold.

**Geometry.** Soft card corners (not sharp, not fully rounded). Pills for chips and the primary CTA. **Borders, not shadows** — elevation is signaled only by subtle background shifts and border-tint changes. Generous padding inside cards; comfortable gaps between sections. Content is centered in a reading-width column on desktop and fills the screen with side padding on mobile.

**Surface texture.** A very subtle paper grain overlay on the body — enough to remove plastic flatness without being visible directly. Implementation (SVG noise / tiled texture / CSS) is coder's choice.

**Interaction.** Hovers tint borders and backgrounds, never transform scale or lift with shadow. Focus-visible outline in the accent color. Animations, if any, fade-and-rise; never bounce or overshoot. Respect `prefers-reduced-motion`.

**Anti-patterns.** These break the Anthropic/Claude feel — avoid them:

- Material-style drop shadows or hard `box-shadow` on cards
- Gradient backgrounds
- Bright primary-color icons (use accent terracotta or muted grays)
- Display fonts (Poppins, Montserrat, Nunito) — stick to Inter + Fraunces
- Emoji in UI copy
- Scale-on-hover transforms
- More than 4 semantic chip colors (red / amber / green / gray)
- Sharp 4–6px card radii — ours are softer
- Dark-mode-first thinking — MVP is light-only, warm paper

---

## 7. Attachments

### 7.1 Upload flow (images)

The target architecture is **browser upload via presigned URLs**, with the app server controlling every capability boundary:

1. Client requests an upload intent from a server action / route handler.
2. Server verifies the Better-Auth session, validates task ownership/context, MIME type, and size.
3. Server issues short-lived presigned upload instructions scoped to a task-specific object key or staging key.
4. A server-controlled pipeline strips EXIF via `sharp` or equivalent before the canonical image object is accepted into MinIO.
5. Only after that pipeline succeeds does the app register the `attachments` row and emit `task_events('attachment_added')`.

The exact staging mechanism is not product-significant. What is locked is the acceptance rule:

- The browser uses presigned upload capabilities, not long-lived storage credentials.
- The canonical object stored in MinIO must be server-sanitized.
- No `attachments` row may point at an image that has not passed the EXIF-stripping gate.

### 7.2 Read flow

The read path is fixed:

- The app server signs MinIO object keys into **short-lived presigned download URLs**.
- The browser downloads attachment bytes **directly from MinIO** using those URLs.
- Attachment reads are **never** proxied through `next/image`.
- Attachment reads are **never** proxied through any image optimizer.
- The app server may sign URLs; it does not sit in the hot path for image bytes.

Other constraints:

- Use plain `<img>` elements for attachment images.
- Do not server-fetch attachment bytes for thumbnails, resizing, or metadata enrichment in MVP.
- Static decorative assets in `/public` may still use normal Next.js asset handling; the “no optimizer” rule applies specifically to attachment media.

### 7.3 Limits

- Formats: `jpeg`, `png`, `webp`
- Max size per image: **20 MB**
- Max attachments per task: **10**
- No video in MVP

### 7.3.1 EXIF stripping — mandatory and launch-blocking

EXIF stripping is a hard requirement, not a backlog nicety.

- EXIF stripping is mandatory before any image is accepted.
- It must be implemented server-side via `sharp` or an equivalent library.
- The image-upload UI remains disabled until this pipeline is live and verified.

Operational rule:

- URL attachments may ship first.
- Image attachments do **not** ship until EXIF stripping is proven end to end locally (upload a known-EXIF-heavy image, verify MinIO object has no EXIF).

### 7.4 URL attachments

Any `http/https` URL is allowed. Validate with the native `URL()` constructor. No link-preview generation in MVP.

---

## 8. Auth

### 8.1 Flow

Auth is application-local and email-free. The ~5-person team does not need email OTP, magic links, password recovery, or any SMTP integration.

- **Better-Auth runs inside the Next.js app** and owns the session layer (cookies, CSRF, session rows in Postgres).
- **Sign-in is by personal login code.** Each user has a single opaque code (~8 URL-safe characters). The login page is one input: paste code → session starts.
- **No email in the loop.** No SMTP container, no SMTP secrets, no email provider.
- **Codes are stored hashed.** The user row holds `login_code_hash` (bcrypt or argon2id). The plaintext code is shown only once at generation time (§8.2) and never persisted in the DB or logs.
- **Rate limiting** on the login route: at most 5 attempts per IP per minute; lockout window doubles on repeated violations. Failed attempts do not reveal whether a code exists.

Login flow at runtime:

1. User hits `/login`, pastes their code, submits.
2. Server iterates over active user rows, compares the submitted code against each `login_code_hash` via a constant-time comparator. (For 5 users this is trivially fast; no index gymnastics needed.)
3. On match, Better-Auth issues a session cookie and redirects to the feed.
4. On mismatch, show a generic «Неверный код» and increment the rate-limit counter.

### 8.2 Access model

No self-service public signup.

- MVP access is for a small known team.
- Arbitrary public registration must be impossible.
- Owner provisions users via a local CLI command: `pnpm user:add <name>`.
  - The command inserts a row into the Better-Auth user table in the local environment selected by `.env.local` / the documented env file.
  - The command generates a fresh random code, stores its hash, and **prints the plaintext code to the terminal once** for the owner to hand off to the user (e.g., via Telegram DM).
  - The plaintext is not logged, not emailed, and not recoverable after that single print.
- Rotation: `pnpm user:rotate-code <name>` invalidates the old hash and prints a new code.
- Removal: `pnpm user:remove <name>` soft-deletes the user so historical `task_events.actor_id` references stay valid.
- No public admin UI ships in MVP.

### 8.3 Session posture

- ~30-day rolling session — a user re-enters their code roughly monthly.
- Logout is explicit (a button in the header or settings).
- Better-Auth session rows are the authoritative session store.
- Sessions are invalidated automatically when a user's code is rotated or the user is removed.

### 8.4 Audit attribution

Every mutation captures the authenticated Better-Auth user ID and writes it explicitly into:

- `tasks.created_by`
- `tasks.last_edited_by`
- `task_events.actor_id`

Rules:

- Do not use DB defaults for actor attribution.
- Server code, not the client, decides who the acting user is.

Because every user has their own code, each action is attributable to a specific team member even though the login UX has no email / username field.

---

## 9. Realtime & concurrency

### 9.1 Subscription model

Realtime is implemented with **Postgres `LISTEN/NOTIFY` plus a lightweight Next.js SSE endpoint**.

Shape:

- Mutations commit in Postgres.
- The write path emits a compact invalidation event (task ID, topic ID, reason) via `NOTIFY`.
- A small server-side listener in the app process fans those invalidations out through SSE.
- Browsers keep one `EventSource` connection open to the SSE endpoint and refetch affected UI data when events arrive.

Why this shape:

- No dedicated realtime service is required
- The DB remains the source of truth
- The browser still does not talk to the DB directly

Attachments use the same invalidation path as tasks. No separate client subscription model is needed for MVP.

### 9.2 Resilience

- On `window.focus`, client refetches the visible feed.
- On SSE reconnect, client refetches.
- Missed events degrade to stale UI briefly, not data loss.

### 9.3 Optimistic concurrency on status

Status is the highest-value concurrent field, so it remains OCC-gated:

```
changeStatus({ task_id, new_status, expected_updated_at })
  ↓
UPDATE tasks
  SET status = $new, last_edited_by = $uid
  WHERE id = $task_id AND updated_at = $expected
  RETURNING *
  ↓
if 0 rows affected → respond 409 { conflict: "stale" }
```

Client behaviour on `409`:

- Show “changed elsewhere, reloading”
- Refetch the affected card or feed segment

### 9.4 Last-write-wins elsewhere

All other editable fields use last-write-wins. The trusted-team context plus near-realtime invalidation makes that acceptable in MVP.

---

## 10. Server-authoritative writes

Concrete server actions / route handlers exposed by the UI layer:

| Action | Purpose | Notes |
|---|---|---|
| `createTask(input)` | Insert new task | Zod-validated; emits `task_events('created')` |
| `updateTask(id, patch)` | Patch non-status fields | |
| `changeStatus(id, new_status, expected_updated_at)` | OCC-gated status transition | FSM-validated |
| `setAgreementState(id, new_value)` | Custom-only agreement update | Reject on non-Custom |
| `cancelTask(id)` | Shortcut to `cancelled` | Emits `task_events('cancelled')` |
| `reopenTask(id)` | `cancelled → draft` | Emits `task_events('reopened')` |
| `createUploadUrl(...)` | Returns presigned upload instructions | Session + file validation required |
| `registerAttachment(...)` | Inserts attachment row after acceptance checks | Must verify EXIF-safe image path |
| `deleteAttachment(id)` | Removes attachment row and storage object | Emits `task_events('attachment_removed')` |

Rules common to all of them:

- Verify Better-Auth session first
- Validate with Zod
- Use Drizzle transactions
- Set actor/audit fields server-side
- Emit `task_events`
- Emit the realtime invalidation signal after successful commit

---

## 11. Ingestion API — deferred to v2

**Not in MVP.** The Telegram-bot ingest path (`POST /api/v1/ingest/tasks` with HMAC auth, idempotent upsert, `first_human_edit_at` conflict regime, provenance columns) is out of scope for MVP and will be designed and shipped together with the v2 bot.

When the bot lands, the needed shape will likely include:

- An endpoint under `/api/v1/` with HMAC-signed requests and a timestamp skew window.
- Idempotency keys: natural `(tg_chat_id, tg_message_id, fragment_id)` plus `external_id` fallback.
- A `first_human_edit_at` gate so bot updates never overwrite human edits.
- Provenance columns (`source`, `tg_*`, `raw_text`, `external_id`) added back to `tasks` and `attachments` via migration.
- Audit events for `created`, `bot_updated`, and `ingest_rejected`.

None of the above exists in the MVP schema. Do not scaffold it now.

---

## 12. Development environment & migrations

Only one environment is in scope for MVP: local development on the owner's macOS machine. Production deployment is deferred (§12.2).

### 12.1 Local development (macOS)

This is the **only** environment the MVP coder targets.

- **Owner's macOS machine**, **Docker Desktop** required
- `docker compose -f docker-compose.dev.yml up -d` runs local **Postgres + MinIO**
- `pnpm dev` runs Next.js on `localhost:3000`
- `.env.local` points to local Postgres and MinIO
- No Caddy, no TLS, no domain wiring

Local auth/runtime implications:

- Better-Auth runs inside Next.js
- Sessions live in local Postgres
- Presigned URL logic targets local MinIO
- Real data is not required; fixtures are enough

### 12.2 Production deployment — deferred

Not in MVP scope. When the team is ready to ship, deployment design (VPS provider, domain, Caddy/Docker compose for prod, TLS, ops hardening, backups, secrets layout, deploy flow) will be added as a new section.

For now: keep the app future-deployable without building deployment tooling. Concretely this means:

- All runtime config reads from environment variables (no hard-coded `localhost`, no hard-coded ports in business code).
- The app does not assume a specific hostname or TLS setup.
- Sessions, presigned URLs, and Better-Auth cookies work correctly over HTTPS — but the coder does not need to verify this in prod-like conditions yet.
- No production-only code paths beyond what a real deploy would need.

### 12.3 Migrations workflow

- Author migrations locally via `drizzle-kit generate`.
- Commit the generated SQL artifacts to the repo.
- Apply locally via `drizzle-kit migrate`.

Rules:

- Migrations are forward-only.
- No destructive reset command runs against anything that holds real data.
- Better-Auth schema changes follow the same committed-migration discipline.

### 12.4 Seed data

- Topics from §5.
- Fixture tasks covering all 3 task types and major status paths.
- No real buyer names in seed data.
- No real attachment media in dev.

### 12.5 Secrets (local dev)

Local `.env.local` holds:

| Secret / config | Purpose |
|---|---|
| Postgres connection string | App + migrations |
| Better-Auth secret(s) | Session signing / auth integrity |
| MinIO endpoint / region / access key / secret key / bucket | Presigned object access |

Login codes are **not** a secret in this table — they live per-user in the DB as `login_code_hash` (§8.1) and are handed off out-of-band (Telegram DM from the owner to the team member).

`.env.local` is gitignored. No production secrets exist in MVP because there is no production yet.

---

## 13. Observability

MVP observability is deliberately minimal: local Docker logs + console + DB inspection as needed. No external error tracker, no uptime monitor, no analytics. Production observability will be designed together with the deployment (§12.2).

### 13.1 Runtime logs

- `docker logs` and console output are enough for local dev.
- Structured app logs (Pino or similar) for route handlers and server actions — human-readable, no external aggregator.

**Logging safety rules** (apply unconditionally, not just when shipping to an external sink):

- Do not log presigned URLs.
- Do not log MinIO object keys / paths.
- Do not log attachment filenames or captions.
- Do not log request bodies for attachment endpoints.
- Prefer stable error codes and opaque IDs over content-bearing messages when logging task data (titles, descriptions, buyer info).

### 13.2 Database inspection tools

Use external tools as needed:

- **TablePlus**
- **Drizzle Studio**
- **pgAdmin**

Reactive debugging only; not part of the product runtime.

### 13.3 Explicitly deferred (post-pilot / alongside prod deploy)

- External error tracker (Sentry or similar)
- External uptime monitor (UptimeRobot or similar)
- Self-hosted `uptime-kuma`
- Product analytics
- External log aggregation
- APM / distributed tracing
- User behaviour telemetry
- GitHub Actions deploy automation
- Health-check endpoint for prod monitors

---

## 14. System overview & key flows

### 14.1 Component diagram (local dev)

```
┌───────────────────────────────────────────────────────────────┐
│                Browser (localhost:3000)                       │
└──────────────────────────┬────────────────────────────────────┘
                           │ HTTP
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  Dev machine (macOS) · Docker Desktop                         │
│                                                               │
│  ┌───────────────────────────┐   ┌──────────────────────────┐ │
│  │ Next.js 15 (pnpm dev)     │   │ MinIO (docker)           │ │
│  │ - App Router pages        │   │ - private bucket         │ │
│  │ - Better-Auth (sessions)  │   │ - presigned object access│ │
│  │ - server actions          │   └──────────────────────────┘ │
│  │ - SSE endpoint            │                                │
│  └──────────────┬────────────┘                                │
│                 │ Drizzle                                     │
│                 ▼                                             │
│        ┌───────────────────────┐                              │
│        │ Postgres 18 (docker)  │                              │
│        │ - app tables          │◄── LISTEN/NOTIFY ──► SSE     │
│        │ - Better-Auth tables  │                              │
│        └───────────────────────┘                              │
└───────────────────────────────────────────────────────────────┘
```

No production components in MVP. No Caddy, no TLS, no VPS, no external services.

### 14.2 Reference data flows

1. **Feed render.** Browser → Next.js → Drizzle against Postgres → app signs MinIO object keys into short-lived presigned URLs → HTML / RSC payload → client hydrates → client opens SSE stream for invalidation updates.

2. **Create task.** Form → `createTask` server action → Better-Auth session check → Zod → Drizzle INSERT with explicit `created_by` → `task_events('created')` → `NOTIFY` → SSE fanout.

3. **Upload image.** Client → server action to request upload intent → short-lived presigned upload capability → server-controlled EXIF stripping pipeline → `registerAttachment` only after the sanitized canonical object exists → `task_events('attachment_added')` → `NOTIFY` → SSE fanout. Until that pipeline is verified, image-upload UI stays disabled.

4. **Change status.** Client → `changeStatus(id, new, expected_updated_at)` → FSM validation → OCC UPDATE in Postgres → success emits `task_events('status_changed')` and invalidation; stale write returns `409`.

---

## 15. Open questions and resolved decisions

### 15.1 Still open

Nothing blocks MVP code. All deploy-time decisions are deferred until the deploy phase (§12.2).

### 15.2 Still open — v2 (non-blocking for MVP)

3. **TG media policy.** Stay with "link, don't mirror" until a real problem forces MinIO mirroring?
4. **Fragment keys.** Bot-assigned deterministic `fragment_id` is still the recommended shape; confirm.
5. **Bot runtime.** Python rewrite vs TypeScript implementation sharing validation types.
6. **TG edit semantics.** Edited Telegram message updates the same card or creates a new audit-only event?

### 15.3 Resolved on 2026-04-19 (v4 patch)

| Question | Resolution | Where it lives |
|---|---|---|
| Canonical topic list | 9 topics: `customs / sets / life / fyp / ppv / sextings / reddit / instagram / pictures` | §5 |
| Topic-to-Telegram mapping | App topics independent of TG; `tg_topic_id` optional | §4.2 |
| Adding new topics | Owner-operational (Drizzle seed or direct SQL); no admin UI in MVP | §4.2 |
| Priority vocabulary | 3 levels: `low` / `medium` / `high` | §4.1 |
| Deadline granularity | Date-only (`deadline_on date`); no time-of-day | §4.3 |
| Duration fields | Structured `duration_min_seconds` / `duration_max_seconds` | §4.3 |
| Content-task money | No money fields on `content_task` | §4.3 |
| Note visibility | Team-shared; no private notes | §4.3 |
| Buyer naming | Split: `buyer_handle` (required) + `buyer_display_name` (optional) | §4.3, §6.6 |
| Auth flow | Per-user login code (hashed at rest); no email, no SMTP | §8.1 |
| User provisioning | CLI `pnpm user:add <name>` prints a fresh code once; `user:rotate-code`, `user:remove` | §8.2 |
| Production deployment | **Deferred entirely.** Local-dev-only in MVP; VPS/domain/Caddy/TLS/compose/backups/monitoring all designed when the team is ready to ship | §12.2 |
| Ingest API in MVP | **Deferred to v2.** Endpoint, HMAC secret, provenance columns, bot-related event types will be added with the bot | §11 |
| Topic prominence | Dropped — all topics render equally | §4.1, §4.2, §5 |
| Hard delete | Not in MVP — `cancelled` only | §6.3 |
| Pending-delivery bloat | Do nothing in MVP; revisit after 2-week pilot | §6.4 |
| Sort within topic | `priority DESC (high→low→null), deadline_on ASC NULLS LAST, updated_at DESC` | §6.5 |
| Deadline chip colors | Red = overdue · Amber = today..today+3 · Green = >today+3 (MSK) | §6.5 |
| Filter timezone | `Europe/Moscow`, resolved server-side | §6.5 |
| Unlock money display | Full: `$X` · Unlock partial: `$Y / $X · unlock` · Unlock complete: `$X · unlock` | §6.5 |
| Currency | USD only, `$` prefix, integer dollars | §6.5 |
| Task creation form | Page `/new`, typed field sets, smart defaults, Russian inline validation | §6.6 |
| Task detail view | Separate route `/task/[id]`; not a modal | §6.7 |
| UI copy language | Russian, inline; no i18n framework | §6.8 |
| Empty state | «Пока ничего.» | §6.8 |
| Error state | Next.js `error.tsx` boundary + «Обновить» action | §6.8 |

---
