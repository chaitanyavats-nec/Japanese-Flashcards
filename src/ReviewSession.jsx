import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as wanakana from 'wanakana';
import { GRADES, GRADE_LABELS, previewGrades, shortWait, describeWait, isHard } from './lib/srs';
import { FORMAT_LABELS, optionsFor, easierFormat } from './lib/queue';
import { checkAnswer, checkSpoken } from './lib/text';
import { playWord, listenOnce, canRecognizeSpeech, SLOW_RATE } from './lib/speech';
import { CardImage, WordDetails, WordAudio, SentenceTokens, NoteSection, isTokenOfCard, hapticBuzz, isTypingTarget } from './wordParts';
import { IconCheck, IconX, IconUndo, IconMic, IconSpeaker, IconLightbulb, IconFlame, IconCheckCircle, IconBolt } from './icons';

// Question formats that are auto-graded and can run against the clock.
const QUIZ_FORMATS = new Set(['recognize', 'produce', 'type', 'listen', 'context', 'speak']);
const CHOICE_FORMATS = new Set(['recognize', 'produce', 'listen', 'context']);
// Picture hints only go on prompts that already show the meaning (or where
// the word is being learnt); on a "what does this mean?" prompt the picture
// would give the answer away.
const MAX_REQUEUES = 2;
// A typed answer this fast (and unaided) counts as Easy.
const FAST_RECALL_MS = 4000;

const PRAISE = ['Nice.', 'Got it.', 'Well done.', 'Spot on.', 'Yes.'];
const praise = (seed) => PRAISE[seed % PRAISE.length];

const meaningText = (card) => (card.englishMeanings || []).slice(0, 2).join(', ');
// Prompts and answers show the main senses; a long gloss list buries the word.
const promptMeaning = (card) => (card.englishMeanings || []).slice(0, 3).join(', ');
const displayWord = (card, showKanji) => (showKanji && card.kanji ? card.kanji : card.hiragana);

// Short line under the verdict title: when the word comes back.
function feedbackLine(verdict, answer, seed) {
  const wait = answer.after ? Date.parse(answer.after.due) - Date.now() : 0;
  const when = wait < 60 * 60 * 1000 ? 'in a few minutes' : `in ${describeWait(wait)}`;
  if (verdict === 'correct') return `${praise(seed)} Next review ${when}.`;
  if (verdict === 'close') return `Watch the spelling. Next review ${when}.`;
  return answer.requeued ? "You'll see it again later in this session." : `It comes back ${when}.`;
}

// Try saying the word and hear whether it was recognised, without grading.
export const SpeakCheck = ({ card }) => {
  const [state, setState] = useState({ status: 'idle' });
  const stopRef = useRef(null);
  useEffect(() => () => stopRef.current?.(), []);
  if (!canRecognizeSpeech()) return null;
  const start = (e) => {
    e.stopPropagation();
    setState({ status: 'listening' });
    const { promise, stop } = listenOnce();
    stopRef.current = stop;
    promise
      .then(alts => {
        const { verdict, heard } = checkSpoken(alts, card);
        setState({ status: verdict, heard });
        hapticBuzz(verdict === 'correct' ? 18 : [12, 30, 12]);
      })
      .catch(err => setState({ status: 'error', message: err.message }));
  };
  const messages = {
    correct: 'Sounds right.',
    close: 'Close. Listen again and retry.',
    wrong: "That didn't sound like it. Listen and try again."
  };
  return (
    <div class={`speak-check speak-${state.status}`} onClick={(e) => e.stopPropagation()}>
      <button class="speak-check-btn" onClick={start} disabled={state.status === 'listening'}>
        <IconMic size={16} />
        {state.status === 'listening' ? 'Listening...' : 'Say it'}
      </button>
      <p class="speak-check-result" aria-live="polite">
        {state.status === 'error' && state.message}
        {messages[state.status] && <>Heard <span class="speak-heard">{state.heard}</span>. {messages[state.status]}</>}
      </p>
    </div>
  );
};

