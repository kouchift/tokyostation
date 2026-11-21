/* =========================================================================
   検索
   ・駅名／かな／路線／スポット名／エリア名／郵便番号（ハイフン有無）を横断
   ・スペース区切りは AND 検索
   ・ローカル索引は起動時に一度だけ作り、入力ごとの検索は同期で即返す
   ・住所・建物名など索引に無いものは、任意で OpenStreetMap Nominatim へ問い合わせ
     （デバウンス700ms・1件ずつ・ODbL表示あり）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;

/* =========================================================================
   第6周回 INP是正・段2（design/cycle6-inp-design.md §3.3 S3）
   索引は «区画（セグメント）» ごとに持ち、並びは従来の全再構築と完全に同じ
   （駅 → スポット → エリア → 自分の場所 → 住所複製）にする。
   ・hay（検索用文字列）はエントリを作るときに1回だけ連結して持たせる。
     クエリ時は連結せず indexOf だけ（文字列の一時生成と GC を消す）。
   ・スポット区画は増分: MAPPOI の末尾に増えた分だけ append する
     （RG.appendSearchIndex / RG.syncSearchIndex）。配列の差し替え・縮小・
     削除を伴うマージのときだけスポット区画を作り直す（RG.invalidateSearchPoiIndex）。
   ・ジャンル引きは GENRES.filter の線形探索をやめ、id→genre マップ引きにする。
   ========================================================================= */
var SEG = null;          // { st:[], spot:[], area:[], own:[], addr:[] }
var IDX = null;          // buildSearchIndex() 用の連結済みキャッシュ（SEG が変わると捨てる）
var GMAP = null, GMAPSrc = null;
function genreMap() {
  if (GMAP && GMAPSrc === RG.GENRES) return GMAP;
  GMAP = {}; GMAPSrc = RG.GENRES || null;
  (RG.GENRES || []).forEach(function (g) { GMAP[g.id] = g; });
  return GMAP;
}
function hayOf(n, k, sub, extra) { return n + " " + k + " " + (sub || "") + " " + (extra || ""); }
function stationEntry(s) {
  var e = { t: "station", id: s.id, n: s.n, k: s.k || "",
            sub: (s.ls || []).slice(0, 3).join(" / "),
            extra: (s.ls || []).join(" "), la: s.la, lo: s.lo,
            pri: 0, rank: s.rank };
  e.hay = hayOf(e.n, e.k, e.sub, e.extra); return e;
}
function spotEntry(p) {
  var g = genreMap()[p.g] || {};
  var e = { t: "spot", id: p.i, n: p.n, k: "", sub: (g.e || "") + " " + (g.label || "") + (p.t ? " ・ " + p.t : ""),
            extra: (p.ad || "") + " " + (g.label || ""), la: p.la, lo: p.lo,
            pri: p.ti === 0 ? 1 : 3, star: p.s, poi: p };
  e.hay = hayOf(e.n, e.k, e.sub, e.extra); return e;
}
function addrEntry(p) {
  var e = { t: "addr", id: p.i, n: p.ad, k: "", sub: "📍 " + p.n,
            extra: p.n, la: p.la, lo: p.lo, pri: 4, poi: p };
  e.hay = hayOf(e.n, e.k, e.sub, e.extra); return e;
}
function areaEntry(a) {
  var e = { t: "area", id: a.n, n: a.n, k: "", sub: a.k + "（このあたりを表示）",
            extra: a.k, la: a.la, lo: a.lo, z: a.z, pri: 2 };
  e.hay = hayOf(e.n, e.k, e.sub, e.extra); return e;
}
function ownEntry(L) {
  var e = { t: "own", id: L.id, n: L.n, k: "", sub: L.e + " 自分で追加した場所",
            extra: "", la: L.la, lo: L.lo, pri: 1, own: L };
  e.hay = hayOf(e.n, e.k, e.sub, e.extra); return e;
}
var poiArr = null, poiN = 0, poiDirty = false;
var stSrc = null, areaSrc = null, ownSrc = null, genreSrcAtPoiBuild = null;
function buildPoiSegments() {
  var arr = RG.MAPPOI || [];
  SEG.spot = []; SEG.addr = [];
  for (var i = 0; i < arr.length; i++) {
    SEG.spot.push(spotEntry(arr[i]));
    if (arr[i].ad) SEG.addr.push(addrEntry(arr[i]));
  }
  poiArr = arr; poiN = arr.length; poiDirty = false; genreSrcAtPoiBuild = RG.GENRES || null;
  IDX = null;
}
function appendPoiRange(from) {
  var arr = RG.MAPPOI || [];
  for (var i = from; i < arr.length; i++) {
    SEG.spot.push(spotEntry(arr[i]));
    if (arr[i].ad) SEG.addr.push(addrEntry(arr[i]));
  }
  poiArr = arr; poiN = arr.length;
  IDX = null;
}
/* スポット区画を MAPPOI の現在状態に合わせる（増えた分は append、差し替え・縮小・ジャンル表の差し替えは作り直し） */
function syncPoi() {
  var arr = RG.MAPPOI || [];
  if (poiDirty || arr !== poiArr || arr.length < poiN || genreSrcAtPoiBuild !== (RG.GENRES || null)) { buildPoiSegments(); return; }
  if (arr.length > poiN) appendPoiRange(poiN);
}
function build() {
  if (!SEG) {
    if (!RG.NET || !RG.NET.stations) return null;   // 駅データがまだ無いときは作らない（次回に作る）
    SEG = { st: [], spot: [], area: [], own: [], addr: [] };
    stSrc = RG.NET.stations;
    RG.NET.stations.forEach(function (s) { SEG.st.push(stationEntry(s)); });
    areaSrc = RG.AREAS || null;
    (RG.AREAS || []).forEach(function (a) { SEG.area.push(areaEntry(a)); });
    ownSrc = RG.LANDMARKS_OWN || null;
    (RG.LANDMARKS_OWN || []).forEach(function (L) { SEG.own.push(ownEntry(L)); });
    poiArr = null; poiN = 0; buildPoiSegments();
    IDX = null;
  } else {
    // 駅・エリア・自分の場所は基本不変だが、出典が差し替わったらその区画だけ作り直す
    if (RG.NET && RG.NET.stations && RG.NET.stations !== stSrc) {
      stSrc = RG.NET.stations; SEG.st = [];
      RG.NET.stations.forEach(function (s) { SEG.st.push(stationEntry(s)); });
      IDX = null;
    }
    if ((RG.AREAS || null) !== areaSrc) {
      areaSrc = RG.AREAS || null; SEG.area = [];
      (RG.AREAS || []).forEach(function (a) { SEG.area.push(areaEntry(a)); });
      IDX = null;
    }
    if ((RG.LANDMARKS_OWN || null) !== ownSrc) {
      ownSrc = RG.LANDMARKS_OWN || null; SEG.own = [];
      (RG.LANDMARKS_OWN || []).forEach(function (L) { SEG.own.push(ownEntry(L)); });
      IDX = null;
    }
    syncPoi();
  }
  if (!IDX) IDX = SEG.st.concat(SEG.spot, SEG.area, SEG.own, SEG.addr);
  return IDX;
}
RG.buildSearchIndex = build;
/* 全再構築の予約（従来互換）。次回 build/search のときに作り直す */
RG.resetSearchIndex = function () { SEG = null; IDX = null; poiArr = null; poiN = 0; poiDirty = false; };
/* 削除・入替を伴うマージ（whs/grave の再投入・一之宮の重複除去など）のあとに呼ぶ。
   スポット区画だけを次回同期時に作り直す */
