/* =========================================================================
   v135: れきし地図の大項目を «じっくり読む»（data/hist_long.js・58 件・1 件 約 2,700 字＝10 分ほど）
   歴史が苦手な人を «好き» にする入口。文字だけにしない:
   ・写真: 上にギャラリー、章ごとに小さな写真、登場人物の顔写真（Wikipedia の記事の画像をまとめて取る）
   ・目次／読んだ割合のバー／数字で見る／いまの暮らしとのつながり／もしも〜だったら？／ことば／3 択クイズ／読破スタンプ
   ・読んだ出来事は端末に覚える（«大項目 ○/58 読破»）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, WAIT = null, THUMB = {};
function ensure(cb) {
  if (RG.HIST_LONG) { cb(); return; }
  if (WAIT) { WAIT.push(cb); return; }
  WAIT = [cb];
  var v = document.documentElement.getAttribute("data-build") || "", s = document.createElement("script");
  s.async = true; s.src = "data/hist_long.js" + (v ? "?v=" + v : "");
  s.onload = function () { var w = WAIT; WAIT = null; w.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); };
  s.onerror = function () { WAIT = null; if (RG.tripStatus) RG.tripStatus("読み物を読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
var DONE = null;
function done() { if (DONE) return DONE; try { DONE = JSON.parse(localStorage.getItem("tsg.hist.read") || "{}"); } catch (e) { DONE = {}; } return DONE; }
function setDone(id) { done()[id] = 1; try { localStorage.setItem("tsg.hist.read", JSON.stringify(DONE)); } catch (e) {} }
RG.histLongDone = function (id) { return !!done()[id]; };
/* 小さな写真をまとめて取る（記事名 → サムネイル） */
function thumbs(titles, cb) {
  titles.forEach(function (t) {                                    // «File:…» はその画像をそのまま（記事に代表の画像が無いとき用）
    if (t && /^File:/.test(t) && THUMB[t] === undefined) { var f = t.slice(5); THUMB[t] = { src: "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=330", page: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f) }; }
  });
  var need = titles.filter(function (t) { return t && THUMB[t] === undefined; });
  if (!need.length) { cb(); return; }
  var chunks = []; for (var i = 0; i < need.length; i += 45) chunks.push(need.slice(i, i + 45));
  Promise.all(chunks.map(function (ch) {
    return fetch("https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=330&pilimit=50&titles=" + encodeURIComponent(ch.join("|")))
      .then(function (r) { return r.json(); }).then(function (j) {
        var q = j.query || {}, map = {};
        (q.normalized || []).concat(q.redirects || []).forEach(function (x) { map[x.from] = x.to; });
        var pg = {}; Object.keys(q.pages || {}).forEach(function (k) { pg[q.pages[k].title] = q.pages[k]; });
        ch.forEach(function (t) { var tt = map[map[t] || t] || map[t] || t, p = pg[tt]; THUMB[t] = p && p.thumbnail ? { src: p.thumbnail.source, page: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(tt) } : null; });
      }).catch(function () { ch.forEach(function (t) { if (THUMB[t] === undefined) THUMB[t] = null; }); });
  })).then(function () {
    // 記事に代表の画像が無いときは、その記事の中の写真を 1 枚さがす（1 記事ずつ・数は少ない）
    var miss = need.filter(function (t) { return THUMB[t] === null; }).slice(0, 12);
    return Promise.all(miss.map(function (t) {
      return fetch("https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&generator=images&gimlimit=30&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=330&titles=" + encodeURIComponent(t))
        .then(function (r) { return r.json(); }).then(function (j) {
          var pg = (j.query && j.query.pages) || {}, best = null;
          Object.keys(pg).forEach(function (k) { var p = pg[k], ii = p.imageinfo && p.imageinfo[0];
            if (ii && /jpeg|png/.test(ii.mime) && ii.width >= 300 && !/(logo|icon|flag|map|symbol|emblem|seal|commons-|question_book|ambox|edit-|pencil|location|pictogram|kamon|sign|\.svg$)/i.test(p.title) && (!best || ii.width * ii.height > best.a))
              best = { a: ii.width * ii.height, src: ii.thumburl || ii.url, page: ii.descriptionurl }; });
          if (best) THUMB[t] = { src: best.src, page: best.page };
        }).catch(function () {});
    }));
  }).then(cb);
}
function fillThumbs(root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-th]"), function (f) {
    var o = THUMB[f.getAttribute("data-th")], img = f.querySelector("img");
    if (!o) { if (f.classList.contains("hl__who-i")) { f.classList.add("hl__noimg"); } else f.remove(); return; }
    img.src = RG.wmNormalize ? RG.wmNormalize(o.src, f.classList.contains("hl__who-i") ? 120 : 330) : o.src; img.onerror = function () { f.remove(); };
    var a = f.querySelector("a"); if (a) a.href = o.page;
  });
}
RG.histLong = function (id) {
  ensure(function () {
    var x = RG.HIST_LONG && RG.HIST_LONG[id], H = RG.HIST, e = H && H.ev.filter(function (v) { return v.id === id; })[0];
    if (!x || !e) return;
    var E = H.eras.filter(function (r) { return r.id === e.era; })[0] || { n: "", c: "#6D4C41" };
    var lv1 = H.ev.filter(function (v) { return (v.lv || 1) === 1 && RG.HIST_LONG[v.id]; }).sort(function (a, b) { return a.y - b.y; });
    var i = lv1.indexOf(e), prev = lv1[i - 1], next = lv1[i + 1], D = done(), nd = lv1.filter(function (v) { return D[v.id]; }).length;
    var html = '<div class="hl" style="--ec:' + E.c + '">' +
      '<div class="hl__bar"><b data-hlbar></b></div>' +
      '<div class="hkc__gal hl__gal" data-hlgal="1"></div>' +
      '<p class="hl__meta"><span style="background:' + E.c + '">' + esc(E.n) + "</span><span>📅 " + esc(e.ys) + "</span>" + (e.gg ? "<span>🏷️ " + esc(e.gg) + "</span>" : "") +
        "<span>⏱️ 約 " + (x.read || 10) + " 分</span>" + (D[id] ? '<span class="hl__ok">✔ 読んだ</span>' : "") + "</p>" +
      '<h2 class="hl__t">' + esc(e.t) + "</h2>" +
      '<p class="hl__intro">' + esc(x.intro) + "</p>" +
      '<nav class="hl__toc"><b>もくじ</b>' + x.sec.map(function (s, k) { return '<a href="#" data-hlgo="' + k + '">' + (k + 1) + ". " + esc(s.h) + "</a>"; }).join("") + "</nav>" +
      x.sec.map(function (s, k) {
        return '<section class="hl__sec" data-hlsec="' + k + '"><h3><em>' + (k + 1) + "</em>" + esc(s.h) + "</h3>" +
          (s.ip && RG.wmImg ? '<figure class="hl__fig"><a href="' + esc(RG.wmPage(s.ip[0])) + '" target="_blank" rel="noopener">' + RG.wmImg(s.ip[0], 128, { ow: s.ip[1], oh: s.ip[2] }) + "</a>" + (s.cap ? "<figcaption>" + esc(s.cap) + "</figcaption>" : "") + "</figure>" :   // v137: 前もって集めた写真
           s.img ? '<figure class="hl__fig" data-th="' + esc(s.img) + '"><a target="_blank" rel="noopener"><img alt="" loading="lazy" decoding="async"></a>' + (s.cap ? "<figcaption>" + esc(s.cap) + "</figcaption>" : "") + "</figure>" : "") +
          s.p.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</section>";
      }).join("") +
      (x.num && x.num.length ? '<h3 class="hl__h">🔢 数字で見る</h3><div class="hl__num">' + x.num.map(function (n) { return "<div><b>" + esc(n[0]) + "</b><span>" + esc(n[1]) + "</span></div>"; }).join("") + "</div>" : "") +
      (x.who && x.who.length ? '<h3 class="hl__h">👤 登場人物</h3><div class="hl__who">' + x.who.map(function (w) {
        return '<div class="hl__wi">' + (w[3] && RG.wmImg ? '<figure class="hl__who-i"><a href="' + esc(RG.wmPage(w[3][0])) + '" target="_blank" rel="noopener">' + RG.wmImg(w[3][0], 56, { ow: w[3][1], oh: w[3][2], onerr: false }) + "</a></figure>" :
          '<figure class="hl__who-i" data-th="' + esc(w[2] || w[0]) + '"><a target="_blank" rel="noopener"><img alt="" loading="lazy" decoding="async"></a></figure>') + '<div><b>' + esc(w[0]) + "</b><span>" + esc(w[1]) + "</span></div></div>"; }).join("") + "</div>" : "") +
      (x.now && x.now.length ? '<div class="hl__now"><b>🏠 いまの暮らしとのつながり</b><ul>' + x.now.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") +
      (x.moshi ? '<div class="hl__moshi"><b>💭 もしも…？</b><p>' + esc(x.moshi) + "</p></div>" : "") +
      (e.koji && e.koji.length ? '<div class="hp__koji"><b>📜 故事成語・名言</b>' + e.koji.map(function (k) { return '<div class="hp__kj"><q>' + esc(k.w) + "</q><span>意味: " + esc(k.m) + "</span></div>"; }).join("") + "</div>" : "") +
      (x.words && x.words.length ? '<details class="hl__words"><summary>📚 ことばの意味（' + x.words.length + "）</summary><dl>" + x.words.map(function (w) { return "<dt>" + esc(w[0]) + "</dt><dd>" + esc(w[1]) + "</dd>"; }).join("") + "</dl></details>" : "") +
      (x.quiz && x.quiz.length ? '<h3 class="hl__h">❓ チャレンジクイズ</h3>' + x.quiz.map(function (q, k) {
        return '<div class="hl__q" data-hlq="' + k + '"><p>Q' + (k + 1) + ". " + esc(q[0]) + "</p><div>" + q[1].map(function (c, j) { return '<button type="button" data-hlc="' + j + '">' + ["A", "B", "C", "D"][j] + ". " + esc(c) + "</button>"; }).join("") + '</div><p class="hl__ans" hidden></p></div>'; }).join("") +
        '<p class="hl__score" data-hlscore hidden></p>' : "") +
      '<button class="hl__done' + (D[id] ? " on" : "") + '" type="button" data-hldone="1">' + (D[id] ? "✔ 読みました（大項目 " + nd + " / " + lv1.length + " 読破）" : "📗 読んだ！スタンプを押す") + "</button>" +
      (x.note ? '<p class="hkc__myth">⚠️ ' + esc(x.note) + "</p>" : "") +
      '<div class="grv__acts"><button class="grv__go" type="button" data-hlmap="1">🗺️ 地図で場所を見る</button>' +
        (e.wp ? '<a class="grv__go grv__go--l" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(e.wp) + '" target="_blank" rel="noopener">📖 Wikipedia</a>' : "") + "</div>" +
      (RG.postsEnabled && RG.postsEnabled() && RG.postsHtml ? RG.postsHtml(spot(e)) : "") +
      '<div class="whs__nav">' + (prev ? '<button class="whs__b" type="button" data-hlto="' + prev.id + '">‹ ' + esc(prev.t.split(" ―")[0].slice(0, 12)) + "</button>" : "<span></span>") +
        (next ? '<button class="whs__b" type="button" data-hlto="' + next.id + '">' + esc(next.t.split(" ―")[0].slice(0, 12)) + " ›</button>" : "") + "</div>" +
      '<p class="src">読み物は当サイトの手書き（定説にもとづく。«〜といわれる»«諸説»«伝承» はそう書いています）。写真は Wikipedia・ウィキメディア・コモンズの画像で、押すと元の記事へ（撮影者・ライセンスはそちら）。</p></div>';
    var m = RG.openModal("📖 " + e.t.split(" ―")[0], html);
    m.classList.add("modal--hl");
    var body = m.querySelector(".hl"), scroller = scrollParent(body);
    RG.wpGallery && RG.wpGallery(m.querySelector("[data-hlgal]"), [e.imgwp || e.wp, e.wp].filter(function (t, j, a) { return t && a.indexOf(t) === j; }), RG.postKey ? RG.postKey(spot(e)) : null, e.ph);
    thumbs(x.sec.filter(function (s) { return !s.ip; }).map(function (s) { return s.img; }).concat((x.who || []).filter(function (w) { return !w[3]; }).map(function (w) { return w[2] || w[0]; })), function () { if (body.isConnected) fillThumbs(body); });
    // 読んだ割合のバー
    var bar = m.querySelector("[data-hlbar]");
    if (scroller && bar) scroller.addEventListener("scroll", function () {
      var r = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight); bar.style.width = Math.round(Math.min(1, r) * 100) + "%";
    }, { passive: true });
    m.querySelectorAll("[data-hlgo]").forEach(function (a) { a.addEventListener("click", function (ev) {
      ev.preventDefault(); var s = m.querySelector('[data-hlsec="' + a.getAttribute("data-hlgo") + '"]'); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
    // クイズ
    var right = 0, answered = 0;
    m.querySelectorAll("[data-hlq]").forEach(function (qb) {
      var q = x.quiz[+qb.getAttribute("data-hlq")];
      qb.querySelectorAll("[data-hlc]").forEach(function (b) { b.addEventListener("click", function () {
        if (qb.__done) return; qb.__done = 1; answered++;
        var j = +b.getAttribute("data-hlc"), ok = j === q[2]; if (ok) right++;
        b.classList.add(ok ? "ok" : "ng"); qb.querySelector('[data-hlc="' + q[2] + '"]').classList.add("ok");
        var a = qb.querySelector(".hl__ans"); a.hidden = false; a.textContent = (ok ? "⭕ せいかい！ " : "❌ ざんねん… ") + q[3];
        if (answered === x.quiz.length) { var sc = m.querySelector("[data-hlscore]"); sc.hidden = false;
          sc.textContent = right === x.quiz.length ? "🎉 全問せいかい！ 歴史マスターへの一歩です" : "✏️ " + x.quiz.length + " 問中 " + right + " 問せいかい。もう一度読むと、きっとわかります"; }
      }); });
    });
    var d = m.querySelector("[data-hldone]");
    d.addEventListener("click", function () {
      setDone(id); var n2 = lv1.filter(function (v) { return done()[v.id]; }).length;
      d.classList.add("on"); d.textContent = "✔ 読みました（大項目 " + n2 + " / " + lv1.length + " 読破）";
      if (RG.tripStatus) RG.tripStatus(n2 === lv1.length ? "🏆 大項目をぜんぶ読破！ 歴史マスターです" : "📗 読破スタンプ " + n2 + " / " + lv1.length, "info", 3500);
    });
    m.querySelector("[data-hlmap]").addEventListener("click", function () { RG.histOpen({ ev: id }); });
    m.querySelectorAll("[data-hlto]").forEach(function (b) { b.addEventListener("click", function () { RG.histLong(b.getAttribute("data-hlto")); }); });
    if (RG.postsEnabled && RG.postsEnabled() && RG.postsBind) RG.postsBind(m, spot(e));
    if (RG.track) try { RG.track("histlong", id); } catch (er) {}
  });
};
function spot(e) { return { n: "📜" + e.t.split(" ―")[0], la: e.pts[0][1], lo: e.pts[0][2], pt: "💬 みんなの補足（コメント・写真）", ph: "この出来事への補足・知っていること・行ってみた感想（300字まで）" }; }
function scrollParent(el) { while (el && el !== document.body) { var s = getComputedStyle(el).overflowY; if ((s === "auto" || s === "scroll") && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return null; }
document.addEventListener("click", function (ev) {
  var b = ev.target && ev.target.closest && ev.target.closest("[data-hlong]");
  if (b) { ev.preventDefault(); RG.histLong(b.getAttribute("data-hlong")); }
});
})(window.RG);
