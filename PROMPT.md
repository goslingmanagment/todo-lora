# Build todo-lora MVP

Build **todo-lora** from scratch in this directory.

Read `SPEC.md` fully before coding. This prompt is the concise brief; `SPEC.md` is the detailed functional/technical contract. If this prompt and `SPEC.md` conflict, `SPEC.md` wins unless the prompt explicitly narrows scope.

This should be a complete local-development MVP, not a prototype shell. Choose the cleanest implementation approach yourself, but make sure the product works end-to-end.

Do not inspect or copy previous todo-lora implementations unless Dmitriy explicitly gives a separate instruction to do so.

## Product goal

todo-lora is an internal task tracker for Gosling Agency’s Лора content/custom workflow.

Telegram remains the discussion channel. This app is the operational source of truth for:

- what tasks exist,
- what is active / overdue / done,
- priorities and deadlines,
- Custom payment state / pending money,
- attachments and references,
- who changed what.

Users are a small trusted team, around 5 people. No complex permissions. Everyone can read/write everything, but every mutation must be attributable to the logged-in user.

## Target environment

MVP is **local development only** on Dmitriy’s macOS machine.

Required stack:

- Next.js App Router + React + TypeScript strict.
- Postgres in Docker.
- MinIO in Docker for attachments.
- Drizzle ORM with committed SQL migrations.
- Better-Auth or equivalent robust session layer stored in Postgres.
- Per-user login codes, no email/SMTP/public signup.
- Zod or equivalent validation.
- Server-side image EXIF stripping with `sharp` or equivalent.
- pnpm scripts and README for clean local setup.

Target Node.js 22 LTS.

## Scope: must ship in MVP

### Auth

- Login page with one personal code input.
- Owner CLI to add user, rotate code, and disable/remove user.
- Codes are printed once, stored only as secure hashes.
- Login is rate-limited and uses generic failure copy.
- Logout exists.
- No public registration.

### Tasks

Support 3 task types:

- `Custom`
- `Content task`
- `Note`

Core fields should cover:

- topic,
- title,
- description,
- status,
- priority,
- deadline,
- requester / assignee where relevant,
- Custom buyer/platform/payment/duration/agreement fields,
- created/updated timestamps,
- created_by / last_edited_by.

Seed these topics: Customs, Sets, Life, FYP, PPV, Sextings, Reddit, Instagram, Pictures.

Use a server-side status workflow:

- Custom: draft → in progress → done → delivered; can cancel, reopen, and roll back one step.
- Content/Note: draft → in progress → done; can cancel, reopen, and roll back one step.
- `delivered` is Custom-only and must be rejected for non-Custom tasks.

Every create/edit/status/attachment action writes an audit event.

### Main feed

The feed is the daily working surface.

It must:

- be vertical and mobile-first, not a horizontal board;
- group cards by topic;
- support filters: all, overdue, today, this week;
- compute dates server-side in Europe/Moscow;
- sort active work by priority, deadline, then recent update;
- keep done Custom tasks visible until delivered;
- show recently completed work without cluttering the active feed;
- make pending Custom revenue visible at a glance;
- have clear empty/error states in Russian.

### Task creation

Dedicated `/new` page, not a modal.

It must let an operator create Custom / Content / Note tasks quickly, with validation, sensible defaults, Russian errors, and no data loss if submission fails.

### Task detail

Dedicated `/task/[id]` page, not a modal.

It must show the full task, allow editing mutable fields, status transitions, agreement changes for Customs, attachment management, and recent audit history.

### Attachments

Support URL attachments and image attachments.

URL attachments: http/https only.

Image attachments:

- Browser must never receive long-lived MinIO credentials.
- Stored images must be server-sanitized before becoming canonical attachments.
- EXIF stripping is mandatory before image upload can be considered shipped.
- Use presigned URLs for object access.
- Do not use image optimizers/proxies for attachment media.
- Max 10 attachments per task; no video in MVP.

### Realtime

Changes should propagate between two open browser windows in local dev.

Use a simple reliable design, e.g. Postgres LISTEN/NOTIFY + SSE, or another local-friendly approach that keeps Postgres as source of truth.

Handle reconnect/focus refetch so missed events do not cause lasting stale UI.

## Explicit non-goals

Do not build or scaffold:

- Telegram ingestion / bot integration;
- production deployment;
- VPS/Caddy/TLS/backups/monitoring;
- Sentry/analytics;
- calendar view;
- push/email notifications;
- dark mode;
- buyer CRM profiles;
- drag reorder;
- multi-model support;
- public topic admin;
- LLM smart-paste parser.

## UX direction

Russian UI copy.

Light-mode, warm, minimal, Anthropic/Claude-like feel: calm cream surfaces, careful typography, subtle borders, restrained accent color. Avoid generic SaaS dashboard aesthetics.

Mobile-first reading, desktop-friendly writing.

Accessibility matters: labels, keyboard navigation, focus states, contrast, reduced-motion respect.

## Quality bar

Implement meaningful tests, not token tests.

Cover at least:

- status workflow;
- validation;
- money/date display;
- login code handling;
- task mutations and audit events;
- feed query behavior;
- attachment pipeline;
- basic E2E login/create/edit/status flow;
- basic accessibility check if practical.

Run and report:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

If a command cannot run because of local prerequisites, state exactly what was attempted and why it could not run.

## Deliverables

Build the app directly in this directory.

Include:

- source code;
- migrations;
- seed/bootstrap scripts;
- user CLI scripts;
- `.env.example`;
- `.gitignore`;
- Docker Compose for local Postgres + MinIO;
- README with setup from zero;
- `IMPLEMENTATION_REPORT.md` with decisions, verification results, and known limitations.

## Acceptance criteria

Dmitriy should be able to:

1. install dependencies;
2. start local Postgres + MinIO;
3. run migrations and seeds;
4. create a user code;
5. log in;
6. create Custom / Content / Note tasks;
7. see prioritized grouped feed, deadline filters, and pending Custom money;
8. open task detail, edit fields, change statuses, manage attachments, and see audit history;
9. open two browser windows and see realtime updates;
10. run the documented verification commands without hidden failures.

If you need to choose between two reasonable implementation paths, pick the simpler robust one and document the decision. Do not ask for clarification unless it blocks correctness or product scope.