RG.invalidateSearchPoiIndex = function () { poiDirty = true; };
/* POI が増えた分だけ索引へ足す。pois が MAPPOI の «まだ索引化していない末尾» と
   一致すればそのまま append し、そうでなければ安全側に倒して次回同期で合わせる。
   索引がまだ無いときは何もしない（初回の build が MAPPOI 全体から作る）。 */
RG.appendSearchIndex = function (pois) {
  if (!SEG || !pois || !pois.length) return;
  var arr = RG.MAPPOI || [];
  if (arr === poiArr && !poiDirty && arr[poiN] === pois[0] && arr[poiN + pois.length - 1] === pois[pois.length - 1]) {
    appendPoiRange(poiN);   // 末尾一致: 範囲は poiN..arr.length（pois 以降に増えた分も含めてよい＝全て未索引分）
    return;
  }
  syncPoi();
};
/* flush / merge のあとに呼ぶ: 索引があれば増分同期し、無ければ（駅データが揃っていれば）ここで作っておく */
RG.syncSearchIndex = function () { build(); };

var ZIP = /^\D*(\d{3})-?(\d{4})\D*$/;
/* 全角英数を半角に。長音「ー」はカタカナの一部なので触らない。
   数字にはさまれた全角ハイフン類だけを半角ハイフンにする（郵便番号対策）。 */
function normalize(q) {
  return q
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/(\d)[－―‐ｰ−](\d)/g, "$1-$2")
    .trim();
}

