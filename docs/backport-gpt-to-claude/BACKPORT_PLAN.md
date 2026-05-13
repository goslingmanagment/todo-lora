# todo-lora — Backport Plan: GPT → Claude

**Base:** `/Users/dmitriy/code/todo-lora` (kept).
**Donor:** `/Users/dmitriy/code/todo-lora-gpt` (read-only).
**Posture:** copy code only when the GPT code is structurally clean and license-compatible. Adapt or reimplement when GPT's approach is sound but its visual style or implementation detail is bad. Do not port visual style, AWS-SDK storage path, the `local-demo` backdoor, or the app-only NOTIFY model.

---

## 1. Executive summary

- Both reviewers (engineering + product) pick **Claude as the base**. The engineering remediation list for Claude is short; for GPT it is long. Keep Claude.
- Several reviewer-flagged Claude blockers are still real today: leaked canonical `objectKey` on the client, unvalidated client-supplied `stagingKey`, attachment writes that don't bump `tasks.updated_at` / `last_edited_by`, status update non-atomic with its audit event, and a "weak update validation" path. These are **P0**.
- Two product-level GPT wins are worth porting deliberately: **multi-file/URL attachments at `/new`** and **server-side `user_preferences` for smart defaults**. These are **P1**, not blockers.
- A handful of cheap correctness/UX nits should be batched into a single small migration + PR: nonneg CHECK constraints, `cancel-from-delivered` removal, dead-code flash highlight wiring, optional empty-topic rendering, mobile Playwright project.
- The reviewer claim that `.env.example` is missing applies to the snapshots only — Claude's repo already ships `.env.example` and `.env.local`. Skip.
- Do **not** copy GPT's visual layer (icons, FeedView "Custom к оплате" card, terracotta accents in the form), GPT's `local-demo` seeded backdoor, GPT's AWS-SDK + custom-checksum-middleware MinIO path, GPT's app-only NOTIFY, or GPT's English `Note`/`Content` chip labels. Claude already wins on each.
- Defer GPT's repository-pattern refactor (`lib/tasks/repository.ts`) to **P2**. It's a good idea — fixes Claude's fat `lib/server/actions.ts` — but it has the largest blast radius and the smallest user-visible payoff.
- One genuinely unresolved ambiguity: GPT's empty-topic rendering matches SPEC §6.8 ("Пока ничего." per topic) but Dmitriy's product call may have been to keep Claude's de-cluttered UI. Flag for confirmation in §7.

---

## 2. P0 backports

### P0-1 — Stop leaking canonical `objectKey` to the client

**Why.** `app/task/[id]/page.tsx:69-78` passes `objectKey` into `TaskDetail`. The `TaskDetail` DTO at `app/task/[id]/TaskDetail.tsx:63` types it but never reads it. It's wasted bytes today and a footgun if anyone ever wires it into a download URL or a new server action — combined with **P0-2**, it's part of the `stagingKey == canonical key` attack surface flagged by codex-engineering. Spec §7.2 says the browser only ever sees presigned URLs.

**GPT reference.** GPT did not pass `objectKey` to its client component (`app/task/[id]/page.tsx:44-54` deliberately omits it).

**Claude target.**
- `app/task/[id]/page.tsx:69-78` — remove `objectKey` from the mapped attachment object (drop the line).
- `app/task/[id]/TaskDetail.tsx:59-68` — remove `objectKey` from `AttachmentDto`.

**Implementation shape.**
```ts
// app/task/[id]/page.tsx
attachments={attsWithUrls.map((a) => ({
  id: a.id,
  kind: a.kind,
  url: a.url,
  previewUrl: a.previewUrl,
  mimeType: a.mimeType,
  originalName: a.originalName,
  caption: a.caption,
}))}
```

**Tests/gates.**
- Add a unit/integration assertion in `tests/integration/actions.test.ts` (or a new `tests/integration/leak.test.ts`) that calls `getTaskById` → page-side mapping does not include `object_key`. A simpler regression: a Playwright test that asserts the rendered HTML (or `__NEXT_DATA__` payload) for `/task/[id]` does not contain the string `attachments/`.

**Risk.** Low. Field is unused on the client. No callers to fix.

---

### P0-2 — Validate `stagingKey` to prevent canonical-key abuse

**Why.** `lib/server/actions.ts:400-449` (`finalizeImageAttachmentAction`) accepts any non-empty `stagingKey` (`lib/validation/schemas.ts:196-202`), then `lib/storage/sanitize.ts:31-77` reads it and **deletes it** at the end. A malicious or buggy client can pass a canonical attachment key (e.g. `attachments/<otherTaskId>/<uuid>.bin`) and cause the server to (a) re-process someone else's image and overwrite it under a *new* canonical key the attacker controls, and (b) delete the original. Combine with the **P0-1** leak and the attack becomes trivial.

