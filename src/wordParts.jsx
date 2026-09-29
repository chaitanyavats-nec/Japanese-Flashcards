import React, { useState, useEffect } from 'react';
import * as wanakana from 'wanakana';
import imageMap from '../image-map.json';
import { speak, playWord, SLOW_RATE } from './lib/speech';
import { useMediaUrl } from './lib/media';
import { IconSpeaker, IconChevron, IconRefresh, IconSparkle } from './icons';

export function hapticBuzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// True while the user is typing into a text field (e.g. the note textarea),
// so global shortcuts like space-to-flip don't hijack the keystroke.
export const isTypingTarget = (el) =>
  !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable);

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

// Picture hint for a card: the learner's own photo on their cards, the
// word's Twemoji otherwise. Hidden when picture hints are off in Settings.
export const CardImage = ({ card, show = true }) => {
  const customUrl = useMediaUrl(card.media?.image);
  if (!show) return null;
  if (card.media?.image) {
    return customUrl ? (
      <div class="card-image card-image-photo" aria-hidden="true">
        <img src={customUrl} alt="" draggable={false} />
      </div>
    ) : null;
  }
  const emoji = imageMap[card.kanji || card.hiragana];
  if (!emoji) return null;
  return (
    <div class="card-image" aria-hidden="true">
      <img src={`/emoji/${emojiFileName(emoji)}.svg`} alt="" draggable={false} />
    </div>
  );
};

export const formatSentenceRomaji = (sentence) => {
  if (!sentence) return '';
  if (sentence.spacedRomaji) return sentence.spacedRomaji;
  if (sentence.spacedHiragana) return wanakana.toRomaji(sentence.spacedHiragana);
  if (sentence.hiragana) return wanakana.toRomaji(sentence.hiragana);
  return sentence.romaji ? sentence.romaji.replace(/([.?!,])/g, '$1 ') : '';
};

export const hasKanji = (str) => !!str && /[一-龯]/.test(str);
export const stripPunctuation = (str) => (str || '').replace(/[。、！？!?「」・\s]/g, '');