RG.searchLocal = function (q, limit) {
  build();
  q = normalize(q);
  if (!q) return [];
  var terms = q.split(/[\s\u3000]+/).filter(Boolean);
  var zipm = RG.zipMode && RG.zipMode() ? ZIP.exec(q.replace(/[\s\u3000]/g, "")) : null;   // v118: 郵便番号モードのときだけ
  var zip = zipm ? zipm[1] + "-" + zipm[2] : null;
  var out = [];
  if (!SEG) return out;
  var segs = [SEG.st, SEG.spot, SEG.area, SEG.own, SEG.addr];   // 従来の IDX の並びと同一順
  for (var s2 = 0; s2 < segs.length && out.length < 400; s2++) {
    var arr = segs[s2];
    for (var i = 0; i < arr.length && out.length < 400; i++) {
      var r = arr[i];
      var hay = r.hay;
      var ok = true;
      for (var j = 0; j < terms.length; j++) if (hay.indexOf(terms[j]) < 0) { ok = false; break; }
      if (!ok && zip && (hay.indexOf(zip) >= 0 || hay.replace(/-/g, "").indexOf(zip.replace("-", "")) >= 0)) ok = true;
      if (!ok) continue;
      // 前方一致・完全一致を優先
      var b = r.n === q ? 0 : r.n.indexOf(q) === 0 ? 1 : r.n.indexOf(terms[0]) === 0 ? 2 : 3;
      out.push({ r: r, score: r.pri * 10 + b + (r.rank != null ? Math.min(6, r.rank / 120) : 0) });
    }
  }
  out.sort(function (a, b2) { return a.score - b2.score; });
  return out.slice(0, limit || 12).map(function (x) { return x.r; });
};

/* --------------------------------------- Nominatim（住所・建物名のフォールバック） */
var nomCache = {}, nomTimer = null, nomBusy = false;
RG.searchRemote = function (q, cb) {
  q = normalize(q);
  if (nomCache[q]) { cb(nomCache[q]); return; }
  clearTimeout(nomTimer);
  nomTimer = setTimeout(function () {
    if (nomBusy) return;
    nomBusy = true;
    var u = "https://nominatim.openstreetmap.org/search?" + [
      "q=" + encodeURIComponent(q + " 東京"), "format=json", "limit=6",
      "countrycodes=jp", "accept-language=ja",
      "viewbox=139.54,35.85,139.94,35.50", "bounded=0"].join("&");
    fetch(u, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var out = (j || []).map(function (x) {
          return { t: "geo", id: "g" + x.place_id, n: (x.display_name || "").split(",")[0],
                   sub: "🌏 " + (x.display_name || "").split(",").slice(1, 4).join("、").trim(),
                   la: +x.lat, lo: +x.lon, pri: 5, licence: x.licence };
        });
        nomCache[q] = out; nomBusy = false; cb(out);
      })
      .catch(function () { nomBusy = false; cb([]); });
  }, 700);
};

