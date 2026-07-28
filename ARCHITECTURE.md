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
