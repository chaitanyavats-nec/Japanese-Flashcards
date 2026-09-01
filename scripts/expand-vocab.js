// One-off vocabulary growth script — run manually (not part of the regular
// build) to grow the verb/noun pools toward real "Top N" pack sizes.
// Ranks candidate words by real Tanaka Corpus usage frequency (not a guess),
// requires at least one corpus sentence to exist (so build-cards.js can
// always find a real example), and appends the winners into wordlist.json.
const fs = require('fs');
const path = require('path');
const { loadIndex, lookup, classify, bestDisplayForm } = require('./lib/jmdict');
const { loadCorpus, getFrequency } = require('./lib/tanaka');

const WORDLIST_PATH = path.join(__dirname, '../wordlist.json');
const JMDICT_PATH = path.join(__dirname, '../data/jmdict-eng-common.json');
const TANAKA_PATH = path.join(__dirname, '../data/examples.utf');

const VERBS_TARGET = 100;
const NOUNS_TARGET = 100;

// Skip archaic/rare/vulgar/slang senses — "common" in JMdict just means
// "seen often enough to be worth listing," not "appropriate for a beginner
// flashcard deck."
const BAD_MISC = new Set(['arch', 'obs', 'rare', 'derog', 'vulg', 'sl', 'X', 'sens']);

function resolveWordAndFrequency(entry, corpus) {
  const word = bestDisplayForm(entry);
  if (!word) return null;

  // The Tanaka Corpus sometimes indexes a word under a different surface
  // form than the one we'd display (e.g. it lemma-tags する as 為る) — check
  // every known spelling for frequency, not just the display form.
  const aliases = [...entry.kanji.map(k => k.text), ...entry.kana.map(k => k.text)];
  let freq = getFrequency(corpus, word);
  for (const alias of aliases) {
    if (alias === word) continue;
    freq = Math.max(freq, getFrequency(corpus, alias));
  }
  if (freq === 0) return null;
  return { word, freq };
}

function main() {
  const wordlist = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8'));
  const existing = new Set();
  for (const tier of Object.keys(wordlist)) {
    for (const entry of wordlist[tier]) existing.add(entry.word);
  }

  console.log('Loading JMdict + Tanaka Corpus...');
  const jmdict = loadIndex(JMDICT_PATH);
  const corpus = loadCorpus(TANAKA_PATH);

  // Exclude by JMdict entry id, not just surface string — a candidate can
  // resolve to a different spelling of a word already in the wordlist (e.g.
  // する and its rare kanji form 為る are the same dictionary entry).
  const existingEntryIds = new Set();
  for (const word of existing) {
    const entry = lookup(jmdict, word);
    if (entry) existingEntryIds.add(entry.id);
  }

  const verbCandidates = [];
  const nounCandidates = [];
  const seen = new Set();

  for (const entry of jmdict.words) {
    if (existingEntryIds.has(entry.id)) continue;
    const sense0 = entry.sense[0];
    if (!sense0 || sense0.misc.some(m => BAD_MISC.has(m))) continue;

    const c = classify(entry);
    if (c.partOfSpeech !== 'verb' && c.partOfSpeech !== 'noun') continue;

    const resolved = resolveWordAndFrequency(entry, corpus);
    if (!resolved) continue;
    const { word, freq } = resolved;
    if (existing.has(word) || seen.has(word)) continue;
    seen.add(word);

    const bucket = c.partOfSpeech === 'verb' ? verbCandidates : nounCandidates;
    bucket.push({ word, freq });
  }

  verbCandidates.sort((a, b) => b.freq - a.freq);
  nounCandidates.sort((a, b) => b.freq - a.freq);

  const topVerbs = verbCandidates.slice(0, VERBS_TARGET);
  const topNouns = nounCandidates.slice(0, NOUNS_TARGET);

  console.log(`Selected ${topVerbs.length} verbs (from ${verbCandidates.length} candidates), ${topNouns.length} nouns (from ${nounCandidates.length} candidates).`);

  // Tier by frequency tertile *within the selected set* — tiers 2-4 only;
  // Level 1 stays reserved for the original hand-picked closed-class words
  // (numbers, pronouns, greetings), not open-class verb/noun expansion.
  function assignTiers(list) {
    const third = Math.ceil(list.length / 3);
    return list.map((item, i) => ({
      ...item,
      tierName: i < third ? 'Level 2 · Everyday Life' : i < third * 2 ? 'Level 3 · Expanding Vocabulary' : 'Level 4 · Descriptive Language'
    }));
  }

  const newEntries = [
    ...assignTiers(topVerbs).map(v => ({ word: v.word, tierName: v.tierName, theme: 'Common Verbs' })),
    ...assignTiers(topNouns).map(n => ({ word: n.word, tierName: n.tierName, theme: 'Common Nouns' }))
  ];

  for (const { word, tierName, theme } of newEntries) {
    if (!wordlist[tierName]) wordlist[tierName] = [];
    wordlist[tierName].push({ word, theme });
  }

  const tmpPath = WORDLIST_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(wordlist, null, 2), 'utf8');
  fs.renameSync(tmpPath, WORDLIST_PATH);

  console.log(`Wrote ${newEntries.length} new entries into ${WORDLIST_PATH}.`);
  for (const tier of Object.keys(wordlist)) {
    console.log(`  ${tier}: ${wordlist[tier].length} words`);
  }
}

main();
