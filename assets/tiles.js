/* =========================================================================
   升目ごとの読み込み（見えているところだけ）と、別スレッドの窓口
   ―― 区にまたがって見ていても、«見えている升目» をすべて読むので
      境目でスポットが欠けることはありません。
   ========================================================================= */
(function (RG) {
"use strict";

/* ------------------------------------------------------ 別スレッドの窓口 */
var W = null, seq = 0, waiting = {};
function worker() {
  if (W !== null) return W;
  try {
    W = new Worker("assets/worker.js");
    W.onmessage = function (e) {
      var d = e.data || {}, cb = waiting[d.id];
      if (cb) { delete waiting[d.id]; cb(d); }
    };
    W.onerror = function () { W = false; };   // 使えないときは «無し» として進む
  } catch (e) { W = false; }
  return W;
}
RG.askWorker = function (msg, cb) {
  var w = worker();
  if (!w) { cb({ ok: false, err: "別スレッドが使えません" }); return false; }
  var id = ++seq;
  waiting[id] = cb;
  msg.id = id;
  try { w.postMessage(msg); } catch (e) { delete waiting[id]; cb({ ok: false }); return false; }
  return true;
};
RG.hasWorker = function () { return worker() !== false; };

/* ------------------------------------------------------------ 升目の読込 */
var META = null, loaded = {}, pending = {}, CELL = 0.02;

RG.initTiles = function (done) {
  fetch("data/tiles/index.json", { cache: "force-cache" })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      META = j; CELL = j.cell || 0.02;
      RG.TILE_META = j;
      if (done) done(j);
    })
    .catch(function () { META = false; if (done) done(null); });
};

/* いま見えている範囲（＋まわり1枚ぶん）の升目を読む */
RG.loadTilesFor = function (bbox, after) {
  if (!META) { if (after) after(0); return; }
  var x0 = Math.floor(bbox.w / CELL) - 1, x1 = Math.floor(bbox.e / CELL) + 1;
  var y0 = Math.floor(bbox.s / CELL) - 1, y1 = Math.floor(bbox.n / CELL) + 1;
  var need = [];
  for (var x = x0; x <= x1; x++) {
    for (var y = y0; y <= y1; y++) {
      var k = x + "_" + y;
      if (!META.tiles[k] || loaded[k] || pending[k]) continue;
      need.push(k);
    }
  }
  if (!need.length) { if (after) after(0); return; }
  var left = need.length, got = 0;
  need.forEach(function (k) {
    pending[k] = 1;
    fetch("data/tiles/t_" + k + ".json", { cache: "force-cache" })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        loaded[k] = 1; delete pending[k];
        got += addRows(rows);
        if (--left === 0 && after) after(got);
      })
      .catch(function () {
        delete pending[k];
        if (--left === 0 && after) after(got);
      });
  });
};

/* 読んだぶんを地図のスポットに足す（同じものを二度足さない） */
var seen = {};
function addRows(rows) {
  if (!RG.MAPPOI) RG.MAPPOI = [];
  var G = {};
  (RG.GENRES || []).forEach(function (g) { G[g.id] = g; });
  var n = 0;
  rows.forEach(function (r, i) {
    var key = r.g + "|" + r.la + "|" + r.lo + "|" + (r.n || "");
    if (seen[key]) return;
    seen[key] = 1;
    var g = G[r.g] || {};
    var p = { i: "T" + (++n) + "_" + i, n: r.n || g.label || "", la: r.la, lo: r.lo, g: r.g,
              s: r.chain ? 2.5 : 3.0, ti: r.chain ? 2 : 1,
              t: r.t || g.label, be: r.be || g.e, bc: r.bc || g.c };
    ["ad", "no", "st", "sd", "org", "od", "brand", "chain", "gid"].forEach(function (k) {
      if (r[k] != null) p[k] = r[k];
    });
    if (r.osm10) p.osm10 = r.osm10;
    RG.MAPPOI.push(p);
  });
  if (RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
  return n;
}
RG.tilesLoaded = function () { return Object.keys(loaded).length; };

})(window.RG);
