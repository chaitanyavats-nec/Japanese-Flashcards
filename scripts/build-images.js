// Downloads the Twemoji SVG for every emoji referenced in image-map.json into
// public/emoji/, so card illustrations are served locally (no CDN at runtime)
// and share one consistent visual style. Re-runnable: existing files are kept.
//
//   node scripts/build-images.js
//
// image-map.json maps a word (kanji, or hiragana when there is no kanji) to
// the emoji shown on the front of its flashcard. Twemoji is CC BY 4.0
// (credited in the app footer).
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { emojiToTwemojiName } = require('./lib/emoji-name');

const MAP_PATH = path.join(__dirname, '../image-map.json');
const OUT_DIR = path.join(__dirname, '../public/emoji');
const CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';

async function download(name) {
  const dest = path.join(OUT_DIR, `${name}.svg`);
  if (fs.existsSync(dest)) return true;
  const res = await fetch(`${CDN}/${name}.svg`);
  if (!res.ok) return false;
  fs.writeFileSync(dest, await res.buffer());
  return true;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const emojis = [...new Set(Object.values(map))];
  const failed = [];
  for (const emoji of emojis) {
    const name = emojiToTwemojiName(emoji);
    if (!(await download(name))) failed.push(`${emoji} (${name})`);
  }
  console.log(`Downloaded/verified ${emojis.length - failed.length}/${emojis.length} emoji SVGs into public/emoji/`);
  if (failed.length) {
    console.log('Not found on the CDN — pick a different emoji for these:', failed.join(', '));
    process.exitCode = 1;
  }
}

main();
