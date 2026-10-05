// v164: スポットの «一覧の印» と «地図の印» が同じ定義から出ているかを点検する
//   使い方: node tools/check_icons.mjs            （表を出す。食い違いがあれば末尾に ✕ で出し、終了コード 1）
//   見るもの: data/genres.js（RG.GENRES = 一覧・凡例・レール・設定の印）、assets/icons.svg（地図と一覧の線画アイコン）、
//            data/osm10.js・data/chains2.js・data/camadult.js・data/smoking.js（地図の印を項目ごとに上書きする表）
//   «種類で変わる» ものは GENRES の varies に書いてあれば意図どおりとみなし、無ければ ✕
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RG = {}; const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
for (const f of ["data/genres.js", "data/osm10.js", "data/chains2.js", "data/camadult.js", "data/smoking.js"]) new Function("RG", rd(f))(RG);
const ALIAS = Object.fromEntries([...rd("assets/icons.js").matchAll(/(\w+): "(\w+)"/g)].map(m => [m[1], m[2]]));
const SYM = new Set([...rd("assets/icons.svg").matchAll(/id="g-([a-z_]+)-map"/g)].map(m => m[1]));
const hasIcon = id => SYM.has(ALIAS[id] || id);
/* 地図で項目ごとに be/bc を上書きしている場所（assets/*.js の grep «be:» と同じ。表の «地図の上書き» 列に出す） */
const OVER = {
  castle: "🏯（国宝・100名城・続100名城）／🏰（その他）、色は格で 3 段（history.js）",
  onsen_jp: "🌋 野湯・🆓 無料・♨️ 混浴・🏔️ 秘湯、色も種類で（nature.js）",
  sento: "組合外は色がうすい（nature.js SENTO_SUB）", bath_x: "♨️ 共同浴場／🧖 スーパー銭湯（nature.js SENTO_SUB）",
  view_jp: "滝 💧・湖 🏞️・山 ⛰️・岬 🌊 など種類の絵文字（nature.js KEMO）",
  grave: "色が時代別（graves.js ERA_C）", univ: "色が偏差値帯（edu.js）", high: "色が偏差値帯（edu.js）",
  yt: "色が YouTuber の系統（yt.js CAT）", whs: "色が自然遺産／文化遺産（whs.js）", river: "色が本流／支流（nature.js）",
  alert: "⚠️ 警報・🟪 特別警報・🌋 噴火警報（alerts.js）", corp: "業種の絵文字（app.js E 表）・色が市場区分",
  adult: "種類の絵文字（camadult.js ADULT_KIND）", smoke: "種類の絵文字（smoking.js SMOKE_KIND）", fuel: "色がブランド（places.js）",
  shukuba: "色が街道別（roads.js）", klm: "項目ごとの絵文字・色（data/kanto_lm）", camera: "赤い LIVE の点つき（app.js）",
  cvs: "寄るとブランドのロゴ・新店は 🆕（app.js）"
};
/* 地図の be が一覧と同じ絵文字で固定のもの（上書きだが見た目は同じ）: airport ✈️・near_special ⭐・buzz 🔥・ichinomiya 🎌・shrine_major ⛩️・temple_major 🛕・
   levechi 👑・koshin 🐒・zoo 🦁・postbox 📮・corp_gone 🏚️・grave 🪦・whs 🌏・yt ▶️・univ 🎓・high 🏫 */
/* チェーン店: ブランドの絵文字（chains2.js）を地図に出す。一覧（レール・設定）はジャンルの絵文字 */
const CT = {}; (RG.CHAIN_CATS || []).forEach(c => CT[c.id] = c);
const brandDiff = {}; (RG.CHAIN_BRANDS || []).forEach(b => { const g = RG.GENRES.find(x => x.id === b.cat); if (g && b.e !== g.e) (brandDiff[b.cat] = brandDiff[b.cat] || []).push(b.e); });
const rows = [], bad = [];
for (const g of RG.GENRES) {
  const icon = hasIcon(g.id);
  const over = [];
  if (OVER[g.id]) over.push(OVER[g.id]);
  if (brandDiff[g.id]) over.push("ブランド別の絵文字 " + [...new Set(brandDiff[g.id])].join("") + "（寄るとロゴ）");
  const osm = RG.OSM10_META && RG.OSM10_META[g.id];
  if (osm && (osm.e !== g.e || (osm.c || "").toLowerCase() !== g.c.toLowerCase())) { over.push("osm10.js の表 " + osm.e + " " + osm.c); bad.push(g.id + ": 一覧 " + g.e + " " + g.c + " ／ 地図（osm10.js）" + osm.e + " " + osm.c); }
  if (CT[g.id] && CT[g.id].e !== g.e) { over.push("チェーン分類の表 " + CT[g.id].e); bad.push(g.id + ": 一覧 " + g.e + " ／ チェーン分類（chains2.js）" + CT[g.id].e); }
  const kind = g.id === "levechi" ? "王冠の絵" : icon ? "線画アイコン（icons.svg）" : "絵文字 " + g.e;
  const varies = (OVER[g.id] || brandDiff[g.id]) ? (g.varies ? "凡例に注記あり" : "注記なし") : "";
  if (varies === "注記なし") bad.push(g.id + ": 地図の印が種類で変わるのに、凡例の注記（varies）が無い");
  rows.push([g.id, g.e, g.c, g.label, kind, over.join("・") || "—", varies]);
}
console.log("| id | 一覧の絵文字 | 色 | 名前 | 地図の印 | 地図での上書き | 凡例の注記 |\n|---|---|---|---|---|---|---|");
rows.forEach(r => console.log("| " + r.join(" | ") + " |"));
console.log("\n線画アイコンのあるジャンル: " + rows.filter(r => /線画/.test(r[4])).length + " / " + rows.length + "。一覧（レール・凡例・グループ・設定）は RG.gMark、地図は RG.setIcon で、どちらも icons.svg と genres.js から出る");
if (bad.length) { console.log("\n✕ 食い違い:"); bad.forEach(b => console.log("  - " + b)); process.exitCode = 1; } else console.log("\n✓ 食い違いなし");
