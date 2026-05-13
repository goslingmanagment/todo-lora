# Codex prompt — todo-lora Claude P0 backport/hardening

You are working in `/Users/dmitriy/code/todo-lora`.

Context:

- This repo is the base implementation. Keep it as the base.
- `/Users/dmitriy/code/todo-lora-gpt` is a donor/reference only.
- Full plan: `docs/backport-gpt-to-claude/BACKPORT_PLAN.md`.
- Finished-code review reports are in `/private/tmp/todo-lora-compare-review-20260507-024610/reports/`.
- Do not port GPT's visual style, `local-demo`, AWS SDK/MinIO hacks, app-only NOTIFY model, or English labels.

Goal: implement **only the P0 safety/correctness items** from `BACKPORT_PLAN.md`, preserving Claude's architecture and UI.

Required P0 scope:

1. Remove canonical `objectKey` from the client DTO/render path.
2. Validate `stagingKey` so only `staging/<taskId>/...` keys are accepted; add defense-in-depth in storage sanitization.
3. Make status change + audit event atomic in one DB transaction.
4. Make URL/image attachment add/remove update the parent task (`last_edited_by` and trigger-updated `updated_at`) in the same transaction.
5. Add cross-field validation for task updates: collected <= amount, nonnegative collected, min duration <= max duration; surface field errors cleanly instead of DB/generic failures.
6. Remove the invalid `delivered -> cancelled` Custom transition; keep `delivered -> done` rollback.
7. Add DB/schema CHECKs for nonnegative `amount_cents` and `amount_collected_cents` via a new migration.

Implementation constraints:

- Modify code/tests in this repo only.
- Read donor code when useful, but reimplement in Claude style.
- Keep changes focused; do not implement P1/P2 items in this run.
- Do not alter `.env.local`, generated `.next`, `node_modules`, or unrelated files.
- Add/update tests for each behavior where practical.

Expected tests/gates before final response:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- If E2E/browser changes were needed for leak checks, run the relevant Playwright test; otherwise explain why not.

Final response should include:

- changed files;
- which P0 items are complete;
- tests run and results;
- any blockers or intentionally deferred pieces.
