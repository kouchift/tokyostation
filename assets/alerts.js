/* =========================================================================
   防災情報（v115）— 地震（quake.js）に加えて、地図に置ける «いま出ている» 情報
   ・気象警報: 気象庁（bosai/warning/data/r8/<府県予報区>.json・2026 年 5 月からの新しい防災気象情報）。
     注意報は数が多いので地図には出さず、警報・危険警報・特別警報だけを «地域» ごとに ⚠️ で置く。
     全国ぶんは重い（800KB 超）ので、いま見ている範囲のまわりの府県予報区（最大 4）と現在地の府県だけを取りに行く
   ・火山: 噴火警報（レベル 2 以上・火口周辺危険など）の火山を 🌋 で置く
   ・津波: 津波警報・注意報が出ていれば、画面の上に 🌊 の帯（場所は海岸の区域なので地図には置かない）
   ・10 分おきに取り直す。気象庁のデータは誰でも読める（CORS 可）。サーバーは使わない
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, B = "https://www.jma.go.jp/bosai/";
/* 警報の種類（コードの表。新しい «危険警報» のコードは表が未確認なので、40 以上は «危険警報など» として気象庁の画面へ案内） */
var W = { "02": "暴風雪警報", "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "06": "大雪警報", "07": "波浪警報", "08": "高潮警報", "09": "土砂災害警報",
          "32": "暴風雪特別警報", "33": "大雨特別警報", "35": "暴風特別警報", "36": "大雪特別警報", "37": "波浪特別警報", "38": "高潮特別警報" };
function level(code) { var n = +code; return n >= 30 && n < 40 ? 3 : n >= 40 ? 2 : n >= 2 && n <= 9 ? 1 : 0; }   // 3 特別警報 ／ 2 危険警報など ／ 1 警報 ／ 0 注意報（地図に出さない）
function wname(code) { return W[code] || (+code >= 40 ? "危険警報など（コード " + code + "）" : "警報（コード " + code + "）"); }
var ST = RG.alerts = { office: {}, vol: [], tsunami: null, t: 0 };

