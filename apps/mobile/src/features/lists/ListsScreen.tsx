import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Apple,
  ArrowLeft,
  Briefcase,
  Check,
  Lamp,
  LoaderCircle,
  Palette,
  PersonStanding,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { fillDraft, type Suggestion } from '@blitz/core/dictionary.ts';
import { knownWords, type ListSummary, type ListTint, savedKeys, suggestionOf } from '@blitz/core/lists.ts';
import { emptyDraft, LANGUAGES, type Language, type Word, wordSummary } from '@blitz/core/word.ts';
import { loadList, loadListIndex } from '../../data/lists';
import { addWords } from '../../data/words';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { articleColour, FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Column, Label, Title } from '../../ui/kit';
import { FullScreen, RoundButton } from '../../ui/Sheet';

/** A list's drawing, guessed from what it is called: the dictionary of icon names is not here. */
const ICONS: [RegExp, LucideIcon][] = [
  [/food|essen|fruit|drink/i, Apple],
  [/colou?r|farbe/i, Palette],
  [/body|körper|health|arzt/i, PersonStanding],
  [/job|work|beruf|arbeit/i, Briefcase],
  [/house|home|haus|room|zimmer/i, Lamp],
];

const iconFor = (list: ListSummary): LucideIcon => ICONS.find(([pattern]) => pattern.test(list.name))?.[1] ?? Sparkles;

const tint = (tint: ListTint, palette: ReturnType<typeof useTheme>['palette']) =>
  tint === 'orange' ? palette.accent : tint === 'red' ? palette.die : tint === 'blue' ? palette.der : palette.das;

/** The ready-made lists, full screen: pick a list, untick what you do not want, add the rest. */
export function ListsScreen({
  language,
  words,
  onClose,
}: {
  language: Language;
  words: Word[];
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<ListSummary | null>(null);
  const spec = LANGUAGES[language];

  const quit = () => {
    sounds.close();
    onClose();
  };

  return (
    <FullScreen onClose={quit} label={`${spec.name} word lists`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.sm,
        }}
      >
        <RoundButton
          onPress={() => {
            if (open) {
              sounds.close();
              setOpen(null);
            } else quit();
          }}
          label={open ? 'Back to the lists' : 'Close the lists'}
        >
          <ArrowLeft size={18} color={palette.foreground} />
        </RoundButton>
        <Label style={{ textTransform: 'none' }}>
          {spec.flag} {spec.name}
        </Label>
      </View>

      {open ? (
        <ListDetail key={open.id} list={open} language={language} words={words} onDone={onClose} />
      ) : (
        <ListGrid
          language={language}
          words={words}
          onOpen={(list) => {
            sounds.open();
            setOpen(list);
          }}
        />
      )}
    </FullScreen>
  );
}

