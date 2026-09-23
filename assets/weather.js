/* =========================================================================
   いまの天気と昼夜（v84）  Mini Tokyo 3D の «いまの空» を参考に
   ・地図の右上に «いま見ている場所» の天気チップ（Open-Meteo。API キー不要・CORS 可・CC BY 4.0）
     — 寄っているときは画面の中心、日本全体のときは中村橋（注視駅）の天気
     — 0.1 度（約 10km）の升目ごとに 10 分だけ覚え、地図を動かしても同じ升目なら取りに行かない
   ・昼と夜: 見ている場所の太陽の高さを 1 分ごとに計算し（NOAA の近似式）、
     夕方は暖色→紫、夜は青みの «空の色» を地図に重ねる（mix-blend-mode: multiply。線や文字の色はそのまま暗くなる）
   ・雨・雪・きり・雷: いまの天気コードに合わせて、うっすら流れる筋・舞う点・白いもや・ときどきの閃光
     — すべて CSS だけ（1 枚の合成レイヤを transform で動かす。地図の描画には触れない）
     — «動きを減らす» 設定の端末では動かさない。設定で空の色・演出を別々に切れる
   ・チップを押すと、体感温度・湿度・風・降水確率・日の出入り・この先 12 時間の天気
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var API = "https://api.open-meteo.com/v1/forecast";
var TTL = 10 * 60000;                     // 同じ升目の天気を覚えておく時間
var cache = {};                           // key -> { at, data }
var cur = null;                           // いま出している天気 { key, la, lo, place, data }
var target = null;                        // { la, lo, place, key }
var moveT = null, sunT = null, inflight = null, lastFetchAt = 0;
var chip = null, sky = null, cloud = null, fx = null;
var isNight = false;

function S(k, def) { var v = RG.settings ? RG.settings[k] : undefined; return v === undefined || v === null ? def : v; }
function on() { return S("wx", true) !== false; }
function reduced() { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

/* ---------------------------------------------------------------- 太陽の高さ（度）。NOAA の近似式（誤差 0.1 度ほど） */
function sunAlt(d, la, lo) {
  var rad = Math.PI / 180;
  var n = d.getTime() / 86400000 - 10957.5;                       // J2000.0 からの日数
  var L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  var eps = (23.439 - 0.0000004 * n) * rad;
  var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  var gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  var ha = (gmst * 15 + lo) * rad - ra;
  var alt = Math.asin(Math.sin(la * rad) * Math.sin(dec) + Math.cos(la * rad) * Math.cos(dec) * Math.cos(ha));
  return alt / rad;
}
RG.sunAlt = sunAlt;

/* ---------------------------------------------------------------- 空の色。太陽の高さ → 重ねる色と濃さ */
function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
/* 上（空の高いところ）と下（地平線寄り）で色を変える。夕方は上が薄紫・下が橙、夜は青み一色 */
var C_GOLD = [246, 214, 168], C_GOLD_TOP = [236, 228, 214], C_DUSK = [238, 164, 112], C_VIOLET = [164, 150, 200], C_NIGHT = [128, 142, 196];
function skyOf(alt) {
  if (alt >= 8) return { top: C_GOLD_TOP, bot: C_GOLD, o: 0 };
  if (alt >= 0) { var t = (8 - alt) / 8; return { top: mix(C_GOLD_TOP, C_VIOLET, t * 0.6), bot: mix(C_GOLD, C_DUSK, t), o: 0.45 * t }; }
  if (alt >= -6) { var t2 = -alt / 6; return { top: mix(mix(C_GOLD_TOP, C_VIOLET, 0.6), C_NIGHT, t2), bot: mix(C_DUSK, C_VIOLET, t2), o: 0.45 + 0.25 * t2 }; }
  if (alt >= -12) { var t3 = (-alt - 6) / 6; return { top: C_NIGHT, bot: mix(C_VIOLET, C_NIGHT, t3), o: 0.70 + 0.20 * t3 }; }
  return { top: C_NIGHT, bot: C_NIGHT, o: 0.90 };
}
function phaseOf(alt) { return alt >= 8 ? "day" : alt >= 0 ? "golden" : alt >= -6 ? "dusk" : alt >= -12 ? "twilight" : "night"; }
RG.skyPhase = function () { var p = target || hubPoint(); if (!p) return "day"; return phaseOf(sunAlt(new Date(), p.la, p.lo)); };

