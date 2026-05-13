/**
 * Barrel for the server-action modules. Existing imports from
 * `@/lib/server/actions` keep working; the actual implementations live in
 * `lib/server/actions/{auth,tasks,attachments}.ts`.
 *
 * Server actions stay async-only exports per the `'use server'` directive
 * in each leaf module. Non-action helpers live in `actions/_shared.ts`.
 */
export { loginAction, logoutAction } from './actions/auth';
export {
  changeStatusAction,
  createTaskAction,
  deleteTaskAction,
  getRecentEventsAction,
  listAllowedTransitionsAction,
  setAgreementStateAction,
  updateTaskAction,
} from './actions/tasks';
export {
  createImageUploadIntentAction,
  createUrlAttachmentAction,
  deleteAttachmentAction,
  finalizeImageAttachmentAction,
} from './actions/attachments';
export { clearDemoDataAction, seedDemoDataAction } from './actions/demo-data';
export type { ActionResult } from './actions/_shared';
