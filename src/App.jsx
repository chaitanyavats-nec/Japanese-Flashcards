import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as wanakana from 'wanakana';
import packsRegistry from '../packs.json';

const LEVEL_COLORS = {
  1: 'var(--level-1)',
  2: 'var(--level-2)',
  3: 'var(--level-3)',
  4: 'var(--level-4)'
};

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  window.speechSynthesis.speak(ut);
}

const formatSentenceJapanese = (sentence, showKanji) => {
  if (!sentence) return '';
  if (showKanji) {
    return sentence.spacedJapanese || sentence.japanese;
  }
  return sentence.spacedHiragana || sentence.hiragana || sentence.japanese;
};

const formatSentenceRomaji = (sentence) => {
  if (!sentence) return '';
  if (sentence.spacedRomaji) return sentence.spacedRomaji;
  if (sentence.spacedHiragana) return wanakana.toRomaji(sentence.spacedHiragana);
  if (sentence.hiragana) return wanakana.toRomaji(sentence.hiragana);
  return sentence.romaji ? sentence.romaji.replace(/([.?!,])/g, '$1 ') : '';
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
  const [isFlipped, setIsFlipped] = useState(false);
  const [strokeShown, setStrokeShown] = useState(false);
  const [svgsMap, setSvgsMap] = useState({});

  // Swipe & gesture refs
  const cardRef = useRef(null);
  const scrollableRef = useRef(null);
  const [hasScrollFade, setHasScrollFade] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, isDragging: false, wasDragged: false, dragX: 0 });
  const [swipeOverlay, setSwipeOverlay] = useState({ know: 0, dont: 0 });

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
    setIsFlipped(false);
    setSwipeOverlay({ know: 0, dont: 0 });
    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
      cardRef.current.style.transform = 'translateY(0) scale(1)';
      cardRef.current.style.opacity = '1';
      cardRef.current.style.animation = 'none';
    }
    checkScrollFade();
  }, [currentIndex, checkScrollFade]);

  const advanceDeck = useCallback((verdict) => {
    if (!currentCard) return;
    if (verdict === 'know') {
      setKnown(prev => [...prev, currentCard]);
    } else {
      setUnknown(prev => [...prev, currentCard]);
    }
    saveWordProgress(currentCard.id, verdict);

    if (currentIndex + 1 >= remaining.length) {
      setScreen('summary');
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentCard, currentIndex, remaining.length]);

  const judgeCard = useCallback((verdict) => {
    if (!cardRef.current) {
      advanceDeck(verdict);
      return;
    }
    const exitX = verdict === 'know' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
    const rot = verdict === 'know' ? 22 : -22;
    setSwipeOverlay({ know: verdict === 'know' ? 1 : 0, dont: verdict === 'dont' ? 1 : 0 });
    
    cardRef.current.style.transition = 'transform 320ms ease-out, opacity 320ms ease-out';
    cardRef.current.style.transform = `translateX(${exitX}px) rotate(${rot}deg)`;
    cardRef.current.style.opacity = '0';
    
    setTimeout(() => {
      advanceDeck(verdict);
    }, 320);
  }, [advanceDeck]);

  // Keyboard navigation
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
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.tagName === 'A') return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      isDragging: true,
      wasDragged: false,
      dragX: 0
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
      } catch (err) {}
    }

    const rot = (dragX / cardRef.current.offsetWidth) * 15;
    cardRef.current.style.transform = `translateX(${dragX}px) rotate(${rot}deg)`;

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
    } catch (err) {}

    const { dragX, startTime } = dragRef.current;
    const dt = Math.max(Date.now() - startTime, 1);
    const velocity = dragX / dt;

    if (Math.abs(dragX) > 90 || Math.abs(velocity) > 0.4) {
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

  // Group cards by word pack (packs.json registry) for the alternate,
  // customizable browsing view — a card can belong to more than one pack.
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

  if (loading) {
    return <div style={{ color: 'white', textAlign: 'center', padding: '40px' }}>Loading datasets...</div>;
  }

  if (error) {
    return <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '40px' }}>Error: {error}</div>;
  }

  const displayKanji = showKanji && currentCard?.kanji;

  return (
    <>
      {/* Home Screen */}
      {screen === 'home' && (
        <div id="home-screen">
          <div class="home-header">
            <div class="brand">
              <span class="brand-mark">日</span>
              <div class="brand-text">
                <h1>Learning Path</h1>
                <p class="brand-subtitle">Progress through Japanese, one level at a time</p>
              </div>
            </div>
            <div class="header-actions">
              <label class="setting-toggle">
                <input type="checkbox" checked={showKanji} onChange={handleToggleKanji} />
                <span>Kanji</span>
              </label>
              <p class="streak-indicator">🔥 1 Day Streak</p>
            </div>
          </div>
          <div class="home-view-toggle">
            <button
              class={homeView === 'learning-path' ? 'active' : ''}
              onClick={() => setHomeView('learning-path')}
            >
              Learning Path
            </button>
            <button
              class={homeView === 'word-packs' ? 'active' : ''}
              onClick={() => setHomeView('word-packs')}
            >
              Word Packs
            </button>
          </div>
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
              const knownCount = cards.filter(c => progress[c.id] && progress[c.id].status === 'know').length;
              const total = cards.length;
              const percent = total > 0 ? (knownCount / total) * 100 : 0;

              return (
                <div key={key} class="collection-card" onClick={() => startSession(cards)}>
                  <div class="level-badge" style={{ background: color, '--level-glow': color }}>{badge}</div>
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
                </div>
              );
            })}
          </div>
          <p class="corpus-credit muted">Example sentences adapted from the Tanaka Corpus (CC BY 2.0).</p>
        </div>
      )}

      {/* Arena Header & Progress */}
      {screen === 'arena' && currentCard && (
        <>
          <div id="progress-bar-track">
            <div id="progress-bar-fill" style={{ width: `${(currentIndex / remaining.length) * 100}%` }}></div>
          </div>
          <div id="arena-header">
            <button id="btn-back-home" onClick={() => setScreen('home')}>← Back</button>
            <p id="progress-label">{currentIndex + 1} of {remaining.length} cards</p>
            <label class="setting-toggle">
              <input type="checkbox" checked={showKanji} onChange={handleToggleKanji} />
              <span>Kanji</span>
            </label>
          </div>

          <div id="card-arena">
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
              <div id="card-inner" class={isFlipped ? 'flipped' : ''}>
                {/* FRONT FACE */}
                <div class="card-face" id="card-front">
                  <div class="card-topbar">
                    <span id="card-tag" class="tag-chip">{currentCard.theme || currentCard.tierName}</span>
                    <span id="card-counter" class="muted">{currentIndex + 1} / {remaining.length}</span>
                  </div>
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
                    {currentCard.breakdown && currentCard.breakdown.length > 0 && (
                      <div class="breakdown-section">
                        <div class="grammar-title">Word Breakdown</div>
                        <div class="breakdown-row">
                          {currentCard.breakdown.map((part, i) => (
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
                    {currentCard.conjugations && (
                      <div class="grammar-section">
                        <div class="grammar-title">Tense &amp; Forms</div>
                        <div class="conjugation-grid">
                          {['present', 'presentPolite', 'past', 'pastPolite', 'negative', 'negativePolite', 'teForm', 'potential'].map(k => (
                            currentCard.conjugations[k] ? (
                              <React.Fragment key={k}>
                                <div class="conj-label">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                                <div class="conj-value">{currentCard.conjugations[k]}</div>
                              </React.Fragment>
                            ) : null
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Particle Usage */}
                    {currentCard.particleUsage && currentCard.particleUsage.length > 0 && (
                      <div class="particle-section">
                        <div class="grammar-title">Common Particles</div>
                        <div class="particle-list">
                          {currentCard.particleUsage.map((p, i) => (
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
                            {formatSentenceJapanese(currentCard.exampleSentence, displayKanji)}
                          </p>
                          {formatSentenceRomaji(currentCard.exampleSentence) && (
                            <p class="sentence-romaji muted">
                              {formatSentenceRomaji(currentCard.exampleSentence)}
                            </p>
                          )}
                          <div class="sentence-divider"></div>
                          <p class="sentence-english">{currentCard.exampleSentence.english}</p>
                        </div>
                      </div>
                    )}
                    <div class="scroll-spacer"></div>
                  </div>
                  <div class={`scroll-fade ${hasScrollFade ? 'visible' : ''}`}></div>

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

              <div class="swipe-label swipe-know" style={{ opacity: swipeOverlay.know }}>Know it ✓</div>
              <div class="swipe-label swipe-dont" style={{ opacity: swipeOverlay.dont }}>✗ Don't know</div>
            </div>
          </div>
        </>
      )}

      {/* Summary Screen */}
      {screen === 'summary' && (
        <div id="summary">
          <div class="summary-badge">🎉</div>
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
