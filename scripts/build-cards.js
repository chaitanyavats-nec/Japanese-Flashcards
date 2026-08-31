const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const wanakana = require('wanakana');
const sentenceBank = require('./sentence-bank');

// Jisho's word-only (kana) search sometimes matches an unrelated homophone
// as its top result (e.g. "どう" -> 銅 "copper" instead of "how"). Force the
// intended sense for words known to collide this way.
const MEANING_OVERRIDES = {
  "どう": { englishMeanings: ["how", "in what way", "how about"], partOfSpeech: "adverb" },
  "はい": { englishMeanings: ["yes", "that is correct"], partOfSpeech: "interjection" },
  "こんにちは": { partOfSpeech: "expression" },
  "おはようございます": { partOfSpeech: "expression" },
  "こんばんは": { partOfSpeech: "expression" },
  "ありがとう": { partOfSpeech: "expression" },
  "さようなら": { partOfSpeech: "expression" }
};

const PUBLIC_DIR = path.join(__dirname, '../public');
const KANJIVG_DIR = path.join(PUBLIC_DIR, 'kanjivg');

[PUBLIC_DIR, KANJIVG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function downloadFile(url, dest, headers = {}) {
  if (fs.existsSync(dest)) return dest;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const buffer = await res.buffer();
  fs.writeFileSync(dest, buffer);
  return dest;
}

async function getKanjiVG(char) {
  const code = char.charCodeAt(0).toString(16).padStart(5, '0');
  const filename = `${code}.svg`;
  const dest = path.join(KANJIVG_DIR, filename);
  if (fs.existsSync(dest)) return `kanjivg/${filename}`;

  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${filename}`;
  try {
    await downloadFile(url, dest);
    return `kanjivg/${filename}`;
  } catch (e) {
    return null;
  }
}

function conjugateVerb(base, verbType) {
  const conj = {
    present: base,
    presentPolite: "",
    past: "",
    pastPolite: "",
    negative: "",
    negativePolite: "",
    pastNegative: "",
    teForm: "",
    potential: "",
    volitional: ""
  };

  if (verbType === "suru") {
    conj.presentPolite = "します";
    conj.past = "した";
    conj.pastPolite = "しました";
    conj.negative = "しない";
    conj.negativePolite = "しません";
    conj.pastNegative = "しなかった";
    conj.teForm = "して";
    conj.potential = "できる";
    conj.volitional = "しよう";
  } else if (verbType === "kuru") {
    conj.presentPolite = "きます";
    conj.past = "きた";
    conj.pastPolite = "きました";
    conj.negative = "こない";
    conj.negativePolite = "きません";
    conj.pastNegative = "こなかった";
    conj.teForm = "きて";
    conj.potential = "こられる";
    conj.volitional = "こよう";
  } else if (verbType === "ichidan") {
    const stem = base.slice(0, -1);
    conj.presentPolite = stem + "ます";
    conj.past = stem + "た";
    conj.pastPolite = stem + "ました";
    conj.negative = stem + "ない";
    conj.negativePolite = stem + "ません";
    conj.pastNegative = stem + "なかった";
    conj.teForm = stem + "て";
    conj.potential = stem + "られる";
    conj.volitional = stem + "よう";
  } else {
    // Godan (simplified rule based for common N5 verbs)
    const godanMap = {
      'う': { i: 'い', a: 'わ', ta: 'った', te: 'って', e: 'え', o: 'お' },
      'く': { i: 'き', a: 'か', ta: 'いた', te: 'いて', e: 'け', o: 'こ' },
      'ぐ': { i: 'ぎ', a: 'が', ta: 'いだ', te: 'いで', e: 'げ', o: 'ご' },
      'す': { i: 'し', a: 'さ', ta: 'した', te: 'して', e: 'せ', o: 'そ' },
      'つ': { i: 'ち', a: 'た', ta: 'った', te: 'って', e: 'て', o: 'と' },
      'ぬ': { i: 'に', a: 'な', ta: 'んだ', te: 'んで', e: 'ね', o: 'の' },
      'ぶ': { i: 'び', a: 'ば', ta: 'んだ', te: 'んで', e: 'べ', o: 'ぼ' },
      'む': { i: 'み', a: 'ま', ta: 'んだ', te: 'んで', e: 'め', o: 'も' },
      'る': { i: 'り', a: 'ら', ta: 'った', te: 'って', e: 'れ', o: 'ろ' }
    };

    // Exception for 行く (iku)
    if (base === '行く') {
      conj.presentPolite = "行きます";
      conj.past = "行った";
      conj.pastPolite = "行きました";
      conj.negative = "行かない";
      conj.negativePolite = "行きません";
      conj.pastNegative = "行かなかった";
      conj.teForm = "行って";
      conj.potential = "行ける";
      conj.volitional = "行こう";
      return conj;
    }

    const last = base.slice(-1);
    const stem = base.slice(0, -1);
    const rules = godanMap[last] || godanMap['る'];

    conj.presentPolite = stem + rules.i + "ます";
    conj.past = stem + rules.ta;
    conj.pastPolite = stem + rules.i + "ました";
    conj.negative = stem + rules.a + "ない";
    conj.negativePolite = stem + rules.i + "ません";
    conj.pastNegative = stem + rules.a + "なかった";
    conj.teForm = stem + rules.te;
    conj.potential = stem + rules.e + "る";
    conj.volitional = stem + rules.o + "う";
  }
  return conj;
}

function conjugateAdjective(base) {
  // i-adjective conjugation (regular for all N5 i-adjectives, incl. いい-type read as よい here)
  const stem = base.slice(0, -1);
  return {
    present: base,
    presentPolite: base + "です",
    past: stem + "かった",
    pastPolite: stem + "かったです",
    negative: stem + "くない",
    negativePolite: stem + "くないです",
    pastNegative: stem + "くなかった",
    teForm: stem + "くて"
  };
}

// Hand-curated morpheme breakdowns for compound/affixed words where the
// pieces are meaningfully different from mechanical stem+ending splitting.
const BREAKDOWN_BANK = {
  "お母さん": [["お", "honorific prefix"], ["母", "mother"], ["さん", "polite title"]],
  "お父さん": [["お", "honorific prefix"], ["父", "father"], ["さん", "polite title"]],
  "男の子": [["男", "male"], ["の", "connector"], ["子", "child"]],
  "女の子": [["女", "female"], ["の", "connector"], ["子", "child"]],
  "朝ご飯": [["朝", "morning"], ["ご飯", "meal"]],
  "昼ご飯": [["昼", "noon"], ["ご飯", "meal"]],
  "晩ご飯": [["晩", "evening"], ["ご飯", "meal"]],
  "警察官": [["警察", "police"], ["官", "officer"]],
  "郵便局": [["郵便", "mail"], ["局", "bureau"]],
  "映画館": [["映画", "movie"], ["館", "hall"]],
  "図書館": [["図書", "books"], ["館", "hall"]],
  "地下鉄": [["地下", "underground"], ["鉄", "rail"]],
  "自転車": [["自", "self"], ["転", "turn"], ["車", "vehicle"]],
  "飛行機": [["飛行", "flight"], ["機", "machine"]],
  "外国": [["外", "outside"], ["国", "country"]],
  "毎日": [["毎", "every"], ["日", "day"]],
  "毎週": [["毎", "every"], ["週", "week"]],
  "毎月": [["毎", "every"], ["月", "month"]],
  "毎年": [["毎", "every"], ["年", "year"]],
  "月曜日": [["月", "moon"], ["曜", "weekday"], ["日", "day"]],
  "火曜日": [["火", "fire"], ["曜", "weekday"], ["日", "day"]],
  "水曜日": [["水", "water"], ["曜", "weekday"], ["日", "day"]],
  "木曜日": [["木", "tree"], ["曜", "weekday"], ["日", "day"]],
  "金曜日": [["金", "gold"], ["曜", "weekday"], ["日", "day"]],
  "土曜日": [["土", "earth"], ["曜", "weekday"], ["日", "day"]],
  "日曜日": [["日", "sun"], ["曜", "weekday"], ["日", "day"]],
  "お願いします": [["お", "honorific prefix"], ["願い", "request"], ["します", "do (polite)"]],
  "お茶": [["お", "polite prefix"], ["茶", "tea"]],
  "お菓子": [["お", "polite prefix"], ["菓子", "sweets"]],
  "食堂": [["食", "eat"], ["堂", "hall"]],
  "牛乳": [["牛", "cow"], ["乳", "milk"]]
};

function buildBreakdown(word, kanji, hiragana, partOfSpeech, verbType, isNaAdjective) {
  if (BREAKDOWN_BANK[word]) {
    return BREAKDOWN_BANK[word].map(([text, gloss]) => ({ text, gloss }));
  }

  const base = kanji || hiragana;

  if (partOfSpeech === "verb") {
    if (verbType === "ichidan") {
      return [{ text: base.slice(0, -1), gloss: "stem" }, { text: "る", gloss: "dictionary-form ending" }];
    }
    if (verbType === "godan" && base !== "行く") {
      return [{ text: base.slice(0, -1), gloss: "stem" }, { text: base.slice(-1), gloss: "dictionary-form ending" }];
    }
    return null; // irregular verbs (する, 来る, 行く) — not worth decomposing
  }

  if (partOfSpeech === "adjective" && !isNaAdjective && base.endsWith("い")) {
    return [{ text: base.slice(0, -1), gloss: "stem" }, { text: "い", gloss: "i-adjective ending" }];
  }

  return null;
}

const VEHICLE_WORDS = new Set(["車", "電車", "自転車", "飛行機", "バス", "タクシー", "船", "地下鉄"]);
const DRINK_WORDS = new Set(["水", "お茶", "コーヒー", "牛乳"]);
const ANIMATE_ANIMAL_WORDS = new Set(["犬", "猫", "鳥", "牛", "馬", "豚", "動物"]);

// Overrides for words where the generic per-theme particle template doesn't
// fit naturally.
const PARTICLE_OVERRIDES = {
  "道": [
    { particle: "を", phrase: "道を歩きます。", english: "I walk along the road." },
    { particle: "に", phrase: "道に迷いました。", english: "I got lost on the way." }
  ],
  "雨": [
    { particle: "が", phrase: "雨が降っています。", english: "It is raining." },
    { particle: "を", phrase: "雨を避けます。", english: "I avoid the rain." }
  ],
  "雪": [
    { particle: "が", phrase: "雪が降っています。", english: "It is snowing." },
    { particle: "を", phrase: "雪を触ります。", english: "I touch the snow." }
  ],
  "風": [
    { particle: "が", phrase: "風が強いです。", english: "The wind is strong." },
    { particle: "を", phrase: "風を感じます。", english: "I feel the wind." }
  ]
};

function cleanGloss(meaning) {
  return meaning.split(/[,(]/)[0].trim();
}

function buildParticleUsage(word, theme, gloss) {
  if (PARTICLE_OVERRIDES[word]) return PARTICLE_OVERRIDES[word];

  if (theme === "Family & People") {
    return [
      { particle: "は", phrase: `${word}はとても優しいです。`, english: `The ${gloss} is very kind.` },
      { particle: "と", phrase: `${word}と話しました。`, english: `I talked with the ${gloss}.` }
    ];
  }
  if (theme === "Animals & Nature") {
    const [adj, adjEn] = ANIMATE_ANIMAL_WORDS.has(word) ? ["とてもかわいいです", "very cute"] : ["とてもきれいです", "very beautiful"];
    return [
      { particle: "が", phrase: `${word}が${adj}。`, english: `The ${gloss} is ${adjEn}.` },
      { particle: "を", phrase: `${word}をよく見ます。`, english: `I often see the ${gloss}.` }
    ];
  }
  if (theme === "Food & Drink") {
    const verb = DRINK_WORDS.has(word) ? "飲みます" : "食べます";
    const verbEn = DRINK_WORDS.has(word) ? "drink" : "eat";
    return [
      { particle: "が", phrase: `${word}が好きです。`, english: `I like ${gloss}.` },
      { particle: "を", phrase: `${word}を${verb}。`, english: `I ${verbEn} ${gloss}.` }
    ];
  }
  if (theme === "Places & Transportation") {
    if (VEHICLE_WORDS.has(word)) {
      return [
        { particle: "で", phrase: `${word}で行きます。`, english: `I go by ${gloss}.` },
        { particle: "に", phrase: `${word}に乗ります。`, english: `I take the ${gloss}.` }
      ];
    }
    return [
      { particle: "に", phrase: `${word}に行きます。`, english: `I go to the ${gloss}.` },
      { particle: "で", phrase: `${word}で友達に会います。`, english: `I meet my friend at the ${gloss}.` }
    ];
  }
  return null;
}

// Space-segment a sentence at word boundaries (wakachigaki) using the
// kuromoji tokenizer so learners can see where one word ends and the next
// begins — plain Japanese text has no spaces natively.
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

function writeDatasetSafely(cards) {
  const outputPath = path.join(PUBLIC_DIR, 'dataset.json');
  const tmpPath = outputPath + '.tmp';
  const json = JSON.stringify(cards, null, 2);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.writeFileSync(tmpPath, json, 'utf8');
      fs.renameSync(tmpPath, outputPath);
      return;
    } catch (e) {
      if (attempt === 5) throw e;
    }
  }
}

async function build() {
  const wordlistPath = path.join(__dirname, '../wordlist.json');
  const tiers = JSON.parse(fs.readFileSync(wordlistPath, 'utf8'));

  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());

  const generatedCards = [];
  let globalIndex = 0;
  let tierNumber = 0;

  for (const [tierName, entries] of Object.entries(tiers)) {
    tierNumber++;
    for (const entry of entries) {
      const word = entry.word;
      const theme = entry.theme;
      globalIndex++;
      console.log(`Processing [${tierName} / ${theme}]: ${word}`);

      let jishoEntry = null;
      for (let attempt = 1; attempt <= 4 && !jishoEntry; attempt++) {
        try {
          const res = await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const jishoData = await res.json();
          jishoEntry = jishoData.data && jishoData.data[0];
          if (!jishoEntry) break; // request succeeded, just no results — don't retry
        } catch (e) {
          console.warn(`  Jisho fetch attempt ${attempt} failed for ${word}: ${e.message}`);
          if (attempt < 4) await sleep(1500 * attempt);
        }
      }

      if (!jishoEntry) {
        console.warn(`No data found for ${word}`);
        continue;
      }

      const id = String(globalIndex).padStart(4, '0');

      // Determine forms
      const isKanji = /[一-龯]/.test(word);
      let kanji = null;
      let hiragana = null;

      if (isKanji) {
        kanji = word;
        hiragana = jishoEntry.japanese[0].reading || await kuroshiro.convert(word, { to: "hiragana" });
      } else {
        hiragana = word;
      }

      if (!hiragana && jishoEntry.japanese[0].word) {
        hiragana = jishoEntry.japanese[0].word;
      }

      const katakana = wanakana.toKatakana(hiragana);
      const romaji = wanakana.toRomaji(hiragana);

      const override = MEANING_OVERRIDES[word];
      const englishMeanings = (override && override.englishMeanings) || jishoEntry.senses[0].english_definitions;

      let partOfSpeech = "noun";
      let verbType = null;
      let isNaAdjective = false;

      if (override && override.partOfSpeech) {
        partOfSpeech = override.partOfSpeech;
      } else {
      const partsOfSpeech = jishoEntry.senses[0].parts_of_speech.join(', ').toLowerCase();

      // Use word-boundary matching — plain .includes('verb') also matches "adverb".
      if (/\bverb\b/.test(partsOfSpeech)) {
        partOfSpeech = "verb";
        if (partsOfSpeech.includes('ichidan')) verbType = "ichidan";
        else if (partsOfSpeech.includes('suru')) verbType = "suru";
        else if (partsOfSpeech.includes('kuru')) verbType = "kuru";
        else verbType = "godan";
      } else if (partsOfSpeech.includes('adjective') || partsOfSpeech.includes('adjectival')) {
        partOfSpeech = "adjective";
        if (partsOfSpeech.includes('na-adjective')) isNaAdjective = true;
      } else if (partsOfSpeech.includes('interjection')) {
        partOfSpeech = "interjection";
      } else if (partsOfSpeech.includes('expressions') || partsOfSpeech.includes('expression')) {
        partOfSpeech = "expression";
      } else if (partsOfSpeech.includes('pronoun')) {
        partOfSpeech = "pronoun";
      }
      }

      const jlptLevel = jishoEntry.jlpt.length > 0 ? jishoEntry.jlpt[0].toUpperCase() : "N5";

      // Kanji SVGs
      const strokeOrderSvgs = [];
      if (kanji) {
        const kanjiList = kanji.match(/[一-龯]/g) || [];
        for (const k of new Set(kanjiList)) {
          const svgPath = await getKanjiVG(k);
          if (svgPath) strokeOrderSvgs.push(svgPath);
        }
      }

      const card = {
        id,
        kanji,
        hiragana,
        katakana,
        romaji,
        englishMeanings,
        partOfSpeech,
        jlptLevel,
        tier: tierNumber,
        tierName,
        theme,
        audio: { ttsText: kanji || hiragana, lang: "ja-JP" },
        strokeOrderSvgs
      };

      if (partOfSpeech === "verb") {
        card.verbType = verbType;
        card.conjugations = conjugateVerb(kanji || hiragana, verbType);
      } else if (partOfSpeech === "adjective") {
        card.isNaAdjective = isNaAdjective;
        if (!isNaAdjective && (kanji || hiragana).endsWith("い")) {
          card.conjugations = conjugateAdjective(kanji || hiragana);
        }
      }

      const breakdown = buildBreakdown(word, kanji, hiragana, partOfSpeech, verbType, isNaAdjective);
      if (breakdown) card.breakdown = breakdown;

      if (partOfSpeech === "noun") {
        const particleUsage = buildParticleUsage(kanji || hiragana, theme, cleanGloss(englishMeanings[0]));
        if (particleUsage) card.particleUsage = particleUsage;
      }

      // Example sentence — hand-authored for quality, not scraped.
      const bankEntry = sentenceBank[word];
      const sentenceObj = bankEntry
        ? { japanese: bankEntry.japanese, english: bankEntry.english, source: "curated" }
        : { japanese: `これは${kanji || hiragana}です。`, english: `This is ${englishMeanings[0]}.`, source: "fallback" };

      try {
        sentenceObj.hiragana = await kuroshiro.convert(sentenceObj.japanese, { to: "hiragana" });
        sentenceObj.romaji = wanakana.toRomaji(sentenceObj.hiragana);

        const tokens = await kuroshiro._analyzer.parse(sentenceObj.japanese);
        sentenceObj.spacedJapanese = wakachigaki(tokens, false);
        sentenceObj.spacedHiragana = wakachigaki(tokens, true);
      } catch (e) {
        console.error("Sentence conversion failed", e);
        sentenceObj.hiragana = sentenceObj.japanese;
        sentenceObj.romaji = sentenceObj.japanese;
        sentenceObj.spacedJapanese = sentenceObj.japanese;
        sentenceObj.spacedHiragana = sentenceObj.japanese;
      }

      card.exampleSentence = sentenceObj;

      generatedCards.push(card);
      writeDatasetSafely(generatedCards);

      await sleep(350); // Rate limit for Jisho API
    }
  }

  console.log(`\nSuccess! Generated dataset with ${generatedCards.length} cards.`);
}

build().catch(console.error);
