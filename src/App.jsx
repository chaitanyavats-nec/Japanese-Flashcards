import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as wanakana from 'wanakana';
import packsRegistry from '../packs.json';
import {
  IconRefresh, IconSun, IconSearch, IconFlip, IconRoute, IconHome, IconBook, IconKana, IconRadical,
  IconCheckCircle, IconSpeaker, IconChevron, IconFlame, IconProfile, IconPlus, IconBolt, IconPencil, IconUndo
} from './icons';
import {
  CardImage, WordDetails, WordAudio, NoteSection, getDisplayBreakdown, hapticBuzz, isTypingTarget
} from './wordParts';
import ReviewSession, { GradeButtons, SessionSummary, SpeakCheck } from './ReviewSession';
import SettingsScreen from './SettingsScreen';
import CustomCardEditor from './CustomCardEditor';
import StatsView from './StatsView';
import { speak, playWord, canRecognizeSpeech } from './lib/speech';
import { loadJSON, saveJSON, dayKey, MINUTE } from './lib/storage';
import { schedule, isDue, wordState, describeWait, GRADES, dueAt } from './lib/srs';
import { dueCards, pickNewCards, weakestCards, buildItems, sentencesFor as cardSentences } from './lib/queue';
import { levelInfo, ACTIVITY_KEY, emptyActivity, reviewDelta, applyDelta, today as todayActivity, streakInfo, goalDaysMet, totalReviews } from './lib/activity';
import { newlyEarned } from './lib/badges';
import { loadSettings, saveSettings } from './lib/settings';
import { loadCustomCards, saveCustomCards, MY_PACK_ID, MY_PACK } from './lib/customCards';
import { deleteMedia } from './lib/media';
import { loadAiKey, saveAiKey, loadAiCache, saveAiCache, generateSentence, explainWord } from './lib/ai';
import { buildBackup, restoreBackup, backupFileName, buildAnkiExport, downloadBlob } from './lib/backup';
import {
  notificationsSupported, saveReminderState, enableBackgroundCheck, disableBackgroundCheck, showReminder, msUntil, reminderText
} from './lib/reminders';

