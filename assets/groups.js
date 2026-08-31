/* =========================================================================
   アイコンのグルーピング
   ―― ジャンルが40近くになり、絵文字の海から目的のものを探すのが
      つらくなってきた。«目的» でまとめ、2段で選べるようにする。
      「トイレはどこ」→ こまったとき → 🚻 の2タップで着く。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

/* 目的でまとめる。ここに載っていないジャンルは «そのほか» に入る */
var GROUPS = [
  { id: "see",   e: "👀", label: "見る・行く",   c: "#7B3FE4",
    ids: ["bunkazai", "history", "worship", "leisure", "museum", "park", "view", "landmark"] },
  { id: "help",  e: "🆘", label: "こまったとき", c: "#E53935",
    ids: ["toilet", "baby", "water", "hosp", "pharm", "aed", "shelter", "wifi", "civic", "library"] },
  { id: "eat",   e: "🍜", label: "食べる・買う", c: "#F0851E",
    ids: ["cvs", "food", "super", "drug", "disc", "life", "shopping"] },
  { id: "move",  e: "🚶", label: "移動する",     c: "#0079C2",
    ids: ["cycle", "locker", "bike", "camspot"] },
  { id: "money", e: "💰", label: "お金・手続き", c: "#00897B",
    ids: ["atm", "post", "corp"] },
  { id: "study", e: "🎓", label: "学ぶ",         c: "#5E35B1",
    ids: ["univ", "high", "library", "museum"] },
  { id: "fun",   e: "🎈", label: "楽しむ・休む", c: "#C2185B",
    ids: ["sento", "onsen", "sport", "dog", "camera", "event", "smoke", "adult"] }
];
RG.GENRE_GROUPS = GROUPS;

function genreOf(id) {
  return (RG.GENRES || []).filter(function (g) { return g.id === id; })[0];
}
function countOf(id) {
  return (RG.MAPPOI || []).filter(function (p) { return p.g === id; }).length;
}

/* いま選ばれているジャンル */
function cur() { return (RG.settings && RG.settings.genres) || []; }
function setGenres(list) {
  if (RG.settings) RG.settings.genres = list;
  if (RG.saveSettings) RG.saveSettings();
  if (RG.Map.setGenres) RG.Map.setGenres(list);
  if (RG.syncGroupBar) RG.syncGroupBar();
}
RG.setGenreList = setGenres;

/* ------------------------------------------------------ 上のグループバー */
RG.buildGroupBar = function () {
  var host = $("#groupbar");
  if (!host) return;
  var c = cur();
  var open = RG.__grpOpen || null;
  host.innerHTML =
    '<div class="gb__row">' +
      '<button class="gb__g' + (!c.length ? " on" : "") + '" type="button" data-grp="__all">' +
        '<span class="gb__e">🗺️</span><span class="gb__l">ぜんぶ</span></button>' +
      GROUPS.map(function (G) {
        var mine = G.ids.filter(function (i) { return c.indexOf(i) >= 0; }).length;
        return '<button class="gb__g' + (open === G.id ? " open" : "") + (mine ? " has" : "") +
          '" type="button" data-grp="' + G.id + '" style="--lc:' + G.c + '">' +
          '<span class="gb__e">' + G.e + "</span>" +
          '<span class="gb__l">' + esc(G.label) + "</span>" +
          (mine ? '<span class="gb__n">' + mine + "</span>" : "") + "</button>";
      }).join("") +
      '<button class="gb__g' + (c[0] === "__none__" ? " on" : "") + '" type="button" data-grp="__none">' +
        '<span class="gb__e">✕</span><span class="gb__l">なし</span></button>' +
    "</div>" +
    (open ? groupPanel(open) : "");
  $$("[data-grp]", host).forEach(function (b) {
    b.addEventListener("click", function () {
      var g = b.dataset.grp;
      if (g === "__all") { RG.__grpOpen = null; setGenres([]); RG.buildGroupBar(); return; }
      if (g === "__none") { RG.__grpOpen = null; setGenres(["__none__"]); RG.buildGroupBar(); return; }
      RG.__grpOpen = (RG.__grpOpen === g) ? null : g;
      RG.buildGroupBar();
    });
  });
  $$("[data-gid]", host).forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.gid, g = genreOf(id);
      // 見せる前に確認がいるものは、その案内を先に出す
      if (id === "adult" && RG.adultOn && !RG.adultOn()) { RG.showAdultGate(); return; }
      if (id === "smoke" && RG.hasSmokeTicket && !RG.hasSmokeTicket()) { RG.showTicket(); return; }
      if (g && !g.enabled) {
        RG.tripStatus("「" + g.label + "」はまだデータが取れていません（" +
          (g.reason || "") + "）", "info", 4200);
        return;
      }
      var c2 = cur().filter(function (x) { return x !== "__none__"; });
      var i = c2.indexOf(id);
      setGenres(i >= 0 ? c2.filter(function (x) { return x !== id; }) : c2.concat([id]));
      RG.buildGroupBar();
    });
  });
  var only = $("#gb-only", host);
  if (only) only.addEventListener("click", function () {
    var G = GROUPS.filter(function (x) { return x.id === RG.__grpOpen; })[0];
    if (!G) return;
    setGenres(G.ids.filter(function (i) { var g = genreOf(i); return g && g.enabled; }));
    RG.buildGroupBar();
  });
  var clr = $("#gb-clear", host);
  if (clr) clr.addEventListener("click", function () { setGenres([]); RG.buildGroupBar(); });
};
RG.syncGroupBar = function () { /* 選択が外から変わったときの再描画用 */ };

