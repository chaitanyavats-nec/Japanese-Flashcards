import React, { useState, useRef, useEffect } from 'react';
import { canRecognizeSpeech } from './lib/speech';
import { notificationsSupported } from './lib/reminders';
import { IconDownload, IconUpload, IconBell, IconSparkle } from './icons';

// A labelled row of mutually exclusive choices.
const Segmented = ({ id, label, help, value, options, onChange }) => (
  <div class="settings-row settings-row-stack">
    <div class="settings-row-text">
      <span class="settings-label" id={`${id}-label`}>{label}</span>
      {help && <span class="settings-help">{help}</span>}
    </div>
    <div class="segmented" role="radiogroup" aria-labelledby={`${id}-label`}>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
          class={`segmented-option ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const Toggle = ({ label, help, checked, disabled, onChange }) => (
  <label class={`settings-row settings-toggle-row ${disabled ? 'is-disabled' : ''}`}>
    <span class="settings-row-text">
      <span class="settings-label">{label}</span>
      {help && <span class="settings-help">{help}</span>}
    </span>
    <span class="setting-toggle settings-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </span>
  </label>
);

export default function SettingsScreen({
  settings, onChange, showKanji, onToggleKanji, aiKey, onAiKeyChange,
  onExport, onImport, onAnkiExport, onReminderToggle, reminderNote, installPrompt, onInstall, onClose
}) {
  const [keyDraft, setKeyDraft] = useState(aiKey);
  const [keySaved, setKeySaved] = useState(false);
  const [importState, setImportState] = useState({ status: 'idle' });
  const [confirmImport, setConfirmImport] = useState(null);
  const fileRef = useRef(null);
  const set = (key) => (value) => onChange({ [key]: value });

  const speechAvailable = canRecognizeSpeech();

  return (
      <div class="settings-body">
        <section class="settings-group">
          <h3 class="collections-section-label">Study</h3>
          <Segmented id="new" label="New words a day" value={settings.newPerDay} onChange={set('newPerDay')}
            options={[5, 10, 15, 20].map(v => ({ value: v, label: String(v) }))} />
          <Segmented id="goal" label="Daily goal" help="Reviews a day" value={settings.dailyGoal} onChange={set('dailyGoal')}
            options={[10, 20, 30, 50].map(v => ({ value: v, label: String(v) }))} />
          <Segmented id="length" label="Quick session" help="Cards per quick session" value={settings.sessionLength} onChange={set('sessionLength')}
            options={[5, 10, 20].map(v => ({ value: v, label: String(v) }))} />
          <Segmented id="style" label="Question style" help={{
            mixed: 'Gets harder as you learn: pick the meaning, pick the word, then type or say it',
            flip: 'Classic flashcards you grade yourself',
            choice: 'Multiple choice only',
            typing: 'Always type the Japanese'
          }[settings.reviewStyle]} value={settings.reviewStyle} onChange={set('reviewStyle')}
            options={[{ value: 'mixed', label: 'Mixed' }, { value: 'flip', label: 'Flip' }, { value: 'choice', label: 'Choice' }, { value: 'typing', label: 'Typing' }]} />
          <Segmented id="grades" label="Grade buttons" help="For cards you grade yourself" value={settings.gradeButtons} onChange={set('gradeButtons')}
            options={[{ value: 2, label: 'Two' }, { value: 4, label: 'Four' }]} />
          <Segmented id="timer" label="Answer timer" help="Builds speed on quiz questions. Running out counts as a miss." value={settings.timer} onChange={set('timer')}
            options={[{ value: 0, label: 'Off' }, { value: 5, label: '5s' }, { value: 8, label: '8s' }, { value: 12, label: '12s' }]} />
        </section>

        <section class="settings-group">
          <h3 class="collections-section-label">Sound and display</h3>
          <Toggle label="Play words aloud" help="Speak each word when it's shown or answered" checked={settings.autoplay} onChange={set('autoplay')} />
          <Toggle
            label="Speaking practice"
            help={speechAvailable ? 'Adds "say it" questions and a pronunciation check. Uses your microphone.' : "This browser can't recognise speech. Try Chrome or Edge."}
            checked={settings.speaking && speechAvailable}
            disabled={!speechAvailable}
            onChange={set('speaking')}
          />
          <Toggle label="Show kanji" help="Off shows words in hiragana" checked={showKanji} onChange={(checked) => onToggleKanji({ target: { checked } })} />
          <Toggle label="Picture hints" help="A picture beside each word, shown where it won't give the answer away" checked={settings.pictures} onChange={set('pictures')} />
        </section>

        <section class="settings-group">
          <h3 class="collections-section-label">Reminders</h3>
          <Toggle
            label="Daily reminder"
            help={notificationsSupported() ? 'Only if you haven\'t studied yet that day' : "This browser doesn't support notifications."}
            checked={settings.reminder}
            disabled={!notificationsSupported()}
            onChange={onReminderToggle}
          />
          {settings.reminder && (
            <div class="settings-row">
              <label class="settings-label" htmlFor="reminder-time">Remind me at</label>
              <input id="reminder-time" type="time" class="settings-input settings-time" value={settings.reminderTime} onChange={(e) => onChange({ reminderTime: e.target.value || '19:00' })} />
            </div>
          )}
          {reminderNote && <p class="settings-note"><IconBell /> {reminderNote}</p>}
          {installPrompt && (
            <button class="settings-action" onClick={onInstall}>Install the app on this device</button>
          )}
        </section>

        <section class="settings-group">
          <h3 class="collections-section-label">AI helper</h3>
          <p class="settings-help settings-group-help">
            Writes extra example sentences, explains words and fills in cards you add. Uses your own Claude API key, which stays in this browser and isn't included in backups.
          </p>
          <form class="settings-key-form" onSubmit={(e) => { e.preventDefault(); onAiKeyChange(keyDraft.trim()); setKeySaved(true); }}>
            <label class="settings-label" htmlFor="ai-key">Claude API key</label>
            <div class="settings-key-row">
              <input
                id="ai-key"
                class="settings-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => { setKeyDraft(e.target.value); setKeySaved(false); }}
              />
              <button type="submit" class="settings-action compact" disabled={keyDraft.trim() === aiKey}>Save</button>
            </div>
            <p class="settings-help" aria-live="polite">
              {keySaved ? (keyDraft.trim() ? 'Saved. The AI helper is ready.' : 'Key removed.') : aiKey ? <><IconSparkle /> AI helper is on</> : 'Get a key at console.anthropic.com'}
            </p>
          </form>
        </section>

        <section class="settings-group">
          <h3 class="collections-section-label">Your data</h3>
          <p class="settings-help settings-group-help">
            Progress lives in this browser only. Save a backup to keep it safe or move it to another device.
          </p>
          <div class="settings-actions">
            <button class="settings-action" onClick={onExport}><IconDownload /> Save backup</button>
            <button class="settings-action" onClick={() => fileRef.current?.click()}><IconUpload /> Restore backup</button>
            <button class="settings-action" onClick={onAnkiExport}><IconDownload /> Export for Anki</button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) setConfirmImport(file);
            }}
          />
          {confirmImport && (
            <div class="settings-confirm" role="alertdialog" aria-label="Replace your data?">
              <p>Replace everything in this browser with <strong>{confirmImport.name}</strong>? Your current progress will be overwritten.</p>
              <div class="settings-actions">
                <button class="settings-action" onClick={() => setConfirmImport(null)}>Cancel</button>
                <button
                  class="settings-action danger"
                  onClick={async () => {
                    const file = confirmImport;
                    setConfirmImport(null);
                    setImportState({ status: 'working' });
                    try {
                      await onImport(file);
                    } catch (err) {
                      setImportState({ status: 'error', message: err.message });
                    }
                  }}
                >
                  Replace my data
                </button>
              </div>
            </div>
          )}
          {importState.status === 'working' && <p class="settings-help">Restoring...</p>}
          {importState.status === 'error' && <p class="form-error" role="alert">{importState.message}</p>}
          <p class="settings-help">Anki export: import the text file in Anki with File, Import. Each word becomes one card.</p>
        </section>

        <p class="corpus-credit muted">Example sentences adapted from the Tanaka Corpus (CC BY 2.0). Word meanings from JMdict (EDRDG). Illustrations: Twemoji (CC BY 4.0).</p>
      </div>
  );
}
