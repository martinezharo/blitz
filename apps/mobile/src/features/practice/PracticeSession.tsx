import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Archive, Check, Mars, Venus, Volume2, X } from 'lucide-react-native';
import {
  buildExercise,
  type Exercise,
  isCorrect,
  offersArchive,
  pickLesson,
  STREAK_TO_ARCHIVE,
} from '@blitz/core/practice.ts';
import { LANGUAGES, type Language, type Word } from '@blitz/core/word.ts';
import { useVoice } from '../../data/hooks';
import { markPracticed } from '../../data/streak';
import { recordAnswer, setArchived } from '../../data/words';
import { canHear, hush, preloadSpeech, prepareVoice, speak } from '../../platform/speech';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { articleColour, FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Label } from '../../ui/kit';
import { FullScreen, RoundButton } from '../../ui/Sheet';
import { emptySlots, LetterBoard, type Slots } from './LetterBoard';

interface PracticeSessionProps {
  language: Language;
  words: Word[];
  onClose: () => void;
}

interface Result {
  correct: boolean;
  /** Set when the answer moved the word to another level. */
  level: number | null;
  /** Set when the word has been right so often at the top level that it is worth archiving. */
  offer: boolean;
}

/** A lesson of about ten questions, full screen. Mount it to start one. */
export function PracticeSession({ language, words, onClose }: PracticeSessionProps) {
  const [lesson] = useState(() => pickLesson(words));
  // Answers land in the database a moment before the list catches up, so the
  // freshest copy of each word is kept here too.
  const [answered, setAnswered] = useState<Map<string, Word>>(new Map());
  const [step, setStep] = useState(0);
  const [right, setRight] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [asked, setAsked] = useState(0);

  const latest = (word: Word) => {
    const local = answered.get(word.id);
    return local && local.updatedAt > word.updatedAt ? local : word;
  };
  const current = words.find((word) => word.id === lesson[step]);
  const [exercise, setExercise] = useState<Exercise | null>(() => (current ? buildExercise(current, words, Math.random, canHear(language)) : null));

  // The voice is the server's: nothing to download, so it is ready at once.
  useEffect(() => void prepareVoice(language), [language]);

  async function answer(correct: boolean): Promise<Word> {
    const updated = recordAnswer(latest(exercise!.word), correct);
    // The day's first answer, right or wrong, keeps the streak; it is celebrated once the lesson closes.
    markPracticed();
    setAnswered((map) => new Map(map).set(updated.id, updated));
    setAsked((count) => count + 1);
    if (correct) setRight((count) => count + 1);
    return updated;
  }

  function archive(archived: boolean): void {
    const updated = setArchived(latest(exercise!.word), archived);
    setAnswered((map) => new Map(map).set(updated.id, updated));
  }

  function next() {
    // A word archived mid-lesson is not asked again.
    const fresh = words.map(latest).filter((word) => !word.archived);
    // A word deleted on another device mid-lesson is skipped.
    let index = step + 1;
    while (index < lesson.length && !fresh.some((word) => word.id === lesson[index])) index++;
    const word = fresh.find((candidate) => candidate.id === lesson[index]);
    if (!word) sounds.complete(right === asked);
    setStep(index);
    setExercise(word ? buildExercise(word, fresh, Math.random, canHear(language)) : null);
  }

  const done = !exercise;
  const quit = () => {
    sounds.close();
    hush();
    onClose();
  };
  const leave = () => (done ? quit() : setConfirming(true));

  return (
    <FullScreen onClose={leave} label={`${LANGUAGES[language].name} practice`}>
      <Header step={step} total={lesson.length} language={language} onClose={leave} />
      {done ? (
        <Summary right={right} total={asked} onClose={quit} />
      ) : (
        <Question
          key={step}
          language={language}
          exercise={exercise}
          onAnswer={answer}
          onArchive={archive}
          onNext={next}
        />
      )}
      {confirming && <ConfirmQuit onStay={() => setConfirming(false)} onQuit={quit} />}
    </FullScreen>
  );
}