function ListGrid({ language, words, onOpen }: { language: Language; words: Word[]; onOpen: (list: ListSummary) => void }) {
  const { palette } = useTheme();
  const [lists, setLists] = useState<ListSummary[] | 'failed' | null>(null);

  useEffect(() => {
    let current = true;
    loadListIndex().then(
      (found) => current && setLists(found),
      () => current && setLists('failed'),
    );
    return () => {
      current = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE['3xl'] }}>
      <Column style={{ gap: SPACE.md, paddingTop: SPACE.sm }}>
        <Title>Word lists</Title>
        <Body style={{ color: palette.muted }}>Pick a list, untick what you do not want, and add the rest.</Body>

        {lists === 'failed' ? (
          <Body style={{ color: palette.danger }}>Could not load the lists. Check the connection.</Body>
        ) : lists === null ? (
          <LoaderCircle size={22} color={palette.faint} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
            {lists.map((list) => {
              const side = list[language];
              const have = savedKeys(side.keys, words).size;
              const all = have === side.count;
              const Icon = iconFor(list);
              const colour = tint(list.tint, palette);
              return (
                <Pressable
                  key={list.id}
                  onPress={() => onOpen(list)}
                  style={({ pressed }) => ({
                    width: '47%',
                    minWidth: 150,
                    flexGrow: 1,
                    gap: SPACE.xs,
                    padding: SPACE.lg,
                    borderRadius: RADIUS.lg,
                    backgroundColor: palette.surface,
                    borderWidth: 1.5,
                    borderColor: all ? colour : palette.line,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: RADIUS.sm,
                      backgroundColor: `${colour}22`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: SPACE.xs,
                    }}
                  >
                    <Icon size={19} color={colour} />
                  </View>
                  <Body style={{ fontFamily: FONTS.black, fontSize: TEXT.lg }}>{list.name}</Body>
                  <Body numberOfLines={1} style={{ color: palette.muted, fontSize: TEXT.sm }}>
                    {side.sample.join(', ')}
                    {side.count > side.sample.length ? '…' : ''}
                  </Body>
                  <Label style={{ textTransform: 'none', color: all ? colour : palette.faint }}>
                    {all ? 'All added' : have > 0 ? `${have} of ${side.count} added` : `${side.count} words`}
                  </Label>
                </Pressable>
              );
            })}
          </View>
        )}
      </Column>
    </ScrollView>
  );
}

function ListDetail({
  list,
  language,
  words,
  onDone,
}: {
  list: ListSummary;
  language: Language;
  words: Word[];
  onDone: () => void;
}) {
  const { palette } = useTheme();
  const [items, setItems] = useState<Suggestion[] | 'failed' | null>(null);

  useEffect(() => {
    let current = true;
    loadList(list.id).then(
      (loaded) => current && setItems(loaded[language].map(suggestionOf)),
      () => current && setItems('failed'),
    );
    return () => {
      current = false;
    };
  }, [list.id, language]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 120 }}>
        <Column style={{ gap: SPACE.md, paddingTop: SPACE.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: RADIUS.md,
                backgroundColor: `${tint(list.tint, palette)}22`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {(() => {
                const Icon = iconFor(list);
                return <Icon size={21} color={tint(list.tint, palette)} />;
              })()}
            </View>
            <View>
              <Title>{list.name}</Title>
              <Body style={{ color: palette.muted }}>{list[language].count} words</Body>
            </View>
          </View>

          {items === 'failed' ? (
            <Body style={{ color: palette.danger }}>Could not load {list.name}. Check the connection.</Body>
          ) : items === null ? (
            <LoaderCircle size={22} color={palette.faint} />
          ) : (
            <ListChoice items={items} language={language} words={words} onDone={onDone} />
          )}
        </Column>
      </ScrollView>
    </View>
  );
}

/** The words of an open list, to untick, and the button that adds the rest. */
function ListChoice({
  items,
  language,
  words,
  onDone,
}: {
  items: Suggestion[];
  language: Language;
  words: Word[];
  onDone: () => void;
}) {
  const { palette } = useTheme();
  // Taken when the words arrive: words added from the list do not turn into "known" under the fingers.
  const [known] = useState(() => knownWords(items, words));
  const available = useMemo(() => items.filter((item) => !known.has(item)), [items, known]);
  const [picked, setPicked] = useState<Set<Suggestion>>(() => new Set(available));
  const [adding, setAdding] = useState(false);
  const everyOne = picked.size === available.length;

  function toggle(item: Suggestion) {
    sounds.toggle(!picked.has(item));
    const next = new Set(picked);
    if (!next.delete(item)) next.add(item);
    setPicked(next);
  }

  function add() {
    if (adding) return;
    if (picked.size === 0) return sounds.nudge();
    setAdding(true);
    try {
      // In the list's own order, whatever the order of the ticks.
      addWords(
        language,
        items.filter((item) => picked.has(item)).map((item) => fillDraft(language, emptyDraft(item.term), item)),
      );
      sounds.saved();
      onDone();
    } catch {
      sounds.nudge();
      setAdding(false);
    }
  }

  return (
    <>
      {known.size > 0 ? <Label style={{ textTransform: 'none' }}>{known.size} already in your list</Label> : null}
      {available.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
            {picked.size} of {available.length} selected
          </Body>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              sounds.toggle(!everyOne);
              setPicked(everyOne ? new Set() : new Set(available));
            }}
          >
            <Body style={{ color: palette.accent, fontSize: TEXT.sm }}>{everyOne ? 'Select none' : 'Select all'}</Body>
          </Pressable>
        </View>
      ) : null}

      {items.map((item) => {
        const have = known.has(item);
        const ticked = picked.has(item);
        return (
          <Pressable
            key={`${item.article ?? ''} ${item.term}`}
            disabled={have || adding}
            onPress={() => toggle(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              paddingVertical: SPACE.md,
              opacity: have ? 0.55 : 1,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                borderWidth: 1.5,
                borderColor: ticked ? palette.accent : palette.line,
                backgroundColor: ticked ? palette.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ticked || have ? <Check size={14} color={ticked ? palette.buttonForeground : palette.muted} /> : null}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                {item.article ? (
                  <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.md, color: articleColour(palette, item.article) }}>
                    {item.article}{' '}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.lg, color: palette.foreground }}>{item.term}</Text>
              </View>
              <Body numberOfLines={1} style={{ color: palette.muted, fontSize: TEXT.sm }}>
                {wordSummary(item)}
              </Body>
            </View>
            {have ? <Label style={{ textTransform: 'none', color: palette.faint }}>In your list</Label> : null}
          </Pressable>
        );
      })}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: -10 }}>
        <Button onPress={add} disabled={picked.size === 0 || adding} loading={adding} style={{ width: '100%' }}>
          {picked.size === 0 ? 'Nothing selected' : `Add ${picked.size} ${picked.size === 1 ? 'word' : 'words'}`}
        </Button>
      </View>
    </>
  );
}
