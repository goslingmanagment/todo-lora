# Codex prompt — todo-lora Claude P1 product/UX backports

You are working in `/Users/dmitriy/code/todo-lora`.

Context:

- This repo is the base implementation. Keep it as the base.
- `/Users/dmitriy/code/todo-lora-gpt` is a donor/reference only.
- Full plan: `docs/backport-gpt-to-claude/BACKPORT_PLAN.md`.
- Finished-code review reports are in `/private/tmp/todo-lora-compare-review-20260507-024610/reports/`.
- Assume P0 hardening has already landed, or verify the relevant P0 dependencies before touching upload/create flows.
- Dmitriy rejected GPT's visual style. Borrow product behavior, not GPT's look.
- Do not port GPT's `local-demo`, AWS SDK/MinIO hacks, app-only NOTIFY model, or English labels.

Goal: implement **P1 product/UX backports** from GPT/donors into the Claude base, in Claude's design language.

Required P1 scope:

1. Add URL + image attachments to `/new` creation flow.
   - Reuse Claude server actions/storage pipeline.
   - Serialize upload/finalize steps after task creation.
   - If attachment upload fails after task creation, preserve the task and route the user to detail with a useful message/fallback.
   - Enforce max 10 attachments client-side and server-side.
2. Add server-side smart defaults via `user_preferences`.
   - Per user + task type.
   - Remember last topic and Custom platform.
   - Replace browser-only localStorage defaults.
3. Wire `?created=<id>` flash highlight on the feed after creating a task.
4. Render empty topic sections with `Пока ничего.` only if this remains the chosen product behavior; if the current de-cluttered behavior seems intentional, stop and flag it instead of forcing the change.
5. Add a DB/advisory-lock guard for the 10-attachment cap if not already done in P0.
6. Add a mobile Playwright project and at least one useful mobile assertion.

Implementation constraints:

- Modify code/tests in this repo only.
- Read GPT donor files for behavior, but reimplement styling in Claude's CSS tokens/components.
- Keep Russian labels/copy from Claude style.
- Do not do P2 repository refactors or broad redesigns in this run.
- Do not alter `.env.local`, generated `.next`, `node_modules`, or unrelated files.

Expected tests/gates before final response:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Relevant Playwright/E2E tests for create flow and mobile behavior.

Final response should include:

- changed files;
- which P1 items are complete;
- UX decisions made, especially empty-topic sections;
- tests run and results;
- any blockers or intentionally deferred pieces.
