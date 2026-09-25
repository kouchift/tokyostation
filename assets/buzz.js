/* =========================================================================
   SNS でバズった投稿を、場所から／一覧から追う  v71〜

   ■ 単位
     都道府県ごとに1つの «話題の山» を地図に置く（東京都だけは23区ごと）。押すとその土地の一覧。
     一覧の土地の並びは、いつも 練馬区 が先頭。
   ■ 鮮度と殿堂（飽きさせない仕掛け）
     鮮度枠: 投稿日から FRESH_DAYS 日以内のもの。並びは «日替わり» でシャッフル（同じ日は同じ並び）。
     殿堂枠: 日数が過ぎても imp（インパクト）が EVERGREEN_MIN 以上なら残る。並びは «週替わり»。
     それ以外は自動的に一覧から落ちる（データを消す必要はない）。
   ■ 埋め込み
     投稿の中身は «見る» を押したときだけ読み込む（X の公式ウィジェット）。押すまで外部通信なし。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var META = function () { return RG.BUZZ_META || { FRESH_DAYS: 21, EVERGREEN_MIN: 4, FRESH_SHOW: 24, EVER_SHOW: 12, TOP: "練馬区" }; };
var PL = { x: { e: "𝕏", n: "X" }, tiktok: { e: "🎵", n: "TikTok" }, ig: { e: "📸", n: "Instagram" } };

/* 種つきの乱数（同じ種なら同じ並び） */
function rng(seed) { var t = seed >>> 0; return function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, seed) { var r = rng(seed), o = a.slice(); for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; } return o; }
function dayNo() { return Math.floor(Date.now() / 864e5); }
function weekNo() { return Math.floor((dayNo() + 3) / 7); }
function ageDays(d) { return Math.floor((Date.now() - new Date(d + "T00:00:00+09:00").getTime()) / 864e5); }
function areaOf(b) { return b.pf === "東京都" && b.w ? b.w : b.pf; }
function centerOf(b) {
  if (b.pf === "東京都" && b.w && RG.WARD_CENTER && RG.WARD_CENTER[b.w]) return RG.WARD_CENTER[b.w];
  if (RG.PREF_CENTER && RG.PREF_CENTER[b.pf]) return RG.PREF_CENTER[b.pf];
  return [b.la, b.lo];
}

/* いま見せる2枠を計算する（毎回計算しても軽い） */
RG.buzzLists = function () {
  var M = META(), all = RG.BUZZ || [], fresh = [], ever = [];
  all.forEach(function (b) {
    var age = ageDays(b.d);
    if (age <= M.FRESH_DAYS) fresh.push(b);
    else if ((b.imp || 0) >= M.EVERGREEN_MIN) ever.push(b);
  });
  // 鮮度枠：新しい順を基本に、日替わりで少し入れ替える（上位ほど動かない）
  fresh.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  fresh = shuffle(fresh.slice(0, 8), dayNo()).concat(fresh.slice(8));
  ever = shuffle(ever, weekNo());
  // 鮮度枠が細いときは、殿堂から «最近のもの» を借りて厚みを保つ（飽きさせないため）
  var borrow = [];
  if (fresh.length < 6) {
    var rest = all.filter(function (b) { return fresh.indexOf(b) < 0 && ever.indexOf(b) < 0; })
                  .sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    borrow = shuffle(rest.slice(0, 30), dayNo()).slice(0, 12 - fresh.length);
  }
  return { fresh: fresh, borrow: borrow, ever: ever, all: all };
};

/* 地図に «話題の山» を置く（土地ごとに1つ） */
RG.mergeBuzz = function () {
  if (!RG.BUZZ || RG.__buzzMerged) return; RG.__buzzMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  var L = RG.buzzLists(), live = L.fresh.concat(L.borrow, L.ever), byArea = {};
  live.forEach(function (b) { var a = areaOf(b); (byArea[a] = byArea[a] || []).push(b); });
  Object.keys(byArea).forEach(function (a, i) {
    var arr = byArea[a], c = centerOf(arr[0]), imp = Math.max.apply(null, arr.map(function (b) { return b.imp || 1; }));
    var newest = arr.slice().sort(function (x, y) { return x.d < y.d ? 1 : -1; })[0];
    RG.MAPPOI.push({ i: "bz" + i, n: "🔥 " + a + " の話題 " + arr.length + "件", la: c[0], lo: c[1], g: "buzz",
                     s: Math.min(5, 4 + imp * 0.2), ti: 0,   // どの引きぐあいでも出す（都道府県単位の目印）
                     t: newest.n, be: "🔥", bc: "#FF4500", buzz: a, sl: imp * 10 });
  });
};

