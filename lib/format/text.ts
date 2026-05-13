/**
 * Text utilities for rendering operator-pasted content safely.
 */

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string };

/**
 * Splits `input` into alternating text / URL segments. Used by the detail
 * view to render `http(s)` URLs in pasted descriptions as clickable links
 * while keeping the rest as plain text.
 *
 * Rules:
 * - Only `http://` and `https://` are linkified (the same set
 *   `urlAttachmentSchema` accepts for URL attachments — keeps the policy
 *   consistent across the app).
 * - Trailing punctuation commonly attached to URLs in prose
 *   (`.,!?;:)]}\"'»`) is stripped from the matched URL and put back in the
 *   following text segment, so `"see https://a.example."` produces a link
 *   to `https://a.example` followed by a text `.`.
 * - Adjacent URLs separated by whitespace become separate link segments.
 * - Returns a single text segment for empty input.
 */
export function tokenizeLinkified(input: string): TextSegment[] {
  if (!input) return [{ kind: 'text', value: '' }];

  const re = /https?:\/\/[^\s<>]+/gi;
  const out: TextSegment[] = [];
  const trailing = /[.,!?;:)\]}>"'»]+$/;
  let lastIndex = 0;

  for (const m of input.matchAll(re)) {
    const start = m.index ?? 0;
    let url = m[0];
    let consumed = url.length;

    // Strip prose punctuation that almost certainly is not part of the URL.
    const tail = url.match(trailing);
    if (tail) {
      url = url.slice(0, -tail[0].length);
      consumed = url.length;
    }

    if (start > lastIndex) {
      out.push({ kind: 'text', value: input.slice(lastIndex, start) });
    }
    out.push({ kind: 'url', value: url });
    lastIndex = start + consumed;
  }

  if (lastIndex < input.length) {
    out.push({ kind: 'text', value: input.slice(lastIndex) });
  }

  // Normalise: if nothing matched, return a single text segment.
  if (out.length === 0) return [{ kind: 'text', value: input }];
  return out;
}
