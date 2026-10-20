import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { Flame } from 'lucide-react-native';
import { type Day, dayOf, streakOf, weekOf } from '@blitz/core/streak.ts';
import { currentGrowth, settleGrowth, subscribeGrowth, type Growth } from '../../data/streak';
import { usePracticeDays } from '../../data/hooks';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Label } from '../../ui/kit';
import { Sheet } from '../../ui/Sheet';

const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' });
const weekday = (day: Day) => WEEKDAY.format(new Date(`${day}T12:00:00Z`));
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

/** Today, kept current past midnight. */
function useToday(): Day {
  const [today, setToday] = useState(() => dayOf(Date.now()));
  useEffect(() => {
    const check = () => setToday(dayOf(Date.now()));
    const midnight = new Date();
    midnight.setHours(24, 0, 1, 0);
    const timer = setTimeout(check, Math.max(1000, midnight.getTime() - Date.now()));
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);
  return today;
}

/** The practice streak: a flame and a count in the corner, which opens last week. */
export function StreakBadge({ hold }: { hold: boolean }) {
  const { palette } = useTheme();
  const today = useToday();
  const practised = usePracticeDays();
  const [growth, setGrowth] = useState<Growth | null>(() => currentGrowth());
  const [open, setOpen] = useState(false);
  const [landed, setLanded] = useState(0);

  const settle = useCallback(() => {
    settleGrowth();
    setGrowth(null);
    setLanded((count) => count + 1);
  }, []);

  // A streak that grew while a lesson was open waits until the lesson is gone.
  useEffect(() => {
    if (growth || hold) return;
    const unsubscribe = subscribeGrowth(() => setGrowth(currentGrowth()));
    const now = currentGrowth();
    if (now) setGrowth(now);
    return () => {
      unsubscribe();
    };
  }, [growth, hold]);

  useEffect(() => {
    if (!growth || hold) return;
    const timer = setTimeout(() => {
      sounds.streak();
      settle();
    }, 380);
    return () => clearTimeout(timer);
  }, [growth, hold, settle]);

  const streak = useMemo(() => streakOf(practised, today), [practised, today]);
  const state = streak.today ? 'done' : streak.count > 0 ? 'open' : 'none';

  return (
    <>
      <Pressable
        key={landed}
        onPress={() => {
          sounds.open();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          streak.count === 0
            ? 'No streak yet'
            : `${days(streak.count)} streak${streak.today ? ', today done' : ', practise today to keep it'}`
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          borderRadius: RADIUS.pill,
          backgroundColor: palette.iconBackground,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Flame size={15} color={state === 'none' ? palette.faint : palette.accent} />
        <Text
          style={{
            fontFamily: FONTS.black,
            fontSize: TEXT.sm,
            color: state === 'none' ? palette.faint : state === 'done' ? palette.accent : palette.muted,
          }}
        >
          {streak.count}
        </Text>
      </Pressable>

      {open ? <StreakSheet practised={practised} today={today} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function StreakSheet({ practised, today, onClose }: { practised: Day[]; today: Day; onClose: () => void }) {
  const { palette } = useTheme();
  const { count, today: done, best } = streakOf(practised, today);
  const message = done
    ? 'Done for today. Come back tomorrow to keep it going.'
    : count > 0
      ? 'Answer a question today to keep it going.'
      : 'Answer a question a day to build a streak.';

  return (
    <Sheet eyebrow="Streak" title={count === 0 ? 'No streak yet' : `${days(count)} in a row`} onClose={onClose} footer={<View style={{ flex: 1 }} />}>
      <View style={{ gap: SPACE.lg }}>
        <Body style={{ color: palette.muted }}>{message}</Body>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {weekOf(practised, today).map(({ day, practised: was }) => (
            <View key={day} style={{ alignItems: 'center', gap: SPACE.xs }}>
              <Label style={{ textTransform: 'none', fontSize: TEXT.xs }}>{weekday(day)}</Label>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: RADIUS.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: was ? palette.accentShadow : palette.iconBackground,
                  borderWidth: day === today ? 1.5 : 0,
                  borderColor: palette.accent,
                }}
              >
                {was ? <Flame size={15} color={palette.accent} /> : null}
              </View>
            </View>
          ))}
        </View>

        {best > 0 ? (
          <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>
            Longest streak: <Body style={{ fontFamily: FONTS.strong }}>{days(best)}</Body>
          </Body>
        ) : null}
      </View>
    </Sheet>
  );
}
