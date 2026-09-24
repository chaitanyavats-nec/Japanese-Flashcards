import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as wanakana from 'wanakana';
import packsRegistry from '../packs.json';
import imageMap from '../image-map.json';

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LEVEL_COLORS = {
  1: 'var(--level-1)',
  2: 'var(--level-2)',
  3: 'var(--level-3)',
  4: 'var(--level-4)'
};

const IconRefresh = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </svg>
);

const IconSun = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

const IconFlip = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 2l4 4-4 4" />
    <path d="M21 6H9a5 5 0 0 0-5 5v1" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M3 18h12a5 5 0 0 0 5-5v-1" />
  </svg>
);

const IconRoute = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h8a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4H8a4 4 0 0 1-4-4V5" />
  </svg>
);

const IconHome = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

const IconPackage = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 8l-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

const IconBook = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconKana = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 6h9" />
    <path d="M8.5 3.5v3c0 5-1.5 8-4.5 10.5" />
    <path d="M13 20.5c2-1 3.3-2.6 4-4.5" />
    <path d="M14.5 10.5h6" />
    <path d="M17.5 8v2.5c0 4-1 6.7-3 8.5" />
    <path d="M14.5 14h6" />
  </svg>
);

const IconRadical = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="5" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <circle cx="18" cy="19" r="2.2" />
    <path d="M8.6 10.6L15.7 6M9 12h6.8M8.6 13.4L15.7 18" />
  </svg>
);

const IconCheckCircle = (props) => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.3 2.3 4.7-5" />
  </svg>
);

// Every card's front illustration is a Twemoji SVG (downloaded into
// public/emoji by scripts/build-images.js), chosen per word in image-map.json.
// Twemoji names each file by its codepoints joined with "-", dropping the
// U+FE0F variation selector unless the emoji is a ZWJ sequence (mirrors
// scripts/lib/emoji-name.js).
const ZWJ = String.fromCodePoint(0x200d);
const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f);
function emojiFileName(emoji) {
  const hasZwj = emoji.includes(ZWJ);
  return [...emoji]
    .filter(ch => hasZwj || ch !== VARIATION_SELECTOR_16)
    .map(ch => ch.codePointAt(0).toString(16))
    .join('-');
}

// Card illustrations are switched off for now; flip this to bring them back.
const SHOW_CARD_IMAGES = false;

const CardImage = ({ card }) => {
  if (!SHOW_CARD_IMAGES) return null;
  const emoji = imageMap[card.kanji || card.hiragana];
  if (!emoji) return null;
  return (
    <div class="card-image" aria-hidden="true">
      <img src={`/emoji/${emojiFileName(emoji)}.svg`} alt="" draggable={false} />
    </div>
  );
};

// Counts up from the previous value to `target` (from 0 on first render) so
// hero numbers tick into place instead of appearing instantly.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  window.speechSynthesis.speak(ut);
}

function hapticBuzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// True while the user is typing into a text field (e.g. the note textarea),
// so global shortcuts like space-to-flip don't hijack the keystroke.
const isTypingTarget = (el) =>
  !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);

const formatSentenceRomaji = (sentence) => {
  if (!sentence) return '';
  if (sentence.spacedRomaji) return sentence.spacedRomaji;
  if (sentence.spacedHiragana) return wanakana.toRomaji(sentence.spacedHiragana);
  if (sentence.hiragana) return wanakana.toRomaji(sentence.hiragana);
  return sentence.romaji ? sentence.romaji.replace(/([.?!,])/g, '$1 ') : '';
};

const hasKanji = (str) => !!str && /[一-龯]/.test(str);
const stripPunctuation = (str) => (str || '').replace(/[。、！？!?「」・\s]/g, '');

// Tokenize an example sentence into tappable word tokens. Uses the
// pre-computed exampleSentence.tokens (each carrying its dictionary form and
// meaning — see scripts/lib/sentence-tokens.js). Punctuation isn't tappable:
// it's folded onto the neighbouring word as lead/trail text. Falls back to
// the plain word-segmented strings when a card predates the token data.
const OPENING_PUNCT = /^[「『（(]+$/;
const tokenizeSentence = (sentence) => {
  if (!sentence) return [];
  if (sentence.tokens) {
    const out = [];
    let lead = '';
    sentence.tokens.forEach(tok => {
      if (!tok.punct) {
        out.push({ ...tok, lead });
        lead = '';
      } else if (OPENING_PUNCT.test(tok.ja)) {
        lead += tok.ja;
      } else if (out.length > 0) {
        out[out.length - 1].trail = (out[out.length - 1].trail || '') + tok.ja;
      }
    });
    return out;
  }
  const jaTokens = (sentence.spacedJapanese || sentence.japanese || '').split(' ').filter(Boolean);
  const hiTokens = (sentence.spacedHiragana || sentence.hiragana || sentence.japanese || '').split(' ').filter(Boolean);
  return jaTokens.map((ja, i) => ({ ja, hi: hiTokens[i] || ja }));
};

// Mirrors build-cards.js's conjugateVerb/conjugateAdjective, but always
// conjugates from the hiragana reading rather than kanji||hiragana — used to
// show a kanji-free version of each word form when the Kanji toggle is off,
// and to derive furigana/romaji readings for each form either way.
const GODAN_HIRAGANA_RULES = {
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

function conjugateVerbHiragana(base, verbType) {
  const conj = { present: base };
  if (verbType === 'suru') {
    Object.assign(conj, { presentPolite: 'します', past: 'した', pastPolite: 'しました', negative: 'しない', negativePolite: 'しません', teForm: 'して', potential: 'できる' });
  } else if (verbType === 'kuru') {
    Object.assign(conj, { presentPolite: 'きます', past: 'きた', pastPolite: 'きました', negative: 'こない', negativePolite: 'きません', teForm: 'きて', potential: 'こられる' });
  } else if (verbType === 'ichidan') {
    const stem = base.slice(0, -1);
    Object.assign(conj, { presentPolite: stem + 'ます', past: stem + 'た', pastPolite: stem + 'ました', negative: stem + 'ない', negativePolite: stem + 'ません', teForm: stem + 'て', potential: stem + 'られる' });
  } else {
    const last = base.slice(-1);
    const stem = base.slice(0, -1);
    const rules = GODAN_HIRAGANA_RULES[last] || GODAN_HIRAGANA_RULES['る'];
    Object.assign(conj, {
      presentPolite: stem + rules.i + 'ます',
      past: stem + rules.ta,
      pastPolite: stem + rules.i + 'ました',
      negative: stem + rules.a + 'ない',
      negativePolite: stem + rules.i + 'ません',
      teForm: stem + rules.te,
      potential: stem + rules.e + 'る'
    });
  }
  return conj;
}

function conjugateAdjectiveHiragana(base) {
  const stem = base.slice(0, -1);
  return {
    present: base,
    presentPolite: base + 'です',
    past: stem + 'かった',
    pastPolite: stem + 'かったです',
    negative: stem + 'くない',
    negativePolite: stem + 'くないです',
    teForm: stem + 'くて'
  };
}

function getHiraganaConjugations(card) {
  if (!card.conjugations || !card.hiragana) return null;
  if (card.partOfSpeech === 'verb') return conjugateVerbHiragana(card.hiragana, card.verbType);
  if (card.partOfSpeech === 'adjective') return conjugateAdjectiveHiragana(card.hiragana);
  return null;
}

function getDisplayConjugations(card, showKanji) {
  if (!card.conjugations) return null;
  if (showKanji || !card.kanji) return card.conjugations;
  return getHiraganaConjugations(card) || card.conjugations;
}

// Plain-English descriptor for a conjugated form, built from the word's
// primary gloss rather than an attempted English tense conjugation (English
// irregular verbs — "go"/"went", "eat"/"ate" — can't be derived mechanically,
// so a wrong guess would be worse than a grammatical label).
const CONJ_ENGLISH_LABELS = {
  present: (m) => m,
  presentPolite: (m) => `${m} (polite)`,
  past: (m) => `${m} (past)`,
  pastPolite: (m) => `${m} (past, polite)`,
  negative: (m) => `not ${m}`,
  negativePolite: (m) => `not ${m} (polite)`,
  teForm: (m) => `${m} (~te form)`,
  potential: (m) => `can ${m}`
};

function getConjugationEnglish(card, key) {
  const base = card.englishMeanings?.[0];
  if (!base) return '';
  const stripped = base.replace(/^to\s+/i, '');
  const template = CONJ_ENGLISH_LABELS[key];
  return template ? template(stripped) : stripped;
}

const CONJ_KEYS = ['present', 'presentPolite', 'past', 'pastPolite', 'negative', 'negativePolite', 'teForm', 'potential'];
// Plain/polite pairs (present+presentPolite, past+pastPolite, negative+negativePolite)
// are visually grouped; teForm and potential — neither of which has a polite
// counterpart — are grouped together as a trailing "other forms" group.
const CONJ_GROUP_STARTS = new Set(['past', 'negative', 'teForm']);

// The algorithmic (stem + fixed ending) breakdown always ends in a kana
// character even in kanji mode, so only the stem needs to be swapped for its
// hiragana reading. Hand-curated compound breakdowns (BREAKDOWN_BANK in
// build-cards.js) have no stored reading per chunk, so they're hidden
// rather than guessed at when kanji is off.
function getDisplayBreakdown(card, showKanji) {
  if (!card.breakdown) return null;
  if (showKanji) return card.breakdown;
  const isAlgorithmic = card.breakdown.length === 2 &&
    (card.breakdown[1].gloss === 'dictionary-form ending' || card.breakdown[1].gloss === 'i-adjective ending');
  if (!isAlgorithmic) return null;
  if (!card.hiragana) return card.breakdown;
  return [
    { text: card.hiragana.slice(0, -1), gloss: card.breakdown[0].gloss },
    card.breakdown[1]
  ];
}

// Particle example phrases are template sentences with their own kanji
// (verbs/adjectives beyond the card's word) and no stored hiragana reading,
// so only the ones that already happen to be kana-only can be shown once
// kanji is switched off.
function getDisplayParticleUsage(card, showKanji) {
  if (!card.particleUsage) return null;
  if (showKanji) return card.particleUsage;
  const clean = card.particleUsage.filter(p => !hasKanji(p.phrase));
  return clean.length > 0 ? clean : null;
}

// Renders an example sentence as individually-tappable word tokens (Duolingo-
// style word lookup) instead of one plain string.
const SentenceTokens = ({ sentence, showKanji, onTokenTap }) => (
  tokenizeSentence(sentence).map((tok, i) => (
    <span
      key={i}
      class="sentence-token"
      onClick={(e) => { e.stopPropagation(); onTokenTap(tok); }}
    >
      {tok.lead}{showKanji ? tok.ja : tok.hi}{tok.trail}
    </span>
  ))
);

// Gojuon (basic) syllabary, laid out in its traditional 5-column grid.
// Katakana and romaji are derived from the hiragana via wanakana so the
// transliteration always matches the kana shown.
const GOJUON_ROWS = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', null, 'ゆ', null, 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', null, null, null, 'を'],
  ['ん', null, null, null, null]
];