function Header({ step, total, language, onClose }: { step: number; total: number; language: Language; onClose: () => void }) {
  const { palette } = useTheme();
  const voice = useVoice(language);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: SPACE.sm }}>
      <RoundButton onPress={onClose} label="End practice">
        <X size={18} color={palette.foreground} />
      </RoundButton>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: palette.line, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${(step / Math.max(1, total)) * 100}%`, backgroundColor: palette.accent }} />
      </View>
      <View style={{ width: 38, alignItems: 'center' }}>
        {voice.status === 'failed' ? <Volume2 size={17} color={palette.faint} /> : null}
      </View>
    </View>
  );
}

function ConfirmQuit({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl }}>
      <View style={{ backgroundColor: palette.background, borderRadius: RADIUS.xl, padding: SPACE.xl, gap: SPACE.md, width: '100%', maxWidth: 380 }}>
        <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.xl, color: palette.foreground }}>End this lesson?</Text>
        <Body style={{ color: palette.muted }}>Your answers so far are kept, but the rest of the lesson is lost.</Body>
        <Button onPress={onStay}>Keep practicing</Button>
        <Button tone="quiet" onPress={onQuit}>
          End lesson
        </Button>
      </View>
    </View>
  );
}

function Question({
  language,
  exercise,
  onAnswer,
  onArchive,
  onNext,
}: {
  language: Language;
  exercise: Exercise;
  onAnswer: (correct: boolean) => Promise<Word>;
  onArchive: (archived: boolean) => void;
  onNext: () => void;
}) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const { sex, clue, gender, answer } = exercise;
  const articles = LANGUAGES[language].articles ?? [];
  const [article, setArticle] = useState('');
  const [term, setTerm] = useState('');
  const [slots, setSlots] = useState<Slots>(() => (answer.kind === 'letters' ? emptySlots(answer.tiles) : []));
  const [result, setResult] = useState<Result | null>(null);
  const [archived, setArchivedNow] = useState(false);
  const termField = useRef<ComponentRef<typeof TextInput>>(null);

  const built = (() => {
    if (answer.kind !== 'letters') return term;
    let slot = 0;
    return [...exercise.term]
      .map((char, index) => {
        if (/\s/.test(char)) return '';
        if (answer.given[index]) return char;
        const tile = slots[slot++];
        return tile === null || tile === undefined ? '' : answer.tiles[tile]!;
      })
      .join('');
  })();

  const ready =
    (gender === null || gender === 'shown' || article.trim() !== '') &&
    (answer.kind === 'letters' ? !slots.includes(null) : term.trim() !== '');

  const solution = `${exercise.article ? `${exercise.article} ` : ''}${exercise.term}`;
  const voice = useVoice(language).status;

  // Every word this question can say, made while it is being read.
  useEffect(() => {
    void preloadSpeech(language, answer.kind === 'choice' ? answer.options : clue.kind === 'audio' ? [exercise.term, solution] : [solution]);
  }, [voice]);

  // An audio clue is heard as soon as the question shows, and again on demand.
  useEffect(() => {
    if (clue.kind === 'audio') void speak(language, exercise.term);
  }, []);

  // Letters and writing are said only after a correct answer is confirmed.
  useEffect(() => {
    if (answer.kind !== 'choice' && result?.correct) void speak(language, solution);
  }, [result?.correct]);

  async function check() {
    if (result) return onNext();
    if (!ready) return;
    const correct = isCorrect(exercise, article, built);
    const updated = await onAnswer(correct);
    if (correct) sounds.correct();
    else sounds.wrong();
    if (updated.level > exercise.level) sounds.levelUp();
    setResult({
      correct,
      level: updated.level !== exercise.level ? updated.level : null,
      offer: correct && offersArchive(updated),
    });
  }

  const locked = result !== null;
  const wide = width >= 768;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.lg, justifyContent: 'center' }}
        style={{ flex: 1 }}
      >
        <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', gap: SPACE.lg }}>
          <Label>
            {clue.kind === 'audio'
              ? gender === 'write'
                ? 'Write the word you hear, with its article'
                : 'Write the word you hear'
              : gender === 'pick' || gender === 'write'
                ? 'Which word is it, with its article?'
                : 'Which word is it?'}
          </Label>

          <View style={{ alignItems: 'center', gap: SPACE.sm }}>
            {sex ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                {sex === 'female' ? <Venus size={14} color={palette.muted} /> : <Mars size={14} color={palette.muted} />}
                <Label style={{ textTransform: 'none' }}>{sex === 'female' ? 'Female' : 'Male'}</Label>
              </View>
            ) : null}

            {clue.kind === 'photo' && typeof clue.photo === 'string' ? (
              <Image
                source={{ uri: clue.photo }}
                style={{ width: wide ? 260 : 200, height: wide ? 260 : 200, borderRadius: RADIUS.lg }}
                resizeMode="cover"
              />
            ) : clue.kind === 'audio' ? (
              <Pressable
                onPress={() => void speak(language, exercise.term)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  paddingHorizontal: SPACE.xl,
                  paddingVertical: SPACE.md,
                  borderRadius: RADIUS.pill,
                  backgroundColor: palette.iconBackground,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Volume2 size={18} color={palette.foreground} />
                <Body>Listen again</Body>
              </Pressable>
            ) : clue.kind === 'photo' ? null : (
              <View style={{ alignItems: 'center', gap: SPACE.xs }}>
                <Label>{clue.kind === 'translation' ? 'In English' : 'Meaning'}</Label>
                <Text
                  style={{ fontFamily: FONTS.black, fontSize: TEXT['2xl'], color: palette.foreground, textAlign: 'center', letterSpacing: -0.4 }}
                >
                  {clue.text}
                </Text>
              </View>
            )}
          </View>

          {gender === 'pick' ? (
            <View style={{ flexDirection: 'row', gap: SPACE.sm, justifyContent: 'center' }}>
              {articles.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (article !== option) sounds.tap();
                    setArticle(option);
                  }}
                  disabled={locked}
                  accessibilityState={{ selected: article === option }}
                  style={{
                    paddingHorizontal: SPACE.xl,
                    paddingVertical: SPACE.md,
                    borderRadius: RADIUS.md,
                    borderWidth: 1.5,
                    borderColor: article === option ? articleColour(palette, option) ?? palette.accent : palette.line,
                    backgroundColor: article === option ? palette.iconBackground : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.lg, color: articleColour(palette, option) }}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {answer.kind === 'choice' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' }}>
              {answer.options.map((option) => {
                const picked = term === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      if (term !== option) sounds.tap();
                      void speak(language, option);
                      setTerm(option);
                    }}
                    disabled={locked}
                    accessibilityState={{ selected: picked }}
                    style={{
                      paddingHorizontal: SPACE.lg,
                      paddingVertical: SPACE.md,
                      borderRadius: RADIUS.md,
                      borderWidth: 1.5,
                      borderColor: picked ? palette.accent : palette.line,
                      backgroundColor: picked ? palette.iconBackground : 'transparent',
                      minWidth: answer.options.length > 4 ? '45%' : undefined,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.lg, color: palette.foreground }}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {answer.kind === 'letters' ? (
            <LetterBoard
              term={exercise.term}
              given={answer.given}
              tiles={answer.tiles}
              slots={slots}
              onChange={setSlots}
              locked={locked}
              wrong={result?.correct === false}
            />
          ) : null}

          {answer.kind === 'write' ? (
            <View style={{ gap: SPACE.sm }}>
              {gender === 'write' ? (
                <TextInput
                  value={article}
                  onChangeText={setArticle}
                  placeholder="article"
                  placeholderTextColor={palette.faint}
                  accessibilityLabel="Article"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!locked}
                  style={inputStyle(palette)}
                />
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: palette.line,
                  borderRadius: RADIUS.md,
                  paddingHorizontal: SPACE.lg,
                  backgroundColor: palette.surface,
                }}
              >
                <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.lg, color: palette.muted }}>{answer.hint}</Text>
                <TextInput
                  ref={termField}
                  value={term}
                  onChangeText={setTerm}
                  accessibilityLabel={`The word, starting with ${answer.hint}`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!locked}
                  style={{ flex: 1, fontFamily: FONTS.strong, fontSize: TEXT.lg, color: palette.foreground, paddingVertical: SPACE.md }}
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: result ? (result.correct ? palette.success : palette.danger) : palette.line,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.md,
          paddingBottom: SPACE.lg,
          gap: SPACE.md,
        }}
      >
        {result ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
            {result.correct ? <Check size={20} color={palette.success} /> : <X size={20} color={palette.danger} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontFamily: FONTS.black }}>{result.correct ? 'Right!' : 'Not quite'}</Body>
              {!result.correct ? (
                <Body style={{ color: palette.muted }}>
                  It&apos;s <Body style={{ fontFamily: FONTS.black, color: palette.foreground }}>{solution}</Body>
                </Body>
              ) : null}
              {result.level !== null ? (
                <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
                  {result.correct ? `Level up: ${result.level}` : `Back to level ${result.level}`}
                </Body>
              ) : null}
              {result.offer && !archived ? (
                <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
                  You&apos;ve got it right {STREAK_TO_ARCHIVE} times at the top level. Archive it?
                </Body>
              ) : null}
            </View>
            {result.correct ? (
              <Pressable
                onPress={() => {
                  onArchive(!archived);
                  sounds.saved();
                  setArchivedNow(!archived);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                  borderRadius: RADIUS.pill,
                  backgroundColor: result.offer && !archived ? palette.selection : palette.iconBackground,
                }}
              >
                <Archive size={14} color={palette.foreground} />
                <Body style={{ fontSize: TEXT.sm }}>{archived ? 'Archived' : 'Archive'}</Body>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Button onPress={() => void check()} disabled={!result && !ready} style={{ width: '100%' }}>
          {result ? 'Continue' : 'Check'}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const inputStyle = (palette: ReturnType<typeof useTheme>['palette']) => ({
  borderWidth: 1.5,
  borderColor: palette.line,
  borderRadius: RADIUS.md,
  paddingHorizontal: SPACE.lg,
  paddingVertical: SPACE.md,
  fontFamily: FONTS.strong,
  fontSize: TEXT.lg,
  color: palette.foreground,
  backgroundColor: palette.surface,
});

function Summary({ right, total, onClose }: { right: number; total: number; onClose: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl, gap: SPACE.sm }}>
      <Text style={{ fontFamily: FONTS.black, fontSize: 44, color: palette.accent }}>
        {right}/{total}
      </Text>
      <Text style={{ fontFamily: FONTS.black, fontSize: TEXT.xl, color: palette.foreground }}>Lesson done</Text>
      <Body style={{ color: palette.muted, textAlign: 'center' }}>
        {right === total ? 'Every one right.' : 'Misses come back sooner, so they stick.'}
      </Body>
      <Button onPress={onClose} style={{ marginTop: SPACE.xl, minWidth: 220 }}>
        Done
      </Button>
    </View>
  );
}
