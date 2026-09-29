// Daily study activity: what drives the streak, the daily goal, XP and
// levels, retention and the badges. Stored as one small object:
//   days    { 'YYYY-MM-DD': { reviews, correct, xp, newCards } }
//   xp      lifetime XP
//   badges  { badgeId: ISO time earned }
//   speakingPasses  spoken answers the recogniser accepted
import { dayKey, shiftDay } from './storage';

export const ACTIVITY_KEY = 'flashcards_activity';

export const emptyActivity = () => ({ days: {}, xp: 0, badges: {}, speakingPasses: 0 });

// XP per answer, by grade (Again, Hard, Good, Easy); trying still earns a little.
const GRADE_XP = { 1: 2, 2: 6, 3: 10, 4: 12 };
export const NEW_WORD_XP = 5;

// The change one answer makes, kept so it can be taken back on undo.
export function reviewDelta(grade, { isNew = false, now = Date.now() } = {}) {
  return {
    day: dayKey(now),
    reviews: 1,
    correct: grade >= 2 ? 1 : 0,
    newCards: isNew ? 1 : 0,
    xp: (GRADE_XP[grade] || 0) + (isNew && grade >= 2 ? NEW_WORD_XP : 0)
  };
}

export function applyDelta(activity, delta, sign = 1) {
  const day = activity.days[delta.day] || { reviews: 0, correct: 0, xp: 0, newCards: 0 };
  const nextDay = {
    reviews: Math.max(0, day.reviews + sign * delta.reviews),
    correct: Math.max(0, day.correct + sign * delta.correct),
    xp: Math.max(0, day.xp + sign * delta.xp),
    newCards: Math.max(0, (day.newCards || 0) + sign * delta.newCards)
  };
  return {
    ...activity,
    days: { ...activity.days, [delta.day]: nextDay },
    xp: Math.max(0, (activity.xp || 0) + sign * delta.xp)
  };
}

export const today = (activity, now = Date.now()) =>
  activity.days[dayKey(now)] || { reviews: 0, correct: 0, xp: 0, newCards: 0 };

// A streak counts days with at least one review. Today not being done yet
// doesn't break it; it only breaks once a whole day passes without study.
export function streakInfo(activity, now = Date.now()) {
  const studied = (offset) => (activity.days[dayKey(shiftDay(now, offset))]?.reviews || 0) > 0;
  const studiedToday = studied(0);
  let current = 0;
  for (let offset = studiedToday ? 0 : -1; studied(offset); offset--) current++;

  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of Object.keys(activity.days).sort()) {
    if ((activity.days[key].reviews || 0) === 0) continue;
    const t = Date.parse(`${key}T12:00:00`);
    run = prev !== null && dayKey(shiftDay(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current), studiedToday };
}

// Level n starts at 50 * n * (n - 1) XP: 0, 100, 300, 600, 1000...
const levelStart = (n) => 50 * n * (n - 1);
export function levelInfo(xp = 0) {
  let level = 1;
  while (xp >= levelStart(level + 1)) level++;
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { level, xpIntoLevel: xp - from, xpForLevel: to - from, progress: (xp - from) / (to - from) };
}

// Share of answers recalled (Hard or better) over the last `window` days.
export function retention(activity, now = Date.now(), window = 30) {
  let reviews = 0;
  let correct = 0;
  for (let i = 0; i < window; i++) {
    const day = activity.days[dayKey(shiftDay(now, -i))];
    if (!day) continue;
    reviews += day.reviews;
    correct += day.correct;
  }
  return { reviews, correct, rate: reviews > 0 ? correct / reviews : null };
}

export const goalDaysMet = (activity, goal) =>
  Object.values(activity.days).filter(d => d.reviews >= goal).length;

export const totalReviews = (activity) =>
  Object.values(activity.days).reduce((sum, d) => sum + d.reviews, 0);