/* ------------------------------------------------------------ 検索UI */
RG.initSearchUI = function () {
  var input = $("#q"), sug = $("#sug"); if (!input || !sug) return;   // v172: ヘッダーの隠し検索は撤去
  var last = "", remoteRows = [];
  function clear() { sug.innerHTML = ""; }

  function row(r) {
    var ico = r.t === "station" ? "🚉" : r.t === "area" ? "🗺️" : r.t === "geo" ? "🌏"
            : r.t === "addr" || r.t === "zip" ? "📮" : r.t === "own" ? "🏫" : "📍";
    var st = (r.t === "spot" && r.star) ? '<span class="sg__st">' + RG.stars(r.star) + "</span>" : "";
    var b = el("button", { type: "button", class: "sg__r sg__r--" + r.t, html:
      '<span class="sg__i">' + ico + "</span>" +
      '<span class="sg__n">' + esc(r.n) + (r.k ? ' <i>' + esc(r.k) + "</i>" : "") + "</span>" +
      '<span class="sg__s">' + esc(r.sub || "") + "</span>" + st });
    b.addEventListener("click", function () { go(r); });
    return b;
  }
  function go(r) {
    clear(); input.blur();
    if (r.t === "station") { RG.openStation(r.id); return; }
    if (r.t === "spot") { RG.Map.gotoLatLng(r.la, r.lo, 180); RG.showSpot(r.poi); return; }
    if (r.t === "own") { RG.Map.gotoLatLng(r.la, r.lo, 180); RG.showLandmark(r.own); return; }
    if (r.t === "zip") { RG.Map.gotoLatLng(r.la, r.lo, 160);
      RG.tripStatus(r.n + " " + (r.k || "") + " のあたりを表示しています", "info", 3000); return; }
    if (r.t === "area") { RG.Map.gotoLatLng(r.la, r.lo, r.z || 900);
      RG.tripStatus("🗺️ " + r.n + " のあたりを表示しています", "info", 2600); return; }
    // 住所・建物名（Nominatim / 温泉の住所）
    RG.Map.gotoLatLng(r.la, r.lo, 200);
    RG.showPlace(r);
  }
  function render(local, remote, note) {
    sug.innerHTML = "";
    if (!local.length && !remote.length) {
      sug.appendChild(el("div", { class: "sg__e", html:
        "見つかりませんでした。<br>住所や建物名なら「<svg class='uic' aria-hidden='true' focusable='false'><use href='#ui-globe'></use></svg> 地図で探す」を押してみてください。" }));
    }
    local.forEach(function (r) { sug.appendChild(row(r)); });
    if (remote.length) {
      var sgh = el("div", { class: "sg__h", text: "🌏 地図の検索結果（OpenStreetMap）" });
      if (RG.iconifyText) RG.iconifyText(sgh, "🌏 地図の検索結果（OpenStreetMap）");   // D-01 第3周回: RG.el の text は textContent 直通のため、作ったあとでアイコン化
      sug.appendChild(sgh);
      remote.forEach(function (r) { sug.appendChild(row(r)); });
      sug.appendChild(el("div", { class: "sg__c", text: "© OpenStreetMap contributors (ODbL)" }));
    } else if (note) {
      var b = el("button", { class: "sg__more", type: "button",
        html: "🌏 地図で探す（住所・建物名・郵便番号）" });
      b.addEventListener("click", function () {
        b.textContent = "検索中…";
        RG.searchRemote(input.value, function (rows) {
          remoteRows = rows; render(local, rows, false);
        });
      });
      sug.appendChild(b);
    }
  }
  function run(force) {
    var v = input.value.trim();
    if (!force && v === last) return; last = v; remoteRows = [];
    if (!v) { clear(); return; }
    var loc = RG.searchLocal(v, 12);
    render(loc, [], true);                    // ローカルは同期・即時
    // 郵便番号：手元の索引（上3桁ごとのファイル）で即座に場所へ。外部サービスに頼らない
    var zm = RG.zipMode && RG.zipMode() ? /^(\d{3})-?(\d{4})$/.exec(v.replace(/[\s\u3000〒]/g, "").replace(/[‐－ー―−]/g, "-")) : null;   // v118: 郵便番号モードのときだけ
    if (zm && RG.zipLookup) {
      RG.zipLookup(zm[1] + zm[2], function (hit, all) {
        if (input.value.trim() !== v) return;
        var rows = [];
        if (hit) rows.push({ t: "zip", n: "〒" + zm[1] + "-" + zm[2], k: hit.town, sub: "この郵便番号の場所へ地図を寄せます", la: hit.la, lo: hit.lo });
        else if (all) {
          // 下4桁が部分一致するものを候補に
          Object.keys(all).filter(function (z) { return z.indexOf(zm[1] + zm[2].slice(0, 2)) === 0; }).slice(0, 6)
            .forEach(function (z) { rows.push({ t: "zip", n: "〒" + z.slice(0, 3) + "-" + z.slice(3), k: all[z][2], sub: "近い番号の候補", la: all[z][0], lo: all[z][1] }); });
        }
        if (rows.length) render(rows.concat(loc), remoteRows, false);
      });
      return;
    }
    // 郵便番号や「〜丁目/番地」など住所らしい入力で、ローカルに当たらないときは自動で地図検索
    if (loc.length < 2 && ((RG.zipMode && RG.zipMode() && /^\d{3}-?\d{4}$/.test(v)) || /丁目|番地|[0-9]-[0-9]/.test(v))) {
      RG.searchRemote(v, function (rows) {
        if (input.value.trim() !== v) return;
        render(loc, rows, false);
      });
    }
  }
  input.addEventListener("input", function () { run(false); });
  /* v82: いったん離れて戻ってきたとき、入れてあった文字で候補を出し直す（前は何も出ず、打ち直しになっていた）。
     文字は全選択にしておくので、そのまま打てば上書きできる */
  input.addEventListener("focus", function () {
    if (!input.value.trim()) return;
    run(true);
    try { input.setSelectionRange(0, input.value.length); } catch (e) {}
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var first = sug.querySelector(".sg__r");
      if (first) first.click(); else run(true);
    }
    if (e.key === "Escape") { input.value = ""; last = ""; clear(); input.blur(); }
  });
  /* 候補を押すときに入力欄のフォーカスが外れて候補が消えないように（スマホで押せないことがあった） */
  sug.addEventListener("pointerdown", function (e) { if (e.target && e.target.closest && e.target.closest("button")) e.preventDefault(); });
  input.addEventListener("blur", function () { setTimeout(clear, 300); });
};

})(window.RG);
