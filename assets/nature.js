/* =========================================================================
   絶景スポット（data/views_jp.js）と 温泉（data/onsen_jp.js）  v75〜
   ・地図への取り込み（ジャンル view_jp / onsen_jp）
   ・カードの追加ブロック（タグ・市区町村の公式サイト・こだわり・根拠）
   ・温泉のこだわりフィルター（無料／混浴／秘湯／日帰り／宿泊／サウナ／野湯／露天）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var KEMO = { "滝": "💧", "湖": "🏞️", "山": "⛰️", "岬": "🌊", "名勝": "🏯", "峡谷": "🪨", "渚": "🏖️", "庭園": "🌿", "湿原": "🌾", "高原": "🌄", "展望": "🔭", "海岸": "🌅", "棚田": "🌾", "夜景": "🌃", "その他": "📍" };

RG.mergeViews = function () {
  if (!RG.VIEWS_JP || RG.__viewsMerged) return; RG.__viewsMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.VIEWS_JP.forEach(function (r, i) {
    RG.MAPPOI.push({ i: "vj" + i, n: r.n, la: r.la, lo: r.lo, g: "view_jp", s: r.s || 3.5, ti: r.s >= 4.5 ? 0 : r.s >= 4 ? 1 : 2,
                     t: (r.k || "絶景") + (r.tags && r.tags.length ? "・" + r.tags[0] : ""), be: KEMO[r.k] || "🔭", bc: "#0E7C7B",
                     img: r.img || null, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null, sl: Math.round((r.s || 3.5) * 10),
                     view: r, ad: (r.pf || "") + (r.mu || ""), srcNote: "絶景: Wikidata (CC0)・Wikipedia (CC BY-SA)。写真は Wikimedia Commons（各ファイルのライセンス）。" });
  });
};
RG.mergeOnsen = function () {
  if (!RG.ONSEN_JP || RG.__onsenMerged) return; RG.__onsenMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.ONSEN_JP.forEach(function (r, i) {
    var star = 3.2 + (r.hito ? 0.6 : 0) + (r.mixed ? 0.3 : 0) + (r.free ? 0.4 : 0) + (r.noyu ? 0.3 : 0) + (r.img ? 0.2 : 0) + (r.kind === "地" ? 0.2 : 0);
    var tag = [r.kind === "地" ? "温泉地" : r.kind === "宿" ? "温泉宿" : r.kind === "野" ? "野湯" : "日帰り温泉"];
    if (r.free) tag.push("無料"); if (r.mixed) tag.push("混浴"); if (r.hito) tag.push("秘湯");
    RG.MAPPOI.push({ i: "oj" + i, n: r.n, la: r.la, lo: r.lo, g: "onsen_jp", s: Math.min(5, star), ti: star >= 4.2 ? 0 : star >= 3.6 ? 1 : 2,
                     t: tag.join("・"), be: r.noyu ? "🌋" : r.free ? "🆓" : r.mixed ? "♨️" : r.hito ? "🏔️" : "♨️", bc: r.free ? "#2E7D32" : r.mixed ? "#C2185B" : r.hito ? "#5D4037" : "#EC6E00",
                     img: r.img || null, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null, sl: Math.round(star * 10),
                     onsen: r, ad: (r.pf || "") + (r.mu || ""), srcNote: "温泉: Wikidata (CC0)・Wikipedia (CC BY-SA)。こだわり（無料・混浴・秘湯・サウナ・料金）は記事の記述からの自動判定で、古い可能性があります。" });
  });
};

/* カードの追加ブロック */
RG.viewBlock = function (p) {
  var r = p.view; if (!r) return "";
  var muKey = (r.pf || "") + " " + (r.mu || ""), web = (RG.MUNI_WEB || {})[muKey];
  return '<div class="nat"><div class="nat__tags">' + (r.tags || []).map(function (t) { return '<span class="nat__tag">' + esc(t) + "</span>"; }).join("") +
    (r.k ? '<span class="nat__tag nat__tag--k">' + (KEMO[r.k] || "") + " " + esc(r.k) + "</span>" : "") + "</div>" +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") +
    '<div class="nat__lnks">' +
      (web ? '<a class="lnk" href="' + esc(web) + '" target="_blank" rel="noopener"><span>🏛️</span>' + esc(r.mu || "市区町村") + " の公式サイト（観光案内）</a>" : "") +
      (r.web ? '<a class="lnk" href="' + esc(r.web) + '" target="_blank" rel="noopener"><span>🌐</span>スポットの公式サイト</a>' : "") +
      '<a class="lnk" href="https://www.google.com/search?q=' + encodeURIComponent((r.mu || "") + " " + r.n + " 観光") + '&tbm=isch" target="_blank" rel="noopener"><span>🖼️</span>もっと写真をさがす</a>' +
      '<button class="lnk" type="button" data-natnear="view_jp"><span>🔭</span>近くの絶景（同じ県）</button>' +
    "</div>" +
    '<p class="mini">東京では得られない景色こそ、田舎へ行く理由。行き方・営業時間・季節（紅葉・雪・花）は市区町村の観光案内で必ず確認を。</p></div>';
};
var SAUNA_E = { "塩": "🧂", "ロウリュ": "🔥", "スチーム": "💨", "ミスト": "🌫️", "フィンランド式": "🇫🇮", "岩盤浴": "🪨" };
RG.onsenBlock = function (p) {
  var r = p.onsen; if (!r) return "";
  var chips = [];
  if (r.free) chips.push(["🆓 無料で入れる", "free"]); if (r.mixed) chips.push(["♨️ 混浴あり", "mixed"]); if (r.hito) chips.push(["🏔️ 秘湯", "hito"]);
  if (r.day) chips.push(["🌞 日帰り入浴OK", "day"]); if (r.stay) chips.push(["🛏️ 宿泊できる", "stay"]); if (r.noyu) chips.push(["🌋 野湯", "noyu"]); if (r.roten) chips.push(["🌲 露天風呂", "roten"]);
  if (r.sauna) chips.push(["🧖 サウナ" + (r.sauna.length ? "（" + r.sauna.map(function (x) { return (SAUNA_E[x] || "") + x; }).join("・") + "）" : ""), "sauna"]);
  var facts = [];
  if (r.fee) facts.push(["入浴料", "¥" + r.fee.toLocaleString("ja-JP"), r.feeEv]);
  if (r.spring) facts.push(["泉質", r.spring, null]); if (r.temp) facts.push(["泉温", r.temp + " ℃", null]);
  var muKey = (r.pf || "") + " " + (r.mu || ""), web = (RG.MUNI_WEB || {})[muKey];
  var q = encodeURIComponent(r.n + " " + (r.mu || ""));
  return '<div class="nat nat--on"><div class="nat__tags">' + chips.map(function (c) { return '<span class="nat__tag nat__tag--' + c[1] + '" title="' + esc((r.ev && r.ev[c[1]]) || "") + '">' + esc(c[0]) + "</span>"; }).join("") +
    '<span class="nat__tag">' + (r.kind === "地" ? "温泉地" : r.kind === "宿" ? "一軒宿・温泉宿" : r.kind === "野" ? "野湯" : "日帰り入浴施設") + "</span></div>" +
    (facts.length ? '<div class="nat__facts">' + facts.map(function (f) { return '<div class="nat__f"><span>' + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b>" + (f[2] ? "<i>" + esc(f[2]) + "</i>" : "") + "</div>"; }).join("") + "</div>" : "") +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") +
    (r.ev && Object.keys(r.ev).length ? '<details class="nat__ev"><summary>判定の根拠（Wikipedia の記述）</summary>' + Object.keys(r.ev).map(function (k) { return "<p><b>" + esc({ free: "無料", mixed: "混浴", hito: "秘湯", day: "日帰り", sauna: "サウナ", noyu: "野湯" }[k] || k) + "</b>: …" + esc(r.ev[k]) + "…</p>"; }).join("") + "</details>" : "") +
    '<div class="nat__lnks">' +
      (r.web ? '<a class="lnk" href="' + esc(r.web) + '" target="_blank" rel="noopener"><span>🌐</span>公式サイト</a>' : "") +
      (web ? '<a class="lnk" href="' + esc(web) + '" target="_blank" rel="noopener"><span>🏛️</span>' + esc(r.mu || "市区町村") + " の公式サイト</a>" : "") +
      '<a class="lnk" href="https://www.google.com/maps/search/' + q + '" target="_blank" rel="noopener"><span>🗺️</span>地図アプリでクチコミを見る</a>' +
      '<a class="lnk" href="https://www.jalan.net/kankou/?keyword=' + q + '" target="_blank" rel="noopener"><span>🛏️</span>じゃらんで宿・日帰りを探す</a>' +
      '<button class="lnk" type="button" data-natnear="onsen_jp"><span>♨️</span>近くの温泉</button>' +
    "</div>" +
    '<p class="mini">クチコミ・最新の料金・営業状況は本サイトでは持たず、上のリンク先でご確認ください（規約上、口コミの転載はしません）。' + (r.ap ? "位置は市区町村の代表点（おおよそ）。" : "") + "</p></div>";
};
RG.natureBind = function (root, p) {
  root.querySelectorAll("[data-natnear]").forEach(function (b) { b.addEventListener("click", function (e) {
    e.stopPropagation(); var g = b.dataset.natnear, pf = (p.view || p.onsen || {}).pf;
    var list = (RG.MAPPOI || []).filter(function (q) { return q.g === g && q.i !== p.i && (!pf || ((q.view || q.onsen || {}).pf === pf)); })
      .map(function (q) { return { q: q, km: RG.hav([p.la, p.lo], [q.la, q.lo]) }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 12);
    var m = RG.openModal((g === "view_jp" ? "🔭 近くの絶景" : "♨️ 近くの温泉") + (pf ? "（" + pf + "）" : ""), '<div class="natnear">' + list.map(function (x) {
      return '<button class="sgbtn" type="button" data-spot="' + esc(x.q.i) + '">' + (x.q.img ? '<img src="' + esc(RG.cimg(x.q.img, 240)) + '" alt="" loading="lazy">' : '<span class="sgbtn__ph">' + (x.q.be || "📍") + "</span>") +
        '<span class="sgbtn__n">' + esc(x.q.n) + '</span><span class="sgbtn__m">' + Math.round(x.km) + "km ・ " + esc(x.q.t) + "</span></button>"; }).join("") + "</div>");
    m.querySelectorAll("[data-spot]").forEach(function (h) { h.addEventListener("click", function () { var q = (RG.MAPPOI || []).filter(function (z) { return z.i === h.dataset.spot; })[0]; if (q) { RG.Map.gotoLatLng(q.la, q.lo, 200); RG.showSpot(q); } }); });
  }); });
};

/* 温泉のこだわりフィルター */
RG.onsenFilter = null;
RG.openOnsenFilter = function () {
  var F = [["free", "🆓 無料で入れる"], ["mixed", "♨️ 混浴"], ["hito", "🏔️ 秘湯"], ["noyu", "🌋 野湯"], ["day", "🌞 日帰り入浴"], ["stay", "🛏️ 宿泊"], ["sauna", "🧖 サウナあり"], ["roten", "🌲 露天風呂"], ["fee", "💴 料金がわかる"]];
  var cur = RG.onsenFilter || {};
  var cnt = {}; (RG.ONSEN_JP || []).forEach(function (r) { F.forEach(function (f) { if (r[f[0]]) cnt[f[0]] = (cnt[f[0]] || 0) + 1; }); });
  var html = '<p class="set__d">温泉 ' + ((RG.ONSEN_JP || []).length) + ' か所から、こだわりで絞り込みます（複数可・AND）。判定は Wikipedia の記述からの自動判定です。</p>' +
    '<div class="onf">' + F.map(function (f) { return '<button class="onf__b' + (cur[f[0]] ? " on" : "") + '" type="button" data-onf="' + f[0] + '">' + f[1] + " <small>" + (cnt[f[0]] || 0) + "</small></button>"; }).join("") + "</div>" +
    '<div class="legend__foot"><button id="onf-go" class="set__b2" type="button">この条件で地図に出す</button><button id="onf-clear" class="set__b2" type="button">解除</button></div>' +
    '<p class="src">日帰りと宿泊は別のタグにしてあるので、どちらかだけでも絞れます。「無料」「混浴」「秘湯」は数が少ないので、まず単独で。</p>';
  var m = RG.openModal("♨️ 温泉のこだわり", html), sel = Object.assign({}, cur);
  m.querySelectorAll("[data-onf]").forEach(function (b) { b.addEventListener("click", function () { sel[b.dataset.onf] = !sel[b.dataset.onf]; b.classList.toggle("on", !!sel[b.dataset.onf]); }); });
  $("#onf-go", m).addEventListener("click", function () {
    RG.onsenFilter = Object.keys(sel).some(function (k) { return sel[k]; }) ? sel : null;
    if (RG.settings) RG.settings.genres = ["onsen_jp"]; if (RG.Map.setGenres) RG.Map.setGenres(["onsen_jp"]);
    RG.closeModal();
    // 条件に合う温泉が全部入るように地図を引く（見えている範囲に無くて «何も出ない» を防ぐ）
    var hits = (RG.MAPPOI || []).filter(function (q) { if (!q.onsen) return false; for (var k in sel) if (sel[k] && !q.onsen[k]) return false; return true; });
    if (hits.length && RG.Map.fitBox) {
      var xs = [], ys = []; hits.forEach(function (q) { var P = RG.project(q.la, q.lo); xs.push(P.x); ys.push(P.y); });
      RG.Map.fitBox(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys), 1.15);
    }
    RG.tripStatus && RG.tripStatus("♨️ 条件に合う温泉 " + hits.length + " か所を地図に出しています。", "ok", 3500);
  });
  $("#onf-clear", m).addEventListener("click", function () { RG.onsenFilter = null; RG.closeModal(); if (RG.Map.poiLOD) RG.Map.poiLOD(); });
};
})(window.RG);
