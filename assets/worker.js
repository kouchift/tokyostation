/* =========================================================================
   別スレッド（Web Worker）でやる重い計算
   ―― 画面を描く担当（メインスレッド）とは別のところで動くので、
      計算のあいだも地図を動かせます。

   ここでやること
     ・検索の索引づくり（2万件以上の文字を並べる）
     ・経路さがし（ダイクストラ法）
     ・スポットの間引き（升目ごとに数を絞る）
   ========================================================================= */
"use strict";

var IDX = null;      // 検索の索引
var NET = null;      // 駅と路線のつながり

function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[ぁ-ん]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); })
    .replace(/[\s　・,，.。／/（）()「」【】-]/g, "");
}

/* ---------------------------------------------------------- 検索の索引 */
function buildIndex(items) {
  IDX = items.map(function (it) {
    return { k: norm(it.n) + " " + norm(it.t || "") + " " + norm(it.a || ""), r: it };
  });
  return IDX.length;
}
function search(q, limit) {
  if (!IDX) return [];
  var ws = norm(q).split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  var out = [];
  for (var i = 0; i < IDX.length && out.length < (limit || 40); i++) {
    var ok = true;
    for (var j = 0; j < ws.length; j++) {
      if (IDX[i].k.indexOf(ws[j]) < 0) { ok = false; break; }
    }
    if (ok) out.push(IDX[i].r);
  }
  return out;
}

/* ------------------------------------------------------------ 経路さがし */
function setNet(n) { NET = n; }
function route(from, to) {
  if (!NET) return null;
  var dist = {}, prev = {}, seen = {};
  var pq = [[0, from]];
  dist[from] = 0;
  while (pq.length) {
    pq.sort(function (a, b) { return a[0] - b[0]; });
    var cur = pq.shift(), d = cur[0], id = cur[1];
    if (seen[id]) continue;
    seen[id] = 1;
    if (id === to) break;
    var adj = NET[id] || [];
    for (var i = 0; i < adj.length; i++) {
      var nx = adj[i][0], w = adj[i][1];
      var nd = d + w;
      if (dist[nx] == null || nd < dist[nx]) { dist[nx] = nd; prev[nx] = id; pq.push([nd, nx]); }
    }
  }
  if (dist[to] == null) return null;
  var path = [to], p = to;
  while (prev[p]) { p = prev[p]; path.unshift(p); }
  return { path: path, cost: dist[to] };
}

/* ------------------------------------------- スポットの間引き（升目ごと） */
function thin(pts, cellPx, perCell, max) {
  var g = {}, out = [];
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var k = Math.round(p.x / cellPx) + "," + Math.round(p.y / cellPx);
    var n = g[k] || 0;
    if (n >= perCell) continue;
    g[k] = n + 1;
    out.push(p.i);
    if (out.length >= max) break;
  }
  return out;
}

self.onmessage = function (e) {
  var m = e.data || {}, id = m.id;
  try {
    if (m.cmd === "index")  self.postMessage({ id: id, ok: true, n: buildIndex(m.items) });
    else if (m.cmd === "search") self.postMessage({ id: id, ok: true, hits: search(m.q, m.limit) });
    else if (m.cmd === "net")    { setNet(m.net); self.postMessage({ id: id, ok: true }); }
    else if (m.cmd === "route")  self.postMessage({ id: id, ok: true, r: route(m.from, m.to) });
    else if (m.cmd === "thin")   self.postMessage({ id: id, ok: true, keep: thin(m.pts, m.cell, m.per, m.max) });
    else self.postMessage({ id: id, ok: false, err: "知らない命令です: " + m.cmd });
  } catch (err) {
    self.postMessage({ id: id, ok: false, err: String(err && err.message || err) });
  }
};