const PACKS = { [MY_PACK_ID]: MY_PACK, ...packsRegistry };
const levelOf = (xp) => levelInfo(xp || 0).level;
// Reviews in one "Review due" session; the rest wait for "Keep going".
const MAX_DUE_PER_SESSION = 50;

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LEVEL_COLORS = {
  1: 'var(--level-1)',
  2: 'var(--level-2)',
  3: 'var(--level-3)',
  4: 'var(--level-4)'
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

// The order the footer nav and the swipe-between-tabs gesture use.
const NAV_ORDER = ['home', 'learn', 'all-words', 'kana', 'kanji'];

// Splits a JLPT level's kanji into practicable stroke-count bands, so a level
// with dozens of kanji can be drilled in smaller, still-meaningful chunks.
// Bands with nothing in them are dropped.
const STROKE_BANDS = [
  { key: '1-4', label: '1-4 strokes', test: (s) => s <= 4 },
  { key: '5-7', label: '5-7 strokes', test: (s) => s >= 5 && s <= 7 },
  { key: '8-10', label: '8-10 strokes', test: (s) => s >= 8 && s <= 10 },
  { key: '11+', label: '11+ strokes', test: (s) => s >= 11 }
];
const kanjiCategories = (list, progressMap) => STROKE_BANDS
  .map(band => ({ ...band, list: list.filter(k => band.test(k.strokes)) }))
  .filter(band => band.list.length > 0)
  .map(band => ({ ...band, knownCount: band.list.filter(k => progressMap[k.kanji] === 'know').length }));

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// A lone kanji is a poor TTS input, so speak a reading instead: the first
// standalone kun'yomi (あ.う -> あう), else the first on'yomi in hiragana.
const cleanKun = (reading) => reading.replace(/[.\-]/g, '');
const kanjiSpeechText = (k) => {
  const kun = (k.kun || []).find(r => !r.startsWith('-'));
  if (kun) return cleanKun(kun);
  if (k.on?.length > 0) return wanakana.toHiragana(k.on[0]);
  return k.kanji;
};
const speakKanji = (k) => speak(kanjiSpeechText(k), 'ja-JP');

const KanjiAudioButton = ({ kanji, className = 'btn-audio', size = 22 }) => (
  <button
    class={className}
    aria-label="Play pronunciation"
    onClick={(e) => { e.stopPropagation(); speakKanji(kanji); }}
  >
    <IconSpeaker size={size} />
  </button>
);

// KanjiVG stroke-order SVGs, cached across cards so re-opening one is instant.
const kanjiSvgCache = new Map();
function useKanjiSvg(kanji, enabled) {
  const [svg, setSvg] = useState(() => kanjiSvgCache.get(kanji) || '');
  useEffect(() => {
    if (!enabled) return;
    const cached = kanjiSvgCache.get(kanji);
    if (cached) { setSvg(cached); return; }
    let cancelled = false;
    const hex = kanji.codePointAt(0).toString(16).padStart(5, '0');
    fetch(`/kanjivg/${hex}.svg`)
      .then(res => (res.ok ? res.text() : Promise.reject(new Error('missing'))))
      .then(text => {
        // Drop the XML prolog/DOCTYPE: injected as HTML, its "]>" leaks out as visible text.
        const markup = text.slice(Math.max(text.indexOf('<svg'), 0));
        kanjiSvgCache.set(kanji, markup);
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [kanji, enabled]);
  return svg;
}

// Lookups over the whole kanji dataset, used by the peek sheet to describe any
// character or radical the learner taps without leaving the lesson:
//   byChar   kanji character -> its dataset entry
//   radicals radical number  -> { char, meaning, num, forms }
//   usedIn   character or `r<num>` -> the kanji that contain it as a part
function buildKanjiIndex(map) {
  const byChar = new Map();
  const radicals = new Map();
  const usedIn = new Map();
  const add = (key, k) => {
    const list = usedIn.get(key);
    if (!list) usedIn.set(key, [k]);
    else if (!list.includes(k)) list.push(k);
  };
  const walk = (nodes, k) => nodes.forEach(n => {
    add(n.char, k);
    if (n.drawn) add(n.drawn, k);
    if (n.radical) add(`r${n.radical}`, k);
    if (n.children) walk(n.children, k);
  });
  for (const group of map.groups) {
    for (const k of group.kanji) {
      byChar.set(k.kanji, k);
      for (const r of k.radicals || []) {
        if (!radicals.has(r.num)) radicals.set(r.num, { char: r.char, meaning: r.meaning, num: r.num, forms: r.forms || [] });
        add(`r${r.num}`, k);
      }
      if (k.parts) walk(k.parts, k);
    }
  }
  return { byChar, radicals, usedIn };
}

const strokeCount = (n) => `${n} ${n === 1 ? 'stroke' : 'strokes'}`;

const treeHasRadical = (nodes, num) => nodes.some(n => n.radical === num || (n.children && treeHasRadical(n.children, num)));

// Normal form and the shape(s) a radical takes when it is a part of another kanji.
const RadicalForms = ({ radical }) => (
  <div class="kd-forms">
    <span class="kd-form">
      <span class="kd-form-label">Normal</span>
      <span class="kd-form-char">{radical.char}</span>
    </span>
    <span class="kd-form">
      <span class="kd-form-label">As a part</span>
      {radical.forms.length > 0
        ? radical.forms.map(f => <span class="kd-form-char" key={f}>{f}</span>)
        : <><span class="kd-form-char">{radical.char}</span><span class="kd-form-note">unchanged</span></>}
    </span>
  </div>
);

const KanjiReadings = ({ k }) => {
  const rows = [
    { label: "On'yomi", list: k.on, say: (r) => wanakana.toHiragana(r) },
    { label: "Kun'yomi", list: k.kun, say: cleanKun }
  ].filter(row => row.list?.length > 0);
  if (rows.length === 0) return null;
  return (
    <div class="kd-readings">
      {rows.map(row => (
        <div class="kd-reading-row" key={row.label}>
          <span class="kd-reading-label">{row.label}</span>
          <span class="kd-reading-chips">
            {row.list.map((r, i) => (
              <button key={i} class="reading-chip" title="Play" onClick={(e) => { e.stopPropagation(); speak(row.say(r), 'ja-JP'); }}>{r}</button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
};

// Deck words containing a kanji, as pills (same affordance as the reading
// chips above them: tap to hear it). With `onOpenWord` a pill opens the word
// card instead; without it (mid-lesson) it just plays so the lesson isn't left.
const KanjiWords = ({ words, onOpenWord }) => (
  <div class="kd-words">
    {words.map(w => (
      <button
        key={w.id}
        class="kd-word"
        title={onOpenWord ? 'Open word' : 'Play'}
        onClick={(e) => { e.stopPropagation(); if (onOpenWord) onOpenWord(w.id); else speak(w.kanji, 'ja-JP'); }}
      >
        <span class="kd-word-jp">{w.kanji}</span>
        <span class="kd-word-en">{w.meaning}</span>
        {onOpenWord ? <IconChevron size={12} /> : <IconSpeaker size={13} />}
      </button>
    ))}
  </div>
);

// One row of the structure tree: the part as it is drawn in the kanji, what it
// means, and whether it is a radical. Radicals are tinted, so the radical list
// and the component breakdown are the same picture. Parts nest beneath the part
// they belong to. Tapping a row opens the peek sheet for it.
const PartNode = ({ node, mainNum, onPeek }) => {
  const isRadical = !!node.radical;
  const shape = node.drawn || node.char;
  let sub = null;
  if (isRadical) {
    sub = node.radical === mainNum ? 'Main radical' : 'Radical';
    if (node.drawn) sub += `, form of ${node.char}`;
  }
  const title = node.meaning || 'Component';
  const content = (
    <>
      <span class={`kd-glyph ${isRadical ? 'is-radical' : ''}`}>{shape}</span>
      <span class="kd-node-text">
        <span class="kd-node-title">{title}</span>
        {sub && <span class="kd-node-sub">{sub}</span>}
      </span>
      {onPeek && <span class="kd-node-chevron"><IconChevron /></span>}
    </>
  );
  return (
    <li class="kd-item">
      {onPeek ? (
        <button class="kd-node" aria-label={`${title}, ${shape}. Show details`} onClick={(e) => { e.stopPropagation(); onPeek(node); }}>{content}</button>
      ) : (
        <div class="kd-node">{content}</div>
      )}
      {node.children && (
        <ul class="kd-tree kd-tree-nested">
          {node.children.map((child, i) => <PartNode key={i} node={child} mainNum={mainNum} onPeek={onPeek} />)}
        </ul>
      )}
    </li>
  );
};

// What a kanji is built from, in one place: whether it is itself a radical (with
// its normal and component forms), then the tree of parts with radicals marked.
// A kanji that is a radical with nothing inside gets an explanation instead of
// an empty list; one that isn't a radical gets its dictionary radical named.
const StructureSection = ({ k, onPeek }) => {
  const parts = k.parts || [];
  const asRadical = k.asRadical;
  const main = k.radicals?.find(r => r.main);
  const showMain = main && !treeHasRadical(parts, main.num) && !(asRadical && asRadical.num === main.num);
  return (
    <section class="kd-section">
      <h3 class="kd-label">Structure</h3>
      {asRadical && (
        <div class="kd-identity">
          <p class="kd-identity-title">
            <strong>{k.kanji === asRadical.char ? `Radical ${asRadical.num}` : `A shape of radical ${asRadical.num}`}</strong>
            <span>{asRadical.meaning}</span>
          </p>
          {parts.length === 0 && <p class="kd-identity-note">A basic building block, with nothing smaller inside.</p>}
          <RadicalForms radical={asRadical} />
        </div>
      )}
      {parts.length > 0 && (
        <ul class="kd-tree">
          {parts.map((node, i) => <PartNode key={i} node={node} mainNum={main?.num} onPeek={onPeek} />)}
        </ul>
      )}
      {parts.length === 0 && !asRadical && <p class="kd-empty">One piece. There is nothing smaller to break down.</p>}
      {showMain && (
        <>
          <p class="kd-sublabel">Filed under</p>
          <ul class="kd-tree">
            <PartNode node={{ char: main.char, radical: main.num, meaning: main.meaning }} mainNum={main.num} onPeek={onPeek} />
          </ul>
        </>
      )}
    </section>
  );
};

// The headline shared by the popup and the practice card's back: the character
// first, its meaning right under it, then the play button.
// KANJIDIC glosses radicals as "one radical (no.1)"; the Structure section
// already says that, so it is dropped from the headline.
const kanjiMeanings = (k) => (k.meanings || []).filter(m => !/radical \(no\.\d+\)/i.test(m));

const KanjiHead = ({ k }) => {
  const meanings = kanjiMeanings(k);
  return (
    <div class="kd-head">
      <p class="kd-char">{k.kanji}</p>
      {meanings.length > 0 && <p class="kd-meaning">{meanings.join(', ')}</p>}
      <KanjiAudioButton kanji={k} size={18} className="btn-audio kd-audio" />
    </div>
  );
};

// Everything below the headline, ordered by how much a learner needs it:
// readings, structure, deck words, then the quieter tools (stroke order, note)
// and last the JLPT level and school grade as fine print.
const KanjiDetailBody = ({ k, noteText, onNoteChange, onPeek, onOpenWord, onLayoutChange }) => {
  const [strokeShown, setStrokeShown] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const svg = useKanjiSvg(k.kanji, strokeShown);
  const fineprint = [k.jlpt != null && `JLPT ${jlptLabel(k.jlpt)}`, k.grade != null && `Grade ${k.grade}`].filter(Boolean).join(', ');

  return (
    <div class="kd-body">
      <KanjiReadings k={k} />
      <StructureSection k={k} onPeek={onPeek} />

      {k.words?.length > 0 && (
        <section class="kd-section">
          <h3 class="kd-label">In your words</h3>
          <KanjiWords words={k.words} onOpenWord={onOpenWord} />
        </section>
      )}

      <div class="kd-tools">
        <button
          class={`kd-disclosure ${strokeShown ? 'expanded' : ''}`}
          aria-expanded={strokeShown}
          onClick={(e) => {
            e.stopPropagation();
            setStrokeShown(prev => !prev);
            if (onLayoutChange) setTimeout(onLayoutChange, 60);
          }}
        >
          <span class="kd-disclosure-label">Stroke order</span>
          {k.strokes != null && <span class="kd-disclosure-meta">{strokeCount(k.strokes)}</span>}
          <IconChevron dir="down" />
        </button>
        {strokeShown && (
          <div class="kanji-vg-container playing">
            {!svg && <p class="stroke-loading-hint">Loading stroke order…</p>}
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        )}
        <NoteSection
          noun="kanji"
          noteText={noteText}
          editing={noteEditing}
          onStartEdit={() => setNoteEditing(true)}
          onChange={onNoteChange}
          onDone={() => setNoteEditing(false)}
        />
      </div>

      {fineprint && <p class="kd-fineprint">{fineprint}</p>}
    </div>
  );
};

const PeekChip = ({ char, meaning, radical, onClick }) => (
  <button class={`peek-chip ${radical ? 'is-radical' : ''}`} onClick={onClick}>
    <span class="peek-chip-char">{char}</span>
    {meaning && <span class="peek-chip-meaning">{meaning}</span>}
  </button>
);

const PEEK_EXAMPLE_LIMIT = 18;
// Easier JLPT levels first (old scale: 4 is easiest), unlisted last.
const jlptRank = (k) => (k.jlpt == null ? 9 : 5 - k.jlpt);

// A bottom sheet that explains any kanji, radical or part the learner taps in a
// lesson: its forms, readings, what it is made of and examples of kanji that
// use it. It sits above the card, so closing it drops straight back into the
// lesson; tapping an example pushes onto a small history so Back retraces it.
const KanjiPeek = ({ stack, index, inLesson, onPush, onPop, onClose, onOpenRadicalMap }) => {
  const target = stack[stack.length - 1];
  const sheetRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [target]);

  const kanji = index.byChar.get(target.char) || null;
  const radNum = target.radical || kanji?.asRadical?.num;
  const radical = radNum ? (index.radicals.get(radNum) || kanji?.asRadical || null) : null;
  const meaning = (kanji && kanjiMeanings(kanji).join(', ')) || target.meaning || radical?.meaning || '';
  const subs = [];
  if (radical) subs.push(`Radical ${radical.num}`);
  if (kanji?.strokes != null) subs.push(strokeCount(kanji.strokes));
  const examples = (index.usedIn.get(radical ? `r${radical.num}` : target.char) || [])
    .filter(k => k.kanji !== target.char)
    .sort((a, b) => jlptRank(a) - jlptRank(b) || (a.strokes || 0) - (b.strokes || 0));
  const shown = examples.slice(0, PEEK_EXAMPLE_LIMIT);
  const peekTo = (char) => onPush({ char });

  return (
    <div class="peek-backdrop" onClick={onClose}>
      <div class="peek-sheet" role="dialog" aria-label={`About ${target.char}`} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div class="peek-bar">
          {stack.length > 1 ? (
            <button class="peek-back" onClick={onPop} aria-label="Back">
              <IconChevron dir="left" />
              <span class="peek-back-char">{stack[stack.length - 2].char}</span>
            </button>
          ) : <span></span>}
          <button class="modal-close-btn" title="Close (Esc)" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div class="peek-head">
          <p class="peek-char">{target.char}</p>
          <div class="peek-titles">
            {meaning && <p class="peek-meaning">{meaning}</p>}
            {subs.length > 0 && <p class="peek-sub">{subs.join(', ')}</p>}
          </div>
          {kanji && <KanjiAudioButton kanji={kanji} size={18} className="btn-audio kd-audio" />}
        </div>

        <div class="kd-body">
          {kanji && <KanjiReadings k={kanji} />}
          {radical && <div class="kd-identity"><RadicalForms radical={radical} /></div>}

          {kanji?.parts?.length > 0 && (
            <section class="kd-section">
              <h3 class="kd-label">Made of</h3>
              <div class="peek-chips">
                {kanji.parts.map((p, i) => (
                  <PeekChip key={i} char={p.drawn || p.char} meaning={p.meaning} radical={!!p.radical} onClick={() => onPush(p)} />
                ))}
              </div>
            </section>
          )}

          {shown.length > 0 && (
            <section class="kd-section">
              <h3 class="kd-label">{radical ? 'Kanji with this radical' : 'Kanji using this part'}</h3>
              <div class="peek-chips">
                {shown.map(k => (
                  <PeekChip key={k.kanji} char={k.kanji} meaning={k.meanings?.[0]} onClick={() => peekTo(k.kanji)} />
                ))}
              </div>
              {examples.length > shown.length && (
                <p class="kd-fineprint">and {examples.length - shown.length} more</p>
              )}
            </section>
          )}

          {kanji?.words?.length > 0 && (
            <section class="kd-section">
              <h3 class="kd-label">In your words</h3>
              <KanjiWords words={kanji.words.slice(0, 4)} />
            </section>
          )}

          {radical && onOpenRadicalMap && (
            <button class="peek-link" onClick={() => onOpenRadicalMap(radical)}>
              {inLesson ? 'Leave the lesson and browse this radical' : 'Browse this radical in the map'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const KANJI_SWIPE_COMMIT_DISTANCE = 90;

// A flip-and-swipe session over one batch of kanji, built on the same card,
// gestures and controls as the word flashcards: tap to flip, swipe right for
// "know it" / left for "don't know", Previous/Next to revisit cards.
const KanjiPractice = ({ title, kanji, notes, paused, onNoteChange, onJudge, onPeek, onClose }) => {
  const [deck, setDeck] = useState(() => shuffled(kanji));
  const [index, setIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [verdicts, setVerdicts] = useState({});
  const [flipped, setFlipped] = useState(false);
  const [swipe, setSwipe] = useState({ know: 0, dont: 0 });
  const [hasScrollFade, setHasScrollFade] = useState(false);

  const cardRef = useRef(null);
  const innerRef = useRef(null);
  const scrollRef = useRef(null);
  const enterAnim = useRef('slide');
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, isDragging: false, wasDragged: false, dragX: 0, thresholdBuzzed: false });

  const done = index >= deck.length;
  const current = deck[index];
  const knownList = deck.filter(k => verdicts[k.kanji] === 'know');
  const missedList = deck.filter(k => verdicts[k.kanji] === 'dont');

  const checkScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasScrollFade(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }, []);

  // Each new card mounts face-up with its entrance animation, without the
  // flip transition visibly playing back.
  useEffect(() => {
    setSwipe({ know: 0, dont: 0 });
    if (innerRef.current) innerRef.current.style.transition = 'none';
    setFlipped(false);
    const card = cardRef.current;
    if (card) {
      card.style.transition = 'none';
      card.style.transform = '';
      card.style.opacity = '1';
      card.style.animation = 'none';
      void card.offsetWidth;
      const anim = enterAnim.current;
      card.style.animation = anim === 'back-right'
        ? 'slideBackInRight 380ms cubic-bezier(0.16, 0.6, 0.3, 1) forwards'
        : anim === 'back-left'
          ? 'slideBackInLeft 380ms cubic-bezier(0.16, 0.6, 0.3, 1) forwards'
          : 'slideUp 550ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
      enterAnim.current = 'slide';
    }
    const raf = requestAnimationFrame(() => {
      if (innerRef.current) innerRef.current.style.transition = '';
    });
    checkScrollFade();
    return () => cancelAnimationFrame(raf);
  }, [index, deck, checkScrollFade]);

  const advance = useCallback((verdict) => {
    if (!current) return;
    onJudge(current, verdict);
    setVerdicts(prev => ({ ...prev, [current.kanji]: verdict }));
    setSwipe({ know: 0, dont: 0 });
    setMaxIndex(m => Math.max(m, index + 1));
    setIndex(index + 1);
  }, [current, index, onJudge]);

  const judge = useCallback((verdict) => {
    hapticBuzz(verdict === 'know' ? 18 : [12, 30, 12]);
    const card = cardRef.current;
    if (!card) { advance(verdict); return; }
    const exitX = verdict === 'know' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
    setSwipe({ know: verdict === 'know' ? 1 : 0, dont: verdict === 'dont' ? 1 : 0 });
    card.style.transition = 'transform 320ms ease-out, opacity 320ms ease-out';
    card.style.transform = `translateX(${exitX}px) rotate(${verdict === 'know' ? 22 : -22}deg) scale(0.94)`;
    card.style.opacity = '0';
    setTimeout(() => advance(verdict), 320);
  }, [advance]);

  const goPrevious = () => {
    if (index === 0) return;
    enterAnim.current = verdicts[deck[index - 1].kanji] === 'dont' ? 'back-left' : 'back-right';
    setIndex(index - 1);
  };
  const goNext = () => {
    if (index >= maxIndex) return;
    setIndex(index + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (paused) return; // the peek sheet owns the keyboard while it is open
      if (e.key === 'Escape') { onClose(); return; }
      if (done || isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') judge('know');
      if (e.key === 'ArrowLeft') judge('dont');
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, paused, judge, onClose]);

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.tagName === 'A') return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTime: Date.now(), isDragging: true, wasDragged: false, dragX: 0, thresholdBuzzed: false };
    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
      cardRef.current.style.animation = 'none';
    }
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    const card = cardRef.current;
    if (!drag.isDragging || !card) return;
    const dragX = e.clientX - drag.startX;
    const dragY = e.clientY - drag.startY;
    drag.dragX = dragX;
    if (Math.abs(dragX) > 8 || Math.abs(dragY) > 8) drag.wasDragged = true;
    if (Math.abs(dragX) > Math.abs(dragY) && Math.abs(dragX) > 10) {
      try {
        if (!card.hasPointerCapture(e.pointerId)) card.setPointerCapture(e.pointerId);
      } catch { /* pointer already gone */ }
    }
    card.style.transform = `translateX(${dragX}px) rotate(${(dragX / card.offsetWidth) * 15}deg)`;

    const pastCommit = Math.abs(dragX) > KANJI_SWIPE_COMMIT_DISTANCE;
    if (pastCommit && !drag.thresholdBuzzed) {
      drag.thresholdBuzzed = true;
      hapticBuzz(10);
    } else if (!pastCommit) {
      drag.thresholdBuzzed = false;
    }

    const opacity = Math.min(Math.abs(dragX) / 100, 1);
    if (dragX > 20) setSwipe({ know: opacity, dont: 0 });
    else if (dragX < -20) setSwipe({ know: 0, dont: opacity });
    else setSwipe({ know: 0, dont: 0 });
  };

  const handlePointerUp = (e) => {
    const drag = dragRef.current;
    const card = cardRef.current;
    if (!drag.isDragging || !card) return;
    drag.isDragging = false;
    try { card.releasePointerCapture(e.pointerId); } catch { /* pointer already gone */ }

    const velocity = drag.dragX / Math.max(Date.now() - drag.startTime, 1);
    if (Math.abs(drag.dragX) > KANJI_SWIPE_COMMIT_DISTANCE || Math.abs(velocity) > 0.4) {
      judge(drag.dragX > 0 ? 'know' : 'dont');
    } else {
      card.style.transition = 'transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      card.style.transform = 'translateX(0) rotate(0deg)';
      setSwipe({ know: 0, dont: 0 });
    }
  };

  const restart = (list) => {
    setDeck(shuffled(list));
    setIndex(0);
    setMaxIndex(0);
    setVerdicts({});
    enterAnim.current = 'slide';
  };

  if (done) {
    return (
      <div class="kanji-practice" role="dialog" aria-label={`Kanji practice: ${title}`}>
        <div id="summary">
          <div class="summary-badge"><IconCheckCircle /></div>
          <h2>Session Complete!</h2>
          <div class="summary-stats">
            <span id="known-count">{knownList.length} ✓</span>
            <span id="unknown-count">{missedList.length} ✗</span>
          </div>
          <div id="missed-thumbnails">
            {missedList.map(k => <div key={k.kanji} class="missed-thumb">{k.kanji}</div>)}
          </div>
          <button id="btn-review-missed" class="icon-text-btn" disabled={missedList.length === 0} onClick={() => restart(missedList)}>
            Review Missed
          </button>
          <button id="btn-new-session" class="icon-text-btn" onClick={() => restart(kanji)}>New Session</button>
          <button id="btn-summary-home" class="icon-text-btn outline-btn" onClick={onClose}>Back to Kanji</button>
        </div>
      </div>
    );
  }

  return (
    <div class="kanji-practice" role="dialog" aria-label={`Kanji practice: ${title}`}>
      <div id="progress-bar-track">
        <div id="progress-bar-fill" style={{ width: `${(index / deck.length) * 100}%` }}></div>
      </div>
      <div id="arena-header">
        <button id="btn-back-home" onClick={onClose} aria-label="Back to kanji">← Back</button>
        <p id="progress-label">
          {title} · {index + 1} of {deck.length}
          {index === deck.length - 1 && <span class="last-card-badge">Last card</span>}
        </p>
        <span class="arena-header-spacer" aria-hidden="true"></span>
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
            setFlipped(f => !f);
          }}
        >
          <div id="card-inner" ref={innerRef} class={flipped ? 'flipped' : ''}>
            <div class="card-face" id="card-front">
              <div class="card-body">
                <div class="word-group">
                  <p class="kanji-card-char">{current.kanji}</p>
                </div>
                <KanjiAudioButton kanji={current} />
                <p class="tap-hint muted">Tap to reveal</p>
              </div>
            </div>

            <div class="card-face" id="card-back">
              <div class="card-scrollable" ref={scrollRef} onScroll={checkScrollFade}>
                <div class="card-topbar">
                  <span class="card-counter-back muted">{index + 1} / {deck.length}</span>
                </div>
                <KanjiHead k={current} />
                <KanjiDetailBody
                  key={current.kanji}
                  k={current}
                  noteText={notes[`kanji:${current.kanji}`] || ''}
                  onNoteChange={(val) => onNoteChange(current.kanji, val)}
                  onPeek={onPeek}
                  onLayoutChange={checkScrollFade}
                />
                <div class="scroll-spacer"></div>
                <div class={`scroll-fade ${hasScrollFade ? 'visible' : ''}`}></div>
              </div>

              <div class="action-buttons">
                <button class="btn-dont-know" onClick={(e) => { e.stopPropagation(); judge('dont'); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  Don't know
                </button>
                <button class="btn-know" onClick={(e) => { e.stopPropagation(); judge('know'); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Know it
                </button>
              </div>
            </div>
          </div>

          <div class="swipe-tint swipe-tint-know" style={{ opacity: swipe.know * 0.55 }}></div>
          <div class="swipe-tint swipe-tint-dont" style={{ opacity: swipe.dont * 0.55 }}></div>
          <div class="swipe-label swipe-know" style={{ opacity: swipe.know, transform: `scale(${0.7 + swipe.know * 0.3}) rotate(-8deg)` }}>
            <IconCheckCircle width="20" height="20" />
            Know it
          </div>
          <div class="swipe-label swipe-dont" style={{ opacity: swipe.dont, transform: `scale(${0.7 + swipe.dont * 0.3}) rotate(8deg)` }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Don't know
          </div>
        </div>
      </div>

      <div class="arena-bottom-nav">
        <button class="arena-nav-btn" onClick={goPrevious} disabled={index === 0} aria-label="Previous card">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Previous
        </button>
        <button class="arena-nav-btn" onClick={goNext} disabled={index >= maxIndex} aria-label="Next card">
          Next
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
  );
};

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
            <button class="wotd-audio" aria-label="Play pronunciation" onClick={() => playWord(card)}>
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
  const [baseCards, setBaseCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // App state
  const [screen, setScreen] = useState('home'); // 'home' | 'arena' | 'summary'
  const [homeView, setHomeView] = useState('home'); // 'home' | 'learn' | 'all-words' | 'kana' | 'kanji' | 'stats'
  const [showKanji, setShowKanji] = useState(() => {
    const saved = localStorage.getItem('flashcards_show_kanji');
    return saved !== null ? saved === 'true' : true;
  });
  const [progress, setProgress] = useState(() => loadJSON('flashcards_progress', {}));
  const [notes, setNotes] = useState(() => loadJSON('flashcards_notes', {}));
  const [settings, setSettings] = useState(loadSettings);
  const [activity, setActivity] = useState(() => ({ ...emptyActivity(), ...loadJSON(ACTIVITY_KEY, {}) }));
  const [customCards, setCustomCards] = useState(loadCustomCards);
  const [aiKey, setAiKey] = useState(loadAiKey);
  const [aiCache, setAiCache] = useState(loadAiCache);
  const [reviewSession, setReviewSession] = useState(null); // { key, title, items, scope }
  const [profileTab, setProfileTab] = useState(null); // null (closed) | 'stats' | 'settings'
  const [editing, setEditing] = useState(null); // null | { card } (card null = new)
  const [toasts, setToasts] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [reminderNote, setReminderNote] = useState(null);

  // The learner's own cards come first so a word just added is easy to find.
  const allCards = useMemo(() => [...customCards, ...baseCards], [customCards, baseCards]);

  // Refs mirror the latest progress/activity so grading and undo (which can
  // run several times before React re-renders) always build on fresh state.
  const progressRef = useRef(progress);
  const activityRef = useRef(activity);
  progressRef.current = progress;
  activityRef.current = activity;

  // A clock that ticks each minute, so due counts include words whose
  // relearning delay has just passed.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const iv = setInterval(tick, MINUTE);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const showToast = useCallback((message, { action, duration = 3500 } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t.slice(-2), { id, message, action }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => { saveJSON(ACTIVITY_KEY, activity); }, [activity]);

  useEffect(() => {
    if (!profileTab) return;
    const onKey = (e) => { if (e.key === 'Escape') setProfileTab(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileTab]);

  // Grades a word: schedules its next review and records the day's activity.
  // Returns a token that undoGrade takes to put everything back.
  const gradeCard = useCallback((card, grade, { countActivity = true } = {}) => {
    const before = progressRef.current[card.id];
    const after = schedule(before, grade);
    const nextProgress = { ...progressRef.current, [card.id]: after };
    progressRef.current = nextProgress;
    setProgress(nextProgress);
    saveJSON('flashcards_progress', nextProgress);
    let delta = null;
    if (countActivity) {
      delta = reviewDelta(grade, { isNew: !before });
      const prevActivity = activityRef.current;
      const nextActivity = applyDelta(prevActivity, delta);
      activityRef.current = nextActivity;
      setActivity(nextActivity);
      const goal = settings.dailyGoal;
      if (todayActivity(prevActivity).reviews < goal && todayActivity(nextActivity).reviews >= goal) {
        showToast(`Daily goal reached: ${goal} reviews. Nice work.`);
      }
    }
    return { cardId: card.id, before, after, delta };
  }, [settings.dailyGoal, showToast]);

  const undoGrade = useCallback((token) => {
    if (!token) return;
    const nextProgress = { ...progressRef.current };
    if (token.before) nextProgress[token.cardId] = token.before;
    else delete nextProgress[token.cardId];
    progressRef.current = nextProgress;
    setProgress(nextProgress);
    saveJSON('flashcards_progress', nextProgress);
    if (token.delta) {
      const nextActivity = applyDelta(activityRef.current, token.delta, -1);
      activityRef.current = nextActivity;
      setActivity(nextActivity);
    }
  }, []);

  // Splash screen: stays up for a minimum duration so it never just flickers
  // on a fast connection, then fades once the dataset has also finished loading.
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [splashRemoved, setSplashRemoved] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 900);
    return () => clearTimeout(t);
  }, []);

  // Flip-card session state ("Flip through all" on a collection)
  const [deck, setDeck] = useState([]);
  const [remaining, setRemaining] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState([]); // [{ index, grade, token }]
  const [maxIndexReached, setMaxIndexReached] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  // How many times each word had been reviewed when the session started, so
  // its example sentence rotates per session but stays put within one.
  const sessionEncounters = useRef({});

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

  // Expandable card actions
  const [expandedCardKey, setExpandedCardKey] = useState(null);

  // Kanji radical map (Kanji tab)
  const [radicalMap, setRadicalMap] = useState(null);
  const [radicalMapError, setRadicalMapError] = useState(null);
  const [kanjiSearchTerm, setKanjiSearchTerm] = useState('');
  const [expandedRadical, setExpandedRadical] = useState(null); // radicalNum currently branched open
  const [selectedKanji, setSelectedKanji] = useState(null); // { kanji, ...info } for the detail popover
  const [kanjiMode, setKanjiMode] = useState('map'); // 'map' | 'practice'
  const [expandedPracticeLevel, setExpandedPracticeLevel] = useState(null); // JLPT level key with its stroke categories open
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
    // Kanji practice counts toward the day's reviews, streak and XP too.
    const nextActivity = applyDelta(activityRef.current, reviewDelta(verdict === 'know' ? GRADES.GOOD : GRADES.AGAIN));
    activityRef.current = nextActivity;
    setActivity(nextActivity);
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

  // Kanji notes share the word-notes store, keyed "kanji:<char>" so they can't
  // collide with word ids.
  const saveKanjiNote = (kanji, text) => saveNote(`kanji:${kanji}`, text);

  // The list the detail popup was opened from, so it can step prev/next through it.
  const [kanjiNavList, setKanjiNavList] = useState([]);
  const kanjiNavIndex = selectedKanji ? kanjiNavList.findIndex(k => k.kanji === selectedKanji.kanji) : -1;
  const openKanji = (k, list) => {
    setKanjiNavList(list);
    setSelectedKanji(k);
  };
  const stepSelectedKanji = (dir) => {
    if (kanjiNavIndex < 0 || kanjiNavList.length < 2) return;
    setSelectedKanji(kanjiNavList[(kanjiNavIndex + dir + kanjiNavList.length) % kanjiNavList.length]);
  };

  // Tapping a kanji, radical or part opens a peek sheet over the current card or
  // popup instead of navigating away. `peekStack` is its small back history.
  const kanjiIndex = useMemo(() => (radicalMap ? buildKanjiIndex(radicalMap) : null), [radicalMap]);
  const [peekStack, setPeekStack] = useState([]);
  const openPeek = useCallback((target) => setPeekStack([target]), []);
  const pushPeek = useCallback((target) => setPeekStack(s => [...s, target]), []);
  const popPeek = useCallback(() => setPeekStack(s => s.slice(0, -1)), []);
  const closePeek = useCallback(() => setPeekStack([]), []);

  // Open the Radical map on a given radical's branch (from the peek sheet).
  const openRadicalBranch = (radical) => {
    setPeekStack([]);
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
        setBaseCards(data);
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

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Flip through a whole collection with the swipe cards. Swipes and grade
  // buttons are real reviews: each one schedules the word.
  const startSession = (cardsArray) => {
    if (!cardsArray || cardsArray.length === 0) return;
    const encounters = {};
    cardsArray.forEach(c => { encounters[c.id] = progressRef.current[c.id]?.timesReviewed || 0; });
    sessionEncounters.current = encounters;
    setDeck(cardsArray);
    setRemaining(shuffle(cardsArray));
    setHistory([]);
    setMaxIndexReached(0);
    setCurrentIndex(0);
    setIsFlipped(false);
    setScreen('arena');
  };

  const currentCard = remaining[currentIndex];

  // Check scroll container overflow
  const checkScrollFade = useCallback(() => {
    if (!scrollableRef.current) return;
    const el = scrollableRef.current;
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 12;
    setHasScrollFade(hasMore);
  }, []);

  useEffect(() => {
    setSwipeOverlay({ know: 0, dont: 0 });

    // Prevent the front/back flip transition from visibly animating when a
    // brand-new card mounts already facing front. Without disabling it here,
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

  // Speak the word as it's revealed, when that's switched on.
  useEffect(() => {
    if (isFlipped && settings.autoplay && screen === 'arena' && currentCard) playWord(currentCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped]);

  const advanceDeck = useCallback((grade) => {
    if (!currentCard) return;
    // Re-grading a card after stepping back replaces its earlier grade.
    const existing = history.findIndex(h => h.index === currentIndex);
    if (existing !== -1) undoGrade(history[existing].token);
    const token = gradeCard(currentCard, grade);
    setHistory(prev => (existing !== -1
      ? prev.map((h, i) => (i === existing ? { index: currentIndex, grade, token } : h))
      : [...prev, { index: currentIndex, grade, token }]));

    // Reset synchronously (same batch as the index change) rather than
    // waiting for the [currentIndex] effect, otherwise the next card can
    // paint one frame with the outgoing card's swipe tint still applied.
    setSwipeOverlay({ know: 0, dont: 0 });

    if (currentIndex + 1 >= remaining.length) {
      setScreen('summary');
    } else {
      const nextIndex = currentIndex + 1;
      setMaxIndexReached(prev => Math.max(prev, nextIndex));
      setCurrentIndex(nextIndex);
    }
  }, [currentCard, currentIndex, remaining.length, history, gradeCard, undoGrade]);

  // At the newest card, stepping back undoes the last grade (its schedule and
  // the day's tally are put back as they were).
  const atFrontier = history.length > 0 && currentIndex === history.length;

  // Navigate to the previous card. If the current card is a fresh, unjudged
  // one right after the last judgement, stepping back also undoes that grade.
  const goToPreviousCard = useCallback(() => {
    if (currentIndex === 0) return;
    const newIndex = currentIndex - 1;

    // Re-enter from whichever side this card originally exited toward, so
    // it looks like it's flying back in off-screen onto the top of the stack.
    const step = history.find(h => h.index === newIndex);
    cardEnterAnimRef.current = step && step.grade === GRADES.AGAIN ? 'back-left' : 'back-right';

    if (currentIndex === history.length && history.length > 0) {
      const last = history[history.length - 1];
      undoGrade(last.token);
      setHistory(prev => prev.slice(0, -1));
    }
    setCurrentIndex(newIndex);
  }, [currentIndex, history, undoGrade]);

  // Navigate forward again without re-judging, only through cards already visited.
  const goToNextCard = useCallback(() => {
    if (currentIndex >= maxIndexReached) return;
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex, maxIndexReached]);

  // grade: 1-4 (Again / Hard / Good / Easy). Swipes are Again and Good.
  const judgeCard = useCallback((grade) => {
    const knew = grade >= GRADES.HARD;
    hapticBuzz(knew ? 18 : [12, 30, 12]);

    if (!cardRef.current) {
      advanceDeck(grade);
      return;
    }
    const exitX = knew ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
    const rot = knew ? 22 : -22;
    setSwipeOverlay({ know: knew ? 1 : 0, dont: knew ? 0 : 1 });

    cardRef.current.style.transition = 'transform 320ms ease-out, opacity 320ms ease-out';
    cardRef.current.style.transform = `translateX(${exitX}px) rotate(${rot}deg) scale(0.94)`;
    cardRef.current.style.opacity = '0';

    setTimeout(() => {
      advanceDeck(grade);
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
      if (statusFilter === 'due' && !isDue(progress[card.id], now)) return false;
      if (tierFilter !== 'all' && card.tier !== Number(tierFilter)) return false;
      if (selectedPackId !== 'all' && !(card.packs || []).includes(selectedPackId)) return false;
      return true;
    });
  }, [allCards, searchTerm, statusFilter, tierFilter, selectedPackId, progress, now]);

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
      setModalCardIndex(idx);
    }
  };

  const modalCard = modalCardIndex !== null ? filteredCards[modalCardIndex] : null;
  // Which example the popup opens on: the one this word's next review would
  // show, fixed while the popup is open so marking it doesn't swap it.
  const modalEncounter = useMemo(
    () => (modalCard ? progressRef.current[modalCard.id]?.timesReviewed || 0 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modalCard?.id]
  );

  // Reset modal state when modalCard changes
  useEffect(() => {
    setModalIsFlipped(false);
  }, [modalCardIndex]);

  // Modal keyboard navigation & escape key
  useEffect(() => {
    if (modalCardIndex === null || editing) return;
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
  }, [modalCardIndex, filteredCards.length, editing]);

  // Kanji detail popup: close on Escape, step through the list with the arrow keys
  useEffect(() => {
    if (!selectedKanji || peekStack.length > 0) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setSelectedKanji(null); return; }
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') stepSelectedKanji(1);
      if (e.key === 'ArrowLeft') stepSelectedKanji(-1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKanji, kanjiNavList, peekStack.length]);

  // Keyboard navigation for arena
  useEffect(() => {
    if (screen !== 'arena') return;
    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') judgeCard(GRADES.GOOD);
      if (e.key === 'ArrowLeft') judgeCard(GRADES.AGAIN);
      if (isFlipped && settings.gradeButtons === 4 && ['1', '2', '3', '4'].includes(e.key)) judgeCard(Number(e.key));
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, judgeCard, isFlipped, settings.gradeButtons]);

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
      judgeCard(dragX > 0 ? GRADES.GOOD : GRADES.AGAIN);
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
      if (card.custom) return; // the learner's own cards live in the "My cards" pack
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
    return Object.keys(PACKS)
      .filter(id => map.has(id))
      .sort((a, b) => PACKS[a].order - PACKS[b].order)
      .map(id => ({ id, ...PACKS[id], cards: map.get(id) }));
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
        dueCount: c.cards.filter(card => isDue(progress[card.id], now)).length,
        newCount: c.cards.length - reviewed.length,
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
  }, [levels, packs, progress, now]);

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
    if (baseCards.length === 0) return null;
    const date = new Date();
    const today = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    try {
      const saved = JSON.parse(localStorage.getItem('flashcards_wotd'));
      const card = saved?.date === today && baseCards.find(c => c.id === saved.id);
      if (card) return card;
    } catch { /* fall through and pick a new one */ }
    const unlearnt = baseCards.filter(c => progress[c.id]?.status !== 'know');
    const pool = unlearnt.length > 0 ? unlearnt : baseCards;
    const minTier = Math.min(...pool.map(c => c.tier || 1));
    const tierPool = pool.filter(c => (c.tier || 1) === minTier);
    let hash = 0;
    for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = tierPool[hash % tierPool.length];
    try { localStorage.setItem('flashcards_wotd', JSON.stringify({ date: today, id: pick.id })); } catch { /* non-fatal */ }
    return pick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCards]);

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

  // ---------- Spaced repetition: what's due and what's new ----------
  const dueList = useMemo(() => dueCards(allCards, progress, now), [allCards, progress, now]);
  const dueCountRef = useRef(0);
  dueCountRef.current = dueList.length;
  const todayStats = todayActivity(activity, now);
  const newLeftToday = Math.max(0, settings.newPerDay - (todayStats.newCards || 0));
  const unseenCount = useMemo(() => allCards.filter(c => !progress[c.id]).length, [allCards, progress]);
  const newAvailable = Math.min(newLeftToday, unseenCount);
  const streak = useMemo(() => streakInfo(activity, now), [activity, now]);

  // "3 reviews still due today." or "Next review in 4 hours."
  const nextReviewText = useMemo(() => {
    if (dueList.length > 0) return `${dueList.length} review${dueList.length === 1 ? '' : 's'} still due today.`;
    let soonest = null;
    allCards.forEach(c => {
      const due = dueAt(progress[c.id]);
      if (due !== null && due > now && (soonest === null || due < soonest)) soonest = due;
    });
    return soonest ? `Next review in ${describeWait(soonest - now)}.` : null;
  }, [allCards, progress, now, dueList.length]);

  const canSpeak = settings.speaking && canRecognizeSpeech();
  const encountersFor = (card) => progressRef.current[card.id]?.timesReviewed || 0;

  // Starts a quiz session.
  //   due        everything due today (capped per session)
  //   new        today's new words
  //   extra      five more new words past the daily limit
  //   quick      a short mix: due first, then new, else the weakest words
  //   collection due and new words from one level or pack
  const startReview = (kind, { scope } = {}) => {
    const pool = scope ? scope.cards : allCards;
    const prog = progressRef.current;
    const scopedDue = scope ? dueCards(pool, prog, Date.now()) : dueList;
    const newLimit = kind === 'extra' ? 5 : newLeftToday;
    let due = [];
    let fresh = [];
    if (kind === 'due' || kind === 'collection') due = scopedDue.slice(0, MAX_DUE_PER_SESSION);
    if (kind === 'new' || kind === 'extra' || kind === 'collection') fresh = pickNewCards(pool, prog, newLimit);
    if (kind === 'quick') {
      due = scopedDue.slice(0, settings.sessionLength);
      fresh = pickNewCards(pool, prog, Math.min(newLimit, settings.sessionLength - due.length));
      if (due.length + fresh.length === 0) due = weakestCards(pool, prog, settings.sessionLength);
    }
    if (due.length + fresh.length === 0) {
      showToast(kind === 'new' ? 'No new words left for today.' : 'Nothing to review right now.');
      return;
    }
    const items = buildItems({ due, fresh, progress: prog, settings, canSpeak, encounters: encountersFor });
    const title = { due: 'Review', new: 'New words', extra: 'New words', quick: 'Quick session', collection: scope?.title }[kind] || 'Review';
    setReviewSession({ key: Date.now(), title, items, kind });
  };

  // Opening a level or pack studies what's due and new in it; once it's all
  // been learnt and nothing is due, it flips through the whole set instead.
  const openCollection = (c) => {
    if (c.dueCount + Math.min(c.newCount, newLeftToday) > 0) startReview('collection', { scope: c });
    else startSession(c.cards);
  };

  const onSessionGrade = useCallback((card, grade, meta) => {
    const token = gradeCard(card, grade);
    if (meta?.format === 'speak' && grade >= GRADES.GOOD) {
      const next = { ...activityRef.current, speakingPasses: (activityRef.current.speakingPasses || 0) + 1 };
      activityRef.current = next;
      setActivity(next);
    }
    return token;
  }, [gradeCard]);

  const sessionContinue = dueList.length > 0
    ? { label: `Keep going (${dueList.length} due)`, onClick: () => startReview('due') }
    : newAvailable > 0
      ? { label: `Learn ${newAvailable} new word${newAvailable === 1 ? '' : 's'}`, onClick: () => startReview('new') }
      : null;
  const summaryInfo = { streak: streak.current, goal: { done: todayStats.reviews, target: settings.dailyGoal }, nextReview: nextReviewText };

  // ---------- Related words ----------
  const kanjiCharIndex = useMemo(() => {
    const map = new Map();
    allCards.forEach(c => {
      for (const ch of new Set((c.kanji || '').match(/[一-龯]/g) || [])) {
        if (!map.has(ch)) map.set(ch, []);
        map.get(ch).push(c);
      }
    });
    return map;
  }, [allCards]);
  const relatedFor = useCallback((card) => {
    const shared = new Map();
    for (const ch of new Set((card.kanji || '').match(/[一-龯]/g) || [])) {
      (kanjiCharIndex.get(ch) || []).forEach(c => { if (c.id !== card.id) shared.set(c.id, c); });
    }
    // "Common Verbs" and "Common Nouns" are grab-bags, not topics.
    const topical = card.theme && !/^Common /.test(card.theme);
    return {
      sharedKanji: [...shared.values()].slice(0, 8),
      sameTopic: topical ? allCards.filter(c => c.theme === card.theme && c.id !== card.id && !shared.has(c.id)).slice(0, 6) : []
    };
  }, [kanjiCharIndex, allCards]);

  // ---------- AI helper ----------
  const sentencesForCard = useCallback((card) => cardSentences(card, aiCache[card.id]?.sentences), [aiCache]);
  const updateAiEntry = useCallback((cardId, patch) => {
    setAiCache(prev => {
      const entry = prev[cardId] || {};
      const next = { ...prev, [cardId]: { ...entry, ...patch(entry) } };
      saveAiCache(next);
      return next;
    });
  }, []);
  const aiFor = useCallback((card) => ({
    hasKey: !!aiKey,
    explanation: aiCache[card.id]?.explanation || null,
    generate: async (style) => {
      const existing = cardSentences(card, aiCache[card.id]?.sentences).map(x => x.japanese);
      const sentence = await generateSentence(aiKey, card, style, existing);
      updateAiEntry(card.id, entry => ({ sentences: [...(entry.sentences || []), sentence] }));
    },
    explain: async () => {
      const explanation = await explainWord(aiKey, card);
      updateAiEntry(card.id, () => ({ explanation }));
    }
  }), [aiKey, aiCache, updateAiEntry]);

  const changeAiKey = (key) => {
    saveAiKey(key);
    setAiKey(key);
  };

  // ---------- Badges ----------
  useEffect(() => {
    if (baseCards.length === 0) return;
    const learnt = allCards.filter(c => progress[c.id]?.status === 'know').length;
    const ctx = {
      reviews: totalReviews(activity),
      learnt,
      mastered: allCards.filter(c => wordState(progress[c.id]) === 'mastered').length,
      streak: streak.current,
      goalDays: goalDaysMet(activity, settings.dailyGoal),
      levelsComplete: new Set(levels.filter(l => l.cards.every(c => progress[c.id]?.status === 'know')).map(l => l.tier)),
      customCount: customCards.length,
      speakingPasses: activity.speakingPasses || 0,
      totalWords: baseCards.length
    };
    const fresh = newlyEarned(ctx, activity.badges || {});
    if (fresh.length === 0) return;
    const stamp = new Date().toISOString();
    setActivity(a => ({ ...a, badges: { ...(a.badges || {}), ...Object.fromEntries(fresh.map(b => [b.id, stamp])) } }));
    showToast(fresh.length === 1 ? `Badge earned: ${fresh[0].title}` : `${fresh.length} badges earned, including ${fresh[0].title}`, {
      action: { label: 'See badges', onClick: () => { setScreen('home'); setProfileTab('stats'); } },
      duration: 5000
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, activity, customCards, baseCards.length, settings.dailyGoal]);

  // ---------- Reminders & install ----------
  const lastStudyDay = useMemo(
    () => Object.keys(activity.days).filter(k => activity.days[k].reviews > 0).sort().pop() || null,
    [activity]
  );
  useEffect(() => {
    saveReminderState({
      enabled: settings.reminder,
      time: settings.reminderTime,
      lastStudyDay,
      ...reminderText({ dueCount: dueList.length, streak: streak.current })
    });
  }, [settings.reminder, settings.reminderTime, lastStudyDay, dueList.length, streak.current]);

  // While the app is open, nudge at the reminder time if nothing's been studied.
  useEffect(() => {
    if (!settings.reminder) return;
    let timer;
    const arm = () => {
      timer = setTimeout(() => {
        const s = streakInfo(activityRef.current);
        if (!s.studiedToday) showReminder(reminderText({ dueCount: dueCountRef.current, streak: s.current }));
        arm();
      }, msUntil(settings.reminderTime));
    };
    arm();
    return () => clearTimeout(timer);
  }, [settings.reminder, settings.reminderTime]);

  const toggleReminder = async (on) => {
    if (!on) {
      updateSettings({ reminder: false });
      disableBackgroundCheck();
      setReminderNote(null);
      return;
    }
    if (!notificationsSupported()) return;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      setReminderNote('Notifications are blocked for this site. Allow them in your browser settings to get reminders.');
      return;
    }
    updateSettings({ reminder: true });
    const background = await enableBackgroundCheck();
    setReminderNote(background
      ? "You'll get the reminder even when the app is closed."
      : "Reminders show while the app is open in a tab. Install the app to get them when it's closed.");
  };

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  // ---------- The learner's own cards ----------
  const saveCustomCard = (card) => {
    const isNew = !customCards.some(c => c.id === card.id);
    setCustomCards(prev => {
      const next = isNew ? [card, ...prev] : prev.map(c => (c.id === card.id ? card : c));
      saveCustomCards(next);
      return next;
    });
    setEditing(null);
    showToast(isNew ? 'Added to My cards. It comes up in your next new-word session.' : 'Card saved.');
  };

  const deleteCustomCard = (card) => {
    Object.values(card.media || {}).forEach(id => id && deleteMedia(id).catch(() => {}));
    setCustomCards(prev => {
      const next = prev.filter(c => c.id !== card.id);
      saveCustomCards(next);
      return next;
    });
    const nextProgress = { ...progressRef.current };
    delete nextProgress[card.id];
    progressRef.current = nextProgress;
    setProgress(nextProgress);
    saveJSON('flashcards_progress', nextProgress);
    saveNote(card.id, '');
    setEditing(null);
    setModalCardIndex(null);
    showToast('Card deleted.');
  };

  // ---------- Backups ----------
  const exportBackup = async () => {
    downloadBlob(await buildBackup(), backupFileName());
    showToast('Backup saved to your downloads.');
  };
  const importBackup = async (file) => {
    await restoreBackup(file);
    window.location.reload();
  };
  const exportAnki = () => {
    downloadBlob(buildAnkiExport(allCards, notes), `nihongo-anki-${dayKey()}.txt`);
    showToast('Anki file saved to your downloads.');
  };

  const splashScreen = !splashRemoved && (
    <div id="splash-screen" class={splashFadingOut ? 'fade-out' : ''}>
      <div class="splash-mark">日</div>
      <p class="splash-title">Japanese Flashcards</p>
      {loading && <div class="splash-spinner" aria-label="Loading"></div>}
    </div>
  );

  const masteryPercent = allCards.length > 0 ? Math.round((totalLearntWords / allCards.length) * 100) : 0;
  const shownPercent = useCountUp(masteryPercent, 1100);
  const shownLearnt = useCountUp(totalLearntWords);
  const shownStreak = useCountUp(streak.current);
  const shownToday = useCountUp(todayStats.reviews);

  // Kanji you've already put a verdict on, for the "revise / review" CTAs in
  // the Kanji tab hero.
  const allKanjiFlat = React.useMemo(() => (radicalMap ? radicalMap.groups.flatMap(g => g.kanji) : []), [radicalMap]);
  const learnedKanjiList = React.useMemo(() => allKanjiFlat.filter(k => kanjiProgress[k.kanji] === 'know'), [allKanjiFlat, kanjiProgress]);
  const practicedKanjiList = React.useMemo(() => allKanjiFlat.filter(k => kanjiProgress[k.kanji]), [allKanjiFlat, kanjiProgress]);

  // The footer nav marker is measured against the real button rects (not a
  // naive width/5 guess) so it always lands centered on the active tab, gaps
  // and all.
  const footerNavRef = useRef(null);
  const [navMarkerRect, setNavMarkerRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useEffect(() => {
    const container = footerNavRef.current;
    if (!container) return;
    const measure = () => {
      const idx = NAV_ORDER.indexOf(homeView);
      const btn = container.querySelectorAll('.footer-nav-btn')[idx];
      if (!btn) return;
      // getBoundingClientRect deltas rather than offsetLeft/offsetTop: the
      // latter measures from the padding edge while the button sits inside
      // the content box, so on the padded mobile pill they're off by exactly
      // the container's own padding. A plain rect subtraction has no such
      // reference-frame ambiguity.
      const cRect = container.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      // Ignore a zero-size read (a resize/orientation event caught mid-layout)
      // rather than snapping the marker to nothing with no later event to fix it.
      if (bRect.width > 0) {
        setNavMarkerRect({ x: bRect.left - cRect.left, y: bRect.top - cRect.top, w: bRect.width, h: bRect.height });
      }
    };
    measure();
    const raf = requestAnimationFrame(measure); // re-check after first layout/font settle
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // splashRemoved: the footer isn't in the DOM (footerNavRef.current is
    // still null) until the splash screen unmounts, which doesn't otherwise
    // change homeView/screen — without this the effect never re-runs after
    // the real footer appears and the marker is stuck at its zero default.
  }, [homeView, screen, splashRemoved]);

  // Swiping anywhere on the home screen (hero or sheet) steps to the
  // neighbouring nav tab, mirroring the footer nav's order. Drags that start
  // in a horizontally-scrolling control (chip rows) or a text field are left
  // alone so they keep their own behaviour.
  const homeSwipe = useRef({ x: 0, y: 0, active: false });
  const handleHomeSwipeStart = (e) => {
    if (e.target.closest('input, textarea, select, .status-chips')) return;
    homeSwipe.current = { x: e.clientX, y: e.clientY, active: true };
  };
  const handleHomeSwipeEnd = (e) => {
    const drag = homeSwipe.current;
    if (!drag.active) return;
    drag.active = false;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const idx = NAV_ORDER.indexOf(homeView);
    const next = idx + (dx < 0 ? 1 : -1);
    if (next < 0 || next >= NAV_ORDER.length) return;
    setHomeView(NAV_ORDER[next]);
  };
  const cancelHomeSwipe = () => { homeSwipe.current.active = false; };

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

  const renderCollectionCard = (c) => {
    const { key, kind, filterValue, badge, title, cards, color, knownCount, total, percent, dueCount, newCount } = c;
    const newToday = Math.min(newCount, newLeftToday);
    return (
      <div key={key} class="collection-card">
        <div class="collection-card-main" onClick={() => openCollection(c)}>
          <div class="level-badge" style={{ background: color }}>{badge}</div>
          <div class="collection-main">
            <div class="collection-header">
              <h3 class="collection-title">{title}</h3>
              <span class="collection-badge">{total} words</span>
            </div>
            <div class="collection-stats">
              {knownCount} / {total} known
              {dueCount > 0 && <span class="collection-due">{dueCount} due</span>}
            </div>
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
            aria-expanded={expandedCardKey === key}
          >
            <IconChevron dir="down" size={18} />
          </button>
        </div>

        {/* Expandable dropdown actions */}
        <div class={`collection-actions-dropdown ${expandedCardKey === key ? 'open' : ''}`}>
          <div class="collection-actions">
            <button
              class="btn-card-action primary"
              disabled={dueCount === 0}
              onClick={(e) => { e.stopPropagation(); startReview('due', { scope: c }); }}
              title={dueCount === 0 ? 'Nothing due in this collection' : `Review ${dueCount} words due today`}
            >
              <IconRefresh width="14" height="14" />
              Review due ({dueCount})
            </button>
            <button
              class="btn-card-action review-learnt"
              disabled={newToday === 0}
              onClick={(e) => { e.stopPropagation(); startReview('new', { scope: c }); }}
              title={newCount === 0 ? "You've started every word here" : newToday === 0 ? "Today's new words are done" : `Meet ${newToday} new words`}
            >
              <IconPlus width="14" height="14" />
              Learn new ({newToday})
            </button>
            <button
              class="btn-card-action"
              onClick={(e) => { e.stopPropagation(); startSession(cards); }}
              title="Flip through every card here with swipe cards"
            >
              <IconFlip width="14" height="14" />
              Flip all ({total})
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
  };

  // Home's first card: what to do today, one tap away.
  const todayGoalPct = Math.min(100, (todayStats.reviews / settings.dailyGoal) * 100);
  const renderTodayPanel = () => {
    const due = dueList.length;
    const primary = due > 0
      ? { label: `Review ${due} due`, onClick: () => startReview('due') }
      : newAvailable > 0
        ? { label: `Learn ${newAvailable} new word${newAvailable === 1 ? '' : 's'}`, onClick: () => startReview('new') }
        : null;
    return (
      <section class="today-panel" aria-label="Today">
        <div class="today-head">
          <h2 class="today-title">Today</h2>
          <span class={`today-streak ${streak.current > 0 ? 'is-on' : ''}`}>
            <IconFlame width="16" height="16" />
            {streak.current > 0 ? `${streak.current}-day streak` : 'Start a streak'}
          </span>
        </div>
        <div class="today-counts">
          <div class="today-count">
            <strong>{due}</strong>
            <span>due</span>
          </div>
          <div class="today-count">
            <strong>{newAvailable}</strong>
            <span>new</span>
          </div>
          <div class="today-count">
            <strong>{todayStats.reviews}</strong>
            <span>done</span>
          </div>
        </div>
        <div class="today-goal">
          <div class="today-goal-label">
            <span>Daily goal</span>
            <span>{Math.min(todayStats.reviews, settings.dailyGoal)} / {settings.dailyGoal}</span>
          </div>
          <div class="today-goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={settings.dailyGoal} aria-valuenow={Math.min(todayStats.reviews, settings.dailyGoal)} aria-label="Daily goal">
            <div class="today-goal-fill" style={{ width: `${todayGoalPct}%` }}></div>
          </div>
        </div>
        {primary ? (
          <button class="today-primary" onClick={primary.onClick}>{primary.label}</button>
        ) : (
          <p class="today-done">All caught up. {nextReviewText || 'Add words or learn extra ones to keep going.'}</p>
        )}
        <div class="today-secondary">
          {due > 0 && newAvailable > 0 && (
            <button class="today-link" onClick={() => startReview('new')}>
              <IconPlus width="15" height="15" /> Learn {newAvailable} new
            </button>
          )}
          <button class="today-link" onClick={() => startReview('quick')}>
            <IconBolt /> Quick {settings.sessionLength}-card session
          </button>
          {!primary && unseenCount > 0 && (
            <button class="today-link" onClick={() => startReview('extra')}>
              <IconPlus width="15" height="15" /> Learn 5 extra
            </button>
          )}
        </div>
      </section>
    );
  };

  // One tile in a sideways-scrolling home row.
  const renderTile = ({ key, title, sub, badge, color, percent, onClick, jp }) => (
    <button key={key} class="home-tile" onClick={onClick}>
      <span class={`home-tile-badge ${jp ? 'is-jp' : ''}`} style={color ? { background: color } : undefined}>{badge}</span>
      <span class="home-tile-title">{title}</span>
      {sub && <span class="home-tile-sub">{sub}</span>}
      {percent !== undefined && (
        <span class="home-tile-track"><span class="home-tile-fill" style={{ width: `${percent}%`, background: color || 'var(--accent)' }} /></span>
      )}
    </button>
  );

  const renderRow = (label, tiles, onSeeAll) => tiles.length > 0 && (
    <section class="home-row" key={label} aria-label={label}>
      <div class="home-row-head">
        <h3 class="collections-section-label">{label}</h3>
        {onSeeAll && <button class="home-row-all" onClick={onSeeAll}>See all</button>}
      </div>
      <div class="home-row-track">{tiles}</div>
    </section>
  );

  const collectionTile = (c) => renderTile({
    key: c.key,
    title: c.title,
    sub: `${c.knownCount} / ${c.total} known${c.dueCount > 0 ? `, ${c.dueCount} due` : ''}`,
    badge: c.badge,
    color: c.color,
    percent: c.percent,
    onClick: () => openCollection(c)
  });

  const renderHomeRows = () => {
    const started = [recommended, ...otherPacks, ...collections.levels]
      .filter((c, i, all) => c && c.started && all.findIndex(x => x?.key === c.key) === i)
      .sort((a, b) => b.lastReviewedAt.localeCompare(a.lastReviewedAt));
    const latest = started.length > 0 ? started.slice(0, 6) : [recommended].filter(Boolean);
    const practice = [
      renderTile({ key: 'due', title: 'Review due', sub: `${dueList.length} word${dueList.length === 1 ? '' : 's'} ready`, badge: <IconRefresh width="18" height="18" />, onClick: () => startReview('due') }),
      renderTile({ key: 'new', title: 'Learn new', sub: `${newAvailable} left today`, badge: <IconPlus width="18" height="18" />, onClick: () => startReview(newAvailable > 0 ? 'new' : 'extra') }),
      renderTile({ key: 'quick', title: 'Quick session', sub: `${settings.sessionLength} cards`, badge: <IconBolt width="18" height="18" />, onClick: () => startReview('quick') }),
      recommended && renderTile({ key: 'flip', title: 'Flip cards', sub: recommended.title, badge: <IconFlip width="18" height="18" />, onClick: () => startSession(recommended.cards) }),
      renderTile({ key: 'add', title: 'Add a word', sub: 'Your own card', badge: <IconPencil width="18" height="18" />, onClick: () => setEditing({ card: null }) })
    ].filter(Boolean);
    const kanaTiles = [
      renderTile({ key: 'hira', title: 'Hiragana', sub: 'The 46 basic sounds', badge: 'あ', jp: true, color: 'var(--level-1)', onClick: () => setHomeView('kana') }),
      renderTile({ key: 'kata', title: 'Katakana', sub: 'For loanwords', badge: 'ア', jp: true, color: 'var(--level-2)', onClick: () => setHomeView('kana') }),
      renderTile({ key: 'daku', title: 'Voiced sounds', sub: 'Dakuten and yoon', badge: 'が', jp: true, color: 'var(--level-3)', onClick: () => setHomeView('kana') })
    ];
    const kanjiTiles = [
      ...JLPT_LEVELS.filter(l => l.jlpt !== null).map(level => {
        const list = allKanjiFlat.filter(k => (k.jlpt ?? null) === level.jlpt);
        if (list.length === 0) return null;
        const known = list.filter(k => kanjiProgress[k.kanji] === 'know').length;
        const title = `JLPT ${level.label}`;
        return renderTile({ key: level.key, title, sub: `${known} / ${list.length} known`, badge: level.badge, color: level.color, percent: (known / list.length) * 100, onClick: () => setKanjiSession({ title, kanji: list }) });
      }).filter(Boolean),
      renderTile({ key: 'map', title: 'Radical map', sub: 'Kanji by radical', badge: '部', jp: true, onClick: () => { setKanjiMode('map'); setHomeView('kanji'); } })
    ];
    return (
      <>
        {renderRow('Practice', practice)}
        {wordOfDay && (
          <WordOfDay
            card={wordOfDay}
            showKanji={showKanji}
            onToggleKanji={handleToggleKanji}
            learnt={progress[wordOfDay.id]?.status === 'know'}
          />
        )}
        {renderRow(started.length > 0 ? 'Continue' : 'Start here', latest.map(collectionTile))}
        {renderRow('Learning path', collections.levels.map(collectionTile), () => setHomeView('learn'))}
        {renderRow('Word packs', collections.packs.map(collectionTile), () => setHomeView('learn'))}
        {renderRow('Kana', kanaTiles, () => setHomeView('kana'))}
        {radicalMap && renderRow('Kanji', kanjiTiles, () => setHomeView('kanji'))}
      </>
    );
  };

  return (
    <>
      {/* Home Screen */}
      {screen === 'home' && (
        <div
          id="home-screen"
          onPointerDown={handleHomeSwipeStart}
          onPointerUp={handleHomeSwipeEnd}
          onPointerCancel={cancelHomeSwipe}
        >
          {/* Top Hero Section: doubles as each tab's header since the sheet no longer has its own title */}
          <div
            class={`home-hero-section ${homeView !== 'home' ? 'home-hero-compact' : 'home-hero-tappable'}`}
            onClick={homeView === 'home' ? () => setProfileTab('stats') : undefined}
          >
            {homeView === 'home' && (
              <button class="hero-icon-btn hero-profile-btn" onClick={(e) => { e.stopPropagation(); setProfileTab('stats'); }} aria-label="Open profile" title="Profile">
                <IconProfile />
              </button>
            )}
            {homeView === 'home' && (
              <>
                <h1 class="hero-title">Japanese Flashcards</h1>

                <div class="mastery-ring" role="img" aria-label={`${masteryPercent}% of words learnt`}>
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
                  <div class="hero-chip chip-streak" title={streak.current > 0 ? `${streak.current}-day streak` : 'No streak yet'} aria-label={`${streak.current}-day streak`}>
                    <IconFlame width="20" height="20" />
                    <strong>{shownStreak}</strong>
                  </div>
                  <div class="hero-chip chip-today" title="Reviews today" aria-label={`${todayStats.reviews} reviews today`}>
                    <IconSun width="20" height="20" />
                    <strong>{shownToday}</strong>
                  </div>
                </div>
              </>
            )}

            {homeView === 'learn' && (
              <>
                <h1 class="hero-title">Learn</h1>
                <p class="hero-subtitle">Follow the path, or explore themed packs</p>
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
              </>
            )}

            {homeView === 'all-words' && (
              <>
                <h1 class="hero-title">Words</h1>
                <p class="hero-subtitle">Search and browse every word in your deck</p>
                <div class="hero-cta-row">
                  <button class="hero-cta-btn" onClick={() => setEditing({ card: null })}>
                    <IconPlus width="16" height="16" /> Add a word
                  </button>
                </div>
                <div class="hero-chips">
                  <div class="hero-chip chip-learnt" title={`${totalLearntWords} of ${allCards.length} words learnt`} aria-label={`${totalLearntWords} words learnt`}>
                    <IconCheckCircle width="20" height="20" />
                    <strong>{shownLearnt}</strong>
                  </div>
                  <div class="hero-chip chip-remaining" title="Words not yet learnt" aria-label={`${allCards.length - totalLearntWords} words remaining`}>
                    <IconBook width="20" height="20" />
                    <strong>{allCards.length - totalLearntWords}</strong>
                  </div>
                </div>
              </>
            )}

            {homeView === 'kana' && (
              <>
                <h1 class="hero-title">Kana</h1>
                <p class="hero-subtitle">Hiragana and katakana, with romaji readings</p>
              </>
            )}

            {homeView === 'kanji' && (
              <>
                <h1 class="hero-title">Kanji</h1>
                <p class="hero-subtitle">
                  {kanjiMode === 'map' ? "Every kanji you've met, grouped by its radical" : "Practise the kanji you've met, by JLPT level"}
                </p>
                <div class="hero-cta-row">
                  <button
                    class="hero-cta-btn"
                    disabled={learnedKanjiList.length === 0}
                    onClick={() => { setKanjiMode('practice'); setKanjiSession({ title: 'Learned kanji', kanji: learnedKanjiList }); }}
                  >
                    Revise learned <span class="hero-cta-count">{learnedKanjiList.length}</span>
                  </button>
                  <button
                    class="hero-cta-btn"
                    disabled={practicedKanjiList.length === 0}
                    onClick={() => { setKanjiMode('practice'); setKanjiSession({ title: 'Practiced kanji', kanji: practicedKanjiList }); }}
                  >
                    Review practiced <span class="hero-cta-count">{practicedKanjiList.length}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 3D Sheet Section with Rounded Top Corners */}
          <div class="home-sheet-section">
            {/* HOME: word of the day, a recommended lesson, then other packs */}
            {homeView === 'home' && (
              <div class="collections-grid home-rows">
                {renderTodayPanel()}
                {renderHomeRows()}
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
                    <button
                      class={`filter-chip ${statusFilter === 'due' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('due')}
                    >
                      Due today ({dueList.length})
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
                              {card.custom
                                ? <span class="meta-pill tier">Mine</span>
                                : card.tierName && <span class="meta-pill tier">L{card.tier}</span>}
                            </div>
                          </div>

                          <div class="row-right">
                            <button
                              class="row-audio-btn"
                              title="Listen"
                              onClick={(e) => {
                                e.stopPropagation();
                                playWord(card);
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
              <div class="kanji-tabbar" role="tablist" aria-label="Kanji mode">
                <button role="tab" aria-selected={kanjiMode === 'map'} class={`kanji-tab ${kanjiMode === 'map' ? 'active' : ''}`} onClick={() => setKanjiMode('map')}>Radical map</button>
                <button role="tab" aria-selected={kanjiMode === 'practice'} class={`kanji-tab ${kanjiMode === 'practice' ? 'active' : ''}`} onClick={() => setKanjiMode('practice')}>Practice</button>
              </div>
            )}

            {/* KANJI PRACTICE: JLPT levels, each further split into practicable stroke-count bands */}
            {homeView === 'kanji' && kanjiMode === 'practice' && (
              <div class="kanji-practice-levels">
                {!radicalMap && !radicalMapError && <p class="muted" style={{ gridColumn: '1 / -1' }}>Loading kanji…</p>}
                {radicalMapError && <p class="muted" style={{ gridColumn: '1 / -1' }}>Couldn't load the kanji.</p>}
                {radicalMap && JLPT_LEVELS.map(level => {
                  const list = allKanjiFlat.filter(k => (k.jlpt ?? null) === level.jlpt);
                  if (list.length === 0) return null;
                  const title = level.jlpt === null ? level.label : `JLPT ${level.label}`;
                  const knownCount = list.filter(k => kanjiProgress[k.kanji] === 'know').length;
                  const categories = kanjiCategories(list, kanjiProgress);
                  const isExpanded = expandedPracticeLevel === level.key;
                  return (
                    <div key={level.key} class={`kanji-level-tile-wrap ${isExpanded ? 'expanded' : ''}`}>
                      <div class="collection-card kanji-level-tile">
                        <button class="kanji-level-face" onClick={() => setKanjiSession({ title, kanji: list })}>
                          <div class="level-badge" style={{ background: level.color }}>{level.badge}</div>
                          <h3 class="collection-title">{title}</h3>
                          <span class="collection-badge">{list.length} kanji</span>
                          <div class="collection-progress-bg">
                            <div class="collection-progress-fill" style={{ width: `${(knownCount / list.length) * 100}%`, background: level.color }}></div>
                          </div>
                          <div class="collection-stats">{knownCount} / {list.length} known</div>
                        </button>

                        {categories.length > 1 && (
                          <button
                            class={`card-expand-toggle ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => setExpandedPracticeLevel(prev => prev === level.key ? null : level.key)}
                            aria-label="Toggle practice categories"
                            aria-expanded={isExpanded}
                          >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                        )}

                        {categories.length > 1 && (
                          <div class={`collection-actions-dropdown ${isExpanded ? 'open' : ''}`}>
                            <div class="kanji-level-categories">
                              {categories.map(cat => (
                                <button
                                  key={cat.key}
                                  class="kanji-category-chip"
                                  onClick={() => setKanjiSession({ title: `${title}, ${cat.label}`, kanji: cat.list })}
                                >
                                  <span>{cat.label}</span>
                                  <span class="kanji-category-count">{cat.knownCount}/{cat.list.length}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                                        onClick={() => openKanji(k, g.kanjiList)}
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
            <div class="footer-nav-inner" role="tablist" ref={footerNavRef}>
              <div
                class="footer-nav-marker"
                style={{ transform: `translate(${navMarkerRect.x}px, ${navMarkerRect.y}px)`, width: `${navMarkerRect.w}px`, height: `${navMarkerRect.h}px` }}
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
                  <span class="status-badge unlearnt">{progress[modalCard.id] ? 'Learning' : 'New'}</span>
                )}
              </div>
              <div class="modal-header-actions">
                {modalCard.custom && (
                  <button class="modal-nav-btn" title="Edit this card" aria-label="Edit this card" onClick={() => setEditing({ card: modalCard })}>
                    <IconPencil width="14" height="14" />
                  </button>
                )}
                <button
                  class="modal-nav-btn"
                  title="Previous word (Left arrow)"
                  aria-label="Previous word"
                  onClick={() => setModalCardIndex(prev => (prev - 1 + filteredCards.length) % filteredCards.length)}
                >
                  ←
                </button>
                <button
                  class="modal-nav-btn"
                  title="Next word (Right arrow)"
                  aria-label="Next word"
                  onClick={() => setModalCardIndex(prev => (prev + 1) % filteredCards.length)}
                >
                  →
                </button>
                <button
                  class="modal-close-btn"
                  title="Close (Esc)"
                  aria-label="Close"
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
                      <CardImage card={modalCard} show={settings.pictures} />
                      <div class="word-group">
                        <p class="kanji-word">{showKanji && modalCard.kanji ? modalCard.kanji : modalCard.hiragana}</p>
                        <p class="hiragana-word muted">{showKanji && modalCard.kanji ? modalCard.hiragana : ''}</p>
                        <p class="romaji-word-front muted">{modalCard.romaji}</p>
                      </div>
                      <WordAudio card={modalCard} />
                      <p class="tap-hint muted">Tap to flip</p>
                    </div>
                  </div>

                  {/* BACK */}
                  <div class="card-face modal-face-back">
                    <div class="card-scrollable">
                      <div class="card-topbar">
                        <span class="muted">Word Details</span>
                        {progress[modalCard.id] && (
                          <span class="card-due-note muted">
                            {isDue(progress[modalCard.id], now) ? 'Due today' : `Next review in ${describeWait(dueAt(progress[modalCard.id]) - now)}`}
                          </span>
                        )}
                      </div>
                      <WordDetails
                        key={modalCard.id}
                        card={modalCard}
                        showKanji={showKanji}
                        sentences={sentencesForCard(modalCard)}
                        encounter={modalEncounter}
                        noteText={notes[modalCard.id] || ''}
                        onNoteChange={(val) => saveNote(modalCard.id, val)}
                        wordIndex={wordIndex}
                        related={relatedFor(modalCard)}
                        onOpenWord={(id) => {
                          const idx = filteredCards.findIndex(c => c.id === id);
                          if (idx !== -1) setModalCardIndex(idx);
                          else openWordFromKanji(id);
                        }}
                        ai={aiFor(modalCard)}
                      />
                      {settings.speaking && <SpeakCheck key={`speak-${modalCard.id}`} card={modalCard} />}
                      <div class="scroll-spacer"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action Controls: set the word's state by hand */}
            <div class="modal-footer-actions">
              <button
                class={`modal-action-btn dont ${progress[modalCard.id]?.status === 'dont' ? 'active' : ''}`}
                onClick={() => gradeCard(modalCard, GRADES.AGAIN, { countActivity: false })}
                title="Bring this word back for review soon"
              >
                Mark Unlearnt ✗
              </button>
              <button
                class={`modal-action-btn know ${progress[modalCard.id]?.status === 'know' ? 'active' : ''}`}
                onClick={() => gradeCard(modalCard, GRADES.GOOD, { countActivity: false })}
                title="Count this word as known and schedule its next review"
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
          notes={notes}
          paused={peekStack.length > 0}
          onNoteChange={saveKanjiNote}
          onJudge={saveKanjiProgress}
          onPeek={kanjiIndex ? openPeek : undefined}
          onClose={() => setKanjiSession(null)}
        />
      )}

      {/* KANJI DETAIL POPUP (from the Kanji Map tab) */}
      {selectedKanji && (
        <div class="modal-backdrop" onClick={() => setSelectedKanji(null)}>
          <div class="kanji-detail-card" onClick={(e) => e.stopPropagation()}>
            <div class="kanji-detail-topbar">
              {kanjiNavList.length > 1 && kanjiNavIndex >= 0 ? (
                <div class="kanji-detail-nav">
                  <button class="modal-nav-btn" title="Previous kanji (Left arrow)" aria-label="Previous kanji" onClick={() => stepSelectedKanji(-1)}>
                    <IconChevron dir="left" />
                  </button>
                  <span class="modal-counter">{kanjiNavIndex + 1} of {kanjiNavList.length}</span>
                  <button class="modal-nav-btn" title="Next kanji (Right arrow)" aria-label="Next kanji" onClick={() => stepSelectedKanji(1)}>
                    <IconChevron dir="right" />
                  </button>
                </div>
              ) : <span></span>}
              <button class="modal-close-btn" title="Close (Esc)" aria-label="Close" onClick={() => setSelectedKanji(null)}>✕</button>
            </div>

            <KanjiHead k={selectedKanji} />

            <KanjiDetailBody
              key={selectedKanji.kanji}
              k={selectedKanji}
              noteText={notes[`kanji:${selectedKanji.kanji}`] || ''}
              onNoteChange={(val) => saveKanjiNote(selectedKanji.kanji, val)}
              onPeek={kanjiIndex ? openPeek : undefined}
              onOpenWord={(id) => { setSelectedKanji(null); openWordFromKanji(id); }}
            />
          </div>
        </div>
      )}

      {/* PEEK SHEET: details for a tapped kanji, radical or part, layered over the card or popup */}
      {peekStack.length > 0 && kanjiIndex && (
        <KanjiPeek
          stack={peekStack}
          index={kanjiIndex}
          inLesson={!!kanjiSession}
          onPush={pushPeek}
          onPop={popPeek}
          onClose={closePeek}
          onOpenRadicalMap={openRadicalBranch}
        />
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
                if (e.target.closest('button, a, input, textarea, video, audio')) return;
                if (dragRef.current.wasDragged) return;
                setIsFlipped(prev => !prev);
              }}
            >
              <div id="card-inner" ref={cardInnerRef} class={isFlipped ? 'flipped' : ''}>
                {/* FRONT FACE */}
                <div class="card-face" id="card-front">
                  <div class="card-body">
                    <CardImage card={currentCard} show={settings.pictures} />
                    <div class="word-group">
                      <p class="kanji-word">{displayKanji ? currentCard.kanji : currentCard.hiragana}</p>
                      <p class="hiragana-word muted">{displayKanji ? currentCard.hiragana : ''}</p>
                      <p class="romaji-word-front muted">{currentCard.romaji}</p>
                    </div>
                    <WordAudio card={currentCard} />
                    <p class="tap-hint muted">Tap to reveal</p>
                  </div>
                </div>

                {/* BACK FACE */}
                <div class="card-face" id="card-back">
                  <div class="card-scrollable" ref={scrollableRef} onScroll={checkScrollFade}>
                    <div class="card-topbar">
                      <span class="card-counter-back muted">{currentIndex + 1} / {remaining.length}</span>
                    </div>
                    <WordDetails
                      key={currentCard.id}
                      card={currentCard}
                      showKanji={showKanji}
                      sentences={sentencesForCard(currentCard)}
                      encounter={sessionEncounters.current[currentCard.id] || 0}
                      noteText={notes[currentCard.id] || ''}
                      onNoteChange={(val) => saveNote(currentCard.id, val)}
                      wordIndex={wordIndex}
                      related={relatedFor(currentCard)}
                      onLayoutChange={checkScrollFade}
                      ai={aiFor(currentCard)}
                    />
                    {settings.speaking && <SpeakCheck key={`speak-${currentCard.id}`} card={currentCard} />}
                    <div class="scroll-spacer"></div>
                    <div class={`scroll-fade ${hasScrollFade ? 'visible' : ''}`}></div>
                  </div>

                  <GradeButtons count={settings.gradeButtons} record={progress[currentCard.id]} onGrade={judgeCard} />
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
              aria-label={atFrontier ? 'Undo last answer' : 'Previous card'}
            >
              {atFrontier ? <IconUndo width="14" height="14" /> : <IconChevron dir="left" />}
              {atFrontier ? 'Undo' : 'Previous'}
            </button>
            <button
              class="arena-nav-btn"
              onClick={goToNextCard}
              disabled={currentIndex >= maxIndexReached}
              aria-label="Next card"
            >
              Next
              <IconChevron dir="right" />
            </button>
          </div>
        </>
      )}

      {/* Summary Screen */}
      {screen === 'summary' && (
        <SessionSummary
          results={history.map(h => ({ card: remaining[h.index], correct: h.grade >= GRADES.HARD })).filter(r => r.card)}
          xp={history.reduce((sum, h) => sum + (h.token?.delta?.xp || 0), 0)}
          streak={streak.current}
          goal={{ done: todayStats.reviews, target: settings.dailyGoal }}
          nextReview={nextReviewText}
          onReviewMissed={(missed) => startSession(missed)}
          continueOption={{ label: 'Flip them all again', onClick: () => startSession(deck) }}
          onDone={() => setScreen('home')}
          doneLabel="Back to Home"
        />
      )}

      {/* QUIZ SESSION: due reviews, new words, quick sessions */}
      {reviewSession && (
        <ReviewSession
          key={reviewSession.key}
          title={reviewSession.title}
          items={reviewSession.items}
          pool={allCards}
          progress={progress}
          settings={settings}
          showKanji={showKanji}
          onToggleKanji={handleToggleKanji}
          notes={notes}
          onNoteChange={saveNote}
          wordIndex={wordIndex}
          relatedFor={relatedFor}
          aiFor={aiFor}
          sentencesFor={sentencesForCard}
          onGrade={onSessionGrade}
          onUndo={undoGrade}
          onClose={() => setReviewSession(null)}
          summaryInfo={summaryInfo}
          continueOption={sessionContinue}
        />
      )}

      {/* PROFILE SIDEBAR: stats and settings */}
      {profileTab && (
        <div class="profile-backdrop" onClick={() => setProfileTab(null)}>
          <aside class="profile-sidebar" role="dialog" aria-label="Profile" onClick={(e) => e.stopPropagation()}>
            <div class="profile-head">
              <span class="profile-avatar" aria-hidden="true">学</span>
              <div class="profile-who">
                <p class="profile-name">Your profile</p>
                <p class="profile-meta">Level {levelOf(activity.xp)}, {activity.xp || 0} XP, {streak.current}-day streak</p>
              </div>
              <button class="modal-close-btn" aria-label="Close profile" onClick={() => setProfileTab(null)}>✕</button>
            </div>
            <div class="kanji-tabbar profile-tabs" role="tablist" aria-label="Profile sections">
              <button role="tab" aria-selected={profileTab === 'stats'} class={`kanji-tab ${profileTab === 'stats' ? 'active' : ''}`} onClick={() => setProfileTab('stats')}>Stats</button>
              <button role="tab" aria-selected={profileTab === 'settings'} class={`kanji-tab ${profileTab === 'settings' ? 'active' : ''}`} onClick={() => setProfileTab('settings')}>Settings</button>
            </div>
            <div class="profile-body">
              {profileTab === 'stats' ? (
                <StatsView
                  cards={allCards}
                  levels={collections.levels}
                  progress={progress}
                  activity={activity}
                  settings={settings}
                  streak={streak}
                  now={now}
                  onOpenSettings={() => setProfileTab('settings')}
                />
              ) : (
                <SettingsScreen
                  settings={settings}
                  onChange={updateSettings}
                  showKanji={showKanji}
                  onToggleKanji={handleToggleKanji}
                  aiKey={aiKey}
                  onAiKeyChange={changeAiKey}
                  onExport={exportBackup}
                  onImport={importBackup}
                  onAnkiExport={exportAnki}
                  onReminderToggle={toggleReminder}
                  reminderNote={reminderNote}
                  installPrompt={installPrompt}
                  onInstall={installApp}
                  onClose={() => setProfileTab(null)}
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {editing && (
        <CustomCardEditor
          card={editing.card}
          aiKey={aiKey}
          onSave={saveCustomCard}
          onDelete={deleteCustomCard}
          onClose={() => setEditing(null)}
        />
      )}

      <div class="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} class="toast" role="status">
            <span>{t.message}</span>
            {t.action && (
              <button class="toast-action" onClick={() => { t.action.onClick(); setToasts(ts => ts.filter(x => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

