import { useEffect, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { Archive, ArchiveRestore, ImagePlus, Trash2, X } from 'lucide-react-native';
import { fillDraft, normalize, type Suggestion } from '@blitz/core/dictionary.ts';
import {
  type Draft,
  type DraftProblem,
  counterpartArticle,
  draftFromWord,
  draftProblems,
  emptyDraft,
  hasArticle,
  hasCounterpart,
  hasPlural,
  LANGUAGES,
  type Language,
  type Word,
  WORD_TYPES,
} from '@blitz/core/word.ts';
import { askDefinition } from '../../data/definitions';
import { lookupWord } from '../../data/dictionary';
import { deletePhoto, pickPhoto } from '../../data/photo';
import { addWord, deleteWord, setArchived, updateWord } from '../../data/words';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { articleColour, FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Label } from '../../ui/kit';
import { Sheet } from '../../ui/Sheet';
import type { NewWord } from './Composer';

const PROBLEM_TEXT: Record<DraftProblem, string> = {
  term: 'Write the word',
  type: 'Pick what kind of word it is',
  meaning: 'Give it a meaning',
};

type Props = { language: Language; onClose: (landOn: string | null) => void } & (
  | { word: Word; entry?: never }
  | { word?: never; entry: NewWord }
);

/** Adds a word, or edits one when `word` is given. */
export function WordSheet({ language, word, entry, onClose }: Props) {
  const { palette } = useTheme();
  const spec = LANGUAGES[language];
  const [draft, setDraft] = useState<Draft>(() => {
    if (word) return draftFromWord(word);
    return entry.suggestion ? fillDraft(language, emptyDraft(entry.suggestion.term), entry.suggestion) : emptyDraft(entry.term);
  });
  // A word picked from the dictionary is already filled in; a typed one is looked up.
  const [filled, setFilled] = useState(entry?.suggestion !== undefined);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const problems = draftProblems(language, draft);
  const showArticle = hasArticle(language, draft.type);
  const showPlural = hasPlural(draft.type);
  const showCounterpart = hasCounterpart(language, draft.type);
  const otherArticle = counterpartArticle(draft.article);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const dismiss = () => {
    sounds.close();
    onClose(word?.id ?? null);
  };

  /** A meaning the dictionary has no good definition for gets one written, once for everybody. */
  function refine(found: Suggestion, filledWith: string) {
    if (found.curated) return;
    void askDefinition(language, found).then((written) => {
      if (!written) return;
      setDraft((now) =>
        now.type === found.type && normalize(now.term) === normalize(found.term) && now.definition === filledWith
          ? { ...now, definition: written }
          : now,
      );
    });
  }

  useEffect(() => {
    if (entry?.suggestion) refine(entry.suggestion, fillDraft(language, emptyDraft(entry.suggestion.term), entry.suggestion).definition);
    // Once, for the word the sheet opened with.
  }, []);

  // A new word that is typed, not picked, is filled in from the dictionary once it settles.
  const typed = word || entry.suggestion ? null : draft.term;
  useEffect(() => {
    if (!typed) return;
    let current = true;
    const timer = setTimeout(() => {
      void lookupWord(language, typed).then((found) => {
        if (!current || !found) return;
        setDraft((now) => {
          if (normalize(now.term) !== normalize(found.term)) return now;
          const next = fillDraft(language, { ...now, term: found.term }, found);
          if (next.type !== now.type) {
            setFilled(true);
            setTimeout(() => refine(found, next.definition), 0);
          }
          return next;
        });
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [language, typed]);

  function save() {
    if (problems.length > 0 || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      if (word) updateWord(word, draft);
      const saved = word ?? addWord(language, draft);
      sounds.saved();
      onClose(saved.id);
    } catch {
      sounds.nudge();
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    if (!word) return;
    if (!confirmingDelete) {
      sounds.armed();
      setConfirmingDelete(true);
      return;
    }
    try {
      deleteWord(word.id);
      deletePhoto(typeof word.photo === 'string' ? word.photo : null);
      sounds.deleted();
      onClose(null);
    } catch {
      sounds.nudge();
      setSaveError(true);
    }
  }

  function toggleArchived() {
    if (!word) return;
    setArchived(word, !word.archived);
    sounds.saved();
    onClose(null);
  }

  async function choosePhoto() {
    setPhotoError(false);
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      set({ photo: uri });
      sounds.snap();
    } catch {
      sounds.nudge();
      setPhotoError(true);
    }
  }

  return (
    <Sheet
      eyebrow={`${spec.flag} ${spec.name}`}
      title={word ? 'Edit word' : 'New word'}
      onClose={dismiss}
      footer={
        <>
          {word ? (
            <Button tone="danger" onPress={remove} style={{ flex: 1 }}>
              {confirmingDelete ? 'Delete it' : <Trash2 size={16} color="#fff" />}
            </Button>
          ) : (
            <Button tone="quiet" onPress={dismiss} style={{ flex: 1 }}>
              Cancel
            </Button>
          )}
          {word ? (
            <Button tone="quiet" onPress={toggleArchived} style={{ flex: 1 }}>
              {word.archived ? <ArchiveRestore size={16} color={palette.foreground} /> : <Archive size={16} color={palette.foreground} />}
              {word.archived ? 'Unarchive' : 'Archive'}
            </Button>
          ) : null}
          <Button onPress={save} disabled={problems.length > 0} style={{ flex: 1.4 }}>
            {word ? 'Save changes' : 'Save word'}
          </Button>
        </>
      }
    >
      <View style={{ gap: SPACE.lg, paddingBottom: SPACE.lg }}>
        <TextInput
          value={draft.term}
          onChangeText={(text) => set({ term: text })}
          placeholder={`Word in ${spec.name}`}
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Word"
          style={{
            fontFamily: FONTS.black,
            fontSize: TEXT['2xl'],
            color: palette.foreground,
            paddingVertical: SPACE.sm,
            borderBottomWidth: 1.5,
            borderBottomColor: palette.line,
          }}
        />
        {filled && !word ? (
          <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>Filled in from Wiktionary. Change anything.</Body>
        ) : null}

        <View style={{ gap: SPACE.sm }}>
          <Label>Type</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {WORD_TYPES.map(({ value, label }) => (
              <Chip key={value} label={label} selected={draft.type === value} onPress={() => {
                if (draft.type !== value) sounds.tap();
                set({ type: value });
              }} />
            ))}
          </View>
        </View>

        {showArticle ? (
          <View style={{ gap: SPACE.sm }}>
            <Label>Article · optional</Label>
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              {spec.articles!.map((article) => (
                <Chip
                  key={article}
                  label={article}
                  colour={articleColour(palette, article)}
                  selected={draft.article === article}
                  onPress={() => {
                    sounds.tap();
                    set({ article: draft.article === article ? null : article });
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {showPlural ? <Field label="Plural · optional" value={draft.plural} onChange={(plural) => set({ plural })} /> : null}
        {showCounterpart ? (
          <Field
            label={otherArticle === 'die' ? 'Female form · optional' : otherArticle === 'der' ? 'Male form · optional' : 'Form for the other sex · optional'}
            value={draft.counterpart}
            onChange={(counterpart) => set({ counterpart })}
          />
        ) : null}

        <View style={{ height: 1, backgroundColor: palette.line }} />

        <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
          Meaning: fill {spec.translated ? 'at least one of these' : 'the definition, add a picture, or both'}.
        </Body>

        {spec.translated ? <Field label="In English" value={draft.translation} onChange={(translation) => set({ translation })} /> : null}

        <View style={{ gap: SPACE.sm }}>
          <Label>Definition</Label>
          <TextInput
            value={draft.definition}
            onChangeText={(definition) => set({ definition })}
            placeholder="Explain it in English, in your own words"
            placeholderTextColor={palette.faint}
            multiline
            numberOfLines={3}
            style={{
              fontFamily: FONTS.body,
              fontSize: TEXT.md,
              color: palette.foreground,
              borderWidth: 1.5,
              borderColor: palette.line,
              borderRadius: RADIUS.md,
              padding: SPACE.md,
              minHeight: 80,
              textAlignVertical: 'top',
            }}
          />
        </View>

        <View style={{ gap: SPACE.sm }}>
          <Label>Picture</Label>
          {typeof draft.photo === 'string' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <Image source={{ uri: draft.photo }} style={{ width: 92, height: 92, borderRadius: RADIUS.md }} />
              <View style={{ gap: SPACE.sm }}>
                <Button tone="quiet" onPress={() => void choosePhoto()}>
                  Change
                </Button>
                <Button
                  tone="quiet"
                  onPress={() => {
                    sounds.lift();
                    deletePhoto(draft.photo as string);
                    set({ photo: null });
                  }}
                >
                  <X size={15} color={palette.foreground} />
                  Remove
                </Button>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => void choosePhoto()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                padding: SPACE.lg,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: palette.line,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: RADIUS.sm,
                  backgroundColor: palette.iconBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ImagePlus size={20} color={palette.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Body style={{ fontFamily: FONTS.strong }}>Add a picture</Body>
                <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
                  {photoError ? 'That picture could not be read. Try another one.' : 'Take a photo or choose one'}
                </Body>
              </View>
            </Pressable>
          )}
        </View>

        {saveError ? (
          <Body style={{ color: palette.danger }}>This device would not save it. Try again.</Body>
        ) : null}
        {problems.length > 0 ? (
          <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{PROBLEM_TEXT[problems[0]!]} to save it.</Body>
        ) : null}
      </View>
    </Sheet>
  );
}

function Chip({ label, selected, onPress, colour }: { label: string; selected: boolean; onPress: () => void; colour?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.sm,
        borderRadius: RADIUS.pill,
        borderWidth: 1.5,
        borderColor: selected ? (colour ?? palette.accent) : palette.line,
        backgroundColor: selected ? palette.iconBackground : 'transparent',
      }}
    >
      <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.sm, color: colour ?? palette.foreground }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontFamily: FONTS.body,
          fontSize: TEXT.md,
          color: palette.foreground,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: RADIUS.md,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.md,
        }}
      />
    </View>
  );
}