// Tokenize an example sentence into tappable word tokens. Uses the
// pre-computed exampleSentence.tokens (each carrying its dictionary form and
// meaning; see scripts/lib/sentence-tokens.js). Punctuation isn't tappable:
// it's folded onto the neighbouring word as lead/trail text. Falls back to
// the plain word-segmented strings when a card predates the token data.
const OPENING_PUNCT = /^[「『（(]+$/;
export const tokenizeSentence = (sentence) => {
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
// conjugates from the hiragana reading rather than kanji||hiragana. Used to
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

export function getHiraganaConjugations(card) {
  if (!card.conjugations || !card.hiragana) return null;
  if (card.partOfSpeech === 'verb') return conjugateVerbHiragana(card.hiragana, card.verbType);
  if (card.partOfSpeech === 'adjective') return conjugateAdjectiveHiragana(card.hiragana);
  return null;
}

export function getDisplayConjugations(card, showKanji) {
  if (!card.conjugations) return null;
  if (showKanji || !card.kanji) return card.conjugations;
  return getHiraganaConjugations(card) || card.conjugations;
}

// Plain-English descriptor for a conjugated form, built from the word's
// primary gloss rather than an attempted English tense conjugation (English
// irregular verbs like "go"/"went" can't be derived mechanically, so a wrong
// guess would be worse than a grammatical label).
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

export function getConjugationEnglish(card, key) {
  const base = card.englishMeanings?.[0];
  if (!base) return '';
  const stripped = base.replace(/^to\s+/i, '');
  const template = CONJ_ENGLISH_LABELS[key];
  return template ? template(stripped) : stripped;
}

export const CONJ_KEYS = ['present', 'presentPolite', 'past', 'pastPolite', 'negative', 'negativePolite', 'teForm', 'potential'];
// Plain/polite pairs (present+presentPolite, past+pastPolite, negative+negativePolite)
// are visually grouped; teForm and potential, neither of which has a polite
// counterpart, are grouped together as a trailing "other forms" group.
const CONJ_GROUP_STARTS = new Set(['past', 'negative', 'teForm']);

// The algorithmic (stem + fixed ending) breakdown always ends in a kana
// character even in kanji mode, so only the stem needs to be swapped for its
// hiragana reading. Hand-curated compound breakdowns (BREAKDOWN_BANK in
// build-cards.js) have no stored reading per chunk, so they're hidden
// rather than guessed at when kanji is off.
export function getDisplayBreakdown(card, showKanji) {
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

// Renders an example sentence as individually-tappable word tokens
// (Duolingo-style word lookup) instead of one plain string. Sentences
// without segmentation data (the learner's own, or AI-written ones) are
// shown as plain text.
export const SentenceTokens = ({ sentence, showKanji, onTokenTap, highlight }) => {
  if (!sentence.tokens && !sentence.spacedJapanese) {
    return <span class="sentence-plain">{showKanji || !sentence.hiragana ? sentence.japanese : sentence.hiragana}</span>;
  }
  return tokenizeSentence(sentence).map((tok, i) => (
    <span
      key={i}
      class={`sentence-token ${highlight && highlight(tok) ? 'is-target' : ''}`}
      onClick={onTokenTap ? (e) => { e.stopPropagation(); onTokenTap(tok); } : undefined}
    >
      {tok.lead}{showKanji ? tok.ja : tok.hi}{tok.trail}
    </span>
  ));
};

// Whether a sentence token is (a form of) the card's word, for highlighting
// the word inside its example.
export const isTokenOfCard = (card) => (tok) => {
  const forms = [card.kanji, card.hiragana, card.katakana].filter(Boolean);
  const inflects = card.partOfSpeech === 'verb' || card.partOfSpeech === 'adjective';
  return forms.includes(tok.base) || forms.includes(tok.ja) || forms.includes(tok.hi) ||
    (inflects && forms.some(f => f.length > 1 && (tok.ja || '').startsWith(f.slice(0, -1)) && tok.pos === card.partOfSpeech));
};

const POS_LABELS = { name: 'proper noun', auxiliary: 'auxiliary', adnominal: 'adnominal', filler: 'filler' };

export const WordLookupPopover = ({ lookup, showKanji, onClose }) => {
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
          {tok.pos === 'name' ? "A name, so it isn't in the dictionary" : 'No dictionary entry found'}
        </p>
      )}
      <div class="word-lookup-tags">
        {pos && <span class="pos-pill muted">{POS_LABELS[pos] || pos}</span>}
        {card && <span class="in-deck-pill">In your deck</span>}
      </div>
    </div>
  );
};

// Starters for a memory hook: tapping one adds it as a new line to fill in.
const NOTE_PROMPTS = ['Sounds like: ', 'Looks like: ', 'Loanword from: ', 'Story: '];

// Per-word personal note, shown on the card's back face. Renders as a plain
// note when saved and collapsed, or a textarea while being edited, with
// starter prompts for a mnemonic.
export const NoteSection = ({ noun = 'word', noteText, editing, onStartEdit, onChange, onDone }) => {
  const addPrompt = (prompt) => onChange(noteText.trim() ? `${noteText.trimEnd()}\n${prompt}` : prompt);
  return (
    <div class="note-section" onClick={(e) => e.stopPropagation()}>
      {editing ? (
        <>
          <textarea
            class="note-editor"
            autoFocus
            aria-label={`Your note for this ${noun}`}
            placeholder={`A memory hook for this ${noun}: what it sounds or looks like, a story, a loanword...`}
            value={noteText}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => {
              // Keep the editor open while a prompt chip is being tapped.
              if (e.relatedTarget?.closest?.('.note-prompts')) return;
              onDone();
            }}
          />
          <div class="note-prompts" role="group" aria-label="Memory hook starters">
            {NOTE_PROMPTS.map(p => (
              <button key={p} type="button" class="note-prompt" onMouseDown={(e) => e.preventDefault()} onClick={() => addPrompt(p)}>
                {p.replace(/:\s$/, '')}
              </button>
            ))}
          </div>
          <p class="note-saved-hint">Saves automatically</p>
        </>
      ) : noteText ? (
        <div class="note-display" onClick={onStartEdit}>{noteText}</div>
      ) : (
        <button class="note-toggle" onClick={onStartEdit}>
          <span class="note-dot"></span>
          Add a memory hook
        </button>
      )}
    </div>
  );
};

