// Builds study sessions: which words come up, in what order, and how each
// one is asked.
import { isDue, normalizeRecord, dueAt, MAX_STAGE } from './srs';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Themes that are grab-bags rather than sets of related words; a few of
// these together don't interfere with each other.
const BROAD_THEMES = new Set(['Common Verbs', 'Common Nouns']);
const themeLimit = (theme) => (!theme || BROAD_THEMES.has(theme) ? 3 : 1);

// Reorders so neighbours don't share a theme where avoidable: meeting
// 赤い right after 青い invites mixing them up.
export function interleaveByTheme(list) {
  const pending = [...list];
  const out = [];
  while (pending.length > 0) {
    const last = out[out.length - 1];
    const lookahead = Math.min(pending.length, 6);
    let pick = 0;
    for (let i = 0; i < lookahead; i++) {
      if (!last || !pending[i].theme || pending[i].theme !== last.theme) { pick = i; break; }
    }
    out.push(pending.splice(pick, 1)[0]);
  }
  return out;
}

// Words due today, most at risk of being forgotten first: the most overdue
// relative to their interval, then the most often forgotten, then the
// lowest ease.
export function dueCards(cards, progress, now = Date.now()) {
  const due = cards.filter(c => isDue(progress[c.id], now));
  const risk = (c) => {
    const r = normalizeRecord(progress[c.id]);
    const overdueDays = (now - dueAt(r)) / 86400000;
    return overdueDays / Math.max(r.interval || 0.5, 0.5);
  };
  const sorted = due.sort((a, b) => {
    const ra = normalizeRecord(progress[a.id]);
    const rb = normalizeRecord(progress[b.id]);
    return risk(b) - risk(a) || (rb.lapses || 0) - (ra.lapses || 0) || (ra.ease || 2.5) - (rb.ease || 2.5);
  });
  return interleaveByTheme(sorted);
}

// The next `limit` unseen words along the learning path (the learner's own
// cards first, then level by level). Related words are spread out: at most
// one word per theme in a batch (three for the broad ones), topping up from
// the skipped words only when there aren't enough themes to go round.
export function pickNewCards(cards, progress, limit) {
  if (limit <= 0) return [];
  const pathOrder = (c) => (c.custom ? -1 : c.tier || 9);
  const unseen = cards
    .filter(c => !progress[c.id])
    .sort((a, b) => pathOrder(a) - pathOrder(b) || String(a.id).localeCompare(String(b.id)));
  const picked = [];
  const skipped = [];
  const perTheme = new Map();
  for (const card of unseen) {
    if (picked.length >= limit) break;
    const theme = card.custom ? null : card.theme;
    const used = perTheme.get(theme) || 0;
    if (theme && used >= themeLimit(theme)) { skipped.push(card); continue; }
    perTheme.set(theme, used + 1);
    picked.push(card);
  }
  for (const card of skipped) {
    if (picked.length >= limit) break;
    picked.push(card);
  }
  return interleaveByTheme(picked);
}

// Words to practise when nothing is due: learnt words with the weakest
// memory (lowest ease, then the soonest due).
export function weakestCards(cards, progress, limit) {
  return cards
    .filter(c => progress[c.id])
    .sort((a, b) => {
      const ra = normalizeRecord(progress[a.id]);
      const rb = normalizeRecord(progress[b.id]);
      return (ra.ease || 2.5) - (rb.ease || 2.5) || dueAt(ra) - dueAt(rb);
    })
    .slice(0, limit);
}

// ---------- Question formats ----------
// intro     first meeting: word, meaning and an example, all on one face
// recognize Japanese shown, pick the English meaning (receptive recognition)
// produce   English shown, pick the Japanese word (productive recognition)
// type      English shown, type the Japanese (productive recall)
// listen    only the sound, pick the meaning
// context   the word inside a sentence, pick what it means there
// speak     English shown, say the Japanese out loud
// flip      classic self-graded flashcard
export const FORMAT_LABELS = {
  intro: 'New word',
  recognize: 'What does this mean?',
  produce: 'Which word means this?',
  type: 'Type it in Japanese',
  listen: 'What did you hear?',
  context: 'What does it mean here?',
  speak: 'Say it in Japanese',
  flip: 'Do you know this word?'
};

