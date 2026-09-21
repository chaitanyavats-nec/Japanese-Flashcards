// Twemoji names each SVG by its codepoints joined with "-", dropping the
// U+FE0F variation selector unless the emoji is a ZWJ sequence.
// (Mirrored in src/App.jsx, which needs the same name to build the image URL.)
function emojiToTwemojiName(emoji) {
  const hasZwj = emoji.includes('\u200d');
  const cps = [...emoji]
    .filter(ch => hasZwj || ch !== '\ufe0f')
    .map(ch => ch.codePointAt(0).toString(16));
  return cps.join('-');
}

module.exports = { emojiToTwemojiName };
