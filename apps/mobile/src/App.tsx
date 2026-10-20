import { useEffect, useState } from 'react';
import { Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BookOpen, Check, ChevronDown, Ellipsis, PenLine, Play, Settings2 } from 'lucide-react-native';
import { LANGUAGE_ORDER, LANGUAGES, type Language, type Word } from '@blitz/core/word.ts';
import { normalize } from '@blitz/core/dictionary.ts';
import { useAccount } from './data/account';
import { useLanguage, useSounds, useThemeChoice, useWordSort } from './data/preferences';
import { useWords } from './data/hooks';
import { fillCounterparts } from './data/words';
import { AuthSheet } from './features/account/AuthSheet';
import { ListsScreen } from './features/lists/ListsScreen';
import { PracticeSession } from './features/practice/PracticeSession';
import { PreferencesSheet } from './features/preferences/PreferencesSheet';
import { StreakBadge } from './features/streak/StreakBadge';
import { type NewWord } from './features/words/Composer';
import { WordsScreen } from './features/words/WordsScreen';
import { WordSheet } from './features/words/WordSheet';
import { WritingScreen } from './features/writing/WritingScreen';
import { setSoundsOn as applySoundsOn, sounds } from './platform/sound';
import { ThemeProvider, useTheme } from './theme/Theme';
import { COLUMN, FONTS, RADIUS, SPACE, TEXT } from './theme/tokens';
import { Body, Label } from './ui/kit';
import { Sheet } from './ui/Sheet';

const FONTS_MAP = {
  'Nunito-600': require('../assets/fonts/Nunito-600.ttf'),
  'Nunito-700': require('../assets/fonts/Nunito-700.ttf'),
  'Nunito-800': require('../assets/fonts/Nunito-800.ttf'),
  'Nunito-900': require('../assets/fonts/Nunito-900.ttf'),
};

