// v171: 見た目の決まり（assets/app.css・design_v2.css）の «生の値» を «トークン»（CSS 変数）に写す
//   角丸・影・動きの長さ・文字の大きさ・灰色 を、決められた段階（:root の --r-* / --sh-* / --t-* / --fs-* / --ink-* …）に寄せる
//   使い方: node tools/css_tokens.mjs            … 下見（どの値を何に写すか数える。ファイルは変えない）
//           node tools/css_tokens.mjs --write    … 書き換える（直したあとは tools/build_bundle.js と make_critical.mjs）
//   写さないもの: 地図の中の文字（calc(... * var(--u)) など）、1 回しか出ない特別な色（それは design/TOKENS.md の «例外» に載せる）
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const FILES = ["assets/app.css", "assets/design_v2.css"];
const stat = {};
const tick = (k) => { stat[k] = (stat[k] || 0) + 1; };

/* 角丸: 0〜5 → xs(4) / 6〜9 → sm(8) / 10〜13 → md(12) / 14〜18 → lg(16) / 20〜28 → xl(24) / 999 → pill */
function radius(px) { px = +px; if (px <= 0) return null; if (px <= 5) return "var(--r-xs)"; if (px <= 9) return "var(--r-sm)"; if (px <= 13) return "var(--r-md)"; if (px <= 18) return "var(--r-lg)"; if (px <= 28) return "var(--r-xl)"; if (px >= 999) return "var(--r-pill)"; return null; }
function mapRadius(v) {
  if (/var\(|inherit|%|calc/.test(v)) return v;
  const out = v.trim().split(/\s+/).map(t => { const m = /^(\d+(?:\.\d+)?)px$/.exec(t); if (!m) return t === "0" ? "0" : null; return radius(m[1]) || t; });
  if (out.some(x => x === null)) return v;
  tick("radius"); return out.join(" ");
}
/* 文字の大きさ: 11 / 12 / 13 / 14 / 16 / 18 / 20 / 22 / 24 / 26 / 28 の段階に（10.5 以下は 11 に上げる＝最小の文字） */
const FS = [11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28];
function mapFont(v) {
  const m = /^(\d+(?:\.\d+)?)px(\s*!important)?$/.exec(v.trim()); if (!m) return v;
  const px = +m[1]; if (px < 7 || px > 30) return v;
  let best = FS[0]; for (const f of FS) if (Math.abs(f - px) < Math.abs(best - px) || (Math.abs(f - px) === Math.abs(best - px) && f > best)) best = f;
  if (px < 11) best = 11;
  tick("font " + px + "→" + best); return "var(--fs-" + best + ")" + (m[2] || "");
}
/* 影: ぼかしの大きさで sm / md / lg（inset・var(--lc) など特別なものは触らない） */
function mapShadow(v) {
  if (/var\(|inset|none|currentColor|--lc/.test(v)) return v;
  const parts = v.split(/,(?![^(]*\))/).map(s => s.trim());
  if (parts.length > 1) return v;
  const m = /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+rgba?\((?:0|24|16|0),\s*(?:0|28|24|34),\s*(?:0|32|40|74),\s*(\.\d+|0\.\d+|\d)\)$/.exec(parts[0]);   // 黒・紺（24,28,32 / 0,34,74 / 16,24,40）の影だけ（色のついた影は演出）
  if (!m) return v;
  const blur = +m[3]; const tok = blur <= 6 ? "1" : blur <= 16 ? "2" : "3";
  tick("shadow " + tok); return "var(--sh-" + tok + ")";
}
/* 動き: .08〜.13s → fast / .14〜.22s → base / .23〜.32s → slow。長いもの（0.5s〜）は演出なので触らない。イージングは linear / ease / ease-in-out → var(--ease) */
function mapTransition(v) {
  if (/none|var\(--t-/.test(v)) return v;
  let changed = false;
  let out = v.replace(/(\d*\.?\d+)(m?s)\b/g, (s, n, u) => { let ms = u === "ms" ? +n : +n * 1000; if (ms < 60 || ms > 330) return s; changed = true; return ms <= 130 ? "var(--t-fast)" : ms <= 220 ? "var(--t-base)" : "var(--t-slow)"; });
  out = out.replace(/\b(ease-in-out|ease-out|ease-in|linear|ease)\b/g, m => { changed = true; return "var(--ease)"; });
  if (changed) tick("transition"); return out;
}
/* 灰色: 文字色は読める濃さに、線・背景は段階に。色みのある色は触らない */
function grey(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); if (h.length !== 6) return null; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); if (Math.max(r, g, b) - Math.min(r, g, b) > 8) return null; return (r + g + b) / 3; }
function hsl(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); if (h.length !== 6) return null; const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return { h: 0, s: 0, l }; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: hh * 60, s, l }; }
/* 青の仲間（色相 200〜225°・彩度 .5 以上）は brand の 3 段に寄せる（ロゴの紺・リンク・主ボタンがばらばらだった） */
function mapBlue(hex) { const c = hsl(hex); if (!c || c.s < 0.5 || c.h < 200 || c.h > 226) return null; if (c.l < 0.2) return "--brand-ink"; if (c.l <= 0.42) return "--brand"; if (c.l <= 0.6) return "--brand-2"; return null; }
function mapGreyColor(v, prop) {
  return v.replace(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/g, hex => {
    let bl = mapBlue(hex); if (bl === "--brand-2" && prop === "color") bl = "--brand";   // 空色は白地の文字には薄すぎる（3.5:1）
    if (bl && /^(color|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|fill|stroke)$/.test(prop)) { tick("blue " + hex.toLowerCase() + "→" + bl); return "var(" + bl + ")"; }
    const l = grey(hex); if (l === null) return hex;
    let tok;
    if (prop === "color" || prop === "fill" || prop === "stroke") {
      if (l >= 170) return hex;                                   // 明るい字はそのまま（暗い背景の上に使うもの）
      if (l >= 120) tok = "--ink-3"; else if (l >= 60) tok = "--ink-2"; else tok = "--ink";   // 薄い灰色の字は読める濃さ（--ink-3 = 5.7:1）に
    } else if (prop === "background" || prop === "background-color") {
      if (l >= 251) return hex; if (l >= 236) tok = "--paper-2"; else if (l >= 190) tok = "--paper-3"; else return hex;
    } else if (prop === "border" || prop === "border-color" || prop.startsWith("border-") || prop === "outline") {
      if (l >= 250) return hex; if (l >= 196) tok = "--line"; else if (l >= 150) tok = "--line-2"; else return hex;
    } else return hex;
    tick("grey " + prop + " " + hex.toLowerCase() + "→" + tok); return "var(" + tok + ")";
  });
}
/* 暗い面（濃いカード・案内バー・夜）の決まりでは、灰色の文字を濃くしない（暗い背景で読めなくなる） */
const DARK = /modal--dark|card--dark|\.night|\.navbar|\.nav__|glass|--dark|\.dark\b|loadbar|\.hint\b|lb__|bootwarn|\.sheet--d|sns--|sh__b--|\.fb\b|\.x--|lbadge|plate__|\.lchip/;   // 暗い面と、各社の色（SNS）・路線色の札は触らない
function rewrite(css) {
  // 決まり（selector{…}）ごとに処理。:root の定義（--xxx:）は触らない
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (block, sel, body) => {
    const dark = DARK.test(sel);
    return sel + "{" + body.replace(/([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=;|$)/g, (all, prop, value) => {
    if (prop.startsWith("--")) return all;
    if (dark && /^(color|fill|stroke|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|outline)$/.test(prop)) return all;
    if (/calc\(|var\(--u|--lblscale|--poiscale|--lmscale|--sthitr/.test(value)) return all;
    let v = value;
    if (prop === "border-radius") v = mapRadius(v);
    else if (prop === "font-size") v = mapFont(v);
    else if (prop === "box-shadow") v = mapShadow(v);
    else if (prop === "transition") v = mapTransition(v);
    else if (/^(color|fill|stroke|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|outline)$/.test(prop)) v = mapGreyColor(v, prop);
    return v === value ? all : prop + ":" + v;
    }) + "}";
  });
}
for (const f of FILES) {
  const p = path.join(ROOT, f), src = fs.readFileSync(p, "utf8"), out = rewrite(src);
  console.log(f + ": " + (out === src ? "変化なし" : (src.length + " → " + out.length + " 文字")));
  if (WRITE && out !== src) fs.writeFileSync(p, out);
}
const rows = Object.entries(stat).sort((a, b) => b[1] - a[1]);
console.log("写した数: " + rows.reduce((a, b) => a + b[1], 0));
for (const [k, v] of rows.slice(0, 60)) console.log("  " + String(v).padStart(4) + "  " + k);
if (!WRITE) console.log("（下見だけ。書き換えるには --write）");
