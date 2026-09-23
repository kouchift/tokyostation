/* =========================================================================
   QR コード（外部ライブラリなし・自前実装）  v74〜
   ・バイトモード、誤り訂正レベル M、型番 1〜10（英数字なら ~200 文字、URL なら十分）
   ・戻り値は SVG 文字列。投げ銭の QR（PC 画面 → スマホで読む）に使う
   ・仕様: ISO/IEC 18004。Python の qrcode ライブラリと同じ出力になることを確認済み（tools/qr_check.py）
   ========================================================================= */
(function (RG) {
"use strict";
// 型番ごとの [データ語数, EC語数/ブロック, G1ブロック数, G1データ語, G2ブロック数, G2データ語]（レベル M）
var EC_M = [null,
  [16, 10, 1, 16, 0, 0], [28, 16, 1, 28, 0, 0], [44, 26, 1, 44, 0, 0], [64, 18, 2, 32, 0, 0], [86, 24, 2, 43, 0, 0],
  [108, 16, 4, 27, 0, 0], [124, 18, 4, 31, 0, 0], [154, 22, 2, 38, 2, 39], [182, 22, 3, 36, 2, 37], [216, 26, 4, 43, 1, 44]];
var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
// GF(256)
var EXP = new Array(512), LOG = new Array(256);
(function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; })();
function rsPoly(n) { var p = [1]; for (var i = 0; i < n; i++) { var q = new Array(p.length + 1).fill(0); for (var j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= EXP[(LOG[p[j]] + i) % 255]; } p = q; } return p; }
function rsEncode(data, n) {
  var gen = rsPoly(n), res = new Array(n).fill(0);
  for (var i = 0; i < data.length; i++) {
    var f = data[i] ^ res[0]; res.shift(); res.push(0);
    if (f) for (var j = 0; j < n; j++) res[j] ^= EXP[(LOG[gen[j + 1]] + LOG[f]) % 255];
  }
  return res;
}
function utf8(s) { var out = [], e = unescape(encodeURIComponent(s)); for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i)); return out; }

