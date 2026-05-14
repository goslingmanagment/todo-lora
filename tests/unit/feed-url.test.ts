import { describe, expect, it } from 'vitest';
import { buildFeedHref } from '@/lib/feed/url';

describe('buildFeedHref', () => {
  it('omits default feed state', () => {
    expect(buildFeedHref()).toBe('/');
    expect(buildFeedHref({ view: 'grid', filter: 'all', urgent: false })).toBe('/');
  });

  it('preserves non-default feed state in a stable order', () => {
    expect(
      buildFeedHref({
        view: 'sidebar',
        topic: 'sets',
        filter: 'today',
        urgent: true,
        search: '  buyer  ',
      }),
    ).toBe('/?view=sidebar&topic=sets&filter=today&urgent=1&q=buyer');
  });

  it('only carries topic for sidebar URLs', () => {
    expect(buildFeedHref({ view: 'grid', topic: 'sets' })).toBe('/');
    expect(buildFeedHref({ view: 'cockpit', topic: 'sets' })).toBe('/?view=cockpit');
  });
});
