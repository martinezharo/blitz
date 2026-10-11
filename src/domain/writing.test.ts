import { describe, expect, it } from 'vitest';
import { markMistakes, segments, sentenceFixes } from './writing.ts';

const mistake = (wrong: string, right: string, kind = 'grammar', word = '') => ({ wrong, right, kind, word, why: 'Because' });

describe('markMistakes', () => {
  it('finds each mistake in the text, in order', () => {
    const text = 'Ich habe ein Hund. Er spielt mit den Ball.';
    const { language, marks } = markMistakes(text, { language: 'de', mistakes: [mistake('ein Hund', 'einen Hund'), mistake('den Ball', 'dem Ball')] });
    expect(language).toBe('de');
    expect(marks.map((mark) => text.slice(mark.start, mark.end))).toEqual(['ein Hund', 'den Ball']);
  });

  it('drops what the text does not have, changes nothing, or overlaps', () => {
    const text = 'Wir gehen in den Park.';
    const { marks } = markMistakes(text, {
      language: 'de',
      mistakes: [mistake('in die Park', 'in den Park'), mistake('gehen', 'gehen'), mistake('in den', 'in dem'), mistake('den Park', 'dem Park')],
    });
    expect(marks.map((mark) => mark.wrong)).toEqual(['in den']);
  });

  it('only matches whole words', () => {
    const text = 'Die Liste ist lang.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('ist', 'war')] });
    expect(marks[0]!.start).toBe(10);
  });

  it('marks a word written wrong twice, twice', () => {
    const text = 'Ich mag hunde. Meine Schwester mag hunde auch.';
    const { marks } = markMistakes(text, {
      language: 'de',
      mistakes: [mistake('hunde', 'Hunde', 'spelling', 'Hund'), mistake('hunde', 'Hunde', 'spelling', 'Hund')],
    });
    expect(marks.map((mark) => mark.start)).toEqual([8, 35]);
    expect(marks.every((mark) => mark.word === 'Hund')).toBe(true);
  });

  it('only offers single words to save', () => {
    const { marks } = markMistakes('Ich bin gut zu fus.', { language: 'de', mistakes: [mistake('zu fus', 'zu Fuß', 'spelling', 'zu Fuß'), mistake('Ich', 'Ich')] });
    expect(marks[0]!.word).toBeNull();
  });

  it('reads anything unexpected as nonsense with no mistakes', () => {
    expect(markMistakes('Hallo', null)).toEqual({ language: 'nonsense', marks: [] });
    expect(markMistakes('Hallo', { language: 'xx', mistakes: 'no' })).toEqual({ language: 'nonsense', marks: [] });
  });
});

describe('segments', () => {
  it('cuts the text into plain and marked runs', () => {
    const text = 'Ich habe ein Hund.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('ein Hund', 'einen Hund')] });
    expect(segments(text, marks).map((segment) => [segment.text, segment.mark !== null])).toEqual([
      ['Ich habe ', false],
      ['ein Hund', true],
      ['.', false],
    ]);
  });
});

