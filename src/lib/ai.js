// Optional AI helper, backed by Claude through the learner's own API key
// (kept only in this browser; see Settings). It writes new example
// sentences, explains a word, and fills in a new card's fields.
//
// Two sentence styles, matched to how the sentence will be used:
//   concise        short, information-dense, third-person sentences for
//                  quick spaced-repetition review
//   conversational everyday dialogue lines using "you" and modals (can,
//                  should, will), closer to real interaction
import { loadJSON, saveJSON } from './storage';
import { AI_KEY_KEY } from './settings';

const MODEL = 'claude-opus-5-5';

export const loadAiKey = () => {
  try { return localStorage.getItem(AI_KEY_KEY) || ''; } catch { return ''; }
};
export const saveAiKey = (key) => {
  try {
    if (key) localStorage.setItem(AI_KEY_KEY, key);
    else localStorage.removeItem(AI_KEY_KEY);
  } catch { /* storage unavailable */ }
};

// The SDK is only downloaded the first time the helper is used.
let clientPromise = null;
let clientKey = null;
async function getClient(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) =>
      // The key belongs to the learner and never leaves their browser except
      // to go to the API, which is the case this option exists for.
      new Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
  }
  return clientPromise;
}

const SYSTEM = 'You write study material for a Japanese vocabulary flashcard app used by English-speaking beginners. ' +
  'Use natural, correct Japanese that a beginner could follow: common words, polite or plain style as appropriate, no rare kanji. ' +
  'Readings are in hiragana. Translations are natural English.';

async function askForJson(apiKey, prompt, schema) {
  const client = await getClient(apiKey);
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }]
    });
  } catch (e) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    if (e instanceof Anthropic.AuthenticationError) throw new Error('That API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("This API key can't use that model.");
    if (e instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now. Try again in a minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach the AI service. Check your connection.");
    if (e instanceof Anthropic.APIError) throw new Error(`The AI service returned an error (${e.status}).`);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new Error("The AI declined to write this one. Try the other style.");
  if (response.stop_reason === 'max_tokens') throw new Error('The answer came back cut off. Try again.');
  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('The AI returned an empty answer. Try again.');
  return JSON.parse(text);
}

const wordLine = (card) =>
  `${card.kanji || card.hiragana}${card.kanji ? ` (${card.hiragana})` : ''}, meaning "${(card.englishMeanings || []).slice(0, 3).join(', ')}" (${card.partOfSpeech || 'word'})`;

const SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    japanese: { type: 'string', description: 'The sentence in Japanese, with kanji where natural' },
    hiragana: { type: 'string', description: 'The whole sentence in hiragana' },
    english: { type: 'string', description: 'Natural English translation' }
  },
  required: ['japanese', 'hiragana', 'english'],
  additionalProperties: false
};

const STYLE_PROMPTS = {
  concise: 'Write one short, information-dense example sentence (under 15 Japanese characters if you can) in the third person, the kind that is quick to read in a flashcard review.',
  conversational: 'Write one natural line of everyday conversation that speaks to "you", using a modal idea like can, should or will (for example ～てもいいですか, ～たほうがいい, ～ましょう), as if said in a real situation.'
};

export async function generateSentence(apiKey, card, style, avoid = []) {
  const prompt = [
    `Word: ${wordLine(card)}.`,
    STYLE_PROMPTS[style] || STYLE_PROMPTS.concise,
    'Use the word itself, spelled as shown.',
    avoid.length > 0 ? `Make it clearly different from these existing examples:\n${avoid.map(s => `- ${s}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
  const out = await askForJson(apiKey, prompt, SENTENCE_SCHEMA);
  return { japanese: out.japanese, hiragana: out.hiragana, english: out.english, source: 'ai', style };
}

const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two or three plain sentences on what the word means and when it is used' },
    nuance: { type: 'string', description: 'How it differs from similar words, or common mistakes, in one or two sentences' },
    memoryHook: { type: 'string', description: 'A short mnemonic linking the sound or shape to the meaning' }
  },
  required: ['summary', 'nuance', 'memoryHook'],
  additionalProperties: false
};

export const explainWord = (apiKey, card) => askForJson(apiKey,
  `Explain this word for a beginner: ${wordLine(card)}. Keep every field short.`,
  EXPLAIN_SCHEMA);

const AUTOFILL_SCHEMA = {
  type: 'object',
  properties: {
    kanji: { type: 'string', description: 'The usual written form with kanji, or an empty string if it is normally written in kana' },
    hiragana: { type: 'string', description: 'Reading in hiragana' },
    meanings: { type: 'array', items: { type: 'string' }, description: 'One to three short English meanings' },
    partOfSpeech: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'expression', 'other'] },
    exampleJapanese: { type: 'string' },
    exampleEnglish: { type: 'string' }
  },
  required: ['kanji', 'hiragana', 'meanings', 'partOfSpeech', 'exampleJapanese', 'exampleEnglish'],
  additionalProperties: false
};

export const autofillCard = (apiKey, input) => askForJson(apiKey,
  `A learner wants a flashcard for "${input}" (Japanese, or an English word to translate). Give its dictionary form, reading, meanings, part of speech and one short example sentence with translation.`,
  AUTOFILL_SCHEMA);

// Generated sentences and explanations are kept per card so they're only
// paid for once.
export const AI_CACHE_KEY = 'flashcards_ai';
export const loadAiCache = () => loadJSON(AI_CACHE_KEY, {});
export const saveAiCache = (cache) => saveJSON(AI_CACHE_KEY, cache);
