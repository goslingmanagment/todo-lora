import type { ContentDestination } from '@/drizzle/schema/enums';

export const CONTENT_DESTINATIONS: ContentDestination[] = [
  'of_wall',
  'of_ppv',
  'reddit',
  'tiktok',
  'twitter',
  'instagram',
  'chat',
  'other',
];

export const CONTENT_DESTINATION_LABELS_RU: Record<ContentDestination, string> = {
  of_wall: 'OF wall',
  of_ppv: 'OF PPV mass',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  chat: 'Chat',
  other: 'Другое',
};

export function destinationForTopicSlug(slug: string | null | undefined): ContentDestination {
  switch (slug) {
    case 'ppv':
      return 'of_ppv';
    case 'sets':
    case 'pictures':
      return 'of_wall';
    case 'reddit':
      return 'reddit';
    case 'fyp':
      return 'tiktok';
    case 'instagram':
      return 'instagram';
    case 'life':
    case 'sextings':
      return 'chat';
    default:
      return 'other';
  }
}
