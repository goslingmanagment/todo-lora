import { expect, test } from '@playwright/test';
import { Client as MinioClient } from 'minio';
import {
  loginWithCode,
  provisionEphemeralUser,
  purgeEphemeralUser,
  uniqueTitle,
} from './_helpers';

/**
 * Staged image cleanup at the attachment limit.
 *
 * The server enforces a 10-attachment cap. If the limit check ever drifts
 * from the staged-upload pipeline (intent issued but limit hit at finalize,
 * or any other failure path), we want to be certain the bucket does not
 * accumulate orphaned `staging/<taskId>/` objects.
 *
 * Requires MinIO from docker-compose.dev.yml to be running with the same
 * credentials the app uses (loaded from .env.local).
 */

const NAME = `E2E-SC-${Date.now()}`;
let CODE = '';

test.beforeAll(() => {
  CODE = provisionEphemeralUser(NAME);
});
test.afterAll(() => {
  purgeEphemeralUser(NAME);
});

function getMinioClient(): { client: MinioClient; bucket: string } {
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      'MINIO_ACCESS_KEY / MINIO_SECRET_KEY must be set for staging-cleanup spec. ' +
        'Source .env.local before running pnpm e2e.',
    );
  }
  const client = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
    port: Number.parseInt(process.env.MINIO_PORT ?? '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
    accessKey,
    secretKey,
    region: process.env.MINIO_REGION ?? 'us-east-1',
  });
  return { client, bucket: process.env.MINIO_BUCKET ?? 'todo-lora-attachments' };
}

async function listStagedKeys(taskId: string): Promise<string[]> {
  const { client, bucket } = getMinioClient();
  const prefix = `staging/${taskId}/`;
  const keys: string[] = [];
  for await (const obj of client.listObjectsV2(bucket, prefix, true)) {
    if (obj.name) keys.push(obj.name);
  }
  return keys;
}

test('upload attempt at the 10-attachment limit leaves no staging objects', async ({ page }) => {
  const title = uniqueTitle('E2E staging');

  await loginWithCode(page, CODE);

  // Create a Content task (no money required, requester defaults to current user).
  await page.getByRole('link', { name: '+ Новая ТЗ' }).click();
  await page.getByRole('tab', { name: 'Контент' }).click();
  await page.getByLabel('Заголовок').fill(title);
  const d = new Date();
  d.setDate(d.getDate() + 3);
  await page.getByLabel('Дедлайн').fill(d.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Создать задачу' }).click();

  await expect(page).toHaveURL(/\/\?created=/);
  await Promise.all([
    page.waitForURL(/\/task\/[0-9a-f-]{36}$/i),
    page.getByRole('link', { name: title }).click(),
  ]);
  const detailUrl = page.url();
  const taskId = detailUrl.match(/\/task\/([0-9a-f-]{36})/i)?.[1];
  expect(taskId, 'should have a task id in the URL').toBeTruthy();

  // Fill 10 URL attachments by reusing the URL-attachment block. URL adds
  // are cheap, deterministic, and count against the same 10-cap as images.
  for (let i = 0; i < 10; i++) {
    await page.getByLabel('Ссылка').fill(`https://e2e.example/${i}`);
    await page.getByRole('button', { name: 'Добавить ссылку' }).click();
    await expect(page.getByText(`https://e2e.example/${i}`)).toBeVisible();
  }

  // Snapshot staging state before the (expected to fail) upload.
  const beforeKeys = await listStagedKeys(taskId!);

  // Attempt an image upload. Server will reject the intent because count = 10.
  await page.setInputFiles('#image-attachment-input', {
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  // Should see the limit toast.
  await expect(page.getByText('Достигнут предел в 10 вложений')).toBeVisible();

  // No staging objects should have been created.
  const afterKeys = await listStagedKeys(taskId!);
  expect(afterKeys).toEqual(beforeKeys);
  expect(afterKeys, `unexpected staging objects for task ${taskId}`).toHaveLength(0);
});
