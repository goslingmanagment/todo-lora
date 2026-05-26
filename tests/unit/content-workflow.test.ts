import { describe, expect, it } from 'vitest';
import {
  CONTENT_TASK_PRESETS,
  chooseContentTopicId,
  contentTopics,
  defaultContentDestinationForTopic,
  topicIdForContentPreset,
} from '@/lib/domain/contentWorkflow';

const topics = [
  { id: 'customs-id', name: 'Customs', slug: 'customs' },
  { id: 'sets-id', name: 'Sets', slug: 'sets' },
  { id: 'life-id', name: 'Life', slug: 'life' },
  { id: 'ppv-id', name: 'PPV', slug: 'ppv' },
];

describe('content workflow topics', () => {
  it('keeps Customs out of content categories', () => {
    expect(contentTopics(topics).map((topic) => topic.slug)).toEqual(['sets', 'life', 'ppv']);
  });

  it('ignores a saved Customs preference for content tasks', () => {
    expect(chooseContentTopicId(topics, 'customs-id')).toBe('ppv-id');
  });

  it('maps content presets to their topic', () => {
    const life = CONTENT_TASK_PRESETS.find((preset) => preset.id === 'life-photo');
    expect(life).toBeTruthy();
    expect(life ? topicIdForContentPreset(topics, life) : null).toBe('life-id');
  });

  it('derives a default destination from content category', () => {
    expect(defaultContentDestinationForTopic(topics, 'ppv-id')).toBe('of_ppv');
    expect(defaultContentDestinationForTopic(topics, 'sets-id')).toBe('of_wall');
    expect(defaultContentDestinationForTopic(topics, 'life-id')).toBe('chat');
  });
});
