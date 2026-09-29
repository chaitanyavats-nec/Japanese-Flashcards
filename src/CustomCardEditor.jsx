import React, { useState, useRef, useEffect } from 'react';
import * as wanakana from 'wanakana';
import { PARTS_OF_SPEECH, cardToForm, makeCustomCard } from './lib/customCards';
import { putMedia, deleteMedia, resizeImage, useMediaUrl } from './lib/media';
import { autofillCard } from './lib/ai';
import { playWord } from './lib/speech';
import { IconSparkle, IconMic, IconTrash, IconSpeaker } from './icons';

const MAX_VIDEO_MB = 25;
const MAX_AUDIO_MB = 5;

const Field = ({ id, label, help, error, children }) => (
  <div class={`form-field ${error ? 'has-error' : ''}`}>
    <label class="form-label" htmlFor={id}>{label}</label>
    {children}
    {help && !error && <p class="form-help" id={`${id}-help`}>{help}</p>}
    {error && <p class="form-error" id={`${id}-error`} role="alert">{error}</p>}
  </div>
);

const ImagePreview = ({ id, onRemove }) => {
  const url = useMediaUrl(id);
  return url ? (
    <div class="media-preview">
      <img src={url} alt="Your picture for this card" />
      <button type="button" class="media-remove" onClick={onRemove}><IconTrash /> Remove</button>
    </div>
  ) : null;
};

const VideoPreview = ({ id, onRemove }) => {
  const url = useMediaUrl(id);
  return url ? (
    <div class="media-preview">
      <video src={url} controls playsInline preload="metadata" />
      <button type="button" class="media-remove" onClick={onRemove}><IconTrash /> Remove</button>
    </div>
  ) : null;
};

// Record with the microphone, or upload a file, for the word's audio.
const AudioField = ({ audioId, onChange, onError }) => {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const url = useMediaUrl(audioId);
  const fileRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        onChange(await putMedia(blob));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      onError("Couldn't use the microphone. Check the browser's permission, or upload a file instead.");
    }
  };
  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };
  useEffect(() => () => recorderRef.current?.state === 'recording' && recorderRef.current.stop(), []);

  return (
    <div class="media-field">
      <div class="media-buttons">
        {typeof MediaRecorder !== 'undefined' && (
          <button type="button" class={`media-btn ${recording ? 'recording' : ''}`} onClick={recording ? stop : start}>
            <IconMic size={16} /> {recording ? 'Stop recording' : audioId ? 'Record again' : 'Record'}
          </button>
        )}
        <button type="button" class="media-btn" onClick={() => fileRef.current?.click()}>Upload audio</button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > MAX_AUDIO_MB * 1024 * 1024) { onError(`Audio files can be up to ${MAX_AUDIO_MB} MB.`); return; }
          onChange(await putMedia(file));
        }} />
      </div>
      {url && (
        <div class="media-preview media-preview-audio">
          <audio src={url} controls preload="metadata" />
          <button type="button" class="media-remove" onClick={() => onChange(null)}><IconTrash /> Remove</button>
        </div>
      )}
    </div>
  );
};

