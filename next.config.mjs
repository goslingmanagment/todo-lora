/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Both `localhost` and `127.0.0.1` end up hitting the dev server; allow
  // both so HMR sub-requests don't flag a cross-origin warning.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Attachment images are loaded via direct presigned MinIO URLs in plain <img> tags;
  // we never proxy them through next/image. See SPEC §7.2.
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pg', '@node-rs/argon2', 'sharp'],
  eslint: {
    dirs: ['app', 'components', 'lib', 'scripts', 'tests'],
  },
  // Keep the dev-server file watcher away from artifacts that get rewritten
  // every few seconds (tsbuildinfo, leftover .next.broken-* directories from
  // crashed prior builds). Without these excludes Webpack enters a Fast
  // Refresh recompile loop ("Compiled in 47ms" every ~50ms) which can
  // transiently 404 client chunks and break React hydration on /new + /login.
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.next.broken-*/**',
        '**/tsconfig.tsbuildinfo',
        '**/*.tsbuildinfo',
      ],
    };
    return config;
  },
};

export default nextConfig;
