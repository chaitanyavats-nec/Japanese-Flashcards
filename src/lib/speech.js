// Pronunciation playback and speech recognition. Playback uses the learner's
// own recording for their custom cards and the browser's Japanese voice for
// everything else; recognition uses the Web Speech API where the browser has
// it (Chrome, Edge, Safari).
import { getMedia } from './media';

export const SLOW_RATE = 0.6;

export function speak(text, lang = 'ja-JP', rate = 1) {
  if (!window.speechSynthesis || !text) return;
  // Drop anything still queued so rapid taps don't stack up.
  window.speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  ut.rate = rate;
  const voice = window.speechSynthesis.getVoices().find(v => v.lang === lang || v.lang.startsWith(lang.slice(0, 2)));
  if (voice) ut.voice = voice;
  window.speechSynthesis.speak(ut);
}

let currentClip = null;
export async function playWord(card, { rate = 1 } = {}) {
  if (!card) return;
  if (card.media?.audio) {
    try {
      const blob = await getMedia(card.media.audio);
      if (blob) {
        if (currentClip) currentClip.pause();
        const url = URL.createObjectURL(blob);
        currentClip = new Audio(url);
        currentClip.playbackRate = rate;
        currentClip.onended = () => URL.revokeObjectURL(url);
        await currentClip.play();
        return;
      }
    } catch { /* fall back to the synthetic voice */ }
  }
  speak(card.audio?.ttsText || card.kanji || card.hiragana, card.audio?.lang || 'ja-JP', rate);
}

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canRecognizeSpeech = () => !!Recognition;

// Listens for one Japanese utterance. Resolves with the recogniser's
// guesses (best first); rejects with a short, human-readable reason.
// Returns { promise, stop } so the caller can cancel.
export function listenOnce({ lang = 'ja-JP', timeoutMs = 8000 } = {}) {
  if (!Recognition) return { promise: Promise.reject(new Error('Speech recognition is not supported in this browser.')), stop: () => {} };
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  let timer;
  const promise = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      const result = e.results[0];
      resolve(Array.from(result).map(alt => alt.transcript));
    };
    rec.onerror = (e) => {
      const reasons = {
        'not-allowed': 'Microphone access was blocked.',
        'service-not-allowed': 'Microphone access was blocked.',
        'no-speech': "Didn't catch anything. Try again a little louder.",
        'audio-capture': 'No microphone found.',
        network: 'Speech recognition needs an internet connection.'
      };
      reject(new Error(reasons[e.error] || 'Speech recognition stopped.'));
    };
    rec.onend = () => {
      clearTimeout(timer);
      reject(new Error("Didn't catch anything. Try again a little louder."));
    };
  });
  try {
    rec.start();
    timer = setTimeout(() => rec.stop(), timeoutMs);
  } catch { /* already started */ }
  return { promise, stop: () => { clearTimeout(timer); try { rec.abort(); } catch { /* already stopped */ } } };
}