// KanjiVG stroke-order SVGs for a word, cached across cards.
const strokeSvgCache = new Map();
function useStrokeSvgs(paths, enabled) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || !paths) return;
    let cancelled = false;
    paths.forEach(path => {
      if (strokeSvgCache.has(path)) return;
      fetch(`/${path}`)
        .then(res => (res.ok ? res.text() : Promise.reject(new Error('missing'))))
        .then(text => {
          strokeSvgCache.set(path, text);
          if (!cancelled) setVersion(v => v + 1);
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [paths, enabled]);
  return (paths || []).map(p => strokeSvgCache.get(p) || '');
}

// Audio for the word, with a slower replay beside it.
export const WordAudio = ({ card, size = 22, className = 'btn-audio' }) => (
  <div class="word-audio-row" onClick={(e) => e.stopPropagation()}>
    <button class={className} aria-label="Play pronunciation" onClick={(e) => { e.stopPropagation(); playWord(card); }}>
      <IconSpeaker size={size} />
    </button>
    <button class="btn-audio-slow" aria-label="Play slowly" onClick={(e) => { e.stopPropagation(); playWord(card, { rate: SLOW_RATE }); }}>
      Slow
    </button>
  </div>
);

const CustomVideo = ({ id }) => {
  const url = useMediaUrl(id);
  if (!url) return null;
  return <video class="card-video" src={url} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} />;
};

// A collapsible row in the details list.
const Disclosure = ({ label, meta, open, onToggle, children }) => (
  <div class="wd-disclosure-wrap">
    <button class={`kd-disclosure ${open ? 'expanded' : ''}`} aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <span class="kd-disclosure-label">{label}</span>
      {meta && <span class="kd-disclosure-meta">{meta}</span>}
      <IconChevron dir="down" />
    </button>
    {open && <div class="wd-disclosure-body" onClick={(e) => e.stopPropagation()}>{children}</div>}
  </div>
);

// Everything about a word, in the order a learner needs it: the word, its
// meaning and a usage example together at the top, then their own memory
// hook, then the deeper grammar, with related words and the AI helper
// tucked into collapsed rows at the end.
//
//   sentences  every example available for this word (rotated per encounter)
//   related    { sharedKanji: [card], sameTopic: [card] }
//   ai         { hasKey, explanation, generate(style), explain() } or null
export const WordDetails = ({
  card, showKanji, sentences = [], encounter = 0, noteText, onNoteChange,
  wordIndex, related, onLayoutChange, onOpenWord, ai, hideHead = false
}) => {
  const [strokeShown, setStrokeShown] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [lookup, setLookup] = useState(null);
  const [sentenceOffset, setSentenceOffset] = useState(0);
  // Right after the AI writes a sentence, show it (it's last in the list).
  const [showNewest, setShowNewest] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [aiBusy, setAiBusy] = useState(null);
  const [aiError, setAiError] = useState(null);
  const svgs = useStrokeSvgs(card.strokeOrderSvgs, strokeShown);
  const displayKanji = showKanji && card.kanji;
  const breakdown = getDisplayBreakdown(card, showKanji);
  const conjugations = getDisplayConjugations(card, showKanji);
  const hiraganaConjugations = getHiraganaConjugations(card);
  const particleUsage = getDisplayParticleUsage(card, showKanji);
  const sentenceIndex = sentences.length > 0
    ? (showNewest ? sentences.length - 1 : (encounter + sentenceOffset) % sentences.length)
    : -1;
  const sentence = sentenceIndex >= 0 ? sentences[sentenceIndex] : null;
  const relatedCount = (related?.sharedKanji?.length || 0) + (related?.sameTopic?.length || 0);
  const relayout = () => { if (onLayoutChange) setTimeout(onLayoutChange, 60); };
  const toggleRow = (row) => { setOpenRow(prev => (prev === row ? null : row)); relayout(); };

  const lookupToken = (tok) => {
    const cleanJa = stripPunctuation(tok.ja);
    if (!cleanJa || !wordIndex) return;
    // Match the deck by dictionary form first (拾っ -> 拾う), then by the
    // surface spelling and its reading.
    const match = (tok.base && wordIndex.get(tok.base))
      || wordIndex.get(cleanJa)
      || wordIndex.get(stripPunctuation(tok.hi))
      || null;
    setLookup(prev => (prev && prev.tok.ja === tok.ja && prev.tok.hi === tok.hi ? null : { tok, card: match }));
    relayout();
  };

  const runAi = async (kind, style) => {
    setAiBusy(kind);
    setAiError(null);
    try {
      if (kind === 'explain') await ai.explain();
      else {
        await ai.generate(style);
        setShowNewest(true);
      }
    } catch (e) {
      setAiError(e.message || 'Something went wrong.');
    } finally {
      setAiBusy(null);
      relayout();
    }
  };

  const RelatedPills = ({ words }) => (
    <div class="kd-words">
      {words.map(w => (
        <button
          key={w.id}
          class="kd-word"
          title={onOpenWord ? 'Open word' : 'Play'}
          onClick={(e) => { e.stopPropagation(); if (onOpenWord) onOpenWord(w.id); else playWord(w); }}
        >
          <span class="kd-word-jp">{showKanji && w.kanji ? w.kanji : w.hiragana}</span>
          <span class="kd-word-en">{w.englishMeanings?.[0]}</span>
          {onOpenWord ? <IconChevron size={12} /> : <IconSpeaker size={13} />}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {!hideHead && (
        <div class="back-word-group">
          <p class="japanese-word-back">{displayKanji ? card.kanji : card.hiragana}</p>
          <p class="romaji-word">{card.romaji}</p>
          <p class="katakana-word muted">{card.katakana}</p>
          <p class="meaning">{card.englishMeanings?.join(', ')}</p>
          <span class="pos-pill muted">
            {card.partOfSpeech}
            {card.verbType ? ` (${card.verbType})` : card.isNaAdjective ? ' (na-adjective)' : ''}
          </span>
        </div>
      )}

      {sentence && (
        <div class="sentence-section">
          <div class="sentence-card">
            <div class="sentence-toolbar">
              <button class="sentence-tool" aria-label="Play sentence" onClick={(e) => { e.stopPropagation(); speak(sentence.japanese); }}>
                <IconSpeaker size={15} />
              </button>
              {sentences.length > 1 && (
                <button
                  class="sentence-tool sentence-next"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showNewest) {
                      // Continue the rotation from the newest sentence.
                      setShowNewest(false);
                      setSentenceOffset(sentences.length - encounter);
                    } else {
                      setSentenceOffset(o => o + 1);
                    }
                    setLookup(null);
                    relayout();
                  }}
                >
                  <IconRefresh width="13" height="13" />
                  Another example
                  <span class="sentence-count">{sentenceIndex + 1}/{sentences.length}</span>
                </button>
              )}
            </div>
            <p class="sentence-japanese">
              <SentenceTokens sentence={sentence} showKanji={showKanji} onTokenTap={lookupToken} highlight={isTokenOfCard(card)} />
            </p>
            {formatSentenceRomaji(sentence) && <p class="sentence-romaji muted">{formatSentenceRomaji(sentence)}</p>}
            <div class="sentence-divider"></div>
            <p class="sentence-english">{sentence.english}</p>
            {sentence.source === 'ai' && <p class="sentence-source">Written by AI</p>}
            <WordLookupPopover lookup={lookup} showKanji={showKanji} onClose={() => { setLookup(null); relayout(); }} />
          </div>
        </div>
      )}

      {card.media?.video && <CustomVideo id={card.media.video} />}

      {onNoteChange && (
        <NoteSection
          noteText={noteText || ''}
          editing={noteEditing}
          onStartEdit={() => { setNoteEditing(true); relayout(); }}
          onChange={onNoteChange}
          onDone={() => { setNoteEditing(false); relayout(); }}
        />
      )}

      {displayKanji && card.strokeOrderSvgs?.length > 0 && (
        <>
          <button
            class={`stroke-toggle ${strokeShown ? 'expanded' : ''}`}
            onClick={(e) => { e.stopPropagation(); setStrokeShown(prev => !prev); relayout(); }}
          >
            <span>{strokeShown ? 'Hide stroke order' : 'Show stroke order'}</span>
            <IconChevron dir="down" />
          </button>
          {strokeShown && (
            <div class="kanji-vg-container playing">
              {svgs.every(s => !s) && <p class="stroke-loading-hint">Loading stroke order...</p>}
              {svgs.map((svg, i) => <div key={i} dangerouslySetInnerHTML={{ __html: svg }} />)}
            </div>
          )}
        </>
      )}

      {breakdown?.length > 0 && (
        <div class="breakdown-section">
          <div class="grammar-title">Word Breakdown</div>
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
        </div>
      )}

      {conjugations && (
        <div class="grammar-section">
          <div class="grammar-title">Tense &amp; Forms</div>
          <div class="conjugation-grid">
            {CONJ_KEYS.map(k => (
              conjugations[k] ? (
                <React.Fragment key={k}>
                  <div class={`conj-label ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                  <div class={`conj-value-group ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>
                    <div class="conj-value">{conjugations[k]}</div>
                    {hiraganaConjugations?.[k] && hiraganaConjugations[k] !== conjugations[k] && (
                      <div class="conj-hiragana muted">{hiraganaConjugations[k]}</div>
                    )}
                    <div class="conj-romaji muted">{wanakana.toRomaji(hiraganaConjugations?.[k] || conjugations[k])}</div>
                  </div>
                  <div class={`conj-english muted ${CONJ_GROUP_STARTS.has(k) ? 'conj-group-start' : ''}`}>{getConjugationEnglish(card, k)}</div>
                </React.Fragment>
              ) : null
            ))}
          </div>
        </div>
      )}

      {particleUsage?.length > 0 && (
        <div class="particle-section">
          <div class="grammar-title">Common Particles</div>
          <div class="particle-list">
            {particleUsage.map((p, i) => (
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

      {(relatedCount > 0 || ai) && (
        <div class="wd-more">
          {relatedCount > 0 && (
            <Disclosure label="Related words" meta={String(relatedCount)} open={openRow === 'related'} onToggle={() => toggleRow('related')}>
              {related.sharedKanji?.length > 0 && (
                <>
                  <p class="kd-sublabel">Share a kanji</p>
                  <RelatedPills words={related.sharedKanji} />
                </>
              )}
              {related.sameTopic?.length > 0 && (
                <>
                  <p class="kd-sublabel">Same topic</p>
                  <RelatedPills words={related.sameTopic} />
                </>
              )}
            </Disclosure>
          )}

          {ai && (
            <Disclosure label="AI helper" open={openRow === 'ai'} onToggle={() => toggleRow('ai')}>
              {!ai.hasKey ? (
                <p class="wd-ai-empty">Add a Claude API key in Settings to write new example sentences and explanations for any word.</p>
              ) : (
                <>
                  <div class="wd-ai-actions">
                    <button class="wd-ai-btn" disabled={!!aiBusy} onClick={() => runAi('sentence', 'concise')}>
                      <IconSparkle />{aiBusy === 'sentence' ? 'Writing...' : 'Short example'}
                    </button>
                    <button class="wd-ai-btn" disabled={!!aiBusy} onClick={() => runAi('sentence', 'conversational')}>
                      <IconSparkle />Conversation line
                    </button>
                    <button class="wd-ai-btn" disabled={!!aiBusy} onClick={() => runAi('explain')}>
                      <IconSparkle />{aiBusy === 'explain' ? 'Thinking...' : 'Explain it'}
                    </button>
                  </div>
                  {aiError && <p class="form-error" role="alert">{aiError}</p>}
                  {ai.explanation && (
                    <div class="wd-ai-explanation">
                      <p>{ai.explanation.summary}</p>
                      {ai.explanation.nuance && <p class="muted">{ai.explanation.nuance}</p>}
                      {ai.explanation.memoryHook && (
                        <p class="wd-ai-hook">
                          <strong>Memory hook:</strong> {ai.explanation.memoryHook}
                          {onNoteChange && (
                            <button class="wd-ai-save" onClick={() => onNoteChange(noteText ? `${noteText}\n${ai.explanation.memoryHook}` : ai.explanation.memoryHook)}>
                              Save to my note
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  <p class="wd-ai-fineprint">New sentences join this word's example rotation. AI can make mistakes.</p>
                </>
              )}
            </Disclosure>
          )}
        </div>
      )}
    </>
  );
};
