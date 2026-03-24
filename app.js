const state = {
  deck: [],
  remaining: [],
  known: [],
  unknown: [],
  currentIndex: 0,
  isFlipped: false,
  showSentence: true,
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initSession(cardsArray) {
  if (!cardsArray || cardsArray.length === 0) return;

  state.deck = cardsArray;
  state.remaining = shuffle([...cardsArray]);
  state.known = [];
  state.unknown = [];
  state.currentIndex = 0;
  state.isFlipped = false;
  state.showSentence = true;

  document.getElementById('card-arena').hidden = false;
  document.getElementById('summary').hidden = true;

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

  const front = document.getElementById('card-front');
  front.querySelector('.kannada-word').textContent = current.kannada;
  front.querySelector('.transliteration').textContent = current.transliteration;

  const fSent = front.querySelector('.sentence-section');
  fSent.querySelector('.sentence-kannada').textContent = current.sentence.kannada;
  fSent.querySelector('.sentence-translit').textContent = current.sentence.transliteration;
  fSent.querySelector('.sentence-hindi').textContent = current.sentence.hindi;

  const back = document.getElementById('card-back');
  back.querySelector('.kannada-word').textContent = current.kannada;
  back.querySelector('.transliteration').textContent = current.transliteration;
  back.querySelector('.meaning').textContent = `${current.hindi} · ${current.english}`;
  back.querySelector('.pos-pill').textContent = current.partOfSpeech;

  const bSent = back.querySelector('.sentence-section');
  bSent.querySelector('.sentence-kannada').textContent = current.sentence.kannada;
  bSent.querySelector('.sentence-translit').textContent = current.sentence.transliteration;
  bSent.querySelector('.sentence-hindi').textContent = current.sentence.hindi;

  const bBreakdown = back.querySelector('.breakdown-section');
  if (current.breakdown && bBreakdown) {
    bBreakdown.style.display = 'block';
    const partsCont = bBreakdown.querySelector('.breakdown-parts');
    partsCont.innerHTML = '';
    current.breakdown.parts.forEach((p, idx) => {
      const chip = document.createElement('div');
      chip.className = 'part-chip';
      chip.innerHTML = `
        <span class="part-chip-kannada">${p.text}</span>
        <span class="part-chip-translit">${p.transliteration}</span>
        <span class="part-chip-type">${p.type}</span>
        <span class="part-chip-meaning">"${p.meaning}"</span>
      `;
      partsCont.appendChild(chip);
      if (idx < current.breakdown.parts.length - 1) {
        const sep = document.createElement('div');
        sep.className = 'part-chip-separator';
        sep.textContent = '+';
        partsCont.appendChild(sep);
      }
    });

    const formsCont = bBreakdown.querySelector('.other-forms');
    formsCont.innerHTML = '';
    if (current.breakdown.otherForms && current.breakdown.otherForms.length > 0) {
      current.breakdown.otherForms.forEach(form => {
        const label = document.createElement('div');
        label.className = 'form-label';
        label.textContent = form.label;

        const content = document.createElement('div');
        content.innerHTML = `
          <span class="form-kannada">${form.kannada}</span>
          <span class="form-translit">${form.transliteration}</span>
          <span class="form-hindi">(${form.hindi})</span>
        `;

        formsCont.appendChild(label);
        formsCont.appendChild(content);
      });
    }
  } else if (bBreakdown) {
    bBreakdown.style.display = 'none';
  }

  const bInflections = back.querySelector('.inflections-section');
  if (current.inflections && bInflections) {
    bInflections.style.display = 'block';
    const labelEl = bInflections.querySelector('.inflections-label');
    const contentEl = bInflections.querySelector('.inflections-content');
    contentEl.innerHTML = '';

    if (current.inflections.type === 'verb') {
      labelEl.textContent = 'conjugation';
      const tabStrip = document.createElement('div');
      tabStrip.className = 'inflection-tab-strip';
      const tenses = ['present', 'past', 'future'];
      const tabs = [];
      const blocks = [];

      tenses.forEach((tense, idx) => {
        const tab = document.createElement('div');
        tab.className = `inflection-tab ${idx === 0 ? 'active' : ''}`;
        tab.textContent = tense;
        tabs.push(tab);
        tabStrip.appendChild(tab);
        
        const block = document.createElement('div');
        block.style.display = idx === 0 ? 'block' : 'none';
        
        current.inflections.tenses[tense].forEach(form => {
          const row = document.createElement('div');
          row.className = 'inflection-row inflection-row-verb';
          row.innerHTML = `
            <span class="inf-label">${form.label}</span>
            <span class="inf-kannada">${form.kannada}</span>
            <span class="inf-translit">${form.translit}</span>
          `;
          block.appendChild(row);
        });
        blocks.push(block);
        
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          blocks.forEach(b => b.style.display = 'none');
          block.style.display = 'block';
        });
      });
      contentEl.appendChild(tabStrip);
      blocks.forEach(b => contentEl.appendChild(b));
      
      const extras = document.createElement('div');
      extras.className = 'verb-extras';
      if (current.inflections.negativeForm) {
        extras.innerHTML += `
          <div class="verb-extra-row">
            <span class="inf-label">negative</span>
            <span class="inf-kannada">${current.inflections.negativeForm.kannada}</span>
            <span class="inf-translit">${current.inflections.negativeForm.translit}</span>
          </div>`;
      }
      if (current.inflections.verbalNoun) {
        extras.innerHTML += `
          <div class="verb-extra-row">
            <span class="inf-label">verbal noun</span>
            <span class="inf-kannada">${current.inflections.verbalNoun.kannada}</span>
            <span class="inf-translit">${current.inflections.verbalNoun.translit}</span>
          </div>`;
      }
      contentEl.appendChild(extras);
      
    } else {
      labelEl.textContent = 'forms';
      current.inflections.forms.forEach((form, idx) => {
        const row = document.createElement('div');
        row.className = `inflection-row ${idx === 0 ? 'base-form' : ''}`;
        let html = `
          <span class="inf-label">${form.label}</span>
          <span class="inf-kannada">${form.kannada}</span>
          <span class="inf-translit">${form.translit}</span>
        `;
        if (current.inflections.type === 'adjective' && form.note) {
          row.style.gridTemplateColumns = '80px 1fr 1fr 1fr';
          html += `<span class="inf-note">${form.note}</span>`;
        }
        row.innerHTML = html;
        contentEl.appendChild(row);
      });
    }
  } else if (bInflections) {
    bInflections.style.display = 'none';
  }

  document.getElementById('card-inner').classList.toggle('flipped', state.isFlipped);
  setSentenceVisible(state.showSentence);
}

