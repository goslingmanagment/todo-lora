import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { getCreateTaskLink, provisionEphemeralUser, purgeEphemeralUser } from './_helpers';

/**
 * Full login → create → edit → status flow.
 *
 * Pre-reqs (documented in README):
 *   - Postgres + MinIO from docker-compose.dev.yml are up
 *   - DATABASE_URL is set
 *   - Migrations have been applied
 *
 * The test provisions an ephemeral user via the user-add CLI,
 * captures the printed code, then drives the UI.
 */

const NAME = `E2E-${Date.now()}`;
let CODE = '';

test.beforeAll(async () => {
  CODE = provisionEphemeralUser(NAME);
});

test.afterAll(async () => {
  purgeEphemeralUser(NAME);
});

test('user can log in, create a Custom task with attachments, edit it, and advance status', async ({ page }, testInfo) => {
  const taskTitle = `E2E custom ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const editedTitle = `${taskTitle} (edited)`;
  const urlAttachment = `https://example.com/todo-lora-e2e-${Date.now()}`;

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'todo-lora' })).toBeVisible();

  // Basic accessibility check on the login page.
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect.soft(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await page.getByLabel('Код').fill(CODE);
  await page.getByRole('button', { name: 'Войти' }).click();

  const createTaskLink = getCreateTaskLink(page);
  await expect(createTaskLink).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await expect(createTaskLink).toBeInViewport();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }

  // Create a custom task
  await createTaskLink.click();
  await expect(page).toHaveURL(/\/new$/);

  // Default tab is Custom
  await page.getByLabel('Заголовок').fill(taskTitle);
  await page.getByLabel('Ник покупателя').fill('@e2e');
  // Platform default is Fansly
  await page.getByLabel('Сумма, $').fill('150');
  // Set deadline to today + 7
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const isoFuture = future.toISOString().slice(0, 10);
  await page.getByLabel('Дедлайн').fill(isoFuture);

  await page.getByRole('button', { name: 'Добавить ссылку' }).click();
  await page.getByLabel('URL вложения 1').fill(urlAttachment);
  await page.getByLabel('Подпись').fill('Источник');
  await page.setInputFiles('#attachments-files', {
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('tiny.png')).toBeVisible();

  await page.getByRole('button', { name: 'Создать ТЗ' }).click();

  // Returned to feed
  await expect(page).toHaveURL(/\/\?created=[0-9a-f-]{36}$/i);
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
  await expect(page.locator('article.flash').filter({ hasText: taskTitle })).toBeVisible();

  // Open detail
  await page.getByRole('link', { name: taskTitle }).click();
  await expect(page).toHaveURL(/\/task\//);
  await expect(page.getByRole('link', { name: urlAttachment })).toBeVisible();
  await expect(page.getByText('tiny.png')).toBeVisible();

  // Status: draft → in_progress
  await page.getByRole('button', { name: 'В работе' }).click();
  await expect(page.locator('header .chip').filter({ hasText: 'В работе' })).toBeVisible();

  // Edit title
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Заголовок').fill(editedTitle);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible();
});
