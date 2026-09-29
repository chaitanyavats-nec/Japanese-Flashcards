// Backfills card.moreSentences (extra example sentences in other contexts)
// into the existing public/dataset.json without re-running the full
// build-cards pipeline. build-cards.js attaches the same data for freshly
// built cards.
//
//   node --max-old-space-size=4096 scripts/add-sentence-variants.js
const fs = require('fs');
const path = require('path');
const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const jmdict = require('./lib/jmdict');
const { loadCorpus, pickSentences } = require('./lib/tanaka');
const { loadLookupIndex } = require('./lib/sentence-tokens');
const { buildSentence, showsWordAsCard } = require('./lib/sentence-build');

const DATASET_PATH = path.join(__dirname, '../public/dataset.json');
const WORDLIST_PATH = path.join(__dirname, '../wordlist.json');
const JMDICT_PATH = path.join(__dirname, '../data/jmdict-eng-common.json');
const JMDICT_FULL_PATH = path.join(__dirname, '../data/jmdict-eng.json');
const TANAKA_PATH = path.join(__dirname, '../data/examples.utf');

const EXTRA_SENTENCES = 2;

async function main() {
  const cards = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const tiers = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8'));

  // Same "words from earlier tiers" known-vocabulary sets build-cards uses.
  const knownByTier = new Map();
  let running = new Set();
  Object.keys(tiers).forEach((tierName, i) => {
    knownByTier.set(i + 1, new Set(running));
    for (const entry of tiers[tierName]) running.add(entry.word);
  });

  console.log('Loading JMdict + Tanaka Corpus...');
  const dict = jmdict.loadIndex(JMDICT_PATH);
  const lookupIndex = loadLookupIndex(JMDICT_FULL_PATH);
  const corpus = loadCorpus(TANAKA_PATH);

  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());

  let withExtras = 0;
  let sentencesAdded = 0;
  const replacedMain = [];
  for (const card of cards) {
    const word = card.kanji || card.hiragana;
    const dictEntry = jmdict.lookup(dict, word);
    const aliases = dictEntry
      ? [...new Set([word, ...dictEntry.kanji.map(k => k.text), ...dictEntry.kana.map(k => k.text)])]
      : [word];
    const aliasSet = new Set(aliases);
    const knownSet = knownByTier.get(card.tier) || new Set();
    const accept = showsWordAsCard(card);

    // The main example was picked before the spelling check existed; a few
    // don't contain the word at all (二's was 週末にね). Swap those out.
    const mainCandidate = aliases
      .flatMap(a => corpus.byLemma.get(a) || [])
      .find(c => c.japanese === card.exampleSentence?.japanese);
    const mainOk = mainCandidate && accept(mainCandidate, aliasSet);
    let picks = pickSentences(corpus, aliases, knownSet, 2 + EXTRA_SENTENCES, { accept });
    if (!mainOk && picks.length > 0) {
      replacedMain.push(`${word}: ${card.exampleSentence?.japanese} -> ${picks[0].japanese}`);
      card.exampleSentence = await buildSentence(kuroshiro, lookupIndex, corpus, { ...picks[0], source: 'tanaka' });
    }
    const existing = card.exampleSentence?.japanese;
    picks = picks
      .filter(p => p.japanese !== existing)
      .slice(0, EXTRA_SENTENCES);

    delete card.moreSentences;
    if (picks.length === 0) continue;
    card.moreSentences = [];
    for (const pick of picks) {
      card.moreSentences.push(await buildSentence(kuroshiro, lookupIndex, corpus, { ...pick, source: 'tanaka' }));
    }
    withExtras++;
    sentencesAdded += picks.length;
  }

  const tmp = DATASET_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cards, null, 2), 'utf8');
  fs.renameSync(tmp, DATASET_PATH);
  console.log(`Added ${sentencesAdded} sentences across ${withExtras}/${cards.length} cards.`);
  console.log(`Replaced ${replacedMain.length} main examples that didn't show the word:`);
  replacedMain.forEach(line => console.log(`  ${line}`));
}

main().catch(err => { console.error(err); process.exit(1); });
