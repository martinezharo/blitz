import { MAX_LEVEL, type Language, type Word, type WordType } from '../domain/word.ts';
import type { Correction } from '../domain/writing.ts';
import { db } from './db.ts';

/**
 * Development only: fills this browser with words that have nothing but a
 * photo, so practice shows photo clues at every level without adding words by
 * hand. Open the app with `?seed` for a mix of levels, `?seed=3` for every word
 * at level 3, or `?seed=clear` to remove them again. `?seed=grammar` instead
 * fills the grammar history with sentences, to try the review.
 *
 * Seeded words never get a `pending` row, but practising one does, so a
 * signed-in device is left alone: those answers would sync to the account.
 */

const PREFIX = 'seed-';

const WORDS: Record<Language, [term: string, type: WordType, article: string | null, color: string][]> = {
  de: [
    ['Bildschirm', 'noun', 'der', '#2a7be4'],
    ['Schwein', 'noun', 'das', '#e46a9b'],
    ['Kuh', 'noun', 'die', '#6b4f3a'],
    ['Regenschirm', 'noun', 'der', '#4b3fa8'],
    ['Erdbeere', 'noun', 'die', '#d63a3a'],
    ['laufen', 'verb', null, '#2e9e6a'],
  ],
  en: [
    ['screen', 'noun', null, '#2a7be4'],
    ['pig', 'noun', null, '#e46a9b'],
    ['umbrella', 'noun', null, '#4b3fa8'],
    ['strawberry', 'noun', null, '#d63a3a'],
    ['to run', 'verb', null, '#2e9e6a'],
  ],
};

/** [language, written, corrected, translation, [wrong, right, why][]]: fixes in the order they come. */
const SENTENCES: [Language, string, string, string | null, [string, string, string][]][] = [
  ['de', 'Ich habe ein Hund.', 'Ich habe einen Hund.', 'I have a dog.', [['ein', 'einen', 'Hund is masculine, so the accusative needs einen.']]],
  ['de', 'Gestern ich bin ins Kino gegangen.', 'Gestern bin ich ins Kino gegangen.', 'Yesterday I went to the cinema.', [['ich bin', 'bin ich', 'The verb comes second, after Gestern.']]],
  ['de', 'Wir fahren mit dem Zug nach Berlin, weil es ist billiger.', 'Wir fahren mit dem Zug nach Berlin, weil es billiger ist.', 'We take the train to Berlin because it is cheaper.', [['es ist billiger', 'es billiger ist', 'The verb goes to the end after weil.']]],
  ['de', 'Er hilft mich bei den Hausaufgaben.', 'Er hilft mir bei den Hausaufgaben.', 'He helps me with the homework.', [['mich', 'mir', 'helfen takes the dative.']]],
  ['de', 'Das ist der Buch von meinem Bruder.', 'Das ist das Buch von meinem Bruder.', null, [['der', 'das', 'Buch is neuter.']]],
  ['en', 'We was late and he go home.', 'We were late and he goes home.', null, [['was', 'were', 'Plural subject.'], ['go', 'goes', 'Third person singular.']]],
  ['en', 'She have two brothers.', 'She has two brothers.', null, [['have', 'has', 'Third person singular.']]],
  ['en', 'I am agree with you.', 'I agree with you.', null, [['am agree', 'agree', 'Agree is a verb, not an adjective.']]],
];

function sentence([language, written, corrected, translation, list]: (typeof SENTENCES)[number], index: number, now: number): Correction {
  let from = 0;
  let to = 0;
  return {
    id: `${PREFIX}fix-${language}-${index}`,
    language,
    written,
    corrected,
    ...(translation && { translation }),
    fixes: list.map(([wrong, right, why]) => {
      const start = written.indexOf(wrong, from);
      const place = corrected.indexOf(right, to);
      from = start + wrong.length;
      to = place + right.length;
      return { wrong, right, why, from: [start, from], to: [place, to] };
    }),
    createdAt: now - index,
    updatedAt: now - index,
  };
}

export async function seedFromUrl(): Promise<void> {
  const url = new URL(location.href);
  const value = url.searchParams.get('seed');
  if (value === null) return;
  url.searchParams.delete('seed');
  history.replaceState(null, '', url);

  if (await db.meta.get('owner')) {
    console.warn('[seed] Skipped: this device is signed in, and practising seed words would sync them.');
    return;
  }
  const old = (await db.words.toCollection().primaryKeys()).filter((id) => id.startsWith(PREFIX));
  await db.transaction('rw', db.words, db.pending, db.corrections, async () => {
    await db.words.bulkDelete(old);
    await db.pending.bulkDelete(old);
    await db.corrections.bulkDelete((await db.corrections.toCollection().primaryKeys()).filter((id) => id.startsWith(PREFIX)));
  });
  if (value === 'clear') return;
  if (value === 'grammar') {
    const now = Date.now();
    await db.corrections.bulkPut(SENTENCES.map((entry, index) => sentence(entry, index, now)));
    return;
  }

  const level = Number(value);
  const now = Date.now();
  const words: Word[] = [];
  for (const [language, entries] of Object.entries(WORDS) as [Language, (typeof WORDS)[Language]][]) {
    for (const [index, [term, type, article, color]] of entries.entries()) {
      words.push({
        id: `${PREFIX}${language}-${index}`,
        language,
        type,
        term,
        article,
        plural: null,
        translation: null,
        definition: null,
        photo: await photo(term, color),
        level: level >= 1 && level <= MAX_LEVEL ? level : (index % MAX_LEVEL) + 1,
        streak: 0,
        createdAt: now - index,
        updatedAt: now - index,
      });
    }
  }
  await db.words.bulkPut(words);
}

/** A flat square with the word's initial: enough to tell the pictures apart. */
function photo(term: string, color: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 400;
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 400, 400);
  context.fillStyle = '#fff';
  context.font = 'bold 200px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(term[0]!.toUpperCase(), 200, 210);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the seed photo'))), 'image/webp', 0.75),
  );
}
