// Downloads and caches the external datasets the build pipeline needs:
//  - Tanaka Corpus (Tatoeba/EDRDG): JP/EN sentence pairs with lemma-tagged
//    parses, used to source example sentences.
//  - jmdict-eng-common (jmdict-simplified): common-word JMdict entries as
//    JSON, used for local dictionary lookups (readings, POS, glosses)
//    instead of hitting the Jisho API at build time.
// Both are cached in the git-ignored data/ directory; re-run is a no-op if
// the cached file already exists.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const fetch = require('node-fetch');

const DATA_DIR = path.join(__dirname, '../data');

const TANAKA_URL = 'https://www.edrdg.org/pub/Nihongo/examples.utf.gz';
const TANAKA_DEST = path.join(DATA_DIR, 'examples.utf');

const JMDICT_URL = 'https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260831182826/jmdict-eng-common-3.6.2+20260831182826.json.tgz';
const JMDICT_DEST = path.join(DATA_DIR, 'jmdict-eng-common.json');

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.buffer();
}

// Minimal tar reader — the release asset is a single-file gzip+tar archive,
// so we only need to find the first regular-file entry, not implement the
// full tar spec.
function extractFirstFileFromTar(tarBuffer) {
  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) break; // end-of-archive marker

    const nameEnd = header.indexOf(0, 0);
    const name = header.toString('utf8', 0, nameEnd === -1 ? 100 : nameEnd);
    const sizeField = header.toString('utf8', 124, 136).replace(/\0/g, '').trim();
    const size = parseInt(sizeField, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);

    const contentStart = offset + 512;
    if ((typeflag === '0' || typeflag === '\0') && !name.endsWith('/') && size > 0) {
      return tarBuffer.subarray(contentStart, contentStart + size);
    }

    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  throw new Error('No regular file found in tar archive');
}

async function fetchTanaka() {
  if (fs.existsSync(TANAKA_DEST)) {
    console.log(`[fetch-data] Tanaka Corpus already cached at ${TANAKA_DEST}`);
    return;
  }
  console.log('[fetch-data] Downloading Tanaka Corpus...');
  const gz = await fetchBuffer(TANAKA_URL);
  const text = zlib.gunzipSync(gz);
  fs.writeFileSync(TANAKA_DEST, text);
  console.log(`[fetch-data] Wrote ${TANAKA_DEST} (${(text.length / 1e6).toFixed(1)} MB)`);
}

async function fetchJmdict() {
  if (fs.existsSync(JMDICT_DEST)) {
    console.log(`[fetch-data] jmdict-eng-common already cached at ${JMDICT_DEST}`);
    return;
  }
  console.log('[fetch-data] Downloading jmdict-eng-common...');
  const tgz = await fetchBuffer(JMDICT_URL);
  const tar = zlib.gunzipSync(tgz);
  const json = extractFirstFileFromTar(tar);
  fs.writeFileSync(JMDICT_DEST, json);
  console.log(`[fetch-data] Wrote ${JMDICT_DEST} (${(json.length / 1e6).toFixed(1)} MB)`);
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  await fetchTanaka();
  await fetchJmdict();
  console.log('[fetch-data] Done.');
}

main().catch(err => {
  console.error('[fetch-data] Failed:', err);
  process.exit(1);
});
