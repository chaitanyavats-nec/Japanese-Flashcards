// Answer checking for typed and spoken Japanese: everything is compared as
// hiragana, so romaji, katakana and hiragana input are all accepted.
import * as wanakana from 'wanakana';

const PUNCT = /[。、！？!?「」『』・\s.,'"-]/g;

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export const toKanaKey = (text) => wanakana.toHiragana((text || '').replace(PUNCT, ''), { passRomaji: false }).toLowerCase();

// 'correct' | 'close' | 'wrong' for an answer against a card. Kanji input
// matching the card's kanji counts too. "Close" is one slip in a word of
// three or more kana (a missed dakuten, a small っ).
export function checkAnswer(input, card) {
  const raw = (input || '').trim();
  if (!raw) return 'wrong';
  if (card.kanji && raw.replace(PUNCT, '') === card.kanji) return 'correct';
  const answer = toKanaKey(raw);
  const target = toKanaKey(card.hiragana);
  if (answer === target) return 'correct';
  if (target.length >= 3 && levenshtein(answer, target) === 1) return 'close';
  return 'wrong';
}

// Speech recognisers return several guesses, often in kanji. Accept any that
// matches the word; otherwise report the closest one heard.
export function checkSpoken(alternatives, card) {
  let best = { verdict: 'wrong', heard: alternatives[0] || '' };
  for (const alt of alternatives) {
    const clean = (alt || '').replace(PUNCT, '');
    if (card.kanji && clean.includes(card.kanji)) return { verdict: 'correct', heard: alt };
    const verdict = checkAnswer(clean, card);
    if (verdict === 'correct') return { verdict, heard: alt };
    if (verdict === 'close' && best.verdict === 'wrong') best = { verdict, heard: alt };
    if (toKanaKey(clean).includes(toKanaKey(card.hiragana))) return { verdict: 'correct', heard: alt };
  }
  return best;
}