**GPT reference.** GPT has the same class of bug, but its staging keys are namespaced as `staging/<taskId>/...` (`lib/storage/s3.ts:167-170`). It doesn't validate the prefix in `finalizeImageAttachmentAction` either, but the namespace is at least consistent.

**Claude target.**
- `lib/storage/client.ts:STAGING_PREFIX` — already exports a `staging/` prefix.
- `lib/validation/schemas.ts:196-202` — tighten `stagingKey` regex to `^staging/<taskId>/[A-Za-z0-9._-]+$`.
- `lib/storage/sanitize.ts:31` — second-layer guard: assert `stagingKey.startsWith('staging/' + taskId + '/')` before reading.

**Implementation shape.**
```ts
// lib/validation/schemas.ts
export const finalizeImageSchema = z.object({
  taskId: z.uuid(),
  stagingKey: z
    .string()
    .min(1)
    .max(512)
    .refine(
      (k) => /^staging\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(k),
      { message: 'Bad staging key' },
    ),
  filename: z.string().trim().min(1).max(255),
  caption: z.string().trim().max(500).optional().nullable(),
}).superRefine((v, ctx) => {
  if (!v.stagingKey.startsWith(`staging/${v.taskId}/`)) {
    ctx.addIssue({ code: 'custom', path: ['stagingKey'], message: 'Bad staging key' });
  }
});

// lib/storage/sanitize.ts (defense-in-depth)
export async function sanitizeStagedImage(taskId: string, stagingKey: string) {
  if (!stagingKey.startsWith(`staging/${taskId}/`)) {
    throw new Error('Refusing non-staging key');
  }
  // ...
}
```

**Tests/gates.**
- New unit test in `tests/unit/validation.test.ts`: `finalizeImageSchema` rejects `attachments/...`, `staging/<otherTaskId>/...`, and `../staging/...`.
- New integration test in `tests/integration/actions.test.ts`: call `finalizeImageAttachmentAction` with a forged `stagingKey` pointing at an existing canonical key — must return `{ ok: false, code: 'sanitize_failed' }` and must not delete the canonical object.

**Risk.** Low. Tightening only, never widens.

---

### P0-3 — Make status change + audit event atomic

**Why.** `lib/server/actions.ts:256-273` does the OCC update **outside** the transaction that inserts the audit event. If the audit insert fails (FK, network blip, restart), the task row reflects the new status but no event row exists. SPEC §6.3 wants the audit log to be a true history.

**GPT reference.** `lib/tasks/repository.ts:351-385` wraps the status update + audit insert + NOTIFY in `database.transaction(async (tx) => { ... })`. Mirror this shape.

**Claude target.** `lib/server/actions.ts:235-284`.

**Implementation shape.**
```ts
const updated = await db.transaction(async (tx) => {
  const result = await tx
    .update(tasks)
    .set({ status: newStatus, lastEditedBy: auth.user.id })
    .where(and(eq(tasks.id, id), eq(tasks.updatedAt, expected)))
    .returning({ id: tasks.id, status: tasks.status });
  if (result.length === 0) return null;

  await tx.insert(taskEvents).values({
    taskId: id,
    actorId: auth.user.id,
    eventType:
      plan.rule.kind === 'cancel' ? 'cancelled'
      : plan.rule.kind === 'reopen' ? 'reopened'
      : 'status_changed',
    payload: { from: existing.status, to: newStatus, kind: plan.rule.kind },
  });
  return result[0];
});

if (!updated) {
  return { ok: false, error: 'Задачу только что изменили', code: 'stale' };
}
```

**Tests/gates.**
- Extend `tests/integration/actions.test.ts`'s status-change test to assert that when the OCC `where` matches zero rows, **no** `task_events` row is inserted (today the wrap order accidentally protects against this because the early return short-circuits, but make it an explicit invariant).
- Optionally inject an audit-insert failure (mock `tx.insert` to throw) and assert the task status row is rolled back.

**Risk.** Low. Pure ordering / scoping change.

---

### P0-4 — Update parent task on attachment add / remove

**Why.** `lib/server/actions.ts:345-364` (URL add), `:422-443` (image finalize), `:461-469` (delete) write `attachments` and `task_events` rows but do **not** touch `tasks`. Result: feed sort by `updatedAt DESC` doesn't reflect attachment activity, and `last_edited_by` becomes stale after attachment edits — both visible in the UI. Spec §9 wants `updated_at` to track all meaningful writes.

