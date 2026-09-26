/* =========================================================================
   v134: 都道府県別 «歴オタ図鑑»（超コア）
   ・データ: data/hk/index.js（RG.HK_INDEX: 都道府県コード → 名前・件数）と data/hk/<コード>.js（RG.HK[コード] = [カード…]）
     開いた県のぶんだけ読む（全国ぶんを一度に読まない）
   ・下の窓（れきし地図と同じ窓）に: 県の切り替え／時代・種類・ランク・並び・ことばで絞る／一覧（既読の印・制覇率）
     地図には、いま絞りこんだカードの場所に印。印を押すとカード
   ・カード: 写真ギャラリー（Wikipedia の記事の画像をまとめて）／ひとこと／物語／年表／人物／歴オタメモ／現地で見る／クイズ
             ／れきし地図・偉人の墓とのつながり／近くの図鑑カード（回遊）／みんなの写真と声（コメント・いいね）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, WAIT = {}, S = { pf: null, era: "", cat: "", rank: "", sort: "rank", q: "" };
var PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
var REGIONS = [["北海道・東北", 1, 7], ["関東", 8, 14], ["中部", 15, 23], ["近畿", 24, 30], ["中国", 31, 35], ["四国", 36, 39], ["九州・沖縄", 40, 47]];
var ERA_N = { kyuseki: "旧石器", jomon: "縄文", yayoi: "弥生", kofun: "古墳", asuka: "飛鳥", nara: "奈良", heian: "平安", kamakura: "鎌倉", muromachi: "室町・戦国",
  azuchi: "安土桃山", edo: "江戸", meiji: "明治", taisho: "大正", showa: "昭和", heisei: "平成", reiwa: "令和", myth: "神話" };
var ERA_ORD = Object.keys(ERA_N);
var RANK_N = { S: "S 超重要", A: "A 見る価値大", B: "B 通好み" };
function code(i) { return (i < 10 ? "0" : "") + i; }
function D(pf) { return (RG.HK && RG.HK[pf]) || []; }
function load(f, cb) {
  if (WAIT[f] === 1) { cb(); return; }
  if (WAIT[f]) { WAIT[f].push(cb); return; }
  WAIT[f] = [cb];
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = f + (v ? "?v=" + v : "");
  s.onload = function () { var w = WAIT[f]; WAIT[f] = 1; w.forEach(function (g) { try { g(); } catch (e) { console.error(e); } }); };
  s.onerror = function () { WAIT[f] = null; if (RG.tripStatus) RG.tripStatus("歴オタ図鑑のデータを読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
function idx(cb) { load("data/hk/index.js", cb); }
/* 既読（端末に保存） */
var READ = null;
function readSet() { if (READ) return READ; try { READ = JSON.parse(localStorage.getItem("tsg.hk.read") || "{}"); } catch (e) { READ = {}; } return READ; }
function markRead(id) { readSet()[id] = 1; try { localStorage.setItem("tsg.hk.read", JSON.stringify(READ)); } catch (e) {} }
function km(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; }

