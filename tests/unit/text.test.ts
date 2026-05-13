import { describe, expect, it } from 'vitest';
import { tokenizeLinkified } from '@/lib/format/text';

describe('tokenizeLinkified', () => {
  it('returns a single empty text segment for empty input', () => {
    expect(tokenizeLinkified('')).toEqual([{ kind: 'text', value: '' }]);
  });

  it('returns a single text segment when no URLs are present', () => {
    expect(tokenizeLinkified('просто текст без ссылок')).toEqual([
      { kind: 'text', value: 'просто текст без ссылок' },
    ]);
  });

  it('extracts a single https URL', () => {
    expect(tokenizeLinkified('see https://example.com/path')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'url', value: 'https://example.com/path' },
    ]);
  });

  it('extracts a single http URL surrounded by text', () => {
    expect(tokenizeLinkified('before http://x.example after')).toEqual([
      { kind: 'text', value: 'before ' },
      { kind: 'url', value: 'http://x.example' },
      { kind: 'text', value: ' after' },
    ]);
  });

  it('extracts multiple URLs separated by whitespace', () => {
    const segs = tokenizeLinkified('a https://one.example and b https://two.example/page');
    expect(segs).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'url', value: 'https://one.example' },
      { kind: 'text', value: ' and b ' },
      { kind: 'url', value: 'https://two.example/page' },
    ]);
  });

  it('strips adjacent punctuation (period, comma, parens, quotes)', () => {
    expect(tokenizeLinkified('see https://example.com.')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'url', value: 'https://example.com' },
      { kind: 'text', value: '.' },
    ]);

    expect(tokenizeLinkified('(см. https://example.com/path)')).toEqual([
      { kind: 'text', value: '(см. ' },
      { kind: 'url', value: 'https://example.com/path' },
      { kind: 'text', value: ')' },
    ]);

    expect(tokenizeLinkified('«https://x.example/y»')).toEqual([
      { kind: 'text', value: '«' },
      { kind: 'url', value: 'https://x.example/y' },
      { kind: 'text', value: '»' },
    ]);
  });

  it('keeps query strings, fragments, and trailing slashes intact', () => {
    expect(tokenizeLinkified('go https://x.example/a/b?c=1&d=2#frag')).toEqual([
      { kind: 'text', value: 'go ' },
      { kind: 'url', value: 'https://x.example/a/b?c=1&d=2#frag' },
    ]);
    expect(tokenizeLinkified('https://x.example/')).toEqual([
      { kind: 'url', value: 'https://x.example/' },
    ]);
  });

  it('does not linkify ftp://, javascript:, or schemeless www.', () => {
    expect(tokenizeLinkified('ftp://x.example/file')).toEqual([
      { kind: 'text', value: 'ftp://x.example/file' },
    ]);
    expect(tokenizeLinkified('javascript:alert(1)')).toEqual([
      { kind: 'text', value: 'javascript:alert(1)' },
    ]);
    expect(tokenizeLinkified('visit www.example.com')).toEqual([
      { kind: 'text', value: 'visit www.example.com' },
    ]);
  });
});
