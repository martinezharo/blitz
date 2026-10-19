import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, Dices, Lightbulb, LogIn, PenLine, Plus, RotateCcw } from 'lucide-react-native';
import { GUESS_NAMES, type Guess, guessLanguage } from '@blitz/core/detect-language.ts';
import { normalize, type Suggestion } from '@blitz/core/dictionary.ts';
import { LANGUAGES, type Language, type Word } from '@blitz/core/word.ts';
import { type Mark, MAX_TEXT, segments, sentenceFixes, type Verdict } from '@blitz/core/writing.ts';
import type { AccountState } from '../../data/account';
import { lookupForm } from '../../data/dictionary';
import { useCorrections } from '../../data/hooks';
import { checkText, type CheckFailure, loadDraft, saveCorrections, storeDraft, type WritingDraft } from '../../data/writing';
import { deleteCorrection } from '../../data/writing';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Column, Label, Title } from '../../ui/kit';
import type { NewWord } from '../words/Composer';

/** Ideas to write about, in the language being written, with what they ask in English. */
const PROMPTS: Record<Language, { ask: string; means: string | null }[]> = {
  de: [
    { ask: 'Was hast du heute gemacht?', means: 'What did you do today?' },
    { ask: 'Wie sieht dein Zimmer aus?', means: 'What does your room look like?' },
    { ask: 'Was isst du am liebsten?', means: 'What do you like eating most?' },
    { ask: 'Was machst du am Wochenende?', means: 'What are you doing at the weekend?' },
    { ask: 'Erzähl von deiner Familie.', means: 'Tell me about your family.' },
    { ask: 'Wohin möchtest du reisen, und warum?', means: 'Where would you like to travel, and why?' },
    { ask: 'Wie war dein letzter Urlaub?', means: 'How was your last holiday?' },
    { ask: 'Was ist dein Lieblingsfilm?', means: 'What is your favourite film?' },
  ],
  en: [
    { ask: 'What did you do today?', means: null },
    { ask: 'What does your room look like?', means: null },
    { ask: 'What do you like eating most?', means: null },
    { ask: 'What are you doing this weekend?', means: null },
    { ask: 'Tell me about your family.', means: null },
    { ask: 'Where would you like to travel, and why?', means: null },
    { ask: 'How was your last holiday?', means: null },
    { ask: 'What is your favourite film?', means: null },
  ],
};

const FAILURES: Record<Exclude<CheckFailure, 'signed-out'>, string> = {
  'too-long': `That is a lot to check at once. Keep it under ${MAX_TEXT} characters.`,
  limit: 'That was the last check for today. Come back tomorrow for more.',
  offline: 'You are offline. Checking needs a connection.',
  failed: 'It could not be checked this time. Try again in a moment.',
};

/** Why a text was not checked in the language of the page. */
type Mismatch =
  | { kind: 'switch'; to: Language }
  | { kind: 'unsupported'; name: string | null }
  | { kind: 'nonsense' };

/**
 * Free writing. Write anything in the language, press Check, and the mistakes
 * are marked: spelling in one colour, grammar in another.
 */
