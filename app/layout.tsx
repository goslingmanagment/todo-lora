import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/Toaster';

// next/font self-hosts the woff2 files at build time and exposes them as CSS
// variables consumed by globals.css (--font-serif / --font-sans). This
// replaces the hand-rolled @font-face block that pinned specific gstatic.com
// hashes — those rotated and started 404'ing.
// Note: Fraunces has no Cyrillic glyphs in Google Fonts. Russian headings
// fall back to Inter (next in the --font-serif stack via globals.css), which
// matches the behavior the app shipped with before — the previous hand-
// rolled @font-face declared a Cyrillic range but pointed at the same Latin-
// only files, so the fallback path was already in effect.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-serif',
});

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'todo-lora',
  description: 'Внутренний таск-трекер',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f4ec',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">К ленте</a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
