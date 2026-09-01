// Local JMdict (jmdict-eng-common) lookup — replaces the old Jisho API
// fetch loop. Same underlying data (Jisho is a JMdict wrapper), but local,
// instant, and keyed by exact kanji/kana text instead of Jisho's kana-only
// search, which sometimes returned an unrelated homophone as the top hit.
const fs = require('fs');

// Indexes every kanji/kana surface form to its entry, keyed by exact text.
// Some forms are listed on an entry as a rare/alternate reading without
// being that entry's *common* sense of the word (e.g. 九 "nine" lists この
// among its archaic readings) — indexing those indiscriminately would let
// an obscure reading of an unrelated word shadow the real, common word with
// that same text. So: common-flagged forms are indexed first and win; a
// form is only indexed from a non-common listing if no entry claims it as
// common.
//
// Some text is genuinely marked common on *two different* entries (本 is
// both the primary word for "book" and an alternate kanji spelling of もと
// "origin") — for those, prefer whichever entry lists that text as its
// *primary* (first-listed) common form over one where it's a secondary
// alternate spelling, since a dictionary entry's first form is its
// canonical one.
function loadIndex(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const index = new Map();
  const primaryRank = new Map(); // text -> how far into its winning entry's forms it was found (0 = primary)
  const fallback = new Map();
  for (const entry of data.words) {
    const commonForms = [...entry.kanji, ...entry.kana].filter(f => f.common);
    commonForms.forEach((k, rank) => {
      const existingRank = primaryRank.get(k.text);
      if (existingRank === undefined || rank < existingRank) {
        index.set(k.text, entry);
        primaryRank.set(k.text, rank);
      }
    });
    for (const k of [...entry.kanji, ...entry.kana]) {
      if (!k.common && !fallback.has(k.text)) fallback.set(k.text, entry);
    }
  }
  for (const [text, entry] of fallback) {
    if (!index.has(text)) index.set(text, entry);
  }
  return { index, words: data.words };
}

function lookup(jmdict, word) {
  return jmdict.index.get(word) || null;
}

// Rarely-used/search-only kanji forms (rK/sK) shouldn't be treated as "the"
// spelling of a word just because they're the only kanji form present —
// e.g. する's only kanji form is 為る, tagged rK, while する itself is the
// common kana form. Prefer a genuinely common, non-rK/sK form; only fall
// back to whatever's first if nothing is marked common at all.
const OBSCURE_KANJI_TAGS = new Set(['rK', 'sK']);

function primaryForm(forms) {
  if (!forms || forms.length === 0) return null;
  const common = forms.find(f => f.common && !(f.tags || []).some(t => OBSCURE_KANJI_TAGS.has(t)));
  if (common) return common.text;
  const anyCommon = forms.find(f => f.common);
  return (anyCommon || forms[0]).text;
}

function englishMeanings(entry) {
  for (const sense of entry.sense) {
    const glosses = sense.gloss.filter(g => g.lang === 'eng').map(g => g.text);
    if (glosses.length > 0) return glosses;
  }
  return [];
}

const GODAN_PREFIX = 'v5';

// Classify an entry's grammatical category from its first sense's
// part-of-speech tags (e.g. ["v1", "vt"], ["adj-i"], ["n"]).
function classify(entry) {
  const tags = (entry.sense[0] && entry.sense[0].partOfSpeech) || [];

  // "exp" (expression) marks a multi-word phrase (e.g. ことが出来る, やって来る)
  // even when it also carries a verb tag — check this first so phrases don't
  // get treated as single inflectable vocabulary words.
  if (tags.includes('exp')) {
    return { partOfSpeech: 'expression' };
  }
  // The copula (だ/です/である/…) sometimes also carries a verb-conjugation
  // tag (である is tagged ["cop","v5r-i"]) — check this before verb detection
  // so it isn't treated as an ordinary content-word verb to conjugate.
  if (tags.includes('cop')) {
    return { partOfSpeech: 'particle' };
  }
  if (tags.includes('v1') || tags.includes('vz')) {
    return { partOfSpeech: 'verb', verbType: 'ichidan' };
  }
  if (tags.includes('vk')) {
    return { partOfSpeech: 'verb', verbType: 'kuru' };
  }
  if (tags.includes('vs') || tags.includes('vs-i') || tags.includes('vs-s')) {
    return { partOfSpeech: 'verb', verbType: 'suru' };
  }
  if (tags.some(t => t.startsWith(GODAN_PREFIX))) {
    return { partOfSpeech: 'verb', verbType: 'godan' };
  }
  if (tags.includes('adj-i')) {
    return { partOfSpeech: 'adjective', isNaAdjective: false };
  }
  if (tags.includes('adj-na')) {
    return { partOfSpeech: 'adjective', isNaAdjective: true };
  }
  // Many time/counter words carry both "n" and "adv" (usable adverbially
  // without a particle, e.g. 毎日, 今日) — treat these as nouns, since that's
  // how the flashcard schema (breakdown, particle usage) models them.
  if (tags.includes('n')) {
    return { partOfSpeech: 'noun' };
  }
  if (tags.includes('pn')) {
    return { partOfSpeech: 'pronoun' };
  }
  if (tags.includes('int')) {
    return { partOfSpeech: 'interjection' };
  }
  if (tags.includes('adv')) {
    return { partOfSpeech: 'adverb' };
  }
  // Particles, the copula, conjunctions, and bare auxiliaries (だ/です/を/の/
  // と/から/…) have none of the content-word tags above — without this
  // check they'd silently fall through to the noun default below, which is
  // wrong for grammatical function words even though it's a safe fallback
  // for genuine (if oddly-tagged) content words.
  if (tags.some(t => ['prt', 'cop', 'conj', 'aux', 'aux-v', 'aux-adj'].includes(t))) {
    return { partOfSpeech: 'particle' };
  }
  return { partOfSpeech: 'noun' };
}

// The single best form to show a learner: a genuinely common, non-obscure
// kanji form if one exists; otherwise the common kana form; otherwise
// whatever's first. Unlike primaryForm(entry.kanji) alone, this correctly
// falls through to kana when the *only* kanji form present is rK/sK (e.g.
// する's sole kanji form 為る) instead of surfacing that obscure spelling.
function bestDisplayForm(entry) {
  const goodKanji = entry.kanji.find(k => k.common && !(k.tags || []).some(t => OBSCURE_KANJI_TAGS.has(t)));
  if (goodKanji) return goodKanji.text;
  const commonKana = entry.kana.find(k => k.common);
  if (commonKana) return commonKana.text;
  return (entry.kanji[0] && entry.kanji[0].text) || (entry.kana[0] && entry.kana[0].text) || null;
}

module.exports = { loadIndex, lookup, primaryForm, bestDisplayForm, englishMeanings, classify };
