// Learner preferences. Anything missing from a saved copy falls back to
// these defaults, so adding a setting never breaks an older save.
import { loadJSON, saveJSON } from './storage';

export const SETTINGS_KEY = 'flashcards_settings';
export const AI_KEY_KEY = 'flashcards_ai_key';

export const DEFAULT_SETTINGS = {
  newPerDay: 10,        // new words introduced per day
  sessionLength: 10,    // cards in a quick session
  dailyGoal: 20,        // reviews per day that count as "goal met"
  reviewStyle: 'mixed', // 'mixed' | 'flip' | 'choice' | 'typing'
  gradeButtons: 2,      // 2 (Don't know / Know it) or 4 (Again / Hard / Good / Easy)
  timer: 0,             // seconds per quiz question, 0 = no timer
  autoplay: false,      // speak the word when it is revealed
  speaking: false,      // include "say it" questions (needs a microphone)
  pictures: true,       // picture hints on cards
  reminder: false,
  reminderTime: '19:00'
};

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...loadJSON(SETTINGS_KEY, {}) });
export const saveSettings = (settings) => saveJSON(SETTINGS_KEY, settings);
