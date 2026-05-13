const MAX_TITLE_LENGTH = 200;
const MAX_FOCUS_LENGTH = 64;

type CustomTitleInput = {
  buyerHandle: string;
  buyerDisplayName?: string | null;
  contentKind?: 'video' | 'photo' | null;
  briefDescription?: string | null;
  clothingDescription?: string | null;
  durationText?: string | null;
  photoCountText?: string | null;
};

function compactText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function handleFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const segment = url.pathname
      .split('/')
      .map((part) => part.trim())
      .find((part) => part.length > 0 && part.toLowerCase() !== 'posts');
    if (!segment) return null;
    return `@${decodeURIComponent(segment)}`;
  } catch {
    return null;
  }
}

function buyerLabel(handle: string, displayName?: string | null): string {
  const display = compactText(displayName);
  if (display) return display;

  const rawHandle = compactText(handle);
  if (!rawHandle) return 'покупателя';

  const fromUrl = handleFromUrl(rawHandle);
  if (fromUrl) return fromUrl;
  if (rawHandle.startsWith('@')) return rawHandle;
  return rawHandle;
}

function stripLineNoise(value: string): string {
  return compactText(value)
    .replace(/^[\s*"“”'«»*.,:;!?-]+/, '')
    .replace(/[\s*"“”'«»*]+$/, '');
}

function isSectionHeading(value: string): boolean {
  return /^(описание|описание задания|одежда|заметки|дата|покупатель|оплата|длительность|срочность|сроки|фразы(,| которые)?)/i.test(
    value,
  );
}

function firstUsefulLine(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    for (const rawLine of (value ?? '').split(/\r?\n/)) {
      const line = stripLineNoise(rawLine);
      if (line.length < 3) continue;
      if (isSectionHeading(line)) continue;
      return truncate(line, MAX_FOCUS_LENGTH);
    }
  }
  return null;
}

function durationLabel(value: string | null | undefined): string | null {
  const raw = compactText(value);
  if (!raw) return null;

  const range = raw.match(/^(\d+)\s*[-–—]\s*(\d+)(?:\s*(?:мин\.?|минута|минуты|минут))?$/i);
  if (range) return `${range[1]}-${range[2]} мин`;

  const single = raw.match(/^(\d+)(?:\s*(?:мин\.?|минута|минуты|минут))?$/i);
  if (single) return `${single[1]} мин`;

  return truncate(raw, 24);
}

function photoCountLabel(value: string | null | undefined): string | null {
  const raw = compactText(value);
  if (!raw) return null;

  const suffix = String.raw`\s*(?:фото|фотки|фоток|шт\.?|штук)?`;
  const range = raw.match(new RegExp(String.raw`^(\d+)\s*[-–—]\s*(\d+)${suffix}$`, 'i'));
  if (range) return `${range[1]}-${range[2]} фото`;

  const single = raw.match(new RegExp(String.raw`^(\d+)${suffix}$`, 'i'));
  if (single) return `${single[1]} фото`;

  return truncate(raw, 24);
}

export function inferCustomTaskTitle(input: CustomTitleInput): string {
  const buyer = buyerLabel(input.buyerHandle, input.buyerDisplayName);
  const focus = firstUsefulLine(input.briefDescription, input.clothingDescription);
  const spec =
    input.contentKind === 'photo'
      ? photoCountLabel(input.photoCountText)
      : durationLabel(input.durationText);

  const focusPart = focus ? ` - ${focus}` : '';
  const specPart = spec ? `, ${spec}` : '';
  return truncate(`Custom для ${buyer}${focusPart}${specPart}`, MAX_TITLE_LENGTH);
}
