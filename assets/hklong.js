/* =========================================================================
   v155: 歴オタ図鑑の «じっくり読む»（カード 1 枚ごとの長い読み物）
   ・中身: data/hk_long/<id>.js（RG.HKLONG[id]）。どのカードにあるかは data/hk_long/index.js（RG.HKLONG_IDX = {id: 読む分数}）
     作り方: tools/build_hklong.py が tools/hk_long_src/<id>.json（手書き）から画像の場所を調べて書き出す
   ・読む人: 中高生。むずかしい漢字は {漢字|かんじ} と書くと <ruby> のふりがなになる（RG.ruby）
   ・画像: 前もって調べた Commons の画像（ip = [path, 横, 縦]）を、標準の幅の小さい縮小版で読む（遅延読み込み）
   ・見出し・読んだスタンプは れきし地図の読み物（histlong.js）と同じ見た目（hl__ のクラス）を使う
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, LOADING = {};
function script(src, cb) {
  if (LOADING[src] === 1) { cb(); return; }
  if (LOADING[src]) { LOADING[src].push(cb); return; }
  LOADING[src] = [cb];
  var v = document.documentElement.getAttribute("data-build") || "", s = document.createElement("script"); s.async = true; s.src = src + (v ? "?v=" + v : "");
  s.onload = function () { var w = LOADING[src]; LOADING[src] = 1; w.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); };
  s.onerror = function () { LOADING[src] = null; if (RG.tripStatus) RG.tripStatus("読み物を読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
/* {漢字|かんじ} → ふりがな。先に esc してから（{ } | は esc で変わらない） */
RG.ruby = function (s) {
  return esc(s == null ? "" : String(s)).replace(/\{([^{}|]+)\|([^{}]+)\}/g, "<ruby>$1<rp>（</rp><rt>$2</rt><rp>）</rp></ruby>");
};
var rb = RG.ruby;
RG.hkLongIdx = function (cb) { if (RG.HKLONG_IDX) { cb(RG.HKLONG_IDX); return; } script("data/hk_long/index.js", function () { cb(RG.HKLONG_IDX || {}); }); };
/* 図鑑のカードに «じっくり読む» のボタンを差しこむ（カードを開いたときに hkzukan.js から呼ぶ） */
RG.hkLongBtn = function (m, id) {
  RG.hkLongIdx(function (I) {
    if (!I[id] || !m.isConnected || m.querySelector("[data-hkl]")) return;
    var at = m.querySelector(".hp__hook"); if (!at) return;
    var b = document.createElement("button"); b.className = "hl__cta"; b.type = "button"; b.setAttribute("data-hkl", id);
    b.innerHTML = "<b>📖 じっくり読む</b><span>約" + I[id] + "分・写真いっぱい・余談つき・ふりがなつき" + (done()[id] ? "・✔ 読んだ" : "") + "</span>";
    at.parentNode.insertBefore(b, at.nextSibling);
  });
};
var DONE = null;
function done() { if (DONE) return DONE; try { DONE = JSON.parse(localStorage.getItem("tsg.hkl.read") || "{}"); } catch (e) { DONE = {}; } return DONE; }
function setDone(id) { done()[id] = 1; try { localStorage.setItem("tsg.hkl.read", JSON.stringify(DONE)); } catch (e) {} }
function fig(ip, cap, cls) {
  if (!ip || !RG.wmImg) return "";
  return '<figure class="' + cls + '"><a href="' + esc(RG.wmPage(ip[0])) + '" target="_blank" rel="noopener">' + RG.wmImg(ip[0], 320, { ow: ip[1], oh: ip[2], sizes: "(max-width: 400px) 92vw, 320px" }) + "</a>" +
    (cap ? "<figcaption>" + rb(cap) + "</figcaption>" : "") + "</figure>";
}
function scrollParent(el) { while (el && el !== document.body) { var s = getComputedStyle(el).overflowY; if ((s === "auto" || s === "scroll") && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return null; }

RG.hkLong = function (id) {
  RG.hkLongIdx(function (I) {
    script("data/hk_long/" + id + ".js", function () {
      var x = RG.HKLONG && RG.HKLONG[id], c = RG.hkById ? RG.hkById(id) : null;
      if (!x) return;
      var ids = Object.keys(I).filter(function (k) { return k.slice(0, 2) === id.slice(0, 2); }), D = done();
      var nd = ids.filter(function (k) { return D[k]; }).length, name = x.t || (c ? c.n : id);
      var html = '<div class="hl hkl" style="--ec:#6D4C41">' +
        '<div class="hl__bar"><b data-hlbar></b></div>' +
        (x.hero ? fig(x.hero, x.heroc, "hkl__hero") : "") +
        '<p class="hl__meta">' + (c ? '<span style="background:#6D4C41">' + esc(c.rank) + " 級</span><span>" + esc(c.cat) + "</span><span>📍 " + esc(c.ad) + "</span>" : "") +
          "<span>⏱️ 約 " + (x.read || I[id] || 15) + " 分</span>" + (D[id] ? '<span class="hl__ok">✔ 読んだ</span>' : "") + "</p>" +
        '<h2 class="hl__t">' + rb(name) + "</h2>" +
        '<p class="hl__intro">' + rb(x.intro) + "</p>" +
        '<nav class="hl__toc"><b>もくじ</b>' + x.sec.map(function (s, k) { return '<a href="#" data-hlgo="' + k + '">' + (k + 1) + ". " + rb(s.h) + "</a>"; }).join("") + "</nav>" +
        x.sec.map(function (s, k) {
          return '<section class="hl__sec" data-hlsec="' + k + '"><h3><em>' + (k + 1) + "</em><span>" + rb(s.h) + "</span></h3>" +
            fig(s.ip, s.cap, "hkl__fig") +
            s.p.map(function (t) { return "<p>" + rb(t) + "</p>"; }).join("") +
            (s.z ? '<aside class="hkl__z"><b>☕ 余談</b><p>' + rb(s.z) + "</p></aside>" : "") + "</section>";
        }).join("") +
        (x.gal && x.gal.length ? '<h3 class="hl__h">📷 写真で見る</h3><div class="hkl__gal">' + x.gal.map(function (g) { return fig(g[0], g[1], "hkl__g"); }).join("") + "</div>" : "") +
        (x.num && x.num.length ? '<h3 class="hl__h">🔢 数字で見る</h3><div class="hl__num">' + x.num.map(function (n) { return "<div><b>" + rb(n[0]) + "</b><span>" + rb(n[1]) + "</span></div>"; }).join("") + "</div>" : "") +
        (x.who && x.who.length ? '<h3 class="hl__h">👤 登場人物</h3><div class="hl__who">' + x.who.map(function (w) {
          return '<div class="hl__wi">' + (w[4] && RG.wmImg ? '<figure class="hl__who-i"><a href="' + esc(RG.wmPage(w[4][0])) + '" target="_blank" rel="noopener">' + RG.wmImg(w[4][0], 56, { ow: w[4][1], oh: w[4][2], onerr: false }) + "</a></figure>" :
            '<figure class="hl__who-i hl__noimg"></figure>') + "<div><b>" + rb(w[0]) + "</b><span>" + rb(w[1]) + "</span>" +
            (w[3] ? '<button class="grv__c hkl__gv" type="button" data-grave="' + esc(w[3]) + '">🪦 お墓を見る</button>' : "") + "</div></div>"; }).join("") + "</div>" : "") +
        (x.now && x.now.length ? '<div class="hl__now"><b>🏠 いまにつながること</b><ul>' + x.now.map(function (t) { return "<li>" + rb(t) + "</li>"; }).join("") + "</ul></div>" : "") +
        (x.walk && x.walk.length ? '<div class="hkc__look"><b>👣 行ってみたら、ここを見よう</b><ul>' + x.walk.map(function (t) { return "<li>" + rb(t) + "</li>"; }).join("") + "</ul></div>" : "") +
        (x.words && x.words.length ? '<details class="hl__words"><summary>📚 ことばの意味（' + x.words.length + "）</summary><dl>" + x.words.map(function (w) { return "<dt>" + rb(w[0]) + "</dt><dd>" + rb(w[1]) + "</dd>"; }).join("") + "</dl></details>" : "") +
        (x.quiz && x.quiz.length ? '<h3 class="hl__h">❓ チャレンジクイズ</h3>' + x.quiz.map(function (q, k) {
          return '<div class="hl__q" data-hlq="' + k + '"><p>Q' + (k + 1) + ". " + rb(q[0]) + "</p><div>" + q[1].map(function (cc, j) { return '<button type="button" data-hlc="' + j + '">' + ["A", "B", "C", "D"][j] + ". " + rb(cc) + "</button>"; }).join("") + '</div><p class="hl__ans" hidden></p></div>'; }).join("") +
          '<p class="hl__score" data-hlscore hidden></p>' : "") +
        '<button class="hl__done' + (D[id] ? " on" : "") + '" type="button" data-hldone="1">' + (D[id] ? "✔ 読みました（" + nd + " / " + ids.length + " 本）" : "📗 読んだ！スタンプを押す") + "</button>" +
        (x.note ? '<p class="hkc__myth">⚠️ ' + rb(x.note) + "</p>" : "") +
        '<div class="grv__acts"><button class="grv__go" type="button" data-hkc="' + esc(id) + '">🏯 図鑑のカードへ戻る</button>' +
          (c && c.wp ? '<a class="grv__go grv__go--l" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(c.wp) + '" target="_blank" rel="noopener">📖 Wikipedia</a>' : "") + "</div>" +
        '<p class="src">読み物は当サイトの手書き（定説にもとづく。«〜といわれる»«諸説»«伝承» はそう書いています）。写真は ウィキメディア・コモンズ の画像を小さくして表示。押すと元のページへ（撮影者・ライセンスはそちら）。</p></div>';
      var m = RG.openModal("📖 " + String(name).replace(/（.*?）/g, "").replace(/\{([^{}|]+)\|[^{}]+\}/g, "$1"), html);
      m.classList.add("modal--hl");
      var body = m.querySelector(".hl"), scroller = scrollParent(body), bar = m.querySelector("[data-hlbar]");
      if (scroller && bar) scroller.addEventListener("scroll", function () {
        var r = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight); bar.style.width = Math.round(Math.min(1, r) * 100) + "%";
      }, { passive: true });
      m.querySelectorAll("[data-hlgo]").forEach(function (a) { a.addEventListener("click", function (ev) {
        ev.preventDefault(); var s = m.querySelector('[data-hlsec="' + a.getAttribute("data-hlgo") + '"]'); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
      var right = 0, answered = 0;
      m.querySelectorAll("[data-hlq]").forEach(function (qb) {
        var q = x.quiz[+qb.getAttribute("data-hlq")];
        qb.querySelectorAll("[data-hlc]").forEach(function (b) { b.addEventListener("click", function () {
          if (qb.__done) return; qb.__done = 1; answered++;
          var j = +b.getAttribute("data-hlc"), ok = j === q[2]; if (ok) right++;
          b.classList.add(ok ? "ok" : "ng"); qb.querySelector('[data-hlc="' + q[2] + '"]').classList.add("ok");
          var a = qb.querySelector(".hl__ans"); a.hidden = false; a.innerHTML = (ok ? "⭕ せいかい！ " : "❌ ざんねん… ") + rb(q[3]);
          if (answered === x.quiz.length) { var sc = m.querySelector("[data-hlscore]"); sc.hidden = false;
            sc.textContent = right === x.quiz.length ? "🎉 全問せいかい！ 歴オタへの一歩です" : "✏️ " + x.quiz.length + " 問中 " + right + " 問せいかい。もう一度読むと、きっとわかります"; }
        }); });
      });
      var d = m.querySelector("[data-hldone]");
      d.addEventListener("click", function () {
        setDone(id); var n2 = ids.filter(function (k) { return done()[k]; }).length;
        d.classList.add("on"); d.textContent = "✔ 読みました（" + n2 + " / " + ids.length + " 本）";
        if (RG.tripStatus) RG.tripStatus("📗 読破スタンプ " + n2 + " / " + ids.length, "info", 3500);
      });
      if (RG.track) try { RG.track("hklong", id); } catch (er) {}
    });
  });
};
document.addEventListener("click", function (ev) {
  var b = ev.target && ev.target.closest && ev.target.closest("[data-hkl]");
  if (b) { ev.preventDefault(); RG.hkLong(b.getAttribute("data-hkl")); }
});
})(window.RG);