function setSentenceVisible(show) {
  state.showSentence = show;
  document.querySelectorAll('.sentence-section').forEach(el => {
    if (show) {
      el.style.maxHeight = '200px';
      el.style.opacity = '1';
    } else {
      el.style.maxHeight = '0';
      el.style.opacity = '0';
    }
  });
  document.querySelectorAll('[id^="sentence-toggle"]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(show));
    btn.textContent = show ? 'sentence ON' : 'sentence OFF';
  });
}

function flipCard() {
  state.isFlipped = !state.isFlipped;
  document.getElementById('card-inner').classList.toggle('flipped', state.isFlipped);
}

function advanceDeck(verdict) {
  const current = state.remaining[state.currentIndex];
  verdict === 'know' ? state.known.push(current) : state.unknown.push(current);
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
  document.getElementById('summary').hidden = false;

  document.getElementById('known-count').textContent = `✓ ${state.known.length} known`;
  document.getElementById('unknown-count').textContent = `✗ ${state.unknown.length} to review`;

  const thumbsContainer = document.getElementById('missed-thumbnails');
  thumbsContainer.innerHTML = '';

  state.unknown.forEach(card => {
    const thumb = document.createElement('div');
    thumb.className = 'missed-thumb';
    thumb.textContent = card.kannada;
    thumbsContainer.appendChild(thumb);
  });

  document.getElementById('btn-review-missed').disabled = state.unknown.length === 0;
}

// Global Event Listeners
document.getElementById('card').addEventListener('click', e => {
  if (e.target.id === 'sentence-toggle' || e.target.id === 'sentence-toggle-back') {
    setSentenceVisible(!state.showSentence);
    return;
  }
  if (e.target.closest('button')) return; // ignore action buttons
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
  initSession(window.CARDS);
});

// Pointer events for dragging
let startX, startY, startTime, isDragging = false, dragX = 0;
const swipeCard = document.getElementById('card');

swipeCard.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
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

  if (Math.abs(dragX) > Math.abs(dragY)) {
    e.preventDefault();
  }

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
  if (document.getElementById('card-arena').hidden) return; // if in summary

  if (e.key === 'ArrowRight') judgeCard('know');
  if (e.key === 'ArrowLeft') judgeCard('dont');
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    flipCard();
  }
});

// Init
window.addEventListener('DOMContentLoaded', () => {
  if (window.CARDS) {
    initSession(window.CARDS);
  }
});