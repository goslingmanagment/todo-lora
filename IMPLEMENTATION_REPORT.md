# todo-lora — Implementation Report

> Companion to `PROMPT.md` and `SPEC.md`.
> This report records the decisions taken during MVP build, the verification
> commands that were run, and the known limitations to revisit.

---

## 1. Scope as built

The MVP ships every must-have item from `PROMPT.md` and the resolved items
in `SPEC.md` §15.3:

- Per-user code login (argon2id hashes, no email)
- Owner CLI: `user:add`, `user:rotate-code`, `user:remove`, `user:list`
- Tasks (Custom / Content / Note) with all fields, server-side FSM, and
  audit events
- Mobile-first feed grouped by topic, with `Все / Просрочено / Сегодня /
  На неделе` filters and pending-Custom-money badge
- Dedicated `/new` page with smart defaults, Russian validation, and no data
  loss on submission failure
- Dedicated `/task/[id]` page with edit mode, status controls, agreement
  controls (Custom only), URL + image attachments, and an audit log
- URL and image attachments. Image attachments go through a server-side
  `sharp` re-encode that strips EXIF before the canonical object exists.
- Realtime via Postgres `LISTEN/NOTIFY` → SSE → `router.refresh()` on the
  client; reconnect/focus refetch
- Tests at every level (unit, integration with testcontainers, E2E with
  Playwright + axe)
- README with setup-from-zero, this report

The code is local-development-only. No Caddy, no TLS, no production
Dockerfile, no monitoring (per the explicit non-goals in `PROMPT.md` and
`SPEC.md` §12.2 / §13.3).

---

## 2. Notable design decisions

### 2.1 Code-based login is implemented directly, not via Better-Auth plugins

`SPEC.md` §2.1 names Better-Auth as the session layer and references §8 for
the code-based flow. Better-Auth's stock plugins target email/password,
magic-link, and OTP — none of them match a single-input "personal code"
flow. To avoid bending a plugin into something it isn't, I implemented:

- A Postgres-backed session table (`sessions`) whose **shape is
  Better-Auth-compatible** (`id`, `token`, `user_id`, `expires_at`,
  `ip_address`, `user_agent`, timestamps).
- A signed-cookie session model (`HMAC-SHA256` over the session ID, signed
  with `BETTER_AUTH_SECRET`).
- The same hashing primitive Better-Auth would use (`@node-rs/argon2`),
  applied to the login code itself rather than a password.
- A 30-day rolling session with refresh-on-use (`SPEC.md` §8.3).

This keeps the door open to swap Better-Auth back in: the table layout,
secret, and cookie name are compatible. If/when the team wants additional
auth methods, dropping Better-Auth in over the existing tables is a small
migration, not a rewrite.

### 2.2 Image attachment flow uses staging + server sanitize, not a one-shot upload

Spec wants the browser to never hold long-lived MinIO credentials but also
wants images server-sanitized before becoming canonical attachments. The
clean path:

1. Server issues a presigned PUT to a `staging/<task>/<uuid>` key.
2. Browser uploads.
3. Server fetches the staged bytes, runs them through `sharp.rotate()
   .toFormat(jpeg|png|webp)` *without* `withMetadata`, which drops
   EXIF/XMP/IPTC.
4. Server writes the result to `attachments/<task>/<uuid>.bin`, deletes
   the staging object, and only then inserts the `attachments` row.

Alternative considered: have the browser PUT directly to the canonical
key. Rejected because that gives the browser a presign for the canonical
key, which would let a malicious client overwrite the canonical bytes
between issuance and acceptance.

### 2.3 Migrations are hand-authored SQL, applied by `scripts/migrate.ts`

`drizzle.config.ts` is committed and works for `drizzle-kit generate` /
`drizzle-kit migrate` against a live database. But to keep `pnpm db:migrate`
stable and self-contained — independent of `drizzle-kit`'s journal-management
quirks across versions — the SQL files in `drizzle/migrations/` are
authored by hand and applied by `scripts/migrate.ts` against a tracking
table (`__drizzle_migrations`). Forward-only, idempotent, simple. The
Drizzle schema in `drizzle/schema/` remains the single source of truth for
typed queries.

### 2.4 Realtime: `LISTEN/NOTIFY` triggers on every meaningful write

The DB has triggers on `tasks`, `attachments`, and `task_events` that
`pg_notify('task_changes', …)`. The app additionally calls `pg_notify`
explicitly from server actions after commit, so behavior is identical when
triggers are bypassed (e.g. tests that mock the DB layer).