// Voiced (dakuten) and semi-voiced (handakuten) sounds.
const DAKUTEN_ROWS = [
  ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  ['だ', 'ぢ', 'づ', 'で', 'ど'],
  ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ']
];

// Contracted (yoon) sounds: a base consonant + small や/ゆ/よ.
const YOON_BASES = ['き', 'ぎ', 'し', 'じ', 'ち', 'ぢ', 'に', 'ひ', 'び', 'ぴ', 'み', 'り'];
const YOON_ROWS = YOON_BASES.map(base => [`${base}ゃ`, `${base}ゅ`, `${base}ょ`]);

const KANA_SECTIONS = [
  { title: 'Gojūon', subtitle: 'The 46 basic sounds', rows: GOJUON_ROWS },
  { title: 'Dakuten & Handakuten', subtitle: 'Voiced and semi-voiced sounds', rows: DAKUTEN_ROWS },
  { title: 'Yōon', subtitle: 'Contracted sounds (consonant + ya/yu/yo)', rows: YOON_ROWS }
];

// One kana cell: the primary script large up top, its other script and the
// romaji reading side by side underneath. Katakana and romaji are both
// derived from the hiragana via wanakana so they can never drift out of
// sync with the kana shown.
const KanaCell = ({ hiragana, primaryScript }) => {
  if (!hiragana) return <div class="kana-cell kana-cell-empty" aria-hidden="true"></div>;
  const katakana = wanakana.toKatakana(hiragana);
  const romaji = wanakana.toRomaji(hiragana);
  const primary = primaryScript === 'katakana' ? katakana : hiragana;
  const secondary = primaryScript === 'katakana' ? hiragana : katakana;
  return (
    <button
      class="kana-cell"
      onClick={() => speak(hiragana, 'ja-JP')}
      title={`Play ${romaji}`}
    >
      <span class="kana-cell-primary">{primary}</span>
      <span class="kana-cell-secondary-row">
        <span class="kana-cell-secondary">{secondary}</span>
        <span class="kana-cell-romaji">{romaji}</span>
      </span>
    </button>
  );
};

