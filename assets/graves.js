/* =========================================================================
   v133: 偉人の墓 100（data/graves.js）
   ・地図: ジャンル «🪦 偉人の墓» を選んだときだけ、墓所に 🪦 の印
   ・カード: 肖像（Wikipedia の記事の画像）／ひとこと／やさしい解説／エピソード／名言・故事成語／お墓の場所とお参りの案内
             ／同じ墓所・近くに眠る人／この時代のれきし地図へ／100 人の一覧（時代順）
   ・駅・スポットのカード: 1km 以内に偉人の墓があれば «🪦 近くに眠る偉人» の帯
   ・れきし地図: 時代の一覧に «🪦 この時代の偉人の墓» → 地図にまとめて出す
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, IMG = {}, WAIT = [];
var ERA_ORD = ["飛鳥", "奈良", "平安", "鎌倉", "南北朝", "室町", "戦国", "安土桃山", "江戸", "幕末", "明治", "大正", "昭和"];
var ERA_C = { "飛鳥": "#2E8B57", "奈良": "#1F7A8C", "平安": "#C2185B", "鎌倉": "#5D4037", "南北朝": "#455A64", "室町": "#455A64", "戦国": "#455A64",
              "安土桃山": "#B8860B", "江戸": "#1565C0", "幕末": "#0D47A1", "明治": "#B71C1C", "大正": "#6A1B9A", "昭和": "#37474F" };
function gSpot(x) { return { n: "🪦" + x.n.replace(/（.*?）/g, ""), la: x.la, lo: x.lo, pt: "💬 みんなの補足（お参りの写真・エピソード）", ph: "この人やお墓について知っていること・お参りした感想（300字まで）" }; }   // v134: お墓ごとのコメントの鍵
function G() { return RG.GRAVES || []; }
function byId(id) { return G().filter(function (x) { return x.id === id; })[0]; }
function km(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; }
function ensure(cb) {
  if (RG.GRAVES) { cb(); return; }
  WAIT.push(cb); if (WAIT.length > 1) return;
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = "data/graves.js" + (v ? "?v=" + v : "");
  s.onload = function () { var w = WAIT; WAIT = []; if (RG.mergeGraves) RG.mergeGraves(); w.forEach(function (f) { try { f(); } catch (e) {} }); };
  s.onerror = function () { WAIT = []; if (RG.tripStatus) RG.tripStatus("偉人の墓のデータを読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
RG.graveEnsure = ensure;
RG.mergeGraves = function () {
  if (!RG.GRAVES || RG.__graveMerged) return; RG.__graveMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  G().forEach(function (x) {
    RG.MAPPOI.push({ i: "grv" + x.id, n: x.n.replace(/（.*?）/g, "") + "の墓", la: x.la, lo: x.lo, g: "grave", s: 4.2, ti: 0, sl: 40,
                     t: x.grave + "（" + x.life + "・" + x.era + "）", be: "🪦", bc: ERA_C[x.era] || "#5D4037", grave: x.id });
  });
};
RG.graveNear = function (la, lo, r) {
  if (!RG.GRAVES || la == null) return [];
  return G().map(function (x) { return { x: x, d: km(la, lo, x.la, x.lo) }; })
    .filter(function (o) { return o.d <= (r || 1); }).sort(function (a, b) { return a.d - b.d; });
};
/* 駅・スポットのカードの帯（1km 以内） */
RG.graveBanner = function (la, lo) {
  var L = RG.graveNear(la, lo, 1); if (!L.length) return "";
  var names = L.slice(0, 3).map(function (o) { return o.x.n.replace(/（.*?）/g, ""); }).join("・") + (L.length > 3 ? " ほか" : "");
  var walk = Math.max(1, Math.round(L[0].d * 1000 / 80));
  return '<button class="grb" type="button" data-grave="' + esc(L[0].x.id) + '"><span class="grb__e">🪦</span><span class="grb__t"><b>近くに眠る偉人</b>' + esc(names) +
    "<small>" + esc(L[0].x.grave) + "（歩いて約" + walk + "分）" + (L.length > 1 ? "・1km 以内に " + L.length + " 人" : "") + "</small></span><span class=\"grb__m\">くわしく ›</span></button>";
};
document.addEventListener("click", function (e) {
  var b = e.target && e.target.closest && e.target.closest("[data-grave]");
  if (b) { e.preventDefault(); var id = b.getAttribute("data-grave"); ensure(function () { RG.showGrave(id); }); return; }
  var a = e.target && e.target.closest && e.target.closest("[data-gravelist]");
  if (a) { e.preventDefault(); ensure(function () { RG.showGrave(null, a.getAttribute("data-gravelist")); }); }
});
function loadImg(root, wp) {
  var box = root.querySelector(".grv__img"); if (!box) return;
  function put(o) {
    if (!box.isConnected) return;
    if (!o || !o.src) { box.classList.add("grv__img--none"); box.innerHTML = "<span>🪦</span>"; return; }
    box.innerHTML = '<img src="' + esc(o.src) + '" alt="" loading="lazy"><a class="grv__cr" href="' + esc(o.page) + '" target="_blank" rel="noopener">画像: Wikipedia</a>';
  }
  if (IMG[wp] !== undefined) { put(IMG[wp]); return; }
  fetch("https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=480&titles=" + encodeURIComponent(wp))
    .then(function (r) { return r.json(); }).then(function (j) {
      var pg = j && j.query && j.query.pages, k = pg && Object.keys(pg)[0], t = k && pg[k].thumbnail;
      IMG[wp] = t ? { src: t.source, page: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(pg[k].title) } : null; put(IMG[wp]);
    }).catch(function () { IMG[wp] = null; put(null); });
}
function listHtml(cur, onlyEra) {
  var by = {}; G().forEach(function (x) { (by[x.era] = by[x.era] || []).push(x); });
  return ERA_ORD.filter(function (e) { return by[e] && (!onlyEra || e === onlyEra); }).map(function (e) {
    return '<div class="grv__eg"><b style="--ec:' + (ERA_C[e] || "#555") + '">' + esc(e) + "<small>" + by[e].length + "人</small></b><div>" +
      by[e].map(function (x) { return '<button class="grv__c' + (x === cur ? " on" : "") + '" type="button" data-to="' + esc(x.id) + '">' + esc(x.n.replace(/（.*?）/g, "")) + "</button>"; }).join("") + "</div></div>";
  }).join("");
}
/* id=null → 一覧だけ（era があればその時代に絞る） */
RG.showGrave = function (id, era) {
  var x = id ? byId(id) : null, all = G();
  if (!x) {
    var h = '<div class="grv"><p class="grv__lead">歴史の教科書やドラマでおなじみの 100 人が、いまどこに眠っているか。押すと、その人のエピソードとお墓の案内が出ます。</p>' +
      '<button class="whs__all-pts" type="button" data-gmap="' + esc(era || "") + '">🗺️ ' + (era ? esc(era) + "の人の" : "100 人の") + "お墓を、地図にぜんぶ出す</button>" +
      listHtml(null, era) + (era ? '<button class="grv__more" type="button" data-gravelist="">☰ 100 人ぜんぶを見る</button>' : "") +
      '<p class="src">お墓の位置はおおよそ。同じ人のお墓が各地にあるときは、代表的な1か所を載せています。</p></div>';
    var m0 = RG.openModal("🪦 偉人の墓 100", h); bindCommon(m0, null, era); return;
  }
  var i = all.indexOf(x), c = ERA_C[x.era] || "#5D4037";
  var near = RG.graveNear(x.la, x.lo, 1.2).filter(function (o) { return o.x !== x; }).slice(0, 8);
  var html = '<div class="grv" style="--gc:' + c + '">' +
    '<div class="grv__hero"><div class="grv__img"><span class="grv__ld">…</span></div><div class="grv__ht">' +
      '<span class="grv__badge">🪦 ' + esc(x.era) + "・" + esc(x.cat) + "</span>" +
      '<h3 class="grv__n">' + esc(x.n) + "<small>" + esc(x.yomi) + "</small></h3>" +
      '<p class="grv__life">📅 ' + esc(x.life) + "</p></div></div>" +
    '<p class="hp__hook">🤔 ' + esc(x.hook) + "</p>" +
    '<div class="eh__kid">' + x.kid.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div>" +
    '<div class="eh__hee"><b>📖 エピソード・へぇ〜！</b><ul>' + x.epi.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
    (x.koji && x.koji.length ? '<div class="hp__koji"><b>📜 名言・故事成語</b>' + x.koji.map(function (k) {
      return '<div class="hp__kj"><q>' + esc(k.w) + "</q><span>意味: " + esc(k.m) + "</span></div>"; }).join("") + "</div>" : "") +
    '<div class="grv__visit"><b>🪦 お墓はここ</b><p class="grv__gn">' + esc(x.grave) + (x.ad && x.visit.indexOf(x.ad) < 0 ? "<small>" + esc(x.ad) + "</small>" : "") + "</p>" +
      "<p>" + esc(x.visit) + "</p>" + (x.note ? '<p class="grv__note">⚠️ ' + esc(x.note) + "</p>" : "") +
      '<div class="grv__acts"><button class="grv__go" type="button" data-gfly="1">📍 地図でお墓を見る</button>' +
        '<a class="grv__go grv__go--l" href="https://www.google.com/maps/search/?api=1&query=' + x.la + "," + x.lo + '" target="_blank" rel="noopener">🧭 行き方（Google マップ）</a>' +
        (x.he && RG.histOpen ? '<button class="grv__go grv__go--l" type="button" data-ghist="' + esc(x.he) + '">📜 ' + esc(x.era) + "のれきし地図</button>" : "") + "</div></div>" +
    (near.length ? '<h4 class="whs__h">👥 同じ墓所・近くに眠る人</h4><div class="whs__pts">' + near.map(function (o) {
      return '<button class="grv__c" type="button" data-to="' + esc(o.x.id) + '">' + esc(o.x.n.replace(/（.*?）/g, "")) + "<small>" + (o.d < 0.15 ? "同じ墓所" : Math.round(o.d * 1000) + "m") + "</small></button>"; }).join("") + "</div>" : "") +
    (RG.postsEnabled && RG.postsEnabled() && RG.postsHtml ? RG.postsHtml(gSpot(x)) : "") +   // v134: みんなの補足（コメント・写真・いいね）
    '<p class="grv__manner">🙏 お参りのマナー: 静かに。墓石や柵にはさわらない・のぼらない。ほかの方のお墓も写らないよう、写真は控えめに。お寺の開門時間を守りましょう。</p>' +
    '<div class="wls"><a class="wl wl--w" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(x.wp) + '" target="_blank" rel="noopener">📖 Wikipedia</a>' +
      '<a class="wl" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(x.n.replace(/（.*?）/g, "") + " 歴史") + '" target="_blank" rel="noopener">▶️ 動画をさがす</a></div>' +
    '<div class="whs__nav">' + (i > 0 ? '<button class="whs__b" type="button" data-to="' + esc(all[i - 1].id) + '">‹ ' + esc(all[i - 1].n.replace(/（.*?）/g, "")) + "</button>" : "<span></span>") +
      (i < all.length - 1 ? '<button class="whs__b" type="button" data-to="' + esc(all[i + 1].id) + '">' + esc(all[i + 1].n.replace(/（.*?）/g, "")) + " ›</button>" : "") + "</div>" +
    '<details class="grv__all"><summary>🪦 偉人の墓 100（時代順）</summary>' + listHtml(x) + "</details>" +
    '<p class="src">解説は当サイトの手書き（定説にもとづく。«〜といわれます・伝わります» は言い伝えや諸説のあるもの）。肖像・写真は Wikipedia の記事の画像（ライセンスは各ファイルのページ）。' +
      "お墓の位置はおおよそ。同じ人のお墓が複数あるときは代表的な1か所です。</p></div>";
  var m = RG.openModal("🪦 " + x.n.replace(/（.*?）/g, "") + " のお墓", html);
  bindCommon(m, x);
  loadImg(m, x.imgwp || x.wp);
  if (RG.postsEnabled && RG.postsEnabled() && RG.postsBind) RG.postsBind(m, gSpot(x));
  if (RG.track) try { RG.track("grave", x.id); } catch (e) {}
};
function bindCommon(m, x, era) {
  m.querySelectorAll("[data-to]").forEach(function (b) { b.addEventListener("click", function () { RG.showGrave(b.getAttribute("data-to")); }); });
  var f = m.querySelector("[data-gfly]");
  if (f && x) f.addEventListener("click", function () {
    RG.closeModal(); RG.Map.gotoLatLng(x.la, x.lo, 60);
    if (RG.tripStatus) RG.tripStatus("🪦 " + esc(x.n) + "（" + esc(x.grave) + "）", "info", 5000);
  });
  var h = m.querySelector("[data-ghist]");
  if (h) h.addEventListener("click", function () { RG.histOpen({ era: h.getAttribute("data-ghist") }); });
  var g = m.querySelector("[data-gmap]");
  if (g) g.addEventListener("click", function () { RG.graveShowMap(g.getAttribute("data-gmap") || null); });
}
/* れきし地図の窓に、まとめて出す（heId: れきし地図の時代 id、または表示用の時代名、null=全員） */
RG.graveShowMap = function (key) {
  ensure(function () {
    var L = G().filter(function (x) { return !key || x.he === key || x.era === key; });
    if (!L.length || !RG.histShowPoints) return;
    var c = key && ERA_C[key] ? ERA_C[key] : "#5D4037";
    RG.histShowPoints("🪦 偉人の墓" + (key ? "（" + L.length + "人）" : " 100"), L.map(function (x) { return [x.n.replace(/（.*?）/g, "") + "（" + x.grave.replace(/（.*?）/g, "") + "）", x.la, x.lo]; }), c,
      L.map(function (x) { return x.id; }));
  });
};
var HAS = { asuka: 1, nara: 1, heian: 1, kamakura: 1, muromachi: 1, azuchi: 1, edo: 1, meiji: 1, taisho: 1, showa: 1 };
RG.graveCount = function (he) { return RG.GRAVES ? G().filter(function (x) { return x.he === he; }).length : HAS[he] ? -1 : 0; };
})(window.RG);
