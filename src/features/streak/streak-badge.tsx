import { Flame } from 'lucide-react';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type Growth, useGrowth, usePracticeDays, useToday } from '../../data/streak.ts';
import { type Day, streakOf, weekOf } from '@blitz/core/streak.ts';
import { sounds } from '../../shared/sound.ts';
import account from '../account/account.module.css';
import styles from './streak.module.css';

/** After the lesson has gone and its sounds are over. */
const SETTLE_MS = 380;
/** How long the big count stays in the middle before it flies to its corner. */
const SHOW_MS = 1900;
const FLY_MS = 620;

const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' });
const weekday = (day: Day) => WEEKDAY.format(new Date(`${day}T12:00:00Z`));
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

/**
 * The practice streak, in the top-right corner: phones have it alone there,
 * wide screens left of install and the account. Opens the last week.
 *
 * The first answer of the day grows it. Once the lesson is closed (`hold`
 * goes false) the new count is celebrated in the middle of the screen and
 * flies into the corner.
 */
export function StreakBadge({ hold }: { hold: boolean }) {
  const today = useToday();
  const practised = usePracticeDays();
  const [growth, settle] = useGrowth();
  const [celebrating, setCelebrating] = useState<Growth | null>(null);
  const [landed, setLanded] = useState(0);
  const badge = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!growth || hold || celebrating) return;
    const timer = setTimeout(() => {
      settle();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sounds.streak();
        setLanded((count) => count + 1);
      } else {
        setCelebrating(growth);
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [growth, hold, celebrating]);

  if (!practised) return null;
  const streak = streakOf(practised, today);
  // The corner keeps the old count until the new one lands in it.
  const shown = celebrating ? celebrating.from : streak.count;
  const state = celebrating ? 'open' : streak.today ? 'done' : streak.count > 0 ? 'open' : 'none';
  const label =
    streak.count === 0
      ? 'No streak yet'
      : `${days(streak.count)} streak${streak.today ? ', today done' : ', practise today to keep it'}`;

  return (
    <>
      <button
        ref={badge}
        type="button"
        className={`${account.badge} ${account.guestBadge} ${styles.badge}`}
        data-state={state}
        // A fresh key replays the bump each time a count lands.
        key={landed}
        data-landed={landed > 0 || undefined}
        popoverTarget="streak-menu"
        onClick={() => sounds.open()}
        aria-label={`Streak: ${label}`}
      >
        <Flame className={styles.flame} aria-hidden="true" />
        <strong>{shown}</strong>
      </button>
      <div id="streak-menu" popover="auto" className={`${account.menu} ${styles.menu}`}>
        <StreakCard practised={practised} today={today} />
      </div>
      {celebrating &&
        createPortal(
          <Celebration
            growth={celebrating}
            target={badge}
            onLanded={() => {
              setCelebrating(null);
              setLanded((count) => count + 1);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function StreakCard({ practised, today }: { practised: Day[]; today: Day }) {
  const { count, today: done, best } = streakOf(practised, today);
  const message = done
    ? 'Done for today. Come back tomorrow to keep it going.'
    : count > 0
      ? 'Answer a question today to keep it going.'
      : 'Answer a question a day to build a streak.';

  return (
    <div className={styles.card}>
      <div className={styles.cardHead} data-state={done ? 'done' : 'open'}>
        <Flame aria-hidden="true" />
        <div>
          <strong>{count === 0 ? 'No streak yet' : `${days(count)} in a row`}</strong>
          <small>{message}</small>
        </div>
      </div>
      <ol className={styles.week} aria-label="The last seven days">
        {weekOf(practised, today).map(({ day, practised: was }) => (
          <li key={day} data-practised={was || undefined} data-today={day === today || undefined}>
            <span aria-hidden="true">{weekday(day)}</span>
            <i>{was && <Flame aria-hidden="true" />}</i>
            <span className="sr-only">{`${day}: ${was ? 'practised' : 'not practised'}`}</span>
          </li>
        ))}
      </ol>
      {best > 0 && <p className={styles.best}>Longest streak: {days(best)}</p>}
    </div>
  );
}

const SPARKS = 14;

/**
 * The new count, big in the middle: the flame catches, the old number rolls
 * up and out for the new one, sparks fly, and then it shrinks into the corner
 * badge. Nothing on the page is blocked meanwhile.
 */
function Celebration({ growth, target, onLanded }: { growth: Growth; target: RefObject<HTMLElement | null>; onLanded: () => void }) {
  const mark = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => {
    sounds.streak();
    const flights: Animation[] = [];
    const timer = setTimeout(() => {
      const from = mark.current?.getBoundingClientRect();
      const to = target.current?.getBoundingClientRect();
      if (!mark.current || !from || !to || to.width === 0) return landed.current();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = Math.max(0.12, to.height / from.height);
      // A little hop back first, then a swoop into the corner.
      const flight = mark.current.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * -0.04}px, ${dy * -0.06}px) scale(1.08)`, opacity: 1, offset: 0.22 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.5 },
        ],
        { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' },
      );
      flights.push(flight);
      const fade = caption.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(0.6rem)' }], {
        duration: FLY_MS / 2,
        fill: 'forwards',
      });
      if (fade) flights.push(fade);
      flight.finished.then(
        () => {
          sounds.streakLand();
          landed.current();
        },
        () => {},
      );
    }, SHOW_MS);
    return () => {
      clearTimeout(timer);
      for (const flight of flights) flight.cancel();
    };
  }, []);

  return (
    <div className={styles.overlay} role="status">
      <div className={styles.stage}>
        <div ref={mark} className={styles.mark}>
          <div className={styles.pop}>
            <span className={styles.glow} aria-hidden="true" />
            {Array.from({ length: SPARKS }, (_, index) => (
              <i
                key={index}
                className={styles.spark}
                aria-hidden="true"
                style={{ '--angle': `${(360 / SPARKS) * index + (index % 2) * 9}deg`, '--reach': `${index % 3 === 0 ? 7.5 : 5.6}rem` } as CSSProperties}
              />
            ))}
            <Flame className={styles.bigFlame} aria-hidden="true" />
            <span className={styles.count} data-digits={Math.min(4, String(growth.to).length)} aria-hidden="true">
              <span className={styles.old}>{growth.from}</span>
              <span className={styles.new}>{growth.to}</span>
            </span>
            <span className={styles.plus} aria-hidden="true">
              +1
            </span>
          </div>
        </div>
        <p ref={caption} className={styles.caption}>
          {growth.from === 0 ? 'Streak started!' : `${days(growth.to)} in a row!`}
        </p>
      </div>
    </div>
  );
}