function getJSON(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

/* いま見ている範囲のまわりの府県予報区（近い順に最大 4）＋ 現在地の府県 */
function officesInView() {
  var O = RG.JMA_OFFICE || {}, vb = RG.Map && RG.Map.viewBox ? RG.Map.viewBox() : null, out = [];
  var c = null;
  if (vb && RG.unproject) c = RG.unproject(vb.x + vb.w / 2, vb.y + vb.h / 2);
  if (!c) c = RG.Trip && RG.Trip.origin ? { la: RG.Trip.origin[0], lo: RG.Trip.origin[1] } : { la: 35.68, lo: 139.77 };
  Object.keys(O).forEach(function (k) { out.push({ k: k, d: RG.hav([c.la, c.lo], [O[k][0], O[k][1]]) }); });
  out.sort(function (a, b) { return a.d - b.d; });
  var ks = out.filter(function (x, i) { return i < 4 && x.d < 400; }).map(function (x) { return x.k; });
  if (RG.Trip && RG.Trip.isGeo && RG.Trip.origin) {
    var near = out.slice().sort(function (a, b) { return RG.hav(RG.Trip.origin, [O[a.k][0], O[a.k][1]]) - RG.hav(RG.Trip.origin, [O[b.k][0], O[b.k][1]]); })[0];
    if (near && ks.indexOf(near.k) < 0) ks.push(near.k);
  }
  return ks;
}

function loadOffice(k) {
  return getJSON(B + "warning/data/r8/" + k + ".json").then(function (list) {
    var rep = (list || []).slice().sort(function (a, b) { return a.reportDatetime < b.reportDatetime ? 1 : -1; })[0];
    var items = [];
    ((rep && rep.warning && rep.warning.class10Items) || []).forEach(function (it) {
      var ks = (it.kinds || []).filter(function (x) { return x.code && (x.status === "発表" || x.status === "継続") && level(x.code) > 0; });
      if (ks.length) items.push({ c10: it.areaCode, kinds: ks.map(function (x) { return { code: x.code, name: wname(x.code), lv: level(x.code), st: x.status }; }) });
    });
    ST.office[k] = { t: Date.now(), at: rep ? rep.reportDatetime : "", head: rep ? rep.headlineText : "", items: items };
  }).catch(function () {});
}
function loadVolcano() {
  var need = !ST.vlist ? getJSON(B + "volcano/const/volcano_list.json").then(function (v) { ST.vlist = {}; v.forEach(function (x) { ST.vlist[x.code] = x; }); }) : Promise.resolve();
  return need.then(function () { return getJSON(B + "volcano/data/warning.json"); }).then(function (list) {
    var best = {};
    (list || []).forEach(function (r) {
      (r.volcanoInfos || []).forEach(function (vi) {
        if (!/対象火山/.test(vi.type)) return;
        (vi.items || []).forEach(function (it) {
          var c = +it.code, lv = c >= 12 && c <= 15 ? c - 10 : (c === 22 || c === 23 || c === 36) ? 2 : 0;   // レベル 2〜5 ／ 火口周辺危険・入山危険・周辺海域警戒
          if (!lv) return;
          (it.areas || []).forEach(function (a) {
            var v = ST.vlist[a.code]; if (!v || !v.latlon) return;
            if (!best[a.code] || best[a.code].at < r.reportDatetime) best[a.code] = { code: a.code, n: v.name_jp || a.name, la: +v.latlon[0], lo: +v.latlon[1], lv: lv, name: it.name, at: r.reportDatetime };
          });
        });
      });
    });
    ST.vol = Object.keys(best).map(function (k) { return best[k]; });
  }).catch(function () {});
}
function loadTsunami() {
  return getJSON(B + "tsunami/data/list.json").then(function (list) {
    var now = Date.now(), cur = (list || []).filter(function (x) { return x.ttl && !/解除/.test(x.ttl) && now - new Date(x.at || x.rdt).getTime() < 24 * 3600e3; })[0];
    ST.tsunami = cur ? { ttl: cur.ttl, at: cur.at || cur.rdt } : null;
  }).catch(function () {});
}

/* 地図に置く（前の分を外してから） */
function paint() {
  RG.MAPPOI = (RG.MAPPOI || []).filter(function (p) { return p.g !== "alert"; });
  var C = RG.JMA_C10 || {}, n = 0;
  Object.keys(ST.office).forEach(function (k) {
    ST.office[k].items.forEach(function (it) {
      var o = (RG.JMA_OFFICE || {})[k], c = C[it.c10] || (o && [o[0] + 0.03 * (n % 3), o[1] + 0.03 * (n % 3), o[2] + "（地域 " + it.c10 + "）", k]);   // 中心の分からない地域（離島など）は府県のまわりに
      if (!c) return;
      var top = Math.max.apply(null, it.kinds.map(function (x) { return x.lv; }));
      RG.MAPPOI.push({ i: "al" + it.c10, n: (top === 3 ? "🟪 " : "⚠️ ") + c[2] + "：" + it.kinds.map(function (x) { return x.name; }).join("・"), la: c[0], lo: c[1], g: "alert",
                       s: 5, ti: 0, t: top === 3 ? "特別警報" : top === 2 ? "危険警報など" : "警報", be: top === 3 ? "🟪" : "⚠️", bc: top === 3 ? "#6A1B9A" : top === 2 ? "#C62828" : "#E65100",
                       alert: { kind: "warn", office: k, c10: it.c10, area: c[2], kinds: it.kinds, at: ST.office[k].at, head: ST.office[k].head } });
      n++;
    });
  });
  ST.vol.forEach(function (v) {
    RG.MAPPOI.push({ i: "av" + v.code, n: "🌋 " + v.n + "：" + v.name, la: v.la, lo: v.lo, g: "alert", s: 5, ti: 0, t: "噴火警報（レベル " + v.lv + "）",
                     be: "🌋", bc: v.lv >= 4 ? "#B71C1C" : v.lv === 3 ? "#E65100" : "#F9A825", alert: { kind: "volcano", v: v } });
    n++;
  });
  ST.count = n;
  if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
  chip();
}
/* 画面の上の小さな帯（出ているときだけ） */
function chip() {
  var el = document.getElementById("alertchip"), host = document.querySelector(".mapwrap");
  var nW = 0; Object.keys(ST.office).forEach(function (k) { nW += ST.office[k].items.length; });
  // 帯は «いま命にかかわる» 気象警報と津波だけ（火山はいつも十数か所あるので、帯にすると常に赤くなる → 地図の 🌋 だけ）
  var txt = (ST.tsunami ? "🌊 " + ST.tsunami.ttl + " " : "") + (nW ? "⚠️ 警報 " + nW + " 地域 " : "") + (nW || ST.tsunami ? "（押すと一覧）" : "");
  if (!txt) { if (el) el.hidden = true; return; }
  if (!el && host) {
    el = document.createElement("button"); el.id = "alertchip"; el.type = "button"; el.className = "alertchip";
    el.addEventListener("click", function () { RG.showAlerts(); });
    host.appendChild(el);
  }
  if (!el) return;
  el.hidden = false; el.textContent = txt.trim(); el.classList.toggle("alertchip--tsu", !!ST.tsunami);
  el.setAttribute("aria-label", "防災情報: " + txt.trim());
}
function fmt(at) { var d = new Date(at); return isNaN(d) ? "" : (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
function officeUrl(k) { return B + "warning/#lang=ja&area_type=offices&area_code=" + k; }

/* 1 地域のカード */
RG.showAlert = function (p) {
  var a = p.alert, html;
  if (a.kind === "volcano") {
    html = '<div class="alc"><p class="alc__lv">🌋 噴火警報 レベル ' + a.v.lv + "（" + esc(a.v.name) + "）</p>" +
      '<p class="alc__t">' + esc(a.v.n) + " ・ 発表 " + esc(fmt(a.v.at)) + "</p>" +
      '<p class="alc__d">火口のまわりや登山道が規制されていることがあります。必ず気象庁と地元自治体の情報を確かめてください。</p>' +
      '<div class="lnks"><a class="lnk" href="' + B + 'volcano/" target="_blank" rel="noopener"><span>🏛️</span>気象庁の火山の情報</a></div>' +
      '<p class="src">出典: 気象庁（噴火警報・予報）。地図の位置は火山の代表地点です。</p></div>';
  } else {
    html = '<div class="alc"><ul class="alc__l">' + a.kinds.map(function (x) {
      return '<li class="alc__k alc__k--' + x.lv + '"><b>' + esc(x.name) + "</b><small>" + esc(x.st) + "</small></li>"; }).join("") + "</ul>" +
      '<p class="alc__t">' + esc(a.area) + " ・ 発表 " + esc(fmt(a.at)) + "</p>" +
      (a.head ? '<p class="alc__d">' + esc(a.head) + "</p>" : "") +
      '<p class="alc__d">避難の判断は、市区町村の «避難情報» と «警戒レベル» に従ってください。地図の «避難場所» のジャンルで近くの避難場所を出せます。</p>' +
      '<div class="lnks"><a class="lnk" href="' + officeUrl(a.office) + '" target="_blank" rel="noopener"><span>🏛️</span>気象庁の警報・注意報</a>' +
      '<a class="lnk" href="' + B + 'risk/" target="_blank" rel="noopener"><span>🗺️</span>キキクル（危険度分布）</a></div>' +
      '<p class="src">出典: 気象庁（防災気象情報）。注意報は数が多いので地図には出していません。地図の位置は地域のだいたいの中心です。</p></div>';
  }
  RG.openModal(p.be + " " + p.n.replace(/^\S+\s/, ""), html);
};
/* いま出ているもの一覧 */
RG.showAlerts = function () {
  var rows = [];
  if (ST.tsunami) rows.push('<li class="alc__k alc__k--3"><b>🌊 ' + esc(ST.tsunami.ttl) + '</b><small>' + esc(fmt(ST.tsunami.at)) + ' ・ <a href="' + B + 'map.html#contents=tsunami" target="_blank" rel="noopener">気象庁で見る</a></small></li>');
  (RG.MAPPOI || []).filter(function (p) { return p.g === "alert"; }).forEach(function (p) {
    rows.push('<li><button class="alc__go" type="button" data-al="' + esc(p.i) + '">' + esc(p.n) + " <small>" + esc(p.t) + "</small></button></li>");
  });
  var m = RG.openModal("🚨 いま出ている防災情報", '<div class="alc"><p class="alc__d">いま見ている地図のまわりと現在地の府県の «警報以上»、噴火警報（レベル 2 以上）、津波警報・注意報です。10 分おきに取り直します。</p>' +
    (rows.length ? '<ul class="alc__l alc__l--all">' + rows.join("") + "</ul>" : '<p class="alc__d">いま出ているものはありません。</p>') +
    '<div class="lnks"><a class="lnk" href="' + B + 'warning/" target="_blank" rel="noopener"><span>🏛️</span>気象庁 警報・注意報（全国）</a><a class="lnk" href="' + B + 'map.html#contents=earthquake_map" target="_blank" rel="noopener"><span>📈</span>地震情報</a></div>' +
    '<p class="src">出典: 気象庁。この画面は速報の目安です。命を守る行動は、自治体の避難情報と気象庁の発表に従ってください。</p></div>');
  Array.prototype.forEach.call(m.querySelectorAll("[data-al]"), function (b) {
    b.addEventListener("click", function () { var p = RG.MAPPOI.filter(function (x) { return x.i === b.dataset.al; })[0]; if (!p) return; RG.closeModal(); RG.Map.gotoLatLng(p.la, p.lo, 900); RG.showAlert(p); });
  });
};

var busy = false, lastKeys = "";
function refresh(force) {
  if (busy || !RG.JMA_OFFICE) return;
  var ks = officesInView(), key = ks.join(",");
  var stale = Date.now() - ST.t > 10 * 60e3;
  if (!force && !stale && key === lastKeys) return;
  busy = true; lastKeys = key;
  var jobs = ks.filter(function (k) { return stale || !ST.office[k]; }).map(loadOffice);
  if (stale) { jobs.push(loadVolcano()); jobs.push(loadTsunami()); }
  Object.keys(ST.office).forEach(function (k) { if (ks.indexOf(k) < 0) delete ST.office[k]; });   // 見ていない府県の警報は外す
  Promise.all(jobs).then(function () { if (stale) ST.t = Date.now(); busy = false; paint(); });
}
RG.alertsRefresh = refresh;
RG.alertsInit = function () {
  if (RG.__alertsInit) return; RG.__alertsInit = 1;
  setTimeout(function () { refresh(true); }, 4000);                       // 起動の邪魔をしない
  setInterval(function () { refresh(false); }, 60e3);                      // 1 分ごとに «見ている範囲が変わったか・10 分たったか» を確かめる
  var t = 0; document.addEventListener("rg:view", function () { clearTimeout(t); t = setTimeout(function () { refresh(false); }, 3000); });
};
document.addEventListener("rg:data", function (e) { if (e.detail && e.detail.keys && e.detail.keys.indexOf("jmaareas") >= 0) RG.alertsInit(); });
})(window.RG);
