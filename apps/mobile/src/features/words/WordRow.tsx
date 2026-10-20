import { Image, Pressable, Text, View } from 'react-native';
import { MAX_LEVEL, type Word, wordSummary } from '@blitz/core/word.ts';
import { useTheme } from '../../theme/Theme';
import { articleColour, FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Label, LevelDots } from '../../ui/kit';

/** One word in the list: the picture or its initial, the word, what it means, its level. */
export function WordRow({ word, onPress }: { word: Word; onPress: () => void }) {
  const { palette } = useTheme();
  const summary = wordSummary(word);
  const photo = typeof word.photo === 'string' ? word.photo : null;
  const article = articleColour(palette, word.article);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${word.article ? `${word.article} ` : ''}${word.term}, ${word.type}. ${summary}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingVertical: SPACE.md,
        paddingHorizontal: SPACE.md,
        borderRadius: RADIUS.md,
        backgroundColor: pressed ? palette.iconHover : 'transparent',
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: RADIUS.sm,
          backgroundColor: palette.iconBackground,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.lg, color: article ?? palette.muted }}>
            {word.term.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          {word.article ? (
            <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.md, color: article }}>{word.article} </Text>
          ) : null}
          <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.lg, color: palette.foreground }}>{word.term}</Text>
          <Label style={{ marginLeft: SPACE.sm, textTransform: 'none' }}>{word.type}</Label>
        </View>
        {summary ? (
          <Body numberOfLines={1} style={{ color: palette.muted, fontSize: TEXT.sm }}>
            {summary}
          </Body>
        ) : null}
      </View>

      <LevelDots level={word.level} max={MAX_LEVEL} />
    </Pressable>
  );
}
