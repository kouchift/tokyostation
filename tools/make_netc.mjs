#!/usr/bin/env node
/* v140: data/net.json（道具が読み書きする形）から、画面が読む 2 つを作る。tools/release.mjs が公開の直前に実行する
   ① data/net.c.json … 同じ中身を «列ごと» にまとめ、緯度経度は «前の駅との差»（整数）にしたもの。gzip で約 15% 小さい（画面は RG.decodeNet で元に戻す）
   ② data/net_lite.json … «下書きの地図»。路線の形（約 50m 単位・つながった区間をひと筆に）と、大きな駅 400 の名前と位置だけ（gzip 約 45KB）。
      速度制限中でも数秒で «路線図の形» を先に見せるため（index.html の小さな描画が使い、本物の地図が出たら消える） */
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const N = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "net.json"), "utf8"));
const S = N.stations, E = N.edges;
const q6 = v => Math.round(v * 1e6);
const la = [], lo = []; let pla = 0, plo = 0;
for (const s of S) { const a = q6(s[2]), b = q6(s[3]); la.push(a - pla); lo.push(b - plo); pla = a; plo = b; }
const C = { f: 2, source: N.source, area: N.area, lines: N.lines,
  id: S.map(s => s[0]), n: S.map(s => s[1]), la, lo, ls: S.map(s => s[4]), k: S.map(s => s[5]),
  r: S.map(s => s.slice(6)), e: [].concat(...E) };
fs.writeFileSync(path.join(ROOT, "data", "net.c.json"), JSON.stringify(C));
/* 下書き: 路線ごとに区間をつないで «ひと筆» に */
const P = 2000;                                                      // 1/2000 度（約 50m）
const byLine = new Map();
for (const [a, b, l] of E) { if (!byLine.has(l)) byLine.set(l, []); byLine.get(l).push([a, b]); }
const paths = [];
for (const [l, es] of byLine) {
  const adj = new Map(), used = new Set(), key = (a, b) => a < b ? a + "," + b : b + "," + a;
  for (const [a, b] of es) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const starts = [...adj.keys()].filter(v => adj.get(v).length !== 2).concat([...adj.keys()]);
  for (const s of starts) for (const nb of adj.get(s)) {
    if (used.has(key(s, nb))) continue;
    const ch = [s, nb]; used.add(key(s, nb)); let prev = s, cur = nb;
    while (adj.get(cur).length === 2) { const nx = adj.get(cur).find(x => x !== prev); if (used.has(key(cur, nx))) break; used.add(key(cur, nx)); ch.push(nx); prev = cur; cur = nx; }
    const d = []; let px = 0, py = 0;
    ch.forEach((i, k) => { const x = Math.round(S[i][3] * P), y = Math.round(S[i][2] * P); if (k) { d.push(x - px, y - py); } else d.push(x, y); px = x; py = y; });
    paths.push([l, d]);
  }
}
const lite = { p: P, c: N.lines.map(x => x[1]), g: paths, s: S.slice(0, 400).map(s => [s[1], Math.round(s[3] * P), Math.round(s[2] * P)]) };
fs.writeFileSync(path.join(ROOT, "data", "net_lite.json"), JSON.stringify(lite));
console.log("   data/net.c.json・data/net_lite.json を作りました（区間 " + paths.length + "）");
