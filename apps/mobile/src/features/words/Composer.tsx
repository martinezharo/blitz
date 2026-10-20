import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { PencilLine, Plus } from 'lucide-react-native';
import type { Suggestion } from '@blitz/core/dictionary.ts';
import { LANGUAGES, type Language } from '@blitz/core/word.ts';
import { lookup } from '../../data/dictionary';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { articleColour, FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Label } from '../../ui/kit';

/** What the new word's sheet opens with: what was typed, or the dictionary entry picked. */
export interface NewWord {
  term: string;
  suggestion?: Suggestion;
}

/**
 * The big line at the top: type a word, press + and the sheet opens with it.
 *
 * As you type, the dictionary offers words: the ones that start like it and,
 * for German, the ones that translate it. Picking one opens the sheet already
 * filled in. Under them, a last option adds what was typed as a custom word.
 */
export function Composer({ language, onAdd }: { language: Language; onAdd: (word: NewWord) => void }) {
  const { palette } = useTheme();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const spec = LANGUAGES[language];
  const label = `Add ${/^[aeiou]/i.test(spec.name) ? 'an' : 'a'} ${spec.name} word`;
  const ready = term.trim() !== '';
  const open = focused && !hidden && ready;

  useEffect(() => {
    let current = true;
    void lookup(language, term).then((found) => {
      if (current) setSuggestions(found);
    });
    return () => {
      current = false;
    };
  }, [language, term]);

  const custom = useMemo(() => term.trim(), [term]);

  function openSheet(word: NewWord) {
    sounds.open();
    setTerm('');
    setHidden(true);
    input.current?.blur();
    onAdd(word);
  }

  return (
    <View style={{ gap: SPACE.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          backgroundColor: palette.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: focused ? palette.accent : palette.line,
          paddingLeft: SPACE.lg,
          paddingRight: SPACE.sm,
          paddingVertical: SPACE.sm,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <PencilLine size={18} color={palette.muted} />
        <TextInput
          ref={input}
          value={term}
          onChangeText={(text) => {
            setTerm(text);
            setHidden(false);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={label}
          placeholderTextColor={palette.faint}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => {
            if (ready) openSheet({ term: custom });
            else sounds.nudge();
          }}
          style={{ flex: 1, fontFamily: FONTS.strong, fontSize: TEXT.lg, color: palette.foreground, paddingVertical: SPACE.sm }}
        />
        <Pressable
          onPress={() => {
            if (ready) openSheet({ term: custom });
            else {
              sounds.nudge();
              input.current?.focus();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Add word"
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: RADIUS.pill,
            backgroundColor: ready ? palette.accent : palette.iconBackground,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Plus size={20} color={ready ? palette.buttonForeground : palette.muted} />
        </Pressable>
      </View>

      {open && (
        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: 'hidden',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={`${suggestion.term}-${suggestion.type}-${index}`}
              onPress={() => openSheet({ term: suggestion.term, suggestion })}
              style={({ pressed }) => ({
                paddingHorizontal: SPACE.lg,
                paddingVertical: SPACE.md,
                backgroundColor: pressed ? palette.iconHover : 'transparent',
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: palette.line,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs }}>
                {spec.articles && suggestion.article ? (
                  <Label style={{ color: articleColour(palette, suggestion.article), textTransform: 'none', fontSize: TEXT.xs }}>
                    {suggestion.article}
                  </Label>
                ) : null}
                <Body style={{ fontFamily: FONTS.strong, fontSize: TEXT.lg }}>{suggestion.term}</Body>
                {suggestion.plural ? <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>pl. {suggestion.plural}</Body> : null}
                <View style={{ flex: 1 }} />
                <Label style={{ textTransform: 'none' }}>{suggestion.type}</Label>
              </View>
              <Body numberOfLines={1} style={{ color: palette.muted, fontSize: TEXT.sm }}>
                {suggestion.translation ?? suggestion.definition}
              </Body>
            </Pressable>
          ))}
          <Pressable
            onPress={() => openSheet({ term: custom })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
              backgroundColor: pressed ? palette.iconHover : 'transparent',
              borderTopWidth: suggestions.length > 0 ? 1 : 0,
              borderTopColor: palette.line,
            })}
          >
            <Plus size={15} color={palette.muted} />
            <Body style={{ fontSize: TEXT.md }}>
              Add <Body style={{ fontFamily: FONTS.black }}>{custom}</Body> as a custom word
            </Body>
          </Pressable>
        </View>
      )}
    </View>
  );
}
