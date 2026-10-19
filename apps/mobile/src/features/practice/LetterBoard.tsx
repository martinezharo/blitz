import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dropLetter, fillLetters, misplacedTiles } from '@blitz/core/practice.ts';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';

export type Slots = (number | null)[];

export const emptySlots = (tiles: string[]): Slots => tiles.map(() => null);

/**
 * Letters to put in order, in the free spots between the ones already given.
 *
 * The web version can drag a letter into place. A thumb does the same thing by
 * tapping: a loose letter drops into the first free spot, a placed one goes
 * back to the row, and a wrong answer colours the letters that are out of place.
 */
export function LetterBoard({
  term,
  given,
  tiles,
  slots,
  onChange,
  locked,
  wrong,
}: {
  term: string;
  given: boolean[];
  tiles: string[];
  slots: Slots;
  onChange: (slots: Slots) => void;
  locked: boolean;
  wrong: boolean;
}) {
  const { palette } = useTheme();
  const [tilted, setTilted] = useState<number | null>(null);
  const misplaced = wrong ? misplacedTiles(term, given, tiles, slots) : [];

  function tap(tile: number) {
    if (locked) return;
    const at = slots.indexOf(tile);
    if (at >= 0) {
      sounds.lift();
      onChange(dropLetter(slots, tile, at, null));
      return;
    }
    const free = slots.indexOf(null);
    if (free < 0) return;
    sounds.place(free);
    onChange(dropLetter(slots, tile, null, free));
  }

  const placed = fillLetters(term, given, slots.map((tile) => (tile === null ? '' : tiles[tile]!)));

  // Each word of a compound is its own row, so a line break only ever falls between words.
  const words: { char: string; index: number }[][] = [[]];
  [...term].forEach((char, index) => {
    if (!/\s/.test(char)) words[words.length - 1]!.push({ char, index });
    else if (words[words.length - 1]!.length > 0) words.push([]);
  });

  let slot = 0;
  return (
    <View style={{ gap: SPACE.lg }} accessible accessibilityLabel={`Your word: ${placed || 'empty'}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' }}>
        {words
          .filter((letters) => letters.length > 0)
          .map((letters) => (
            <View key={letters[0]!.index} style={{ flexDirection: 'row', gap: 4 }}>
              {letters.map(({ char, index }) => {
                if (given[index]) {
                  return (
                    <View key={index} style={box(palette.line, palette.iconBackground)}>
                      <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.xl, color: palette.faint }}>{char}</Text>
                    </View>
                  );
                }
                const here = slot++;
                const tile = slots[here] ?? null;
                const isWrong = tile !== null && misplaced.includes(tile);
                return (
                  <Pressable
                    key={index}
                    onPress={() => {
                      if (tile !== null) tap(tile);
                    }}
                    accessibilityRole={tile === null ? undefined : 'button'}
                    accessibilityLabel={tile === null ? 'Empty spot' : `Letter ${tiles[tile] ?? ''}, tap to take it back`}
                    style={({ pressed }) => box(
                      isWrong ? palette.danger : palette.accent,
                      tile === null ? 'transparent' : palette.iconBackground,
                      pressed,
                    )}
                  >
                    <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.xl, color: palette.foreground }}>
                      {tile === null ? '' : tiles[tile]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' }}>
        {tiles.map((letter, tile) =>
          slots.includes(tile) ? (
            <View key={tile} style={box('transparent', 'transparent')} />
          ) : (
            <Pressable
              key={tile}
              onPress={() => tap(tile)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={`Letter ${letter}`}
              onPressIn={() => setTilted(tile)}
              onPressOut={() => setTilted(null)}
              style={({ pressed }) => [
                box(palette.line, palette.surface, pressed),
                {
                  transform: [{ rotate: tilted === tile ? '-4deg' : '0deg' }],
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                },
              ]}
            >
              <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.xl, color: palette.foreground }}>{letter}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

function box(border: string, background: string, pressed = false) {
  return {
    width: 38,
    height: 46,
    borderRadius: RADIUS.sm,
    borderWidth: border === 'transparent' ? 0 : 1.5,
    borderColor: border,
    borderStyle: 'dashed' as const,
    backgroundColor: background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: pressed ? 0.7 : 1,
  };
}
