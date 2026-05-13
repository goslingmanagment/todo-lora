/**
 * Ad-hoc smoke for `inferCustomTaskTitle` against real Telegram exports.
 * Run: `pnpm exec tsx scripts/test-titles-inline.ts`
 * Delete after the user is satisfied with the title generator.
 */
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';

const cases = [
  {
    name: 'vloppers2 — Fansly URL, brief + range duration',
    input: {
      buyerHandle: 'https://fansly.com/vloppers2/posts',
      buyerDisplayName: null,
      briefDescription:
        'Самое главное в видео - черные колготки, фокус на этом\n\nТизинг, движения, разные углы в колготках',
      clothingDescription: 'Прозрачный топ со скрина + черные колготки без трусиков',
      durationText: '7-8 минут',
    },
  },
  {
    name: 'Mbac22 — Fansly URL, English brief',
    input: {
      buyerHandle: 'https://fansly.com/Mbac22/posts',
      buyerDisplayName: null,
      briefDescription:
        'Nude yoga\nНужно сделать растяжку/йогу, и с каждой сменой позы снимать какой то элемент одежды',
      clothingDescription: 'какой то спортивный вайб',
      durationText: '10-12 минут',
    },
  },
  {
    name: 'Marvel — OnlyFans URL with display name',
    input: {
      buyerHandle: 'https://onlyfans.com/u545288581',
      buyerDisplayName: 'Marvel',
      briefDescription: 'написать на груди Marvel, пару фото с надписью в лифчике и пару без лифчика',
      clothingDescription: 'лиф со скрина',
      durationText: '5-7 фото',
    },
  },
  {
    name: 'Sam — Fansly with name, single-number duration',
    input: {
      buyerHandle: 'https://fansly.com/kfq094',
      buyerDisplayName: 'Sam',
      briefDescription:
        'Надень милый наряд и медицинскую(закрывающая рот) маску чтобы показать глаза',
      clothingDescription: 'лук со скрина',
      durationText: '5 минут',
    },
  },
  {
    name: 'user863848... — long URL handle, no display name',
    input: {
      buyerHandle: 'https://fansly.com/user863848546158272512/posts',
      buyerDisplayName: null,
      briefDescription:
        'покрутится перед камерой, показать с разных сторон. \nне забыть показать каблуки',
      clothingDescription:
        'кружевное белье(корсет и чулки) - черное), мини юбка, каблуки',
      durationText: '2 минуты',
    },
  },
  {
    name: 'Tall_Bob — Fansly URL, full Russian brief',
    input: {
      buyerHandle: 'https://fansly.com/Tall_Bob/posts',
      buyerDisplayName: null,
      briefDescription:
        'Медленный тизинг называя имя("hey Bob", "do you like me Bob?"), стриптиз, снять все но оставить чулки',
      clothingDescription: 'Референс аутфита на приложенном скрине, чулки',
      durationText: '10 минут',
    },
  },
  {
    name: 'edge: only @handle, no description',
    input: {
      buyerHandle: '@nodesc',
      buyerDisplayName: null,
      briefDescription: '',
      clothingDescription: '',
      durationText: '',
    },
  },
  {
    name: 'edge: brief starts with section heading',
    input: {
      buyerHandle: '@stripped',
      buyerDisplayName: null,
      briefDescription: 'Описание задания:\nКреативное задание ниже',
      clothingDescription: '',
      durationText: '4',
    },
  },
  {
    name: 'edge: super-long first line is truncated',
    input: {
      buyerHandle: '@long',
      buyerDisplayName: null,
      briefDescription:
        'Тут очень длинное-длинное-длинное описание которое явно перевалит за 64 символа и должно быть обрезано с многоточием на конце',
      clothingDescription: '',
      durationText: '12',
    },
  },
];

let pad = 0;
for (const c of cases) pad = Math.max(pad, c.name.length);
for (const c of cases) {
  const out = inferCustomTaskTitle(c.input);
  console.log(`${c.name.padEnd(pad)}  →  ${out}`);
}