const KanaChart = () => {
  const [primaryScript, setPrimaryScript] = useState('hiragana');
  return (
    <div class="kana-chart">
      <div class="status-chips kana-script-toggle" role="group" aria-label="Primary kana script">
        <button
          class={`filter-chip ${primaryScript === 'hiragana' ? 'active' : ''}`}
          onClick={() => setPrimaryScript('hiragana')}
        >
          Hiragana primary
        </button>
        <button
          class={`filter-chip ${primaryScript === 'katakana' ? 'active' : ''}`}
          onClick={() => setPrimaryScript('katakana')}
        >
          Katakana primary
        </button>
      </div>
      {KANA_SECTIONS.map(section => (
        <section class="kana-section" key={section.title}>
          <div class="kana-section-header">
            <h3 class="kana-section-title">{section.title}</h3>
            <span class="kana-section-subtitle muted">{section.subtitle}</span>
          </div>
          <div class="kana-grid">
            {section.rows.map((row, i) => (
              <div class="kana-row" key={i}>
                {row.map((kana, j) => <KanaCell key={j} hiragana={kana} primaryScript={primaryScript} />)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

// The kanji data carries KANJIDIC's old 4-level JLPT scale (4 = easiest), which
// has no exact match on today's N5-N1 scale: 4 -> N5, 3 -> N4, 2 spans N3 and
// N2, 1 -> N1.
const JLPT_LEVELS = [
  { jlpt: 4, key: 'n5', badge: 'N5', label: 'N5', color: 'var(--level-1)' },
  { jlpt: 3, key: 'n4', badge: 'N4', label: 'N4', color: 'var(--level-2)' },
  { jlpt: 2, key: 'n3n2', badge: 'N3', label: 'N3 – N2', color: 'var(--level-3)' },
  { jlpt: 1, key: 'n1', badge: 'N1', label: 'N1', color: 'var(--level-4)' },
  { jlpt: null, key: 'unlisted', badge: '?', label: 'Not on JLPT', color: 'var(--text-faint)' }
];
const jlptLabel = (jlpt) => (JLPT_LEVELS.find(l => l.jlpt === (jlpt ?? null)) || JLPT_LEVELS[4]).label;

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const RadicalChip = ({ radical, onOpen }) => {
  const inner = (
    <>
      <span class="radical-chip-char">{radical.drawn || radical.char}</span>
      <span class="radical-chip-meaning">{radical.meaning}</span>
      {radical.main && <span class="radical-chip-main">main</span>}
    </>
  );
  return onOpen ? (
    <button class="radical-chip" onClick={() => onOpen(radical)} title={`Show kanji with the ${radical.meaning} radical`}>{inner}</button>
  ) : (
    <span class="radical-chip">{inner}</span>
  );
};

// Flip-card practice for one batch of kanji: front shows the character, back
// its meaning, readings and radicals. Self-contained; reports each verdict up
// so progress can be saved.
const KanjiPractice = ({ title, kanji, onJudge, onClose }) => {
  const [deck, setDeck] = useState(() => shuffled(kanji));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState([]);
  const [knownCount, setKnownCount] = useState(0);
  const done = index >= deck.length;
  const current = deck[index];

  const judge = useCallback((verdict) => {
    if (!current) return;
    hapticBuzz(verdict === 'know' ? 18 : [12, 30, 12]);
    onJudge(current, verdict);
    if (verdict === 'know') setKnownCount(n => n + 1);
    else setMissed(prev => [...prev, current]);
    setFlipped(false);
    setIndex(i => i + 1);
  }, [current, onJudge]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      if (e.key === 'ArrowRight') judge('know');
      if (e.key === 'ArrowLeft') judge('dont');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, judge, onClose]);

  const restart = (list) => {
    setDeck(shuffled(list));
    setIndex(0);
    setFlipped(false);
    setMissed([]);
    setKnownCount(0);
  };

  return (
    <div class="kanji-practice" role="dialog" aria-label={`Kanji practice: ${title}`}>
      <div class="kanji-practice-bar">
        <button class="kanji-practice-back" onClick={onClose}>← Back</button>
        <span class="kanji-practice-title">{title}</span>
        <span class="kanji-practice-count muted">{done ? deck.length : index + 1} / {deck.length}</span>
      </div>
      <div class="kanji-practice-track"><div class="kanji-practice-fill" style={{ width: `${(index / deck.length) * 100}%` }}></div></div>

      {done ? (
        <div class="kanji-practice-summary">
          <h2>{missed.length === 0 ? 'All known!' : 'Round complete'}</h2>
          <p class="muted">{knownCount} known · {missed.length} still learning</p>
          <div class="kanji-practice-actions">
            {missed.length > 0 && (
              <button class="btn-card-action primary" onClick={() => restart(missed)}>Retry {missed.length} missed</button>
            )}
            <button class="btn-card-action" onClick={() => restart(kanji)}>Practice all again</button>
            <button class="btn-card-action" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <button class={`kanji-practice-card ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(f => !f)} aria-label={flipped ? 'Show kanji only' : 'Reveal answer'}>
            <span class="kanji-practice-char">{current.kanji}</span>
            {flipped ? (
              <span class="kanji-practice-answer">
                <span class="kanji-practice-meanings">{(current.meanings || []).slice(0, 4).join(', ')}</span>
                {current.on?.length > 0 && <span class="kanji-practice-reading"><b>On</b> {current.on.join('、')}</span>}
                {current.kun?.length > 0 && <span class="kanji-practice-reading"><b>Kun</b> {current.kun.join('、')}</span>}
                <span class="kanji-practice-radicals">
                  {(current.radicals || []).map(r => <RadicalChip key={r.num} radical={r} />)}
                </span>
              </span>
            ) : (
              <span class="kanji-practice-hint muted">Tap to reveal</span>
            )}
          </button>
          <div class="kanji-practice-judge">
            <button class="kanji-practice-btn dont" onClick={() => judge('dont')}>Still learning</button>
            <button class="kanji-practice-btn know" onClick={() => judge('know')}>Know it</button>
          </div>
        </>
      )}
    </div>
  );
};

const POS_LABELS = { name: 'proper noun', auxiliary: 'auxiliary', adnominal: 'adnominal', filler: 'filler' };

const WordLookupPopover = ({ lookup, showKanji, onClose }) => {
  if (!lookup) return null;
  const { card, tok } = lookup;
  // Prefer the dictionary gloss for this token's own sense; fall back to the
  // deck card's meanings when the token carries none.
  const meanings = tok.m || card?.englishMeanings;
  const pos = card?.partOfSpeech || tok.pos;
  const headword = showKanji ? tok.ja : tok.hi;
  const baseForm = tok.base
    ? (showKanji || !tok.baseHi ? tok.base : tok.baseHi)
    : null;
  return (
    <div class="word-lookup-popover" onClick={(e) => e.stopPropagation()}>
      <div class="word-lookup-header">
        <span class="word-lookup-word">{headword}</span>
        <span class="word-lookup-romaji muted">{hasKanji(tok.hi) ? '' : wanakana.toRomaji(tok.hi)}</span>
        <button class="word-lookup-close" onClick={onClose} aria-label="Close word lookup">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      {baseForm && (
        <p class="word-lookup-base muted">
          Dictionary form: <span class="word-lookup-base-word">{baseForm}</span>
          {showKanji && tok.baseHi && tok.baseHi !== tok.base && ` (${tok.baseHi})`}
        </p>
      )}
      {meanings && meanings.length > 0 ? (
        <p class="word-lookup-meaning">{meanings.join(', ')}</p>
      ) : (
        <p class="word-lookup-meaning muted">
          {tok.pos === 'name' ? 'A name — not in the dictionary' : 'No dictionary entry found'}
        </p>
      )}
      <div class="word-lookup-tags">
        {pos && <span class="pos-pill muted">{POS_LABELS[pos] || pos}</span>}
        {card && <span class="in-deck-pill">In your deck</span>}
      </div>
    </div>
  );
};

// Per-word personal note, shown on the card's back face. Renders as a plain
// note when saved and collapsed, or a textarea while being edited.
const NoteSection = ({ noteText, editing, onStartEdit, onChange, onDone }) => (
  <div class="note-section" onClick={(e) => e.stopPropagation()}>
    {editing ? (
      <>
        <textarea
          class="note-editor"
          autoFocus
          placeholder="Write a personal note for this word..."
          value={noteText}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onDone}
        />
        <p class="note-saved-hint">Saves automatically</p>
      </>
    ) : noteText ? (
      <div class="note-display" onClick={onStartEdit}>{noteText}</div>
    ) : (
      <button class="note-toggle" onClick={onStartEdit}>
        <span class="note-dot"></span>
        Add a note
      </button>
    )}
  </div>
);

// Home's "Word of the day": a two-slide swipeable carousel — the word itself,
// then its breakdown. The Kanji toggle lives here since it drives every card.
const WordOfDay = ({ card, showKanji, onToggleKanji, learnt }) => {
  const trackRef = useRef(null);
  const [slide, setSlide] = useState(0);
  const useKanji = showKanji && !!card.kanji;
  const headword = useKanji ? card.kanji : card.hiragana;
  const breakdown = getDisplayBreakdown(card, showKanji);
  const forms = [
    useKanji && { label: 'Kanji', value: card.kanji },
    { label: 'Hiragana', value: card.hiragana },
    { label: 'Katakana', value: card.katakana },
    { label: 'Romaji', value: card.romaji }
  ].filter(Boolean);

  const goTo = (i) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section class="wotd" aria-label="Word of the day">
      <div class="wotd-topbar">
        <span class="tag-chip">Word of the day</span>
        {card.kanji && (
          <label class="setting-toggle">
            <input type="checkbox" checked={showKanji} onChange={onToggleKanji} aria-label="Show kanji" />
            <span>Kanji</span>
          </label>
        )}
      </div>

      <div
        class="wotd-track"
        ref={trackRef}
        onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        <div class="wotd-slide">
          <p class="kanji-word">{headword}</p>
          {useKanji && <p class="hiragana-word muted">{card.hiragana}</p>}
          <p class="romaji-word-front muted">{card.romaji}</p>
          <p class="wotd-meaning">{card.englishMeanings?.slice(0, 3).join(', ')}</p>
          <div class="wotd-meta">
            <span class="pos-pill muted">{card.partOfSpeech}</span>
            {learnt && <span class="in-deck-pill">Learnt</span>}
            <button class="wotd-audio" aria-label="Play pronunciation" onClick={() => speak(card.audio.ttsText, card.audio.lang)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="4 8 8 8 12 4 12 20 8 16 4 16 4 8"></polygon><path d="M16 8.5a4.5 4.5 0 0 1 0 7"></path><path d="M18.5 6a8 8 0 0 1 0 12"></path></svg>
            </button>
          </div>
        </div>

        <div class="wotd-slide">
          <div class="grammar-title">Word breakdown</div>
          {breakdown && breakdown.length > 0 && (
            <div class="breakdown-row">
              {breakdown.map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span class="breakdown-plus">+</span>}
                  <div class="breakdown-chip">
                    <span class="breakdown-text">{part.text}</span>
                    <span class="breakdown-gloss">{part.gloss}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
          <dl class="wotd-forms">
            {forms.map(f => (
              <div key={f.label} class="wotd-form">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div class="wotd-dots" role="tablist" aria-label="Word of the day slides">
        {['Word', 'Breakdown'].map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={slide === i}
            aria-label={label}
            class={`wotd-dot ${slide === i ? 'active' : ''}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </section>
  );
};

export default function App() {
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // App state
  const [screen, setScreen] = useState('home'); // 'home' | 'arena' | 'summary'
  const [homeView, setHomeView] = useState('home'); // 'home' | 'learn' | 'all-words' | 'kana' | 'kanji'
  const [showKanji, setShowKanji] = useState(() => {
    const saved = localStorage.getItem('flashcards_show_kanji');
    return saved !== null ? saved === 'true' : true;
  });
  const [progress, setProgress] = useState(() => {
    try {
      const saved = localStorage.getItem('flashcards_progress');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('flashcards_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Splash screen: stays up for a minimum duration so it never just flickers
  // on a fast connection, then fades once the dataset has also finished loading.
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [splashRemoved, setSplashRemoved] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 900);
    return () => clearTimeout(t);
  }, []);

  // Session state
  const [deck, setDeck] = useState([]);
  const [remaining, setRemaining] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [known, setKnown] = useState([]);
  const [unknown, setUnknown] = useState([]);
  const [history, setHistory] = useState([]);
  const [maxIndexReached, setMaxIndexReached] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [strokeShown, setStrokeShown] = useState(false);
  const [svgsMap, setSvgsMap] = useState({});
  const [sentenceLookup, setSentenceLookup] = useState(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [modalNoteEditing, setModalNoteEditing] = useState(false);

  // Swipe & gesture refs
  const cardRef = useRef(null);
  const cardInnerRef = useRef(null);
  const cardEnterAnimRef = useRef('slide'); // 'slide' | 'back-right' | 'back-left' — which entrance animation the next card mount should use
  const scrollableRef = useRef(null);
  const [hasScrollFade, setHasScrollFade] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, isDragging: false, wasDragged: false, dragX: 0 });
  const [swipeOverlay, setSwipeOverlay] = useState({ know: 0, dont: 0 });

  // Search, filtering, and modal state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'know' | 'unlearnt'
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 1 | 2 | 3 | 4
  const [modalCardIndex, setModalCardIndex] = useState(null); // index in filtered cards
  const [modalIsFlipped, setModalIsFlipped] = useState(false);
  const [modalStrokeShown, setModalStrokeShown] = useState(false);

  // Expandable card actions
  const [expandedCardKey, setExpandedCardKey] = useState(null);

  // Kanji radical map (Kanji tab)
  const [radicalMap, setRadicalMap] = useState(null);
  const [radicalMapError, setRadicalMapError] = useState(null);
  const [kanjiSearchTerm, setKanjiSearchTerm] = useState('');
  const [expandedRadical, setExpandedRadical] = useState(null); // radicalNum currently branched open
  const [selectedKanji, setSelectedKanji] = useState(null); // { kanji, ...info } for the detail popover
  const [kanjiMode, setKanjiMode] = useState('map'); // 'map' | 'practice'
  const [kanjiSession, setKanjiSession] = useState(null); // { title, kanji } while practising a JLPT level
  const [kanjiProgress, setKanjiProgress] = useState(() => {
    try {
      const saved = localStorage.getItem('flashcards_kanji_progress');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveKanjiProgress = useCallback((k, verdict) => {
    setKanjiProgress(prev => {
      const updated = { ...prev, [k.kanji]: verdict };
      try {
        localStorage.setItem('flashcards_kanji_progress', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save kanji progress', e);
      }
      return updated;
    });
  }, []);

  // Open the Radical map on a given radical's branch (from a radical chip).
  const openRadicalBranch = (radical) => {
    setSelectedKanji(null);
    setKanjiSession(null);
    setKanjiMode('map');
    setKanjiSearchTerm('');
    setExpandedRadical(radical.num);
    setHomeView('kanji');
  };

  // Load dataset
  useEffect(() => {
    fetch('/dataset.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load dataset');
        return res.json();
      })
      .then(data => {
        setAllCards(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Load kanji radical map (for the Kanji tab)
  useEffect(() => {
    fetch('/kanji-radical-map.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load kanji radical map');
        return res.json();
      })
      .then(data => setRadicalMap(data))
      .catch(err => {
        console.error(err);
        setRadicalMapError(err.message);
      });
  }, []);

  // Sync showKanji to localStorage
  const handleToggleKanji = (e) => {
    const val = e.target.checked;
    setShowKanji(val);
    localStorage.setItem('flashcards_show_kanji', val);
  };

  const splashFadingOut = !loading && minSplashElapsed;
  useEffect(() => {
    if (splashFadingOut && !splashRemoved) {
      const t = setTimeout(() => setSplashRemoved(true), 450);
      return () => clearTimeout(t);
    }
  }, [splashFadingOut, splashRemoved]);

  const saveNote = (wordId, text) => {
    setNotes(prev => {
      const updated = { ...prev, [wordId]: text };
      if (!text.trim()) delete updated[wordId];
      try {
        localStorage.setItem('flashcards_notes', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save note', e);
      }
      return updated;
    });
  };

  const saveWordProgress = (wordId, status) => {
    setProgress(prev => {
      const existing = prev[wordId] || { timesReviewed: 0 };
      const updated = {
        ...prev,
        [wordId]: {
          status,
          timesReviewed: existing.timesReviewed + 1,
          lastReviewedAt: new Date().toISOString()
        }
      };
      try {
        localStorage.setItem('flashcards_progress', JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save progress", e);
      }
      return updated;
    });
  };

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const startSession = (cardsArray) => {
    if (!cardsArray || cardsArray.length === 0) return;
    setDeck(cardsArray);
    setRemaining(shuffle(cardsArray));
    setKnown([]);
    setUnknown([]);
    setHistory([]);
    setMaxIndexReached(0);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStrokeShown(false);
    setScreen('arena');
  };

  const currentCard = remaining[currentIndex];

  // Fetch stroke order SVGs if requested
  useEffect(() => {
    if (strokeShown && currentCard && currentCard.strokeOrderSvgs) {
      currentCard.strokeOrderSvgs.forEach(path => {
        if (!svgsMap[path]) {
          fetch(`/${path}`)
            .then(res => res.text())
            .then(text => {
              setSvgsMap(prev => ({ ...prev, [path]: text }));
            })
            .catch(console.error);
        }
      });
    }
  }, [strokeShown, currentCard, svgsMap]);

  // Check scroll container overflow
  const checkScrollFade = useCallback(() => {
    if (!scrollableRef.current) return;
    const el = scrollableRef.current;
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 12;
    setHasScrollFade(hasMore);
  }, []);

  useEffect(() => {
    setStrokeShown(false);
    setSentenceLookup(null);
    setNoteEditing(false);
    setSwipeOverlay({ know: 0, dont: 0 });

    // Prevent the front/back flip transition from visibly animating when a
    // brand-new card mounts already facing front — without disabling it here,
    // toggling isFlipped back to false plays a real (and wrong) flip.
    if (cardInnerRef.current) {
      cardInnerRef.current.style.transition = 'none';
    }
    setIsFlipped(false);

    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
      cardRef.current.style.transform = '';
      cardRef.current.style.opacity = '1';
      cardRef.current.style.animation = 'none';
      // Force a reflow so the browser re-arms the entrance animation below
      // instead of skipping it (it was just set to "none").
      void cardRef.current.offsetWidth;
      const anim = cardEnterAnimRef.current;
      if (anim === 'back-right') {
        cardRef.current.style.animation = 'slideBackInRight 380ms cubic-bezier(0.16, 0.6, 0.3, 1) forwards';
      } else if (anim === 'back-left') {
        cardRef.current.style.animation = 'slideBackInLeft 380ms cubic-bezier(0.16, 0.6, 0.3, 1) forwards';
      } else {
        cardRef.current.style.animation = 'slideUp 550ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
      }
      cardEnterAnimRef.current = 'slide';
    }

    const raf = requestAnimationFrame(() => {
      if (cardInnerRef.current) cardInnerRef.current.style.transition = '';
    });

    checkScrollFade();
    return () => cancelAnimationFrame(raf);
  }, [currentIndex, checkScrollFade]);

  const advanceDeck = useCallback((verdict) => {
    if (!currentCard) return;
    if (verdict === 'know') {
      setKnown(prev => [...prev, currentCard]);
    } else {
      setUnknown(prev => [...prev, currentCard]);
    }
    saveWordProgress(currentCard.id, verdict);
    setHistory(prev => [...prev, { index: currentIndex, verdict }]);

    // Reset synchronously (same batch as the index change) rather than
    // waiting for the [currentIndex] effect — otherwise the next card can
    // paint one frame with the outgoing card's swipe tint still applied.
    setSwipeOverlay({ know: 0, dont: 0 });

    if (currentIndex + 1 >= remaining.length) {
      setScreen('summary');
    } else {
      const nextIndex = currentIndex + 1;
      setMaxIndexReached(prev => Math.max(prev, nextIndex));
      setCurrentIndex(nextIndex);
    }
  }, [currentCard, currentIndex, remaining.length]);

  // Navigate to the previous card. If the current card is a fresh, unjudged
  // one right after the last judgement, stepping back also undoes that verdict.
  const goToPreviousCard = useCallback(() => {
    if (currentIndex === 0) return;
    const newIndex = currentIndex - 1;
    const atFrontier = currentIndex === history.length;

    // Re-enter from whichever side this card originally exited toward, so
    // it looks like it's flying back in off-screen onto the top of the stack.
    const verdictForThisStep = history[newIndex]?.verdict;
    cardEnterAnimRef.current = verdictForThisStep === 'dont' ? 'back-left' : 'back-right';

    if (atFrontier && history.length > 0) {
      const last = history[history.length - 1];
      const prevCard = remaining[last.index];
      setHistory(prev => prev.slice(0, -1));
      if (prevCard) {
        const list = last.verdict === 'know' ? setKnown : setUnknown;
        list(prev => {
          const idx = prev.findIndex(c => c.id === prevCard.id);
          return idx === -1 ? prev : [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
      }
    }
    setCurrentIndex(newIndex);
  }, [currentIndex, history, remaining]);

  // Navigate forward again without re-judging, only through cards already visited.
  const goToNextCard = useCallback(() => {
    if (currentIndex >= maxIndexReached) return;
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex, maxIndexReached]);

  const judgeCard = useCallback((verdict) => {
    hapticBuzz(verdict === 'know' ? 18 : [12, 30, 12]);

    if (!cardRef.current) {
      advanceDeck(verdict);
      return;
    }
    const exitX = verdict === 'know' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
    const rot = verdict === 'know' ? 22 : -22;
    setSwipeOverlay({ know: verdict === 'know' ? 1 : 0, dont: verdict === 'dont' ? 1 : 0 });

    cardRef.current.style.transition = 'transform 320ms ease-out, opacity 320ms ease-out';
    cardRef.current.style.transform = `translateX(${exitX}px) rotate(${rot}deg) scale(0.94)`;
    cardRef.current.style.opacity = '0';

    setTimeout(() => {
      advanceDeck(verdict);
    }, 320);
  }, [advanceDeck]);

  // Filtered cards calculation for All Words view
  const [selectedPackId, setSelectedPackId] = useState('all');

  const filteredCards = React.useMemo(() => {
    return allCards.filter(card => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchKanji = card.kanji && card.kanji.toLowerCase().includes(q);
        const matchHiragana = card.hiragana && card.hiragana.toLowerCase().includes(q);
        const matchKatakana = card.katakana && card.katakana.toLowerCase().includes(q);
        const matchRomaji = card.romaji && card.romaji.toLowerCase().includes(q);
        const matchEnglish = card.englishMeanings && card.englishMeanings.some(m => m.toLowerCase().includes(q));
        if (!matchKanji && !matchHiragana && !matchKatakana && !matchRomaji && !matchEnglish) {
          return false;
        }
      }
      const status = progress[card.id]?.status;
      if (statusFilter === 'know' && status !== 'know') return false;
      if (statusFilter === 'unlearnt' && status === 'know') return false;
      if (tierFilter !== 'all' && card.tier !== Number(tierFilter)) return false;
      if (selectedPackId !== 'all' && !(card.packs || []).includes(selectedPackId)) return false;
      return true;
    });
  }, [allCards, searchTerm, statusFilter, tierFilter, selectedPackId, progress]);

  // Jump from a kanji chip (Kanji tab) straight to that word's flashcard popup.
  // Clears the All Words filters first so `filteredCards` lines up 1:1 with `allCards`.
  const openWordFromKanji = (wordId) => {
    setSearchTerm('');
    setStatusFilter('all');
    setTierFilter('all');
    setSelectedPackId('all');
    setHomeView('all-words');
    const idx = allCards.findIndex(c => c.id === wordId);
    if (idx !== -1) {
      setModalIsFlipped(false);
      setModalStrokeShown(false);
      setModalCardIndex(idx);
    }
  };

  const modalCard = modalCardIndex !== null ? filteredCards[modalCardIndex] : null;
  const modalDisplayBreakdown = modalCard ? getDisplayBreakdown(modalCard, showKanji) : null;
  const modalDisplayConjugations = modalCard ? getDisplayConjugations(modalCard, showKanji) : null;
  const modalHiraganaConjugations = modalCard ? getHiraganaConjugations(modalCard) : null;
  const modalDisplayParticleUsage = modalCard ? getDisplayParticleUsage(modalCard, showKanji) : null;

  // Fetch stroke order SVGs for modal card if requested
  useEffect(() => {
    if (modalStrokeShown && modalCard && modalCard.strokeOrderSvgs) {
      modalCard.strokeOrderSvgs.forEach(path => {
        if (!svgsMap[path]) {
          fetch(`/${path}`)
            .then(res => res.text())
            .then(text => {
              setSvgsMap(prev => ({ ...prev, [path]: text }));
            })
            .catch(console.error);
        }
      });
    }
  }, [modalStrokeShown, modalCard, svgsMap]);

  // Reset modal state when modalCard changes
  useEffect(() => {
    setModalIsFlipped(false);
    setModalStrokeShown(false);
    setSentenceLookup(null);
    setModalNoteEditing(false);
  }, [modalCardIndex]);

  // Modal keyboard navigation & escape key
  useEffect(() => {
    if (modalCardIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalCardIndex(null);
        return;
      }
      // Let typing in the note textarea behave like normal text input instead
      // of triggering flip/navigation shortcuts (e.g. space would flip the card).
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') setModalCardIndex(prev => (prev + 1) % filteredCards.length);
      if (e.key === 'ArrowLeft') setModalCardIndex(prev => (prev - 1 + filteredCards.length) % filteredCards.length);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setModalIsFlipped(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalCardIndex, filteredCards.length]);

  // Kanji detail popup: close on Escape
  useEffect(() => {
    if (!selectedKanji) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedKanji(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKanji]);

  // Keyboard navigation for arena
  useEffect(() => {
    if (screen !== 'arena') return;
    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') judgeCard('know');
      if (e.key === 'ArrowLeft') judgeCard('dont');
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, judgeCard]);

  // Pointer swipe handlers
  const SWIPE_COMMIT_DISTANCE = 90;

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.tagName === 'A') return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      isDragging: true,
      wasDragged: false,
      dragX: 0,
      thresholdBuzzed: false
    };
    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
      cardRef.current.style.animation = 'none';
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.isDragging || !cardRef.current) return;
    const dragX = e.clientX - dragRef.current.startX;
    const dragY = e.clientY - dragRef.current.startY;
    dragRef.current.dragX = dragX;

    if (Math.abs(dragX) > 8 || Math.abs(dragY) > 8) {
      dragRef.current.wasDragged = true;
    }

    if (Math.abs(dragX) > Math.abs(dragY) && Math.abs(dragX) > 10) {
      try {
        if (!cardRef.current.hasPointerCapture(e.pointerId)) {
          cardRef.current.setPointerCapture(e.pointerId);
        }
      } catch (err) { }
    }

    const rot = (dragX / cardRef.current.offsetWidth) * 15;
    cardRef.current.style.transform = `translateX(${dragX}px) rotate(${rot}deg)`;

    const pastCommit = Math.abs(dragX) > SWIPE_COMMIT_DISTANCE;
    if (pastCommit && !dragRef.current.thresholdBuzzed) {
      dragRef.current.thresholdBuzzed = true;
      hapticBuzz(10);
    } else if (!pastCommit) {
      dragRef.current.thresholdBuzzed = false;
    }

    const opacity = Math.min(Math.abs(dragX) / 100, 1);
    if (dragX > 20) {
      setSwipeOverlay({ know: opacity, dont: 0 });
    } else if (dragX < -20) {
      setSwipeOverlay({ know: 0, dont: opacity });
    } else {
      setSwipeOverlay({ know: 0, dont: 0 });
    }
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current.isDragging || !cardRef.current) return;
    dragRef.current.isDragging = false;
    try {
      cardRef.current.releasePointerCapture(e.pointerId);
    } catch (err) { }

    const { dragX, startTime } = dragRef.current;
    const dt = Math.max(Date.now() - startTime, 1);
    const velocity = dragX / dt;

    if (Math.abs(dragX) > SWIPE_COMMIT_DISTANCE || Math.abs(velocity) > 0.4) {
      judgeCard(dragX > 0 ? 'know' : 'dont');
    } else {
      cardRef.current.style.transition = 'transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      cardRef.current.style.transform = 'translateX(0) rotate(0deg)';
      setSwipeOverlay({ know: 0, dont: 0 });
    }
  };

  // Group cards by tiers for home screen
  const levels = React.useMemo(() => {
    const map = new Map();
    allCards.forEach(card => {
      const tier = card.tier || 1;
      if (!map.has(tier)) map.set(tier, { name: card.tierName || `Level ${tier}`, cards: [] });
      map.get(tier).cards.push(card);
    });
    return Array.from(map.keys()).sort((a, b) => a - b).map(tier => ({
      tier,
      ...map.get(tier)
    }));
  }, [allCards]);

  // Group cards by word pack
  const packs = React.useMemo(() => {
    const map = new Map();
    allCards.forEach(card => {
      (card.packs || []).forEach(packId => {
        if (!map.has(packId)) map.set(packId, []);
        map.get(packId).push(card);
      });
    });
    return Object.keys(packsRegistry)
      .filter(id => map.has(id))
      .sort((a, b) => packsRegistry[a].order - packsRegistry[b].order)
      .map(id => ({ id, ...packsRegistry[id], cards: map.get(id) }));
  }, [allCards]);

  // Levels (the learning path) and packs are one list of "collections" --
  // each is just a set of cards with a progress bar.
  const collections = React.useMemo(() => {
    const withStats = (c) => {
      const learntCards = c.cards.filter(card => progress[card.id]?.status === 'know');
      const reviewed = c.cards.filter(card => progress[card.id]);
      const lastReviewedAt = reviewed.reduce((max, card) => {
        const t = progress[card.id].lastReviewedAt || '';
        return t > max ? t : max;
      }, '');
      return {
        ...c,
        learntCards,
        knownCount: learntCards.length,
        total: c.cards.length,
        percent: c.cards.length > 0 ? (learntCards.length / c.cards.length) * 100 : 0,
        started: reviewed.length > 0,
        lastReviewedAt
      };
    };
    return {
      levels: levels.map(({ tier, name, cards }) => withStats({
        key: `level-${tier}`,
        kind: 'level',
        filterValue: String(tier),
        badge: tier,
        title: name.replace(/^Level \d+\s*·\s*/, ''),
        cards,
        color: LEVEL_COLORS[tier] || LEVEL_COLORS[4]
      })),
      packs: packs.map(({ id, name, cards, color }) => withStats({
        key: `pack-${id}`,
        kind: 'pack',
        filterValue: id,
        badge: cards.length,
        title: name,
        cards,
        color
      }))
    };
  }, [levels, packs, progress]);

  // Recommended lesson: the unfinished pack you're closest to completing; if
  // nothing's been started yet, the first unfinished level on the path.
  // Everything else on Home is "other packs": started ones by progress, then
  // untouched ones in registry order, finished ones last.
  const { recommended, otherPacks } = React.useMemo(() => {
    const unfinishedPacks = collections.packs.filter(c => c.knownCount < c.total);
    const rec = unfinishedPacks
      .filter(c => c.knownCount > 0)
      .sort((a, b) => b.percent - a.percent || b.lastReviewedAt.localeCompare(a.lastReviewedAt))[0]
      || collections.levels.find(c => c.knownCount < c.total)
      || null;
    const rank = (c) => (c.knownCount >= c.total ? 2 : c.started ? 0 : 1);
    return {
      recommended: rec,
      otherPacks: collections.packs
        .filter(c => c.key !== rec?.key)
        .map((c, i) => ({ c, i }))
        .sort((a, b) => rank(a.c) - rank(b.c) || (rank(a.c) === 0 ? b.c.percent - a.c.percent : a.i - b.i))
        .map(({ c }) => c)
    };
  }, [collections]);

  // One new word per day, remembered so it doesn't change when you learn it
  // mid-day. Picked from the lowest level that still has unlearnt words.
  const wordOfDay = React.useMemo(() => {
    if (allCards.length === 0) return null;
    const now = new Date();
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    try {
      const saved = JSON.parse(localStorage.getItem('flashcards_wotd'));
      const card = saved?.date === today && allCards.find(c => c.id === saved.id);
      if (card) return card;
    } catch { /* fall through and pick a new one */ }
    const unlearnt = allCards.filter(c => progress[c.id]?.status !== 'know');
    const pool = unlearnt.length > 0 ? unlearnt : allCards;
    const minTier = Math.min(...pool.map(c => c.tier || 1));
    const tierPool = pool.filter(c => (c.tier || 1) === minTier);
    let hash = 0;
    for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = tierPool[hash % tierPool.length];
    try { localStorage.setItem('flashcards_wotd', JSON.stringify({ date: today, id: pick.id })); } catch { /* non-fatal */ }
    return pick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards]);

  const totalLearntWords = React.useMemo(() => {
    return Object.values(progress).filter(p => p.status === 'know').length;
  }, [progress]);

  // Surface-form index used to look up words tapped inside example sentences.
  const wordIndex = React.useMemo(() => {
    const map = new Map();
    allCards.forEach(card => {
      [card.kanji, card.hiragana, card.katakana].forEach(form => {
        if (form && !map.has(form)) map.set(form, card);
      });
    });
    return map;
  }, [allCards]);

  const lookupSentenceToken = (tok) => {
    const cleanJa = stripPunctuation(tok.ja);
    if (!cleanJa) return;
    // Match the deck by dictionary form first (拾っ -> 拾う), then by the
    // surface spelling and its reading.
    const match = (tok.base && wordIndex.get(tok.base))
      || wordIndex.get(cleanJa)
      || wordIndex.get(stripPunctuation(tok.hi))
      || null;
    setSentenceLookup(prev => (prev && prev.tok.ja === tok.ja && prev.tok.hi === tok.hi ? null : { tok, card: match }));
  };

  const splashScreen = !splashRemoved && (
    <div id="splash-screen" class={splashFadingOut ? 'fade-out' : ''}>
      <div class="splash-mark">日</div>
      <p class="splash-title">Japanese Flashcards</p>
      {loading && <div class="splash-spinner" aria-label="Loading"></div>}
    </div>
  );

  const masteryPercent = allCards.length > 0 ? Math.round((totalLearntWords / allCards.length) * 100) : 0;
  const stillLearningCount = Object.values(progress).filter(p => p.status === 'dont').length;
  const reviewedToday = Object.values(progress)
    .filter(p => p.lastReviewedAt && new Date(p.lastReviewedAt).toDateString() === new Date().toDateString()).length;
  const shownPercent = useCountUp(masteryPercent, 1100);
  const shownLearnt = useCountUp(totalLearntWords);
  const shownLearning = useCountUp(stillLearningCount);
  const shownToday = useCountUp(reviewedToday);

  if (error) {
    return (
      <div id="app-error-state">
        <p>Couldn't load the dataset.</p>
        <p class="muted">{error}</p>
      </div>
    );
  }

  if (loading || !splashRemoved) {
    return splashScreen;
  }

  const displayKanji = showKanji && currentCard?.kanji;
  const currentDisplayBreakdown = currentCard ? getDisplayBreakdown(currentCard, showKanji) : null;
  const currentDisplayConjugations = currentCard ? getDisplayConjugations(currentCard, showKanji) : null;
  const currentHiraganaConjugations = currentCard ? getHiraganaConjugations(currentCard) : null;
  const currentDisplayParticleUsage = currentCard ? getDisplayParticleUsage(currentCard, showKanji) : null;

  const renderCollectionCard = ({ key, kind, filterValue, badge, title, cards, color, learntCards, knownCount, total, percent }) => (
    <div key={key} class="collection-card">
      <div class="collection-card-main" onClick={() => startSession(cards)}>
        <div class="level-badge" style={{ background: color }}>{badge}</div>
        <div class="collection-main">
          <div class="collection-header">
            <h3 class="collection-title">{title}</h3>
            <span class="collection-badge">{total} words</span>
          </div>
          <div class="collection-stats">{knownCount} / {total} known</div>
          <div class="collection-progress-bg">
            <div class="collection-progress-fill" style={{ width: `${percent}%`, background: color }}></div>
          </div>
        </div>
        {/* Expand/Collapse toggle chevron */}
        <button
          class={`card-expand-toggle ${expandedCardKey === key ? 'expanded' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpandedCardKey(prev => prev === key ? null : key);
          }}
          aria-label="Toggle actions"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>

      {/* Expandable dropdown actions */}
      <div class={`collection-actions-dropdown ${expandedCardKey === key ? 'open' : ''}`}>
        <div class="collection-actions">
          <button
            class="btn-card-action primary"
            onClick={(e) => { e.stopPropagation(); startSession(cards); }}
            title="Start random flashcard practice session"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Study All ({total})
          </button>
          <button
            class={`btn-card-action review-learnt ${knownCount === 0 ? 'disabled' : ''}`}
            disabled={knownCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              if (knownCount > 0) startSession(learntCards);
            }}
            title={knownCount === 0 ? "No learnt words yet in this category" : `Review ${knownCount} learnt words`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Review ({knownCount})
          </button>
          <button
            class="btn-card-action view-words"
            onClick={(e) => {
              e.stopPropagation();
              if (kind === 'level') {
                setTierFilter(filterValue);
                setSelectedPackId('all');
              } else {
                setSelectedPackId(filterValue);
                setTierFilter('all');
              }
              setHomeView('all-words');
            }}
            title="See all words in this collection in a list"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            View ({total})
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Home Screen */}
      {screen === 'home' && (
        <div id="home-screen">
          {/* Top Hero Section */}
          <div class="home-hero-section">
            <h1 class="hero-title">Japanese Flashcards</h1>

            <div class="mastery-ring" role="img" aria-label={`${masteryPercent}% of words mastered`}>
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle class="mastery-ring-track" cx="50" cy="50" r={RING_RADIUS} />
                <circle
                  class="mastery-ring-fill"
                  cx="50" cy="50" r={RING_RADIUS}
                  style={{
                    '--ring-circumference': RING_CIRCUMFERENCE,
                    '--ring-offset': RING_CIRCUMFERENCE * (1 - totalLearntWords / Math.max(allCards.length, 1))
                  }}
                />
              </svg>
              <strong class="mastery-ring-value">{shownPercent}<small>%</small></strong>
            </div>

            <div class="hero-chips">
              <div class="hero-chip chip-learnt" title={`${totalLearntWords} of ${allCards.length} words learnt`} aria-label={`${totalLearntWords} words learnt`}>
                <IconCheckCircle width="20" height="20" />
                <strong>{shownLearnt}</strong>
              </div>
              <div class="hero-chip chip-learning" title="Words still being learnt" aria-label={`${stillLearningCount} words still learning`}>
                <IconRefresh width="20" height="20" />
                <strong>{shownLearning}</strong>
              </div>
              <div class="hero-chip chip-today" title="Words reviewed today" aria-label={`${reviewedToday} words reviewed today`}>
                <IconSun width="20" height="20" />
                <strong>{shownToday}</strong>
              </div>
            </div>

            <div class="hero-levels" role="group" aria-label="Progress by level">
              {collections.levels.map((l, i) => (
                <div
                  key={l.key}
                  class="hero-level"
                  title={`Level ${l.badge}: ${l.knownCount} of ${l.total} learnt`}
                  style={{ '--i': i }}
                >
                  <div class="hero-level-track">
                    <div class="hero-level-fill" style={{ width: `${l.percent}%`, background: l.color }}></div>
                  </div>
                  <span class="hero-level-num" style={{ background: l.color }}>{l.badge}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3D Sheet Section with Rounded Top Corners */}
          <div class="home-sheet-section">
            {homeView === 'learn' && (
              <div class="sheet-header">
                <div class="sheet-title-group">
                  <h2 class="sheet-title">Learn</h2>
                  <span class="sheet-subtitle">Follow the path, or explore themed packs</span>
                </div>
              </div>
            )}

            {homeView === 'kana' && (
              <div class="sheet-header">
                <div class="sheet-title-group">
                  <h2 class="sheet-title">Kana Chart</h2>
                  <span class="sheet-subtitle">Hiragana and katakana, with romaji readings</span>
                </div>
              </div>
            )}

            {homeView === 'kanji' && (
              <div class="sheet-header">
                <div class="sheet-title-group">
                  <h2 class="sheet-title">Kanji</h2>
                  <span class="sheet-subtitle">
                    {kanjiMode === 'map' ? "Every kanji you've met, grouped by its radical" : 'Practise the kanji you\'ve met, by JLPT level'}
                  </span>
                </div>
              </div>
            )}

            {/* HOME: word of the day, a recommended lesson, then other packs */}
            {homeView === 'home' && (
              <div class="collections-grid">
                {wordOfDay && (
                  <WordOfDay
                    card={wordOfDay}
                    showKanji={showKanji}
                    onToggleKanji={handleToggleKanji}
                    learnt={progress[wordOfDay.id]?.status === 'know'}
                  />
                )}
                {recommended && (
                  <>
                    <h3 class="collections-section-label">Recommended lesson</h3>
                    {renderCollectionCard(recommended)}
                  </>
                )}
                {otherPacks.length > 0 && (
                  <>
                    <h3 class="collections-section-label">Other card packs</h3>
                    {otherPacks.map(c => renderCollectionCard(c))}
                  </>
                )}
              </div>
            )}

            {/* LEARN: learning path + word packs together */}
            {homeView === 'learn' && (
              <div id="collections-list" class="collections-grid">
                <h3 class="collections-section-label">Learning path</h3>
                {collections.levels.map(c => renderCollectionCard(c))}
                <h3 class="collections-section-label">Word packs</h3>
                {collections.packs.map(c => renderCollectionCard(c))}
              </div>
            )}

            {/* ALL WORDS LIST VIEW */}
            {homeView === 'all-words' && (
              <div class="all-words-container">
                <div class="all-words-controls">
                  <div class="search-box">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input
                      type="text"
                      placeholder="Search Japanese, English, Romaji..."
                      aria-label="Search words"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      class="word-search-input"
                    />
                    {searchTerm && (
                      <button class="clear-search-btn" aria-label="Clear search" onClick={() => setSearchTerm('')}>✕</button>
                    )}
                  </div>

                  <div class="status-chips" role="group" aria-label="Filter by status">
                    <button
                      class={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('all')}
                    >
                      All ({allCards.length})
                    </button>
                    <button
                      class={`filter-chip ${statusFilter === 'know' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('know')}
                    >
                      Learnt ✓ ({totalLearntWords})
                    </button>
                    <button
                      class={`filter-chip ${statusFilter === 'unlearnt' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('unlearnt')}
                    >
                      Unlearnt ({allCards.length - totalLearntWords})
                    </button>
                  </div>

                  <div class="filters-row">
                    <select
                      class="tier-select-dropdown"
                      aria-label="Filter by level"
                      value={tierFilter}
                      onChange={(e) => { setTierFilter(e.target.value); }}
                    >
                      <option value="all">All Levels</option>
                      {levels.map(({ tier, name }) => (
                        <option key={tier} value={String(tier)}>{name}</option>
                      ))}
                    </select>

                    <select
                      class="tier-select-dropdown"
                      aria-label="Filter by pack"
                      value={selectedPackId}
                      onChange={(e) => setSelectedPackId(e.target.value)}
                    >
                      <option value="all">All Word Packs</option>
                      {packs.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div class="words-results-summary">
                  <span>Showing <strong>{filteredCards.length}</strong> words</span>
                  <span class="hint-text">Click any word row to open flashcard pop up</span>
                </div>

                {filteredCards.length === 0 ? (
                  <div class="empty-words-state">
                    <span class="empty-icon"><IconSearch /></span>
                    <p>No words match your filters.</p>
                    <button
                      class="reset-filters-btn"
                      onClick={() => { setSearchTerm(''); setStatusFilter('all'); setTierFilter('all'); setSelectedPackId('all'); }}
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div class="words-list-grid">
                    {filteredCards.map((card, idx) => {
                      const isLearnt = progress[card.id]?.status === 'know';
                      const mainWord = showKanji && card.kanji ? card.kanji : card.hiragana;
                      const subWord = showKanji && card.kanji ? card.hiragana : '';

                      return (
                        <div
                          key={card.id}
                          class={`word-list-row ${isLearnt ? 'status-learnt' : ''}`}
                          onClick={() => setModalCardIndex(idx)}
                        >
                          <div class="row-left">
                            <div class="word-primary">{mainWord}</div>
                            {subWord && <div class="word-secondary muted">{subWord}</div>}
                            <div class="word-romaji">{card.romaji}</div>
                          </div>

                          <div class="row-middle">
                            <div class="word-english">{card.englishMeanings?.join(', ')}</div>
                            <div class="word-meta-pills">
                              <span class="meta-pill pos">{card.partOfSpeech}</span>
                              {card.tierName && <span class="meta-pill tier">L{card.tier}</span>}
                            </div>
                          </div>

                          <div class="row-right">
                            <button
                              class="row-audio-btn"
                              title="Listen"
                              onClick={(e) => {
                                e.stopPropagation();
                                speak(card.audio.ttsText, card.audio.lang);
                              }}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="4 8 8 8 12 4 12 20 8 16 4 16 4 8"></polygon><path d="M16 8.5a4.5 4.5 0 0 1 0 7"></path></svg>
                            </button>
                            <span class={`status-badge ${isLearnt ? 'learnt' : 'unlearnt'}`}>
                              {isLearnt ? 'Learnt ✓' : 'Unlearnt'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* KANA CHART VIEW */}
            {homeView === 'kana' && <KanaChart />}

            {/* KANJI RADICAL MAP VIEW */}
            {homeView === 'kanji' && (
              <div class="status-chips kanji-mode-toggle" role="group" aria-label="Kanji mode">
                <button class={`filter-chip ${kanjiMode === 'map' ? 'active' : ''}`} onClick={() => setKanjiMode('map')}>Radical map</button>
                <button class={`filter-chip ${kanjiMode === 'practice' ? 'active' : ''}`} onClick={() => setKanjiMode('practice')}>Practice</button>
              </div>
            )}

            {/* KANJI PRACTICE: JLPT levels */}
            {homeView === 'kanji' && kanjiMode === 'practice' && (
              <div class="collections-grid kanji-practice-levels">
                {!radicalMap && !radicalMapError && <p class="muted">Loading kanji…</p>}
                {radicalMapError && <p class="muted">Couldn't load the kanji.</p>}
                {radicalMap && (() => {
                  const allKanji = radicalMap.groups.flatMap(g => g.kanji);
                  return JLPT_LEVELS.map(level => {
                    const list = allKanji.filter(k => (k.jlpt ?? null) === level.jlpt);
                    if (list.length === 0) return null;
                    const knownCount = list.filter(k => kanjiProgress[k.kanji] === 'know').length;
                    return (
                      <div key={level.key} class="collection-card">
                        <div class="collection-card-main" onClick={() => setKanjiSession({ title: `JLPT ${level.label}`, kanji: list })}>
                          <div class="level-badge" style={{ background: level.color }}>{level.badge}</div>
                          <div class="collection-main">
                            <div class="collection-header">
                              <h3 class="collection-title">{level.jlpt === null ? level.label : `JLPT ${level.label}`}</h3>
                              <span class="collection-badge">{list.length} kanji</span>
                            </div>
                            <div class="collection-stats">{knownCount} / {list.length} known</div>
                            <div class="collection-progress-bg">
                              <div class="collection-progress-fill" style={{ width: `${(knownCount / list.length) * 100}%`, background: level.color }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {homeView === 'kanji' && kanjiMode === 'map' && (
              <div class="kanji-map-container">
                <div class="search-box">
                  <IconSearch width="18" height="18" />
                  <input
                    type="text"
                    placeholder="Search a radical, kanji, or meaning..."
                    aria-label="Search kanji map"
                    value={kanjiSearchTerm}
                    onChange={(e) => setKanjiSearchTerm(e.target.value)}
                    class="word-search-input"
                  />
                  {kanjiSearchTerm && (
                    <button class="clear-search-btn" aria-label="Clear search" onClick={() => setKanjiSearchTerm('')}>✕</button>
                  )}
                </div>

                {radicalMapError && <p class="muted">Couldn't load the kanji map.</p>}

                {radicalMap && (() => {
                  const q = kanjiSearchTerm.trim().toLowerCase();
                  const matchesKanji = (k) => !q ||
                    k.kanji === kanjiSearchTerm.trim() ||
                    (k.meanings || []).some(m => m.toLowerCase().includes(q)) ||
                    (k.on || []).some(r => r.toLowerCase().includes(q)) ||
                    (k.kun || []).some(r => r.toLowerCase().includes(q));

                  const visibleGroups = radicalMap.groups
                    .map(g => {
                      const groupMatches = !q ||
                        g.radicalChar === kanjiSearchTerm.trim() ||
                        g.radicalMeaning.toLowerCase().includes(q);
                      const kanjiList = groupMatches ? g.kanji : g.kanji.filter(matchesKanji);
                      return { ...g, kanjiList };
                    })
                    .filter(g => g.kanjiList.length > 0);

                  return (
                    <>
                      <div class="words-results-summary">
                        <span><strong>{radicalMap.totalKanji}</strong> kanji across <strong>{radicalMap.groups.length}</strong> radicals</span>
                        <span class="hint-text">Tap a radical to branch out, tap a kanji for details</span>
                      </div>

                      <div class="radical-map">
                        {visibleGroups.map(g => {
                          const isOpen = expandedRadical === g.radicalNum || (q && visibleGroups.length <= 8);
                          return (
                            <div class={`radical-branch ${isOpen ? 'open' : ''}`} key={g.radicalNum}>
                              <button
                                class="radical-hub"
                                onClick={() => setExpandedRadical(prev => prev === g.radicalNum ? null : g.radicalNum)}
                                aria-expanded={isOpen}
                              >
                                <span class="radical-hub-char">{g.radicalChar}</span>
                                <span class="radical-hub-info">
                                  <span class="radical-hub-meaning">{g.radicalMeaning}</span>
                                  <span class="radical-hub-sub">{g.radicalStrokes} stroke{g.radicalStrokes === 1 ? '' : 's'} · {g.count} kanji</span>
                                </span>
                                <span class="radical-hub-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                              </button>

                              {isOpen && (
                                <div class="radical-leaves">
                                  <div class="radical-leaves-trunk" aria-hidden="true"></div>
                                  <div class="radical-leaves-grid">
                                    {g.kanjiList.map(k => (
                                      <button
                                        key={k.kanji}
                                        class="kanji-leaf"
                                        onClick={() => setSelectedKanji(k)}
                                      >
                                        <span class="kanji-leaf-char">{k.kanji}</span>
                                        <span class="kanji-leaf-meaning">{(k.meanings && k.meanings[0]) || ''}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <p class="corpus-credit muted">Example sentences adapted from the Tanaka Corpus (CC BY 2.0). Word meanings from JMdict (EDRDG). Illustrations: Twemoji (CC BY 4.0).</p>
          </div>

          {/* Fixed Footer Navigation */}
          <footer class="home-footer-nav">
            <div class="footer-nav-inner" role="tablist">
              <div
                class="footer-nav-marker"
                style={{ transform: `translateX(${['home', 'learn', 'all-words', 'kana', 'kanji'].indexOf(homeView) * 100}%)` }}
                aria-hidden="true"
              ></div>
              <button
                role="tab"
                aria-selected={homeView === 'home'}
                class={`footer-nav-btn ${homeView === 'home' ? 'active' : ''}`}
                onClick={() => setHomeView('home')}
              >
                <span class="nav-icon"><IconHome width="20" height="20" /></span>
                <span class="nav-label">Home</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'learn'}
                class={`footer-nav-btn ${homeView === 'learn' ? 'active' : ''}`}
                onClick={() => setHomeView('learn')}
              >
                <span class="nav-icon"><IconRoute width="20" height="20" /></span>
                <span class="nav-label">Learn</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'all-words'}
                class={`footer-nav-btn ${homeView === 'all-words' ? 'active' : ''}`}
                onClick={() => setHomeView('all-words')}
              >
                <span class="nav-icon"><IconBook width="20" height="20" /></span>
                <span class="nav-label">Words</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'kana'}
                class={`footer-nav-btn ${homeView === 'kana' ? 'active' : ''}`}
                onClick={() => setHomeView('kana')}
              >
                <span class="nav-icon"><IconKana width="20" height="20" /></span>
                <span class="nav-label">Kana</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'kanji'}
                class={`footer-nav-btn ${homeView === 'kanji' ? 'active' : ''}`}
                onClick={() => setHomeView('kanji')}
              >
                <span class="nav-icon"><IconRadical width="20" height="20" /></span>
                <span class="nav-label">Kanji</span>
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* FLASHCARD POPUP MODAL */}
      {modalCard && (
        <div class="modal-backdrop" onClick={() => setModalCardIndex(null)}>
          <div class="modal-card-container" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-header-info">
                <span class="modal-counter">Word {modalCardIndex + 1} of {filteredCards.length}</span>
                {progress[modalCard.id]?.status === 'know' ? (
                  <span class="status-badge learnt">Learnt ✓</span>
                ) : (
                  <span class="status-badge unlearnt">Unlearnt</span>
                )}
              </div>
              <div class="modal-header-actions">
                <button
                  class="modal-nav-btn"
                  title="Previous word (Left arrow)"
                  onClick={() => setModalCardIndex(prev => (prev - 1 + filteredCards.length) % filteredCards.length)}
                >
                  ←
                </button>
                <button
                  class="modal-nav-btn"
                  title="Next word (Right arrow)"
                  onClick={() => setModalCardIndex(prev => (prev + 1) % filteredCards.length)}
                >
                  →
                </button>
                <button
                  class="modal-close-btn"
                  title="Close (Esc)"
                  onClick={() => setModalCardIndex(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Flashcard Component inside Modal */}
            <div class="modal-card-body">
              <div
                class="modal-flashcard"
                onClick={() => setModalIsFlipped(prev => !prev)}
              >
                <div class={`card-inner ${modalIsFlipped ? 'flipped' : ''}`}>
                  {/* FRONT */}
                  <div class="card-face modal-face-front">
                    <div class="card-topbar">
                      <span class="tag-chip">{modalCard.theme || modalCard.tierName}</span>
                      <span class="muted">Tap to flip <IconFlip /></span>
                    </div>
                    <div class="card-body">
                      <CardImage card={modalCard} />
                      <div class="word-group">
                        <p class="kanji-word">{showKanji && modalCard.kanji ? modalCard.kanji : modalCard.hiragana}</p>
                        <p class="hiragana-word muted">{showKanji && modalCard.kanji ? modalCard.hiragana : ''}</p>
                        <p class="romaji-word-front muted">{modalCard.romaji}</p>
                      </div>
                      <button
                        class="btn-audio"
                        aria-label="Play pronunciation"
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(modalCard.audio.ttsText, modalCard.audio.lang);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="4 8 8 8 12 4 12 20 8 16 4 16 4 8"></polygon><path d="M16 8.5a4.5 4.5 0 0 1 0 7"></path><path d="M18.5 6a8 8 0 0 1 0 12"></path></svg>
                      </button>
                      <p class="tap-hint muted">Tap to flip</p>
                    </div>
                  </div>

                  {/* BACK */}
                  <div class="card-face modal-face-back">
                    <div class="card-scrollable">
                      <div class="card-topbar">
                        <span class="muted">Word Details</span>
                      </div>
                      <div class="back-word-group">
                        <p class="japanese-word-back">{showKanji && modalCard.kanji ? modalCard.kanji : modalCard.hiragana}</p>
                        <p class="romaji-word">{modalCard.romaji}</p>
                        <p class="katakana-word muted">{modalCard.katakana}</p>
                        <p class="meaning">{modalCard.englishMeanings?.join(', ')}</p>
                        <span class="pos-pill muted">
                          {modalCard.partOfSpeech}
                          {modalCard.verbType ? ` (${modalCard.verbType})` : modalCard.isNaAdjective ? ' (na-adjective)' : ''}
                        </span>
                      </div>

                      <NoteSection
                        noteText={notes[modalCard.id] || ''}
                        editing={modalNoteEditing}
                        onStartEdit={() => setModalNoteEditing(true)}
                        onChange={(val) => saveNote(modalCard.id, val)}
                        onDone={() => setModalNoteEditing(false)}
                      />

                      {/* Stroke order */}
                      {showKanji && modalCard.strokeOrderSvgs && modalCard.strokeOrderSvgs.length > 0 && (
                        <>
                          <button
                            class={`stroke-toggle ${modalStrokeShown ? 'expanded' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalStrokeShown(prev => !prev);
                            }}
                          >
                            <span>{modalStrokeShown ? 'Hide stroke order' : 'Show stroke order'}</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          {modalStrokeShown && (
                            <div class="kanji-vg-container playing">
                              {modalCard.strokeOrderSvgs.every(path => !svgsMap[path]) && (
                                <p class="stroke-loading-hint">Loading stroke order…</p>
                              )}
                              {modalCard.strokeOrderSvgs.map(path => (
                                <div key={path} dangerouslySetInnerHTML={{ __html: svgsMap[path] || '' }} />
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Breakdown */}
                      {modalDisplayBreakdown && modalDisplayBreakdown.length > 0 && (
                        <div class="breakdown-section">
                          <div class="grammar-title">Word Breakdown</div>
                          <div class="breakdown-row">
                            {modalDisplayBreakdown.map((part, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span class="breakdown-plus">+</span>}
                                <div class="breakdown-chip">
                                  <span class="breakdown-text">{part.text}</span>
                                  <span class="breakdown-gloss">{part.gloss}</span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Conjugations */}
                      {modalDisplayConjugations && (
                        <div class="grammar-section">
                          <div class="grammar-title">Tense &amp; Forms</div>
                          <div class="conjugation-grid">
                            {CONJ_KEYS.map(k => (
                              modalDisplayConjugations[k] ? (
                                <React.Fragment key={k}>
                                  <div class={`conj-label ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                                  <div class={`conj-value-group ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>
                                    <div class="conj-value">{modalDisplayConjugations[k]}</div>
                                    {modalHiraganaConjugations?.[k] && modalHiraganaConjugations[k] !== modalDisplayConjugations[k] && (
                                      <div class="conj-hiragana muted">{modalHiraganaConjugations[k]}</div>
                                    )}
                                    <div class="conj-romaji muted">{wanakana.toRomaji(modalHiraganaConjugations?.[k] || modalDisplayConjugations[k])}</div>
                                  </div>
                                  <div class={`conj-english muted ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{getConjugationEnglish(modalCard, k)}</div>
                                </React.Fragment>
                              ) : null
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Particle Usage */}
                      {modalDisplayParticleUsage && modalDisplayParticleUsage.length > 0 && (
                        <div class="particle-section">
                          <div class="grammar-title">Common Particles</div>
                          <div class="particle-list">
                            {modalDisplayParticleUsage.map((p, i) => (
                              <div key={i} class="particle-row">
                                <span class="particle-tag">{p.particle}</span>
                                <div class="particle-text">
                                  <span class="particle-phrase">{p.phrase}</span>
                                  <span class="particle-english muted">{p.english}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Example Sentence */}
                      {modalCard.exampleSentence && (
                        <div class="sentence-section" style={{ display: 'block' }}>
                          <div class="sentence-card">
                            <p class="sentence-japanese">
                              <SentenceTokens sentence={modalCard.exampleSentence} showKanji={showKanji} onTokenTap={lookupSentenceToken} />
                            </p>
                            {formatSentenceRomaji(modalCard.exampleSentence) && (
                              <p class="sentence-romaji muted">
                                {formatSentenceRomaji(modalCard.exampleSentence)}
                              </p>
                            )}
                            <div class="sentence-divider"></div>
                            <p class="sentence-english">{modalCard.exampleSentence.english}</p>
                            <WordLookupPopover lookup={sentenceLookup} showKanji={showKanji} onClose={() => setSentenceLookup(null)} />
                          </div>
                        </div>
                      )}
                      <div class="scroll-spacer"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action Controls */}
            <div class="modal-footer-actions">
              <button
                class={`modal-action-btn dont ${progress[modalCard.id]?.status === 'dont' ? 'active' : ''}`}
                onClick={() => saveWordProgress(modalCard.id, 'dont')}
              >
                Mark Unlearnt ✗
              </button>
              <button
                class={`modal-action-btn know ${progress[modalCard.id]?.status === 'know' ? 'active' : ''}`}
                onClick={() => saveWordProgress(modalCard.id, 'know')}
              >
                Mark Learnt ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {kanjiSession && (
        <KanjiPractice
          key={kanjiSession.title}
          title={kanjiSession.title}
          kanji={kanjiSession.kanji}
          onJudge={saveKanjiProgress}
          onClose={() => setKanjiSession(null)}
        />
      )}

      {/* KANJI DETAIL POPUP (from the Kanji Map tab) */}
      {selectedKanji && (
        <div class="modal-backdrop" onClick={() => setSelectedKanji(null)}>
          <div class="kanji-detail-card" onClick={(e) => e.stopPropagation()}>
            <button class="modal-close-btn kanji-detail-close" title="Close (Esc)" onClick={() => setSelectedKanji(null)}>✕</button>

            <div class="kanji-detail-char">{selectedKanji.kanji}</div>

            <div class="kanji-detail-meta">
              {selectedKanji.strokes != null && <span class="tag-chip">{selectedKanji.strokes} strokes</span>}
              {selectedKanji.jlpt != null && <span class="tag-chip">JLPT {jlptLabel(selectedKanji.jlpt)}</span>}
              {selectedKanji.grade != null && <span class="tag-chip">Grade {selectedKanji.grade}</span>}
            </div>

            {selectedKanji.meanings && selectedKanji.meanings.length > 0 && (
              <p class="kanji-detail-meanings">{selectedKanji.meanings.join(', ')}</p>
            )}

            {selectedKanji.radicals && selectedKanji.radicals.length > 0 && (
              <div class="kanji-detail-radicals">
                <span class="collections-section-label">Radicals in this kanji</span>
                <div class="kanji-detail-radicals-list">
                  {selectedKanji.radicals.map(r => (
                    <RadicalChip
                      key={r.num}
                      radical={r}
                      onOpen={radicalMap?.groups.some(g => g.radicalNum === r.num) ? openRadicalBranch : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            <div class="kanji-detail-readings">
              {selectedKanji.on && selectedKanji.on.length > 0 && (
                <div class="kanji-detail-reading-row">
                  <span class="kanji-detail-reading-label">On'yomi</span>
                  <span class="kanji-detail-reading-value">{selectedKanji.on.join('、')}</span>
                </div>
              )}
              {selectedKanji.kun && selectedKanji.kun.length > 0 && (
                <div class="kanji-detail-reading-row">
                  <span class="kanji-detail-reading-label">Kun'yomi</span>
                  <span class="kanji-detail-reading-value">{selectedKanji.kun.join('、')}</span>
                </div>
              )}
            </div>

            {selectedKanji.words && selectedKanji.words.length > 0 && (
              <div class="kanji-detail-words">
                <span class="collections-section-label">Appears in your words</span>
                <div class="kanji-detail-words-list">
                  {selectedKanji.words.map(w => (
                    <button
                      key={w.id}
                      class="kanji-word-chip"
                      onClick={() => { setSelectedKanji(null); openWordFromKanji(w.id); }}
                    >
                      <span class="kanji-word-chip-jp">{w.kanji}</span>
                      <span class="kanji-word-chip-en">{w.meaning}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Arena Header & Progress */}
      {screen === 'arena' && currentCard && (
        <>
          <div id="progress-bar-track">
            <div id="progress-bar-fill" style={{ width: `${(currentIndex / remaining.length) * 100}%` }}></div>
          </div>
          <div id="arena-header">
            <button id="btn-back-home" onClick={() => setScreen('home')} aria-label="Back to home">← Back</button>
            <p id="progress-label">
              {currentIndex + 1} of {remaining.length} cards
              {currentIndex === remaining.length - 1 && <span class="last-card-badge">Last card</span>}
            </p>
            <label class="setting-toggle">
              <input type="checkbox" checked={showKanji} onChange={handleToggleKanji} aria-label="Show kanji" />
              <span>Kanji</span>
            </label>
          </div>

          <div id="card-arena">
            <div class="card-stack-peek peek-1" aria-hidden="true"></div>
            <div
              id="card"
              ref={cardRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onClick={(e) => {
                if (e.target.closest('button') || e.target.tagName === 'A') return;
                if (dragRef.current.wasDragged) return;
                setIsFlipped(prev => !prev);
              }}
            >
              <div id="card-inner" ref={cardInnerRef} class={isFlipped ? 'flipped' : ''}>
                {/* FRONT FACE */}
                <div class="card-face" id="card-front">
                  <div class="card-body">
                    <CardImage card={currentCard} />
                    <div class="word-group">
                      <p class="kanji-word">{displayKanji ? currentCard.kanji : currentCard.hiragana}</p>
                      <p class="hiragana-word muted">{displayKanji ? currentCard.hiragana : ''}</p>
                      <p class="romaji-word-front muted">{currentCard.romaji}</p>
                    </div>
                    <button
                      class="btn-audio"
                      aria-label="Play pronunciation"
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(currentCard.audio.ttsText, currentCard.audio.lang);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="4 8 8 8 12 4 12 20 8 16 4 16 4 8"></polygon><path d="M16 8.5a4.5 4.5 0 0 1 0 7"></path><path d="M18.5 6a8 8 0 0 1 0 12"></path></svg>
                    </button>
                    <p class="tap-hint muted">Tap to reveal</p>
                  </div>
                </div>

                {/* BACK FACE */}
                <div class="card-face" id="card-back">
                  <div class="card-scrollable" ref={scrollableRef} onScroll={checkScrollFade}>
                    <div class="card-topbar">
                      <span class="card-counter-back muted">{currentIndex + 1} / {remaining.length}</span>
                    </div>
                    <div class="back-word-group">
                      <p class="japanese-word-back">{displayKanji ? currentCard.kanji : currentCard.hiragana}</p>
                      <p class="romaji-word">{currentCard.romaji}</p>
                      <p class="katakana-word muted">{currentCard.katakana}</p>
                      <p class="meaning">{currentCard.englishMeanings?.join(', ')}</p>
                      <span class="pos-pill muted">
                        {currentCard.partOfSpeech}
                        {currentCard.verbType ? ` (${currentCard.verbType})` : currentCard.isNaAdjective ? ' (na-adjective)' : ''}
                      </span>
                    </div>

                    <NoteSection
                      noteText={notes[currentCard.id] || ''}
                      editing={noteEditing}
                      onStartEdit={() => setNoteEditing(true)}
                      onChange={(val) => saveNote(currentCard.id, val)}
                      onDone={() => setNoteEditing(false)}
                    />

                    {/* Stroke order */}
                    {displayKanji && currentCard.strokeOrderSvgs && currentCard.strokeOrderSvgs.length > 0 && (
                      <>
                        <button
                          class={`stroke-toggle ${strokeShown ? 'expanded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setStrokeShown(prev => !prev);
                            setTimeout(checkScrollFade, 60);
                          }}
                        >
                          <span>{strokeShown ? 'Hide stroke order' : 'Show stroke order'}</span>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        {strokeShown && (
                          <div class="kanji-vg-container playing">
                            {currentCard.strokeOrderSvgs.every(path => !svgsMap[path]) && (
                              <p class="stroke-loading-hint">Loading stroke order…</p>
                            )}
                            {currentCard.strokeOrderSvgs.map(path => (
                              <div key={path} dangerouslySetInnerHTML={{ __html: svgsMap[path] || '' }} />
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Breakdown */}
                    {currentDisplayBreakdown && currentDisplayBreakdown.length > 0 && (
                      <div class="breakdown-section">
                        <div class="grammar-title">Word Breakdown</div>
                        <div class="breakdown-row">
                          {currentDisplayBreakdown.map((part, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span class="breakdown-plus">+</span>}
                              <div class="breakdown-chip">
                                <span class="breakdown-text">{part.text}</span>
                                <span class="breakdown-gloss">{part.gloss}</span>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Conjugations */}
                    {currentDisplayConjugations && (
                      <div class="grammar-section">
                        <div class="grammar-title">Tense &amp; Forms</div>
                        <div class="conjugation-grid">
                          {CONJ_KEYS.map(k => (
                            currentDisplayConjugations[k] ? (
                              <React.Fragment key={k}>
                                <div class={`conj-label ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                                <div class={`conj-value-group ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>
                                  <div class="conj-value">{currentDisplayConjugations[k]}</div>
                                  {currentHiraganaConjugations?.[k] && currentHiraganaConjugations[k] !== currentDisplayConjugations[k] && (
                                    <div class="conj-hiragana muted">{currentHiraganaConjugations[k]}</div>
                                  )}
                                  <div class="conj-romaji muted">{wanakana.toRomaji(currentHiraganaConjugations?.[k] || currentDisplayConjugations[k])}</div>
                                </div>
                                <div class={`conj-english muted ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{getConjugationEnglish(currentCard, k)}</div>
                              </React.Fragment>
                            ) : null
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Particle Usage */}
                    {currentDisplayParticleUsage && currentDisplayParticleUsage.length > 0 && (
                      <div class="particle-section">
                        <div class="grammar-title">Common Particles</div>
                        <div class="particle-list">
                          {currentDisplayParticleUsage.map((p, i) => (
                            <div key={i} class="particle-row">
                              <span class="particle-tag">{p.particle}</span>
                              <div class="particle-text">
                                <span class="particle-phrase">{p.phrase}</span>
                                <span class="particle-english muted">{p.english}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Example Sentence */}
                    {currentCard.exampleSentence && (
                      <div class="sentence-section" style={{ display: 'block' }}>
                        <div class="sentence-card">
                          <p class="sentence-japanese">
                            <SentenceTokens sentence={currentCard.exampleSentence} showKanji={showKanji} onTokenTap={lookupSentenceToken} />
                          </p>
                          {formatSentenceRomaji(currentCard.exampleSentence) && (
                            <p class="sentence-romaji muted">
                              {formatSentenceRomaji(currentCard.exampleSentence)}
                            </p>
                          )}
                          <div class="sentence-divider"></div>
                          <p class="sentence-english">{currentCard.exampleSentence.english}</p>
                          <WordLookupPopover lookup={sentenceLookup} showKanji={showKanji} onClose={() => setSentenceLookup(null)} />
                        </div>
                      </div>
                    )}
                    <div class="scroll-spacer"></div>
                    <div class={`scroll-fade ${hasScrollFade ? 'visible' : ''}`}></div>
                  </div>

                  <div class="action-buttons">
                    <button class="btn-dont-know" onClick={(e) => { e.stopPropagation(); judgeCard('dont'); }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      Don't know
                    </button>
                    <button class="btn-know" onClick={(e) => { e.stopPropagation(); judgeCard('know'); }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Know it
                    </button>
                  </div>
                </div>
              </div>

              <div class="swipe-tint swipe-tint-know" style={{ opacity: swipeOverlay.know * 0.55 }}></div>
              <div class="swipe-tint swipe-tint-dont" style={{ opacity: swipeOverlay.dont * 0.55 }}></div>

              <div
                class="swipe-label swipe-know"
                style={{ opacity: swipeOverlay.know, transform: `scale(${0.7 + swipeOverlay.know * 0.3}) rotate(-8deg)` }}
              >
                <IconCheckCircle width="20" height="20" />
                Know it
              </div>
              <div
                class="swipe-label swipe-dont"
                style={{ opacity: swipeOverlay.dont, transform: `scale(${0.7 + swipeOverlay.dont * 0.3}) rotate(8deg)` }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                Don't know
              </div>
            </div>
          </div>

          <div class="arena-bottom-nav">
            <button
              class="arena-nav-btn"
              onClick={goToPreviousCard}
              disabled={currentIndex === 0}
              aria-label="Previous card"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              Previous
            </button>
            <button
              class="arena-nav-btn"
              onClick={goToNextCard}
              disabled={currentIndex >= maxIndexReached}
              aria-label="Next card"
            >
              Next
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </>
      )}

      {/* Summary Screen */}
      {screen === 'summary' && (
        <div id="summary">
          <div class="summary-badge"><IconCheckCircle /></div>
          <h2>Session Complete!</h2>
          <div class="summary-stats">
            <span id="known-count">{known.length} ✓</span>
            <span id="unknown-count">{unknown.length} ✗</span>
          </div>
          <div id="missed-thumbnails">
            {unknown.map(c => (
              <div key={c.id} class="missed-thumb">{c.kanji || c.hiragana}</div>
            ))}
          </div>
          <button
            id="btn-review-missed"
            class="icon-text-btn"
            disabled={unknown.length === 0}
            onClick={() => startSession(unknown)}
          >
            Review Missed
          </button>
          <button id="btn-new-session" class="icon-text-btn" onClick={() => startSession(deck)}>
            New Session
          </button>
          <button id="btn-summary-home" class="icon-text-btn outline-btn" onClick={() => setScreen('home')}>
            Back to Home
          </button>
        </div>
      )}
    </>
  );
}