**GPT reference.** `lib/tasks/repository.ts:481`, `:539`, `:570` — every attachment mutation issues `tx.update(tasks).set({ lastEditedBy: actorId }).where(eq(tasks.id, taskId))` inside the same transaction. The DB trigger at `0001_init.sql:140-152` will then bump `updated_at`.

**Claude target.** `lib/server/actions.ts:345-364`, `:422-443`, `:461-469`.

**Implementation shape.** Inside each transaction, after the attachment insert/delete and the `task_events` insert, add:
```ts
await tx
  .update(tasks)
  .set({ lastEditedBy: auth.user.id })
  .where(eq(tasks.id, taskIdOrFound.taskId));
```
The existing `tasks_set_updated_at_trg` trigger handles the timestamp.

**Tests/gates.**
- In `tests/integration/actions.test.ts`'s attachment block: assert `tasks.updated_at` increases and `tasks.last_edited_by` switches to the actor after each of `createUrlAttachmentAction`, `finalizeImageAttachmentAction`, `deleteAttachmentAction`.

**Risk.** Trigger fires twice per call (once for the insert into `attachments`, once for the `tasks` UPDATE). Both go through the same `notify_task_change` trigger, but the client already debounces; safe.

---

### P0-5 — Add cross-field validation to the update path

**Why.** `lib/validation/schemas.ts:140-158` (`updateTaskSchema`) is a flat object with no `superRefine`. It happily accepts `{ amountCollectedDollars: 999, amountDollars: 100 }`, then either the DB CHECK `tasks_collected_leq_amount_ck` blows up at runtime (5xx, no field-level Russian message) or, with the upcoming nonneg CHECKs (P0-7), the DB rejects negatives instead of the form. The user sees a generic toast.

**GPT reference.** GPT re-uses `taskInputSchema` for updates — wrong direction (forces all fields). Don't copy. Adapt the `superRefine` block from Claude's own `createCustomSchema` (`lib/validation/schemas.ts:69-101`) into `updateTaskSchema`.

**Claude target.** `lib/validation/schemas.ts:140-160`.

**Implementation shape.** Add a `.superRefine` to `updateTaskSchema` that runs the same money/duration cross-checks **only when both sides are supplied**:
```ts
export const updateTaskSchema = z.object({ /* …existing… */ })
  .superRefine((d, ctx) => {
    if (d.amountDollars != null && d.amountCollectedDollars != null) {
      if (d.amountCollectedDollars < 0)
        ctx.addIssue({ code: 'custom', path: ['amountCollectedDollars'], message: 'Не может быть отрицательной' });
      if (d.amountCollectedDollars > d.amountDollars)
        ctx.addIssue({ code: 'custom', path: ['amountCollectedDollars'], message: 'Получено больше суммы' });
    }
    if (d.durationMinMinutes != null && d.durationMaxMinutes != null && d.durationMinMinutes > d.durationMaxMinutes) {
      ctx.addIssue({ code: 'custom', path: ['durationMaxMinutes'], message: 'Максимум должен быть ≥ минимума' });
    }
  });
```
And surface inline field errors in `EditPanel` (`app/task/[id]/TaskDetail.tsx:354-677`) — currently it only shows toasts.

**Tests/gates.**
- `tests/unit/validation.test.ts`: explicit cases for partial update payloads with collected > amount, negative collected, and inverted duration range.
- `tests/integration/actions.test.ts`: `updateTaskAction` returns `fieldErrors` with the right key on each violation; no DB CHECK is hit.

**Risk.** Medium-low. The edit form (`EditPanel`) currently submits the entire patch on save; the new refines may flag conditions it didn't before. Make sure the form maps `fieldErrors.amountCollectedDollars` to the right `<input>` id.

---

### P0-6 — Tighten FSM: remove `cancel-from-delivered`

**Why.** `lib/fsm/taskStatus.ts:36` allows `{ from: 'delivered', to: 'cancelled', kind: 'cancel', onlyTypes: ['custom'] }`. Spec §6.3 says cancel applies only to non-terminal statuses; `delivered` is terminal-success. This is explicit spec drift, called out by both engineering reviews.

**Claude target.** `lib/fsm/taskStatus.ts:36`.

**Implementation shape.** Delete that single rule. Add to `tests/unit/fsm.test.ts`:
```ts
expect(planTransition('custom', 'delivered', 'cancelled').ok).toBe(false);
```
The `delivered → done` rollback rule (`:30`) stays — that is the spec-compliant escape hatch.

**Tests/gates.**
- Unit test as above.
- Existing `tests/integration/actions.test.ts` already exercises FSM; rerun.

