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

var IDX = null;
function build() {
  if (IDX) return IDX;
  IDX = [];
  RG.NET.stations.forEach(function (s) {
    IDX.push({ t: "station", id: s.id, n: s.n, k: s.k || "",
               sub: (s.ls || []).slice(0, 3).join(" / "),
               extra: (s.ls || []).join(" "), la: s.la, lo: s.lo,
               pri: 0, rank: s.rank });
  });
  (RG.MAPPOI || []).forEach(function (p) {
    var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || {};
    IDX.push({ t: "spot", id: p.i, n: p.n, k: "", sub: (g.e || "") + " " + (g.label || "") + (p.t ? " ・ " + p.t : ""),
               extra: (p.ad || "") + " " + (g.label || ""), la: p.la, lo: p.lo,
               pri: p.ti === 0 ? 1 : 3, star: p.s, poi: p });
  });
  (RG.AREAS || []).forEach(function (a) {
    IDX.push({ t: "area", id: a.n, n: a.n, k: "", sub: a.k + "（このあたりを表示）",
               extra: a.k, la: a.la, lo: a.lo, z: a.z, pri: 2 });
  });
  (RG.LANDMARKS_OWN || []).forEach(function (L) {
    IDX.push({ t: "own", id: L.id, n: L.n, k: "", sub: L.e + " 自分で追加した場所",
               extra: "", la: L.la, lo: L.lo, pri: 1, own: L });
  });
  // 郵便番号は温泉銭湯データにあるものだけ索引化（他は Nominatim にまかせる）
  (RG.MAPPOI || []).forEach(function (p) {
    if (p.ad) IDX.push({ t: "addr", id: p.i, n: p.ad, k: "", sub: "📍 " + p.n,
                         extra: p.n, la: p.la, lo: p.lo, pri: 4, poi: p });
  });
  return IDX;
}
RG.buildSearchIndex = build;
RG.resetSearchIndex = function () { IDX = null; };

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
  var zipm = ZIP.exec(q.replace(/[\s\u3000]/g, ""));
  var zip = zipm ? zipm[1] + "-" + zipm[2] : null;
  var out = [];
  for (var i = 0; i < IDX.length && out.length < 400; i++) {
    var r = IDX[i];
    var hay = r.n + " " + r.k + " " + (r.sub || "") + " " + (r.extra || "");
    var ok = true;
    for (var j = 0; j < terms.length; j++) if (hay.indexOf(terms[j]) < 0) { ok = false; break; }
    if (!ok && zip && (hay.indexOf(zip) >= 0 || hay.replace(/-/g, "").indexOf(zip.replace("-", "")) >= 0)) ok = true;
    if (!ok) continue;
    // 前方一致・完全一致を優先
    var b = r.n === q ? 0 : r.n.indexOf(q) === 0 ? 1 : r.n.indexOf(terms[0]) === 0 ? 2 : 3;
    out.push({ r: r, score: r.pri * 10 + b + (r.rank != null ? Math.min(6, r.rank / 120) : 0) });
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
  var input = $("#q"), sug = $("#sug");
  var last = "", remoteRows = [];
  function clear() { sug.innerHTML = ""; }

  function row(r) {
    var ico = r.t === "station" ? "🚉" : r.t === "area" ? "🗺️" : r.t === "geo" ? "🌏"
            : r.t === "addr" ? "📮" : r.t === "own" ? "🏫" : "📍";
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
        "見つかりませんでした。<br>住所や建物名なら「🌏 地図で探す」を押してみてください。" }));
    }
    local.forEach(function (r) { sug.appendChild(row(r)); });
    if (remote.length) {
      sug.appendChild(el("div", { class: "sg__h", text: "🌏 地図の検索結果（OpenStreetMap）" }));
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
  input.addEventListener("input", function () {
    var v = input.value.trim();
    if (v === last) return; last = v; remoteRows = [];
    if (!v) { clear(); return; }
    var loc = RG.searchLocal(v, 12);
    render(loc, [], true);                    // ローカルは同期・即時
    // 郵便番号や「〜丁目/番地」など住所らしい入力で、ローカルに当たらないときは自動で地図検索
    if (loc.length < 2 && /(^\d{3}-?\d{4}$)|丁目|番地|[0-9]-[0-9]/.test(v)) {
      RG.searchRemote(v, function (rows) {
        if (input.value.trim() !== v) return;
        render(loc, rows, false);
      });
    }
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var first = sug.querySelector(".sg__r");
      if (first) first.click();
    }
  });
  input.addEventListener("blur", function () { setTimeout(clear, 200); });
};

})(window.RG);
