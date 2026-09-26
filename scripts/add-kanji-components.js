// Adds a `radicals` list to every kanji in public/kanji-radical-map.json: the
// kanji's own Kangxi radical (flagged `main`) plus every other Kangxi radical
// that appears as a component in its KanjiVG SVG (kvg:element groups).
// Safe to re-run: the list is recomputed from scratch each time.
//
//   node scripts/add-kanji-components.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'public', 'kanji-radical-map.json');
const SVG_DIR = path.join(ROOT, 'public', 'kanjivg');

// The 214 Kangxi radicals in order (index + 1 = radical number):
// "char meaning [variant forms...]". Variant forms are the shapes a radical
// takes when it's a component (e.g. 氵 for 水), so they resolve to the same
// radical.
const KANGXI = `
一 one|丨 line|丶 dot|丿 slash|乙 second 乚|亅 hook|二 two|亠 lid|人 person 亻|儿 legs|
入 enter|八 eight|冂 down box|冖 cover|冫 ice|几 table|凵 open box|刀 knife 刂|力 power|勹 wrap|
匕 spoon|匚 right open box|匸 hiding enclosure|十 ten|卜 divination|卩 seal 㔾|厂 cliff|厶 private|又 again|口 mouth|
囗 enclosure|土 earth|士 scholar|夂 go|夊 go slowly|夕 evening|大 big|女 woman|子 child|宀 roof|
寸 inch|小 small ⺌|尢 lame 尣|尸 corpse|屮 sprout|山 mountain|川 river 巛|工 work|己 self|巾 cloth|
干 dry|幺 thread|广 dotted cliff|廴 long stride|廾 two hands|弋 shoot|弓 bow|彐 snout 彑|彡 hair|彳 step|
心 heart 忄 ⺗|戈 halberd|戸 door 户 戶|手 hand 扌 龵|支 branch|攴 strike 攵|文 script|斗 dipper|斤 axe|方 direction|
无 not 旡|日 sun|曰 say|月 moon|木 tree|欠 lack|止 stop|歹 death 歺|殳 weapon|毋 do not|
比 compare|毛 fur|氏 clan|气 steam|水 water 氵 氺|火 fire 灬|爪 claw 爫|父 father|爻 mix|爿 half tree trunk|
片 slice|牙 fang|牛 cow 牜|犬 dog 犭|玄 dark|玉 jade 王|瓜 melon|瓦 tile|甘 sweet|生 life|
用 use|田 field|疋 bolt of cloth ⺪|疒 sickness|癶 footsteps|白 white|皮 skin|皿 dish|目 eye|矛 spear|
矢 arrow|石 stone|示 spirit 礻|禸 track|禾 grain|穴 cave|立 stand|竹 bamboo ⺮|米 rice|糸 thread 糹|
缶 jar|网 net 罓 ⺲ 罒|羊 sheep 𦍌|羽 feather|老 old 耂|而 and|耒 plow|耳 ear|聿 brush|肉 meat ⺼|
臣 minister|自 self|至 arrive|臼 mortar|舌 tongue|舛 oppose|舟 boat|艮 stopping|色 color|艸 grass 艹 ⺾|
虍 tiger|虫 insect|血 blood|行 go|衣 clothes 衤|襾 cover 覀|見 see|角 horn|言 speech 訁 讠|谷 valley|
豆 bean|豕 pig|豸 badger|貝 shell|赤 red|走 run|足 foot ⻊|身 body|車 cart|辛 bitter|
辰 morning|辵 walk 辶 ⻌|邑 city ⻏|酉 wine|釆 divide|里 village|金 metal 釒|長 long 镸|門 gate|阜 mound ⻖|
隶 slave|隹 short-tailed bird|雨 rain|青 blue 靑|非 wrong|面 face|革 leather|韋 tanned leather|韭 leek|音 sound|
頁 page|風 wind|飛 fly|食 eat 飠|首 head|香 fragrance|馬 horse|骨 bone|高 tall|髟 hair|
鬥 fight|鬯 sacrificial wine|鬲 cauldron|鬼 ghost|魚 fish|鳥 bird|鹵 salt|鹿 deer|麥 wheat|麻 hemp|
黃 yellow|黍 millet|黑 black|黹 embroidery|黽 frog|鼎 tripod|鼓 drum|鼠 rat|鼻 nose|齊 even|
齒 tooth|龍 dragon|龜 turtle|龠 flute
`.split('|').map(s => s.trim()).filter(Boolean);

if (KANGXI.length !== 214) throw new Error(`Expected 214 Kangxi radicals, got ${KANGXI.length}`);

