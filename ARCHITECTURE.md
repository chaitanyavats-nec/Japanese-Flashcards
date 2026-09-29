# Japanese Flashcards - Architecture & Blueprint

This document outlines how the Japanese Flashcards application was built, serving as a blueprint to recreate the app from scratch.

## 1. Overview
The application is a mobile-first, vanilla web app featuring a Tinder-style swiping interface for studying Japanese vocabulary. It relies on a two-part architecture:
- **A Node.js Data Pipeline**: Automates the creation of rich flashcard data from a simple list of words.
- **A Vanilla Frontend**: A lightweight, performant static site (HTML/CSS/JS) that consumes the generated data and provides an interactive UI.

## 2. The Data Generation Pipeline (Node.js)
Manually creating flashcards with kanji, transliterations, definitions, and stroke orders is tedious. The app solves this using a build script (`scripts/build-cards.js`).

### Input & Workflow
1. **Input File (`wordlist.json`)**: A simple array of Japanese words (e.g., `["水", "食べる"]`).
2. **Dictionary Fetching**: The script iterates through the word list and queries the **Jisho API** (a wrapper for JMdict) to retrieve English meanings, parts of speech, and JLPT levels.
3. **Transliteration Engine**: Uses **Kuroshiro** (with Kuromoji analyzer) and **Wanakana** to parse kanji, generate correct hiragana readings, and convert them into Romaji.
4. **Stroke Order SVGs**: Analyzes the kanji characters in the word and downloads their respective SVG stroke order files from **KanjiVG**, saving them to `public/kanjivg/`.
5. **Data Compilation**: Combines all this data (including mock Tatoeba sentences and verb conjugations) into structured objects.

### Output
The script generates a JavaScript file (`public/cards-generated.js`) that assigns the entire JSON dataset to `window.CARDS`, making it globally accessible to the frontend without requiring a backend database or complex API requests.

## 3. The Frontend Client (Vanilla Web)
The frontend is built using standard HTML, CSS, and JS, meaning it can be statically hosted anywhere (e.g., GitHub Pages, Vercel).

### Structure (`index.html`)
- Imports Google Fonts (`DM Sans` for English/UI, `Noto Sans Japanese` for Japanese text) and the generated data script.
- Contains the layout for a top progress bar, a central "Card Arena", and a summary screen.
- The card is constructed with two faces (`#card-front` and `#card-back`), containing dedicated DOM nodes for word breakdowns, kanji stroke orders, and inflections.

### Logic & Interactivity (`app.js`)
- **State Management**: Maintains a local state object tracking the `deck`, `remaining` (shuffled), `known`, and `unknown` arrays.
- **Render Cycle**: Instead of rendering all cards into the DOM at once, it re-uses a single DOM card element, updating its text contents and injecting SVGs dynamically as the user progresses.
- **Swipe Engine**: Implements a custom drag-and-drop system using standard Pointer Events (`pointerdown`, `pointermove`, `pointerup`). It calculates drag distance and velocity to rotate the card. Swiping right marks the card as "known", swiping left marks it as "unknown".
- **Keyboard Controls**: Maps `Space`/`Enter` to flip the card, and `ArrowRight`/`ArrowLeft` to judge it, ensuring desktop accessibility.
- **Session Review**: After completing the deck, the summary screen allows the user to immediately start a new sub-session using only the cards pushed to the `unknown` array.

### Styling (`style.css`)
- Relies on CSS Variables for a cohesive color palette and sizing.
- Uses `transform: rotateY(180deg)` along with `backface-visibility: hidden` to create a 3D card flip animation.
- Includes dynamic opacity classes for the "Know it ✓" and "✗ Don't know" overlays that fade in based on swipe distance.

## 4. How to Rebuild from Scratch
To reconstruct this project from an empty folder:

1. **Initialize the Environment**: 
   - Run `npm init -y` to create a `package.json`.
   - Install build dependencies: `npm install kuroshiro kuroshiro-analyzer-kuromoji wanakana node-fetch`.
2. **Structure Directories**: Create `public/` and `scripts/` folders.
3. **Create the Input List**: Add a `wordlist.json` in the root directory containing your vocabulary.
4. **Write the Build Script**: Recreate the Node.js script to loop over the word list, fetch Jisho data, run Kuroshiro, and output to `public/cards-generated.js`.
5. **Build the UI**: 
   - Create `index.html` with the card structure.
   - Create `style.css` with 3D flip mechanics and modern typography.
   - Create `app.js` to handle Pointer Events for swiping and the state machine for the deck.
6. **Serve Locally**: Add a dev script (`"dev": "npx serve ."`) to `package.json` and run `npm run dev` to serve the static site.

## 5. The Study Engine
Everything runs in the browser and is saved to `localStorage` (keys start with `flashcards_`). Pictures, recordings and videos on the learner's own cards live in IndexedDB.

### Scheduling (`src/lib/srs.js`)
- Each word's progress record keeps the original `status` / `timesReviewed` / `lastReviewedAt` fields and adds `due`, `interval` (days), `ease`, `reps`, `lapses` and `stage`.
- Grading is an SM-2 variant with learning steps: Again brings a word back in 10 minutes and lowers its ease; Good and Easy multiply the interval by the ease. Late answers get credit for the extra time; early answers never shorten an interval.
- Records saved before scheduling existed are converted on read (`normalizeRecord`), so old progress carries over.

### Sessions (`src/lib/queue.js`, `src/ReviewSession.jsx`)
- **What comes up:** words due today, most at risk first (most overdue relative to their interval, then most lapses, then lowest ease). New words follow the learning path, with the learner's own cards first, capped per day. At most one word per theme goes into a batch (three for the broad "Common" themes), so related words aren't learnt side by side.
- **How it's asked:** the question format gets harder as a word's `stage` rises. New words get an intro card first (word, meaning and example on one face). Then comes picking the meaning, then picking the word from English, then typing it, then a mix of typing, listening, the word in a sentence, and (if enabled) saying it. A miss is asked again, an easier way, a few cards later.
- The swipe cards ("Flip all" on a collection) are real reviews too: swipes grade Again and Good, and four grade buttons are available in Settings.

### Activity (`src/lib/activity.js`, `src/lib/badges.js`)
Per-day review counts drive the streak, the daily goal, XP and levels, retention and the 12-week heatmap. Each answer's change is kept so Undo can take it back exactly.

### Example sentences
`scripts/add-sentence-variants.js` backfills `moreSentences` (two extra Tanaka sentences per word, chosen for a different form of the word where possible) and replaces any main example that doesn't contain the word as the card spells it:
```
node --max-old-space-size=6144 scripts/add-sentence-variants.js
```
Reviews rotate through the sentences, one per encounter. `build-cards.js` produces the same data for fresh builds.

### Optional services
- **AI helper** (`src/lib/ai.js`): uses the learner's own Claude API key, kept only in this browser and left out of backups. It writes extra example sentences in two styles, explains words, and auto-fills new cards. The SDK is loaded only when first used.
- **Offline and reminders** (`public/sw.js`, `src/lib/reminders.js`): registered in production builds only. The worker caches the app, data and fonts. Reminders fire from an in-page timer while the app is open, and through periodic background sync where the browser allows it (installed Chromium apps).
- **Backups** (`src/lib/backup.js`): a JSON file with all saved data and media, plus a tab-separated Anki export.
