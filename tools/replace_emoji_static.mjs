#!/usr/bin/env node
/* =========================================================================
   D-01 静的ページの絵文字 → SVG アイコン置換（正本は下の MAP）
   -------------------------------------------------------------------------
   運用:
   - 対象は静的ページだけ: guide/*.html / station/{*}/index.html / 404.html
     / credits.html。index.html 本体と assets/*.js は対象外（アプリ側は別段）。
   - 置換を追加・変更するときは、まず assets/icons-static.svg に <symbol>
     を足し、次に下の MAP に「絵文字 → symbol id」を 1 行足してから流す。
     ページ側を手で直さない（MAP が正本。ページは生成物として扱う）。
   - 使い方:  node tools/replace_emoji_static.mjs           … 下見（件数だけ）
              node tools/replace_emoji_static.mjs --write   … 実際に置換
   - 冪等: 置換後の本文には対象絵文字が残らない（出力は <svg><use/></svg>）
     ので、再実行しても置換件数は 0 になり、二重置換は起きない。
   - 残すもの（MAP に入れない = 置換されない）:
       🚉 +「東京ステーションガイド」… ヘッダーのロゴ（design/TOKENS.md の
         例外「絵文字のロゴ 🚉 は変えない」）。ただし同じ文字でも
         「🚉 東京駅の案内を見る」等のラベル用途は MAP の i-station で置換
         する（ロゴの形は LOGO として先に保護してから MAP を適用する）。
       ★（credits の「評価（★）は本人の主観」）… 本文の内容そのもの。
       → ← 等の矢印 … 絵文字ではなく本文の記号（行き先の表記）。
   - アイコンは全て装飾（aria-hidden="true"）: 置換箇所は常に隣に
     日本語のラベル（電車・車いす可・銭湯 等）があり、読み上げはそちらが担う。
   - スプライトへのパスはページの深さから決める。404.html はどの階層でも
     出るため絶対パス（/tokyostation/…）にする（seo_check の 404 規則）。
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

/* 絵文字（VS16 付きは付きで書く）→ assets/icons-static.svg の symbol id */
const MAP = [
  ["🚃", "i-train"],
  ["🚄", "i-shinkansen"],
  ["🚉", "i-station"],
  ["🗺️", "i-map"],
  ["♿", "i-wheelchair"],
  ["🏬", "i-building"],
  ["🖼️", "i-museum"],
  ["🎡", "i-leisure"],
  ["🏯", "i-landmark"],
  ["🌳", "i-tree"],
  ["⛩️", "i-shrine"],
  ["🛁", "i-bath"],
  ["♨️", "i-onsen"],
  ["🏍️", "i-motorcycle"],
  ["🚗", "i-car"],
  ["🚕", "i-taxi"],
  ["🚲", "i-bicycle"],
  ["🚶", "i-walk"],
  ["🚌", "i-bus"],
  ["📚", "i-book"],
  ["🚪", "i-door"],
];
const LOGO = "🚉 東京ステーションガイド"; // 保護するロゴ表記（完全一致）
const HOLD = "\u0000LOGO\u0000";

function targets() {
  const out = [];
  for (const d of fs.readdirSync(path.join(ROOT, "guide")).sort())
    if (d.endsWith(".html")) out.push("guide/" + d);
  for (const d of fs.readdirSync(path.join(ROOT, "station")).sort())
    if (fs.existsSync(path.join(ROOT, "station", d, "index.html"))) out.push(`station/${d}/index.html`);
  out.push("404.html", "credits.html");
  return out;
}
function prefixFor(rel) {
  if (rel === "404.html") return "/tokyostation/assets/icons-static.svg";
  if (!rel.includes("/")) return "assets/icons-static.svg";
  return "../".repeat(rel.split("/").length - 1) + "assets/icons-static.svg";
}

let total = 0;
const perEmoji = {};
for (const rel of targets()) {
  const file = path.join(ROOT, rel);
  let s = fs.readFileSync(file, "utf8");
  const before = s;
  s = s.split(LOGO).join(HOLD); // ロゴを先に保護
  const prefix = prefixFor(rel);
  for (const [emoji, id] of MAP) {
    const n = s.split(emoji).length - 1;
    if (!n) continue;
    perEmoji[emoji] = (perEmoji[emoji] || 0) + n; total += n;
    s = s.split(emoji).join(`<svg class="ic" aria-hidden="true"><use href="${prefix}#${id}"/></svg>`);
  }
  s = s.split(HOLD).join(LOGO); // ロゴを戻す
  if (WRITE && s !== before) fs.writeFileSync(file, s);
  if (s !== before) console.log(`${rel}: 置換あり`);
}
console.log(`${WRITE ? "置換" : "下見（--write で実行）"}: 合計 ${total} 件`);
for (const [emoji, id] of MAP) if (perEmoji[emoji]) console.log(`  ${emoji} -> #${id}: ${perEmoji[emoji]}`);
