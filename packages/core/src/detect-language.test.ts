import { describe, expect, it } from 'vitest';
import { guessLanguage } from './detect-language.ts';

describe('guessLanguage', () => {
  it('tells the languages apart from their little words', () => {
    expect(guessLanguage('Gestern bin ich mit meiner Freundin ins Kino gegangen, und es war sehr schön.')).toBe('de');
    expect(guessLanguage('Yesterday I went to the cinema with my friends and we watched a film.')).toBe('en');
    expect(guessLanguage('Hola, me llamo Oliver y vivo en Madrid. Me gusta mucho aprender idiomas.')).toBe('es');
    expect(guessLanguage("Bonjour, je m'appelle Marie et j'habite à Paris avec mon chat.")).toBe('fr');
    expect(guessLanguage('Ciao, mi chiamo Luca e sono molto contento di essere qui oggi.')).toBe('it');
  });

  it('keeps quiet when it cannot be sure', () => {
    expect(guessLanguage('Hallo Welt')).toBeNull();
    expect(guessLanguage('asdkj qwe lkjasd poiqwe zxcmnb')).toBeNull();
  });

  it('reads German with mistakes as German', () => {
    expect(guessLanguage('Ich habe ein Hund. Er ist sehr groß und er spielt gern mit den Ball.')).toBe('de');
  });
});