describe('sentenceFixes', () => {
  it('keeps the sentences with a grammar mistake, corrected in full', () => {
    const text = 'Ich habe ein Hund und er ist sehr groß.  Er ist toll! Er spielt gern mit den bal.\nGestern wir waren im Park';
    const { marks } = markMistakes(text, {
      language: 'de',
      mistakes: [mistake('ein Hund', 'einen Hund'), mistake('den', 'dem'), mistake('bal', 'Ball', 'spelling', 'Ball'), mistake('Gestern wir waren', 'Gestern waren wir')],
    });
    const fixes = sentenceFixes(text, marks);
    expect(fixes.map(({ written, corrected }) => [written, corrected])).toEqual([
      ['Ich habe ein Hund und er ist sehr groß.', 'Ich habe einen Hund und er ist sehr groß.'],
      ['Er spielt gern mit den bal.', 'Er spielt gern mit dem Ball.'],
      ['Gestern wir waren im Park', 'Gestern waren wir im Park'],
    ]);
    // Spelling is corrected but not listed; each fix points at itself in both sentences.
    const second = fixes[1]!;
    expect(second.fixes).toHaveLength(1);
    expect(second.written.slice(...second.fixes[0]!.from)).toBe('den');
    expect(second.corrected.slice(...second.fixes[0]!.to)).toBe('dem');
  });

  it('does not end a sentence inside a number or after a short form', () => {
    const text = 'Ich habe z.B. 3.5 Kilo Äpfel gekauft und es war ein gute Tag. Danach usw. war es spät.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('ein gute Tag', 'ein guter Tag')] });
    expect(sentenceFixes(text, marks).map((fix) => fix.written)).toEqual(['Ich habe z.B. 3.5 Kilo Äpfel gekauft und es war ein gute Tag.']);
  });

  it('does not end a sentence at spaced short forms or ordinals', () => {
    const text = 'Am 1. Januar hat es z. B. viel geschneit und wir hat gespielt. Das war schön.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('wir hat', 'wir haben')] });
    expect(sentenceFixes(text, marks).map((fix) => fix.written)).toEqual(['Am 1. Januar hat es z. B. viel geschneit und wir hat gespielt.']);
  });

  it.each([
    'Am 1. Advent hat er ein Geschenk bekommt.',
    'Er spielt in der 1. Bundesliga und hat ein Geschenk bekommt.',
    'Im 2. Weltkrieg hat er ein Geschenk bekommt.',
    'Für den 1. Preis hat er ein Geschenk bekommt.',
    'Bei der 125. Vorstellung hat er ein Geschenk bekommt.',
    'Nach seiner erfolgreichen 3. Probe hat er ein Geschenk bekommt.',
  ])('keeps the full sentence around an ordinal: %s', (written) => {
    const text = `${written} Das war schön.`;
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('bekommt', 'bekommen')] });
    const fixes = sentenceFixes(text, marks);
    expect(fixes.map(({ written, corrected }) => [written, corrected])).toEqual([[written, written.replace('bekommt', 'bekommen')]]);
    expect(fixes[0]!.written.slice(...fixes[0]!.fixes[0]!.from)).toBe('bekommt');
    expect(fixes[0]!.corrected.slice(...fixes[0]!.fixes[0]!.to)).toBe('bekommen');
  });

  it.each(['Das war 1989.', 'Das kostet 2.', 'Wir fahren um 8.', 'Das Auto hat die Nummer 2.'])('still ends a sentence at a number that closes it: %s', (first) => {
    const text = `${first} Damals wir hatten kein Handy.`;
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('Damals wir hatten', 'Damals hatten wir')] });
    expect(sentenceFixes(text, marks).map((fix) => fix.written)).toEqual(['Damals wir hatten kein Handy.']);
  });

  it.each([
    ['In Mathe habe ich eine 2.', 'Danach wir hatten kein Handy.', 'Danach wir hatten', 'Danach hatten wir'],
    ['In Mathe habe ich eine 1.', 'Peter hat ein Geschenk bekommt.', 'bekommt', 'bekommen'],
    ['Die Lösung ist die 2.', 'Sie hat ein Geschenk bekommt.', 'bekommt', 'bekommen'],
    ['Meine Note ist meine 2.', 'Danach wir hatten kein Handy.', 'Danach wir hatten', 'Danach hatten wir'],
  ])('ends a sentence after a determiner and a cardinal: %s', (first, written, wrong, right) => {
    const text = `${first} ${written}`;
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake(wrong, right)] });
    expect(sentenceFixes(text, marks).map(({ written, corrected }) => [written, corrected])).toEqual([[written, written.replace(wrong, right)]]);
  });

  it('keeps a mark that runs across two sentences whole', () => {
    const text = 'Ich bin müde. weil ich spät ins Bett ging.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('müde. weil', 'müde, weil')] });
    expect(sentenceFixes(text, marks).map((fix) => [fix.written, fix.corrected])).toEqual([[text, 'Ich bin müde, weil ich spät ins Bett ging.']]);
  });

  it('leaves out sentences with only spelling mistakes', () => {
    const text = 'Ich mag hunde.';
    const { marks } = markMistakes(text, { language: 'de', mistakes: [mistake('hunde', 'Hunde', 'spelling', 'Hund')] });
    expect(sentenceFixes(text, marks)).toEqual([]);
  });
});