/* ---------------------------------------------------------------- 画面の部品 */
function ensureDom() {
  var wrap = document.querySelector(".mapwrap"); if (!wrap) return false;
  if (!sky) {
    sky = document.createElement("div"); sky.id = "wxsky"; sky.setAttribute("aria-hidden", "true");
    cloud = document.createElement("div"); cloud.id = "wxcloud"; cloud.setAttribute("aria-hidden", "true");
    fx = document.createElement("div"); fx.id = "wxfx"; fx.setAttribute("aria-hidden", "true"); fx.innerHTML = "<i></i><i></i>";
    var svg = document.getElementById("map");
    // SVG の直後（地図の上、ボタン類の下）
    if (svg && svg.nextSibling) { wrap.insertBefore(sky, svg.nextSibling); wrap.insertBefore(cloud, sky.nextSibling); wrap.insertBefore(fx, cloud.nextSibling); }
    else { wrap.appendChild(sky); wrap.appendChild(cloud); wrap.appendChild(fx); }
    chip = document.createElement("button"); chip.id = "wxchip"; chip.type = "button"; chip.className = "wxchip"; chip.hidden = true;
    chip.setAttribute("aria-label", "いまの天気"); chip.title = "いま見ている場所の天気（押すとくわしく）";
    chip.addEventListener("click", function () { RG.weatherModal(); });
    wrap.appendChild(chip);
  }
  return true;
}

/* ---------------------------------------------------------------- どこの天気を出すか */
function hubPoint() {
  var id = (RG.settings && RG.settings.watch && RG.settings.watch[0]) || RG.HUB;
  var s = RG.byId && (RG.byId[id] || RG.byId[RG.HUB]);
  return s ? { la: s.la, lo: s.lo, place: s.n + "駅" } : { la: 35.7356, lo: 139.6353, place: "中村橋駅" };
}
function placeName(la, lo) {
  var ns = null; try { ns = RG.nearestStation && RG.nearestStation(la, lo); } catch (e) {}
  if (ns && ns.km < 1.5) return ns.t.n + "駅";                                   // 駅のそば → 駅名
  try { var mu = RG.muniAt && RG.muniAt(la, lo); if (mu && mu.n) return mu.n; } catch (e) {}   // 市区町村（面を読み込んでいれば）
  if (ns && ns.km < 8) return ns.t.n + "駅の近く";
  try { var pf = RG.prefAt && RG.prefAt(la, lo); if (pf && pf.n) return pf.n + "あたり"; } catch (e) {}
  return la.toFixed(2) + ", " + lo.toFixed(2);
}
function keyOf(la, lo) { return (Math.round(la * 10) / 10).toFixed(1) + "," + (Math.round(lo * 10) / 10).toFixed(1); }
function pickTarget() {
  var z = RG.zoomLevel ? RG.zoomLevel() : 1, p;
  if (z < 1.2 || !RG.Map || !RG.Map.viewBox) p = hubPoint();
  else {
    var vb = RG.Map.viewBox(), c = RG.unproject(vb.x + vb.w / 2, vb.y + vb.h / 2);
    if (!(c.la > 20 && c.la < 46 && c.lo > 122 && c.lo < 154)) p = hubPoint();          // 日本の外を向いているときは中村橋
    else p = { la: c.la, lo: c.lo, place: null };
  }
  p.key = keyOf(p.la, p.lo);
  return p;
}

/* ---------------------------------------------------------------- 取得 */
function fetchWx(p, cb) {
  var c = cache[p.key];
  if (c && Date.now() - c.at < TTL) { cb(c.data); return; }
  if (inflight && inflight.key === p.key) { inflight.cbs.push(cb); return; }
  var la = Math.round(p.la * 10) / 10, lo = Math.round(p.lo * 10) / 10;
  var u = API + "?latitude=" + la + "&longitude=" + lo +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m" +
    "&hourly=weather_code,temperature_2m,precipitation_probability&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FTokyo&forecast_days=2";
  var me = inflight = { key: p.key, cbs: [cb] };
  lastFetchAt = Date.now();
  fetch(u).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }).then(function (j) {
    if (!j || !j.current) throw new Error("bad");
    cache[p.key] = { at: Date.now(), data: j };
    if (inflight === me) inflight = null;
    me.cbs.forEach(function (f) { f(j); });
  }).catch(function () {
    if (inflight === me) inflight = null;
    me.cbs.forEach(function (f) { f(null); });
  });
}

