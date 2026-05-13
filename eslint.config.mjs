import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  // ESLint flat configs treat a config block containing only `ignores` as
  // global ignores. Keep this FIRST so it applies before any extended
  // shareables traverse the file tree.
  {
    ignores: [
      '.next/**',
      '.next.broken-*/**',
      'node_modules/**',
      'drizzle/migrations/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'postcss.config.mjs',
      'tsconfig.tsbuildinfo',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];

export default config;
