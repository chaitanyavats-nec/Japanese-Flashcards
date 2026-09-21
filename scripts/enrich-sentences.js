// Backfills exampleSentence.tokens into the existing public/dataset.json
// without re-running the full (slow, network-touching) build-cards pipeline.
// build-cards.js attaches the same data for freshly built cards.
//
//   node --max-old-space-size=4096 scripts/enrich-sentences.js
const fs = require('fs');
const path = require('path');
const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const { loadLookupIndex, tokenizeSentence } = require('./lib/sentence-tokens');
const { loadCorpus } = require('./lib/tanaka');

const DATASET_PATH = path.join(__dirname, '../public/dataset.json');
const JMDICT_FULL_PATH = path.join(__dirname, '../data/jmdict-eng.json');
const TANAKA_PATH = path.join(__dirname, '../data/examples.utf');

async function main() {
  const cards = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  console.log('Loading full JMdict...');
  const lookupIndex = loadLookupIndex(JMDICT_FULL_PATH);
  const corpus = loadCorpus(TANAKA_PATH);

  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());

  let tokens = 0, withMeaning = 0, content = 0, contentWithMeaning = 0;
  for (const card of cards) {
    const sentence = card.exampleSentence;
    if (!sentence) continue;
    const parsed = await kuroshiro._analyzer.parse(sentence.japanese);
    sentence.tokens = tokenizeSentence(parsed, lookupIndex, corpus);
    for (const t of sentence.tokens) {
      if (t.punct) continue;
      tokens++;
      if (t.m) withMeaning++;
      if (t.pos !== 'particle' && t.pos !== 'auxiliary') {
        content++;
        if (t.m) contentWithMeaning++;
      }
    }
  }

  const tmp = DATASET_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cards, null, 2), 'utf8');
  fs.renameSync(tmp, DATASET_PATH);
  console.log(`Tokens with a dictionary meaning: ${withMeaning}/${tokens} (content words: ${contentWithMeaning}/${content})`);
}

main().catch(err => { console.error(err); process.exit(1); });
