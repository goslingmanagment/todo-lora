import { describe, expect, it, vi } from 'vitest';
import { adoptExistingBaseline } from '../../scripts/migrate';

type BaselineFacts = {
  has_baseline_artifacts: boolean;
  has_0001_baseline: boolean;
  has_post_baseline_artifacts: boolean;
};

function fakeClient(facts: BaselineFacts) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('WITH facts AS')) return { rows: [facts] };
      return { rows: [] };
    }),
  } as unknown as Parameters<typeof adoptExistingBaseline>[0];
  return { client, calls };
}

describe('adoptExistingBaseline', () => {
  it('adopts only an exact 0001 baseline schema', async () => {
    const { client, calls } = fakeClient({
      has_baseline_artifacts: true,
      has_0001_baseline: true,
      has_post_baseline_artifacts: false,
    });
    const applied = new Set<string>();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await adoptExistingBaseline(client, applied);
    } finally {
      logSpy.mockRestore();
    }

    expect(applied.has('0001_init')).toBe(true);
    expect(calls.some((call) => call.sql.includes("VALUES ('0001_init')"))).toBe(true);
  });

  it('does nothing on an empty schema', async () => {
    const { client } = fakeClient({
      has_baseline_artifacts: false,
      has_0001_baseline: false,
      has_post_baseline_artifacts: false,
    });
    const applied = new Set<string>();

    await adoptExistingBaseline(client, applied);

    expect(applied.size).toBe(0);
  });

  it('refuses partial baseline artifacts without migration history', async () => {
    const { client } = fakeClient({
      has_baseline_artifacts: true,
      has_0001_baseline: false,
      has_post_baseline_artifacts: false,
    });

    await expect(adoptExistingBaseline(client, new Set<string>())).rejects.toThrow(
      /refusing unsafe baseline adoption/,
    );
  });

  it('refuses already-modern schemas without migration history', async () => {
    const { client } = fakeClient({
      has_baseline_artifacts: true,
      has_0001_baseline: true,
      has_post_baseline_artifacts: true,
    });

    await expect(adoptExistingBaseline(client, new Set<string>())).rejects.toThrow(
      /refusing unsafe baseline adoption/,
    );
  });
});
