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

/* SPECIAL 圏内（中村橋・池袋・品川 徒歩30分）の見どころ：Wikipedia 記事つきの場所を写真つきで */
RG.mergeNearSpecial = function () {
  if (!RG.NEAR_SPECIAL || RG.__nearMerged) return; RG.__nearMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  var have = {}; RG.MAPPOI.forEach(function (p) { have[p.n] = p; });
  RG.NEAR_SPECIAL.forEach(function (r, i) {
    var dup = have[r.n]; if (dup && RG.hav([dup.la, dup.lo], [r.la, r.lo]) < 0.4) { if (!dup.img && r.img) dup.img = r.img; return; }
    RG.MAPPOI.push({ i: "ns" + i, n: r.n, la: r.la, lo: r.lo, g: "near_special", s: r.img ? 3.9 : 3.4, ti: r.img ? 1 : 2,
                     t: r.a + " 圏内 " + r.km + "km" + (r.d ? "・" + r.d : ""), be: "⭐", bc: "#C9A227", img: r.img || null,
                     url: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp), ad: null, near: r,
                     srcNote: "SPECIAL 圏内の見どころ: Wikipedia 日本語版（位置情報つき記事・CC BY-SA）。写真は記事の代表画像。" });
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

/* =========================================================================
   山・山脈・川・海・海流（v77）  data/mountains.js, data/water.js
   ・山: ジャンル mountain（標高ランキング TOP100、百名山バッジ、所属山脈）
   ・山脈: 中心線を薄い茶の線＋名前で描く。押すと POP（最高峰・概要・写真）
   ・川: 一級水系の幹川（線があるものは線、河口に印）。押すと POP（延長・流域・源流→河口）
   ・海: 海・湾・海峡・灘の名前。押すと POP
   ・海流: 動く破線＋矢印。暖流は赤、寒流は青。押すと POP（向き・速さ・概要）
   ========================================================================= */
var gTerra = null, gRange, gRiver, gCur, gSea, terraBuilt = {};
function terraHost() {
  var svg = document.getElementById("map"); if (!svg) return null;
  if (!gTerra) {
    gTerra = RG.el("g", { class: "terra" });
    gRange = RG.el("g", { class: "terra__ranges" }); gRiver = RG.el("g", { class: "terra__rivers" });
    gCur = RG.el("g", { class: "terra__cur" }); gSea = RG.el("g", { class: "terra__seas" });
    gTerra.appendChild(gRange); gTerra.appendChild(gRiver); gTerra.appendChild(gCur); gTerra.appendChild(gSea);
  }
  // 下敷き地図（.geo）のすぐ上、路線より下
  var geo = svg.querySelector(".geo");
  var want = geo ? geo.nextSibling : svg.firstChild;
  if (gTerra !== want && gTerra.parentNode !== svg || (gTerra.previousSibling !== geo)) {
    if (geo) svg.insertBefore(gTerra, geo.nextSibling); else svg.insertBefore(gTerra, svg.firstChild);
  }
  return svg;
}
function pathOf(pts) {
  var d = [];
  for (var i = 0; i < pts.length; i++) { var P = RG.project(pts[i][0], pts[i][1]); d.push((i ? "L" : "M") + P.x.toFixed(1) + " " + P.y.toFixed(1)); }
  return d.join("");
}
/* なめらかな線（Catmull-Rom → 3次ベジェ）。合流点をつないだ近似の川に使う */
function smoothPath(pts) {
  var P = pts.map(function (q) { var o = RG.project(q[0], q[1]); return [o.x, o.y]; });
  if (P.length < 3) return pathOf(pts);
  var d = "M" + P[0][0].toFixed(1) + " " + P[0][1].toFixed(1);
  for (var i = 0; i < P.length - 1; i++) {
    var p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += "C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
  }
  return d;
}
function bboxOf(pts) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  pts.forEach(function (q) { var P = RG.project(q[0], q[1]); if (P.x < b[0]) b[0] = P.x; if (P.y < b[1]) b[1] = P.y; if (P.x > b[2]) b[2] = P.x; if (P.y > b[3]) b[3] = P.y; });
  return b;
}
function inView(b, vb) { return !(b[2] < vb.x || b[0] > vb.x + vb.w || b[3] < vb.y || b[1] > vb.y + vb.h); }
function smooth(pts) {
  if (pts.length < 3) return pts;
  var out = [pts[0]];
  for (var i = 1; i < pts.length - 1; i++) out.push([(pts[i - 1][0] + pts[i][0] + pts[i + 1][0]) / 3, (pts[i - 1][1] + pts[i][1] + pts[i + 1][1]) / 3]);
  out.push(pts[pts.length - 1]);
  return out;
}

/* ---- 山（POI） ---- */
RG.mergeMountains = function () {
  if (!RG.MOUNTAINS || RG.__mtMerged) return; RG.__mtMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  var rank = 0;
  RG.MOUNTAINS.forEach(function (r, i) {
    rank = i + 1; r.rk = rank;
    var star = r.n === "富士山" ? 5 : r.h === 1 ? 4.6 : rank <= 100 ? 4.4 : r.h === 2 ? 4.0 : r.h === 3 ? 3.8 : r.e >= 2000 ? 3.5 : r.e >= 1000 ? 3.3 : r.img ? 3.2 : 3.0;
    var ti = (rank <= 30 || r.n === "富士山") ? 0 : (rank <= 300 || r.h === 1) ? 1 : 2;
    var tags = ["標高 " + r.e.toLocaleString("ja-JP") + "m"];
    if (rank <= 100) tags.push("全国 " + rank + " 位");
    if (r.h === 1) tags.push("日本百名山"); else if (r.h === 2) tags.push("二百名山"); else if (r.h === 3) tags.push("三百名山");
    if (r.rg) tags.push(r.rg);
    RG.MAPPOI.push({ i: "mt" + i, n: r.n, la: r.la, lo: r.lo, g: "mountain", s: star, ti: ti, t: tags.join("・"),
                     be: (rank <= 100 || r.h === 1) ? "🗻" : "⛰️", bc: r.e >= 3000 ? "#4E342E" : r.e >= 2000 ? "#6D4C41" : r.e >= 1000 ? "#8D6E63" : "#A1887F",
                     img: r.img || null, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null, ad: r.pf || "",
                     mt: r, q: r.q, srcNote: "山: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。標高は Wikidata の値（三角点と異なることがあります）。" });
  });
};
RG.mergeRivers = function () {
  if (!RG.RIVERS || RG.__rvMerged) return; RG.__rvMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.RIVERS.forEach(function (r, i) {
    var g1 = r.grade === 1;
    RG.MAPPOI.push({ i: "rv" + i, n: r.n, la: r.la, lo: r.lo, g: "river", s: g1 ? (r.len >= 200 ? 4.3 : 3.8) : 3.2, ti: g1 ? (r.len >= 150 ? 0 : 1) : 2,
                     t: (g1 ? "一級水系" + (r.sys && r.sys !== r.n ? "（" + r.sys + "水系）" : "") : "二級河川") + (r.len ? "・" + r.len + "km" : "") + (r.pt === "src" ? "・源流の位置" : "・河口"),
                     be: "🏞️", bc: g1 ? "#1565C0" : "#42A5F5", img: r.img || null, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null,
                     ad: (r.pf || []).join("・"), river: r, q: r.q, srcNote: "川: Wikipedia 日本語版「一級水系」「二級水系」(CC BY-SA)・Wikidata (CC0)。線は Natural Earth (PD)・Commons Data (CC0)・支流の合流点からの近似。" });
  });
};

/* ---- 線・文字の描画（データが揃ったときに一度） ---- */
RG.terraBuild = function () {
  if (!terraHost()) return;
  var vbw = RG.Map && RG.Map.viewBox ? RG.Map.viewBox().w : 1000;
  if (RG.RANGES && !terraBuilt.range) {
    terraBuilt.range = 1; gRange.innerHTML = "";
    RG.RANGES.forEach(function (r, i) {
      if (!r.pts || r.pts.length < 3 || !/山脈|山地|連峰|高地|山系|丘陵|山塊|アルプス|山々/.test(r.n)) return;
      var pts = smooth(r.pts), d = pathOf(pts);
      var id = "rg-rng-" + i;
      var p = RG.el("path", { class: "trg", id: id, d: d }); p.__r = r; p.__bb = bboxOf(pts); p.__len = r.pts.length;
      var t = RG.el("text", { class: "trg__t" });
      var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
      tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = r.n;
      t.appendChild(tp); t.__p = p;
      var hit = RG.el("path", { class: "trg__hit", d: d }); hit.__r = r;
      gRange.appendChild(p); gRange.appendChild(hit); gRange.appendChild(t);
    });
  }
  if (RG.RIVERS && (!terraBuilt.river || (RG.RIVER_GEO && !terraBuilt.riverGeo))) {
    // 実測の線形（国土数値情報 W05）があればそれを使い、無ければ近似。線形があとから届いたら描き直す
    var GEO = RG.RIVER_GEO || {}, byQ = {};
    Object.keys(GEO).forEach(function (k) { if (GEO[k].q) byQ[GEO[k].q] = GEO[k]; });
    terraBuilt.river = 1; terraBuilt.riverGeo = !!RG.RIVER_GEO; gRiver.innerHTML = "";
    var drawn = {};
    RG.RIVERS.forEach(function (r, i) {
      var ge = byQ[r.q] || GEO[r.n];
      var polylines = ge ? ge.pts : (r.pts && r.pts.length >= 2 ? [r.pts] : null);
      if (!polylines) return;
      drawn[ge ? (byQ[r.q] ? r.q : r.n) : "-"] = 1;
      var apx = !ge && r.ps === "wd";
      var d = ge ? polylines.map(function (pts) { return pathOf(pts); }).join("") : apx ? smoothPath(r.pts) : pathOf(r.pts), id = "rg-rv-" + i;
      var allpts = []; polylines.forEach(function (pts) { allpts = allpts.concat(pts); });
      var p = RG.el("path", { class: "trv" + (r.grade === 1 ? " trv--1" : "") + (apx ? " trv--apx" : "") + (ge ? " trv--geo" : ""), id: id, d: d }); p.__r = r; p.__bb = bboxOf(allpts); p.__apx = apx;
      var t = RG.el("text", { class: "trv__t" });
      var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
      tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = r.n;
      t.appendChild(tp); t.__p = p;
      var hit = RG.el("path", { class: "trv__hit", d: d }); hit.__r = r;
      gRiver.appendChild(p); gRiver.appendChild(hit); gRiver.appendChild(t);
    });
    // 支流（RIVERS に無い一級河川）: 細い線＋寄ったときだけ名前
    Object.keys(GEO).forEach(function (k, j) {
      var ge = GEO[k]; if (ge.q && byQ[ge.q] === ge && drawn[ge.q]) return; if (drawn[k]) return; if (ge.m) return;
      var d = ge.pts.map(function (pts) { return pathOf(pts); }).join(""), id = "rg-rvt-" + j, allpts = []; ge.pts.forEach(function (pts) { allpts = allpts.concat(pts); });
      var r2 = { n: k.split("|")[0], sys: ge.sys, grade: ge.g, len: ge.km, pf: ge.pf, trib: true };
      var p = RG.el("path", { class: "trv trv--trib", id: id, d: d }); p.__r = r2; p.__bb = bboxOf(allpts); p.__trib = true;
      var t = RG.el("text", { class: "trv__t trv__t--trib" }); var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id); tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = r2.n; t.appendChild(tp); t.__p = p;
      var hit = RG.el("path", { class: "trv__hit", d: d }); hit.__r = r2;
      gRiver.appendChild(p); gRiver.appendChild(hit); gRiver.appendChild(t);
    });
  }
  if (RG.CURRENTS && !terraBuilt.cur) {
    terraBuilt.cur = 1; gCur.innerHTML = "";
    var defs = document.getElementById("map").querySelector("defs") || (function () { var d = RG.el("defs"); document.getElementById("map").insertBefore(d, document.getElementById("map").firstChild); return d; })();
    ["warm", "cold"].forEach(function (k) {
      if (document.getElementById("tcur-arrow-" + k)) return;
      var m = RG.el("marker", { id: "tcur-arrow-" + k, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "4", markerHeight: "4", orient: "auto-start-reverse", markerUnits: "strokeWidth" });
      m.appendChild(RG.el("path", { d: "M0 0L10 5L0 10z", fill: k === "warm" ? "#E53935" : "#1E88E5" }));
      defs.appendChild(m);
    });
    RG.CURRENTS.forEach(function (c, i) {
      var pts = smooth(c.pts), d = pathOf(pts), id = "rg-cur-" + i;
      var k = c.warm ? "warm" : "cold";
      var glow = RG.el("path", { class: "tcur__glow tcur__glow--" + k, d: d });
      var p = RG.el("path", { class: "tcur tcur--" + k, id: id, d: d, "marker-end": "url(#tcur-arrow-" + k + ")" }); p.__c = c; p.__bb = bboxOf(pts);
      var t = RG.el("text", { class: "tcur__t tcur__t--" + k });
      var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
      tp.setAttribute("startOffset", "45%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = (c.warm ? "▶ " : "▶ ") + c.n;
      t.appendChild(tp); t.__p = p;
      var hit = RG.el("path", { class: "tcur__hit", d: d }); hit.__c = c;
      gCur.appendChild(glow); gCur.appendChild(p); gCur.appendChild(hit); gCur.appendChild(t);
    });
  }
  if (RG.SEAS && !terraBuilt.sea) {
    terraBuilt.sea = 1; gSea.innerHTML = "";
    RG.SEAS.forEach(function (s) {
      var P = RG.project(s.la, s.lo);
      var t = RG.el("text", { class: "tsea" + (s.big ? " tsea--big" : ""), x: P.x.toFixed(1), y: P.y.toFixed(1), "text-anchor": "middle", text: s.n });
      t.__s = s; t.__x = P.x; t.__y = P.y;
      gSea.appendChild(t);
    });
  }
  if (!gTerra.__bound) {
    gTerra.__bound = 1;
    gTerra.addEventListener("click", function (ev) {
      var n = ev.target;
      while (n && n !== gTerra) {
        if (n.__r && n.__r.pts && n.classList.contains("trg__hit")) { RG.showRange(n.__r); return; }
        if (n.__r && n.classList.contains("trv__hit")) { RG.showRiver(n.__r); return; }
        if (n.__c) { RG.showCurrent(n.__c); return; }
        if (n.__s) { RG.showSea(n.__s); return; }
        n = n.parentNode;
      }
    });
  }
  RG.terraLOD();
};

var terraOn = { range: true, river: true, cur: true, sea: true };
RG.terraSet = function (k, on) { terraOn[k] = on; RG.terraLOD(); };
RG.terraGet = function (k) { return terraOn[k]; };
RG.terraLOD = function () {
  if (!gTerra || !RG.Map || !RG.Map.viewBox) return;
  terraHost();
  var vb = RG.Map.viewBox(), z = RG.zoomLevel ? RG.zoomLevel() : 1, u = RG.__u || 1;
  var pad = { x: vb.x - vb.w * 0.3, y: vb.y - vb.h * 0.3, w: vb.w * 1.6, h: vb.h * 1.6 };
  // 山脈: 引き〜中くらい（z 0.2〜8）。線幅・文字は画面px
  var showRange = terraOn.range && z >= 0.05 && z < 3.5;
  gRange.style.display = showRange ? "" : "none";
  if (showRange) Array.prototype.forEach.call(gRange.childNodes, function (n) {
    if (n.classList.contains("trg")) {
      var vis = inView(n.__bb, pad) && (z >= 0.14 || n.__len >= 12);
      n.style.display = vis ? "" : "none"; n.__vis = vis;
      n.style.setProperty("stroke-width", (Math.min(14, 6 + z * 4) * u).toFixed(2) + "px", "important");
    } else if (n.classList.contains("trg__hit")) { n.style.setProperty("stroke-width", (16 * u).toFixed(2) + "px", "important"); }
    else if (n.__p) { n.style.display = n.__p.__vis ? "" : "none"; n.style.setProperty("font-size", (Math.min(14, 10 + z * 3) * u).toFixed(2) + "px", "important"); n.style.setProperty("letter-spacing", (3 * u).toFixed(2) + "px", "important"); }
  });
  var showRiver = terraOn.river && z >= 0.09;
  gRiver.style.display = showRiver ? "" : "none";
  if (showRiver) Array.prototype.forEach.call(gRiver.childNodes, function (n) {
    if (n.classList.contains("trv")) {
      var vis = inView(n.__bb, pad) && (z >= 0.3 || n.__r.grade === 1) && !(n.__apx && z >= 1.3) && !(n.__trib && z < 0.45);   // 近似の線は街まで寄ったら消す。支流は少し寄ってから
      n.style.display = vis ? "" : "none"; n.__vis = vis;
      n.style.setProperty("stroke-width", (Math.min(3.2, 1.2 + z * 1.2) * u).toFixed(2) + "px", "important");
    } else if (n.classList.contains("trv__hit")) { n.style.setProperty("stroke-width", (12 * u).toFixed(2) + "px", "important"); }
    else if (n.__p) { n.style.display = (n.__p.__vis && z >= (n.__p.__trib ? 1.2 : 0.22)) ? "" : "none"; n.style.setProperty("font-size", ((n.__p.__trib ? 9.5 : 10.5) * u).toFixed(2) + "px", "important"); }
  });
  var showCur = terraOn.cur && z < 0.7;
  gCur.style.display = showCur ? "" : "none";
  if (showCur) Array.prototype.forEach.call(gCur.childNodes, function (n) {
    if (n.classList.contains("tcur")) {
      n.style.setProperty("stroke-width", (2.4 * u).toFixed(2) + "px", "important");
      n.style.setProperty("stroke-dasharray", (10 * u).toFixed(1) + " " + (8 * u).toFixed(1), "important");
      n.style.setProperty("--dash", (18 * u).toFixed(1) + "px");
    } else if (n.classList.contains("tcur__glow")) { n.style.setProperty("stroke-width", (7 * u).toFixed(2) + "px", "important"); }
    else if (n.classList.contains("tcur__hit")) { n.style.setProperty("stroke-width", (14 * u).toFixed(2) + "px", "important"); }
    else if (n.__p) { n.style.setProperty("font-size", (11 * u).toFixed(2) + "px", "important"); n.style.setProperty("letter-spacing", (2 * u).toFixed(2) + "px", "important"); }
  });
  var showSea = terraOn.sea;
  gSea.style.display = showSea ? "" : "none";
  if (showSea) {
    var slots = [];
    Array.prototype.forEach.call(gSea.childNodes, function (t) {
      var s = t.__s, ok = false;
      var want = s.big ? z < 0.9 : (z >= 0.09 && (s.k === "海" || s.k === "内海" || s.k === "灘" || z >= 0.35 || (s.k === "湾" && z >= 0.2)));
      if (want && t.__x > pad.x && t.__x < pad.x + pad.w && t.__y > pad.y && t.__y < pad.y + pad.h) {
        var fs = (s.big ? 13 : s.k === "海" || s.k === "灘" ? 11 : 10) * u;
        var w = (t.textContent.length * fs * 1.1 + 6 * u), h = fs * 1.4;
        var a0 = t.__x - w / 2, a1 = t.__x + w / 2, b0 = t.__y - h, b1 = t.__y + h * 0.4, bad = false;
        for (var i = 0; i < slots.length; i++) { var q = slots[i]; if (a0 < q[2] && a1 > q[0] && b0 < q[3] && b1 > q[1]) { bad = true; break; } }
        if (!bad) { slots.push([a0, b0, a1, b1]); ok = true; t.style.setProperty("font-size", fs.toFixed(2) + "px", "important"); t.style.setProperty("letter-spacing", ((s.big ? 4 : 2) * u).toFixed(2) + "px", "important"); }
      }
      t.style.display = ok ? "" : "none";
    });
  }
};

/* ---- POP ---- */
function wpLink(wp) { return wp ? '<a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(wp) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a>' : ""; }
function heroImg(img, alt) { return img ? '<img class="spotcard__i" src="' + esc(RG.cimg(img, 640)) + '" alt="' + esc(alt || "") + '" loading="lazy">' : ""; }
function fitPts(pts) {
  var b = bboxOf(pts); if (RG.Map && RG.Map.fitBox) RG.Map.fitBox(b[0], b[1], b[2], b[3], 0.15);
}
RG.showRange = function (r) {
  var peaks = (RG.MOUNTAINS || []).filter(function (m) { return m.rg === r.n; }).sort(function (a, b) { return b.e - a.e; });
  var html = '<div class="spotcard terra-card">' + heroImg(r.img, r.n) +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:#8D6E63">⛰️</span><div><h3>' + esc(r.n) + '</h3><p class="spotcard__k">' + esc(r.k) + (r.hi ? " ・ 最高峰 " + esc(r.hi) + "（" + r.he.toLocaleString("ja-JP") + "m）" : "") + "</p></div></div>" +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") +
    '<div class="exgrid">' + (RG.exrow ? RG.exrow("🗻 最高峰", r.hi || "—", r.he ? r.he.toLocaleString("ja-JP") + " m" : "") + RG.exrow("⛰️ 構成する山", r.m + " 座", "Wikipedia に記事のある山の数") : "") + "</div>" +
    (peaks.length ? '<div class="terra__peaks">' + peaks.slice(0, 12).map(function (m) { return '<button class="chip" type="button" data-mt="' + esc(m.n) + '">' + (m.h === 1 ? "🗻" : "⛰️") + " " + esc(m.n) + " <i>" + m.e.toLocaleString("ja-JP") + "m</i></button>"; }).join("") + "</div>" : "") +
    '<div class="lnks">' + wpLink(r.wp) + '<button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button>' +
    '<button class="lnk" type="button" data-mts="1"><span>⛰️</span>山を地図に出す</button></div>' +
    '<p class="src">山脈の線は、構成する山の位置から機械的に引いた中心線です（正確な稜線ではありません）。出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。</p></div>';
  var m = RG.openModal("⛰️ " + r.n, html);
  m.querySelector("[data-fit]").addEventListener("click", function () { RG.closeModal(); fitPts(r.pts); });
  m.querySelector("[data-mts]").addEventListener("click", function () { RG.closeModal(); if (RG.setGenreList) RG.setGenreList(["mountain"]); fitPts(r.pts); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-mt]"), function (b) { b.addEventListener("click", function () { var p = (RG.MAPPOI || []).filter(function (x) { return x.g === "mountain" && x.n === b.dataset.mt; })[0]; if (p) { RG.closeModal(); RG.Map.gotoLatLng(p.la, p.lo, 600); RG.showSpot(p); } }); });
};
RG.showRiver = function (r) {
  var html = '<div class="spotcard terra-card">' + heroImg(r.img, r.n) +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:#1565C0">🏞️</span><div><h3>' + esc(r.n) + '</h3><p class="spotcard__k">' + (r.grade === 1 ? "一級水系" + (r.sys && r.sys !== r.n ? "（" + esc(r.sys) + "水系）" : "") : "二級河川") + "</p></div></div>" +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") +
    '<div class="exgrid">' + (RG.exrow ? RG.exrow("📏 幹川流路延長", r.len ? r.len.toLocaleString("ja-JP") + " km" : "—", "") + RG.exrow("🗺️ 流域面積", r.area ? r.area.toLocaleString("ja-JP") + " km²" : "—", "") + RG.exrow("🏠 流れる都道府県", (r.pf || []).length + " 都道府県", (r.pf || []).join("・")) : "") + "</div>" +
    '<div class="lnks">' + wpLink(r.wp) + (r.src ? '<button class="lnk" type="button" data-src="1"><span>⛰️</span>源流へ</button>' : "") + '<button class="lnk" type="button" data-mouth="1"><span>🌊</span>河口へ</button>' + (r.pts ? '<button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button>' : "") + "</div>" +
    '<p class="src">' + (r.ps === "wd" ? "川の線は支流の合流点をつないだ近似で、蛇行は再現していません。" : r.ps === "ne" ? "川の線は Natural Earth (PD)。" : r.ps === "commons" ? "川の線は Wikimedia Commons の Data (CC0)。" : "") + "出典: Wikipedia 日本語版 (CC BY-SA)・Wikidata (CC0)。</p></div>";
  var m = RG.openModal("🏞️ " + r.n, html);
  var b;
  if ((b = m.querySelector("[data-src]"))) b.addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(r.src[0], r.src[1], 800); });
  if ((b = m.querySelector("[data-mouth]"))) b.addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(r.la, r.lo, 800); });
  if ((b = m.querySelector("[data-fit]"))) b.addEventListener("click", function () { RG.closeModal(); fitPts(r.pts); });
};
RG.showCurrent = function (c) {
  var html = '<div class="spotcard terra-card">' + heroImg(c.img, c.n) +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:' + (c.warm ? "#E53935" : "#1E88E5") + '">' + (c.warm ? "🌡️" : "🧊") + '</span><div><h3>' + esc(c.n) + '</h3><p class="spotcard__k">' + (c.warm ? "暖流" : "寒流") + (c.spd ? " ・ 速さ " + esc(c.spd) : "") + "</p></div></div>" +
    '<div class="cur__dir"><span class="cur__ani cur__ani--' + (c.warm ? "w" : "c") + '"></span><span>矢印の向きに流れます。地図の破線も同じ向きに動いています</span></div>' +
    (c.d ? '<p class="nat__d">' + esc(c.d) + "</p>" : "") +
    '<div class="lnks">' + wpLink(c.wp) + '<button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button></div>' +
    '<p class="src">流路は概略です（季節・年で大きく変わります）。出典: Wikipedia 日本語版 (CC BY-SA)。</p></div>';
  var m = RG.openModal((c.warm ? "🌡️ " : "🧊 ") + c.n, html);
  m.querySelector("[data-fit]").addEventListener("click", function () { RG.closeModal(); fitPts(c.pts); });
};
RG.showSea = function (s) {
  var html = '<div class="spotcard terra-card">' + heroImg(s.img, s.n) +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:#0277BD">🌊</span><div><h3>' + esc(s.n) + '</h3><p class="spotcard__k">' + esc(s.k) + "</p></div></div>" +
    (s.d ? '<p class="nat__d">' + esc(s.d) + "</p>" : "") +
    '<div class="lnks">' + wpLink(s.wp) + "</div><p class=\"src\">出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。</p></div>";
  RG.openModal("🌊 " + s.n, html);
};

