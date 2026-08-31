/* =========================================================================
   こよみの追加パーツ
   ・天気（Open-Meteo。無料・APIキー不要・16日先まで）
   ・月の満ち欠け（計算）
   ・大きな年中行事の日付を、きまりから割り出す
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;

/* ------------------------------------------------------------- 月の満ち欠け */
var MOON = ["🌑 新月", "🌒 三日月", "🌓 上弦", "🌔 十三夜", "🌕 満月",
            "🌖 十六夜", "🌗 下弦", "🌘 有明月"];
function moon(d) {
  // 2000年1月6日18:14(UT) を新月の基準にして、朔望月29.530588日で数える
  var base = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
  var t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 3) / 86400000;   // 正午JST
  var age = (t - base) % 29.530588;
  if (age < 0) age += 29.530588;
  var i = Math.floor(age / 29.530588 * 8 + 0.5) % 8;
  return { i: i, label: MOON[i], age: age };
}
RG.moonOf = moon;

/* ------------------------------------------------------- 大きな行事の日付 */
function nthDay(y, m, nth, wd) {
  if (nth === -1) {
    var last = new Date(y, m, 0);            // その月の末日
    var back = (last.getDay() - wd + 7) % 7;
    return new Date(y, m - 1, last.getDate() - back);
  }
  var first = new Date(y, m - 1, 1);
  var add = (wd - first.getDay() + 7) % 7;
  return new Date(y, m - 1, 1 + add + (nth - 1) * 7);
}
function spanOf(ev, y) {
  var r = ev.r;
  if (r[0] === "fixed") { return [new Date(y, r[1] - 1, r[2]), new Date(y, r[1] - 1, r[2])]; }
  if (r[0] === "fixed2") {
    var s = new Date(y, r[1] - 1, r[2]);
    var e = new Date(y + (r[3] < r[1] ? 1 : 0), r[3] - 1, r[4]);
    return [s, e];
  }
  if (r[0] === "nth") { var d = nthDay(y, r[1], r[2], r[3]); return [d, new Date(d)]; }
  if (r[0] === "nthspan") {
    var s2 = nthDay(y, r[1], r[2], r[3]);
    var e2 = new Date(s2); e2.setDate(s2.getDate() + (r[4] - 1));
    return [s2, e2];
  }
  return null;
}
/* その日にかかる大きな行事を返す。単日か期間かも分かるようにする */
RG.bigEventsOn = function (d) {
  var out = [];
  (RG.BIGEVENTS || []).forEach(function (ev) {
    [d.getFullYear() - 1, d.getFullYear()].forEach(function (y) {
      var sp = spanOf(ev, y);
      if (!sp) return;
      var s = sp[0], e = sp[1];
      s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
      var days = Math.round((e - s) / 86400000) + 1;
      e.setHours(23, 59, 59, 0);
      if (d < s || d > e) return;
      if (out.some(function (o) { return o.ev === ev; })) return;
      out.push({ ev: ev, s: s, e: e, days: days,
                 one: days <= 1,
                 nth: Math.round((d - s) / 86400000) + 1 });
    });
  });
  return out.sort(function (a, b) { return b.ev.sc - a.ev.sc; });
};
/* その月にある大きな行事（カレンダーの印つけ用） */
RG.bigEventDays = function (y, m) {
  var map = {};
  (RG.BIGEVENTS || []).forEach(function (ev) {
    [y - 1, y, y + 1].forEach(function (yy) {
      var sp = spanOf(ev, yy);
      if (!sp) return;
      var d = new Date(sp[0]);
      while (d <= sp[1]) {
        if (d.getFullYear() === y && d.getMonth() === m) map[d.getDate()] = ev;
        d.setDate(d.getDate() + 1);
      }
    });
  });
  return map;
};

/* ----------------------------------------------------------------- 天気 */
var WX = {
  0: ["☀️", "快晴"], 1: ["🌤️", "晴れ"], 2: ["⛅", "くもりがち"], 3: ["☁️", "くもり"],
  45: ["🌫️", "きり"], 48: ["🌫️", "きり"],
  51: ["🌦️", "こぬか雨"], 53: ["🌦️", "こぬか雨"], 55: ["🌦️", "こぬか雨"],
  61: ["🌧️", "小雨"], 63: ["🌧️", "雨"], 65: ["🌧️", "強い雨"],
  66: ["🌨️", "こおる雨"], 67: ["🌨️", "こおる雨"],
  71: ["🌨️", "小雪"], 73: ["❄️", "雪"], 75: ["❄️", "大雪"], 77: ["❄️", "こな雪"],
  80: ["🌦️", "にわか雨"], 81: ["🌧️", "にわか雨"], 82: ["⛈️", "激しい雨"],
  85: ["🌨️", "にわか雪"], 86: ["❄️", "にわか雪"],
  95: ["⛈️", "雷雨"], 96: ["⛈️", "雷雨・ひょう"], 99: ["⛈️", "雷雨・ひょう"]
};
var wxCache = null, wxAt = 0, wxWait = null;
RG.weatherOf = function (ymd, cb) {
  var now = Date.now();
  if (wxCache && now - wxAt < 3600000) { cb(wxCache[ymd] || null); return; }
  if (wxWait) { wxWait.push([ymd, cb]); return; }
  wxWait = [[ymd, cb]];
  var o = RG.Trip && RG.Trip.origin ? RG.Trip.origin : [35.68, 139.76];
  var u = "https://api.open-meteo.com/v1/forecast?latitude=" + o[0].toFixed(3) +
          "&longitude=" + o[1].toFixed(3) +
          "&daily=weather_code,temperature_2m_max,temperature_2m_min," +
          "precipitation_probability_max,sunrise,sunset&timezone=Asia%2FTokyo&forecast_days=16";
  fetch(u).then(function (r) { return r.json(); }).then(function (j) {
    var D = j.daily, m = {};
    for (var i = 0; i < D.time.length; i++) {
      m[D.time[i]] = { code: D.weather_code[i], hi: D.temperature_2m_max[i],
                       lo: D.temperature_2m_min[i], pop: D.precipitation_probability_max[i],
                       rise: (D.sunrise[i] || "").slice(11, 16),
                       set: (D.sunset[i] || "").slice(11, 16) };
    }
    wxCache = m; wxAt = Date.now();
    var q = wxWait; wxWait = null;
    q.forEach(function (x) { x[1](m[x[0]] || null); });
  }).catch(function () {
    var q = wxWait; wxWait = null;
    q.forEach(function (x) { x[1](null); });
  });
};
RG.wxIcon = function (code) { return (WX[code] || ["🌡️", "—"]); };

})(window.RG);