export function WritingScreen({
  language,
  words,
  account,
  onSignIn,
  onAddWord,
}: {
  language: Language;
  words: Word[];
  account: AccountState;
  onSignIn: () => void;
  onAddWord: (word: NewWord) => void;
}) {
  const { palette } = useTheme();
  const spec = LANGUAGES[language];
  const [draft, setDraft] = useState<WritingDraft>(() => loadDraft(language));
  // Checked text is shown marked; Edit goes back to the plain text.
  const [editing, setEditing] = useState(draft.marks === null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<CheckFailure | null>(null);
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
  const [prompt, setPrompt] = useState(() => Math.floor(Math.random() * PROMPTS[language].length));
  const [selected, setSelected] = useState<number | null>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => storeDraft(language, draft), [language, draft]);

  const signedIn = account.status === 'signed-in';
  const marks = draft.marks;
  const showMarks = marks !== null && !editing;

  function write(text: string) {
    setDraft({ text, marks: null });
    setFailure(null);
  }

  async function check() {
    const text = draft.text;
    if (checking) return;
    if (!text.trim()) {
      sounds.nudge();
      field.current?.focus();
      return;
    }
    if (draft.marks) {
      sounds.tap();
      setEditing(false);
      return;
    }
    if (!signedIn) {
      sounds.nudge();
      setFailure('signed-out');
      return;
    }
    const guess = guessLanguage(text);
    if (guess && guess !== language) {
      sounds.nudge();
      setMismatch(mismatchOf(guess));
      return;
    }

    setChecking(true);
    setFailure(null);
    const outcome = await checkText(language, text);
    setChecking(false);
    if (!outcome.ok) {
      sounds.nudge();
      setFailure(outcome.failure);
      return;
    }
    if (outcome.language !== language) {
      sounds.nudge();
      setMismatch(mismatchOf(outcome.language));
      return;
    }
    setDraft({ text, marks: outcome.marks });
    setEditing(false);
    setSelected(null);
    if (outcome.marks.length === 0) sounds.correct();
    else sounds.open();
    saveCorrections(language, sentenceFixes(text, outcome.marks));
  }

  function mismatchOf(found: Guess | Verdict): Mismatch {
    if (found === 'de' || found === 'en') return { kind: 'switch', to: found };
    if (found === 'nonsense') return { kind: 'nonsense' };
    return { kind: 'unsupported', name: found === 'other' ? null : GUESS_NAMES[found] };
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: 120, gap: SPACE.lg }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Column style={{ gap: SPACE.lg, paddingTop: SPACE.sm }}>
        <View>
          <Title>Write</Title>
          <Body style={{ color: palette.muted }}>Write anything in {spec.name}. Check it, and Blitz marks what to fix.</Body>
        </View>

        {!showMarks ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              backgroundColor: palette.iconBackground,
              borderRadius: RADIUS.md,
              padding: SPACE.md,
            }}
          >
            <Lightbulb size={18} color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Label style={{ textTransform: 'none', fontSize: TEXT.xs }}>Need an idea? Try this:</Label>
              <Body style={{ fontFamily: FONTS.strong }}>{PROMPTS[language][prompt]!.ask}</Body>
              {PROMPTS[language][prompt]!.means ? (
                <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{PROMPTS[language][prompt]!.means}</Body>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                sounds.tap();
                setPrompt((current) => (current + 1 + Math.floor(Math.random() * (PROMPTS[language].length - 1))) % PROMPTS[language].length);
              }}
              accessibilityLabel="Another idea"
              hitSlop={8}
            >
              <Dices size={18} color={palette.muted} />
            </Pressable>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: palette.line,
            padding: SPACE.lg,
            gap: SPACE.md,
          }}
        >
          {showMarks ? (
            <Marked text={draft.text} marks={marks} selected={selected} onSelect={setSelected} />
          ) : (
            <TextInput
              ref={field}
              value={draft.text}
              onChangeText={write}
              editable={!checking}
              placeholder="Start writing…"
              placeholderTextColor={palette.faint}
              accessibilityLabel={`Your text in ${spec.name}`}
              maxLength={MAX_TEXT}
              multiline
              autoCorrect={false}
              style={{ fontFamily: FONTS.body, fontSize: TEXT.lg, color: palette.foreground, minHeight: 180, textAlignVertical: 'top' }}
            />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            {showMarks ? (
              <>
                <Button
                  tone="quiet"
                  onPress={() => {
                    sounds.tap();
                    setEditing(true);
                    setTimeout(() => field.current?.focus(), 60);
                  }}
                >
                  <PenLine size={15} color={palette.foreground} />
                  Edit
                </Button>
                <Button
                  tone="quiet"
                  onPress={() => {
                    sounds.lift();
                    write('');
                    setEditing(true);
                  }}
                >
                  <RotateCcw size={15} color={palette.foreground} />
                  New text
                </Button>
              </>
            ) : (
              <>
                <Body style={{ flex: 1, color: palette.muted, fontSize: TEXT.sm }}>
                  {draft.text.length > MAX_TEXT * 0.6 ? `${draft.text.length} / ${MAX_TEXT}` : ''}
                </Body>
                <Button onPress={() => void check()} disabled={!draft.text.trim() || checking} loading={checking}>
                  Check
                </Button>
              </>
            )}
          </View>
        </View>

        {failure === 'signed-out' ? (
          <View style={{ gap: SPACE.sm, alignItems: 'flex-start' }}>
            <Body style={{ color: palette.muted }}>Checking uses a language model, so it needs an account. It is free.</Body>
            <Button tone="quiet" onPress={onSignIn}>
              <LogIn size={15} color={palette.foreground} />
              Sign in
            </Button>
          </View>
        ) : failure ? (
          <Body style={{ color: palette.danger }}>{FAILURES[failure]}</Body>
        ) : null}

        {showMarks ? (
          <Results language={language} marks={marks} words={words} selected={selected} onSelect={setSelected} onAddWord={onAddWord} />
        ) : null}

        <History language={language} />
      </Column>

      {mismatch ? <MismatchSheet language={language} mismatch={mismatch} onClose={() => setMismatch(null)} /> : null}
    </ScrollView>
  );
}

