/* =========================================================================
   v156: 天気のダッシュボード（池袋ナイトライフ v60 の «天気ダッシュボード» と同じ絵・1600×1200 の SVG）
   ・絵の関数は NightLife の dash_render.mjs（wxSvg）・暦の計算は cal.js（六曜）・board.js（節気・月齢・祝日）からそのまま写した
   ・違うのは «データの出どころ» だけ: 気象庁（予報・アメダス）→ Open-Meteo（このサイトの天気チップと同じ取得結果を使う）
     → 3 時間ごと・6 時間ごとの降水確率・これまでの気温 を Open-Meteo の 1 時間ごとの値から作る（RG.wxDashData）
   ・天気チップを押したときだけ読む（data の扱い・時計は日本時間）
   ========================================================================= */
(function (RG) {
"use strict";
var W = 1600, H = 1200, JST = 9 * 3600e3;
function makeJDate() {
  const D = Date;
  class JDate extends D {
    constructor(...a) { if (a.length >= 2) super(D.UTC(a[0], a[1], a[2] ?? 1, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0) - JST); else if (a.length === 1) super(a[0] instanceof D ? a[0].getTime() : a[0]); else super(); }
    _u() { return new D(this.getTime() + JST); }
    getFullYear() { return this._u().getUTCFullYear(); } getMonth() { return this._u().getUTCMonth(); } getDate() { return this._u().getUTCDate(); }
    getDay() { return this._u().getUTCDay(); } getHours() { return this._u().getUTCHours(); } getMinutes() { return this._u().getUTCMinutes(); } getSeconds() { return this._u().getUTCSeconds(); }
    getTimezoneOffset() { return -540; }
    setDate(d) { this.setTime(this.getTime() + (d - this.getDate()) * 864e5); return this.getTime(); }
    static now() { return D.now(); }
  }
  return JDate;
}

var CAL = (function () {
  var R = Math.PI / 180, RK = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"];
  function newMoon(k) {        // k 番目の新月の JDE（Meeus 49 章）
    var T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T;
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T * T * T + 0.00000000073 * T * T * T * T;
    var M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * R, Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T) * R;
    var F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T) * R, O = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * R;
    jde += -0.4072 * Math.sin(Mp) + 0.17241 * E * Math.sin(M) + 0.01608 * Math.sin(2 * Mp) + 0.01039 * Math.sin(2 * F) + 0.00739 * E * Math.sin(Mp - M) - 0.00514 * E * Math.sin(Mp + M)
      + 0.00208 * E * E * Math.sin(2 * M) - 0.00111 * Math.sin(Mp - 2 * F) - 0.00057 * Math.sin(Mp + 2 * F) + 0.00056 * E * Math.sin(2 * Mp + M) - 0.00042 * Math.sin(3 * Mp)
      + 0.00042 * E * Math.sin(M + 2 * F) + 0.00038 * E * Math.sin(M - 2 * F) - 0.00024 * E * Math.sin(2 * Mp - M) - 0.00017 * Math.sin(O) - 0.00007 * Math.sin(Mp + 2 * M)
      + 0.00004 * Math.sin(2 * Mp - 2 * F) + 0.00004 * Math.sin(3 * M) + 0.00003 * Math.sin(Mp + M - 2 * F) + 0.00003 * Math.sin(2 * Mp + 2 * F) - 0.00003 * Math.sin(Mp + M + 2 * F)
      + 0.00003 * Math.sin(Mp - M + 2 * F) - 0.00002 * Math.sin(Mp - M - 2 * F) - 0.00002 * Math.sin(3 * Mp + M) + 0.00002 * Math.sin(4 * Mp);
    return jde;
  }
  function sunLon(jd) {          // 太陽の視黄経（度・Meeus 25 章の低精度式）
    var T = (jd - 2451545) / 36525, L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * R;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var O = (125.04 - 1934.136 * T) * R, l = L0 + C - 0.00569 - 0.00478 * Math.sin(O);
    return ((l % 360) + 360) % 360;
  }
  function jdOf(y, m, d) { return Date.UTC(y, m - 1, d) / 864e5 + 2440587.5; }       // その日の 0 時（UT）
  function jstDay(jde) { var ms = (jde - 2440587.5) * 864e5 + 9 * 3600e3; var t = new Date(ms); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) / 864e5; }   // 日本時間の日（通日）
  var CACHE = {};
  function lunarMonths(y) {      // y 年まわりの旧暦の月（朔日の通日・月番号・閏）
    if (CACHE[y]) return CACHE[y];
    var k0 = Math.floor((y - 2000) * 12.3685) - 14, ms = [];
    for (var k = k0; k < k0 + 30; k++) ms.push({ day: jstDay(newMoon(k)), jd: newMoon(k) });
    for (var i = 0; i < ms.length - 1; i++) {          // その月に入る中気（太陽黄経が 30 の倍数）を探す
      var a = ms[i].day, b = ms[i + 1].day, zh = null;
      for (var d = a; d < b; d++) { var l1 = sunLon(d * 1 + 2440587.5 - 9 / 24 + 1), l0 = sunLon(d * 1 + 2440587.5 - 9 / 24); var c0 = Math.floor(l0 / 30), c1 = Math.floor(l1 / 30); if (c0 !== c1) zh = (c1 * 30) % 360; }
      ms[i].zh = zh;
    }
    var out = [];
    for (i = 0; i < ms.length - 1; i++) {
      var m = ms[i]; if (m.zh === null) { out.push({ day: m.day, leap: true, m: out.length ? out[out.length - 1].m : 0 }); continue; }
      var mo = ((m.zh / 30 + 2) % 12) || 12; out.push({ day: m.day, leap: false, m: mo });
    }
    return (CACHE[y] = out);
  }
  function lunar(y, mo, d) {      // 新暦 → 旧暦 { m, d, leap }
    var day = Date.UTC(y, mo - 1, d) / 864e5, L = lunarMonths(y);
    for (var i = L.length - 1; i >= 0; i--) if (L[i].day <= day) return { m: L[i].m, d: day - L[i].day + 1, leap: L[i].leap };
    return null;
  }
  function rokuyo(y, mo, d) { var l = lunar(y, mo, d); return l ? RK[(l.m + l.d) % 6] : ""; }
  return { rokuyo: rokuyo, wxKind: null };
})();
var BD = (function () {
  var R = Math.PI / 180;
  function jd(d) { return d.getTime() / 864e5 + 2440587.5; }
  function sunLon(d) { var n = jd(d) - 2451545, L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360 * R; return ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360 + 360) % 360; }
  var SEKKI = ["春分", "清明", "穀雨", "立夏", "小満", "芒種", "夏至", "小暑", "大暑", "立秋", "処暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "啓蟄"];
  function sekki(d) {
    var i = Math.floor(sunLon(d) / 15), t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), start = null, next = null;
    for (var k = 0; k < 20 && !start; k++) { var p = new Date(t.getTime() - k * 864e5); if (Math.floor(sunLon(p) / 15) !== i) start = new Date(p.getTime() + 864e5); }
    for (k = 1; k < 20 && !next; k++) { var q = new Date(t.getTime() + k * 864e5); if (Math.floor(sunLon(q) / 15) !== i) next = q; }
    return { i: i, name: SEKKI[i], deg: sunLon(d), start: start, next: next, nextName: SEKKI[(i + 1) % 24] };
  }
  function moon(d) { var age = ((jd(d) - 2451550.1) % 29.530588853 + 29.530588853) % 29.530588853; var n = age < 1.5 ? "新月" : age < 6.5 ? "三日月" : age < 9 ? "上弦" : age < 13.8 ? "十日夜" : age < 15.8 ? "満月" : age < 20 ? "十六夜〜" : age < 23.5 ? "下弦" : age < 28 ? "有明月" : "新月"; return { age: age, name: n }; }
  function nthMon(y, m, n) { var f = new Date(y, m - 1, 1).getDay(); return 1 + ((8 - f) % 7) + (n - 1) * 7; }
  function holidays(y) {
    var H = {}, add = function (m, d, n) { H[m + "-" + d] = n; }, b = y - 1980;
    add(1, 1, "元日"); add(1, nthMon(y, 1, 2), "成人の日"); add(2, 11, "建国記念の日"); add(2, 23, "天皇誕生日");
    add(3, Math.floor(20.8431 + 0.242194 * b - Math.floor(b / 4)), "春分の日"); add(4, 29, "昭和の日"); add(5, 3, "憲法記念日"); add(5, 4, "みどりの日"); add(5, 5, "こどもの日");
    add(7, nthMon(y, 7, 3), "海の日"); add(8, 11, "山の日"); add(9, nthMon(y, 9, 3), "敬老の日"); add(9, Math.floor(23.2488 + 0.242194 * b - Math.floor(b / 4)), "秋分の日");
    add(10, nthMon(y, 10, 2), "スポーツの日"); add(11, 3, "文化の日"); add(11, 23, "勤労感謝の日");
    Object.keys(H).forEach(function (k) { var p = k.split("-"), d = new Date(y, p[0] - 1, +p[1]); if (d.getDay() === 0) { var x = new Date(d); do { x.setDate(x.getDate() + 1); } while (H[(x.getMonth() + 1) + "-" + x.getDate()]); H[(x.getMonth() + 1) + "-" + x.getDate()] = "振替休日"; } });
    for (var t = new Date(y, 0, 2); t.getFullYear() === y; t.setDate(t.getDate() + 1)) { var a = new Date(t), c = new Date(t); a.setDate(a.getDate() - 1); c.setDate(c.getDate() + 1); var key = (t.getMonth() + 1) + "-" + t.getDate(); if (!H[key] && t.getDay() !== 0 && H[(a.getMonth() + 1) + "-" + a.getDate()] && H[(c.getMonth() + 1) + "-" + c.getDate()] && H[(a.getMonth() + 1) + "-" + a.getDate()] !== "振替休日") H[key] = "国民の休日"; }
    return H;
  }
  return { sekki: sekki, moon: moon, holidays: holidays };
})();
var JDate = makeJDate(), SUN = null;
var LIB = { cal: CAL, bd: { sekki: BD.sekki, moon: BD.moon, holidays: BD.holidays, riseSet: function () { return SUN || { rise: null, set: null }; } }, JDate: JDate };
const E6 = { k: "#000000", w: "#ffffff", r: "#ff0000", y: "#ffff00", b: "#0000ff", g: "#00ff00" };
const E6_RGB = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [255, 255, 0], [0, 0, 255], [0, 255, 0]];
function theme(name) {
  if (name === "e6") return { e6: 1, bg: E6.w, bg2: E6.w, panel: E6.w, line: E6.k, lw: 3, text: E6.k, sub: E6.k, hot: E6.r, cool: E6.b, rain: E6.b, rainFill: E6.b, sun: E6.y, sunLine: E6.k, cloud: E6.w, cloudLine: E6.k, good: E6.g, goodT: E6.k, bad: E6.r, badT: E6.w, hl: E6.y, hlT: E6.k, chip: E6.w, chipT: E6.k, taian: E6.r, taianT: E6.w, grid: E6.k, gridOp: 1, segOp: 1 };
  if (name === "light") return { bg: "#f6f7fb", bg2: "#e9edf5", panel: "#ffffff", line: "#d5dbe6", lw: 2, text: "#141a26", sub: "#4f5b70", hot: "#e0483e", cool: "#2a6fdb", rain: "#1f8fd6", rainFill: "rgba(31,143,214,.18)", sun: "#ffb21e", sunLine: "#e08a00", cloud: "#e3e9f3", cloudLine: "#6d7d96", good: "#d8f5e6", goodT: "#11734a", bad: "#fde1df", badT: "#b3261e", hl: "#ffd84d", hlT: "#141a26", chip: "#eef1f7", chipT: "#2b3445", taian: "#e0483e", taianT: "#ffffff", grid: "#c9d1de", gridOp: 1, segOp: .22 };
  return { bg: "#0d1424", bg2: "#1b2442", panel: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.14)", lw: 2, text: "#f4f7fc", sub: "#a7b4cc", hot: "#ff7a6b", cool: "#6fb0ff", rain: "#46d3ff", rainFill: "rgba(70,211,255,.22)", sun: "#ffc24a", sunLine: "#ffc24a", cloud: "rgba(200,215,240,.22)", cloudLine: "#c8d7f0", good: "rgba(61,220,151,.18)", goodT: "#5fe3a8", bad: "rgba(255,107,107,.18)", badT: "#ff8b8b", hl: "#ffd84d", hlT: "#141a26", chip: "rgba(255,255,255,.08)", chipT: "#dfe7f5", taian: "#ffd84d", taianT: "#141a26", grid: "rgba(255,255,255,.12)", gridOp: 1, segOp: .28 };
}
const FONT = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Meiryo',sans-serif";
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const pad = n => String(n).padStart(2, "0");
/* 文字の幅（全角＝1em・半角≒0.56em）と折り返し */
function tw(s, fs) { let w = 0; for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e7f || /[Ａ-ｚ]/.test(ch) ? 1 : /[MW@%]/.test(ch) ? 0.82 : /[il.,:;'|!]/.test(ch) ? 0.3 : 0.58; return w * fs; }
function wrap(s, maxW, fs, lines) {
  const out = []; let cur = "";
  for (const ch of String(s || "")) { if (tw(cur + ch, fs) > maxW) { out.push(cur); cur = ch; if (out.length >= lines) break; } else cur += ch; }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && tw(out.join(""), 1) < tw(String(s), 1) - 0.01) { let l = out[lines - 1]; while (l && tw(l + "…", fs) > maxW) l = l.slice(0, -1); out[lines - 1] = l + "…"; }
  return out;
}
function fit(s, maxW, fs, min) { while (fs > min && tw(s, fs) > maxW) fs -= 2; return fs; }
function T(x, y, s, fs, fill, o = {}) { return '<text x="' + x + '" y="' + y + '" font-size="' + fs + '" fill="' + fill + '"' + (o.w ? ' font-weight="' + o.w + '"' : "") + (o.a ? ' text-anchor="' + o.a + '"' : "") + (o.ls ? ' letter-spacing="' + o.ls + '"' : "") + ">" + esc(s) + "</text>"; }
function rect(x, y, w, h, r, fill, th, o = {}) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '"' + (o.stroke !== false ? ' stroke="' + (o.sc || th.line) + '" stroke-width="' + (o.sw || th.lw) + '"' : "") + "/>"; }
function chip(x, y, s, th, o = {}) { const fs = o.fs || 26, w = tw(s, fs) + 36, h = fs + 22; return { w, svg: rect(x, y, w, h, h / 2, o.bg || th.chip, th, { stroke: !!th.e6 || !!o.sc, sc: o.sc }) + T(x + w / 2, y + h / 2 + fs * 0.36, s, fs, o.fg || th.chipT, { a: "middle", w: o.w || 700 }) }; }
function chips(x, y, list, th, maxX, o) { let s = "", cx = x; for (const c of list) { if (!c) continue; const r = chip(cx, y, c.t, th, { ...o, ...c }); if (cx + r.w > maxX) break; s += r.svg; cx += r.w + 12; } return s; }
function frame(th, body, title) {
  const bg = th.e6 ? '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' : '<defs><linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + th.bg + '"/><stop offset="1" stop-color="' + th.bg2 + '"/></linearGradient></defs><rect width="' + W + '" height="' + H + '" fill="url(#bgG)"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="' + FONT + '" role="img" aria-label="' + esc(title) + '">' + bg + body + "</svg>";
}

/* ---- 天気アイコン（太い線・6 色でも潰れない形） ---- */
function icon(kindMain, sub, x, y, s, th) {
  const k = s / 24, g = (inner, dx = 0, dy = 0, sc = 1) => '<g transform="translate(' + (x + dx * k) + " " + (y + dy * k) + ") scale(" + (k * sc) + ')">' + inner + "</g>";
  const sw = th.e6 ? 1.5 : 1.3;
  const sun = '<circle cx="12" cy="12" r="4.6" fill="' + th.sun + '" stroke="' + th.sunLine + '" stroke-width="' + sw + '"/><g stroke="' + th.sunLine + '" stroke-width="' + sw + '" stroke-linecap="round"><path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></g>';
  const cloud = '<path d="M7 18.5h10.2a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 6.8 9.9 4.3 4.3 0 0 0 7 18.5z" fill="' + th.cloud + '" stroke="' + th.cloudLine + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
  const rain = '<g stroke="' + th.rain + '" stroke-width="' + (sw + .3) + '" stroke-linecap="round"><path d="M8 20.5l-1 2.4M12 20.5l-1 2.4M16 20.5l-1 2.4"/></g>';
  const snow = '<g fill="' + (th.e6 ? th.cool : "#e8f4ff") + '"><circle cx="8" cy="21.4" r="1.2"/><circle cx="12" cy="22.4" r="1.2"/><circle cx="16" cy="21.4" r="1.2"/></g>';
  const bolt = '<path d="M12.6 16.6l-2.2 3.6h2.6l-1.6 3.2" fill="none" stroke="' + (th.e6 ? th.hot : "#ffd84d") + '" stroke-width="' + (sw + .3) + '" stroke-linejoin="round"/>';
  if (kindMain === "sun") return sub ? g(sun, -3, -3, .8) + g(cloud + (sub === "rain" ? rain : sub === "snow" ? snow : ""), 3, 2, .75) : g(sun);
  if (kindMain === "cloud") return (sub === "sun" ? g(sun, 8, -2, .55) : "") + g(cloud + (sub === "rain" ? rain : sub === "snow" ? snow : ""), 0, -2);
  if (kindMain === "rain") return (sub === "sun" ? g(sun, 8, -3, .5) : "") + g(cloud + rain + (sub === "thunder" ? bolt : sub === "snow" ? snow : ""), 0, -3);
  if (kindMain === "thunder") return g(cloud + bolt, 0, -3);
  return g(cloud + snow + (sub === "rain" ? rain : ""), 0, -3);
}
function kindOfText(w) { w = String(w || ""); return /雷/.test(w) ? ["rain", "thunder"] : /雪/.test(w) ? ["snow", /雨/.test(w) ? "rain" : ""] : /雨/.test(w) ? ["rain", /晴/.test(w) ? "sun" : ""] : /晴/.test(w) ? ["sun", /くもり|曇/.test(w) ? "cloud" : ""] : ["cloud", ""]; }
function moonIcon(age, x, y, r, th) {
  const p = age / 29.530588853, k = Math.cos(p * 2 * Math.PI), wax = p < 0.5, ex = Math.abs(k) * r;
  const lit = "M" + x + " " + (y - r) + " A" + r + " " + r + " 0 0 " + (wax ? 1 : 0) + " " + x + " " + (y + r) + " A" + ex.toFixed(1) + " " + r + " 0 0 " + ((k > 0) === wax ? 0 : 1) + " " + x + " " + (y - r) + "Z";
  return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (th.e6 ? E6.k : "#1c2238") + '" stroke="' + (th.e6 ? E6.k : "rgba(255,255,255,.25)") + '" stroke-width="2"/><path d="' + lit + '" fill="' + (th.e6 ? E6.y : "#f6e7a8") + '"/>';
}

/* ---- 天気ダッシュボード ---- */
const WDJ = ["日", "月", "火", "水", "木", "金", "土"];
function wxSvg(wx, opt = {}) {
  const L = LIB, th = theme(opt.theme), now = new L.JDate(opt.at || Date.now()), y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  wx = wx || {}; const n = wx.now || {}, t = wx.today || {}, bd = L.bd;
  const rk = L.cal.rokuyo(y, m, d), hol = bd.holidays(y)[m + "-" + d] || "", sk = bd.sekki(now), mo = bd.moon(now), rs = bd.riseSet(now, wx.ll);
  const H3 = ((wx.h3 && wx.h3.list) || []).map(h => ({ ...h, ms: Date.parse(h.t) }));
  const cur = H3.filter(h => h.ms <= now.getTime() + 90 * 6e4).pop() || H3[0] || null;
  const curText = (cur && cur.w) || t.text || "";
  const code = t.code ? L.cal.wxKind(t.code) : null, ck = kindOfText(curText);
  const kMain = cur && cur.w ? ck[0] : code ? code.main : ck[0], kSub = cur && cur.w ? ck[1] : code ? code.sub : ck[1];
  const popAt = ms => { const P = t.pops || []; for (const p of P) { const s = Date.parse(p.t + ":00+09:00"); if (ms >= s && ms < s + 6 * 36e5) return +p.v; } return null; };
  const feels = (tt, h, v) => (tt == null || h == null) ? null : Math.round((tt + 0.33 * (h / 100 * 6.105 * Math.exp(17.27 * tt / (237.7 + tt))) - 0.7 * (v || 0) - 4) * 10) / 10;
  const d0 = (wx.days || [])[0] || {}; let mx = t.max != null ? t.max : (d0.max !== "" && d0.max != null ? +d0.max : null), mn = t.min != null ? t.min : (d0.min !== "" && d0.min != null ? +d0.min : null);
  if (mx == null) { const hv = H3.filter(x => String(x.t).slice(0, 10) === String(t.date || "")).map(x => +x.temp).filter(v => !isNaN(v)); if (hv.length) mx = Math.max(...hv); }
  const hm = dt => dt ? pad(dt.getHours()) + ":" + pad(dt.getMinutes()) : "–";
  let s = "";
  /* ① 見出し: 日付と時刻・六曜・節気・祝日・月 */
  s += T(56, 128, m + "/" + d, 118, th.text, { w: 800, ls: -2 });
  const dw = tw(m + "/" + d, 118) - 2;
  s += T(56 + dw - 4, 128, "（" + WDJ[now.getDay()] + "）", 54, now.getDay() === 0 || hol ? th.hot : now.getDay() === 6 ? th.cool : th.text, { w: 700 });
  s += T(56 + dw + 150, 128, pad(now.getHours()) + ":" + pad(now.getMinutes()), 92, th.text, { w: 700 });
  s += chips(60, 156, [rk ? { t: rk, bg: rk === "大安" ? th.taian : th.chip, fg: rk === "大安" ? th.taianT : th.chipT } : null, hol ? { t: "祝 " + hol, bg: th.hot, fg: "#fff" } : null, { t: "二十四節気 " + sk.name }, sk.next ? { t: "次は" + sk.nextName + " " + (sk.next.getMonth() + 1) + "/" + sk.next.getDate() } : null], th, 1180, { fs: 28 });
  s += moonIcon(mo.age, 1300, 100, 58, th) + T(1376, 92, "月齢 " + mo.age.toFixed(1), 36, th.text, { w: 700 }) + T(1376, 136, mo.name, 30, th.sub);
  /* ② いまの天気（左）＋数字のタイル（右 3×2） */
  const top = 236;
  s += rect(48, top, 620, 420, 28, th.panel, th);
  s += icon(kMain, kSub, 78, top + 30, 220, th);
  const temp = n.temp != null ? (+n.temp).toFixed(1) : "–";
  s += T(318, top + 190, temp, 150, th.text, { w: 800, ls: -4 }) + T(Math.min(318 + tw(temp, 150) * 0.97 + 8, 610), top + 80, "°C", 44, th.sub, { w: 700 });
  const wt = wrap(curText || "—", 560, 46, 1)[0];
  s += T(84, top + 318, wt, fit(wt, 560, 46, 30), th.text, { w: 800 });
  s += T(84, top + 378, (wx.place || "池袋（東京）") + "・" + String(n.time || "").slice(11, 16) + " 時点", 28, th.sub, { w: 500 });
  const tiles = [["きょう", (mx != null ? "↑" + Math.round(mx) + "°" : "–") + (mn != null ? " ↓" + Math.round(mn) + "°" : ""), mx != null && mx >= 30 ? th.hot : null],
    ["降水確率", popAt(now.getTime()) != null ? popAt(now.getTime()) + "%" : "–", popAt(now.getTime()) >= 50 ? th.rain : null],
    ["体感", feels(n.temp, n.hum, n.wind) != null ? feels(n.temp, n.hum, n.wind) + "°" : "–"],
    ["湿度", n.hum != null ? n.hum + "%" : "–"], ["風", n.wind != null ? n.wind + " m/s" : "–"], ["日の出・入り", hm(rs.rise) + "・" + hm(rs.set)]];
  tiles.forEach((tl, i) => {
    const c = i % 3, r = Math.floor(i / 3), x = 696 + c * 290, yy = top + r * 214, w = 274, h = 202;
    s += rect(x, yy, w, h, 24, th.panel, th) + T(x + 24, yy + 50, tl[0], 28, th.sub, { w: 700 });
    const fs = fit(tl[1], w - 40, 64, 34); s += T(x + 24, yy + 150, tl[1], fs, tl[2] || th.text, { w: 800, ls: -1 });
  });
  /* ③ この先 24 時間（3 時間ごと 8 コマ） */
  const hy = top + 448, slots = H3.filter(h => h.ms > now.getTime() - 30 * 6e4).slice(0, 8);
  const cw = (W - 96 - 7 * 12) / 8;
  slots.forEach((h, i) => {
    const x = 48 + i * (cw + 12), dt = new L.JDate(h.ms), kk = kindOfText(h.w), pr = popAt(h.ms);
    s += rect(x, hy, cw, 214, 22, th.panel, th);
    s += T(x + cw / 2, hy + 42, dt.getHours() === 0 ? (dt.getMonth() + 1) + "/" + dt.getDate() : dt.getHours() + "時", 30, th.sub, { a: "middle", w: 700 });
    s += icon(kk[0], kk[1], x + cw / 2 - 40, hy + 54, 80, th);
    s += T(x + cw / 2, hy + 170, Math.round(h.temp) + "°", 46, th.text, { a: "middle", w: 800 });
    s += T(x + cw / 2, hy + 202, pr != null ? "雨 " + pr + "%" : "", 24, pr >= 50 ? th.rain : th.sub, { a: "middle", w: 700 });
  });
  /* ④ 気温の線（実況＋予報）と雨の確率の帯 */
  const gy = hy + 236, gh = H - gy - 64, gx = 110, gw = W - 48 - gx;
  s += rect(48, gy, W - 96, gh, 22, th.panel, th);
  const t0 = now.getTime() - 3 * 36e5, t1 = now.getTime() + 24 * 36e5, X = ms => gx + gw * (ms - t0) / (t1 - t0);
  const day0 = new L.JDate(y, m - 1, d).getTime(), P = [];
  (wx.obs || []).forEach(o => { if (o.temp != null) P.push({ ms: day0 + o.h * 36e5, v: o.temp }); });
  if (n.temp != null) P.push({ ms: now.getTime(), v: +n.temp });
  H3.forEach(h => { if (h.ms > now.getTime()) P.push({ ms: h.ms, v: h.temp, f: 1 }); });
  const PS = P.filter(p => p.ms >= t0 - 36e5 && p.ms <= t1 + 36e5).sort((a, b) => a.ms - b.ms);
  if (PS.length >= 2) {
    const vs = PS.map(p => p.v), lo = Math.floor(Math.min(...vs)) - 2, hi = Math.ceil(Math.max(...vs)) + 2, Y = v => gy + 30 + (gh - 90) * (hi - v) / (hi - lo);
    for (const pp of t.pops || []) { const st = Date.parse(pp.t + ":00+09:00"), a = Math.max(st, t0), b = Math.min(st + 6 * 36e5, t1); if (b <= a || pp.v === "") continue; const bh = (gh - 90) * (+pp.v / 100) * 0.8; s += '<rect x="' + X(a).toFixed(1) + '" y="' + (gy + gh - 60 - bh).toFixed(1) + '" width="' + (X(b) - X(a) - 4).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + th.rainFill + '"' + (th.e6 ? ' fill-opacity="1"' : "") + "/>"; if (+pp.v >= 20 && X(b) - X(a) > 90) s += T(X(a) + 10, gy + gh - 70 - bh, "雨" + pp.v + "%", 22, th.rain, { w: 700 }); }
    for (let hh = Math.ceil(t0 / 36e5) * 36e5; hh <= t1; hh += 36e5) { const dt = new L.JDate(hh); if (dt.getHours() % 3) continue; s += '<line x1="' + X(hh).toFixed(1) + '" x2="' + X(hh).toFixed(1) + '" y1="' + (gy + 20) + '" y2="' + (gy + gh - 60) + '" stroke="' + th.grid + '" stroke-width="' + (th.e6 ? 1 : 1.5) + '"' + (th.e6 ? ' stroke-dasharray="4 8"' : "") + "/>" + T(X(hh), gy + gh - 24, dt.getHours() === 0 ? (dt.getMonth() + 1) + "/" + dt.getDate() : dt.getHours() + "時", 24, th.sub, { a: "middle", w: 600 }); }
    const step = Math.max(2, Math.round((hi - lo) / 3)); for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) s += T(gx - 14, Y(v) + 8, v + "°", 24, th.sub, { a: "end", w: 600 });
    const smooth = Q => { let dd = "M" + Q[0][0].toFixed(1) + " " + Q[0][1].toFixed(1); for (let i = 0; i < Q.length - 1; i++) { const p0 = Q[i - 1] || Q[i], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2] || p2; dd += " C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1); } return dd; };
    const clipId = "gc"; s += '<defs><clipPath id="' + clipId + '"><rect x="' + gx + '" y="' + gy + '" width="' + gw + '" height="' + gh + '"/></clipPath></defs>';
    const Q = PS.map(p => [X(p.ms), Y(p.v)]);
    s += '<path d="' + smooth(Q) + '" fill="none" stroke="' + th.hot + '" stroke-width="' + (th.e6 ? 6 : 6) + '" stroke-linecap="round" clip-path="url(#' + clipId + ')"/>';
    PS.filter(p => p.f && p.ms <= t1).forEach(p => { s += '<circle cx="' + X(p.ms).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="6" fill="' + th.hot + '"/>' + T(X(p.ms), Y(p.v) - 16, Math.round(p.v) + "°", 26, th.text, { a: "middle", w: 800 }); });
    const nx = X(now.getTime()); s += '<line x1="' + nx.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y1="' + (gy + 16) + '" y2="' + (gy + gh - 60) + '" stroke="' + th.text + '" stroke-width="3" stroke-dasharray="8 6"/>';
    if (n.temp != null) s += '<circle cx="' + nx.toFixed(1) + '" cy="' + Y(+n.temp).toFixed(1) + '" r="11" fill="' + (th.e6 ? E6.y : th.hl) + '" stroke="' + th.text + '" stroke-width="3"/>';
    s += T(nx - 12, gy + 44, "← これまで", 24, th.sub, { a: "end", w: 700 }) + T(nx + 12, gy + 44, "予報 →", 24, th.sub, { w: 700 });
  } else s += T(W / 2, gy + gh / 2, "予報のデータを読み込み中です", 32, th.sub, { a: "middle" });
  s += T(56, H - 22, "天気: Open-Meteo.com（推定値）／ 六曜・節気・月齢は計算の目安 ／ 東京ステーションガイド", 22, th.sub);
  s += T(W - 56, H - 22, "更新 " + m + "/" + d + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()), 22, th.sub, { a: "end" });
  return frame(th, s, "天気ダッシュボード " + m + "月" + d + "日");
}

/* ---- 今日は何の日ダッシュボード ---- */

/* ---- Open-Meteo（このサイトの天気の取得結果）→ NightLife の wx の形 ---- */
var TXT = { 0: "快晴", 1: "晴れ", 2: "晴れ時々くもり", 3: "くもり", 45: "霧", 48: "霧", 51: "霧雨", 53: "霧雨", 55: "霧雨", 56: "着氷性の霧雨", 57: "着氷性の霧雨",
  61: "小雨", 63: "雨", 65: "強い雨", 66: "着氷性の雨", 67: "着氷性の雨", 71: "小雪", 73: "雪", 75: "大雪", 77: "雪あられ", 80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨",
  85: "にわか雪", 86: "強いにわか雪", 95: "雷雨", 96: "雷雨（ひょう）", 99: "雷雨（ひょう）" };
function txt(c) { return TXT[c] != null ? TXT[c] : ""; }
RG.wxDashData = function (cur) {
  var d = cur && cur.data; if (!d || !d.current) return null;
  var c = d.current, h = d.hourly || {}, D = d.daily || {}, now = Date.now(), today = String(c.time || "").slice(0, 10);
  var tms = function (s) { return Date.parse(s + ":00+09:00"); };
  var list = [], obs = [], pops = [];
  (h.time || []).forEach(function (t, i) {
    var ms = tms(t), hr = +t.slice(11, 13);
    if (hr % 3 === 0) list.push({ t: t + ":00+09:00", w: txt(h.weather_code[i]), temp: h.temperature_2m[i] });
    if (t.slice(0, 10) === today && ms <= now) obs.push({ h: hr, temp: h.temperature_2m[i] });
  });
  for (var i = 0; i < (h.time || []).length; i += 6) {                  // 0・6・12・18 時からの 6 時間の «いちばん高い降水確率»
    var mx = null; for (var k = i; k < i + 6 && k < h.time.length; k++) { var v = h.precipitation_probability[k]; if (v != null && (mx == null || v > mx)) mx = v; }
    if (+h.time[i].slice(11, 13) % 6 === 0) pops.push({ t: h.time[i].slice(0, 16), v: mx == null ? "" : String(mx) });
  }
  SUN = D.sunrise ? { rise: new JDate(tms(D.sunrise[0])), set: new JDate(tms(D.sunset[0])) } : null;
  return {
    now: { temp: c.temperature_2m, hum: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m / 3.6 * 10) / 10, time: c.time },
    today: { date: today, text: txt(c.weather_code), max: D.temperature_2m_max ? D.temperature_2m_max[0] : null, min: D.temperature_2m_min ? D.temperature_2m_min[0] : null, pops: pops },
    h3: { list: list }, obs: obs, place: (cur.place || "いまの場所").replace(/^📍\s*/, ""), days: []
  };
};
RG.wxDashSvg = function (cur, theme) { var wx = RG.wxDashData(cur); return wx ? wxSvg(wx, { theme: theme || "night" }) : ""; };
})(window.RG);
