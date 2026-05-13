// Global Vitest setup. Loads .env.local for integration tests.
import { loadEnv } from '@/lib/env';

loadEnv();

// Provide stable defaults for unit tests when no .env is loaded.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-test-secret';
process.env.MINIO_ACCESS_KEY ??= 'test';
process.env.MINIO_SECRET_KEY ??= 'test-secret';
process.env.MINIO_PUBLIC_ENDPOINT ??= 'http://127.0.0.1:9000';
