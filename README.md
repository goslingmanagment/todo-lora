# todo-lora

Internal task tracker for the Лора content/custom workflow.

> MVP scope is **local development on macOS only.** No production
> deployment, no Caddy/TLS, no monitoring, no analytics. See `SPEC.md` §0–§1.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript strict
- Postgres 18 (Docker) — single source of truth
- MinIO (Docker) — S3-compatible object storage for image attachments
- Drizzle ORM + committed SQL migrations
- Code-based login (per-user codes, hashed with argon2id). Sessions are stored
  in Postgres in a Better-Auth-compatible table shape (`id` / `token` /
  `user_id` / `expires_at`) so we can swap Better-Auth in later if/when the
  team needs additional auth methods. We do not depend on the `better-auth`
  package today — see `IMPLEMENTATION_REPORT.md` §2.1.
- Postgres `LISTEN/NOTIFY` + SSE for realtime
- Tailwind CSS 4 + `next/font` (Fraunces + Inter) with custom design tokens
  (Anthropic/Claude aesthetic)
- Vitest + testcontainers + Playwright + axe

Target Node.js 22 LTS.

## Setup from zero

Prerequisites:

- macOS, **Node.js ≥ 22**, **pnpm 10**, **Docker Desktop running**

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file and (optionally) edit
cp .env.example .env.local
# Generate a fresh BETTER_AUTH_SECRET:
#   openssl rand -base64 48
# Paste it into .env.local

# 3. Start Postgres + MinIO
docker compose -f docker-compose.dev.yml up -d

# 4. Apply migrations and bootstrap the bucket
pnpm db:migrate
pnpm minio:bootstrap

# 5. (Optional) Seed demo tasks
#    Pass the display name of an existing user to assign as creator,
#    or omit to create a placeholder seed-owner.
pnpm db:seed

# 6. Provision a real user — prints the login code ONCE
pnpm user:add "Дмитрий"

# 7. Run the dev server
pnpm dev
```

Open http://localhost:3000, paste the printed code, and you're in.

## Daily commands

| Command                        | What it does                                                              |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`                     | Run Next.js on `localhost:3000`                                           |
| `pnpm db:migrate`              | Apply forward-only SQL migrations from `drizzle/migrations`               |
| `pnpm db:generate`             | Re-generate migration SQL from schema changes (drizzle-kit)               |
| `pnpm db:seed`                 | Insert the small demo task set if it is not already loaded                |
| `pnpm db:demo:clear`           | Delete demo tasks, including legacy fixture rows from the old seed script |
| `pnpm db:old-data:clear`       | Delete known stale local fixture/review tasks and their image objects     |
| `pnpm db:studio`               | Drizzle Studio (browser DB inspector)                                     |
| `pnpm minio:bootstrap`         | Create the configured bucket if missing                                   |
| `pnpm user:add "Name" [email]` | Provision a user; prints code once                                        |
| `pnpm user:rotate-code "Name"` | Rotate code; revokes old sessions                                         |
| `pnpm user:remove "Name"`      | Soft-disable a user                                                       |
| `pnpm user:list`               | List all users                                                            |
| `pnpm typecheck`               | `tsc --noEmit`                                                            |
| `pnpm lint`                    | `next lint`                                                               |
| `pnpm test`                    | Vitest (unit + integration)                                               |
| `pnpm build`                   | Production-optimized Next.js bundle (verification only)                   |
| `pnpm e2e`                     | Playwright E2E + axe-playwright                                           |

## Topics

The 9 starter topics are seeded automatically by migration `0002_topics_seed.sql`:
`Customs`, `Sets`, `Life`, `FYP`, `PPV`, `Sextings`, `Reddit`, `Instagram`,
`Pictures`. New topics can be added with a direct INSERT — no admin UI ships
in MVP (per `SPEC.md` §4.2).

## Two-window realtime test

Open `localhost:3000` in two browser windows logged in as the same (or
different) users. Create or edit a task in one — the other window updates
within ~1 s without manual refresh. See §9 of `SPEC.md` for the
LISTEN/NOTIFY → SSE design.

## Where things live

```
app/                       # Next.js App Router pages + route handlers
  page.tsx                 # main feed
  new/                     # /new task creation
  task/[id]/               # task detail
  login/                   # login form
  api/realtime/feed/       # SSE endpoint
components/                # reusable UI components
lib/
  auth/                    # codes, sessions, login flow, rate-limit
  db/                      # Drizzle client + transaction helper
  fsm/                     # status FSM (lib/fsm/taskStatus.ts)
  format/                  # money + date formatters
  realtime/                # LISTEN/NOTIFY bridge + emit helper
  server/                  # server actions + feed query
  storage/                 # MinIO client, presign, EXIF stripping
  validation/              # zod schemas shared by UI + actions
drizzle/
  schema/                  # Drizzle table definitions (typed source of truth)
  migrations/              # committed SQL artifacts (forward-only)
docker-compose.dev.yml     # local Postgres + MinIO
scripts/                   # CLI scripts (migrate, seed, user-*, minio-bootstrap)
tests/
  unit/                    # pure-fn tests (FSM, money, dates, codes, rate-limit, EXIF)
  integration/             # testcontainers-backed Postgres tests
  e2e/                     # Playwright + axe
```

## Auth

- Sign-in is **per-user login code** (`SPEC.md` §8). No email/SMTP, no public
  signup.
- Codes are stored only as argon2id hashes in `users.login_code_hash`.
- The plaintext is shown **once** at provisioning. If lost, rotate.
- Sessions live in Postgres (`sessions` table, Better-Auth-compatible shape).
- Logout clears both the session row and the cookie.

## Image attachments — EXIF policy

EXIF stripping is **mandatory** before any image becomes a canonical
attachment (`SPEC.md` §7.3.1). Flow:

1. Client requests a presigned PUT for a _staging_ key in MinIO.
2. Browser uploads the bytes directly to MinIO (no auth credentials in JS).
3. Server fetches the staged bytes, re-encodes via `sharp` (drops EXIF/XMP/IPTC,
   converts HEIC/HEIF to JPEG).
4. Server writes the canonical `attachments/<task>/<uuid>.bin` object,
   deletes the staging key, and inserts the `attachments` row.

## Money / dates

- USD only, integer dollars, `$` prefix (`SPEC.md` §6.5).
- All "today" and date-range filters are computed server-side in `Europe/Moscow`.
- Russian plural forms (день / дня / дней) handled by a small helper.

## Where the production deploy concerns went

Deferred entirely (`SPEC.md` §0.1, §12.2). When the team is ready to ship:
all runtime configuration is already environment-driven, and the app makes
no assumptions about the deployment topology.
