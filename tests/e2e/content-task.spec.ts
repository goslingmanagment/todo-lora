import { expect, test } from '@playwright/test';
import {
  getCreateTaskLink,
  loginWithCode,
  provisionEphemeralUser,
  purgeEphemeralUser,
  uniqueTitle,
} from './_helpers';

/**
 * Content task creation end-to-end.
 *
 * The Custom path is covered separately; this spec guards the Content tab
 * specifically because it has its own field set and a required requester
 * dropdown.
 */

const NAME = `E2E-CT-${Date.now()}`;
let CODE = '';

test.beforeAll(() => {
  CODE = provisionEphemeralUser(NAME);
});
test.afterAll(() => {
  purgeEphemeralUser(NAME);
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