/* 1件の行 */
function row(b, showArea) {
  var p = PL[b.pl] || PL.x, age = ageDays(b.d);
  return '<li class="bz__it' + (b.img ? " bz__it--img" : "") + '" data-id="' + esc(b.id) + '">' +
    (b.img ? '<img class="bz__img" src="' + esc(b.img) + '" alt="" loading="lazy" title="' + esc("場所の写真: " + (b.imgSrc || "") + "（Wikipedia）") + '">' : "") +
    '<div class="bz__body"><div class="bz__top"><span class="bz__pl bz__pl--' + esc(b.pl) + '">' + p.e + ' ' + p.n + '</span>' +
    '<span class="bz__d">' + esc(b.d) + (age <= 3 ? ' <b class="bz__new">NEW</b>' : "") + "</span>" +
    (showArea ? '<span class="bz__a">' + esc(areaOf(b)) + "</span>" : "") +
    '<span class="bz__imp" title="インパクト">' + "🔥".repeat(Math.max(1, Math.min(5, b.imp || 1))) + "</span></div>" +
    '<div class="bz__n">' + esc(b.n) + "</div>" +
    (b.by ? '<div class="bz__by">投稿: ' + esc(b.by) + "</div>" : "") +
    (b.ev ? '<div class="bz__ev">話題の根拠: ' + esc(b.ev) + (b.src ? ' <a href="' + esc(b.src) + '" target="_blank" rel="noopener">出典</a>' : "") + "</div>" : "") +
    '<div class="bz__act"><button class="bz__b" type="button" data-go="' + esc(b.id) + '">📍 地図で見る</button>' +
    '<button class="bz__b" type="button" data-emb="' + esc(b.id) + '">👀 投稿を見る</button>' +
    '<a class="bz__b bz__b--l" href="' + esc(b.url) + '" target="_blank" rel="noopener">↗ ' + p.n + ' で開く</a></div>' +
    '<div class="bz__emb" hidden></div></div></li>';
}

