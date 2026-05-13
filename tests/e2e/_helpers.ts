/**
 * Shared helpers for E2E specs. We provision a real user via the documented
 * CLI (`pnpm user:add`) so the auth flow is exercised end-to-end rather than
 * stubbed. The codes are printed once to stdout and captured here.
 */
import { execSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

export function provisionEphemeralUser(name: string): string {
  const out = execSync(`pnpm exec tsx scripts/user-add.ts "${name}"`, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const match = out.match(/Login code \(shown once\):\s+(\S+)/);
  if (!match) throw new Error(`Could not parse code from CLI output:\n${out}`);
  return match[1]!;
}

export function purgeEphemeralUser(name: string): void {
  try {
    execSync(`pnpm exec tsx scripts/user-purge.ts --yes --confirm "${name}" "${name}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err) {
    console.warn(`[e2e] failed to purge ${name}:`, err);
  }
}

/**
 * Drives the login form for the given user code. Leaves the page on the
 * feed after a successful login.
 */
export async function loginWithCode(page: Page, code: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Код').fill(code);
  await Promise.all([page.waitForURL(/\/$/), page.getByRole('button', { name: 'Войти' }).click()]);
  await expect(getCreateTaskLink(page)).toBeVisible();
}

export function getCreateTaskLink(page: Page) {
  return page.getByRole('link', { name: /\+ Новая ТЗ|Создать новую задачу/ });
}

export function uniqueTitle(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
