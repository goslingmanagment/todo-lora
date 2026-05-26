import type { ContentProductionStatus } from '@/drizzle/schema/enums';

export const CONTENT_PRODUCTION_STATUSES: ContentProductionStatus[] = [
  'planned',
  'shot',
  'editing',
  'ready',
  'posted',
];

export const CONTENT_PRODUCTION_LABELS_RU: Record<ContentProductionStatus, string> = {
  planned: 'План',
  shot: 'Снято',
  editing: 'Монтаж',
  ready: 'Готово',
  posted: 'Опубликовано',
};
