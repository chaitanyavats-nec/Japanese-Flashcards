// Backups: everything the app stores in this browser (progress, notes,
// settings, the learner's own cards and their media) as one JSON file, and
// an Anki-importable text export of the deck.
import { STORAGE_PREFIX, PRIVATE_KEYS, dayKey } from './storage';
import { allMedia, putMedia, blobToBase64, base64ToBlob } from './media';

const APP_ID = 'nihongo-flashcards';

export async function buildBackup() {
  const storage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX) && !PRIVATE_KEYS.has(key)) storage[key] = localStorage.getItem(key);
  }
  const media = [];
  for (const { id, blob } of await allMedia().catch(() => [])) {
    media.push({ id, type: blob.type, data: await blobToBase64(blob) });
  }
  return new Blob([JSON.stringify({ app: APP_ID, version: 1, exportedAt: new Date().toISOString(), storage, media })], { type: 'application/json' });
}

// Replaces this browser's saved data with the backup's. Throws with a
// readable message when the file isn't a backup from this app.
export async function restoreBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a backup (it isn't valid JSON).");
  }
  if (data?.app !== APP_ID || typeof data.storage !== 'object') throw new Error("That file isn't a backup from this app.");
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX) && !PRIVATE_KEYS.has(key)) toRemove.push(key);
  }
  toRemove.forEach(key => localStorage.removeItem(key));
  Object.entries(data.storage).forEach(([key, value]) => {
    if (key.startsWith(STORAGE_PREFIX) && !PRIVATE_KEYS.has(key)) localStorage.setItem(key, value);
  });
  for (const item of data.media || []) {
    await putMedia(base64ToBlob(item.data, item.type), item.id);
  }
}

export const backupFileName = () => `nihongo-backup-${dayKey()}.json`;

// Anki's plain-text import: tab-separated Front / Back / Tags, with header
// lines telling it the separator and that fields contain HTML.
const escapeField = (s) => String(s || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
export function buildAnkiExport(cards, notes = {}) {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const card of cards) {
    const front = card.kanji || card.hiragana;
    const sentence = card.exampleSentence;
    const back = [
      card.kanji ? card.hiragana : '',
      card.romaji,
      `<b>${(card.englishMeanings || []).join(', ')}</b>`,
      sentence ? `${sentence.japanese}<br><i>${sentence.english}</i>` : '',
      notes[card.id] ? `Note: ${notes[card.id]}` : ''
    ].filter(Boolean).join('<br>');
    const tags = [card.custom ? 'my-cards' : `level-${card.tier}`, ...(card.packs || [])].join(' ');
    lines.push([escapeField(front), escapeField(back), tags].join('\t'));
  }
  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
