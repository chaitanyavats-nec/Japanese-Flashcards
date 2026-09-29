// Spaced-repetition scheduling: an SM-2 variant with Anki-style learning
// steps. Every graded answer moves a word's next review further out when it
// was recalled and pulls it back to a few minutes away when it wasn't, so
// words come back right before they would be forgotten.
//
// A word's record (progress[id]) keeps the fields the rest of the app always
// read (status: 'know' | 'dont', timesReviewed, lastReviewedAt) and adds:
//   due       ISO time the word is next due
//   interval  days until the next review (0 while learning or relearning)
//   ease      interval multiplier for a correct answer, 1.3-3.0
//   reps      correct answers in a row since the last lapse
//   lapses    times it was forgotten after being learnt
//   stage     retrieval difficulty reached, 0-3 (see queue.js formats)
//   lastGrade the most recent grade
import { MINUTE, DAY, endOfDay } from './storage';

export const GRADES = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };
export const GRADE_LABELS = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL = 365;
export const MAX_STAGE = 3;
export const MASTERED_INTERVAL = 21;
export const RELEARN_DELAY = 10 * MINUTE;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Records saved before scheduling existed only carry status/timesReviewed/
// lastReviewedAt. Treat known words as learnt two days before their last
// review and unknown ones as due now, so nobody's progress is thrown away.
export function normalizeRecord(rec) {
  if (!rec || rec.due) return rec || null;
  const last = rec.lastReviewedAt ? Date.parse(rec.lastReviewedAt) : Date.now();
  const known = rec.status === 'know';
  return {
    ...rec,
    interval: known ? 2 : 0,
    ease: START_EASE,
    reps: known ? 1 : 0,
    lapses: 0,
    stage: known ? 1 : 0,
    due: new Date(known ? last + 2 * DAY : last).toISOString()
  };
}

// Spread reviews a little so words learnt together don't stay in lockstep.
const fuzz = (days, random) => (days > 2 ? days * (0.95 + random() * 0.1) : days);

// The record after answering with `grade` at time `now`. Pass
// `{ random: () => 0.5 }` for a stable preview with no fuzz.
export function schedule(prev, grade, now = Date.now(), { random = Math.random } = {}) {
  const rec = normalizeRecord(prev) || { interval: 0, ease: START_EASE, reps: 0, lapses: 0, stage: 0, timesReviewed: 0 };
  let interval = rec.interval || 0;
  let ease = rec.ease || START_EASE;
  let reps = rec.reps || 0;
  let lapses = rec.lapses || 0;
  let stage = rec.stage || 0;
  const last = rec.lastReviewedAt ? Date.parse(rec.lastReviewedAt) : now;
  const elapsed = Math.max(0, (now - last) / DAY);
  let wait;

  if (grade === GRADES.AGAIN) {
    // Forgotten: relearn in a few minutes, and grow more slowly from now on.
    if (interval >= 1) {
      lapses += 1;
      ease = Math.max(MIN_EASE, ease - 0.2);
    }
    interval = 0;
    reps = 0;
    stage = Math.max(0, stage - 1);
    wait = RELEARN_DELAY;
  } else if (interval < 1) {
    // New or relearning: Hard repeats the step, Good graduates to tomorrow,
    // Easy skips ahead.
    if (grade === GRADES.HARD) {
      wait = RELEARN_DELAY;
    } else {
      interval = grade === GRADES.EASY ? 4 : 1;
      if (grade === GRADES.EASY) ease = Math.min(MAX_EASE, ease + 0.15);
      reps += 1;
      stage = Math.min(MAX_STAGE, stage + 1);
      wait = interval * DAY;
    }
  } else {
    // Review. Answering late still counts the extra time the word was
    // remembered; answering early never shortens the interval.
    const delay = elapsed - interval;
    let next;
    if (grade === GRADES.HARD) {
      ease = Math.max(MIN_EASE, ease - 0.15);
      next = delay >= 0 ? interval * 1.2 + delay / 4 : Math.max(interval, elapsed * 1.2);
    } else if (grade === GRADES.GOOD) {
      next = delay >= 0 ? (interval + delay / 2) * ease : Math.max(interval, elapsed * ease);
    } else {
      ease = Math.min(MAX_EASE, ease + 0.15);
      next = delay >= 0 ? (interval + delay) * ease * 1.3 : Math.max(interval, elapsed * ease * 1.3);
    }
    if (delay >= 0) next = Math.max(next, interval + 1);
    interval = clamp(Math.round(fuzz(next, random) * 10) / 10, 1, MAX_INTERVAL);
    reps += 1;
    if (grade >= GRADES.GOOD) stage = Math.min(MAX_STAGE, stage + 1);
    wait = interval * DAY;
  }

  return {
    ...rec,
    status: grade >= GRADES.HARD ? 'know' : 'dont',
    timesReviewed: (rec.timesReviewed || 0) + 1,
    lastReviewedAt: new Date(now).toISOString(),
    due: new Date(now + wait).toISOString(),
    interval,
    ease: Math.round(ease * 100) / 100,
    reps,
    lapses,
    stage,
    lastGrade: grade
  };
}

// Due any time today counts as due: a word scheduled for 6pm is ready at 9am.
export const isDue = (rec, now = Date.now()) => !!rec && Date.parse(normalizeRecord(rec).due) <= endOfDay(now);
export const dueAt = (rec) => (rec ? Date.parse(normalizeRecord(rec).due) : null);

// 'new' | 'learning' | 'learnt' | 'mastered'
export function wordState(rec) {
  const r = normalizeRecord(rec);
  if (!r) return 'new';
  if (r.status === 'dont' || (r.interval || 0) < 1) return 'learning';
  return r.interval >= MASTERED_INTERVAL ? 'mastered' : 'learnt';
}

// A word the learner keeps tripping over; its personal note is offered as a
// hint before they answer.
export function isHard(rec) {
  const r = normalizeRecord(rec);
  return !!r && ((r.lapses || 0) >= 2 || (r.ease || START_EASE) <= 2.0);
}

// "10 minutes", "tomorrow", "4 days", "3 weeks", "2 months"
export function describeWait(ms) {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(ms / (60 * MINUTE));
  if (hours < 20) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(ms / DAY);
  if (days <= 1) return 'a day';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return 'a year';
}

// Short labels for the four grade buttons: "10m", "1d", "4d", "3w".
export function shortWait(ms) {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(ms / (60 * MINUTE));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

// What each grade would do right now, for labelling the grade buttons.
export function previewGrades(rec, now = Date.now()) {
  const stable = { random: () => 0.5 };
  return [1, 2, 3, 4].map(grade => Date.parse(schedule(rec, grade, now, stable).due) - now);
}
