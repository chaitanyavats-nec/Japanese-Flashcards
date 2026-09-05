import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as wanakana from 'wanakana';
import packsRegistry from '../packs.json';

const LEVEL_COLORS = {
  1: 'var(--level-1)',
  2: 'var(--level-2)',
  3: 'var(--level-3)',
  4: 'var(--level-4)'
};

const IconFlame = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2c1.2 3 .5 4.6-.6 6.2C10 9.8 8.5 11.4 8.5 14a3.5 3.5 0 0 0 7 0c0-1-.3-1.8-.8-2.6.9.7 1.8 2 1.8 3.6a4.5 4.5 0 0 1-9 0c0-4 2.7-6 3.5-9.3.4 1 1 1.7 1 3.3s-.5 2-1 3" />
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

const IconCheckCircle = (props) => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.3 2.3 4.7-5" />
  </svg>
);

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  window.speechSynthesis.speak(ut);
}

function hapticBuzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

const formatSentenceRomaji = (sentence) => {
  if (!sentence) return '';
  if (sentence.spacedRomaji) return sentence.spacedRomaji;
  if (sentence.spacedHiragana) return wanakana.toRomaji(sentence.spacedHiragana);
  if (sentence.hiragana) return wanakana.toRomaji(sentence.hiragana);
  return sentence.romaji ? sentence.romaji.replace(/([.?!,])/g, '$1 ') : '';
};

const hasKanji = (str) => !!str && /[一-龯]/.test(str);
const stripPunctuation = (str) => (str || '').replace(/[。、！？!?「」・\s]/g, '');

// Tokenize an example sentence into {ja, hi} pairs using the pre-computed
// wakachigaki (word-segmented) fields, so words in the sentence can be
// tapped individually. Falls back to treating the whole sentence as one
// token when segmentation data isn't available.
const tokenizeSentence = (sentence) => {
  if (!sentence) return [];
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
      {showKanji ? tok.ja : tok.hi}
    </span>
  ))
);

const WordLookupPopover = ({ lookup, showKanji, onClose }) => {
  if (!lookup) return null;
  const { card } = lookup;
  const headword = card
    ? (showKanji && card.kanji ? card.kanji : card.hiragana)
    : (showKanji ? lookup.jaKey : lookup.hi);
  return (
    <div class="word-lookup-popover" onClick={(e) => e.stopPropagation()}>
      <div class="word-lookup-header">
        <span class="word-lookup-word">{headword}</span>
        <span class="word-lookup-romaji muted">{card ? card.romaji : lookup.romaji}</span>
        <button class="word-lookup-close" onClick={onClose} aria-label="Close word lookup">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      {card ? (
        <>
          <p class="word-lookup-meaning">{card.englishMeanings?.join(', ')}</p>
          <span class="pos-pill muted">{card.partOfSpeech}</span>
        </>
      ) : (
        <p class="word-lookup-meaning muted">Not in your word list yet</p>
      )}
    </div>
  );
};

