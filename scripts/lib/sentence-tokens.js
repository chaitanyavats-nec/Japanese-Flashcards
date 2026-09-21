// Builds the per-token word-lookup data attached to each example sentence
// (exampleSentence.tokens), so tapping a word in a sentence can show a real
// dictionary entry — not just words that happen to be flashcards themselves.
//
// Two things were making lookups miss before:
//  1. Tokens are inflected surface forms (拾っ, 食べ, ました) while the deck
//     is keyed by dictionary form — so they never matched. kuromoji already
//     reports each token's dictionary form (basic_form); we look that up.
//  2. The deck only holds ~400 words. Sentences use far more. Meanings come
//     from the *full* JMdict here (not the common-only subset the deck is
//     built from), and are baked into the dataset at build time.
const fs = require('fs');
const wanakana = require('wanakana');
const { getFrequency } = require('./tanaka');

// kuromoji (IPAdic) part-of-speech -> how we label it in the UI.
const POS_LABEL = {
  '名詞': 'noun',
  '動詞': 'verb',
  '形容詞': 'adjective',
  '副詞': 'adverb',
  '助詞': 'particle',
  '助動詞': 'auxiliary',
  '接続詞': 'conjunction',
  '連体詞': 'adnominal',
  '感動詞': 'interjection',
  '接頭詞': 'prefix',
  'フィラー': 'filler'
};

// JMdict sense POS tags that are compatible with each kuromoji POS. Used to
// pick the right homograph (e.g. 行う the verb vs. a noun spelled the same)
// and, within an entry, the right sense.
const POS_COMPAT = {
  '名詞': tag => ['n', 'n-adv', 'n-t', 'n-suf', 'n-pref', 'pn', 'num', 'ctr', 'adj-no', 'adj-na', 'vs', 'adv'].includes(tag),
  '動詞': tag => tag.startsWith('v'),
  '形容詞': tag => tag === 'adj-i' || tag === 'adj-ix',
  '副詞': tag => tag === 'adv' || tag === 'adv-to' || tag === 'n-adv',
  '助詞': tag => tag === 'prt' || tag === 'conj',
  '助動詞': tag => ['aux', 'aux-v', 'aux-adj', 'cop'].includes(tag),
  '接続詞': tag => tag === 'conj',
  '連体詞': tag => tag === 'adj-pn',
  '感動詞': tag => tag === 'int',
  '接頭詞': tag => tag === 'pref'
};

// kuromoji sub-types that narrow which JMdict senses make sense — e.g. さん
// after a name is the honorific suffix, not 酸 "acid" (both are common nouns).
const NOUN_DETAIL_COMPAT = {
  '接尾': tag => tag === 'suf' || tag === 'n-suf' || tag === 'ctr',
  '代名詞': tag => tag === 'pn',
  '数': tag => tag === 'num' || tag === 'n',
  '副詞可能': tag => tag === 'n-adv' || tag === 'n-t' || tag === 'adv' || tag === 'n'
};