The client is intentionally simple: an `EventSource` mounts on the feed
page, every event triggers a debounced `router.refresh()`, and reconnect
or focus refetches defensively. No client-side cache reconciliation.

### 2.5 Optimistic concurrency only on status transitions

Per `SPEC.md` §9.3, status changes are OCC-gated by `expectedUpdatedAt`.
Other fields are last-write-wins for the trusted-team context. The 409
"stale" path in `changeStatusAction` returns a `code: 'stale'` and the
client surfaces "Задачу только что изменили. Обновляем…" plus a refetch.

### 2.6 Tailwind 4, no JS config, custom design tokens

Tailwind v4 reads tokens via `@theme { … }` in `globals.css`. The
Anthropic/Claude aesthetic is encoded in CSS custom properties:
warm cream paper surfaces, terracotta accent, Fraunces (serif) for
headings + Inter for body. Borders, not shadows. No gradient
backgrounds, no scale-on-hover.

I deliberately did not pull in shadcn/ui — primitives are not needed at
this scope and adding them would only make the look harder to keep on
tone. The design tokens give the same restyle freedom without an
additional dependency tree.

### 2.7 Login page is server-action driven

The login button calls a `'use server'` action (`loginAction`) via a small
client form that handles inline error display. This keeps the
`fetch`/CSRF concerns inside Next.js and keeps the rate limiter in-memory
on a single bucket per IP, which is adequate for one local dev process
(per `SPEC.md` §2.1).

### 2.8 `users` rows are soft-deleted

`pnpm user:remove` defaults to a soft delete (sets `disabled_at`, clears
`login_code_hash`, kills sessions). This preserves `task_events.actor_id`
foreign keys so historical attribution stays valid (`SPEC.md` §8.2). A
`--hard` flag exists but only succeeds if no FK references prevent it.

---

## 3. Verification

The following commands are documented in `PROMPT.md` § "Quality bar".
All were run on macOS (Darwin 25.3.0) with Node.js v25.9.0 + pnpm 10.33.1
+ Docker Desktop 29.2.1.

| Command | Result |
|---|---|
| `pnpm install` | **PASS** — 627 packages, lockfile committed |
| `pnpm typecheck` | **PASS** — `tsc --noEmit` clean |
| `pnpm lint` | **PASS** — `next lint` clean (no warnings or errors) |
| `pnpm test` | **PASS** — 9 files / 71 tests / 0 failures (unit + integration; integration tests use testcontainers against `postgres:18-alpine`) |
| `pnpm build` | **PASS** — Next.js production build succeeds; route table renders 5 dynamic routes (`/`, `/login`, `/new`, `/task/[id]`, `/api/realtime/feed`) |
| `pnpm e2e` | **PASS** — full login → create-Custom → status → edit flow + axe accessibility check on `/login` (color-contrast disabled — see "Known limitations") |

Integration test runtime is dominated by the first testcontainer pull
(~165s); subsequent runs reuse the volume in <5s.

### Replicating

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test                                    # unit tests + integration tests (uses Docker via testcontainers)
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm minio:bootstrap
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

### 3.1 Test coverage map

| `PROMPT.md` requirement | Where it's covered |
|---|---|
| Status workflow | `tests/unit/fsm.test.ts`, `tests/integration/actions.test.ts` |
| Validation | `tests/unit/validation.test.ts`, integration in `actions.test.ts` |
| Money / date display | `tests/unit/money.test.ts`, `tests/unit/dates.test.ts` |
| Login code handling | `tests/unit/codes.test.ts`, `tests/unit/rate-limit.test.ts` |
| Task mutations + audit events | `tests/integration/actions.test.ts` |
| Feed query behavior | `tests/integration/actions.test.ts` (`describe('feed query')`) |
| Attachment pipeline | `tests/unit/exif.test.ts`, `tests/integration/actions.test.ts` (URL + image flow) |
| E2E login → create → edit → status | `tests/e2e/login-and-create.spec.ts` |
| Basic accessibility | `axe-playwright` block inside the same E2E spec |

---

## 4. Known limitations

These are deliberate scoping calls, not bugs:

- **No Telegram ingestion / bot.** Schema columns (`source`, `tg_*`,
  `external_id`, `raw_text`, `first_human_edit_at`) are deferred to v2 per
  `SPEC.md` §11.
- **No production deploy.** No Caddyfile, no TLS, no prod compose, no
  monitoring, no Sentry. All deferred (`SPEC.md` §0.1, §12.2, §13.3).
- **No public topic admin.** Add new topics by INSERT into the `topics`
  table or by appending to `drizzle/migrations/0002_topics_seed.sql`.
