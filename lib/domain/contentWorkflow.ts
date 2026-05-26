import type { ContentDestination } from '@/drizzle/schema/enums';
import { destinationForTopicSlug } from '@/lib/domain/contentDestination';

export type TopicLike = {
  id: string;
  name: string;
  slug: string;
};

export type ContentTaskPreset = {
  id: string;
  label: string;
  topicSlug: string;
  destination: ContentDestination;
  title: string;
  photoCountText: string;
  durationText: string;
  description: string;
};

export const CUSTOMS_TOPIC_SLUG = 'customs';

const CONTENT_TOPIC_FALLBACK_ORDER = [
  'ppv',
  'sets',
  'life',
  'fyp',
  'reddit',
  'instagram',
  'pictures',
  'sextings',
];

export const CONTENT_TASK_PRESETS: ContentTaskPreset[] = [
  {
    id: 'ppv-bundle',
    label: 'PPV-бандл',
    topicSlug: 'ppv',
    destination: 'of_ppv',
    title: 'PPV-бандл',
    photoCountText: '5-15',
    durationText: '5-10',
    description: [
      'Задача:',
      'Снять комплект для платной рассылки или стены: тизерный фотосет + короткое видео.',
      '',
      'Контент / примечания:',
      '- сюжет и ключевые акценты',
      '- образ / реквизит',
      '- референсы и что обязательно учесть',
    ].join('\n'),
  },
  {
    id: 'photo-set',
    label: 'Photo set',
    topicSlug: 'sets',
    destination: 'of_wall',
    title: 'Photo set',
    photoCountText: '5-15',
    durationText: '',
    description: [
      'Задача:',
      'Снять фотосет: тизер + платный сет.',
      '',
      'Контент / примечания:',
      '- разные ракурсы, планы и детали',
      '- идея / сюжет',
      '- образ / реквизит',
      '- референсы',
    ].join('\n'),
  },
  {
    id: 'life-photo',
    label: 'Life-photo',
    topicSlug: 'life',
    destination: 'chat',
    title: 'Life-photo',
    photoCountText: '10-15',
    durationText: '',
    description: [
      'Задача:',
      'Снять лайф-фото для имитации "снято прямо сейчас" в чате.',
      '',
      'Контент / примечания:',
      '- 2-3 мини-сюжета',
      '- естественные бытовые сцены',
      '- разные ракурсы и планы',
      '- добавить фото деталей',
    ].join('\n'),
  },
  {
    id: 'sfw-reddit',
    label: 'SFW / Reddit',
    topicSlug: 'reddit',
    destination: 'reddit',
    title: 'SFW контент',
    photoCountText: '10',
    durationText: '',
    description: [
      'Задача:',
      'Снять SFW-контент для Reddit / прогрева.',
      '',
      'Контент / примечания:',
      '- короткое видео при необходимости',
      '- тема / образ',
      '- площадка и папка сдачи',
      '- что должно быть видно в кадре',
    ].join('\n'),
  },
  {
    id: 'fyp',
    label: 'FYP',
    topicSlug: 'fyp',
    destination: 'tiktok',
    title: 'FYP контент',
    photoCountText: '',
    durationText: '',
    description: [
      'Задача:',
      'Снять короткие вертикальные ролики для FYP.',
      '',
      'Контент / примечания:',
      '- количество роликов',
      '- длительность / формат',
      '- хуки / идеи',
      '- образ',
      '- папка сдачи',
    ].join('\n'),
  },
  {
    id: 'chat-pack',
    label: 'Chat pack',
    topicSlug: 'sextings',
    destination: 'chat',
    title: 'Chat pack',
    photoCountText: '',
    durationText: '',
    description: [
      'Задача:',
      'Подготовить набор контента для чата.',
      '',
      'Контент / примечания:',
      '- фото / короткие клипы',
      '- несколько мини-сюжетов',
      '- сценарии использования',
      '- ограничения',
      '- папка сдачи',
    ].join('\n'),
  },
];

export function isContentTopic(topic: TopicLike): boolean {
  return topic.slug !== CUSTOMS_TOPIC_SLUG;
}

export function contentTopics(topics: TopicLike[]): TopicLike[] {
  return topics.filter(isContentTopic);
}

export function chooseContentTopicId(
  topics: TopicLike[],
  preferredTopicId: string | null | undefined,
): string | null {
  const available = contentTopics(topics);
  if (preferredTopicId && available.some((topic) => topic.id === preferredTopicId)) {
    return preferredTopicId;
  }

  for (const slug of CONTENT_TOPIC_FALLBACK_ORDER) {
    const match = available.find((topic) => topic.slug === slug);
    if (match) return match.id;
  }

  return available[0]?.id ?? null;
}

export function topicIdForContentPreset(
  topics: TopicLike[],
  preset: Pick<ContentTaskPreset, 'topicSlug'>,
): string | null {
  return contentTopics(topics).find((topic) => topic.slug === preset.topicSlug)?.id ?? null;
}

export function firstContentPresetForTopic(
  topics: TopicLike[],
  topicId: string,
): ContentTaskPreset | null {
  const topic = contentTopics(topics).find((candidate) => candidate.id === topicId);
  if (!topic) return null;
  return CONTENT_TASK_PRESETS.find((preset) => preset.topicSlug === topic.slug) ?? null;
}

export function defaultContentDestinationForTopic(
  topics: TopicLike[],
  topicId: string | null | undefined,
): ContentDestination {
  const topic = contentTopics(topics).find((candidate) => candidate.id === topicId);
  return destinationForTopicSlug(topic?.slug);
}