export default function App() {
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // App state
  const [screen, setScreen] = useState('home'); // 'home' | 'arena' | 'summary'
  const [homeView, setHomeView] = useState('learning-path'); // 'learning-path' | 'word-packs'
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

  // Sync showKanji to localStorage
  const handleToggleKanji = (e) => {
    const val = e.target.checked;
    setShowKanji(val);
    localStorage.setItem('flashcards_show_kanji', val);
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
  }, [modalCardIndex]);

  // Modal keyboard navigation & escape key
  useEffect(() => {
    if (modalCardIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalCardIndex(null);
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

  // Keyboard navigation for arena
  useEffect(() => {
    if (screen !== 'arena') return;
    const handleKeyDown = (e) => {
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
    const cleanHi = stripPunctuation(tok.hi);
    if (!cleanJa) return;
    const match = wordIndex.get(cleanJa) || wordIndex.get(cleanHi) || null;
    setSentenceLookup(prev => (prev && prev.key === cleanJa ? null : {
      key: cleanJa,
      jaKey: cleanJa,
      hi: cleanHi,
      romaji: wanakana.toRomaji(cleanHi),
      card: match
    }));
  };

  if (loading) {
    return <div style={{ color: 'white', textAlign: 'center', padding: '40px' }}>Loading datasets...</div>;
  }

  if (error) {
    return <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '40px' }}>Error: {error}</div>;
  }

  const displayKanji = showKanji && currentCard?.kanji;
  const currentDisplayBreakdown = currentCard ? getDisplayBreakdown(currentCard, showKanji) : null;
  const currentDisplayConjugations = currentCard ? getDisplayConjugations(currentCard, showKanji) : null;
  const currentHiraganaConjugations = currentCard ? getHiraganaConjugations(currentCard) : null;
  const currentDisplayParticleUsage = currentCard ? getDisplayParticleUsage(currentCard, showKanji) : null;

  return (
    <>
      {/* Home Screen */}
      {screen === 'home' && (
        <div id="home-screen">
          {/* Top Hero Section */}
          <div class="home-hero-section">
            <div class="home-header">
              <div class="brand">
                <span class="brand-mark">日</span>
                <div class="brand-text">
                  <h1>Japanese Flashcards</h1>
                  <p class="brand-subtitle">{totalLearntWords} of {allCards.length} words mastered</p>
                </div>
              </div>
              <div class="header-actions">
                <label class="setting-toggle">
                  <input type="checkbox" checked={showKanji} onChange={handleToggleKanji} aria-label="Show kanji" />
                  <span>Kanji</span>
                </label>
                <p class="streak-indicator"><IconFlame /> 1 Day Streak</p>
              </div>
            </div>
          </div>

          {/* 3D Sheet Section with Rounded Top Corners */}
          <div class="home-sheet-section">
            <div class="sheet-header">
              <div class="sheet-title-group">
                <h2 class="sheet-title">
                  {homeView === 'learning-path' && 'Learning Path'}
                  {homeView === 'word-packs' && 'Word Packs'}
                  {homeView === 'all-words' && 'Word List & Search'}
                </h2>
                <span class="sheet-subtitle">
                  {homeView === 'learning-path' && 'Progress through Japanese, one level at a time'}
                  {homeView === 'word-packs' && 'Explore curated vocabulary sets'}
                  {homeView === 'all-words' && 'Browse, search, & filter flashcards'}
                </span>
              </div>
            </div>

            {/* LEARNING PATH & WORD PACKS VIEWS */}
            {(homeView === 'learning-path' || homeView === 'word-packs') && (
              <div id="collections-list" class="collections-grid">
                {(homeView === 'learning-path'
                  ? levels.map(({ tier, name, cards }) => ({
                    key: tier,
                    badge: tier,
                    title: name.replace(/^Level \d+\s*·\s*/, ''),
                    cards,
                    color: LEVEL_COLORS[tier] || LEVEL_COLORS[4]
                  }))
                  : packs.map(({ id, name, cards, color }) => ({
                    key: id,
                    badge: cards.length,
                    title: name,
                    cards,
                    color
                  }))
                ).map(({ key, badge, title, cards, color }) => {
                  const learntCards = cards.filter(c => progress[c.id] && progress[c.id].status === 'know');
                  const knownCount = learntCards.length;
                  const total = cards.length;
                  const percent = total > 0 ? (knownCount / total) * 100 : 0;

                  return (
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
                              if (homeView === 'learning-path') {
                                setTierFilter(String(key));
                                setSelectedPackId('all');
                              } else {
                                setSelectedPackId(key);
                                setTierFilter('all');
                              }
                              setHomeView('all-words');
                            }}
                            title="See all words in this pack in a list"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            View ({total})
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      class="word-search-input"
                    />
                    {searchTerm && (
                      <button class="clear-search-btn" onClick={() => setSearchTerm('')}>✕</button>
                    )}
                  </div>

                  <div class="filters-row">
                    <div class="filter-group">
                      <span class="filter-label">Status:</span>
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

                    <div class="filter-group">
                      <span class="filter-label">Level:</span>
                      <select
                        class="tier-select-dropdown"
                        value={tierFilter}
                        onChange={(e) => { setTierFilter(e.target.value); }}
                      >
                        <option value="all">All Levels</option>
                        <option value="1">Level 1 · Foundations</option>
                        <option value="2">Level 2 · Essentials</option>
                        <option value="3">Level 3 · Intermediate</option>
                        <option value="4">Level 4 · Advanced</option>
                      </select>
                    </div>

                    <div class="filter-group">
                      <span class="filter-label">Pack:</span>
                      <select
                        class="tier-select-dropdown"
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

            <p class="corpus-credit muted">Example sentences adapted from the Tanaka Corpus (CC BY 2.0).</p>
          </div>

          {/* Fixed Footer Navigation */}
          <footer class="home-footer-nav">
            <div class="footer-nav-inner" role="tablist">
              <button
                role="tab"
                aria-selected={homeView === 'learning-path'}
                class={`footer-nav-btn ${homeView === 'learning-path' ? 'active' : ''}`}
                onClick={() => setHomeView('learning-path')}
              >
                <span class="nav-icon"><IconRoute width="16" height="16" /></span>
                <span class="nav-label">Path</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'word-packs'}
                class={`footer-nav-btn ${homeView === 'word-packs' ? 'active' : ''}`}
                onClick={() => setHomeView('word-packs')}
              >
                <span class="nav-icon"><IconPackage width="16" height="16" /></span>
                <span class="nav-label">Packs</span>
              </button>
              <button
                role="tab"
                aria-selected={homeView === 'all-words'}
                class={`footer-nav-btn ${homeView === 'all-words' ? 'active' : ''}`}
                onClick={() => setHomeView('all-words')}
              >
                <span class="nav-icon"><IconBook width="16" height="16" /></span>
                <span class="nav-label">Words</span>
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

      {/* Arena Header & Progress */}
      {screen === 'arena' && currentCard && (
        <>
          <div id="progress-bar-track">
            <div id="progress-bar-fill" style={{ width: `${(currentIndex / remaining.length) * 100}%` }}></div>
          </div>
          <div id="arena-header">
            <button id="btn-back-home" onClick={() => setScreen('home')} aria-label="Back to home">← Back</button>
            <p id="progress-label">{currentIndex + 1} of {remaining.length} cards</p>
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
                            <SentenceTokens sentence={currentCard.exampleSentence} showKanji={displayKanji} onTokenTap={lookupSentenceToken} />
                          </p>
                          {formatSentenceRomaji(currentCard.exampleSentence) && (
                            <p class="sentence-romaji muted">
                              {formatSentenceRomaji(currentCard.exampleSentence)}
                            </p>
                          )}
                          <div class="sentence-divider"></div>
                          <p class="sentence-english">{currentCard.exampleSentence.english}</p>
                          <WordLookupPopover lookup={sentenceLookup} showKanji={displayKanji} onClose={() => setSentenceLookup(null)} />
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