RG.qrMatrix = function (text) {
  var bytes = utf8(text), ver = 0;
  for (var v = 1; v <= 10; v++) { var cap = EC_M[v][0] * 8 - 4 - (v < 10 ? 8 : 16); if (bytes.length * 8 <= cap) { ver = v; break; } }
  if (!ver) return null;
  var E = EC_M[ver], bits = [];
  function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
  push(4, 4); push(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach(function (b) { push(b, 8); });
  var total = E[0] * 8;
  push(0, Math.min(4, total - bits.length));
  while (bits.length % 8) bits.push(0);
  var pad = [0xEC, 0x11], k = 0;
  while (bits.length < total) { push(pad[k++ % 2], 8); }
  var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  // ブロックに分けて EC を付ける
  var blocks = [], ecs = [], pos = 0;
  for (var g = 0; g < 2; g++) { var nb = E[2 + g * 2], nd = E[3 + g * 2]; for (var bI = 0; bI < nb; bI++) { var d = data.slice(pos, pos + nd); pos += nd; blocks.push(d); ecs.push(rsEncode(d, E[1])); } }
  var seq = [], maxD = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
  for (var c = 0; c < maxD; c++) blocks.forEach(function (b) { if (c < b.length) seq.push(b[c]); });
  for (var c2 = 0; c2 < E[1]; c2++) ecs.forEach(function (b) { seq.push(b[c2]); });
  // マトリクス
  var N = 17 + ver * 4, M = [], F = [];   // M: 値, F: 機能パターン
  for (var r = 0; r < N; r++) { M.push(new Array(N).fill(0)); F.push(new Array(N).fill(false)); }
  function set(r, c, v) { M[r][c] = v; F[r][c] = true; }
  function finder(r0, c0) { for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) { var rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue; var on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4); set(rr, cc, on ? 1 : 0); } }
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  var al = ALIGN[ver];
  al.forEach(function (ar) { al.forEach(function (ac) {
    if (F[ar][ac]) return;
    for (var r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++) set(ar + r, ac + c, (Math.max(Math.abs(r), Math.abs(c)) !== 1) ? 1 : 0);
  }); });
  for (var t = 8; t < N - 8; t++) { if (!F[6][t]) set(6, t, t % 2 === 0 ? 1 : 0); if (!F[t][6]) set(t, 6, t % 2 === 0 ? 1 : 0); }
  set(N - 8, 8, 1);   // dark module
  // 形式情報の場所を予約
  for (var i2 = 0; i2 < 8; i2++) { F[8][i2 < 6 ? i2 : i2 + 1] = true; F[i2 < 6 ? i2 : i2 + 1][8] = true; F[8][N - 1 - i2] = true; F[N - 1 - i2][8] = true; }
  F[8][8] = true;
  if (ver >= 7) { for (var a = 0; a < 6; a++) for (var b2 = 0; b2 < 3; b2++) { F[a][N - 11 + b2] = true; F[N - 11 + b2][a] = true; } }
  // データ配置（右下からジグザグ）
  var bi = 0, all = []; seq.forEach(function (bt) { for (var i = 7; i >= 0; i--) all.push((bt >> i) & 1); });
  var up = true;
  for (var col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (var rr2 = 0; rr2 < N; rr2++) {
      var row = up ? N - 1 - rr2 : rr2;
      for (var dc = 0; dc < 2; dc++) { var cc2 = col - dc; if (F[row][cc2]) continue; M[row][cc2] = bi < all.length ? all[bi] : 0; bi++; }
    }
    up = !up;
  }
  // マスク評価
  var MASKS = [function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; }, function (r, c) { return c % 3 === 0; }, function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; }, function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; }, function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }];
  function applyMask(mi) { var out = M.map(function (row) { return row.slice(); }); for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!F[r][c] && MASKS[mi](r, c)) out[r][c] ^= 1; writeFormat(out, mi); return out; }
  function writeFormat(out, mi) {
    var fmt = (0 << 3) | mi;   // レベル M = 00
    var v2 = fmt << 10; for (var i = 14; i >= 10; i--) if (v2 & (1 << i)) v2 ^= 0x537 << (i - 10);
    var f = ((fmt << 10) | v2) ^ 0x5412;
    for (var i3 = 0; i3 < 15; i3++) {
      var bit = (f >> i3) & 1;
      // 左上まわり（bit0 が列8の上端から下へ、折り返して行8を左へ）
      if (i3 < 6) out[i3][8] = bit; else if (i3 === 6) out[7][8] = bit; else if (i3 === 7) out[8][8] = bit; else if (i3 === 8) out[8][7] = bit; else out[8][14 - i3] = bit;
      // 右上（行8の右端から）・左下（列8の下から）
      if (i3 < 8) out[8][N - 1 - i3] = bit; else out[N - 15 + i3][8] = bit;
    }
    if (ver >= 7) {
      var vv = ver << 12; for (var i4 = 17; i4 >= 12; i4--) if (vv & (1 << i4)) vv ^= 0x1F25 << (i4 - 12);
      var vinfo = (ver << 12) | vv;
      for (var i5 = 0; i5 < 18; i5++) { var bt2 = (vinfo >> i5) & 1; var rr3 = Math.floor(i5 / 3), cc3 = N - 11 + (i5 % 3); out[rr3][cc3] = bt2; out[cc3][rr3] = bt2; }
    }
  }
  function penalty(m) {
    var p = 0, r, c;
    for (r = 0; r < N; r++) { var run = 1; for (c = 1; c < N; c++) { if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (c = 0; c < N; c++) { var run2 = 1; for (r = 1; r < N; r++) { if (m[r][c] === m[r - 1][c]) { run2++; if (run2 === 5) p += 3; else if (run2 > 5) p++; } else run2 = 1; } }
    for (r = 0; r < N - 1; r++) for (c = 0; c < N - 1; c++) { var s = m[r][c] + m[r][c + 1] + m[r + 1][c] + m[r + 1][c + 1]; if (s === 0 || s === 4) p += 3; }
    var P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function has(arr, i, pat) { for (var k = 0; k < 11; k++) if (arr[i + k] !== pat[k]) return false; return true; }
    for (r = 0; r < N; r++) for (c = 0; c <= N - 11; c++) { if (has(m[r], c, P1)) p += 40; if (has(m[r], c, P2)) p += 40; }
    for (c = 0; c < N; c++) { var colArr = m.map(function (row) { return row[c]; }); for (r = 0; r <= N - 11; r++) { if (has(colArr, r, P1)) p += 40; if (has(colArr, r, P2)) p += 40; } }
    var dark = 0; for (r = 0; r < N; r++) for (c = 0; c < N; c++) dark += m[r][c];
    var pct = dark * 100 / (N * N), prev = Math.floor(pct / 5) * 5, next = prev + 5;
    p += Math.min(Math.abs(prev - 50) / 5, Math.abs(next - 50) / 5) * 10;
    return p;
  }
  var best = null, bestP = Infinity, bestMask = 0;
  for (var mi = 0; mi < 8; mi++) { var cand = applyMask(mi), pp = penalty(cand); if (pp < bestP) { bestP = pp; best = cand; bestMask = mi; } }
  best.mask = bestMask; best.version = ver;
  return best;
};

/* SVG にする（quiet zone 4 セル込み） */
RG.qrSvg = function (text, px, opt) {
  var m = RG.qrMatrix(text); if (!m) return "";
  var N = m.length, q = 4, S = N + q * 2, d = [];
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (m[r][c]) d.push("M" + (c + q) + " " + (r + q) + "h1v1h-1z");
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + " " + S + '" width="' + (px || 200) + '" height="' + (px || 200) + '" shape-rendering="crispEdges" role="img" aria-label="' + (opt && opt.label ? opt.label : "QRコード") + '">' +
    '<rect width="' + S + '" height="' + S + '" fill="#fff"/><path d="' + d.join("") + '" fill="' + (opt && opt.color || "#111") + '"/></svg>';
};
})(window.RG);
