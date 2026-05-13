import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import {
  loginWithCode,
  provisionEphemeralUser,
  purgeEphemeralUser,
  uniqueTitle,
} from './_helpers';

/**
 * Realtime fanout across two browser contexts (per SPEC §9.1).
 *
 * - The feed-only context sees a task appear after the other context creates
 *   it (no manual reload).
 * - A detail-page context scoped to task A does NOT re-fetch when task B is
 *   edited (per brief P0.2 acceptance — scoped invalidation).
 */

const NAME = `E2E-RT-${Date.now()}`;
let CODE = '';

async function closePage(page: Page): Promise<void> {
  await Promise.race([
    page.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
}

async function closeContext(context: BrowserContext): Promise<void> {
  await Promise.race([
    context.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
}

test.beforeAll(() => {
  CODE = provisionEphemeralUser(NAME);
});
test.afterAll(() => {
  purgeEphemeralUser(NAME);
});

test('feed in window 1 picks up a task created in window 2', async ({ browser }) => {
  const ctxFeed = await browser.newContext();
  const ctxCreator = await browser.newContext();
  const feed = await ctxFeed.newPage();
  const creator = await ctxCreator.newPage();

  try {
    await loginWithCode(feed, CODE);
    await loginWithCode(creator, CODE);

    await expect(feed.getByRole('link', { name: '+ Новая ТЗ' })).toBeVisible();

    const title = uniqueTitle('E2E realtime');

    await creator.getByRole('link', { name: '+ Новая ТЗ' }).click();
    await creator.getByRole('tab', { name: 'Контент' }).click();
    await creator.getByLabel('Заголовок').fill(title);
    const d = new Date();
    d.setDate(d.getDate() + 3);
    await creator.getByLabel('Дедлайн').fill(d.toISOString().slice(0, 10));
    await creator.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(creator).toHaveURL(/\/\?created=/);

    // Feed window 1 should refresh via SSE within a few seconds.
    await expect(feed.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
  } finally {
    await Promise.all([closeContext(ctxFeed), closeContext(ctxCreator)]);
  }
});

test('detail page for task A does NOT refresh when task B is edited', async ({ browser }) => {
  test.setTimeout(45_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await loginWithCode(pageA, CODE);
    await loginWithCode(pageB, CODE);

    // Create two content tasks from context B's page (the creator).
    const titleA = uniqueTitle('E2E scope A');
    const titleB = uniqueTitle('E2E scope B');

    for (const title of [titleA, titleB]) {
      await pageB.goto('/new');
      await pageB.getByRole('tab', { name: 'Контент' }).click();
      await pageB.getByLabel('Заголовок').fill(title);
      const d = new Date();
      d.setDate(d.getDate() + 3);
      await pageB.getByLabel('Дедлайн').fill(d.toISOString().slice(0, 10));
      await pageB.getByRole('button', { name: 'Создать задачу' }).click();
      await expect(pageB).toHaveURL(/\/\?created=/);
    }

    // Open task A in context A.
    await pageA.goto('/');
    await pageA.getByRole('link', { name: titleA }).click();
    await expect(pageA).toHaveURL(/\/task\//);
    await expect(pageA.getByRole('heading', { name: titleA })).toBeVisible();

    // Count RSC refresh requests on the detail page while we edit task B.
    let rscRefreshes = 0;
    const onReq = (req: Request) => {
      // Next.js RSC re-fetches set the `RSC` header to '1' on the same page URL.
      const headers = req.headers();
      if (headers['rsc'] === '1' && req.url().includes('/task/')) rscRefreshes += 1;
    };
    pageA.on('request', onReq);

    // Edit task B's title in context B.
    await pageB.goto('/');
    await pageB.getByRole('link', { name: titleB }).click();
    await pageB.getByRole('button', { name: 'Редактировать' }).click();
    const editedB = `${titleB} (edited)`;
    await pageB.getByLabel('Заголовок').fill(editedB);
    await pageB.getByRole('button', { name: 'Сохранить' }).click();
    // Wait for the SSE event to fan out — generous window so a real refresh
    // would land if scoping is broken.
    await pageA.waitForTimeout(2500);

    pageA.off('request', onReq);

    expect(rscRefreshes).toBe(0);
    // Sanity: A is still showing A's original title (no unexpected nav).
    await expect(pageA.getByRole('heading', { name: titleA })).toBeVisible();
  } finally {
    await Promise.all([closePage(pageA), closePage(pageB)]);
    await Promise.all([closeContext(ctxA), closeContext(ctxB)]);
  }
});
