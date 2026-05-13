# Claude Opus prompt — port old Opus UI into current todo-lora Claude base

You are working in `/Users/dmitriy/code/todo-lora`.

Use **current Claude** as the implementation base. Use old Opus only as a visual/UX donor:

- Current base: `/Users/dmitriy/code/todo-lora`
- Old Opus donor: `/Users/dmitriy/code/todo-lora-claude-old`
- Existing backport docs: `docs/backport-gpt-to-claude/BACKPORT_PLAN.md`

Goal: make the current Claude app visually and ergonomically closer to the old Opus implementation, while preserving the current Claude backend/domain/auth/storage/realtime architecture.

Important constraints:

- Do **not** switch base to old Opus.
- Do **not** port old Opus backend logic, auth model, Better-Auth wiring, AWS SDK storage, migrations, schema, actions, or upload pipeline.
- Do **not** port GPT visual style.
- Preserve current Claude server actions, data model, validation, FSM, storage sanitization, realtime refresh, tests, and Russian copy unless a UI change requires a small adapter.
- This repo may not be a git repo. Before editing, create a timestamped backup of the UI files you will touch under `/private/tmp/todo-lora-claude-ui-backup-<timestamp>/`.
- Keep the change focused on UI/UX. Do not implement unrelated P0/P1 engineering backports unless needed to keep the UI compiling.

Primary UI areas to port/adapt from old Opus:

1. App shell / visual system
   - Compare `old-opus/app/globals.css`, `app/layout.tsx`, `components/Header.tsx` with current `app/globals.css`, `app/layout.tsx`, `components/Header.tsx`.
   - Bring over the old Opus visual feel: spacing, cards, softer panels, chips, section rhythm, typography density.
   - Keep current branding/copy where it is better.

2. Feed page
   - Donor files: `old-opus/app/page.tsx`, `components/TopicSection.tsx`, `components/TaskCard.tsx`, `components/FilterChips.tsx`, `components/DeadlineChip.tsx`, `components/PriorityDot.tsx`.
   - Target files: current `app/page.tsx`, `components/TaskCard.tsx`, `components/Header.tsx` and any small new UI components if useful.
   - Port the old Opus feel for topic sections, card layout, filter chips, deadline/priority presentation, and empty states.
   - Preserve current feed data shape and current server-side feed logic unless a small DTO addition is necessary.

3. New task form
   - Donor files: `old-opus/app/new/TaskForm.tsx`, `app/new/page.tsx`, `app/new/rememberDefaults.ts`.
   - Target files: current `app/new/NewTaskForm.tsx`, `app/new/page.tsx`.
   - Adapt the old Opus form layout/style and interaction feel, but keep current Claude create action/schema and current task model.
   - Do not reintroduce old local/backend behavior if current Claude already does it better.

4. Task detail page
   - Donor files: `old-opus/app/task/[id]/page.tsx`, `TaskActions.tsx`, `TaskInlineEdit.tsx`, `TaskImageAttachments.tsx`, `TaskUrlAttachments.tsx`.
   - Target files: current `app/task/[id]/page.tsx`, `app/task/[id]/TaskDetail.tsx`.
   - Port/adapt the strongest old Opus UX pieces:
     - stronger visual hierarchy;
     - “К ленте” back link;
     - framed Custom money/buyer panel;
     - clearer status/agreement controls;
     - larger image attachment grid;
     - cleaner URL/image attachment sections.
   - Keep current Claude detail actions and attachment server actions.

5. Login/error polish
   - Compare old Opus `app/login/*`, `app/error.tsx`, `app/not-found.tsx` with current equivalents.
   - Port only visual improvements, not auth internals.

Testing/gates before final response:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- If you change browser-visible flows substantially, run relevant Playwright tests or explain why not.

Final response should include:

- short summary of the visual direction ported;
- changed files;
- what was intentionally not ported from old Opus;
- tests run and results;
- any remaining UI follow-ups worth doing manually.