function Marked({
  text,
  marks,
  selected,
  onSelect,
}: {
  text: string;
  marks: Mark[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const { palette } = useTheme();
  return (
    <Text style={{ fontFamily: FONTS.body, fontSize: TEXT.lg, color: palette.foreground }}>
      {segments(text, marks).map((segment, index) =>
        segment.mark ? (
          <Text
            key={index}
            onPress={() => {
              sounds.tap();
              onSelect(marks.indexOf(segment.mark!));
            }}
            style={{
              fontFamily: FONTS.strong,
              backgroundColor: segment.mark.kind === 'spelling' ? palette.selection : 'transparent',
              color: segment.mark.kind === 'spelling' ? palette.selectionForeground : palette.der,
              textDecorationLine: segment.mark.kind === 'grammar' ? 'underline' : 'none',
              textDecorationColor: palette.der,
              opacity: selected !== null && selected !== marks.indexOf(segment.mark) ? 0.75 : 1,
            }}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  );
}

interface Found {
  suggestion: Suggestion | null;
  saved: boolean;
}

function Results({
  language,
  marks,
  words,
  selected,
  onSelect,
  onAddWord,
}: {
  language: Language;
  marks: Mark[];
  words: Word[];
  selected: number | null;
  onSelect: (index: number) => void;
  onAddWord: (word: NewWord) => void;
}) {
  const { palette } = useTheme();
  const [found, setFound] = useState<Map<string, Suggestion | null>>(new Map());
  const spelling = marks.filter((mark) => mark.kind === 'spelling').length;
  const grammar = marks.length - spelling;

  useEffect(() => {
    let current = true;
    const forms = [...new Set(marks.flatMap((mark) => (mark.word ? [mark.word] : [])))];
    void Promise.all(forms.map(async (form) => [form, await lookupForm(language, form)] as const)).then((pairs) => {
      if (current) setFound(new Map(pairs));
    });
    return () => {
      current = false;
    };
  }, [language, marks]);

  const saved = useMemo(() => new Set(words.map((word) => normalize(word.term))), [words]);
  const lookup = (form: string): Found => {
    const suggestion = found.get(form) ?? null;
    return { suggestion, saved: saved.has(normalize(suggestion?.term ?? form)) };
  };

  if (marks.length === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Check size={18} color={palette.success} />
        <Body>Nothing to fix. Nicely written!</Body>
      </View>
    );
  }

  return (
    <View style={{ gap: SPACE.md }}>
      <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'baseline' }}>
        <Body style={{ fontFamily: FONTS.black }}>
          {marks.length === 1 ? '1 thing to fix' : `${marks.length} things to fix`}
        </Body>
        {spelling > 0 ? <Label style={{ textTransform: 'none', color: palette.selectionForeground }}>{spelling} spelling</Label> : null}
        {grammar > 0 ? <Label style={{ textTransform: 'none', color: palette.der }}>{grammar} grammar</Label> : null}
      </View>

      {marks.map((mark, index) => {
        const word = mark.word && found.has(mark.word) ? lookup(mark.word) : null;
        return (
          <Pressable
            key={`${mark.start}-${mark.end}`}
            onPress={() => onSelect(index)}
            style={{
              gap: SPACE.sm,
              padding: SPACE.md,
              borderRadius: RADIUS.md,
              borderWidth: 1.5,
              borderColor: selected === index ? palette.accent : palette.line,
            }}
          >
            <Label style={{ textTransform: 'none', color: mark.kind === 'spelling' ? palette.selectionForeground : palette.der }}>
              {mark.kind}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm }}>
              <Text style={{ fontFamily: FONTS.body, fontSize: TEXT.md, color: palette.danger, textDecorationLine: 'line-through' }}>
                {mark.wrong}
              </Text>
              <Text style={{ color: palette.faint }}>→</Text>
              <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.md, color: palette.success }}>{mark.right}</Text>
            </View>
            {mark.why ? <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{mark.why}</Body> : null}
            {mark.word && word ? (
              word.saved ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                  <Check size={14} color={palette.success} />
                  <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{word.suggestion?.term ?? mark.word} is in your words</Body>
                </View>
              ) : (
                <Pressable
                  onPress={() =>
                    onAddWord(word.suggestion ? { term: word.suggestion.term, suggestion: word.suggestion } : { term: mark.word! })
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}
                >
                  <Plus size={14} color={palette.accent} />
                  <Body style={{ color: palette.accent, fontSize: TEXT.sm }}>
                    Add {word.suggestion?.term ?? mark.word} to your words
                  </Body>
                </Pressable>
              )
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** The sentences written with a grammar mistake, newest first: as written, and as they should be. */
function History({ language }: { language: Language }) {
  const { palette } = useTheme();
  void language;
  const corrections = useCorrections(language);
  const [all, setAll] = useState(false);
  if (corrections.length === 0) return null;
  const shown = all ? corrections : corrections.slice(0, 5);

  return (
    <View style={{ gap: SPACE.sm, marginTop: SPACE.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Title small>Grammar history</Title>
        <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>{corrections.length}</Body>
      </View>
      <Body style={{ color: palette.muted }}>Your sentences with a grammar mistake, and how they should be.</Body>
      {shown.map((correction) => (
        <View
          key={correction.id}
          style={{ gap: SPACE.xs, padding: SPACE.md, borderRadius: RADIUS.md, backgroundColor: palette.iconBackground }}
        >
          <Body style={{ color: palette.danger }}>{correction.written}</Body>
          <Body style={{ color: palette.success }}>{correction.corrected}</Body>
          {correction.fixes.map((fix, index) => (
            <Body key={index} style={{ color: palette.muted, fontSize: TEXT.sm }}>
              {fix.wrong} → {fix.right}
              {fix.why ? ` · ${fix.why}` : ''}
            </Body>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Label style={{ textTransform: 'none', fontSize: TEXT.xs }}>{DAY.format(correction.createdAt)}</Label>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => {
                sounds.deleted();
                deleteCorrection(correction.id);
              }}
              hitSlop={8}
            >
              <Body style={{ color: palette.muted, fontSize: TEXT.xs }}>Remove</Body>
            </Pressable>
          </View>
        </View>
      ))}
      {corrections.length > 5 ? (
        <Button
          tone="quiet"
          onPress={() => {
            sounds.tap();
            setAll(!all);
          }}
        >
          {all ? 'Show fewer' : `Show all ${corrections.length}`}
        </Button>
      ) : null}
    </View>
  );
}

function MismatchSheet({ language, mismatch, onClose }: { language: Language; mismatch: Mismatch; onClose: () => void }) {
  const spec = LANGUAGES[language];
  const supported = Object.values(LANGUAGES)
    .map((option) => option.name)
    .join(' and ');

  let title: string;
  let body: string;
  if (mismatch.kind === 'switch') {
    const other = LANGUAGES[mismatch.to];
    title = `This looks like ${other.name}`;
    body = `You are on your ${spec.name} page. Write it in ${other.name} and check it there.`;
  } else if (mismatch.kind === 'unsupported') {
    title = mismatch.name ? `Blitz can't check ${mismatch.name} yet` : `This doesn't look like ${spec.name}`;
    body = `For now, Blitz checks ${supported}. Write it in ${spec.name} and check again.`;
  } else {
    title = `This doesn't read as ${spec.name}`;
    body = `Write a few real sentences in ${spec.name} and check again.`;
  }

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACE.xl }}>
      <View style={{ backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md }}>
        <Title small>{title}</Title>
        <Body>{body}</Body>
        <Button onPress={onClose}>Got it</Button>
      </View>
    </View>
  );
}