/* 一覧（土地の絞り込みつき） */
RG.showBuzz = function (area, tab) {
  var L = RG.buzzLists(), M = META();
  var areas = {}; L.all.forEach(function (b) { areas[areaOf(b)] = (areas[areaOf(b)] || 0) + 1; });
  var names = Object.keys(areas).sort(function (a, b) {
    if (a === M.TOP) return -1; if (b === M.TOP) return 1;
    var ta = /区$/.test(a), tb = /区$/.test(b); if (ta !== tb) return ta ? -1 : 1;   // 23区 → 都道府県
    return areas[b] - areas[a];
  });
  tab = tab || "fresh";
  var pool = tab === "fresh" ? L.fresh.concat(L.borrow) : tab === "ever" ? L.ever : L.all.slice().sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  var list = area ? pool.filter(function (b) { return areaOf(b) === area; }) : pool;
  var html = '<div class="bz">' +
    '<p class="bz__lead">X・TikTok・Instagram で話題になった投稿を、<b>土地ごと</b>に追えます。' +
    "鮮度枠は " + M.FRESH_DAYS + " 日で自動的に入れ替わり、インパクトの高いものだけ殿堂に残ります。並びは日替わり／週替わり。</p>" +
    '<div class="bz__tabs">' +
      ['fresh|🆕 いま話題 ' + (L.fresh.length + L.borrow.length), 'ever|🏆 殿堂 ' + L.ever.length, 'all|📚 すべて ' + L.all.length].map(function (s) {
        var k = s.split("|")[0]; return '<button class="bz__tab' + (k === tab ? " on" : "") + '" type="button" data-tab="' + k + '">' + s.split("|")[1] + "</button>"; }).join("") + "</div>" +
    '<div class="bz__areas"><button class="bz__ar' + (!area ? " on" : "") + '" type="button" data-area="">全国</button>' +
      names.map(function (a) { return '<button class="bz__ar' + (a === area ? " on" : "") + (a === M.TOP ? " top" : "") + '" type="button" data-area="' + esc(a) + '">' + (a === M.TOP ? "👑 " : "") + esc(a) + ' <small>' + areas[a] + "</small></button>"; }).join("") + "</div>" +
    (list.length ? '<ul class="bz__list">' + list.map(function (b) { return row(b, !area); }).join("") + "</ul>"
                 : '<p class="bz__none">この枠にはいま投稿がありません。「すべて」を見るか、日を置いてまたどうぞ。</p>') +
    '<p class="src">投稿は各SNSの公式埋め込みで表示します（押すまで読み込みません）。見出しは当サイトの要約で、本文の転載ではありません。' +
    "投稿者が削除すると見られなくなります。<b>「話題になった」の根拠</b>は各行に示した記事・まとめです。いいね数は公式APIが公開していないため載せていません。" +
    "左の写真は<b>その場所</b>の Wikipedia の画像で、投稿の画像ではありません。</p></div>";
  var m = RG.openModal("🔥 SNSで話題の場所" + (area ? " ― " + area : ""), html);
  m.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { RG.showBuzz(area, b.dataset.tab); }); });
  m.querySelectorAll("[data-area]").forEach(function (b) { b.addEventListener("click", function () { RG.showBuzz(b.dataset.area || null, tab); }); });
  m.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () {
    var it = byId(b.dataset.go); if (!it) return;
    RG.closeModal(); RG.Map.gotoLatLng(it.la, it.lo, 220);
    if (RG.tripStatus) RG.tripStatus("🔥 " + it.n + "（" + areaOf(it) + "）", "info", 5000);
  }); });
  m.querySelectorAll("[data-emb]").forEach(function (b) { b.addEventListener("click", function () {
    var it = byId(b.dataset.emb), box = b.closest(".bz__it").querySelector(".bz__emb"); if (!it || !box) return;
    box.hidden = false; embed(it, box); b.disabled = true;
  }); });
};
function byId(id) { return (RG.BUZZ || []).filter(function (b) { return b.id === id; })[0]; }

/* 公式の埋め込み（押したときだけ外部スクリプトを読む） */
var loaded = {};
function script(src, key, cb) {
  if (loaded[key]) { cb(); return; }
  var s = document.createElement("script"); s.src = src; s.async = true; s.onload = function () { loaded[key] = 1; cb(); };
  s.onerror = function () { cb(new Error("load")); }; document.head.appendChild(s);
}
function embed(b, box) {
  box.innerHTML = '<p class="bz__ld">読み込んでいます…</p>';
  if (b.pl === "x") {
    box.innerHTML = '<blockquote class="twitter-tweet" data-lang="ja" data-dnt="true"><a href="' + esc(b.url) + '">' + esc(b.url) + "</a></blockquote>";
    script("https://platform.twitter.com/widgets.js", "x", function (err) {
      if (window.twttr && twttr.widgets) twttr.widgets.load(box);
      else box.innerHTML += '<p class="bz__ld">埋め込みを読み込めませんでした。<a href="' + esc(b.url) + '" target="_blank" rel="noopener">X で開く</a></p>';
    });
  } else if (b.pl === "tiktok") {
    var id = (b.url.match(/video\/(\d+)/) || [])[1];
    box.innerHTML = id ? '<iframe class="bz__f" src="https://www.tiktok.com/embed/v2/' + id + '" allow="encrypted-media" allowfullscreen></iframe>'
                       : '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">TikTok で開く</a>';
  } else if (b.pl === "ig") {
    var u = b.url.replace(/\?.*$/, "").replace(/\/?$/, "/");
    box.innerHTML = '<iframe class="bz__f bz__f--ig" src="' + esc(u) + 'embed/" allowtransparency="true" allowfullscreen></iframe>';
  }
}

