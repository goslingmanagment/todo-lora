-- Drop the AFTER-write triggers that emit NOTIFY on `task_changes`. The
-- application server actions in `lib/server/actions.ts` already call
-- `emitTaskInvalidation` after every successful commit. With both paths
-- active, every write produced two NOTIFYs and therefore two router
-- refreshes on every connected client.
--
-- The trigger function is kept in place (no callers reference it now) only
-- so a future migration can re-introduce a single channel from inside a
-- transaction without recreating the function body. If you remove the
-- triggers below for good, the function can also be dropped.

DROP TRIGGER IF EXISTS tasks_notify_trg ON tasks;
DROP TRIGGER IF EXISTS attachments_notify_trg ON attachments;
DROP TRIGGER IF EXISTS task_events_notify_trg ON task_events;

DROP FUNCTION IF EXISTS notify_task_change();