// char (canonical or variant) -> { num, char, meaning }
const RADICALS = new Map();
KANGXI.forEach((entry, i) => {
  const [char, ...rest] = entry.split(' ');
  const variants = rest.filter(w => [...w].length === 1 && /[^\x00-\x7f]/.test(w));
  const meaning = rest.filter(w => !variants.includes(w)).join(' ');
  const radical = { num: i + 1, char, meaning, forms: variants };
  for (const form of [char, ...variants]) if (!RADICALS.has(form)) RADICALS.set(form, radical);
});

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
};

// The component tree of a kanji from its KanjiVG SVG: nested <g kvg:element>
// groups become nested nodes. Groups with no element are transparent (their
// children attach to the nearest ancestor that has one), and the second half
// of a split component (kvg:part >= 2) is skipped so it isn't listed twice.
function extractPartsTree(svg, kanji) {
  const root = { children: [] };
  const stack = [];
  const top = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i];
    return root;
  };
  const tagRe = /<g\b([^>]*)>|<\/g>/g;
  let m;
  while ((m = tagRe.exec(svg))) {
    if (m[0] === '</g>') { stack.pop(); continue; }
    const element = attr(m[1], 'kvg:element');
    const part = Number(attr(m[1], 'kvg:part') || 1);
    if (!element || part > 1) { stack.push(null); continue; }
    if (element === kanji && top() === root) { stack.push(root); continue; }
    const original = attr(m[1], 'kvg:original');
    const node = {
      char: original || element,
      drawn: original ? element : undefined,
      position: attr(m[1], 'kvg:position') || undefined,
      children: []
    };
    top().children.push(node);
    stack.push(node);
  }
  return root.children;
}

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const allKanji = map.groups.flatMap(g => g.kanji);
const kanjiMeaning = new Map(allKanji.map(k => [k.kanji, (k.meanings || [])[0]]));

// Attach what the app needs to label each node: the Kangxi radical it is
// (number + meaning + variant shapes) or, failing that, its meaning as a kanji.
function annotate(nodes) {
  return nodes.map(n => {
    const r = RADICALS.get(n.char) || (n.drawn && RADICALS.get(n.drawn));
    const out = { char: r ? r.char : n.char };
    const drawn = n.drawn || (r && n.char !== r.char ? n.char : undefined);
    if (drawn && drawn !== out.char) out.drawn = drawn;
    if (r) { out.radical = r.num; out.meaning = r.meaning; }
    else if (kanjiMeaning.get(n.char)) out.meaning = kanjiMeaning.get(n.char);
    if (n.position) out.position = n.position;
    if (n.children.length > 0) out.children = annotate(n.children);
    return out;
  });
}

// Every distinct Kangxi radical anywhere in a parts tree, first-seen order.
function collectRadicals(nodes, seen, out) {
  for (const n of nodes) {
    if (n.radical && !seen.has(n.radical)) {
      seen.add(n.radical);
      const r = KANGXI_BY_NUM.get(n.radical);
      out.push({ char: r.char, drawn: n.drawn, meaning: r.meaning, num: r.num, forms: r.forms });
    }
    if (n.children) collectRadicals(n.children, seen, out);
  }
  return out;
}
const KANGXI_BY_NUM = new Map([...RADICALS.values()].map(r => [r.num, r]));

let total = 0;
let withParts = 0;

for (const group of map.groups) {
  const mainRadical = RADICALS.get(group.radicalChar);
  if (!mainRadical) throw new Error(`Unknown group radical ${group.radicalChar}`);

  for (const k of group.kanji) {
    total++;
    delete k.components;

    const file = path.join(SVG_DIR, `${k.kanji.codePointAt(0).toString(16).padStart(5, '0')}.svg`);
    const parts = fs.existsSync(file) ? annotate(extractPartsTree(fs.readFileSync(file, 'utf8'), k.kanji)) : [];

    const seen = new Set([mainRadical.num]);
    const radicals = [
      { char: mainRadical.char, meaning: mainRadical.meaning, num: mainRadical.num, forms: mainRadical.forms, main: true },
      ...collectRadicals(parts, seen, [])
    ];
    k.radicals = radicals;

    if (parts.length > 0) { k.parts = parts; withParts++; }
    else delete k.parts;

    // A kanji that is itself a radical (人, 水) or a radical's variant shape (王).
    const self = RADICALS.get(k.kanji);
    if (self) k.asRadical = { char: self.char, meaning: self.meaning, num: self.num, forms: self.forms };
    else delete k.asRadical;
  }
}

fs.writeFileSync(MAP_PATH, JSON.stringify(map));
console.log(`Processed ${total} kanji (${withParts} with a component breakdown)`);