/* ---------------- 入口 ---------------- */
RG.hkOpen = function (pf) {
  idx(function () {
    var I = RG.HK_INDEX || {};
    pf = pf || S.pf || (function () { try { return localStorage.getItem("tsg.hk.pf"); } catch (e) { return null; } })() || "13";
    if (!I[pf]) { choosePref(); return; }
    S.pf = pf; try { localStorage.setItem("tsg.hk.pf", pf); } catch (e) {}
    load("data/hk/" + pf + ".js", function () { render(false); });
  });
};
function choosePref() {
  idx(function () {
    var I = RG.HK_INDEX || {};
    var html = '<div class="hkz"><p class="hkz__lead">歴史オタクのための、都道府県ごと 100 か所の «超コア» カード。物語・年表・人物・諸説・現地の見どころまで。<br>' +
      "47 都道府県 × 100 か所＝4,700 か所。県を選ぶと、その県のカードだけを読み込みます。</p>" +
      REGIONS.map(function (r) {
        var o = ""; for (var i = r[1]; i <= r[2]; i++) { var c = code(i), on = !!I[c];
          o += '<button class="hkz__pf' + (on ? " on" : "") + (c === S.pf ? " cur" : "") + '" type="button"' + (on ? ' data-hkpf="' + c + '"' : " disabled") + ">" + esc(PREFS[i - 1]) +
            "<small>" + (on ? I[c].c + " か所" : "準備中") + "</small></button>"; }
        return '<div class="hkz__rg"><b>' + esc(r[0]) + "</b><div>" + o + "</div></div>"; }).join("") + "</div>";
    var m = RG.openModal("🏯 歴オタ図鑑 ― 都道府県をえらぶ", html);
    m.querySelectorAll("[data-hkpf]").forEach(function (b) { b.addEventListener("click", function () { RG.hkOpen(b.getAttribute("data-hkpf")); }); });
  });
}
function filtered() {
  var q = S.q.trim();
  var L = D(S.pf).filter(function (x) {
    return (!S.era || x.era.indexOf(S.era) >= 0) && (!S.cat || x.cat === S.cat) && (!S.rank || x.rank === S.rank) &&
      (!q || (x.n + x.yomi + x.hook + x.ad + (x.who || []).map(function (w) { return w[0]; }).join("")).indexOf(q) >= 0);
  });
  var R = { S: 0, A: 1, B: 2 };
  L.sort(S.sort === "year" ? function (a, b) { return a.y - b.y; } : S.sort === "name" ? function (a, b) { return a.yomi < b.yomi ? -1 : 1; } :
    function (a, b) { return (R[a.rank] - R[b.rank]) || (a.y - b.y); });
  return L;
}
function chips(key, vals, label) {
  return '<div class="hkz__f"><span>' + label + "</span>" + ['<button type="button" class="hkz__c' + (!S[key] ? " on" : "") + '" data-hkf="' + key + '" data-v="">すべて</button>']
    .concat(vals.map(function (v) { return '<button type="button" class="hkz__c' + (S[key] === v[0] ? " on" : "") + '" data-hkf="' + key + '" data-v="' + esc(v[0]) + '">' + esc(v[1]) + "</button>"; })).join("") + "</div>";
}
function render(keep) {
  var all = D(S.pf), I = RG.HK_INDEX[S.pf], L = filtered(), rd = readSet();
  var eras = ERA_ORD.filter(function (e) { return all.some(function (x) { return x.era.indexOf(e) >= 0; }); }).map(function (e) { return [e, ERA_N[e]]; });
  var cats = {}; all.forEach(function (x) { cats[x.cat] = (cats[x.cat] || 0) + 1; });
  var nRead = all.filter(function (x) { return rd[x.id]; }).length;
  var html = '<div class="hkz">' +
    '<div class="hkz__top"><button class="hkz__chg" type="button" data-hkchg="1">🗾 ' + esc(I.n) + " ▾</button>" +
      '<span class="hkz__prog" title="読んだカード"><b style="width:' + Math.round(nRead / Math.max(1, all.length) * 100) + '%"></b><i>制覇 ' + nRead + " / " + all.length + "</i></span></div>" +
    '<input class="hkz__q" type="search" placeholder="🔎 ことば・人物・地名でさがす" value="' + esc(S.q) + '" data-hkq="1">' +
    chips("rank", Object.keys(RANK_N).map(function (k) { return [k, RANK_N[k]]; }), "ランク") +
    chips("era", eras, "時代") +
    chips("cat", Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (c) { return [c, c + " " + cats[c]]; }), "種類") +
    '<div class="hkz__f"><span>並び</span>' + [["rank", "重要な順"], ["year", "年代順"], ["name", "あいうえお順"]].map(function (s) {
      return '<button type="button" class="hkz__c' + (S.sort === s[0] ? " on" : "") + '" data-hksort="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>" +
    '<p class="hkz__n">' + L.length + " 件" + (L.length < all.length ? "（" + all.length + " 件中）" : "") + " ― 地図の印を押してもカードが開きます</p>" +
    '<ol class="hkz__list">' + L.map(function (x, i) {
      return '<li><button class="hkz__it' + (rd[x.id] ? " rd" : "") + '" type="button" data-hkc="' + esc(x.id) + '"><b class="hkz__rk hkz__rk--' + x.rank + '">' + x.rank + "</b>" +
        '<span class="hkz__t"><em>' + (i + 1) + "</em>" + esc(x.n) + (rd[x.id] ? ' <i class="hkz__ok">✔</i>' : "") + "</span>" +
        '<span class="hkz__m">' + esc(x.era.map(function (e) { return ERA_N[e]; }).join("・")) + "｜" + esc(x.cat) + "｜" + esc(x.ad) + "</span>" +
        '<span class="hkz__h">' + esc(x.hook) + "</span></button></li>"; }).join("") + "</ol>" +
    '<p class="src">解説は当サイトの手書き（定説にもとづく。«〜と伝わる»«諸説» はそう書いています）。位置はおおよそ。写真は Wikipedia・ウィキメディア・コモンズの画像（ライセンスは各ファイルのページ）。' +
      "見学の時間・公開の有無は各施設でご確認ください。</p></div>";
  RG.histCustom("🏯 " + esc(I.n) + " 歴オタ図鑑", html, L.map(function (x) { return [x.n.replace(/（.*?）/g, ""), x.la, x.lo]; }), "#6D4C41",
    function (i) { RG.hkCard(L[i].id); }, keep);
  CUR = L;
}
var CUR = [];
document.addEventListener("click", function (e) {
  var t = e.target; if (!t || !t.closest) return;
  var b;
  if ((b = t.closest("[data-hkc]"))) { e.preventDefault(); RG.hkCard(b.getAttribute("data-hkc")); return; }
  if ((b = t.closest("[data-hkf]"))) { S[b.getAttribute("data-hkf")] = b.getAttribute("data-v"); render(true); return; }
  if ((b = t.closest("[data-hksort]"))) { S.sort = b.getAttribute("data-hksort"); render(true); return; }
  if ((b = t.closest("[data-hkchg]"))) { choosePref(); return; }
});
var qT = null;
document.addEventListener("input", function (e) {
  if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-hkq")) return;
  S.q = e.target.value; clearTimeout(qT);
  qT = setTimeout(function () { render(true); var q = document.querySelector("[data-hkq]"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 350);
});

/* ---------------- 写真ギャラリー（Wikipedia の記事の画像をまとめて） ---------------- */
var GAL = {};
var SKIP = /(logo|icon|flag|map|symbol|emblem|seal|commons-|wikisource|wiktionary|question_book|ambox|edit-|disambig|red_pencil|folder|padlock|location|pictogram|kamon|sign|標識|route|^File:AH\d|^File:JP-|^File:Japanese_(national|route)|\.svg$|\.gif$)/i;
function galFetch(titles, cb) {
  var key = titles.join("|"); if (GAL[key]) { cb(GAL[key]); return; }
  var base = "https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1";
  var main = titles[0], rest = titles.slice(1);
  var p1 = fetch(base + "&generator=images&gimlimit=40&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=500&titles=" + encodeURIComponent(main))
    .then(function (r) { return r.json(); }).then(function (j) {
      var pg = (j.query && j.query.pages) || {};
      return Object.keys(pg).map(function (k) { return pg[k]; }).filter(function (p) {
        var ii = p.imageinfo && p.imageinfo[0]; return ii && /jpeg|png/.test(ii.mime) && ii.width >= 480 && ii.height >= 300 && !SKIP.test(p.title);
      }).map(function (p) { var ii = p.imageinfo[0]; return { src: ii.thumburl || ii.url, page: ii.descriptionurl, cap: p.title.replace(/^(File|ファイル):/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " "), f: p.title }; });
    }).catch(function () { return []; });
  var p0 = fetch(base + "&prop=pageimages&piprop=thumbnail|name&pithumbsize=500&titles=" + encodeURIComponent(titles.join("|")))
    .then(function (r) { return r.json(); }).then(function (j) {
      var pg = (j.query && j.query.pages) || {};
      return Object.keys(pg).map(function (k) { return pg[k]; }).filter(function (p) { return p.thumbnail; })
        .map(function (p) { return { src: p.thumbnail.source, page: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(p.title), cap: p.title, f: "File:" + (p.pageimage || p.title), lead: 1 }; });
    }).catch(function () { return []; });
  Promise.all([p0, p1]).then(function (r) {
    var seen = {}, out = [];
    r[0].concat(r[1]).forEach(function (x) { var k = String(x.f).replace(/^(File|ファイル):/, "").replace(/ /g, "_"); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    GAL[key] = out.slice(0, 14); cb(GAL[key]);
  });
}
/* box: 置き場所。titles: 記事名（先頭が主）。pre: 前もって集めた写真 [[path,横,縦,説明], …]（v137: あれば API を呼ばずにすぐ出す） */
RG.wpGallery = function (box, titles, likeKey, pre) {
  titles = (titles || []).filter(Boolean); if (!box || (!titles.length && !(pre && pre.length))) return;
  if (pre && pre.length) { draw(pre.map(function (q) { var fn = decodeURIComponent(q[0].slice(2).split("/").pop()); return { p: q[0], ow: q[1], oh: q[2], cap: (q[3] || fn).replace(/\.[a-z]+$/i, "").replace(/_/g, " "), f: "File:" + fn, page: RG.wmPage(q[0]) }; })); return; }
  box.innerHTML = '<div class="hkg__ld">写真を集めています…</div>';
  galFetch(titles, draw);
  function draw(L) {
    if (!box.isConnected) return;
    if (!L.length) { box.remove(); return; }
    box.innerHTML = '<div class="hkg__rail">' + L.map(function (x, i) {
      var im = x.p && RG.wmImg ? RG.wmImg(x.p, 320, { ow: x.ow, oh: x.oh, eager: i < 2 }) :
        '<img src="' + esc(RG.wmNormalize ? RG.wmNormalize(x.src, 500) : x.src) + '" alt="" loading="' + (i < 2 ? "eager" : "lazy") + '" decoding="async" onerror="var f=this.closest(\'figure\');if(f)f.remove()">';
      return '<figure class="hkg__f"><a href="' + esc(x.page) + '" target="_blank" rel="noopener">' + im + "</a>" +
        '<figcaption>' + esc(x.cap.slice(0, 40)) + (likeKey && RG.likeBtn ? RG.likeBtn(likeKey, "g" + RG.hash16(x.f)) : "") + "</figcaption></figure>"; }).join("") + "</div>" +
      '<p class="hkg__n">📷 ' + L.length + " 枚 ― 横にすべらせて見る。押すと元のページ（撮影者・ライセンス）</p>";
    if (likeKey && RG.likeFill) RG.likeFill(box, likeKey);
  }
};

/* ---------------- カード ---------------- */
function byId(id) { var r = null; Object.keys(RG.HK || {}).some(function (pf) { return D(pf).some(function (x) { if (x.id === id) { r = x; return true; } }); }); return r; }
RG.hkCard = function (id) {
  var x = byId(id); if (!x) return;
  markRead(x.id);
  var L = CUR.length ? CUR : D(S.pf), i = L.indexOf(x);
  var near = D(S.pf).filter(function (y) { return y !== x; }).map(function (y) { return { y: y, d: km(x.la, x.lo, y.la, y.lo) }; })
    .filter(function (o) { return o.d < 1.6; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 6);
  var rel = x.rel || {}, H = RG.HIST && RG.HIST.ev || [];
  var evs = (rel.ev || []).map(function (e) { return H.filter(function (h) { return h.id === e; })[0] || { id: e, t: e }; });
  var P = { n: "🏯" + x.n.replace(/（.*?）/g, ""), la: x.la, lo: x.lo, pt: "💬 歴オタの補足（コメント・現地の写真）", ph: "補足・異説・現地で見つけたもの・おすすめの歩き方（300字まで）" };
  var html = '<div class="hkc">' +
    '<div class="hkc__gal" data-hkgal="1"></div>' +
    '<div class="hkc__hd"><span class="hkz__rk hkz__rk--' + x.rank + '">' + x.rank + "</span>" +
      '<h3 class="hkc__n">' + esc(x.n) + "<small>" + esc(x.yomi) + "</small></h3></div>" +
    '<p class="hp__hook">🤔 ' + esc(x.hook) + "</p>" +
    '<p class="hkc__meta">' + x.era.map(function (e) { return "<span>" + esc(ERA_N[e]) + "</span>"; }).join("") + "<span>" + esc(x.cat) + "</span>" +
      (x.sh ? '<span class="hkc__sh">🏛️ ' + esc(x.sh) + "</span>" : "") + "<span>📍 " + esc(x.ad) + "</span>" + (x.st ? "<span>🚉 " + esc(x.st) + "</span>" : "") + "</p>" +
    '<p class="hkc__lead">' + esc(x.lead) + "</p>" +
    '<h4 class="hkc__h">📖 物語</h4><div class="hkc__story">' + x.story.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div>" +
    (x.tl && x.tl.length ? '<h4 class="hkc__h">🕰️ 年表</h4><ol class="hkc__tl">' + x.tl.map(function (t) { return "<li><b>" + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></li>"; }).join("") + "</ol>" : "") +
    (x.who && x.who.length ? '<h4 class="hkc__h">👤 登場人物</h4><div class="hkc__who">' + x.who.map(function (w) {
      return '<div><b>' + esc(w[0]) + "</b><span>" + esc(w[1]) + "</span></div>"; }).join("") + "</div>" : "") +
    '<div class="hkc__deep"><b>🔍 歴オタメモ（深掘り・諸説・細部）</b><ul>' + x.deep.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
    (x.look && x.look.length ? '<div class="hkc__look"><b>👀 現地で見るべきポイント</b><ul>' + x.look.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") +
    (x.koji && x.koji.length ? '<div class="hp__koji"><b>📜 故事成語・名言</b>' + x.koji.map(function (k) { return '<div class="hp__kj"><q>' + esc(k.w) + "</q><span>意味: " + esc(k.m) + "</span></div>"; }).join("") + "</div>" : "") +
    (x.q ? '<details class="eh__q"><summary>❓ クイズ: ' + esc(x.q[0]) + "<span>こたえを見る</span></summary><p>" + esc(x.q[1]) + "</p></details>" : "") +
    (x.myth ? '<p class="hkc__myth">⚠️ ' + esc(x.myth) + "</p>" : "") +
    (evs.length || (rel.grave || []).length ? '<h4 class="hkc__h">🔗 つながり</h4><div class="whs__pts">' +
      evs.map(function (e) { return '<button class="grv__c" type="button" data-hkev="' + esc(e.id) + '">📜 ' + esc(String(e.t).split(" ―")[0]) + "<small>れきし地図</small></button>"; }).join("") +
      (rel.grave || []).map(function (g) { return '<button class="grv__c" type="button" data-grave="' + esc(g[0]) + '">🪦 ' + esc(g[1]) + "<small>偉人の墓</small></button>"; }).join("") + "</div>" : "") +
    (near.length ? '<h4 class="hkc__h">🚶 近くの図鑑カード（はしご歴散歩）</h4><div class="whs__pts">' + near.map(function (o) {
      return '<button class="grv__c" type="button" data-hkc="' + esc(o.y.id) + '">' + esc(o.y.n.replace(/（.*?）/g, "")) + "<small>" + (o.d < 1 ? Math.round(o.d * 1000) + "m" : o.d.toFixed(1) + "km") + "・歩いて約" + Math.max(1, Math.round(o.d * 1000 / 80)) + "分</small></button>"; }).join("") + "</div>" : "") +
    '<div class="grv__acts"><button class="grv__go" type="button" data-hkfly="1">📍 地図で見る</button>' +
      '<a class="grv__go grv__go--l" href="https://www.google.com/maps/search/?api=1&query=' + x.la + "," + x.lo + '" target="_blank" rel="noopener">🧭 行き方</a>' +
      '<a class="grv__go grv__go--l" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(x.wp || x.n) + '" target="_blank" rel="noopener">📖 Wikipedia</a></div>' +
    (RG.postsEnabled && RG.postsEnabled() && RG.postsHtml ? RG.postsHtml(P) : "") +
    '<div class="whs__nav">' + (i > 0 ? '<button class="whs__b" type="button" data-hkc="' + esc(L[i - 1].id) + '">‹ ' + esc(L[i - 1].n.replace(/（.*?）/g, "").slice(0, 12)) + "</button>" : "<span></span>") +
      (i >= 0 && i < L.length - 1 ? '<button class="whs__b" type="button" data-hkc="' + esc(L[i + 1].id) + '">' + esc(L[i + 1].n.replace(/（.*?）/g, "").slice(0, 12)) + " ›</button>" : "") + "</div>" +
    '<p class="src">解説は当サイトの手書き（定説にもとづく。«〜と伝わる»«諸説» はそう書いています）。位置はおおよそ。写真は Wikipedia・ウィキメディア・コモンズの画像（押すと撮影者・ライセンスのページ）。</p></div>';
  var m = RG.openModal("🏯 " + x.n.replace(/（.*?）/g, ""), html);
  RG.wpGallery(m.querySelector("[data-hkgal]"), [x.wp].concat(x.img || []), RG.postKey ? RG.postKey(P) : null, x.ph);   // v137: 前もって集めた写真
  var f = m.querySelector("[data-hkfly]");
  if (f) f.addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(x.la, x.lo, 50); if (RG.tripStatus) RG.tripStatus("🏯 " + esc(x.n), "info", 4000); });
  m.querySelectorAll("[data-hkev]").forEach(function (b) { b.addEventListener("click", function () { RG.histOpen({ ev: b.getAttribute("data-hkev") }); }); });
  if (RG.postsEnabled && RG.postsEnabled() && RG.postsBind) RG.postsBind(m, P);
  // 一覧の既読の印を更新（窓が開いていれば）
  var it = document.querySelector('.hkz__it[data-hkc="' + x.id + '"]'); if (it) it.classList.add("rd");
  if (RG.track) try { RG.track("hk", x.id); } catch (e) {}
};
/* ?hk=県コード または ?hk=カードid で開く */
RG.hkFromUrl = function () {
  var v; try { v = new URLSearchParams(location.search).get("hk"); } catch (e) { return; }
  if (!v) return;
  setTimeout(function () { if (/^\d\d$/.test(v)) RG.hkOpen(v); else { var pf = v.split("_")[0]; RG.hkOpen(/^\d\d$/.test(pf) ? pf : null); } }, 1200);
};
})(window.RG);
