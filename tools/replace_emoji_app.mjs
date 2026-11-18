#!/usr/bin/env node
/* =========================================================================
   D-01 アプリ側の絵文字 → SVG アイコン置換（デザイン刷新 第2周回・アプリ編）
   -------------------------------------------------------------------------
   運用:
   - 対象はバンドル元ファイルだけ: tools/build_bundle.js の ORDER にある
     assets/*.js（生成物の app.bundle.js / app.extra.js は対象外。再生成で反映）。
   - 置換するのは «HTML 文字列の中» の絵文字だけ。本文にタグ（<button> 等）を
     含む文字列リテラルの中にある絵文字を、assets/icons.svg の ui-* シンボルを
     参照する <svg class="uic"> マークアップに替える。
     タグを含まない文字列（地図の印 be:/e:、天気・月のデータ表、textContent や
     モーダル見出しに渡す平文）はこの道具では替えない:
       - 地図の印は RG.setIcon / setEmoji の既存経路（ジャンルアイコン優先）
       - 見出し・ステータス等の平文は assets/icons.js の RG.iconifyText が
         表示時に同じ対応表でアイコン化する（アイコン未着時は絵文字のまま）
       - データ表の絵文字は «内容そのもの» なので残す（報告参照）
   - 使い方:  node tools/replace_emoji_app.mjs           … 下見（件数だけ）
              node tools/replace_emoji_app.mjs --write   … 実際に置換
   - 冪等: 置換後の文字列には対象絵文字が残らないので、再実行の件数は 0。
     二重に <svg> が入れ子になることはない。
   - 対応表（MAP）が正本。絵文字を足すときは assets/icons.svg に ui-* の
     <symbol> を足してから MAP に 1 行足す。icons.js の RG.UI_EMOJI は
     平文用に同じ対応表を持つ（片方を変えたら他方も合わせる）。
   - 除外: assets/icons.js（フォールバック絵文字そのものが仕事）、
     assets/comments-v109.js（版名つき独立ファイル・index.html から直接読込。
     触らない判断は PR 報告参照）、assets/comments.js（どこからも参照されない
     旧ファイル）、assets/concept.js（絵文字なし・直接読込の別系統）。
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const MAP = [
  ["📍", "ui-pin"],
  ["📌", "ui-pin"],
  ["🗺️", "ui-map"],
  ["🗺", "ui-map"],
  ["🗾", "ui-map"],
  ["🚉", "ui-station"],
  ["🚃", "ui-train"],
  ["🚆", "ui-train"],
  ["🚇", "ui-train"],
  ["🚄", "ui-shinkansen"],
  ["📖", "ui-book"],
  ["📚", "ui-book"],
  ["📗", "ui-book"],
  ["⚠️", "ui-warn"],
  ["⚠", "ui-warn"],
  ["🚨", "ui-warn"],
  ["📷", "ui-camera"],
  ["📸", "ui-camera"],
  ["📹", "ui-video"],
  ["🎬", "ui-video"],
  ["🧭", "ui-compass"],
  ["💾", "ui-save"],
  ["🏛️", "ui-museum"],
  ["🏛", "ui-museum"],
  ["🏦", "ui-museum"],
  ["📜", "ui-doc"],
  ["📄", "ui-doc"],
  ["📑", "ui-doc"],
  ["📰", "ui-doc"],
  ["🗄️", "ui-doc"],
  ["🗄", "ui-doc"],
  ["📅", "ui-calendar"],
  ["🗓️", "ui-calendar"],
  ["🗓", "ui-calendar"],
  ["☕", "ui-cafe"],
  ["🚬", "ui-smoke"],
  ["🔁", "ui-repeat"],
  ["🔀", "ui-transfer"],
  ["🔄", "ui-refresh"],
  ["📋", "ui-clipboard"],
  ["🔒", "ui-lock"],
  ["🔐", "ui-lock"],
  ["🔓", "ui-lock"],
  ["🪦", "ui-grave"],
  ["🌏", "ui-globe"],
  ["🌐", "ui-globe"],
  ["💬", "ui-comment"],
  ["💰", "ui-yen"],
  ["💴", "ui-yen"],
  ["🪙", "ui-yen"],
  ["🔗", "ui-link"],
  ["✅", "ui-check"],
  ["📤", "ui-share"],
  ["🏢", "ui-building"],
  ["🏬", "ui-building"],
  ["🏚️", "ui-building"],
  ["🏚", "ui-building"],
  ["🚧", "ui-barrier"],
  ["🏗️", "ui-barrier"],
  ["🏗", "ui-barrier"],
  ["🌊", "ui-wave"],
  ["🏫", "ui-school"],
  ["🗑️", "ui-trash"],
  ["🗑", "ui-trash"],
  ["♿", "ui-wheelchair"],
  ["👀", "ui-eye"],
  ["👁️", "ui-eye"],
  ["👁", "ui-eye"],
  ["❓", "ui-help"],
  ["🏯", "ui-castle"],
  ["🛣️", "ui-road"],
  ["🛣", "ui-road"],
  ["🚶", "ui-walk"],
  ["🕒", "ui-clock"],
  ["🕐", "ui-clock"],
  ["🕘", "ui-clock"],
  ["🕛", "ui-clock"],
  ["🕰️", "ui-clock"],
  ["🕰", "ui-clock"],
  ["🔎", "ui-search"],
  ["🔍", "ui-search"],
  ["🔥", "ui-fire"],
  ["🆕", "ui-sparkle"],
  ["✨", "ui-sparkle"],
  ["🏪", "ui-store"],
  ["🏠", "ui-home"],
  ["🏘️", "ui-home"],
  ["🏘", "ui-home"],
  ["🗻", "ui-mountain"],
  ["⛰️", "ui-mountain"],
  ["⛰", "ui-mountain"],
  ["📝", "ui-memo"],
  ["🧳", "ui-luggage"],
  ["🏷️", "ui-tag"],
  ["🏷", "ui-tag"],
  ["🌡️", "ui-thermo"],
  ["🌡", "ui-thermo"],
  ["📮", "ui-postbox"],
  ["🔭", "ui-telescope"],
  ["🛗", "ui-elevator"],
  ["🚪", "ui-door"],
  ["⚙️", "ui-gear"],
  ["⚙", "ui-gear"],
  ["🔞", "ui-prohibit"],
  ["🛍️", "ui-bags"],
  ["🛍", "ui-bags"],
  ["👑", "ui-crown"],
  ["💡", "ui-bulb"],
  ["🖼️", "ui-image"],
  ["🖼", "ui-image"],
  ["🏞️", "ui-image"],
  ["🏞", "ui-image"],
  ["🏮", "ui-lantern"],
  ["📶", "ui-signal"],
  ["🌙", "ui-moon"],
  ["🚦", "ui-traffic"],
  ["♨️", "ui-onsen"],
  ["♨", "ui-onsen"],
  ["✏️", "ui-pencil"],
  ["✏", "ui-pencil"],
  ["📊", "ui-chart"],
  ["📈", "ui-chart"],
  ["🔢", "ui-list"],
  ["☰", "ui-list"],
  ["📏", "ui-ruler"],
  ["🔕", "ui-belloff"],
  ["🌋", "ui-volcano"],
  ["🚩", "ui-flag"],
  ["💳", "ui-card"],
  ["🪪", "ui-id"],
  ["📧", "ui-mail"],
  ["📨", "ui-mail"],
  ["✉️", "ui-mail"],
  ["✉", "ui-mail"],
  ["📱", "ui-phone"],
  ["👤", "ui-user"],
  ["👥", "ui-user"],
  ["⛶", "ui-fullscreen"],
  ["🏆", "ui-trophy"],
  ["🎫", "ui-ticket"],
  ["🧊", "ui-ice"],
  ["⛩️", "ui-shrine"],
  ["⛩", "ui-shrine"],
  ["🌳", "ui-tree"],
  ["🕳️", "ui-hole"],
  ["🕳", "ui-hole"]
];
/* ORDER は build_bundle.js から読む（対象の正本を 1 か所にする） */
const buildSrc = fs.readFileSync(path.join(ROOT, "tools/build_bundle.js"), "utf8");
const ORDER = [...buildSrc.match(/const ORDER = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]);
const FILES = ORDER.map(n => "assets/" + n + ".js").filter(f => f !== "assets/icons.js");
const TAG = /<\/?[a-zA-Z][^>]*>/;
/* 1 行の中の文字列リテラル（'...' / "..." / `...`）を順に返す */
function literals(line) {
  const out = []; let i = 0;
  while (i < line.length) {
    const q = line[i];
    if (q !== "'" && q !== '"' && q !== "`") { i++; continue; }
    let j = i + 1, raw = "";
    while (j < line.length) {
      if (line[j] === "\\") { raw += line[j] + (line[j + 1] || ""); j += 2; continue; }
      if (line[j] === q) break;
      raw += line[j]; j++;
    }
    if (j >= line.length) break; // 閉じていない（複数行文字列など）は触らない
    out.push({ start: i, end: j, q, raw });
    i = j + 1;
  }
  return out;
}
let total = 0; const perEmoji = {}, perFile = {};
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let changed = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/^\s*(\/\/|\*)/.test(line)) continue; // コメント行は触らない
    const lits = literals(line);
    if (!lits.length) continue;
    let out = "", pos = 0;
    for (const lit of lits) {
      out += line.slice(pos, lit.start);
      let raw = lit.raw;
      if (TAG.test(raw)) {
        const qq = lit.q === '"' ? "'" : '"';
        const svgFor = id => `<svg class=${qq}uic${qq} aria-hidden=${qq}true${qq} focusable=${qq}false${qq}><use href=${qq}#${id}${qq}></use></svg>`;
        /* 属性値（title="…" placeholder="…" 等）の中は平文のまま残す:
           文字の置き場が違うので、タグの内側で引用符に囲まれた範囲は替えない */
        let res = "", inTag = false, aq = null;
        for (let ci = 0; ci < raw.length; ci++) {
          const ch = raw[ci];
          if (aq) { res += ch; if (ch === aq) aq = null; continue; }
          if (inTag && (ch === '"' || ch === "'")) { aq = ch; res += ch; continue; }
          if (ch === "<") inTag = true; else if (ch === ">") inTag = false;
          let hit = null;
          for (const [emoji, id] of MAP) if (raw.startsWith(emoji, ci)) { hit = [emoji, id]; break; }
          if (hit) {
            perEmoji[hit[0]] = (perEmoji[hit[0]] || 0) + 1;
            perFile[rel] = (perFile[rel] || 0) + 1; total += 1;
            res += svgFor(hit[1]); ci += hit[0].length - 1; continue;
          }
          res += ch;
        }
        raw = res;
      }
      out += lit.q + raw + lit.q;
      pos = lit.end + 1;
    }
    out += line.slice(pos);
    if (out !== line) { lines[li] = out; changed = true; }
  }
  if (WRITE && changed) fs.writeFileSync(file, lines.join("\n"));
}
console.log(`${WRITE ? "置換" : "下見（--write で実行）"}: 合計 ${total} 件 / ${Object.keys(perFile).length} ファイル`);
for (const [emoji, id] of MAP) if (perEmoji[emoji]) console.log(`  ${emoji} -> #${id}: ${perEmoji[emoji]}`);
console.log("ファイル別:"); for (const f of Object.keys(perFile).sort()) console.log(`  ${f}: ${perFile[f]}`);