// Harder formats as a word's memory grows (the stage rises with correct
// answers and falls with lapses): recognise it, then pick it from English,
// then produce it from memory, then mix it up.
export function formatFor(card, rec, settings, { canSpeak = false, sentences = 1 } = {}) {
  const r = normalizeRecord(rec);
  const stage = Math.min(r?.stage || 0, MAX_STAGE);
  const seen = r?.timesReviewed || 0;
  const style = settings.reviewStyle;
  if (style === 'flip') return 'flip';
  if (style === 'typing') return 'type';
  if (style === 'choice') {
    const pool = ['recognize', 'produce', 'listen'];
    if (sentences > 0) pool.push('context');
    return stage === 0 ? 'recognize' : pool[seen % pool.length];
  }
  if (stage === 0) return 'recognize';
  if (stage === 1) return 'produce';
  if (stage === 2) return 'type';
  const pool = ['type', 'listen'];
  if (sentences > 0) pool.push('context');
  if (canSpeak && settings.speaking) pool.push('speak');
  return pool[seen % pool.length];
}

// An easier way to ask again after a miss in the same session.
export const easierFormat = (format) => ({ type: 'produce', speak: 'produce', produce: 'recognize', context: 'recognize', listen: 'recognize' }[format] || format);

// Every example sentence a card has: the built-in ones, then any the
// learner generated.
export const sentencesFor = (card, generated = []) =>
  [card.exampleSentence, ...(card.moreSentences || []), ...generated].filter(Boolean);

// Which sentence to show on the nth encounter, so each review rotates to a
// different context.
export const sentenceFor = (card, encounter = 0, generated = []) => {
  const list = sentencesFor(card, generated);
  return list.length > 0 ? list[encounter % list.length] : null;
};

const meaningKey = (c) => (c.englishMeanings?.[0] || '').toLowerCase().replace(/^to /, '');

// Three wrong answers for a multiple-choice question. Same part of speech
// where possible so the right answer can't be spotted by its shape, and
// never a word with the same meaning or spelling.
export function pickDistractors(card, pool, n = 3) {
  const key = meaningKey(card);
  const usable = pool.filter(c =>
    c.id !== card.id &&
    meaningKey(c) &&
    meaningKey(c) !== key &&
    c.hiragana !== card.hiragana &&
    (c.kanji || c.hiragana) !== (card.kanji || card.hiragana)
  );
  const samePos = shuffle(usable.filter(c => c.partOfSpeech === card.partOfSpeech));
  const others = shuffle(usable.filter(c => c.partOfSpeech !== card.partOfSpeech));
  const out = [];
  const seenKeys = new Set([key]);
  for (const c of [...samePos, ...others]) {
    if (out.length >= n) break;
    if (seenKeys.has(meaningKey(c))) continue;
    seenKeys.add(meaningKey(c));
    out.push(c);
  }
  return out;
}

export const optionsFor = (card, pool) => shuffle([card, ...pickDistractors(card, pool)]);

// Session items. New words get an intro before they're first quizzed, in
// small groups (meet three, then answer three) so the quiz isn't only a
// test of the last card seen.
export function buildItems({ due = [], fresh = [], progress, settings, canSpeak, encounters }) {
  const items = [];
  const quizFor = (card) => ({
    card,
    format: formatFor(card, progress[card.id], settings, { canSpeak, sentences: sentencesFor(card).length }),
    encounter: encounters(card)
  });
  due.forEach(card => items.push(quizFor(card)));

  const introStyle = settings.reviewStyle === 'flip' ? 'flip' : null;
  for (let i = 0; i < fresh.length; i += 3) {
    const group = fresh.slice(i, i + 3);
    if (introStyle) {
      group.forEach(card => items.push({ card, format: 'flip', encounter: 0, isNew: true }));
      continue;
    }
    group.forEach(card => items.push({ card, format: 'intro', encounter: 0, isNew: true }));
    const firstQuiz = settings.reviewStyle === 'typing' ? 'type' : 'recognize';
    shuffle(group).forEach(card => items.push({ card, format: firstQuiz, encounter: 0, isNew: true }));
  }
  return items;
}
