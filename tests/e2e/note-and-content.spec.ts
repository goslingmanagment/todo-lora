import { expect, test } from '@playwright/test';
import {
  getCreateTaskLink,
  loginWithCode,
  provisionEphemeralUser,
  purgeEphemeralUser,
  uniqueTitle,
} from './_helpers';

/**
 * Note + Content task creation end-to-end.
 *
 * The existing E2E spec covers only Custom. This adds the two other task
 * types because they each have their own field set and (for Content) a
 * required requester. A regression in either tab is invisible until users
 * try to create one in production.
 */

const NAME = `E2E-NC-${Date.now()}`;
let CODE = '';

test.beforeAll(() => {
  CODE = provisionEphemeralUser(NAME);
});
test.afterAll(() => {
  purgeEphemeralUser(NAME);
});

test('Note: minimal fields, lands in feed', async ({ page }) => {
  const title = uniqueTitle('E2E note');

  await loginWithCode(page, CODE);
  await getCreateTaskLink(page).click();
  await expect(page).toHaveURL(/\/new$/);

  await page.getByRole('tab', { name: 'Заметка' }).click();
  await page.getByLabel('Заголовок').fill(title);
  // Note has no required money/buyer/requester fields. Just submit.
  await page.getByRole('button', { name: 'Создать заметку' }).click();

  await expect(page).toHaveURL(/\/\?created=[0-9a-f-]{36}$/i);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('Content: requester required, then creates and lands in feed', async ({ page }) => {
  const title = uniqueTitle('E2E content');

  await loginWithCode(page, CODE);
  await getCreateTaskLink(page).click();

  await page.getByRole('tab', { name: 'Контент' }).click();
  await page.getByLabel('Заголовок').fill(title);

  // Deadline is required for Content tasks; pick today+3.
  const d = new Date();
  d.setDate(d.getDate() + 3);
  await page.getByLabel('Дедлайн').fill(d.toISOString().slice(0, 10));

  const requester = page.getByLabel('Заказчик');
  await requester.waitFor({ state: 'visible' });
  await expect(requester).not.toHaveValue('');

  await page.getByRole('button', { name: 'Создать задачу' }).click();

  await expect(page).toHaveURL(/\/\?created=[0-9a-f-]{36}$/i);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