/* ---------------------------------------------------------------- 天気コード → 演出の種類 */
function kindOf(code, d) {
  var c = +code;
  if (c >= 95) return "thunder";
  if (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return "snow";
  if (c === 66 || c === 67) return "sleet";
  if (c === 45 || c === 48) return "fog";
  if ((c >= 51 && c <= 65) || (c >= 80 && c <= 82)) return "rain";
  if (d && d.current && d.current.precipitation >= 0.3) return "rain";   // コードが晴れでも降っていれば筋を出す
  return "";
}
function levelOf(code, d) {
  var c = +code, mm = d && d.current ? (d.current.precipitation || 0) : 0;
  if (c === 65 || c === 82 || c === 75 || c >= 95 || mm >= 4) return 3;
  if (c === 55 || c === 63 || c === 81 || c === 73 || c === 86 || mm >= 1) return 2;
  return 1;
}
function windDir(deg) { if (deg == null) return ""; var N = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"]; return N[Math.round(deg / 45) % 8]; }
function hhmm(iso) { return (iso || "").slice(11, 16); }

/* ---------------------------------------------------------------- 描く */
function paintSky() {
  if (!sky) return;
  var p = target || hubPoint();
  var alt = sunAlt(new Date(), p.la, p.lo), s = skyOf(alt);
  var night = alt < -6;
  if (night !== isNight) { isNight = night; document.body.classList.toggle("wx-night", night); }
  document.body.setAttribute("data-sky", phaseOf(alt));
  if (!on() || S("wxSky", true) === false) { sky.style.opacity = "0"; return; }
  sky.style.backgroundImage = "linear-gradient(180deg, rgb(" + s.top.join(",") + "), rgb(" + s.bot.join(",") + "))"; sky.style.opacity = String(s.o);
  if (chip) chip.classList.toggle("wxchip--night", night);
  if (cloud && cur) paintFx(cur.data);                                  // 夜は雲の灰色を弱める
}
function paintFx(d) {
  if (!fx || !cloud) return;
  var show = on() && S("wxFx", true) !== false && d && d.current;
  var kind = show ? kindOf(d.current.weather_code, d) : "", lv = show ? levelOf(d.current.weather_code, d) : 0;
  fx.className = kind ? "wx-on wx-" + kind + " wx-l" + lv + (reduced() ? " wx-still" : "") : "";   // 汎用の .on/.lv2 と衝突しないよう wx- を付ける
  var cc = show ? (d.current.cloud_cover || 0) : 0, code = show ? +d.current.weather_code : 0;
  var o = 0;
  if (kind === "fog") o = 0.18; else if (code === 3 || cc >= 85) o = 0.42; else if (code === 2 || cc >= 55) o = 0.18;
  if (isNight && S("wxSky", true) !== false) o *= 0.4;                 // 夜は空の色で十分暗いので、雲の灰色は控えめに
  cloud.style.opacity = String(o);
}
function paintChip(d) {
  if (!chip) return;
  if (!on() || !d || !d.current) { chip.hidden = true; return; }
  var c = d.current, ic = RG.wxIcon ? RG.wxIcon(c.weather_code) : ["🌡️", "—"];
  var icon = ic[0];
  if (!c.is_day && (+c.weather_code === 0 || +c.weather_code === 1)) icon = "🌙";
  else if (!c.is_day && +c.weather_code === 2) icon = "☁️";
  chip.innerHTML = '<span class="wxchip__i">' + icon + '</span><b class="wxchip__t">' + Math.round(c.temperature_2m) + "°</b>" +
    '<span class="wxchip__w">' + esc(ic[1]) + "</span><small class=\"wxchip__p\">" + esc(cur && cur.place ? cur.place : "") + "</small>";
  chip.hidden = false;
}
function render(d) { paintSky(); paintFx(d); paintChip(d); }

/* ---------------------------------------------------------------- 地図が動いたとき（app.js の lod から 300ms 遅れで呼ばれる） */
function update(force) {
  if (!ensureDom()) return;
  if (!on()) { render(null); return; }
  var p = pickTarget();
  if (!force && target && target.key === p.key && cur && Date.now() - (cur.at || 0) < TTL) { if (!target.place) { target.place = placeName(p.la, p.lo); if (cur) cur.place = target.place; paintChip(cur.data); } return; }
  target = p; if (!target.place) target.place = placeName(p.la, p.lo);
  paintSky();
  fetchWx(p, function (d) {
    if (!target || target.key !== p.key) return;
    if (!d) { if (!cur) chip && (chip.hidden = true); return; }
    cur = { key: p.key, la: p.la, lo: p.lo, place: target.place, data: d, at: Date.now() };
    render(d);
  });
}
RG.weatherOnMove = function () { if (!on()) return; clearTimeout(moveT); moveT = setTimeout(function () { update(false); }, 600); };
RG.weatherRefresh = function () { cache = {}; update(true); };
RG.weatherApply = function () { if (!ensureDom()) return; if (!on()) { chip.hidden = true; render(null); document.body.classList.remove("wx-night"); return; } paintSky(); if (cur) render(cur.data); else update(true); };
RG.weatherNow = function () { return cur; };

/* ---------------------------------------------------------------- くわしく（チップを押したとき） */
RG.weatherModal = function () {
  var d = cur && cur.data, c = d && d.current;
  if (!c) { RG.openModal("🌤️ いまの天気", '<p class="set__d">天気を取得できていません。通信を確認して、少し待ってからもう一度押してください。</p>' + RG.weatherSwitchHTML()); RG.weatherSwitchBind(document.querySelector(".modal")); return; }
  var ic = RG.wxIcon(c.weather_code), D = d.daily || {}, H = d.hourly || {};
  var p = target || hubPoint(), alt = sunAlt(new Date(), p.la, p.lo), ph = phaseOf(alt);
  var PH = { day: "昼", golden: "夕方（日が低い）", dusk: "日の入り前後", twilight: "薄明", night: "夜" };
  var hours = "";
  if (H.time) {
    var now = Date.now(), i0 = -1;
    for (var i = 0; i < H.time.length; i++) { if (new Date(H.time[i] + ":00+09:00").getTime() >= now - 3600000) { i0 = i; break; } }
    if (i0 >= 0) {
      var cells = [];
      for (var k = i0; k < Math.min(H.time.length, i0 + 12); k++) {
        var wi = RG.wxIcon(H.weather_code[k]);
        cells.push('<div class="wxh"><span class="wxh__t">' + esc(H.time[k].slice(11, 13)) + "時</span><span class=\"wxh__i\">" + wi[0] + '</span><span class="wxh__d">' + Math.round(H.temperature_2m[k]) + "°</span><span class=\"wxh__p\">☂" + (H.precipitation_probability[k] != null ? H.precipitation_probability[k] : "–") + "%</span></div>");
      }
      hours = '<div class="wxhs">' + cells.join("") + "</div>";
    }
  }
  var html = '<div class="wxm">' +
    '<div class="wxm__hd"><span class="wxm__i">' + ic[0] + '</span><div><b class="wxm__t">' + Math.round(c.temperature_2m) + "°C</b> <span class=\"wxm__w\">" + esc(ic[1]) + "</span>" +
      '<div class="wxm__p">📍 ' + esc(cur.place || "") + " ・ " + esc(hhmm(c.time)) + " 時点 ・ " + PH[ph] + (c.is_day ? "" : "・夜") + "</div></div></div>" +
    '<div class="wxm__g">' +
      '<div><span>体感</span><b>' + Math.round(c.apparent_temperature) + "°C</b></div>" +
      '<div><span>湿度</span><b>' + c.relative_humidity_2m + "%</b></div>" +
      '<div><span>風</span><b>' + windDir(c.wind_direction_10m) + " " + Math.round(c.wind_speed_10m / 3.6) + " m/s</b></div>" +
      '<div><span>いまの降水</span><b>' + (c.precipitation || 0).toFixed(1) + " mm</b></div>" +
      (D.temperature_2m_max ? '<div><span>きょう</span><b>' + Math.round(D.temperature_2m_max[0]) + "° / " + Math.round(D.temperature_2m_min[0]) + "°</b></div>" : "") +
      (D.precipitation_probability_max ? '<div><span>降水確率</span><b>' + D.precipitation_probability_max[0] + "%</b></div>" : "") +
      (D.sunrise ? '<div><span>日の出</span><b>' + esc(hhmm(D.sunrise[0])) + "</b></div><div><span>日の入り</span><b>" + esc(hhmm(D.sunset[0])) + "</b></div>" : "") +
      '<div><span>雲量</span><b>' + (c.cloud_cover != null ? c.cloud_cover + "%" : "–") + "</b></div>" +
      '<div><span>太陽の高さ</span><b>' + alt.toFixed(0) + "°</b></div>" +
    "</div>" +
    (hours ? '<p class="set__d">この先 12 時間</p>' + hours : "") +
    RG.weatherSwitchHTML(true) +
    '<p class="src">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>（CC BY 4.0。各国気象機関の数値予報を合成した推定値で、観測値ではありません）' +
    "　昼夜の色: 見ている場所の太陽の高さを計算（NOAA の近似式）。参考: <a href=\"https://minitokyo3d.com/\" target=\"_blank\" rel=\"noopener\">Mini Tokyo 3D</a></p></div>";
  var m = RG.openModal("🌤️ いまの天気", html);
  RG.weatherSwitchBind(m);
};

/* ---------------------------------------------------------------- 設定 */
RG.weatherSwitchHTML = function (inModal) {
  var on1 = S("wx", true) !== false, on2 = S("wxSky", true) !== false, on3 = S("wxFx", true) !== false;
  return '<div class="set__sec"><h4>🌤️ いまの天気と昼夜</h4>' +
    '<label class="set__sw"><input id="wx-on" type="checkbox"' + (on1 ? " checked" : "") + "> <b>地図の右上に、いま見ている場所の天気を出す</b>（Open-Meteo。10 分ごと・場所が変わったとき）</label>" +
    '<label class="set__sw"><input id="wx-sky" type="checkbox"' + (on2 ? " checked" : "") + "> 🌇 昼夜の空の色を地図に重ねる（夕方は暖色、夜は青み。太陽の高さから計算）</label>" +
    '<label class="set__sw"><input id="wx-fx" type="checkbox"' + (on3 ? " checked" : "") + "> 🌧️ 雨・雪・きり・雷の演出（うっすら。端末の «動きを減らす» 設定では動きません）</label>" +
    '<p class="deep__d">' + (inModal ? "" : '<button class="set__b" type="button" id="wx-now">🌤️ いまの天気をくわしく</button> ') + '<button class="set__b" type="button" id="wx-re">🔄 取り直す</button></p></div>';
};
RG.weatherSwitchBind = function (root) {
  function sw(id, key, fn) { var el = $(id, root); if (!el) return; el.addEventListener("change", function () { if (RG.settings) RG.settings[key] = this.checked; if (RG.saveSettings) RG.saveSettings(); fn(this.checked); }); }
  sw("#wx-on", "wx", function () { RG.weatherApply(); });
  sw("#wx-sky", "wxSky", function () { RG.weatherApply(); });
  sw("#wx-fx", "wxFx", function () { RG.weatherApply(); });
  var b = $("#wx-now", root); if (b) b.addEventListener("click", function () { RG.weatherModal(); });
  var r = $("#wx-re", root); if (r) r.addEventListener("click", function () { RG.weatherRefresh(); RG.tripStatus && RG.tripStatus("天気を取り直しています…", "ok", 1500); });
};

/* ---------------------------------------------------------------- 起動 */
RG.weatherInit = function () {
  if (!ensureDom()) return;
  update(true);
  clearInterval(sunT); sunT = setInterval(function () { paintSky(); if (cur && Date.now() - cur.at > TTL) update(true); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { paintSky(); if (cur && Date.now() - cur.at > TTL) update(true); } });
};
})(window.RG);
