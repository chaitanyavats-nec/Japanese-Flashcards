// Indexes the Tanaka Corpus (JP/EN sentence pairs) by dictionary-form lemma,
// using the corpus's own morphological parse (the "B:" line) rather than
// fragile substring matching. Also exposes a corpus-wide lemma frequency
// count, used both to pick the most comprehensible example sentence for a
// word and to rank vocabulary-expansion candidates by real usage frequency.
const fs = require('fs');

// Particles, copula forms, and other function words that shouldn't count as
// "unknown vocabulary" when scoring a sentence's comprehensibility — a
// learner isn't expected to have these as flashcards to understand them.
const FUNCTION_WORDS = new Set([
  'は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'か', 'な', 'ね', 'よ', 'ぞ', 'わ',
  'から', 'まで', 'より', 'ば', 'たり', 'ながら', 'けど', 'けれど', 'けれども', 'しかし', 'そして',
  'だ', 'です', 'ます', 'ない', 'た', 'て', 'う', 'よう', 'れる', 'られる', 'せる', 'させる',
  'この', 'その', 'あの', 'どの', 'これ', 'それ', 'あれ', 'どれ', '事', 'の(#2028930)',
  '。', '、', '！', '？', '「', '」', '・', '~'
]);

// English-gloss keyword blocklist — rejects candidate sentences whose
// translation touches death/violence/profanity/drugs, regardless of how
// grammatically simple they are (e.g. "死ね！" / "Die!" for 死ぬ).
const DENYLIST_PATTERN = new RegExp(
  '\\b(' + [
    'die', 'died', 'dies', 'dead', 'death', 'kill', 'killed', 'killing', 'murder', 'suicide',
    'rape', 'sex', 'sexual', 'fuck', 'shit', 'damn', 'hell', 'bitch', 'drunk', 'drug', 'drugs',
    'cocaine', 'blood', 'bleed', 'gun', 'shoot', 'stab', 'stabbed', 'hate', 'hated', 'stupid',
    'idiot', 'fool', 'nazi', 'terrorist', 'bomb', 'porn', 'naked', 'torture', 'abuse', 'slave'
  ].join('|') + ')\\b',
  'i'
);

// Extract the lemma (dictionary form) from a B-line token like
// 会う[01]{会えない} or 彼(かれ)[01] or で(#2028980) — everything before the
// first ( [ { or ~.
function extractLemma(token) {
  const m = token.match(/^([^([{~]+)/);
  return m ? m[1] : token;
}

function loadCorpus(corpusPath) {
  const raw = fs.readFileSync(corpusPath, 'utf8');
  const lines = raw.split('\n');

  const byLemma = new Map(); // lemma -> [{ japanese, english, lemmas: Set }]
  const frequency = new Map(); // lemma -> sentence count

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!line.startsWith('A: ')) continue;
    const bLine = lines[i + 1];
    if (!bLine || !bLine.startsWith('B: ')) continue;

    const aContent = line.slice(3);
    const tabIdx = aContent.indexOf('\t');
    if (tabIdx === -1) continue;
    const japanese = aContent.slice(0, tabIdx);
    let english = aContent.slice(tabIdx + 1);
    const hashIdx = english.indexOf('#ID=');
    if (hashIdx !== -1) english = english.slice(0, hashIdx).trim();

    const bContent = bLine.slice(3).trim();
    const bTokens = bContent.split(/\s+/);
    const lemmas = bTokens.map(extractLemma);
    const lemmaSet = new Set(lemmas);
    // One shared record per sentence; `b` keeps the parse so the surface form
    // a lemma takes in this sentence (会う -> 会えない) can be read back later.
    const sentence = { japanese, english, lemmas: lemmaSet, b: bContent };

    for (const lemma of lemmaSet) {
      frequency.set(lemma, (frequency.get(lemma) || 0) + 1);
      if (!byLemma.has(lemma)) byLemma.set(lemma, []);
      byLemma.get(lemma).push(sentence);
    }
  }

  return { byLemma, frequency };
}

// Score a candidate sentence by how many of its *other* lemmas fall outside
// the learner's known-vocabulary set. Lower is more comprehensible.
function scoreCandidate(candidate, targetAliasSet, knownSet) {
  let unknown = 0;
  for (const lemma of candidate.lemmas) {
    if (targetAliasSet.has(lemma)) continue;
    if (FUNCTION_WORDS.has(lemma)) continue;
    if (knownSet.has(lemma)) continue;
    unknown++;
  }
  return unknown;
}

// Pick the most comprehensible, appropriate sentence for a word given the
// set of vocabulary the learner is assumed to already know (`knownSet`,
// typically the words in this word's tier and earlier). `wordOrAliases` may
// be a single lemma string or an array of alternate surface forms for the
// same dictionary entry — the Tanaka Corpus indexes some very common words
// under a kanji headword a learner would never see written that way (e.g.
// する's corpus lemma is 為る), so callers pass every known spelling and we
// pool candidates across all of them.
function pickSentence(corpus, wordOrAliases, knownSet) {
  return pickSentences(corpus, wordOrAliases, knownSet, 1)[0] || null;
}

// The surface form the target word takes in a sentence, read from its parse:
// 会う[01]{会えない} -> 会えない, 会う[01] -> 会う.
function surfaceFormIn(candidate, aliasSet) {
  for (const token of candidate.b.split(/\s+/)) {
    if (!aliasSet.has(extractLemma(token))) continue;
    const braced = token.match(/\{([^}]+)\}/);
    return braced ? braced[1] : extractLemma(token);
  }
  return null;
}

