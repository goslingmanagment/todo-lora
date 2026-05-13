/**
 * Idempotent MinIO bootstrap: create the configured private bucket if missing
 * and apply a 1-day expiration lifecycle to `staging/` (§7.1 belt-and-braces).
 */
import { ensureBucket, getStorageClient, STAGING_PREFIX } from '@/lib/storage/client';
import { getConfig } from '@/lib/env';
import { loadEnv } from '@/lib/env';

loadEnv();

const STAGING_LIFECYCLE_RULE_ID = 'todo-lora-staging-expire-1d';

async function applyStagingLifecycle(bucket: string): Promise<void> {
  const client = getStorageClient();
  // setBucketLifecycle replaces the whole policy. We want to be additive:
  // preserve any unrelated existing rules and ensure ours is present with
  // the right shape.
  const existing = await client.getBucketLifecycle(bucket).catch(() => null);
  const existingRules = Array.isArray(existing?.Rule)
    ? existing.Rule
    : existing?.Rule
      ? [existing.Rule]
      : [];
  const otherRules = existingRules.filter((r) => r.ID !== STAGING_LIFECYCLE_RULE_ID);
  const stagingRule = {
    ID: STAGING_LIFECYCLE_RULE_ID,
    Status: 'Enabled',
    Prefix: STAGING_PREFIX,
    Expiration: { Days: 1 },
  };
  await client.setBucketLifecycle(bucket, { Rule: [...otherRules, stagingRule] });
}

async function main() {
  const cfg = getConfig().minio;
  await ensureBucket();
  await applyStagingLifecycle(cfg.bucket);
  console.log(`Bucket "${cfg.bucket}" is ready.`);
  console.log(`Lifecycle rule "${STAGING_LIFECYCLE_RULE_ID}" expires ${STAGING_PREFIX}* after 1 day.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
