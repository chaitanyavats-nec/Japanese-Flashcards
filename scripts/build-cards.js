const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const wanakana = require('wanakana');

const PEXELS_API_KEY = 'hTTeEfbHVS8NUwi9pk3vonTrO0Wbh9GWSPmtVhhJ8VeQxeKJpSSs5sFW';

const PUBLIC_DIR = path.join(__dirname, '../public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const KANJIVG_DIR = path.join(PUBLIC_DIR, 'kanjivg');

[PUBLIC_DIR, IMAGES_DIR, KANJIVG_DIR].forEach(dir => {
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

async function fetchPexelsImage(query, wordId) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.photos && data.photos.length > 0) {
    const photo = data.photos[0];
    const imageUrl = photo.src.medium;
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filename = `${wordId}${ext}`;
    const dest = path.join(IMAGES_DIR, filename);
    await downloadFile(imageUrl, dest);
    return {
      localPath: `images/${filename}`,
      source: "pexels",
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url
    };
  }
  return null;
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
      const stem = '行';
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function build() {
  const wordlistPath = path.join(__dirname, '../wordlist.json');
  const categorizedWords = JSON.parse(fs.readFileSync(wordlistPath, 'utf8'));
  
  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());
  
  const generatedCards = [];
  let globalIndex = 0;
  
  for (const [category, words] of Object.entries(categorizedWords)) {
    for (let i = 0; i < words.length; i++) {
      globalIndex++;
      const word = words[i];
      console.log(`Processing [${category}]: ${word}`);
      
      const res = await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const jishoData = await res.json();
      const entry = jishoData.data && jishoData.data[0];
      
      if (!entry) {
        console.warn(`No data found for ${word}`);
        continue;
      }
      
      const id = String(globalIndex).padStart(4, '0');
      
      // Determine forms
      const isKanji = /[\u4e00-\u9faf]/.test(word);
      let kanji = null;
      let hiragana = null;

      if (isKanji) {
        kanji = word;
        hiragana = entry.japanese[0].reading || await kuroshiro.convert(word, { to: "hiragana" });
      } else {
        hiragana = word;
      }
      
      // Reading might be missing if word has no kanji in entry
      if (!hiragana && entry.japanese[0].word) {
        hiragana = entry.japanese[0].word;
      }

      const katakana = wanakana.toKatakana(hiragana);
      const romaji = wanakana.toRomaji(hiragana);
      
      const englishMeanings = entry.senses[0].english_definitions;
      
      const partsOfSpeech = entry.senses[0].parts_of_speech.join(', ').toLowerCase();
      let partOfSpeech = "noun";
      let verbType = null;
      let isNaAdjective = false;
      
      if (partsOfSpeech.includes('verb')) {
        partOfSpeech = "verb";
        if (partsOfSpeech.includes('ichidan')) verbType = "ichidan";
        else if (partsOfSpeech.includes('suru')) verbType = "suru";
        else if (partsOfSpeech.includes('kuru')) verbType = "kuru";
        else verbType = "godan";
      } else if (partsOfSpeech.includes('adjective') || partsOfSpeech.includes('adjectival')) {
        partOfSpeech = "adjective";
        if (partsOfSpeech.includes('na-adjective')) isNaAdjective = true;
      }

      const jlptLevel = entry.jlpt.length > 0 ? entry.jlpt[0].toUpperCase() : "N5";
      
      // Assign the category from our dictionary structure!
      const categories = [category];

      // Image (Pexels disabled temporarily per user request to save rate limits)
      let imageObj = null;
      // let imageQuery = englishMeanings[0].split(' ')[0];
      // if (imageQuery.includes("to ")) imageQuery = imageQuery.replace("to ", "");
      // imageObj = await fetchPexelsImage(imageQuery, id);
      
      // Kanji SVGs
      const strokeOrderSvgs = [];
    if (kanji) {
      const kanjiList = kanji.match(/[\u4e00-\u9faf]/g) || [];
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
      categories,
      image: imageObj,
      audio: { ttsText: kanji || hiragana, lang: "ja-JP" },
      strokeOrderSvgs
    };

    if (partOfSpeech === "verb") {
      card.verbType = verbType;
      card.conjugations = conjugateVerb(kanji || hiragana, verbType);
    } else if (partOfSpeech === "noun") {
      card.isNaAdjective = isNaAdjective;
      card.particleUsage = [
        { particle: "を", example: `${kanji || hiragana}を...`, translation: `... the ${englishMeanings[0]}` },
        { particle: "が", example: `${kanji || hiragana}が...`, translation: `the ${englishMeanings[0]} ...` }
      ];
    } else if (partOfSpeech === "adjective") {
      card.isNaAdjective = isNaAdjective;
      // Could add adjective conjugation here
    }
    
      // Mock sentence
      card.exampleSentence = {
        japanese: `これは${kanji || hiragana}です。`,
        english: `This is ${englishMeanings[0]}.`,
        source: "mock"
      };

      generatedCards.push(card);
      await sleep(100); // Rate limit for Jisho API
    }
  }
  
  const outputPath = path.join(PUBLIC_DIR, 'dataset.json');
  fs.writeFileSync(outputPath, JSON.stringify(generatedCards, null, 2), 'utf8');
  console.log(`\nSuccess! Generated dataset with ${generatedCards.length} cards at ${outputPath}`);
}

build().catch(console.error);
