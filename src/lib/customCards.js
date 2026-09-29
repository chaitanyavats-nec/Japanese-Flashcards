// The learner's own cards. They share the dataset's card shape so every
// screen (lists, sessions, stats) treats them like any other word, plus
// `custom: true`, a creation time and ids of any attached media.
import * as wanakana from 'wanakana';
import { loadJSON, saveJSON } from './storage';

export const CUSTOM_CARDS_KEY = 'flashcards_custom_cards';
export const MY_PACK_ID = 'my-cards';
export const MY_PACK = { name: 'My cards', description: 'Words you added yourself', color: 'var(--accent)', order: 0 };

export const loadCustomCards = () => loadJSON(CUSTOM_CARDS_KEY, []);
export const saveCustomCards = (cards) => saveJSON(CUSTOM_CARDS_KEY, cards);

export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'expression', 'other'];

// form: { word, reading, meanings, partOfSpeech, sentenceJa, sentenceEn,
//         media: { image, audio, video } }
export function makeCustomCard(form, existing) {
  const word = form.word.trim();
  const reading = wanakana.toHiragana(form.reading.trim() || word, { passRomaji: false });
  const hasKanji = /[一-龯々]/.test(word);
  const meanings = form.meanings.split(/[,;、]/).map(m => m.trim()).filter(Boolean);
  const sentenceJa = form.sentenceJa.trim();
  return {
    ...(existing || {}),
    id: existing?.id || `c-${Date.now().toString(36)}`,
    custom: true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    kanji: hasKanji ? word : null,
    hiragana: reading,
    katakana: wanakana.toKatakana(reading),
    romaji: wanakana.toRomaji(reading),
    englishMeanings: meanings,
    partOfSpeech: form.partOfSpeech || 'expression',
    tierName: MY_PACK.name,
    theme: null,
    packs: [MY_PACK_ID],
    audio: { ttsText: word, lang: 'ja-JP' },
    strokeOrderSvgs: [],
    exampleSentence: sentenceJa
      ? { japanese: sentenceJa, english: form.sentenceEn.trim(), source: 'custom', hiragana: wanakana.isKana(sentenceJa.replace(/[。、！？\s]/g, '')) ? sentenceJa : undefined }
      : null,
    media: form.media || {}
  };
}

export function cardToForm(card) {
  return {
    word: card?.kanji || card?.hiragana || '',
    reading: card?.hiragana || '',
    meanings: (card?.englishMeanings || []).join(', '),
    partOfSpeech: card?.partOfSpeech || 'noun',
    sentenceJa: card?.exampleSentence?.japanese || '',
    sentenceEn: card?.exampleSentence?.english || '',
    media: { ...(card?.media || {}) }
  };
}
