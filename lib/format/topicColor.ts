/**
 * Stable topic→color mapping for the Calendar view's topic-tag dot.
 *
 * Reuses the same warm muted palette as Header.UserDot so we don't
 * introduce any new colors — just hash a topic slug into one of six
 * already-blessed tones from §6.9.
 */
const TOPIC_DOT_PALETTE = [
  '#b56b4c',
  '#c8a26a',
  '#8a8472',
  '#9b6f6b',
  '#6e8273',
  '#7d6f96',
];

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function topicColor(slug: string): string {
  return TOPIC_DOT_PALETTE[hashSlug(slug) % TOPIC_DOT_PALETTE.length]!;
}