const RARE_FORM_TAGS = new Set(['rK', 'rk', 'iK', 'ik', 'sK', 'sk', 'oK', 'ok']);
const PUNCT = /^[。、！？!?「」『』（）()・…~〜,.，．:;：；"'“”‘’\-ー]+$/;

const MAX_GLOSSES = 3;

function isPunctuation(t) {
  return t.pos === '記号' || (t.surface_form !== 'ー' && PUNCT.test(t.surface_form));
}

// Every kanji/kana form -> all entries listing it (unlike jmdict.loadIndex,
// which keeps one winner per form; here we need the candidates to choose
// between using the token's part of speech).
function loadLookupIndex(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const index = new Map();
  for (const entry of data.words) {
    for (const f of [...entry.kanji, ...entry.kana]) {
      if (!index.has(f.text)) index.set(f.text, []);
      const list = index.get(f.text);
      if (!list.includes(entry)) list.push(entry);
    }
  }
  return index;
}

function senseIndexFor(entry, kuroPos, kuroDetail) {
  const compat = (kuroPos === '名詞' && NOUN_DETAIL_COMPAT[kuroDetail]) || POS_COMPAT[kuroPos];
  if (!compat) return -1;
  return entry.sense.findIndex(s => (s.partOfSpeech || []).some(compat));
}

// How often the entry's own spelling shows up in the Tanaka Corpus — real
// usage frequency, used to break ties between homographs (いる: 居る "to be"
// vs. 射る "to shoot" vs. 要る "to need" all share the text いる).
function entryFrequency(entry, corpus) {
  const forms = entry.kanji.length > 0 ? entry.kanji : entry.kana;
  return Math.max(0, ...forms.map(f => getFrequency(corpus, f.text)));
}

function pickEntry(candidates, text, t, tokenHira, corpus) {
  let best = null;
  for (const entry of candidates) {
    const form = [...entry.kanji, ...entry.kana].find(f => f.text === text);
    let score = 0;
    if (form && form.common) score += 4;
    if (form && (form.tags || []).some(t => RARE_FORM_TAGS.has(t))) score -= 4;
    const senseIdx = senseIndexFor(entry, t.pos, t.pos_detail_1);
    if (senseIdx >= 0) score += 10;
    score += Math.log10(1 + entryFrequency(entry, corpus)) * 2;
    // For an uninflected kanji token, the entry's kana must agree with how
    // kuromoji actually read it (distinguishes 今日 きょう/こんにち, 日 ひ/にち).
    if (tokenHira && entry.kana.some(k => k.text === tokenHira)) score += 5;
    if (!best || score > best.score) best = { entry, score, senseIdx: Math.max(senseIdx, 0) };
  }
  return best;
}

function glossesOf(entry, senseIdx) {
  const sense = entry.sense[senseIdx] || entry.sense[0];
  return (sense ? sense.gloss : [])
    .filter(g => g.lang === 'eng')
    .slice(0, MAX_GLOSSES)
    .map(g => g.text);
}

const E_TO_U = { 'え': 'う', 'け': 'く', 'げ': 'ぐ', 'せ': 'す', 'て': 'つ', 'ね': 'ぬ', 'べ': 'ぶ', 'め': 'む', 'れ': 'る' };
function potentialToGodan(lemma) {
  if (lemma.length < 3 || !lemma.endsWith('る')) return null;
  const u = E_TO_U[lemma[lemma.length - 2]];
  return u ? lemma.slice(0, -2) + u : null;
}

function lookupToken(t, lookupIndex, corpus) {
  const surface = t.surface_form;
  if (isPunctuation(t)) return { ja: surface, hi: surface, punct: true };

  const hiragana = wanakana.toHiragana(t.reading && t.reading !== '*' ? t.reading : surface);
  const lemma = t.basic_form && t.basic_form !== '*' ? t.basic_form : surface;
  const inflected = lemma !== surface;
  const pos = t.pos_detail_1 === '固有名詞' ? 'name'
    : t.pos_detail_1 === '代名詞' ? 'pronoun'
    : POS_LABEL[t.pos] || 'other';

  const token = { ja: surface, hi: hiragana, pos };
  if (inflected) token.base = lemma;
  // Personal names (トム, 直子) either aren't in JMdict or collide with an
  // unrelated common word (ヒューズ "fuse"). Place names (日本, 長崎) are fine.
  if (t.pos_detail_1 === '固有名詞' && t.pos_detail_2 === '人名') return token;

  // Uninflected tokens: match on the surface text and its reading. Inflected
  // tokens: match on the dictionary form (kuromoji's basic_form).
  let candidates = lookupIndex.get(lemma) || (inflected ? lookupIndex.get(surface) : null) || lookupIndex.get(hiragana);
  let matchedLemma = lemma;
  if ((!candidates || candidates.length === 0) && t.pos === '動詞') {
    // kuromoji reports potential/imperative forms (泳げる, 出せ) as their own
    // "verb" with no dictionary entry — map the e-row ending back to the
    // godan dictionary form (泳げる -> 泳ぐ, 出せる -> 出す).
    const godan = potentialToGodan(lemma);
    candidates = godan && lookupIndex.get(godan);
    if (candidates) matchedLemma = godan;
  }
  if (!candidates || candidates.length === 0) return token;

  const picked = pickEntry(candidates, matchedLemma, t, inflected ? null : hiragana, corpus);
  if (!picked) return token;
  if (matchedLemma !== lemma) token.base = matchedLemma;

  const m = glossesOf(picked.entry, picked.senseIdx);
  if (m.length > 0) token.m = m;

  // The dictionary form's reading, so an inflected token can show
  // "拾う (ひろう)" instead of only the kanji lemma.
  if (token.base) {
    const kana = picked.entry.kana.find(k => (k.appliesToKanji || []).includes('*') || (k.appliesToKanji || []).includes(matchedLemma))
      || picked.entry.kana[0];
    if (kana) token.baseHi = kana.text;
  }
  return token;
}

// Returns the tokens for one sentence: [{ ja, hi, pos, base?, baseHi?, m? }]
// (punctuation tokens are { ja, hi, punct: true }).
function tokenizeSentence(kuromojiTokens, lookupIndex, corpus) {
  return kuromojiTokens.map(t => lookupToken(t, lookupIndex, corpus));
}

module.exports = { loadLookupIndex, tokenizeSentence, isPunctuation };
