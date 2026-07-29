const state = {
  allCards: [],
  deck: [],
  remaining: [],
  known: [],
  unknown: [],
  currentIndex: 0,
  isFlipped: false,
  progress: {},
  streak: 0
};

// Persistence functions
function loadProgress() {
  try {
    const saved = localStorage.getItem('flashcards_progress');
    if (saved) state.progress = JSON.parse(saved);
  } catch (e) {
    console.error("Failed to load progress from localStorage", e);
  }
}

function saveProgress(wordId, status) {
  if (!state.progress[wordId]) {
    state.progress[wordId] = { timesReviewed: 0 };
  }
  state.progress[wordId].status = status;
  state.progress[wordId].timesReviewed++;
  state.progress[wordId].lastReviewedAt = new Date().toISOString();
  
  try {
    localStorage.setItem('flashcards_progress', JSON.stringify(state.progress));
  } catch (e) {
    console.error("Failed to save progress", e);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderHomeScreen() {
  document.getElementById('home-screen').hidden = false;
  document.getElementById('card-arena').hidden = true;
  document.getElementById('summary').hidden = true;
  document.getElementById('arena-header').hidden = true;
  document.getElementById('progress-bar-track').hidden = true;

  const collectionsList = document.getElementById('collections-list');
  collectionsList.innerHTML = '';

  // Group cards into collections by their category assigned in the pipeline
  const collections = {};
  state.allCards.forEach(card => {
    const level = (card.categories && card.categories.length > 0) ? card.categories[0] : 'Uncategorized';
    if (!collections[level]) collections[level] = [];
    collections[level].push(card);
  });

  // Sort collections by N-level intuitively if possible
  const sortedKeys = Object.keys(collections).sort().reverse(); 

  sortedKeys.forEach(key => {
    const cards = collections[key];
    const knownCount = cards.filter(c => state.progress[c.id] && state.progress[c.id].status === 'know').length;
    const total = cards.length;
    const percent = total > 0 ? (knownCount / total) * 100 : 0;

    const cardEl = document.createElement('div');
    cardEl.className = 'collection-card';
    cardEl.innerHTML = `
      <div class="collection-header">
        <h3 class="collection-title">${key}</h3>
        <span class="collection-badge">${total} Words</span>
      </div>
      <div class="collection-stats">${knownCount} / ${total} known</div>
      <div class="collection-progress-bg">
        <div class="collection-progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    cardEl.onclick = () => initSession(cards);
    collectionsList.appendChild(cardEl);
  });
}

function initSession(cardsArray) {
  if (!cardsArray || cardsArray.length === 0) return;
  state.deck = cardsArray;
  // For the session, we prioritize un-known or unseen cards if we want, but for now just shuffle all
  state.remaining = shuffle([...cardsArray]);
  state.known = [];
  state.unknown = [];
  state.currentIndex = 0;
  state.isFlipped = false;

  document.getElementById('home-screen').hidden = true;
  document.getElementById('card-arena').hidden = false;
  document.getElementById('summary').hidden = true;
  document.getElementById('arena-header').hidden = false;
  document.getElementById('progress-bar-track').hidden = false;

  const card = document.getElementById('card');
  card.style.transition = 'none';
  card.style.transform = 'none';
  card.style.opacity = '1';

  const inner = document.getElementById('card-inner');
  inner.classList.remove('flipped');
  inner.style.transition = 'none';

  resetOverlays();

  requestAnimationFrame(() => {
    inner.style.transition = 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)';
    render();
  });
}

function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  window.speechSynthesis.speak(ut);
}

function render() {
  if (state.currentIndex >= state.remaining.length) {
    showSummary();
    return;
  }

  const current = state.remaining[state.currentIndex];
  const progressRatio = state.currentIndex / state.remaining.length;
  document.getElementById('progress-bar-fill').style.width = `${progressRatio * 100}%`;
  document.getElementById('progress-label').textContent = `${state.currentIndex + 1} of ${state.remaining.length} cards`;

  const counterText = `${state.currentIndex + 1} / ${state.remaining.length}`;
  document.getElementById('card-counter').textContent = counterText;
  document.querySelector('.card-counter-back').textContent = counterText;

  // Front Face
  const front = document.getElementById('card-front');
  const imgEl = front.querySelector('.card-image');
  const creditEl = front.querySelector('.image-credit');
  
  if (current.image && current.image.localPath) {
    imgEl.src = `public/${current.image.localPath}`;
    imgEl.style.display = 'block';
    creditEl.innerHTML = `Photo by <a href="${current.image.photographerUrl}" target="_blank">${current.image.photographer}</a>`;
  } else {
    imgEl.src = '';
    imgEl.style.display = 'none';
    creditEl.innerHTML = '';
  }

  front.querySelector('.kanji-word').textContent = current.kanji || current.hiragana;
  front.querySelector('.hiragana-word').textContent = current.kanji ? current.hiragana : '';
  
  const btnAudio = front.querySelector('.btn-audio');
  btnAudio.onclick = (e) => {
    e.stopPropagation();
    speak(current.audio.ttsText, current.audio.lang);
  };

  // Preload next image
  if (state.currentIndex + 1 < state.remaining.length) {
    const next = state.remaining[state.currentIndex + 1];
    if (next.image && next.image.localPath) {
      const preload = new Image();
      preload.src = `public/${next.image.localPath}`;
    }
  }

  // Back Face
  const back = document.getElementById('card-back');
  
  back.querySelector('.romaji-word').textContent = current.romaji;
  back.querySelector('.katakana-word').textContent = current.katakana;
  back.querySelector('.meaning').textContent = current.englishMeanings.join(', ');
  
  let posText = current.partOfSpeech;
  if (current.verbType) posText += ` (${current.verbType})`;
  else if (current.isNaAdjective) posText += ` (na-adjective)`;
  back.querySelector('.pos-pill').textContent = posText;

  // Kanji VG
  const kanjiCont = back.querySelector('.kanji-vg-container');
  kanjiCont.innerHTML = '';
  if (current.strokeOrderSvgs && current.strokeOrderSvgs.length > 0) {
    current.strokeOrderSvgs.forEach(svgPath => {
      fetch(`public/${svgPath}`)
        .then(res => res.text())
        .then(svgText => { kanjiCont.innerHTML += svgText; })
        .catch(e => console.log('SVG not found', e));
    });
  }

  // Grammar (Conjugations / Particles)
  const grammarSec = back.querySelector('.grammar-section');
  grammarSec.innerHTML = '';
  if (current.conjugations) {
    grammarSec.innerHTML = '<hr class="section-divider"><div class="grammar-title">Conjugations</div>';
    const grid = document.createElement('div');
    grid.className = 'conjugation-grid';
    const keys = ['present', 'presentPolite', 'past', 'pastPolite', 'negative', 'negativePolite', 'teForm', 'potential'];
    keys.forEach(k => {
      if (current.conjugations[k]) {
        grid.innerHTML += `<div class="conj-label">${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                           <div class="conj-value">${current.conjugations[k]}</div>`;
      }
    });
    grammarSec.appendChild(grid);
  } else if (current.particleUsage) {
    grammarSec.innerHTML = '<hr class="section-divider"><div class="grammar-title">Particle Usage</div>';
    const list = document.createElement('div');
    list.className = 'particle-list';
    current.particleUsage.forEach(p => {
      list.innerHTML += `<div class="particle-row">
                           <span class="p-bold">${p.particle}</span>
                           <span>${p.example}</span>
                           <span class="muted">(${p.translation})</span>
                         </div>`;
    });
    grammarSec.appendChild(list);
  }

  // Example Sentence
  const bSent = back.querySelector('.sentence-section');
  if (current.exampleSentence) {
    bSent.style.display = 'block';
    bSent.querySelector('.sentence-japanese').textContent = current.exampleSentence.japanese;
    bSent.querySelector('.sentence-english').textContent = current.exampleSentence.english;
  } else {
    bSent.style.display = 'none';
  }

  document.getElementById('card-inner').classList.toggle('flipped', state.isFlipped);
}

function flipCard() {
  state.isFlipped = !state.isFlipped;
  document.getElementById('card-inner').classList.toggle('flipped', state.isFlipped);
}

function advanceDeck(verdict) {
  const current = state.remaining[state.currentIndex];
  
  verdict === 'know' ? state.known.push(current) : state.unknown.push(current);
  saveProgress(current.id, verdict);

  state.currentIndex++;
  state.isFlipped = false;

  const card = document.getElementById('card');
  card.style.transition = 'none';
  card.style.transform = 'none';
  card.style.opacity = '1';

  const inner = document.getElementById('card-inner');
  inner.style.transition = 'none';
  inner.classList.remove('flipped');
  resetOverlays();

  requestAnimationFrame(() => {
    inner.style.transition = 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)';
    if (state.currentIndex >= state.remaining.length) {
      document.getElementById('progress-bar-fill').style.width = `100%`;
      document.getElementById('progress-label').textContent = `${state.remaining.length} of ${state.remaining.length} cards`;
      showSummary();
    } else {
      render();
    }
  });
}

function judgeCard(verdict) {
  const exitX = verdict === 'know' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
  const rot = verdict === 'know' ? 25 : -25;
  const card = document.getElementById('card');
  card.style.transition = 'transform 350ms ease, opacity 350ms ease';
  card.style.transform = `translateX(${exitX}px) rotate(${rot}deg)`;
  card.style.opacity = '0';
  setTimeout(() => advanceDeck(verdict), 350);
}

function snapBack() {
  const card = document.getElementById('card');
  card.style.transition = 'transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  card.style.transform = 'translateX(0) rotate(0deg)';
  resetOverlays();
}

function resetOverlays() {
  document.querySelector('.swipe-know').style.opacity = '0';
  document.querySelector('.swipe-dont').style.opacity = '0';
}

function showSummary() {
  document.getElementById('card-arena').hidden = true;
  document.getElementById('arena-header').hidden = true;
  document.getElementById('progress-bar-track').hidden = true;
  document.getElementById('summary').hidden = false;
  
  document.getElementById('known-count').textContent = `${state.known.length} ✓`;
  document.getElementById('unknown-count').textContent = `${state.unknown.length} ✗`;
  
  const missedCont = document.getElementById('missed-thumbnails');
  missedCont.innerHTML = '';
  state.unknown.forEach(c => {
    const el = document.createElement('div');
    el.className = 'missed-thumb';
    el.textContent = c.kanji || c.hiragana;
    missedCont.appendChild(el);
  });
  
  document.getElementById('btn-review-missed').disabled = state.unknown.length === 0;
}

// Global Event Listeners
document.getElementById('card').addEventListener('click', e => {
  if (e.target.closest('button')) return; // ignore action buttons
  if (e.target.tagName === 'A') return; // ignore links
  flipCard();
});

document.querySelector('.btn-know').addEventListener('click', e => {
  e.stopPropagation();
  judgeCard('know');
});
document.querySelector('.btn-dont-know').addEventListener('click', e => {
  e.stopPropagation();
  judgeCard('dont');
});

document.getElementById('btn-review-missed').addEventListener('click', () => {
  initSession(state.unknown);
});
document.getElementById('btn-new-session').addEventListener('click', () => {
  initSession(state.deck); // restart same deck
});
document.getElementById('btn-back-home').addEventListener('click', () => {
  renderHomeScreen();
});
document.getElementById('btn-summary-home').addEventListener('click', () => {
  renderHomeScreen();
});

// Pointer events for dragging
let startX, startY, startTime, isDragging = false, dragX = 0;
const swipeCard = document.getElementById('card');

swipeCard.addEventListener('pointerdown', e => {
  if (e.target.closest('button') || e.target.tagName === 'A') return;
  startX = e.clientX;
  startY = e.clientY;
  startTime = Date.now();
  isDragging = true;
  dragX = 0;
  swipeCard.setPointerCapture(e.pointerId);
  swipeCard.style.transition = 'none';
});

swipeCard.addEventListener('pointermove', e => {
  if (!isDragging) return;
  dragX = e.clientX - startX;
  const dragY = e.clientY - startY;
  if (Math.abs(dragX) > Math.abs(dragY)) e.preventDefault();

  const rot = dragX / swipeCard.offsetWidth * 15;
  swipeCard.style.transform = `translateX(${dragX}px) rotate(${rot}deg)`;

  const opacity = Math.min(Math.abs(dragX) / 120, 1);
  if (dragX > 30) {
    document.querySelector('.swipe-know').style.opacity = opacity.toString();
    document.querySelector('.swipe-dont').style.opacity = '0';
  } else if (dragX < -30) {
    document.querySelector('.swipe-dont').style.opacity = opacity.toString();
    document.querySelector('.swipe-know').style.opacity = '0';
  } else {
    resetOverlays();
  }
});

swipeCard.addEventListener('pointerup', e => {
  if (!isDragging) return;
  isDragging = false;
  swipeCard.releasePointerCapture(e.pointerId);

  const velocity = dragX / (Date.now() - startTime);
  if (Math.abs(dragX) > 120 || Math.abs(velocity) > 0.5) {
    judgeCard(dragX > 0 ? 'know' : 'dont');
  } else {
    snapBack();
  }
});

// Keyboard
document.addEventListener('keydown', e => {
  if (document.getElementById('card-arena').hidden) return; 

  if (e.key === 'ArrowRight') judgeCard('know');
  if (e.key === 'ArrowLeft') judgeCard('dont');
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    flipCard();
  }
});

// Init
window.addEventListener('DOMContentLoaded', async () => {
  try {
    loadProgress();
    const res = await fetch('public/dataset.json');
    if (!res.ok) throw new Error('Network response was not ok');
    const cards = await res.json();
    state.allCards = cards;
    renderHomeScreen();
  } catch (e) {
    console.error('Failed to load dataset:', e);
    document.getElementById('progress-label').textContent = 'Error loading data.';
  }
});