**Risk.** Trivial.

---

### P0-7 — Add `tasks_amount_nonnegative_check` and `tasks_collected_nonnegative_check` (migration `0003`)

**Why.** Cheap belt-and-suspenders on top of Zod. GPT has both (`drizzle/migrations/0000_initial.sql:91-100`); Claude doesn't. Reviewer's worth-stealing item #1.

**Claude target.**
- New file: `drizzle/migrations/0003_money_nonneg_checks.sql`.
- Extend `drizzle/schema/tasks.ts` to declare the same checks at the schema level so future `db:generate` is consistent.

**Implementation shape.**
```sql
-- 0003_money_nonneg_checks.sql
ALTER TABLE tasks
  ADD CONSTRAINT tasks_amount_nonnegative_check
  CHECK (amount_cents IS NULL OR amount_cents >= 0);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_collected_nonnegative_check
  CHECK (amount_collected_cents IS NULL OR amount_collected_cents >= 0);
```
And in `drizzle/schema/tasks.ts` add two more `check(...)` entries inside the table builder.

**Tests/gates.**
- Extend `tests/integration/schema.test.ts` with two cases that try to insert a task with negative `amount_cents` or `amount_collected_cents` and assert the CHECK fires.

**Risk.** Migration is forward-only and idempotent (re-runs are tracked by `__drizzle_migrations`). Existing prod data is empty (local MVP), so no backfill concern. GPT's variant is `amount_cents > 0`; relax to `>= 0` for safety against future zero-amount edge cases (e.g. promo).

---

## 3. P1/P2 backports

### P1-1 — Multi-file URL & image attachments at `/new`

**Why.** SPEC §6.6 wants attachments during creation. Today Claude's `app/new/NewTaskForm.tsx:445-447` shows the punted message "Загрузка картинок включается в детали задачи." This is the only product gap Claude has against GPT, per the product review.

**GPT reference.**
- UI: `components/forms/NewTaskForm.tsx:546-622` (the entire "Вложения" section, plus `urlAttachments` draft field at `:50-52`, `:166`).
- Submit flow: `:210-244` (the `uploadFiles` helper) plus `:247-278` (the post-create upload loop).

**Claude target.** `app/new/NewTaskForm.tsx`.

**Implementation shape.** Reimplement (don't copy: GPT's lucide-react icons + Tailwind utility classes don't match Claude's design tokens). Steps:
1. Add `urlAttachments: { url: string; caption: string }[]` and `files: File[]` state to the form.
2. Render a "Вложения" section below the description field using Claude's existing `card` / `toolbar` / `chip` styling (look at `app/task/[id]/TaskDetail.tsx:679-866` for the same pattern — copy the markup pattern from Claude's detail-page `Attachments` component, adapted to be uncontrolled until create succeeds).
3. After `createTaskAction` returns success, loop:
   - For each URL → call `createUrlAttachmentAction({ taskId: id, url, caption })`.
   - For each File → call `createImageUploadIntentAction`, PUT to MinIO, call `finalizeImageAttachmentAction`.