// Add or edit one of the learner's own cards. A card can be any Japanese:
// a word, a phrase, an idiom.
export default function CustomCardEditor({ card, aiKey, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => cardToForm(card));
  const [errors, setErrors] = useState({});
  const [mediaError, setMediaError] = useState(null);
  const [aiState, setAiState] = useState({ status: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Media added during this edit, so it can be cleaned up on Cancel.
  const addedMedia = useRef(new Set());
  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const isNew = !card;

  const update = (patch) => setForm(f => ({ ...f, ...patch }));
  const setMedia = (kind, id) => {
    if (id) addedMedia.current.add(id);
    const previous = form.media[kind];
    if (previous && addedMedia.current.has(previous)) deleteMedia(previous).catch(() => {});
    setForm(f => ({ ...f, media: { ...f.media, [kind]: id || undefined } }));
    setMediaError(null);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cancel = () => {
    addedMedia.current.forEach(id => deleteMedia(id).catch(() => {}));
    onClose();
  };

  const validate = () => {
    const next = {};
    if (!form.word.trim()) next.word = 'Enter the Japanese word or phrase.';
    const hasKanji = /[一-龯々]/.test(form.word);
    const reading = form.reading.trim();
    if (hasKanji && !reading) next.reading = 'Words with kanji need a reading, in kana or romaji.';
    if (reading && !wanakana.isKana(wanakana.toHiragana(reading, { passRomaji: false }).replace(/[\s・ー]/g, ''))) {
      next.reading = "That reading doesn't look like kana or romaji.";
    }
    if (!form.meanings.trim()) next.meanings = 'Add at least one meaning.';
    if (form.sentenceJa.trim() && !form.sentenceEn.trim()) next.sentenceEn = 'Add a translation for the example.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = (e) => {
    e.preventDefault();
    if (!validate()) return;
    // Media replaced during this edit: drop the originals now it's final.
    if (card?.media) {
      Object.entries(card.media).forEach(([kind, id]) => {
        if (id && form.media[kind] !== id) deleteMedia(id).catch(() => {});
      });
    }
    onSave(makeCustomCard(form, card));
  };

  const autofill = async () => {
    if (!form.word.trim()) { setErrors({ word: 'Enter a word first, in Japanese or English.' }); return; }
    setAiState({ status: 'working' });
    try {
      const out = await autofillCard(aiKey, form.word.trim());
      update({
        word: out.kanji || out.hiragana || form.word,
        reading: out.hiragana || form.reading,
        meanings: (out.meanings || []).join(', ') || form.meanings,
        partOfSpeech: PARTS_OF_SPEECH.includes(out.partOfSpeech) ? out.partOfSpeech : form.partOfSpeech,
        sentenceJa: form.sentenceJa || out.exampleJapanese || '',
        sentenceEn: form.sentenceEn || out.exampleEnglish || ''
      });
      setErrors({});
      setAiState({ status: 'done' });
    } catch (err) {
      setAiState({ status: 'error', message: err.message });
    }
  };

  const previewCard = form.word.trim() ? makeCustomCard(form, card) : null;

  return (
    <div class="settings-screen editor-screen" role="dialog" aria-label={isNew ? 'Add a word' : 'Edit word'}>
      <div class="rv-header settings-header">
        <button id="btn-back-home" type="button" onClick={cancel}>Cancel</button>
        <h2 class="settings-title">{isNew ? 'Add a word' : 'Edit word'}</h2>
        <button class="rv-undo" type="submit" form="card-editor">Save</button>
      </div>

      <form id="card-editor" class="settings-body editor-body" onSubmit={save} noValidate>
        <Field id="cc-word" label="Japanese" help="A word, a phrase or an idiom, e.g. 猫の手も借りたい" error={errors.word}>
          <div class="settings-key-row">
            <input id="cc-word" class="settings-input input-jp" lang="ja" value={form.word} onChange={(e) => update({ word: e.target.value })} aria-invalid={!!errors.word} />
            {aiKey && (
              <button type="button" class="settings-action compact" onClick={autofill} disabled={aiState.status === 'working'}>
                <IconSparkle /> {aiState.status === 'working' ? 'Filling...' : 'Auto-fill'}
              </button>
            )}
          </div>
        </Field>
        {aiState.status === 'error' && <p class="form-error" role="alert">{aiState.message}</p>}
        {aiState.status === 'done' && <p class="form-help">Filled in by AI. Check it before saving.</p>}

        <Field id="cc-reading" label="Reading" help="Hiragana, or type romaji and it converts" error={errors.reading}>
          <input
            id="cc-reading"
            class="settings-input input-jp"
            lang="ja"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={form.reading}
            onChange={(e) => update({ reading: e.nativeEvent.isComposing ? e.target.value : wanakana.toKana(e.target.value, { IMEMode: true }) })}
            aria-invalid={!!errors.reading}
          />
        </Field>

        <Field id="cc-meanings" label="Meaning" help="Separate several meanings with commas" error={errors.meanings}>
          <input id="cc-meanings" class="settings-input" value={form.meanings} onChange={(e) => update({ meanings: e.target.value })} aria-invalid={!!errors.meanings} />
        </Field>

        <Field id="cc-pos" label="Type of word">
          <select id="cc-pos" class="settings-input" value={form.partOfSpeech} onChange={(e) => update({ partOfSpeech: e.target.value })}>
            {PARTS_OF_SPEECH.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field id="cc-sentence" label="Example sentence" help="Optional, in Japanese">
          <input id="cc-sentence" class="settings-input input-jp" lang="ja" value={form.sentenceJa} onChange={(e) => update({ sentenceJa: e.target.value })} />
        </Field>
        <Field id="cc-sentence-en" label="Example translation" error={errors.sentenceEn}>
          <input id="cc-sentence-en" class="settings-input" value={form.sentenceEn} onChange={(e) => update({ sentenceEn: e.target.value })} aria-invalid={!!errors.sentenceEn} />
        </Field>

        <div class="form-field">
          <span class="form-label">Picture</span>
          {form.media.image ? (
            <ImagePreview id={form.media.image} onRemove={() => setMedia('image', null)} />
          ) : (
            <button type="button" class="media-btn" onClick={() => imageRef.current?.click()}>Add a picture</button>
          )}
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setMedia('image', await putMedia(await resizeImage(file)));
            } catch (err) {
              setMediaError(err.message);
            }
          }} />
        </div>

        <div class="form-field">
          <span class="form-label">Your pronunciation</span>
          <AudioField audioId={form.media.audio} onChange={(id) => setMedia('audio', id)} onError={setMediaError} />
          {!form.media.audio && previewCard && (
            <button type="button" class="media-btn media-btn-quiet" onClick={() => playWord(previewCard)}>
              <IconSpeaker size={15} /> Hear the built-in voice
            </button>
          )}
          <p class="form-help">Without a recording, the built-in Japanese voice reads it.</p>
        </div>

        <div class="form-field">
          <span class="form-label">Video</span>
          {form.media.video ? (
            <VideoPreview id={form.media.video} onRemove={() => setMedia('video', null)} />
          ) : (
            <button type="button" class="media-btn" onClick={() => videoRef.current?.click()}>Add a short video</button>
          )}
          <p class="form-help">A clip of the word in use: a scene, a sign, someone saying it. Up to {MAX_VIDEO_MB} MB.</p>
          <input ref={videoRef} type="file" accept="video/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > MAX_VIDEO_MB * 1024 * 1024) { setMediaError(`Videos can be up to ${MAX_VIDEO_MB} MB.`); return; }
            setMedia('video', await putMedia(file));
          }} />
        </div>
        {mediaError && <p class="form-error" role="alert">{mediaError}</p>}

        <button type="submit" class="rv-primary editor-save">{isNew ? 'Add to my cards' : 'Save changes'}</button>

        {!isNew && (
          confirmDelete ? (
            <div class="settings-confirm" role="alertdialog" aria-label="Delete this card?">
              <p>Delete this card and its progress? This can't be undone.</p>
              <div class="settings-actions">
                <button type="button" class="settings-action" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button type="button" class="settings-action danger" onClick={() => onDelete(card)}>Delete card</button>
              </div>
            </div>
          ) : (
            <button type="button" class="settings-action danger editor-delete" onClick={() => setConfirmDelete(true)}><IconTrash /> Delete card</button>
          )
        )}
      </form>
    </div>
  );
}
