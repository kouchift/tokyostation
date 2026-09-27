// v146: 大きな読み物データを «一覧に要る分» と «開いたときに要る分» に分ける（速度制限中でも一覧がすぐ出るように）
//   元のファイル（編集・写真の書き込みの道具が読む・書くもの）はそのまま。ここで作るのは «画面が読む» 派生ファイル
//   ・歴オタ図鑑: data/hk/NN.js（1 県 100 件・約 540KB）→ data/hk/NN.l.js（一覧の分だけ・約 50KB）＋ data/hk/NN/K.js（カード本文 10 件ずつ・約 55KB）
//   ・読み物: data/hist_long.js（58 件・約 600KB）→ data/hist_long/index.js（どの出来事に読み物があるか）＋ data/hist_long/<id>.js（1 件ずつ）
//   使い方: node tools/make_split.mjs（tools/release.mjs が毎回実行する）
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
function load(f) { const ctx = { window: {}, console }; ctx.RG = ctx.window.RG = {}; vm.createContext(ctx); vm.runInContext(rd(f), ctx); return ctx.RG; }
function write(f, s) { const p = path.join(ROOT, f); if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === s) return false; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return true; }
let changed = 0, n = 0;

/* 歴オタ図鑑: 一覧・絞り込み・検索・地図の印・«近くのカード» に要る項目だけ */
const LIST = ["id", "n", "yomi", "cat", "y", "era", "rank", "sh", "ad", "st", "la", "lo", "hook"];
for (const f of fs.readdirSync(path.join(ROOT, "data", "hk")).filter(f => /^\d\d\.js$/.test(f)).sort()) {
  const pf = f.slice(0, 2), L = (load("data/hk/" + f).HK || {})[pf] || [];
  const CH = 10;                                                    // カードの本文は 10 件ずつ（data/hk/NN/K.js・速度制限中でも 1〜2 秒）
  const out = L.map((x, i) => { const o = {}; LIST.forEach(k => { if (x[k] !== undefined && x[k] !== "") o[k] = x[k]; }); if (x.who && x.who.length) o.wn = x.who.map(w => w[0]).join(" "); o.k = Math.floor(i / CH); return o; });
  for (let k = 0; k * CH < L.length; k++) {
    const part = {}; L.slice(k * CH, (k + 1) * CH).forEach(x => { part[x.id] = x; });
    if (write("data/hk/" + pf + "/" + k + ".js", "/* 歴オタ図鑑のカード本文 " + (k * CH + 1) + "〜" + Math.min(L.length, (k + 1) * CH) + " 件目（tools/make_split.mjs が data/hk/" + f + " から作る。直さない） */\nRG.HKD = RG.HKD || {};\nObject.assign(RG.HKD, " + JSON.stringify(part) + ");\n")) changed++;
  }
  if (write("data/hk/" + pf + ".l.js", "/* 歴オタ図鑑の一覧の分（tools/make_split.mjs が data/hk/" + f + " から作る。直さない） */\nRG.HKL = RG.HKL || {};\nRG.HKL[\"" + pf + "\"] = " + JSON.stringify(out) + ";\n")) changed++;
  n++;
}
/* 読み物: 1 件ずつ */
const HL = load("data/hist_long.js").HIST_LONG || {}, idx = {};
for (const id of Object.keys(HL)) {
  if (!/^[\w-]+$/.test(id)) throw new Error("読み物の id にファイル名に使えない文字: " + id);
  idx[id] = HL[id].read || 10;
  if (write("data/hist_long/" + id + ".js", "/* 読み物 1 件（tools/make_split.mjs が data/hist_long.js から作る。直さない） */\nRG.HIST_LONG = RG.HIST_LONG || {};\nRG.HIST_LONG[\"" + id + "\"] = " + JSON.stringify(HL[id]) + ";\n")) changed++;
}
if (write("data/hist_long/index.js", "/* 読み物のある出来事（id → 読む目安の分）。tools/make_split.mjs が作る */\nRG.HIST_LONG_IDX = " + JSON.stringify(idx) + ";\n")) changed++;
console.log("make_split: 歴オタ図鑑 " + n + " 県・読み物 " + Object.keys(HL).length + " 件（書き換え " + changed + " ファイル）");
