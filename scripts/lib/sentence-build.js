// Turns a picked Tanaka sentence ({ japanese, english, source }) into the
// full exampleSentence shape the app reads: hiragana and romaji readings,
// word-segmented versions of both, and per-token dictionary data. Shared by
// build-cards.js (fresh builds) and add-sentence-variants.js (backfills).
const wanakana = require('wanakana');
const sentenceTokens = require('./sentence-tokens');
const { extractLemma } = require('./tanaka');

// Word-segmented ("wakachigaki") version of a sentence, split by the
// kuromoji tokenizer so learners can see where one word ends and the next
// begins. Plain Japanese text has no spaces natively.
const NO_SPACE_BEFORE = new Set(['。', '、', '！', '？', '」', '・']);
function wakachigaki(tokens, useReading) {
  let out = '';
  tokens.forEach((t, i) => {
    const piece = useReading ? wanakana.toHiragana(t.reading || t.surface_form) : t.surface_form;
    if (i > 0 && !NO_SPACE_BEFORE.has(piece)) out += ' ';
    out += piece;
  });
  return out.trim();
}

async function buildSentence(kuroshiro, lookupIndex, corpus, picked) {
  const sentenceObj = { japanese: picked.japanese, english: picked.english, source: picked.source || 'tanaka' };
  try {
    sentenceObj.hiragana = await kuroshiro.convert(sentenceObj.japanese, { to: 'hiragana' });
    sentenceObj.romaji = wanakana.toRomaji(sentenceObj.hiragana);

    const tokens = await kuroshiro._analyzer.parse(sentenceObj.japanese);
    sentenceObj.spacedJapanese = wakachigaki(tokens, false);
    sentenceObj.spacedHiragana = wakachigaki(tokens, true);
    sentenceObj.tokens = sentenceTokens.tokenizeSentence(tokens, lookupIndex, corpus);
  } catch (e) {
    console.error('Sentence conversion failed', e);
    sentenceObj.hiragana = sentenceObj.japanese;
    sentenceObj.romaji = sentenceObj.japanese;
    sentenceObj.spacedJapanese = sentenceObj.japanese;
    sentenceObj.spacedHiragana = sentenceObj.japanese;
  }
  return sentenceObj;
}

// Extra example sentences must use the word the way the card spells it (its
// kanji or its kana), so a learner recognises it. JMdict aliases otherwise
// let in rare spellings (壱 for 一), other readings (ひと風呂 for 一) and
// kana homographs (the particle に for 二). The check reads the word's own
// token from the corpus parse: its lemma must be one of the aliases (in
// kanji, when the card has kanji) and the form it takes in the sentence must
// contain the card's kanji or kana. Inflecting words only need their stem,
// since the ending changes.
function showsWordAsCard(card) {
  const inflects = card.partOfSpeech === 'verb' || (card.partOfSpeech === 'adjective' && !card.isNaAdjective);
  const stem = (form) => (inflects && form.length > 1 ? form.slice(0, -1) : form);
  const kanjiStem = card.kanji ? stem(card.kanji) : null;
  const kanaStem = stem(card.hiragana);
  const kataStem = wanakana.toKatakana(kanaStem);
  return (candidate, aliasSet) => candidate.b.split(/\s+/).some(token => {
    const lemma = extractLemma(token);
    if (!aliasSet.has(lemma)) return false;
    if (kanjiStem && !/[一-龯]/.test(lemma)) return false;
    const braced = token.match(/\{([^}]+)\}/);
    const surface = braced ? braced[1] : lemma;
    if (kanjiStem && surface.includes(kanjiStem)) return true;
    // A one-kana stem (な from なる, い from いる) matches far too much.
    if (kanaStem.length >= 2) return surface.includes(kanaStem) || surface.includes(kataStem);
    // Kana-only words like する and くる: the lemma match is all there is.
    return !kanjiStem;
  });
}

module.exports = { wakachigaki, buildSentence, showsWordAsCard };