/* ---- 山のカードブロック・ランキング ---- */
RG.mountainBlock = function (p) {
  var r = p.mt; if (!r) return "";
  return '<div class="nat mtb"><div class="mtb__e"><b>' + r.e.toLocaleString("ja-JP") + '</b><i>m</i>' +
    '<button class="mtb__rk" type="button" data-mtrank="all">全国 ' + r.rk + ' 位 ▸ ランキング</button></div>' +
    '<div class="nat__tags">' + (r.h === 1 ? '<span class="nat__tag nat__tag--k">🗻 日本百名山</span>' : r.h === 2 ? '<span class="nat__tag">日本二百名山</span>' : r.h === 3 ? '<span class="nat__tag">日本三百名山</span>' : "") +
    (r.rg ? '<button class="nat__tag nat__tag--b" type="button" data-range="' + esc(r.rg) + '">⛰️ ' + esc(r.rg) + "</button>" : "") +
    (r.pf ? '<span class="nat__tag">' + esc(r.pf) + "</span>" : "") + "</div>" +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") + "</div>";
};
RG.riverBlock = function (p) {
  var r = p.river; if (!r) return "";
  return '<div class="nat"><div class="nat__tags">' + (r.len ? '<span class="nat__tag nat__tag--k">📏 ' + r.len + " km</span>" : "") + (r.area ? '<span class="nat__tag">流域 ' + r.area.toLocaleString("ja-JP") + " km²</span>" : "") + "</div>" +
    (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") + '<div class="nat__lnks"><button class="lnk" type="button" data-river="1"><span>🏞️</span>川の全体・源流・河口</button></div></div>';
};
RG.terraBind = function (root, p) {
  var b;
  if ((b = root.querySelector("[data-mtrank]"))) b.addEventListener("click", function () { RG.showMountainRank(p.mt && p.mt.pf); });
  if ((b = root.querySelector("[data-range]"))) b.addEventListener("click", function () { var r = (RG.RANGES || []).filter(function (x) { return x.n === b.dataset.range; })[0]; if (r) RG.showRange(r); });
  if ((b = root.querySelector("[data-river]"))) b.addEventListener("click", function () { RG.showRiver(p.river); });
};
RG.showMountainRank = function (pref) {
  var M = RG.MOUNTAINS || [];
  var prefs = []; M.forEach(function (m) { if (m.pf && prefs.indexOf(m.pf) < 0) prefs.push(m.pf); });
  var cur = pref && prefs.indexOf(pref) >= 0 ? pref : "";
  function rows() {
    var list = cur ? M.filter(function (m) { return m.pf === cur; }) : M;
    list = list.slice(0, 100);
    return list.map(function (m, i) {
      return '<tr class="rkt__r" data-mt="' + esc(m.n) + '"><td class="rkt__n">' + (i + 1) + '</td><td class="rkt__nm"><a href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(m.wp) + '" target="_blank" rel="noopener" data-stop="1">' + esc(m.n) + "</a>" + (m.h === 1 ? ' <i class="rkt__b">百名山</i>' : "") + '</td><td class="rkt__v">' + m.e.toLocaleString("ja-JP") + ' m</td><td class="rkt__s">' + esc(m.pf || "") + (m.rg ? "・" + esc(m.rg) : "") + "</td></tr>";
    }).join("");
  }
  var html = '<div class="rkt__box"><div class="rk__ctl"><label>範囲 <select id="mk-pref"><option value="">全国</option>' + prefs.map(function (p) { return '<option value="' + esc(p) + '"' + (p === cur ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select></label>" +
    '<span class="rk__note">標高の高い順 TOP100。名前は Wikipedia、行を押すと地図へ</span></div>' +
    '<div class="rkt__wrap"><table class="rkt"><thead><tr><th>順位</th><th>山</th><th>標高</th><th>都道府県・山脈</th></tr></thead><tbody id="mk-body">' + rows() + "</tbody></table></div>" +
    '<p class="src">出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。標高は Wikidata の値です。</p></div>';
  var m = RG.openModal("🗻 山の標高ランキング" + (cur ? "（" + cur + "）" : "（全国）"), html);
  function bind() {
    Array.prototype.forEach.call(m.querySelectorAll(".rkt__r"), function (tr) {
      tr.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("a")) return;
        var p = (RG.MAPPOI || []).filter(function (x) { return x.g === "mountain" && x.n === tr.dataset.mt; })[0];
        if (p) { RG.closeModal(); if (RG.setGenreList) RG.setGenreList(["mountain"]); RG.Map.gotoLatLng(p.la, p.lo, 600); RG.showSpot(p); }
      });
    });
  }
  bind();
  m.querySelector("#mk-pref").addEventListener("change", function () {
    cur = this.value; m.querySelector("#mk-body").innerHTML = rows();
    var hd = m.querySelector(".modal__hd b"); if (hd) hd.textContent = "🗻 山の標高ランキング" + (cur ? "（" + cur + "）" : "（全国）");
    bind();
  });
};
})(window.RG);
