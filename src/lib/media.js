// Pictures, recordings and videos attached to the learner's own cards live
// in IndexedDB (localStorage is far too small for them). Cards only store
// the media ids.
import { useEffect, useState } from 'react';

const DB_NAME = 'nihongo-media';
const STORE = 'media';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putMedia(blob, id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`) {
  await run('readwrite', store => store.put(blob, id));
  return id;
}

export const getMedia = (id) => run('readonly', store => store.get(id));
export const deleteMedia = (id) => run('readwrite', store => store.delete(id));

export async function allMedia() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      out.push({ id: cursor.key, blob: cursor.value });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// An object URL for a stored blob, revoked when the component unmounts.
export function useMediaUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let objectUrl = null;
    let cancelled = false;
    getMedia(id).then(blob => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}

// Shrinks a photo to fit `max` px on its longest side before storing it:
// a phone photo is several MB, a card picture needs a few dozen KB.
export function resizeImage(file, max = 640) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export const base64ToBlob = (base64, type) => {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
};
