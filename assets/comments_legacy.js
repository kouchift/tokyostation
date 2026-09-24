/* v108: バンドルに入れていた «カードのコメント欄»（commentsEnabled / commentsHtml / commentsBind）。
   assets/comments.js は 2026-09-24 に別の作りへ書き換わり、index.html から単独で読まれている。
   カード（plannerui.js）は今もこちらの関数を呼ぶので、バンドルにはこのファイルを入れる（中身は GitHub 361859af 時点の comments.js）。 */
/* =========================================================================
   v106: スポットの «みんなのコメント»（投稿 → Google スプレッドシート → 管理者が公開 → 表示）
   ・受け皿は Google Apps Script の Web アプリ（tools/comments_api.gs）。URL は data/support.js の RG.TIP.commentsApi
   ・投稿はいったん status=pending。管理者がシートで published に変えたものだけ表示する（rejected は表示しない）
   ・spot_id はスポット名に依らない（種類 + 座標から作る RG.spotId）。名前が変わっても結びつきは壊れない
   ・コメント本文は必ずテキストとして描く（esc）。HTML として解釈しない
   ・取得は «カードを開いたとき» だけ。10 分はメモリと sessionStorage に持つ。失敗してもカード本体は出る
   ・受け皿が未設定なら、このセクションは «準備中» の 1 行だけ（従来の «行った人の声» を出す。plannerui.js 参照）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var MAX_COMMENT = 300, MAX_NICK = 20, PAGE = 5, FETCH = 30, TTL = 10 * 60 * 1000, MIN_GAP = 60 * 1000;
var mem = {};   // spot_id → { t, items, total }

function api() { return (RG.TIP && RG.TIP.commentsApi) || ""; }
RG.commentsEnabled = function () { return !!api(); };

/* ---- spot_id: 種類 + 緯度経度（小数 4 桁 ≒ 11m）の短いハッシュ。名前に依存しない ---- */
function h32(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
RG.spotId = function (p) {
  if (!p) return "";
  if (p.sid) return p.sid;
  var g = String(p.g || "spot").replace(/[^a-z0-9_]/gi, "").toLowerCase() || "spot";
  var la = (+p.la).toFixed(4), lo = (+p.lo).toFixed(4);
  return g + "-" + h32(la + "," + lo);
};

/* ---- 端末の印（投稿の連続制限用。個人を特定しない） ---- */
function vid() { try { var v = localStorage.getItem("tsg.vid"); if (!v) { v = "v" + Math.random().toString(36).slice(2, 10); localStorage.setItem("tsg.vid", v); } return v; } catch (e) { return "anon"; } }
function lastNick() { try { return localStorage.getItem("tsg.cm.nick") || ""; } catch (e) { return ""; } }
function rememberNick(n) { try { if (n) localStorage.setItem("tsg.cm.nick", n); } catch (e) {} }
function lastPost() { try { return +localStorage.getItem("tsg.cm.last") || 0; } catch (e) { return 0; } }
function markPost() { try { localStorage.setItem("tsg.cm.last", String(Date.now())); } catch (e) {} }

/* ---- 取得（キャッシュつき） ---- */
function cacheGet(id) {
  var c = mem[id]; if (c && Date.now() - c.t < TTL) return c;
  try { var s = sessionStorage.getItem("tsg.cm." + id); if (s) { c = JSON.parse(s); if (c && Date.now() - c.t < TTL) { mem[id] = c; return c; } } } catch (e) {}
  return null;
}
function cacheSet(id, items, total) { var c = { t: Date.now(), items: items, total: total }; mem[id] = c; try { sessionStorage.setItem("tsg.cm." + id, JSON.stringify(c)); } catch (e) {} }
function fetchComments(id, cb) {
  var c = cacheGet(id); if (c) { cb(null, c); return; }
  var u = api() + (api().indexOf("?") >= 0 ? "&" : "?") + "action=comments&spot_id=" + encodeURIComponent(id) + "&limit=" + FETCH;
  var done = false, timer = setTimeout(function () { if (!done) { done = true; cb(new Error("timeout")); } }, 12000);
  fetch(u, { method: "GET", credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
    if (done) return; done = true; clearTimeout(timer);
    if (!j || !j.ok || !Array.isArray(j.items)) { cb(new Error("bad")); return; }
    cacheSet(id, j.items, j.total == null ? j.items.length : +j.total); cb(null, mem[id]);
  }).catch(function (e) { if (done) return; done = true; clearTimeout(timer); cb(e); });
}
function postComment(body, cb) {
  /* Content-Type を付けない（text/plain 扱い）＝ プリフライト無しで Apps Script に届く */
  fetch(api(), { method: "POST", body: JSON.stringify(body), credentials: "omit", redirect: "follow" })
    .then(function (r) { return r.json(); }).then(function (j) { cb(j && j.ok ? null : new Error((j && j.error) || "bad"), j); })
    .catch(function (e) { cb(e); });
}

/* ---- 描画 ---- */
function stars(n) { n = +n || 0; if (n < 1 || n > 5) return ""; var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆"; return '<span class="cm__st" aria-label="評価 ' + n + '／5">' + s + "</span>"; }
function dstr(s) { if (!s) return ""; var m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); return m ? m[1] + "年" + (+m[2]) + "月" + (m[3] ? +m[3] + "日" : "") : ""; }
function item(c) {
  return '<li class="cm__i">' + stars(c.rating) +
    '<p class="cm__tx">' + esc(c.comment || "") + "</p>" +
    '<small class="cm__by">— ' + esc((c.nickname || "").trim() || "匿名") + "さん" + (c.visit_date ? "・" + esc(dstr(c.visit_date)) + "に訪問" : "") + "</small></li>";
}
function listHtml(c, shown) {
  if (!c.items.length) return '<p class="mm__empty">まだコメントはありません。<br>最初の感想を投稿してみませんか？</p>';
  var xs = c.items.slice(0, shown);
  return '<ul class="cm__ls">' + xs.map(item).join("") + "</ul>" +
    (c.items.length > shown ? '<button type="button" class="cm__more">もっと見る（あと ' + (c.items.length - shown) + " 件）</button>" : "");
}
RG.commentsHtml = function (p) {
  var id = RG.spotId(p);
  return '<section class="sec sec--memo sec--cm" data-cm="' + esc(id) + '"><h3>みんなのコメント <small class="cm__n"></small></h3>' +
    '<div class="cm__list"><p class="mm__empty cm__loading">読み込んでいます…</p></div>' +
    '<p class="cm__ask">このスポットに行ったことがありますか？</p>' +
    '<button type="button" class="mm__open cm__open">感想を残す</button>' +
    '<form class="mm__f cm__f" hidden autocomplete="off">' +
      '<label class="mm__l">実際に行ってみた感想を教えてください<textarea class="mm__ta" name="comment" maxlength="' + MAX_COMMENT + '" rows="3" required placeholder="例：休日の夕方に行ったら意外と空いていました"></textarea><span class="mm__cnt">0/' + MAX_COMMENT + "</span></label>" +
      '<div class="cm__row"><label class="mm__l">ニックネーム（任意）<input class="mm__in" name="nickname" maxlength="' + MAX_NICK + '" value="' + esc(lastNick()) + '" placeholder="匿名"></label>' +
      '<label class="mm__l">評価（任意）<select class="mm__in" name="rating"><option value="">—</option><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select></label>' +
      '<label class="mm__l">訪問日（任意）<input class="mm__in" name="visit_date" type="month" max="2099-12"></label></div>' +
      '<input class="cm__hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="mm__go">投稿する</button>' +
      '<p class="src">電話番号・メールアドレス・住所などの個人情報は書かないでください。投稿は確認のうえ掲載します。</p></form>' +
    '<p class="cm__thanks" hidden></p></section>';
};

RG.commentsBind = function (root, p) {
  var sec = root.querySelector(".sec--cm"); if (!sec) return;
  var id = sec.dataset.cm, list = sec.querySelector(".cm__list"), n = sec.querySelector(".cm__n"), shown = PAGE;
  function render(c) {
    list.innerHTML = listHtml(c, shown); n.textContent = c.total ? c.total + " 件" : "";
    var more = list.querySelector(".cm__more"); if (more) more.addEventListener("click", function () { shown += PAGE; render(c); });
  }
  function load() {
    fetchComments(id, function (err, c) {
      if (err) { list.innerHTML = '<p class="mm__empty">現在、コメントを読み込めません。<br>しばらくしてからもう一度お試しください。</p>'; return; }
      render(c);
    });
  }
  load();   // このセクションは RG.TIP.commentsApi があるときだけ描かれる（plannerui.js）

  var ob = sec.querySelector(".cm__open"), f = sec.querySelector(".cm__f"), ta = f.querySelector(".mm__ta"), cnt = f.querySelector(".mm__cnt"), th = sec.querySelector(".cm__thanks");
  ob.addEventListener("click", function () { f.hidden = !f.hidden; ob.textContent = f.hidden ? "感想を残す" : "閉じる"; if (!f.hidden) ta.focus(); });
  ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/" + MAX_COMMENT; });
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var comment = ta.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, MAX_COMMENT);
    var nick = (f.querySelector('[name="nickname"]').value || "").trim().slice(0, MAX_NICK);
    var rating = f.querySelector('[name="rating"]').value || "", visit = f.querySelector('[name="visit_date"]').value || "";
    if (!comment) { RG.tripStatus && RG.tripStatus("感想を書いてください", "warn", 3000); ta.focus(); return; }
    if ((comment.match(/https?:\/\//g) || []).length > 1) { RG.tripStatus && RG.tripStatus("URL は 1 つまでにしてください", "warn", 3000); return; }
    if (f.querySelector(".cm__hp").value) return;                                            // ボット除け（人には見えない欄）
    var gap = Date.now() - lastPost(); if (gap < MIN_GAP) { RG.tripStatus && RG.tripStatus("続けて投稿するには " + Math.ceil((MIN_GAP - gap) / 1000) + " 秒お待ちください", "warn", 3000); return; }
    var go = f.querySelector(".mm__go"); go.disabled = true; go.textContent = "送信中…";
    postComment({ spot_id: id, spot_name: String(p.n || "").slice(0, 80), nickname: nick, comment: comment, rating: rating, visit_date: visit, vid: vid(), site: location.pathname }, function (err) {
      go.disabled = false; go.textContent = "投稿する";
      if (err) { RG.tripStatus && RG.tripStatus("送信できませんでした。通信状態を確かめて、もう一度お試しください。", "warn", 4000); return; }
      markPost(); rememberNick(nick); f.reset(); cnt.textContent = "0/" + MAX_COMMENT; f.hidden = true; ob.textContent = "感想を残す";
      th.hidden = false; th.innerHTML = "<b>ありがとうございます！</b>投稿内容を確認後、サイトに掲載します。<br><small>あなたの感想が、次にこの場所へ行く人の役に立ちます。</small>";
      RG.tripStatus && RG.tripStatus("投稿を受け付けました", "ok", 2000);
      if (RG.stat) { try { RG.stat("comment_post", p.n); } catch (e) {} }
    });
  });
};
})(window.RG);