function groupPanel(gid) {
  var G = GROUPS.filter(function (x) { return x.id === gid; })[0];
  if (!G) return "";
  var c = cur();
  return '<div class="gb__panel" style="--lc:' + G.c + '">' +
    '<div class="gb__ph">' + G.e + " " + esc(G.label) +
      '<button class="gb__b" type="button" id="gb-only">これだけ表示</button>' +
      '<button class="gb__b" type="button" id="gb-clear">解除</button></div>' +
    '<div class="gb__items">' + G.ids.map(function (id) {
      var g = genreOf(id);
      if (!g) return "";
      var on = c.indexOf(id) >= 0;
      var n = countOf(id);
      return '<button class="gi' + (on ? " on" : "") + (g.enabled ? "" : " off") +
        '" type="button" data-gid="' + esc(id) + '" style="--lc:' + g.c + '">' +
        '<span class="gi__e">' + g.e + "</span>" +
        '<span class="gi__l">' + esc(g.label) + "</span>" +
        '<span class="gi__n">' + (g.enabled ? (n ? n : (g.optIn ? "▶" : "—")) : "—") + "</span>" +
        "</button>";
    }).join("") + "</div>" +
    '<p class="gb__d">アイコンを押すと、そのジャンルだけが地図に残ります（いくつでも選べます）。</p>' +
    "</div>";
}


/* -------------------------------------------------- くらしの施設のカード */
RG.showOsm10 = function (p) {
  var r = p.osm10, M = (RG.OSM10_META || {})[p.gid] || {};
  var near = RG.nearestStation ? RG.nearestStation(p.la, p.lo) : null;
  function row(k, v, s2) {
    if (!v) return "";
    return '<div class="smkr"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></div>";
  }
  var html = '<div class="smk">' +
    '<div class="smk__hd" style="--lc:' + (M.c || "#888") + '">' +
      '<span class="smk__e">' + (M.e || "📍") + "</span>" +
      "<div><h3>" + esc(p.n) + '</h3><p class="smk__k">' + esc(M.label || "") + "</p></div></div>" +
    (M.desc ? '<p class="smk__d">' + esc(M.desc) + "</p>" : "") +
    '<div class="smkg">' +
      row("🕐 営業時間", r.open) +
      row("🏢 運営", r.oper) +
      row("📞 電話", r.phon) +
      row("💰 料金", r.fee === "yes" ? "かかります" : r.fee === "no" ? "かかりません" : r.fee) +
      row("🚑 救急", r.emer === "yes" ? "対応しています" : r.emer === "no" ? "対応していません" : "") +
      row("🚲 台数", r.capa) +
      row("🏅 種目", r.spor) +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
    "</div>" +
    (r.phon ? '<a class="wl wl--o wl--full" href="tel:' + esc(r.phon.replace(/[^0-9+]/g, "")) +
      '"><span class="wl__e">📞</span>この番号にかける</a>' : "") +
    RG.outLinks({ site: r.webs, map: p.la + "," + p.lo, news: p.n }) +
    (RG.mapButtons ? RG.mapButtons(RG.Trip.origin, [p.la, p.lo], "walk", "地図アプリで行きかたを見る") : "") +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。' +
    (M.all ? "この種類は23区内に約" + M.all + "件ありますが、地図が見やすいように間引いて出しています。" : "") +
    "営業時間や料金は変わることがあります。行く前に公式情報をご確認ください。</p></div>";
  RG.openModal((M.e || "📍") + " " + p.n, html);
};

})(window.RG);
