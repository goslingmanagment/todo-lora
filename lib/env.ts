import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

/**
 * Load environment variables from .env.local / .env (in that priority order)
 * for CLI scripts and drizzle-kit. Next.js handles its own loading at runtime.
 */
export function loadEnv(cwd: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    process.env.ENV_FILE && resolve(cwd, process.env.ENV_FILE),
    resolve(cwd, '.env.local'),
    resolve(cwd, '.env'),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export type AppConfig = {
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  appUrl: string;
  minio: {
    endpoint: string;
    port: number;
    useSSL: boolean;
    region: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    publicEndpoint: string;
  };
  timezone: string;
  logLevel: string;
};

export function getConfig(): AppConfig {
  loadEnv();
  const requireVar = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  return {
    databaseUrl: requireVar('DATABASE_URL'),
    betterAuthSecret: requireVar('BETTER_AUTH_SECRET'),
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    minio: {
      endpoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
      port: Number.parseInt(process.env.MINIO_PORT ?? '9000', 10),
      useSSL: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
      region: process.env.MINIO_REGION ?? 'us-east-1',
      accessKey: requireVar('MINIO_ACCESS_KEY'),
      secretKey: requireVar('MINIO_SECRET_KEY'),
      bucket: process.env.MINIO_BUCKET ?? 'todo-lora-attachments',
      publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT ?? 'http://127.0.0.1:9000',
    },
    timezone: process.env.APP_TIMEZONE ?? 'Europe/Moscow',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}