/* 画面下のレール「話題の場所」：いま見ている範囲（と、そのまわり）の話題を一覧に */
var railT = 0, lastKey = "";
RG.buzzRailRefresh = function (force) {
  var box = document.getElementById("lr-buzz"); if (!box) return;
  var pane = box.closest("[data-pane]"); if (pane && pane.hidden && !force) return;
  clearTimeout(railT);
  railT = setTimeout(function () {
    if (!RG.BUZZ || !RG.Map || !RG.Map.viewBox) { box.innerHTML = '<p class="bzr__none">話題のデータを読み込み中です…</p>'; return; }
    var vb = RG.Map.viewBox(), pad = vb.w * 0.5;
    var L = RG.buzzLists(), live = L.fresh.concat(L.borrow, L.ever), inv = [], near = [];
    var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    L.all.forEach(function (b) {
      if (b.x == null) { var P = RG.project(b.la, b.lo); b.x = P.x; b.y = P.y; }
      var inside = b.x > vb.x && b.x < vb.x + vb.w && b.y > vb.y && b.y < vb.y + vb.h;
      var around = b.x > vb.x - pad && b.x < vb.x + vb.w + pad && b.y > vb.y - pad && b.y < vb.y + vb.h + pad;
      if (inside) inv.push(b); else if (around) near.push(b);
    });
    var key = inv.map(function (b) { return b.id; }).join(",") + "|" + near.length;
    if (key === lastKey && !force) return; lastKey = key;
    inv.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    near.sort(function (a, b) { return Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy); });
    var list = inv.concat(near.slice(0, 8)), shown = list.slice(0, 20);
    function rowMini(b, far) {
      var p = PL[b.pl] || PL.x, hot = live.indexOf(b) >= 0;
      return '<button class="bzr__i' + (far ? " far" : "") + (b.img ? " bzr__i--img" : "") + '" type="button" data-bzid="' + esc(b.id) + '" title="' + esc(b.n) + '">' +
        (b.img ? '<img class="bzr__im" src="' + esc(b.img) + '" alt="" loading="lazy">' : '<span class="bzr__im bzr__im--ph">' + p.e + "</span>") +
        '<span class="bzr__d">' + esc(b.d.slice(5).replace("-", "/")) + "</span>" +
        '<span class="bzr__a">' + esc(areaOf(b)) + "</span>" +
        '<span class="bzr__n">' + (hot ? "🔥" : "🕰️") + " " + esc(b.n) + "</span>" +
        '<span class="bzr__p">' + p.e + "</span></button>";
    }
    box.innerHTML = '<div class="bzr__h">いま見ている範囲の話題 <b>' + inv.length + "</b>件" + (near.length ? "（近くにさらに " + near.length + "件）" : "") +
      ' <button class="lr__c" type="button" id="bzr-all">📚 一覧をひらく</button> <button class="lr__c" type="button" id="bzr-voice">🗣️ みんなの声</button></div>' +
      (shown.length ? '<div class="bzr__l">' + shown.map(function (b) { return rowMini(b, inv.indexOf(b) < 0); }).join("") + "</div>"
                    : '<p class="bzr__none">この範囲にはまだ話題がありません。地図を引くと近くの話題が出ます。</p>');
    var all = document.getElementById("bzr-all"); if (all) all.addEventListener("click", function () { RG.showBuzz(null, "fresh"); });
    var vc = document.getElementById("bzr-voice"); if (vc) vc.addEventListener("click", function () { if (RG.voiceList) RG.voiceList(); });
    box.querySelectorAll("[data-bzid]").forEach(function (el) { el.addEventListener("click", function () {
      var it = byId(el.dataset.bzid); if (!it) return;
      RG.Map.gotoLatLng(it.la, it.lo, 220);
      RG.showBuzz(areaOf(it), "all");
    }); });
  }, force ? 0 : 400);
};

/* ヘッダーのボタン */
RG.buzzBind = function () {
  var b = document.getElementById("btn-buzz");
  if (b && !b.__bz) { b.__bz = 1; b.addEventListener("click", function () { if (RG.ensureData) RG.ensureData(["buzz"]); RG.showBuzz(null, "fresh"); }); }
};
})(window.RG);
