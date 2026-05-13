# GPT → Claude backport planning

Claude todo-lora is the base. GPT todo-lora is a donor only.

Files:

- `BACKPORT_PLAN.md` — full Claude-generated backport plan from finished-code reviews.
- `PROMPT_P0_CODEX.md` — prompt to implement P0 safety/correctness hardening.
- `PROMPT_P1_CODEX.md` — prompt to implement P1 product/UX backports after P0 lands.

Source review reports:

- `/private/tmp/todo-lora-compare-review-20260507-024610/reports/claude-engineering.md`
- `/private/tmp/todo-lora-compare-review-20260507-024610/reports/claude-product-delivery.md`
- `/private/tmp/todo-lora-compare-review-20260507-024610/reports/codex-engineering.md`
- `/private/tmp/todo-lora-compare-review-20260507-024610/reports/codex-product-delivery.md`

Do not port GPT visual style, `local-demo`, AWS-SDK/MinIO hacks, app-only NOTIFY, or English labels.