// Character-bigram overlap between two sentences, 0 (nothing shared) to 1.
function bigramSimilarity(a, b) {
  const grams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / Math.min(ga.size, gb.size);
}

// Up to `count` comprehensible sentences for a word, the most comprehensible
// first. After the first pick, later picks favour a different form of the
// word (a new conjugation or collocation) and a sentence that doesn't read
// like one already chosen, so rotating through them shows the word in
// genuinely different contexts. Falls back to the next most comprehensible
// sentences when the corpus has nothing more varied.
function pickSentences(corpus, wordOrAliases, knownSet, count, { accept } = {}) {
  const aliases = Array.isArray(wordOrAliases) ? wordOrAliases : [wordOrAliases];
  const aliasSet = new Set(aliases);
  const primaryWord = aliases[0];

  const seen = new Set();
  const ranked = [];
  for (const alias of aliases) {
    const candidates = corpus.byLemma.get(alias);
    if (!candidates) continue;
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (DENYLIST_PATTERN.test(candidate.english)) continue;
      if (accept && !accept(candidate, aliasSet)) continue;
      ranked.push({ candidate, score: scoreCandidate(candidate, aliasSet, knownSet) });
    }
  }
  ranked.sort((a, b) => a.score - b.score || a.candidate.japanese.length - b.candidate.japanese.length);

  const chosen = [];
  const usedForms = new Set();
  const isDistinct = (c) => chosen.every(p => bigramSimilarity(p.candidate.japanese, c.japanese) < 0.5);
  // Only consider reasonably comprehensible sentences for the varied picks.
  const pool = ranked.filter(r => r.score <= (ranked[0]?.score ?? 0) + 2);
  for (const pass of ['new-form', 'distinct']) {
    for (const r of pool) {
      if (chosen.length >= count) break;
      if (chosen.includes(r)) continue;
      const form = surfaceFormIn(r.candidate, aliasSet);
      if (pass === 'new-form' && chosen.length > 0 && usedForms.has(form)) continue;
      if (!isDistinct(r.candidate)) continue;
      chosen.push(r);
      usedForms.add(form);
    }
  }

  return chosen.map(r => ({
    japanese: r.candidate.japanese,
    english: r.candidate.english,
    unknownWordScore: r.score,
    matchedLemma: primaryWord
  }));
}

function getFrequency(corpus, lemma) {
  return corpus.frequency.get(lemma) || 0;
}

module.exports = { loadCorpus, pickSentence, pickSentences, getFrequency, extractLemma, DENYLIST_PATTERN, FUNCTION_WORDS };
