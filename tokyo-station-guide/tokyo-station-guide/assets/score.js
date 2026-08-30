/* =========================================================================
   スコア計算＋レーダーチャート描画
   ・全708駅で各軸の生値を出し、パーセンタイル順位（0-100）に正規化
   ・総合スコアは有効な軸の加重平均。23区内の順位つき
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var S = {}; RG.Score = S;

var computed = null;

S.build = function () {
  if (computed) return computed;
  var axes = RG.SCORE.axes.filter(function (a) { return a.enabled; });
  var raws = {}, ranks = {};
  axes.forEach(function (a) { raws[a.id] = []; });

  RG.NET.stations.forEach(function (s) {
    var p = RG.POI ? RG.POI[s.id] : null;
    axes.forEach(function (a) {
      var v = a.raw(s, p);
      raws[a.id].push({ id: s.id, v: v });
    });
  });

  // 欠損は中央値で補完してからパーセンタイル化（欠損が不利にも有利にもならない）
  axes.forEach(function (a) {
    var arr = raws[a.id], vals = arr.filter(function (x) { return x.v != null; })
                                   .map(function (x) { return x.v; }).sort(function (p, q) { return p - q; });
    var med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    var filled = arr.map(function (x) { return { id: x.id, v: x.v == null ? med : x.v, miss: x.v == null }; });
    filled.sort(function (p, q) { return a.dir > 0 ? p.v - q.v : q.v - p.v; });
    var n = filled.length, r = {};
    for (var i = 0; i < n; i++) {
      // 同値は同順位（下位側の順位を採用）
      var j = i; while (j + 1 < n && filled[j + 1].v === filled[i].v) j++;
      var pct = Math.round((i / (n - 1)) * 100);
      for (var k = i; k <= j; k++) r[filled[k].id] = { score: pct, raw: filled[k].v, miss: filled[k].miss };
      i = j;
    }
    ranks[a.id] = r;
  });

  var totals = [];
  RG.NET.stations.forEach(function (s) {
    var sum = 0, w = 0;
    axes.forEach(function (a) { sum += ranks[a.id][s.id].score * a.weight; w += a.weight; });
    totals.push({ id: s.id, total: Math.round(sum / w) });
  });
  totals.sort(function (p, q) { return q.total - p.total; });
  var totalMap = {};
  totals.forEach(function (t, i) { totalMap[t.id] = { total: t.total, rank: i + 1 }; });

  computed = { axes: axes, ranks: ranks, total: totalMap, count: totals.length };
  return computed;
};

S.of = function (id) {
  var c = S.build(), out = { total: c.total[id].total, rank: c.total[id].rank, n: c.count, axes: [] };
  c.axes.forEach(function (a) {
    var r = c.ranks[a.id][id];
    out.axes.push({ id: a.id, label: a.label, emoji: a.emoji, color: a.color,
                    score: r.score, raw: r.raw, miss: r.miss, desc: a.desc, unit: a.unit });
  });
  return out;
};

/* ---------------------------------------------------------------- レーダー */
S.radar = function (id) {
  var d = S.of(id), n = d.axes.length, C = 100, R = 66;
  function pt(i, r) {
    var th = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [C + Math.cos(th) * r, C + Math.sin(th) * r];
  }
  var rings = [25, 50, 75, 100].map(function (v) {
    var p = []; for (var i = 0; i < n; i++) p.push(pt(i, R * v / 100).join(","));
    return '<polygon points="' + p.join(" ") + '" fill="none" stroke="#DDE1E8" stroke-width="0.7"/>';
  }).join("");
  var spokes = "", labels = "", i;
  for (i = 0; i < n; i++) {
    var e = pt(i, R);
    spokes += '<line x1="' + C + '" y1="' + C + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) +
              '" stroke="#DDE1E8" stroke-width="0.7"/>';
    var lp = pt(i, R + 15), a = d.axes[i];
    var anchor = lp[0] > C + 4 ? "start" : lp[0] < C - 4 ? "end" : "middle";
    labels += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 2).toFixed(1) + '" font-size="7.4" ' +
      'text-anchor="' + anchor + '" fill="#333">' + a.emoji + "</text>" +
      '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 10).toFixed(1) + '" font-size="6.2" ' +
      'text-anchor="' + anchor + '" fill="#626264">' + esc(a.label) + "</text>" +
      '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 18).toFixed(1) + '" font-size="6.6" ' +
      'font-weight="700" text-anchor="' + anchor + '" fill="' + a.color + '">' + a.score + "</text>";
  }
  var poly = [], dots = "";
  for (i = 0; i < n; i++) {
    var p2 = pt(i, R * Math.max(3, d.axes[i].score) / 100);
    poly.push(p2[0].toFixed(1) + "," + p2[1].toFixed(1));
    dots += '<circle cx="' + p2[0].toFixed(1) + '" cy="' + p2[1].toFixed(1) + '" r="1.9" fill="' +
            d.axes[i].color + '" stroke="#fff" stroke-width="0.6"/>';
  }
  var grade = d.total >= 80 ? "S" : d.total >= 65 ? "A" : d.total >= 50 ? "B" : d.total >= 35 ? "C" : "D";
  return '<svg viewBox="0 0 200 200" class="radar" role="img" aria-label="駅の総合スコア ' + d.total + '点">' +
    rings + spokes +
    '<polygon points="' + poly.join(" ") + '" fill="rgba(0,85,173,.20)" stroke="#0055AD" stroke-width="1.4"/>' +
    dots +
    '<circle cx="100" cy="100" r="26" fill="#fff" stroke="#0055AD" stroke-width="1.2"/>' +
    '<text x="100" y="97" font-size="21" font-weight="800" text-anchor="middle" fill="#00234B">' + d.total + "</text>" +
    '<text x="100" y="108" font-size="6.4" text-anchor="middle" fill="#626264">総合 / 100</text>' +
    '<text x="100" y="116" font-size="7" font-weight="700" text-anchor="middle" fill="#0055AD">ランク ' + grade + "</text>" +
    labels + "</svg>";
};

/* 数値の読み下し（生値の表示用） */
S.rawText = function (a) {
  if (a.miss) return "データなし（中央値で補完）";
  if (a.id === "affordable") return Math.round(a.raw).toLocaleString("ja-JP") + " 円/m²";
  if (a.id === "heritage") return "重みつき " + Math.round(a.raw) + " 点";
  if (a.id === "worship" || a.id === "civic") return Math.round(a.raw) + " 件";
  return Math.round(a.raw * 10) / 10;
};

})(window.RG);
