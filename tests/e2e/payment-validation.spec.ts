import { expect, test } from '@playwright/test';
import { loginWithCode, provisionEphemeralUser, purgeEphemeralUser, uniqueTitle } from './_helpers';

/**
 * Payment validation on edit (Custom-only).
 *
 * The server validates `amountCollected <= amount` and rejects nulling the
 * amount. These rules previously had no UI coverage, so a regression in the
 * client form would land silently.
 */

const NAME = `E2E-PV-${Date.now()}`;
let CODE = '';

test.beforeAll(() => {
  CODE = provisionEphemeralUser(NAME);
});
test.afterAll(() => {
  purgeEphemeralUser(NAME);
});

test('edit rejects collected > total and nulling the amount', async ({ page }) => {
  const title = uniqueTitle('E2E pay');

  await loginWithCode(page, CODE);

  // Create a Custom task with amount=$100.
  await page.getByRole('link', { name: '+ Новая ТЗ' }).click();
  await page.getByLabel('Заголовок').fill(title);
  await page.getByLabel('Ник / ссылка').fill('@e2e');
  await page.getByLabel('Сумма, $').fill('100');
  const future = new Date();
  future.setDate(future.getDate() + 7);
  await page.getByLabel('Дедлайн').fill(future.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Создать ТЗ' }).click();

  await expect(page).toHaveURL(/\/\?created=/);
  await page.getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/task\//);

  // Open edit panel.
  await page.getByRole('button', { name: 'Редактировать' }).click();

  // 1) Setting collected > amount surfaces an inline error.
  await page.getByLabel('Получено, $').fill('200');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Получено больше суммы')).toBeVisible();

  // 2) Nulling the amount is rejected.
  await page.getByLabel('Получено, $').fill('0');
  await page.getByLabel('Сумма, $').fill('');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Сумма обязательна для Custom')).toBeVisible();
});