export function App() {
  const [fontsLoaded] = useFonts(FONTS_MAP);
  const [choice, setChoice] = useThemeChoice();
  return (
    <SafeAreaProvider>
      <ThemeProvider stored={choice} onChange={setChoice}>
        {fontsLoaded ? <Root /> : <View style={{ flex: 1 }} />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

type Editing = { word: Word } | { entry: NewWord } | null;

function Root() {
  const { palette, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [language, setLanguage] = useLanguage();
  const [sort, setSort] = useWordSort();
  const [soundsOn, setSoundsOn] = useSounds();
  const words = useWords(language);
  const account = useAccount();

  const [view, setView] = useState<'words' | 'write'>('words');
  const [editing, setEditing] = useState<Editing>(null);
  const [practicing, setPracticing] = useState(false);
  const [lists, setLists] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [auth, setAuth] = useState<{ open: boolean; error: string | null }>({ open: false, error: null });
  const [menu, setMenu] = useState(false);

  const active = words.filter((word) => !word.archived);

  // "Sounds off" is a setting; the synth has to be told about it, not only the switch.
  useEffect(() => applySoundsOn(soundsOn), [soundsOn]);
  // Nouns saved before they could have a counterpart get one from the dictionary.
  useEffect(() => {
    void fillCounterparts(words);
  }, [words]);

  async function signIn() {
    try {
      const done = await account.signIn();
      if (done) setAuth({ open: false, error: null });
    } catch {
      setAuth({ open: true, error: "Google couldn't sign you in. Try again." });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.sm,
          width: '100%',
          maxWidth: COLUMN + 32,
          alignSelf: 'center',
        }}
      >
        <LanguagePill language={language} onChange={setLanguage} />
        <View style={{ flex: 1 }} />
        <StreakBadge hold={practicing} />
        <Pressable
          onPress={() => {
            sounds.open();
            setPreferences(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Preferences"
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: RADIUS.pill,
            backgroundColor: pressed ? palette.iconHover : palette.iconBackground,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Settings2 size={17} color={palette.muted} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {view === 'words' ? (
          <WordsScreen
            language={language}
            words={words}
            sort={sort}
            onSortChange={setSort}
            onAdd={(entry) => setEditing({ entry })}
            onOpenWord={(word) => setEditing({ word })}
            onBrowseLists={() => setLists(true)}
            onPractice={() => setPracticing(true)}
          />
        ) : (
          <WritingScreen
            // Each language has its own page, its own text and its own prompt.
            key={language}
            language={language}
            words={words}
            account={account.state}
            onSignIn={() => setAuth({ open: true, error: null })}
            onAddWord={(entry) => setEditing({ entry })}
          />
        )}
      </View>

      <TabBar
        view={view}
        onView={setView}
        practice={active.length > 0}
        onPractice={() => setPracticing(true)}
        onMenu={() => {
          sounds.open();
          setMenu(true);
        }}
        inset={insets.bottom}
      />

      {practicing && active.length > 0 ? (
        <PracticeSession
          key={`${language}-${active.length}`}
          language={language}
          words={active}
          onClose={() => setPracticing(false)}
        />
      ) : null}

      {lists ? <ListsScreen key={language} language={language} words={words} onClose={() => setLists(false)} /> : null}

      {editing ? (
        <WordSheet
          key={'word' in editing ? editing.word.id : `new-${normalize(editing.entry.term)}`}
          language={language}
          {...('word' in editing ? { word: editing.word } : { entry: editing.entry })}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {preferences ? (
        <PreferencesSheet
          account={account.state}
          soundsOn={soundsOn}
          onSoundsChange={setSoundsOn}
          onSignOut={account.signOut}
          onDeleteAccount={account.deleteAccount}
          onSignIn={() => {
            setPreferences(false);
            setAuth({ open: true, error: null });
          }}
          onDismiss={() => setPreferences(false)}
        />
      ) : null}

      {auth.open ? (
        <AuthSheet
          error={auth.error}
          pending={account.signingIn}
          onSignIn={signIn}
          onDismiss={() => setAuth({ open: false, error: null })}
        />
      ) : null}

      {menu ? (
        <MenuSheet
          account={account}
          onSignIn={() => {
            setMenu(false);
            setAuth({ open: true, error: null });
          }}
          onPreferences={() => {
            setMenu(false);
            setPreferences(true);
          }}
          onClose={() => setMenu(false)}
        />
      ) : null}
    </View>
  );
}

function LanguagePill({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const spec = LANGUAGES[language];
  return (
    <>
      <Pressable
        onPress={() => {
          sounds.tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Language: ${spec.name}`}
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
        <Text style={{ fontSize: TEXT.md }}>{spec.flag}</Text>
        <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.sm, color: palette.foreground }}>{spec.name}</Text>
        <ChevronDown size={13} color={palette.faint} />
      </Pressable>

      {open ? (
        <Sheet eyebrow="Language" title="What are you learning?" onClose={() => setOpen(false)} footer={<View style={{ flex: 1 }} />}>
          {LANGUAGE_ORDER.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                if (option !== language) sounds.tap();
                onChange(option);
                setOpen(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md }}
            >
              <Text style={{ fontSize: TEXT.xl }}>{LANGUAGES[option].flag}</Text>
              <Body style={{ flex: 1, fontFamily: FONTS.strong }}>{LANGUAGES[option].name}</Body>
              {option === language ? <Check size={17} color={palette.accent} /> : null}
            </Pressable>
          ))}
        </Sheet>
      ) : null}
    </>
  );
}

function TabBar({
  view,
  onView,
  practice,
  onPractice,
  onMenu,
  inset,
}: {
  view: 'words' | 'write';
  onView: (view: 'words' | 'write') => void;
  practice: boolean;
  onPractice: () => void;
  onMenu: () => void;
  inset: number;
}) {
  const { palette } = useTheme();
  const tab = (label: string, Icon: typeof BookOpen, active: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: SPACE.sm, opacity: disabled ? 0.4 : 1 }}
    >
      <View
        style={{
          width: 30,
          height: 26,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          backgroundColor: active ? palette.iconHover : 'transparent',
        }}
      >
        <Icon size={17} color={active ? palette.foreground : palette.muted} />
      </View>
      <Text
        style={{
          fontFamily: active ? FONTS.strong : FONTS.body,
          fontSize: TEXT['2xs'],
          color: active ? palette.foreground : palette.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: palette.line,
        backgroundColor: palette.background,
        paddingBottom: Math.max(inset, SPACE.sm),
        paddingTop: SPACE.xs,
      }}
    >
      {tab('Words', BookOpen, view === 'words', () => {
        if (view !== 'words') sounds.tap();
        onView('words');
      })}
      {tab(
        'Practice',
        Play,
        false,
        () => {
          if (!practice) return sounds.nudge();
          sounds.start();
          onPractice();
        },
        !practice,
      )}
      {tab('Write', PenLine, view === 'write', () => {
        if (view !== 'write') sounds.tap();
        onView('write');
      })}
      {tab('Menu', Ellipsis, false, onMenu)}
    </View>
  );
}

function MenuSheet({
  account,
  onSignIn,
  onPreferences,
  onClose,
}: {
  account: ReturnType<typeof useAccount>;
  onSignIn: () => void;
  onPreferences: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const signedIn = account.state.status === 'signed-in';
  return (
    <Sheet
      eyebrow={signedIn ? 'Account' : 'Blitz'}
      title={signedIn ? 'You are signed in' : 'Make it yours'}
      onClose={onClose}
      footer={<View style={{ flex: 1 }} />}
    >
      <View style={{ gap: SPACE.md }}>
        {signedIn ? (
          <>
            {account.state.status === 'signed-in' ? (
              <Label style={{ textTransform: 'none' }}>{account.state.account.email}</Label>
            ) : null}
            <Body style={{ color: palette.muted }}>Your words sync on every device you sign in to.</Body>
            <Pressable onPress={onPreferences} style={{ paddingVertical: SPACE.md }}>
              <Body style={{ fontFamily: FONTS.strong }}>Preferences</Body>
            </Pressable>
            <Pressable
              onPress={async () => {
                await account.signOut().catch(() => false);
                onClose();
              }}
              style={{ paddingVertical: SPACE.md }}
            >
              <Body style={{ fontFamily: FONTS.strong }}>Sign out</Body>
            </Pressable>
          </>
        ) : (
          <>
            <Body style={{ color: palette.muted }}>Sign in to keep your words and pictures on every device.</Body>
            <Pressable onPress={onSignIn} style={{ paddingVertical: SPACE.md }}>
              <Body style={{ fontFamily: FONTS.strong }}>Sign in to sync</Body>
            </Pressable>
            <Pressable onPress={onPreferences} style={{ paddingVertical: SPACE.md }}>
              <Body style={{ fontFamily: FONTS.strong }}>Preferences</Body>
            </Pressable>
          </>
        )}
      </View>
    </Sheet>
  );
}