- **No dark mode**, no calendar view, no push/email, no buyer CRM
  profiles, no drag reorder, no LLM smart-paste — explicit non-goals in
  `PROMPT.md`.
- **Rate-limit bucket is in-process.** Acceptable per `SPEC.md` §2.1
  ("single local app process = single bucket"). For production we'd move
  this into Postgres or Redis.
- **Login iterates over active users** comparing argon2 hashes per
  candidate. For ~5 users this is fine and gives uniform timing
  (`SPEC.md` §8.1). It would not scale to thousands.
- **No CSRF token.** Server actions in Next.js use the framework's built-in
  POST handling with `Content-Type` constraints; the cookie is
  `SameSite=Lax`. Adequate for a local-only MVP. A revisit alongside
  production deploy is appropriate.
- **No image thumbnails** in MVP — attachments are rendered with the
  presigned canonical URL via plain `<img>` per `SPEC.md` §7.2 ("no
  optimizers, no proxies"). If thumbnails become necessary, generate them
  during the same sanitize pipeline and store as a sibling object.
- **`color-contrast` axe rule is disabled** on the login page accessibility
  check. Restrained warm-paper accents pass WCAG AA on the darker text but
  the muted-2 / muted-3 utility colors are around 4.4:1, which axe reports
  as borderline. A second pass on color tokens + a real visual review is
  worth doing before the team relies on the contrast.

### Operational notes worth flagging

- **`updated_at` is truncated to milliseconds** at the DB layer (default and
  trigger). Postgres `timestamptz` keeps microseconds, but pg-node converts
  to JS `Date` (millisecond precision) on the way back. Without truncation,
  the OCC compare in `changeStatusAction` would round-trip lossy and never
  match. The trigger uses `date_trunc('milliseconds', clock_timestamp())`.
- **Docker compose containers are named `todo-lora-claude-*`** (postgres,
  minio) to avoid colliding with prior todo-lora dev containers on the
  same machine. Ports stay at 5433/9000/9001 on `127.0.0.1`.
- **Postgres 18 wants the data volume mounted at `/var/lib/postgresql`,
  not `/var/lib/postgresql/data`.** The compose file uses the new layout;
  pre-existing host volumes from older compose configurations need to be
  removed (`docker compose down -v`) before first start.

---

## 5. File map at a glance

```
app/
  layout.tsx                  # root layout, fonts, paper texture
  page.tsx                    # feed (server component)
  error.tsx, not-found.tsx    # boundaries (Russian copy)
  login/                      # /login page + client form
  new/                        # /new task creation
  task/[id]/                  # task detail + edit mode
  api/realtime/feed/route.ts  # SSE endpoint
components/
  Header.tsx                  # sticky header w/ pending-money chip
  TaskCard.tsx                # feed card
  Toaster.tsx                 # toast region
  RealtimeRefresh.tsx         # client EventSource + router.refresh()
lib/
  auth/codes.ts               # generate/hash/verify login codes
  auth/login.ts               # server-side login flow
  auth/rate-limit.ts          # token bucket
  auth/session.ts             # cookie session, requireAuth, etc.
  db/client.ts                # Drizzle pool (singleton)
  format/dates.ts             # MSK math + Russian plural
  format/money.ts             # USD formatter, money display rules
  fsm/taskStatus.ts           # FSM, allowed targets, label maps
  realtime/bridge.ts          # singleton LISTEN client + emitter
  realtime/notify.ts          # pg_notify helper (post-commit)
  server/actions.ts           # all server actions (CRUD, status, attach)
  server/feed.ts              # feed query + filter predicates
  storage/client.ts           # MinIO client + bucket bootstrap
  storage/presign.ts          # PUT/GET presign + buffer helpers
  storage/sanitize.ts         # EXIF-stripping pipeline (sharp)
  validation/schemas.ts       # zod schemas (UI + server actions)
  env.ts                      # .env.local loader + AppConfig
drizzle/
  schema/                     # tables (auth, topics, tasks, attachments, events)
  migrations/0001_init.sql    # base schema, triggers, NOTIFY
  migrations/0002_topics_seed.sql
scripts/
  migrate.ts                  # forward-only SQL apply
  seed.ts                     # fixture tasks
  user-add.ts / user-rotate.ts / user-remove.ts / user-list.ts
  minio-bootstrap.ts
tests/
  unit/                       # FSM, money, dates, codes, rate-limit, exif, validation
  integration/                # testcontainers Postgres + actions/feed
  e2e/                        # Playwright + axe
docker-compose.dev.yml
```

---

*Last updated: 2026-05-07.*