// Grade buttons for self-graded cards: two (Don't know / Know it) or the
// four SRS grades, each labelled with when the word would come back.
export const GradeButtons = ({ count, record, onGrade }) => {
  const waits = useMemo(() => previewGrades(record), [record]);
  if (count === 4) {
    return (
      <div class="grade-buttons grade-4">
        {[1, 2, 3, 4].map(g => (
          <button key={g} class={`grade-btn grade-${g}`} onClick={(e) => { e.stopPropagation(); onGrade(g); }}>
            <span class="grade-label">{GRADE_LABELS[g]}</span>
            <span class="grade-wait">{shortWait(waits[g - 1])}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div class="action-buttons">
      <button class="btn-dont-know" onClick={(e) => { e.stopPropagation(); onGrade(GRADES.AGAIN); }}>
        <IconX />
        Don't know
      </button>
      <button class="btn-know" onClick={(e) => { e.stopPropagation(); onGrade(GRADES.GOOD); }}>
        <IconCheck />
        Know it
      </button>
    </div>
  );
};

// End-of-session screen, shared with the flip-card arena.
export const SessionSummary = ({ results, xp, streak, goal, nextReview, onReviewMissed, continueOption, onDone, doneLabel = 'Done' }) => {
  const firstTries = [];
  const seen = new Set();
  results.forEach(r => {
    if (seen.has(r.card.id)) return;
    seen.add(r.card.id);
    firstTries.push(r);
  });
  const correct = firstTries.filter(r => r.correct).length;
  const accuracy = firstTries.length > 0 ? Math.round((correct / firstTries.length) * 100) : null;
  const missed = firstTries.filter(r => !r.correct).map(r => r.card);
  const goalMet = goal && goal.done >= goal.target;
  return (
    <div id="summary" class="session-summary">
      <div class="summary-badge"><IconCheckCircle /></div>
      <h2>Session complete</h2>
      {accuracy !== null && (
        <p class="summary-accuracy"><strong>{accuracy}%</strong> right first time</p>
      )}
      <div class="summary-stats">
        <span id="known-count">{correct} <IconCheck width="15" height="15" /></span>
        <span id="unknown-count">{missed.length} <IconX width="15" height="15" /></span>
      </div>
      <dl class="summary-facts">
        {xp > 0 && (
          <div><dt>XP</dt><dd><IconBolt /> +{xp}</dd></div>
        )}
        {streak > 0 && (
          <div><dt>Streak</dt><dd><IconFlame width="16" height="16" /> {streak} day{streak === 1 ? '' : 's'}</dd></div>
        )}
        {goal && (
          <div><dt>Daily goal</dt><dd>{goalMet ? 'Met' : `${goal.done} / ${goal.target}`}</dd></div>
        )}
      </dl>
      {nextReview && <p class="summary-next muted">{nextReview}</p>}
      {missed.length > 0 && (
        <div id="missed-thumbnails">
          {missed.map(c => <div key={c.id} class="missed-thumb">{c.kanji || c.hiragana}</div>)}
        </div>
      )}
      {missed.length > 0 && onReviewMissed && (
        <button id="btn-review-missed" class="icon-text-btn" onClick={() => onReviewMissed(missed)}>
          Review missed ({missed.length})
        </button>
      )}
      {continueOption && (
        <button id="btn-new-session" class="icon-text-btn" onClick={continueOption.onClick}>
          {continueOption.label}
        </button>
      )}
      <button id="btn-summary-home" class="icon-text-btn outline-btn" onClick={onDone}>{doneLabel}</button>
    </div>
  );
};

// A study session over a queue of { card, format, encounter, isNew } items.
// Every answer is graded straight away through onGrade (which schedules the
// word and returns an undo token); a missed word is asked again, an easier
// way, a few cards later.
export default function ReviewSession({
  title, items: initialItems, pool, progress, settings, showKanji, onToggleKanji,
  notes, onNoteChange, wordIndex, relatedFor, aiFor, sentencesFor,
  onGrade, onUndo, onClose, summaryInfo, continueOption
}) {
  const [queue, setQueue] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('ask'); // 'ask' | 'answered'
  const [answer, setAnswer] = useState(null); // { verdict, grade, selected, typed, heard, token, after, requeued }
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]); // undo stack
  const [revealed, setRevealed] = useState(false); // flip cards
  const [hintShown, setHintShown] = useState(false);
  const [typed, setTyped] = useState('');
  const [kanaHint, setKanaHint] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakError, setSpeakError] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const startedAt = useRef(Date.now());
  const stopListening = useRef(null);
  const inputRef = useRef(null);
  const continueRef = useRef(null);

  const item = queue[index];
  const done = index >= queue.length;
  const card = item?.card;
  const format = item?.format;
  const record = card ? progress[card.id] : null;
  const sentences = useMemo(() => (card ? sentencesFor(card) : []), [card, sentencesFor]);
  const sentence = sentences.length > 0 ? sentences[(item?.encounter || 0) % sentences.length] : null;
  const options = useMemo(() => (item && CHOICE_FORMATS.has(item.format) ? optionsFor(item.card, pool) : []), [item, pool]);
  const timed = settings.timer > 0 && item && QUIZ_FORMATS.has(format) && phase === 'ask';
  const hint = card && isHard(record) && notes[card.id];
  const [introNoteEditing, setIntroNoteEditing] = useState(false);

  // Reset per-question state whenever a new question comes up.
  useEffect(() => {
    if (!item) return;
    setPhase('ask');
    setAnswer(null);
    setRevealed(false);
    setHintShown(false);
    setTyped('');
    setKanaHint(false);
    setSpeakError(null);
    setDetailsOpen(false);
    setIntroNoteEditing(false);
    startedAt.current = Date.now();
    if (format === 'listen' || (settings.autoplay && (format === 'intro' || format === 'recognize'))) {
      setTimeout(() => playWord(card), 250);
    }
    if (format === 'type') setTimeout(() => inputRef.current?.focus(), 60);
    return () => stopListening.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useEffect(() => {
    if (phase === 'answered') continueRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Records a grade and moves to the answered state (or straight on, for
  // self-graded cards). Misses are queued again a few cards later.
  const grade = useCallback((g, extra = {}) => {
    if (!item) return;
    const ms = Date.now() - startedAt.current;
    const token = onGrade(item.card, g, { format: item.format, ms });
    let insertedAt = null;
    if (g === GRADES.AGAIN && (item.requeue || 0) < MAX_REQUEUES) {
      insertedAt = Math.min(index + 4, queue.length);
      const again = { card: item.card, format: easierFormat(item.format === 'intro' ? 'recognize' : item.format), encounter: (item.encounter || 0) + 1, requeue: (item.requeue || 0) + 1 };
      setQueue(q => [...q.slice(0, insertedAt), again, ...q.slice(insertedAt)]);
    }
    const correct = g >= GRADES.HARD;
    setResults(r => [...r, { card: item.card, grade: g, correct, format: item.format, requeue: !!item.requeue, xp: token?.delta?.xp || 0 }]);
    setHistory(h => [...h, { index, token, insertedAt, removed: extra.removed || [] }]);
    hapticBuzz(correct ? 18 : [12, 30, 12]);
    return { token, requeued: insertedAt !== null };
  }, [item, index, queue, onGrade]);

  const next = useCallback(() => setIndex(i => i + 1), []);

  // Auto-graded answer: grade now, then show the verdict.
  const finish = useCallback((verdict, details = {}) => {
    if (phase !== 'ask') return;
    const ms = Date.now() - startedAt.current;
    let g = GRADES.AGAIN;
    if (verdict === 'correct') {
      g = format === 'type' && !kanaHint && !item.isNew && ms < FAST_RECALL_MS ? GRADES.EASY : GRADES.GOOD;
    } else if (verdict === 'close') {
      g = GRADES.HARD;
    }
    const { token, requeued } = grade(g);
    setAnswer({ verdict, grade: g, token, after: token?.after, requeued, ...details });
    setPhase('answered');
    if (settings.autoplay && format !== 'listen') playWord(card);
  }, [phase, format, kanaHint, item, grade, settings.autoplay, card]);

  // "Count it as correct": the learner knows better than the checker (an
  // alternate reading, a synonym). Swap the grade for a Good.
  const overrideCorrect = () => {
    const last = history[history.length - 1];
    if (!last || !answer) return;
    onUndo(last.token);
    if (last.insertedAt !== null) setQueue(q => [...q.slice(0, last.insertedAt), ...q.slice(last.insertedAt + 1)]);
    setHistory(h => h.slice(0, -1));
    setResults(r => r.slice(0, -1));
    const { token } = grade(GRADES.GOOD);
    setAnswer(a => ({ ...a, verdict: 'correct', grade: GRADES.GOOD, token, after: token?.after, requeued: false, overridden: true }));
  };

  // Undo the most recent grade and ask that question again.
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    onUndo(last.token);
    setQueue(q => {
      let out = [...q];
      if (last.insertedAt !== null) out = [...out.slice(0, last.insertedAt), ...out.slice(last.insertedAt + 1)];
      last.removed.forEach(({ at, item: removedItem }) => { out = [...out.slice(0, at), removedItem, ...out.slice(at)]; });
      return out;
    });
    setHistory(h => h.slice(0, -1));
    setResults(r => r.slice(0, -1));
    if (index === last.index) {
      // Still on the answered question: just ask it again.
      setPhase('ask');
      setAnswer(null);
      setTyped('');
      startedAt.current = Date.now();
    } else {
      // The reset effect runs for the restored question.
      setIndex(last.index);
    }
  };

  // Intro card: "I know this already" skips its first quiz and schedules it
  // as easy.
  const knowAlready = () => {
    const removed = [];
    queue.forEach((q, i) => {
      if (i > index && q.card.id === card.id && q.isNew) removed.push({ at: i, item: q });
    });
    grade(GRADES.EASY, { removed });
    if (removed.length > 0) {
      const drop = new Set(removed.map(r => r.at));
      setQueue(q => q.filter((_, i) => !drop.has(i)));
    }
    next();
  };

  const selfGrade = (g) => {
    grade(g);
    next();
  };

  const submitTyped = () => {
    if (!typed.trim()) return;
    finish(checkAnswer(typed, card), { typed });
  };

  const startSpeaking = () => {
    setSpeakError(null);
    setListening(true);
    const { promise, stop } = listenOnce();
    stopListening.current = stop;
    promise
      .then(alts => {
        const { verdict, heard } = checkSpoken(alts, card);
        finish(verdict, { heard });
      })
      .catch(err => setSpeakError(err.message))
      .finally(() => setListening(false));
  };

  const switchToTyping = () => {
    stopListening.current?.();
    setQueue(q => q.map((qi, i) => (i === index ? { ...qi, format: 'type' } : qi)));
  };

  // Countdown for timed questions; running out counts as a miss.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!timed) { setTimeLeft(null); return; }
    const limit = settings.timer;
    const start = Date.now();
    setTimeLeft(limit);
    const iv = setInterval(() => {
      const left = Math.max(0, limit - Math.floor((Date.now() - start) / 1000));
      setTimeLeft(left);
      if (Date.now() - start >= limit * 1000) {
        clearInterval(iv);
        finishRef.current('timeout');
      }
    }, 200);
    return () => clearInterval(iv);
  }, [timed, item, settings.timer]);

  // Keyboard: 1-4 pick an answer or grade, Enter/Space continue or reveal,
  // Escape leaves.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (done || !item) return;
    const typing = isTypingTarget(e.target);
    if (phase === 'answered') {
      if ((e.key === 'Enter' || e.key === ' ') && !typing) { e.preventDefault(); next(); }
      return;
    }
    if (typing) return;
    if (format === 'intro' && e.key === 'Enter') { e.preventDefault(); next(); return; }
    if (format === 'flip') {
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setRevealed(true); if (settings.autoplay) playWord(card); return; }
      if (revealed) {
        if (settings.gradeButtons === 4 && ['1', '2', '3', '4'].includes(e.key)) selfGrade(Number(e.key));
        if (e.key === 'ArrowRight') selfGrade(GRADES.GOOD);
        if (e.key === 'ArrowLeft') selfGrade(GRADES.AGAIN);
      }
      return;
    }
    if (CHOICE_FORMATS.has(format)) {
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) finish(options[n - 1].id === card.id ? 'correct' : 'wrong', { selected: options[n - 1].id });
    }
  };
  useEffect(() => {
    const handler = (e) => keyRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const reviewMissed = (missed) => {
    setQueue(missed.map(c => ({ card: c, format: easierFormat(settings.reviewStyle === 'flip' ? 'flip' : 'recognize'), encounter: (progress[c.id]?.timesReviewed || 0) + 1 })));
    setIndex(0);
    setResults([]);
    setHistory([]);
  };

  if (done) {
    const xp = results.reduce((sum, r) => sum + r.xp, 0);
    return (
      <div class="review-session" role="dialog" aria-label={`${title}: summary`}>
        <SessionSummary
          results={results}
          xp={xp}
          streak={summaryInfo?.streak}
          goal={summaryInfo?.goal}
          nextReview={summaryInfo?.nextReview}
          onReviewMissed={reviewMissed}
          continueOption={continueOption}
          onDone={onClose}
        />
      </div>
    );
  }

  const correctId = card.id;
  const detailsProps = {
    card,
    showKanji,
    sentences,
    encounter: item.encounter || 0,
    noteText: notes[card.id] || '',
    onNoteChange: (val) => onNoteChange(card.id, val),
    wordIndex,
    related: relatedFor(card),
    ai: aiFor(card)
  };

  // ---------- Prompt (the question side) ----------
  const renderPrompt = () => {
    if (format === 'intro') {
      return (
        <div class="rv-prompt rv-intro">
          <CardImage card={card} show={settings.pictures} />
          <p class="rv-word">{displayWord(card, showKanji)}</p>
          {showKanji && card.kanji && <p class="rv-reading">{card.hiragana}</p>}
          <p class="rv-romaji">{card.romaji}</p>
          <WordAudio card={card} size={20} />
          <p class="rv-meaning">{promptMeaning(card)}</p>
        </div>
      );
    }
    if (format === 'flip') {
      return (
        <div class="rv-prompt">
          <CardImage card={card} show={settings.pictures} />
          <p class="rv-word">{displayWord(card, showKanji)}</p>
          {showKanji && card.kanji && <p class="rv-reading">{card.hiragana}</p>}
          {revealed && <p class="rv-romaji">{card.romaji}</p>}
          <WordAudio card={card} size={20} />
          {revealed && <p class="rv-meaning">{promptMeaning(card)}</p>}
        </div>
      );
    }
    if (format === 'recognize') {
      return (
        <div class="rv-prompt">
          <p class="rv-word">{displayWord(card, showKanji)}</p>
          {showKanji && card.kanji && <p class="rv-reading">{card.hiragana}</p>}
          <WordAudio card={card} size={20} />
        </div>
      );
    }
    if (format === 'listen') {
      return (
        <div class="rv-prompt">
          <button class="rv-listen-btn" aria-label="Play the word again" onClick={() => playWord(card)}>
            <IconSpeaker size={40} />
          </button>
          <button class="btn-audio-slow" onClick={() => playWord(card, { rate: SLOW_RATE })}>Play slowly</button>
        </div>
      );
    }
    if (format === 'context' && sentence) {
      return (
        <div class="rv-prompt rv-context">
          <p class="rv-sentence">
            <SentenceTokens sentence={sentence} showKanji={showKanji} highlight={isTokenOfCard(card)} />
          </p>
          <p class="rv-context-word">{displayWord(card, showKanji)}{showKanji && card.kanji ? ` (${card.hiragana})` : ''}</p>
        </div>
      );
    }
    // produce, type, speak, and context without a sentence: English prompt.
    return (
      <div class="rv-prompt">
        <CardImage card={card} show={settings.pictures} />
        <p class="rv-english">{promptMeaning(card)}</p>
        <span class="pos-pill muted">{card.partOfSpeech}</span>
      </div>
    );
  };

  // ---------- Answer area (bottom third, thumb reach) ----------
  const renderAsk = () => {
    if (format === 'intro') {
      return (
        <div class="rv-actions">
          <button class="rv-primary" onClick={next}>Got it</button>
          <button class="rv-secondary" onClick={knowAlready}>I already know this</button>
        </div>
      );
    }
    if (format === 'flip') {
      return revealed ? (
        <GradeButtons count={settings.gradeButtons} record={record} onGrade={selfGrade} />
      ) : (
        <div class="rv-actions">
          <button class="rv-primary" onClick={() => { setRevealed(true); if (settings.autoplay) playWord(card); }}>Show answer</button>
        </div>
      );
    }
    if (CHOICE_FORMATS.has(format)) {
      const japaneseOptions = format === 'produce';
      return (
        <div class={`rv-options ${japaneseOptions ? 'rv-options-jp' : ''}`} role="group" aria-label="Answer options">
          {options.map((opt, i) => (
            <button
              key={opt.id}
              class="rv-option"
              onClick={() => finish(opt.id === correctId ? 'correct' : 'wrong', { selected: opt.id })}
            >
              <span class="rv-option-key" aria-hidden="true">{i + 1}</span>
              {japaneseOptions ? (
                <span class="rv-option-jp">
                  {displayWord(opt, showKanji)}
                  {showKanji && opt.kanji && <small>{opt.hiragana}</small>}
                </span>
              ) : (
                <span class="rv-option-text">{meaningText(opt)}</span>
              )}
            </button>
          ))}
        </div>
      );
    }
    if (format === 'type') {
      return (
        <form class="rv-type" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
          <label class="rv-type-label" htmlFor="rv-type-input">Reading, in kana or romaji</label>
          <input
            id="rv-type-input"
            ref={inputRef}
            class="rv-type-input"
            lang="ja"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            value={typed}
            onChange={(e) => {
              const value = e.target.value;
              setTyped(e.nativeEvent.isComposing ? value : wanakana.toKana(value, { IMEMode: true }));
            }}
          />
          {kanaHint && <p class="rv-type-hint">Starts with <strong>{card.hiragana[0]}</strong>, {card.hiragana.length} kana</p>}
          <div class="rv-type-actions">
            <button type="button" class="rv-secondary" onClick={() => finish('wrong', { typed: '' })}>I don't know</button>
            {!kanaHint && <button type="button" class="rv-secondary" onClick={() => { setKanaHint(true); inputRef.current?.focus(); }}>Hint</button>}
            <button type="submit" class="rv-primary" disabled={!typed.trim()}>Check</button>
          </div>
        </form>
      );
    }
    if (format === 'speak') {
      return (
        <div class="rv-actions">
          <button class={`rv-mic ${listening ? 'listening' : ''}`} onClick={startSpeaking} disabled={listening} aria-label="Start speaking">
            <IconMic size={30} />
          </button>
          <p class="rv-mic-label" aria-live="polite">{listening ? 'Listening...' : speakError || 'Tap and say the word'}</p>
          <div class="rv-type-actions">
            <button class="rv-secondary" onClick={() => finish('wrong', { heard: '' })}>I don't know</button>
            <button class="rv-secondary" onClick={switchToTyping}>Type instead</button>
          </div>
        </div>
      );
    }
    return null;
  };

  // What was asked, what they picked, and the full answer, in the scrolling
  // area; the Continue button stays in the bottom bar.
  const renderFeedback = () => {
    const good = answer.verdict === 'correct';
    const close = answer.verdict === 'close';
    return (
      <div class={`rv-feedback ${good ? 'is-correct' : close ? 'is-close' : 'is-wrong'}`}>
        <div class="rv-verdict" role="status">
          <span class="rv-verdict-icon">{good || close ? <IconCheck /> : <IconX />}</span>
          <div>
            <p class="rv-verdict-title">{good ? 'Correct' : close ? 'Almost' : answer.verdict === 'timeout' ? 'Time is up' : 'Not quite'}</p>
            <p class="rv-verdict-line">{feedbackLine(answer.verdict, answer, results.length)}</p>
          </div>
        </div>

        {CHOICE_FORMATS.has(format) && answer.selected && answer.selected !== correctId && (
          <p class="rv-your-answer">
            You picked <span>{format === 'produce' ? displayWord(options.find(o => o.id === answer.selected) || card, showKanji) : meaningText(options.find(o => o.id === answer.selected) || card)}</span>
          </p>
        )}
        {(answer.typed || answer.heard) && !good && (
          <p class="rv-your-answer">{answer.typed ? 'You typed' : 'Heard'} <span lang="ja">{answer.typed || answer.heard}</span></p>
        )}

        <div class="rv-answer-card">
          <CardImage card={card} show={settings.pictures} />
          <div class="rv-answer-head">
            <div>
              <p class="rv-answer-word">{displayWord(card, showKanji)}</p>
              <p class="rv-answer-reading">{showKanji && card.kanji ? `${card.hiragana}, ` : ''}{card.romaji}</p>
            </div>
            <WordAudio card={card} size={18} className="btn-audio rv-answer-audio" />
          </div>
          <p class="rv-answer-meaning">{promptMeaning(card)}</p>
          {sentence && !detailsOpen && (
            <div class="rv-answer-sentence">
              <p lang="ja"><SentenceTokens sentence={sentence} showKanji={showKanji} highlight={isTokenOfCard(card)} /></p>
              <p class="muted">{sentence.english}</p>
            </div>
          )}
          {settings.speaking && <SpeakCheck key={card.id} card={card} />}
          <button class="rv-more" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(o => !o)}>
            {detailsOpen ? 'Hide details' : 'Notes, grammar and more'}
          </button>
          {detailsOpen && <div class="rv-details"><WordDetails key={card.id} {...detailsProps} hideHead /></div>}
        </div>
      </div>
    );
  };

  const renderContinue = () => {
    const canOverride = answer.verdict !== 'correct' && (format === 'type' || format === 'speak') && !answer.overridden;
    return (
      <div class="rv-actions">
        {canOverride && <button class="rv-secondary" onClick={overrideCorrect}>Count it as correct</button>}
        <button ref={continueRef} class="rv-primary" onClick={next}>Continue</button>
      </div>
    );
  };

  const progressPct = (index / queue.length) * 100;
  const label = phase === 'ask' ? (FORMAT_LABELS[format] || '') : '';

  return (
    <div class="review-session" role="dialog" aria-label={title}>
      <div id="progress-bar-track">
        <div id="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
      </div>
      <div class="rv-header">
        <button id="btn-back-home" onClick={onClose} aria-label="End session">End</button>
        <p class="rv-counter">{title} <span class="muted">{index + 1} of {queue.length}</span></p>
        {history.length > 0 ? (
          <button class="rv-undo" onClick={undo} aria-label="Undo last answer"><IconUndo /> Undo</button>
        ) : card.kanji ? (
          <label class="setting-toggle">
            <input type="checkbox" checked={showKanji} onChange={onToggleKanji} aria-label="Show kanji" />
            <span>Kanji</span>
          </label>
        ) : <span class="arena-header-spacer" aria-hidden="true"></span>}
      </div>

      {timed && timeLeft !== null && (
        <div class="rv-timer" role="timer" aria-label={`${timeLeft} seconds left`}>
          <div class="rv-timer-track"><div class="rv-timer-fill" key={index} style={{ animationDuration: `${settings.timer}s` }}></div></div>
          <span class="rv-timer-secs">{timeLeft}s</span>
        </div>
      )}

      <div class="rv-body">
        {phase === 'ask' ? (
          <div class={`rv-card ${format === 'flip' && revealed ? 'is-revealed' : ''}`} key={`${index}-${card.id}`}>
            {label && <p class="rv-question">{label}</p>}
            {renderPrompt()}
            {hint && format !== 'intro' && !(format === 'flip' && revealed) && (
              hintShown
                ? <p class="rv-hint"><IconLightbulb /> {notes[card.id]}</p>
                : <button class="rv-hint-btn" onClick={() => setHintShown(true)}><IconLightbulb /> Show my hint</button>
            )}
            {format === 'intro' && sentence && (
              <div class="rv-intro-sentence">
                <p lang="ja"><SentenceTokens sentence={sentence} showKanji={showKanji} highlight={isTokenOfCard(card)} /></p>
                <p class="muted">{sentence.english}</p>
              </div>
            )}
            {format === 'intro' && (
              <div class="rv-intro-note">
                <NoteSection
                  noteText={notes[card.id] || ''}
                  editing={introNoteEditing}
                  onStartEdit={() => setIntroNoteEditing(true)}
                  onChange={(val) => onNoteChange(card.id, val)}
                  onDone={() => setIntroNoteEditing(false)}
                />
              </div>
            )}
            {format === 'flip' && revealed && (
              <div class="rv-details rv-flip-back">
                <WordDetails key={card.id} {...detailsProps} hideHead />
              </div>
            )}
          </div>
        ) : renderFeedback()}
      </div>

      <div class="rv-bottom">
        {phase === 'ask' ? renderAsk() : renderContinue()}
      </div>
    </div>
  );
}