4. If any attachment step fails, navigate to `/task/${id}` so the user can retry there (don't drop the created task).
5. Enforce `urlAttachments.length + files.length <= 10` client-side before submit.

**Tests/gates.**
- Extend `tests/e2e/login-and-create.spec.ts` with a "create with one URL + one image" path. Use a tiny PNG fixture.
- Add `tests/integration/actions.test.ts` cases covering attachment-cap edge cases (creates that push past 10 should be rejected by `isAtAttachmentLimit` even mid-loop).

**Risk.** Medium. New failure modes: partial-success creates (task exists but some attachments failed). The redirect-to-detail fallback is the right escape hatch; ensure the UI shows a clear toast like "Задача создана, но картинки не загрузились — попробуйте на странице задачи." Also: the existing `files.length` check is the correct attachment-cap gate for the *first* upload, but later uploads in the loop still go through `isAtAttachmentLimit` which only counts already-persisted rows. This is fine because we serialize the loop.

**Dependency.** Should follow **P0-2** (`stagingKey` validation). If P0-2 lands first, the new flow inherits the hardening for free.

---

### P1-2 — Server-side smart defaults via `user_preferences`

**Why.** SPEC §6.6: "Topic — last topic the current user created a task in (per-user, per-type memory)." Claude stores this in `localStorage` (`app/new/NewTaskForm.tsx:19-43`), so it doesn't follow Лора across devices. GPT has a clean per-user/per-type table.

**GPT reference.**
- Schema: `drizzle/schema.ts:174-188` (`user_preferences` table).
- Migration: `drizzle/migrations/0000_initial.sql:144-152`.
- Repository helpers: `lib/tasks/repository.ts:174-195` (`updateUserPreference`) and `:208-221` (`getNewTaskDefaults`).

**Claude target.**
- New file: `drizzle/schema/preferences.ts`.
- New migration: `drizzle/migrations/0004_user_preferences.sql`.
- New helper: `lib/server/preferences.ts` (read+write).
- Wire into `lib/server/actions.ts:createTaskAction` (write inside the existing `db.transaction`) and into `app/new/page.tsx` (read and pass as a prop).
- Replace `localStorage` paths in `app/new/NewTaskForm.tsx:19-43, 76-102, 115-121`.

**Implementation shape.**
```sql
-- 0004_user_preferences.sql
CREATE TABLE user_preferences (
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_type      task_type NOT NULL,
  last_topic_id  uuid REFERENCES topics(id) ON DELETE SET NULL,
  last_platform  text,
  updated_at     timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  PRIMARY KEY (user_id, task_type)
);
```
Read on `/new`:
```ts
const prefs = await db
  .select()
  .from(userPreferences)
  .where(eq(userPreferences.userId, auth.user.id));
const preferences = Object.fromEntries(
  prefs.map((p) => [p.taskType, { topicId: p.lastTopicId, platform: p.lastPlatform }]),
);
// pass as <NewTaskForm preferences={preferences} … />
```
Write inside `createTaskAction`'s transaction (after the `task_events` insert):
```ts
await tx
  .insert(userPreferences)
  .values({
    userId: auth.user.id,
    taskType: data.type,
    lastTopicId: data.topicId,
    lastPlatform: data.type === 'custom' ? data.platform : null,
  })
  .onConflictDoUpdate({
    target: [userPreferences.userId, userPreferences.taskType],
    set: { lastTopicId: data.topicId, lastPlatform: data.type === 'custom' ? data.platform : null },
  });
```

**Tests/gates.**
- `tests/integration/actions.test.ts`: a Custom create followed by a second Custom create reads back the prior `topicId` / `platform`.
- The new SQL migration runs cleanly in `_helpers.ts` setup.

**Risk.** Low. New table, new code path, no existing data to migrate.

**Dependency.** None. Independent of P1-1 but they should ship close together — both are "/new" UX upgrades.

---

### P1-3 — Wire up the `?created=<id>` flash highlight

**Why.** SPEC §6.6 calls for a 1.5s flash on the new card when returning to feed. Claude has the CSS keyframe (`app/globals.css:.flash`) and writes a `sessionStorage` flag (`app/new/NewTaskForm.tsx:122-126`), but **no consumer reads it** — dead code. GPT does it cleanly via a query param.

**GPT reference.**
- Setter: `components/forms/NewTaskForm.tsx:276` — `router.push('/?created=' + id)`.
- Reader: `components/feed/FeedView.tsx:83` (passes `createdId`) → `components/feed/TaskCard.tsx:30` (`highlight` prop, `new-highlight` class).

**Claude target.**
- `app/new/NewTaskForm.tsx:122-127` — replace `sessionStorage.setItem` + `router.push('/')` with `router.push('/?created=' + result.data.id)`. Drop the `try/catch` block.
- `app/page.tsx:20-30` — read `searchParams.created` (UUID-shaped only) and pass `createdId` down to `TaskCard` via section render.
- `components/TaskCard.tsx:12, 28-30` — accept `highlight?: boolean`, add the `flash` class conditionally.

**Implementation shape.**
```tsx
// app/page.tsx
const sp = await searchParams;
const createdRaw = sp.created;
const createdId = typeof createdRaw === 'string' && /^[0-9a-f-]{36}$/i.test(createdRaw) ? createdRaw : null;
// …
<TaskCard key={t.id} task={t} todayIso={feed.todayIso} highlight={t.id === createdId} />
```
```tsx
// components/TaskCard.tsx
export function TaskCard({ task, todayIso, highlight }: { task: Task; todayIso: string; highlight?: boolean }) {
  // …
  <article className={highlight ? 'card flash' : 'card'} aria-label={task.title}>
```

**Tests/gates.**
- Extend the E2E to assert that immediately after creating a task, the feed shows the new card with the `flash` class. No need for a CSS animation assertion.

**Risk.** Trivial. Watch for the search-params type — Next 15 wraps it in a Promise.

---

### P1-4 — Render empty topic sections (spec §6.8)

**Why.** Reviewers flag this as spec drift: SPEC §6.8 says every topic should render with "Пока ничего." even when empty. Claude hides empty topics entirely (`app/page.tsx:55-59`). GPT renders them. **This is a UX call** — the IMPLEMENTATION_REPORT didn't flag a deliberate decision. See §7 for the question to confirm.

**Claude target.** `app/page.tsx:55-89`.

**Implementation shape.** Drop the `showTopic` early-return; always render the section title + the existing "Пока ничего." line for `section.active.length === 0`. The section title's count badge already hides when there are zero rows (`:73-76`), so visually the empty section is just a heading + the line.

**Tests/gates.** A Playwright assertion that all 9 topic headers render on `/` even when empty. Easy with the existing E2E fixture.

**Risk.** Low. Visual change only; opt-in. **If Dmitriy prefers Claude's de-cluttered current behavior, skip this item entirely.**

---

### P1-5 — DB-enforced 10-attachment cap

**Why.** Both reviewers (codex-engineering items 6/6, claude-engineering item not raised but acknowledged) call out the read-then-insert race in `lib/server/actions.ts:486-491`. Two concurrent uploads see `count() = 9` and both insert.

**Claude target.** `drizzle/migrations/0005_attachment_cap.sql` (new), or fold into `0003`.

**Implementation shape.** Two options:

**Option A (simpler — advisory lock around the count+insert).** Wrap the existing read+insert in `SELECT pg_advisory_xact_lock(hashtextextended(taskId, 0))` inside the transaction. Doesn't change schema; serializes attachment writes per-task only.

**Option B (DB constraint via trigger).** A `BEFORE INSERT` trigger on `attachments` that counts and raises if >= 10. More robust but more code.

Recommend **A** for MVP (one-line change, fits the existing transaction).

**Implementation shape (Option A).**
```ts
// lib/server/actions.ts, inside each attachment-insert transaction:
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${v.taskId}::text, 0))`);
if (await isAtAttachmentLimit(v.taskId)) { /* … */ }
```
And rewrite `isAtAttachmentLimit` to accept the transaction handle.

**Tests/gates.**
- New integration test that fires N concurrent `createUrlAttachmentAction` calls (10 + 5 racing) and asserts only 10 succeed.

**Risk.** Low for Option A. Option B touches schema.

---

### P1-6 — Mobile Playwright project

**Why.** PROMPT calls for "mobile-first reading"; testing on a phone viewport is cheap. GPT has a `mobile` project (`playwright.config.ts:28-30`) using Pixel 5; trivially borrowed.

**GPT reference.** `playwright.config.ts:28-30`.

**Claude target.** `playwright.config.ts:18-23`.

**Implementation shape.**
```ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile',   use: { ...devices['iPhone 13'] } }, // or Pixel 5 — match GPT
],
```
Then in `tests/e2e/login-and-create.spec.ts`, add at least one mobile-specific assertion (e.g. the sticky header outstanding-money chip is visible without horizontal scroll, or the `+ Новая ТЗ` link is reachable in the viewport). One assertion is enough — running the full spec on mobile is bonus coverage.

**Risk.** Trivial.

---

### P2-1 — Resolve double-fanout on `task_changes`

**Why.** Reviewer item: both DB triggers (`0001_init.sql:188-234`) and app-side `emitTaskInvalidation` (`lib/realtime/notify.ts`) fire on every action. The IMPLEMENTATION_REPORT (§2.4) says this is intentional ("identical when triggers are bypassed in tests that mock the DB layer"). If that rationale still holds, leave it and add a one-line comment to that effect in `lib/server/actions.ts` near the first `emitTaskInvalidation` call so the next reader doesn't try to "fix" it. If integration tests now hit the real DB, drop the app-side calls.

**Recommendation.** Keep both, add the comment. Cheap; preserves the test contract.

**Risk.** None.

---

### P2-2 — Drop unused Better-Auth scaffolding

**Why.** `accounts` and `verifications` tables (`drizzle/migrations/0001_init.sql:41-64`, `drizzle/schema/auth.ts:38-63`) are written and never read. Deciding to drop or keep is a one-liner architecture call. If Better-Auth is genuinely on the roadmap, keep them; if not, ship a `DROP TABLE` migration in `0006_remove_unused_auth.sql`.

**Recommendation.** Keep, but add a comment to `auth.ts` saying "future-Better-Auth scaffolding, intentionally unread." Aligns with §2.1 of IMPLEMENTATION_REPORT.

---

### P2-3 — Hoist outstanding-money out of `getFeed`

**Why.** `app/new/page.tsx:26` and `app/task/[id]/page.tsx:41` both call `getFeed('all')` purely to display the header chip. Two extra full-table scans per page. Replace with a tiny dedicated query.

**Claude target.** New helper in `lib/server/feed.ts`:
```ts
export async function getOutstandingCustomCents(): Promise<number> {
  const rows = await db.select({ v: sql<number>`COALESCE(SUM(GREATEST(amount_cents - COALESCE(amount_collected_cents, 0), 0)), 0)::int` })
    .from(tasks)
    .where(and(eq(tasks.type, 'custom'), notInArray(tasks.status, ['delivered', 'cancelled'])));
  return rows[0]?.v ?? 0;
}
```
Replace the two callsites.

**Risk.** Low.

---

### P2-4 — Repository refactor (`lib/tasks/`)

**Why.** Codex-engineering item 5 (Claude weakness): `lib/server/actions.ts` is 504 lines and mixes auth, validation, mutation, audit writes, attachment workflows, and read helpers. GPT's `lib/tasks/repository.ts` is the right shape. Split into `lib/server/actions/` (thin wrappers + zod parsing) + `lib/tasks/repository.ts` (mutations + transactions).

**Recommendation.** Defer. Largest blast radius, smallest user-visible payoff. Worth doing once P0/P1 stabilize. Keep the GPT file as a stylistic reference, not a copy target — the type model is different (text vs uuid user IDs, partial vs full schemas).

---

### P2-5 — `shortAgreementLabels` for chips

**Why.** GPT exports a width-constrained label map (`lib/tasks/labels.ts:29-33`) used for narrow chips ("ожидает" instead of "ожидает подтверждения"). On Claude's mobile viewport the long label wraps. Trivially borrowable.

**Claude target.** `lib/fsm/taskStatus.ts:104-108` — add a `SHORT_AGREEMENT_LABELS_RU` and use it in `components/TaskCard.tsx:50-52`. Keep the long label on the detail page.

---

### P2-6 — Color-contrast remediation

**Why.** `tests/e2e/login-and-create.spec.ts` disables the axe `color-contrast` rule (acknowledged in IMPLEMENTATION_REPORT §"Known limitations"). Pass: bump `--color-ink-3`/`--color-ink-4` in `app/globals.css` to ≥ 4.5:1 against `--color-card` and re-enable the rule. **Avoid wholesale color-system changes.**

---

## 4. Reimplement by inspiration (not copy)

These are concepts worth borrowing, but the GPT code itself is not what we want in Claude.

1. **Repository pattern (`lib/tasks/repository.ts`).** Borrow the *shape* (thin actions + transaction-owning repo) for the future P2 refactor. Don't copy the file — the user-id type, FSM call shape, validation entry points, and notification helpers all differ.
2. **Larger image preview on the detail page.** Codex-product-delivery flags Claude's 80×80 thumbnails as less useful than GPT's full-width preview for reference inspection. Implement *Claude-style*: a small `aspect-ratio` block using existing tokens, click-to-expand to a lightbox or to the presigned URL in a new tab. Don't copy GPT's lucide-icon-laden layout.
3. **Detail page UX accents from GPT** (e.g. `RotateCcw` icon for rollback, an explicit `← В список` back link). Useful affordances; rebuild in Claude's CSS-token style without the `lucide-react` dependency.
4. **MinIO compose `MINIO_API_CORS_ALLOW_ORIGIN` env.** GPT relies on MinIO defaults. Add the env explicitly to Claude's `docker-compose.dev.yml` for robustness — but write the value yourself, don't lift GPT's compose file (Claude's compose has healthchecks GPT lacks).

---

## 5. Things explicitly NOT to port

| Item | Reason |
|---|---|
| GPT visual style (FeedView "Custom к оплате" big card, terracotta tints in form, lucide-react icon set) | User explicitly rejected GPT's UI |
| `local-demo` user in `scripts/seed.ts:23-39`, `README.md:38-44`, `tests/e2e/app.spec.ts:5-9` | Plaintext shipped credential, contradicts SPEC §8 |
| AWS-SDK + custom checksum-stripping middleware (`lib/storage/s3.ts:26-67`) and the hand-rolled SigV4 PUT (`:70-151`) | Claude's `minio` SDK path is 124 LOC vs 289 LOC, no SDK-internals dance |
| App-only `pg_notify` (no DB triggers) | Claude has triggers; do not regress to GPT's listener-only model |
| Topics seeded via `scripts/seed.ts` instead of migration | Claude's `0002_topics_seed.sql` is the right model |
| `SESSION_SECRET = "local-development-session-secret"` default in `lib/env.ts:7` | Claude requires `BETTER_AUTH_SECRET` via `requireVar`; keep that posture |
| 0.0.0.0 docker-compose port bindings | Claude binds `127.0.0.1` |
| Silent-skip integration tests on no-Docker (`tests/integration/db.test.ts:57-75`) | Claude fails loud; keep |
| English `Note` / `Content` chip labels (`lib/tasks/labels.ts:6`) | Claude already has Russian (`TYPE_LABELS_RU`) |
| `updateTaskForUser` re-parsing entire `taskInputSchema` on update (`lib/tasks/repository.ts:283`) | Forces all fields; we want a partial schema with cross-field refines (P0-5) |
| GPT's `presignImageDownload` usage at the *page* layer | Claude's `Promise.all(presignDownload)` works; the cleaner GPT pattern (inject `signImage` into `getTaskDetail`) is fine but not worth the churn |
| GPT's `EditPanel` shape at `components/task/TaskDetailClient.tsx:226+` | Claude's `EditPanel` works; visual style mismatch makes this a net negative |

---

## 6. Suggested implementation sequence

Each row is a single small PR. Ordered so each depends only on prior rows. Aim for ~6 small PRs to cover P0+P1.

| # | PR | Touches | Tests added | Depends on |
|---|---|---|---|---|
| 1 | **Security fixes** — drop `objectKey` from client DTO; tighten `stagingKey` validation; defense-in-depth in sanitizer | `app/task/[id]/page.tsx`, `app/task/[id]/TaskDetail.tsx`, `lib/validation/schemas.ts`, `lib/storage/sanitize.ts` | unit (validation), integration (forged stagingKey rejection), Playwright HTML-leak check | — |
| 2 | **Mutation atomicity & parent-task updates** — wrap `changeStatusAction` in `db.transaction`; add `tx.update(tasks).set({ lastEditedBy })` to URL-add / image-finalize / delete-attachment | `lib/server/actions.ts` | extend `tests/integration/actions.test.ts` (status atomicity, attachment-bumps-parent) | PR 1 |
| 3 | **FSM tighten + nonneg CHECKs** — remove `cancel-from-delivered`; new migration `0003_money_nonneg_checks.sql`; update `drizzle/schema/tasks.ts` | `lib/fsm/taskStatus.ts`, `drizzle/migrations/0003_…`, `drizzle/schema/tasks.ts`, `tests/unit/fsm.test.ts`, `tests/integration/schema.test.ts` | unit (FSM), integration (CHECK fires) | PR 2 |
| 4 | **Update validation cross-fields** — add `superRefine` to `updateTaskSchema`; surface `fieldErrors` inline in `EditPanel` | `lib/validation/schemas.ts`, `app/task/[id]/TaskDetail.tsx` | unit (3 cases), integration (1 case) | PR 3 |
| 5 | **`user_preferences` + flash highlight** — new schema/migration `0004`; replace localStorage paths; wire `?created=<id>` flash | `drizzle/schema/preferences.ts`, `drizzle/migrations/0004_…`, `lib/server/preferences.ts`, `lib/server/actions.ts` (createTaskAction transaction), `app/new/page.tsx`, `app/new/NewTaskForm.tsx`, `app/page.tsx`, `components/TaskCard.tsx` | integration (defaults persist), E2E (flash class present) | PR 4 |
| 6 | **Multi-attachment at `/new`** — port the URL/file UI in Claude's design tokens; serial upload loop; cap enforced client+server | `app/new/NewTaskForm.tsx`, `lib/server/actions.ts` (advisory lock for P1-5) | E2E (create + 1 URL + 1 image), integration (race for cap) | PR 5 |
| 7 | **Mobile project + a11y** — add mobile Playwright project; bump muted color contrast and re-enable axe rule | `playwright.config.ts`, `tests/e2e/login-and-create.spec.ts`, `app/globals.css` | one mobile assertion; remove `disableRules(['color-contrast'])` | PR 6 |
| 8 | *(optional)* **Empty-topic rendering** | `app/page.tsx` | E2E (9 headers visible) | PR 7 — **only after Dmitriy confirms preference** |
| 9 | *(P2, optional)* repository refactor, hoist outstanding-money, `shortAgreementLabels` | `lib/tasks/`, `lib/server/`, components | — | independent |

---

## 7. Open questions for Dmitriy

Only two are genuinely needed:

1. **Empty topic sections** — SPEC §6.8 says each topic should always render with "Пока ничего." when empty. Claude's current behavior (hide entirely on quiet days) is cleaner-looking but spec-divergent. Did you intentionally choose Claude's behavior, or is this a drift you want fixed (P1-4)?

2. **Better-Auth scaffolding** — `accounts` and `verifications` tables exist in the schema and are never read. Are you still planning to swap in Better-Auth eventually, or should we drop the tables and the schema noise (P2-2)?

Everything else has a clear default and doesn't need confirmation.
