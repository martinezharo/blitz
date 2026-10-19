import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Archive, ArrowRight, ChevronDown, ListPlus, Play } from 'lucide-react-native';
import { lessonLength, mastery } from '@blitz/core/practice.ts';
import { LANGUAGES, type Language, type Word, type WordSort, sortWords } from '@blitz/core/word.ts';
import { useSyncStatus } from '../../data/hooks';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Column, Label, Title } from '../../ui/kit';
import { Composer, type NewWord } from './Composer';
import { SortSheet } from './SortSheet';
import { WordRow } from './WordRow';
import { ARROW, WORD_SORTS } from './sort-options';

/** Every word of the language, with the way in: type one, or take a ready-made list. */
export function WordsScreen({
  language,
  words,
  sort,
  onSortChange,
  onAdd,
  onOpenWord,
  onBrowseLists,
  onPractice,
}: {
  language: Language;
  words: Word[];
  sort: WordSort;
  onSortChange: (sort: WordSort) => void;
  onAdd: (word: NewWord) => void;
  onOpenWord: (word: Word) => void;
  onBrowseLists: () => void;
  onPractice: () => void;
}) {
  const { palette } = useTheme();
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [sorting, setSorting] = useState(false);
  const sync = useSyncStatus();
  const sorted = useMemo(() => sortWords(words, sort, language), [words, sort, language]);
  const active = sorted.filter((word) => !word.archived);
  const archived = sorted.filter((word) => word.archived);
  const { points, max } = mastery(words);
  const CurrentSort = ARROW[sort];
  const sortLabel = WORD_SORTS.find((option) => option.value === sort)?.label ?? '';

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 140, gap: SPACE.lg }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Column style={{ gap: SPACE.lg, paddingTop: SPACE.sm }}>
          <Composer language={language} onAdd={onAdd} />

          {words.length === 0 ? (
            <Empty language={language} onBrowseLists={onBrowseLists} />
          ) : (
            <>
              <Pressable
                onPress={() => {
                  sounds.open();
                  onBrowseLists();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.md,
                  borderRadius: RADIUS.pill,
                  backgroundColor: palette.iconBackground,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <ListPlus size={16} color={palette.muted} />
                <Body style={{ flex: 1, color: palette.muted, fontSize: TEXT.sm }}>Ready-made word lists</Body>
                <ArrowRight size={15} color={palette.faint} />
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <View
                    style={{
                      height: 6,
                      width: 64,
                      borderRadius: 3,
                      backgroundColor: palette.line,
                      overflow: 'hidden',
                    }}
                  >
                    <View style={{ height: 6, width: `${(points / Math.max(1, max)) * 100}%`, backgroundColor: palette.accent }} />
                  </View>
                  <Label style={{ textTransform: 'none' }}>
                    {points} / {max}
                  </Label>
                </View>
                <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
                  {active.length} {active.length === 1 ? 'word' : 'words'}
                </Body>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => {
                    sounds.tap();
                    setSorting(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort words: ${sortLabel}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.xs,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm,
                    borderRadius: RADIUS.pill,
                    backgroundColor: pressed ? palette.iconHover : palette.iconBackground,
                  })}
                >
                  <CurrentSort size={15} color={palette.muted} />
                  <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{sortLabel}</Body>
                  <ChevronDown size={13} color={palette.faint} />
                </Pressable>
              </View>

              {active.length > 0 ? (
                <View>
                  {active.map((word) => (
                    <WordRow key={word.id} word={word} onPress={() => {
                      sounds.open();
                      onOpenWord(word);
                    }} />
                  ))}
                </View>
              ) : (
                <Body style={{ color: palette.muted }}>Every word is archived. Add a new one to practise again.</Body>
              )}

              {archived.length > 0 && (
                <View style={{ gap: SPACE.sm }}>
                  <Pressable
                    onPress={() => {
                      sounds.toggle(!archivedOpen);
                      setArchivedOpen(!archivedOpen);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      paddingVertical: SPACE.sm,
                    }}
                  >
                    <Archive size={15} color={palette.muted} />
                    <Label style={{ textTransform: 'none', fontSize: TEXT.sm }}>Archived</Label>
                    <View style={{ paddingHorizontal: 7, borderRadius: 99, backgroundColor: palette.iconBackground }}>
                      <Body style={{ fontSize: TEXT.xs, color: palette.muted }}>{archived.length}</Body>
                    </View>
                    <View style={{ flex: 1 }} />
                    <ChevronDown
                      size={15}
                      color={palette.faint}
                      style={{ transform: [{ rotate: archivedOpen ? '180deg' : '0deg' }] }}
                    />
                  </Pressable>
                  {archivedOpen
                    ? archived.map((word) => (
                        <WordRow key={word.id} word={word} onPress={() => {
                          sounds.open();
                          onOpenWord(word);
                        }} />
                      ))
                    : null}
                </View>
              )}
            </>
          )}
        </Column>
      </ScrollView>

      <PracticeDock words={active.length} onStart={onPractice} sync={sync} />

      {sorting && <SortSheet sort={sort} onChange={onSortChange} onClose={() => setSorting(false)} />}
    </>
  );
}

function Empty({ language, onBrowseLists }: { language: Language; onBrowseLists: () => void }) {
  const { palette } = useTheme();
  const spec = LANGUAGES[language];
  return (
    <View style={{ alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE['3xl'] }}>
      <Title small>{spec.flag}</Title>
      <Title small>No {spec.name} words yet</Title>
      <Body style={{ color: palette.muted }}>Write your first one up there.</Body>
      <Button
        tone="quiet"
        onPress={() => {
          sounds.open();
          onBrowseLists();
        }}
        style={{ marginTop: SPACE.md }}
      >
        Start from a list
      </Button>
    </View>
  );
}

/** The way into a lesson, over the list on phones and in the column on wide screens. */
function PracticeDock({ words, onStart, sync }: { words: number; onStart: () => void; sync: string }) {
  const { palette } = useTheme();
  const ready = words > 0;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 78, alignItems: 'center', paddingHorizontal: SPACE.lg }}
    >
      <Pressable
        onPress={() => {
          if (!ready) return sounds.nudge();
          sounds.start();
          onStart();
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        style={({ pressed }) => ({
          width: '100%',
          maxWidth: 420,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.md,
          borderRadius: RADIUS.pill,
          backgroundColor: palette.buttonBackground,
          opacity: ready ? (pressed ? 0.9 : 1) : 0.5,
          shadowColor: '#000',
          shadowOpacity: 0.24,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        })}
      >
        <View style={{ flex: 1 }}>
          <Body style={{ fontFamily: FONTS.black, fontSize: TEXT.lg, color: palette.buttonForeground }}>Practice</Body>
          <Body style={{ color: palette.buttonMuted, fontSize: TEXT.xs }}>
            {ready ? `${lessonLength(words)} quick questions` : 'Add a word first'}
            {sync === 'offline' ? ' · offline' : ''}
          </Body>
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.pill,
            backgroundColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play size={17} color={palette.buttonForeground} />
        </View>
      </Pressable>
    </View>
  );
}
