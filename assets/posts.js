/* =========================================================================
   v108: «みんなの写真と声» — スポットに写真（1 スポット最大 50 枚）とコメントを投稿・閲覧
   ・受け皿は Google Apps Script のウェブアプリ（tools/posts_api.gs）。URL は data/support.js の RG.TIP.postsApi
     未設定なら何も出さない（従来の «行った人の声» のまま）
   ・写真は端末の中で長辺 1600px の JPEG に縮めてから送る（大きすぎる写真もそのまま選んでよい）
   ・写真ごとにコメントを付けられる。投稿するときに名前（表示名）を入れる。名前は端末に覚えておく
   ・投稿者の名前を押すと、その人の投稿一覧（新しい順／古い順・都道府県で絞る・地図にピンで出す）
   ・投稿者は «端末ごとの印（uid）» で見分ける。同じ名前の別人と混ざらない（名前の後ろに #xxxx）
   ・本文・名前は必ずテキストとして描く（esc）。写真は Google ドライブのサムネイル URL で表示
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, $ = RG.$;
var MAX_PER_SPOT = 50, MAX_EDGE = 1600, THUMB = 400, QUALITY = 0.82, TTL = 5 * 60 * 1000;
var mem = {};                       // スポットの鍵 → { t, photos, comments }

function api() { return (RG.TIP && RG.TIP.postsApi) || ""; }
RG.postsEnabled = function () { return !!api(); };

/* ---- 鍵と自分の印 ---- */
RG.postKey = function (p) { return String(p.n || "").slice(0, 60) + "@" + (+p.la).toFixed(4) + "," + (+p.lo).toFixed(4); };
function uid() {
  try { var v = localStorage.getItem("tsg.uid"); if (!v) { v = "u" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6); localStorage.setItem("tsg.uid", v); } return v; }
  catch (e) { return "u" + Math.random().toString(36).slice(2, 14); }
}
RG.myUid = uid;
function nick() { try { return localStorage.getItem("tsg.cm.nick") || ""; } catch (e) { return ""; } }
function setNick(n) { try { if (n) localStorage.setItem("tsg.cm.nick", n); } catch (e) {} }
function tag(u) { return "#" + String(u || "").slice(-4); }
function prefOf(la, lo) { var p = RG.prefAt ? RG.prefAt(la, lo) : null; return p ? p.n : ""; }
function thumbUrl(f, w) { return /^https?:/.test(f) ? f : "https://drive.google.com/thumbnail?id=" + encodeURIComponent(f) + "&sz=w" + (w || THUMB); }   // http で始まるときはそのまま（手元の試験用の受け皿）
function fmtDate(s) { var d = new Date(s); return isNaN(d) ? "" : d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate(); }
function spotOf(p) { return { n: p.n, la: +p.la, lo: +p.lo, pf: prefOf(p.la, p.lo) }; }

/* ---- 通信 ---- */
function get(q) {
  return fetch(api() + (api().indexOf("?") >= 0 ? "&" : "?") + q, { redirect: "follow" }).then(function (r) { return r.json(); });
}
function post(body) {   // text/plain にしてプリフライト（OPTIONS）を避ける。Apps Script は OPTIONS に答えられない
  return fetch(api(), { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (!d || d.error) throw new Error((d && d.error) || "送れませんでした"); return d; });
}
function loadSpot(k, force) {
  var c = mem[k];
  if (c && !force && Date.now() - c.t < TTL) return Promise.resolve(c);
  return get("a=spot&k=" + encodeURIComponent(k)).then(function (d) {
    if (d.error) throw new Error(d.error);
    return (mem[k] = { t: Date.now(), photos: d.photos || [], comments: d.comments || [] });
  });
}

/* ---- 画像を縮める（向きは EXIF どおり・長辺 MAX_EDGE px・JPEG） ---- */
function shrink(file) {
  var make = window.createImageBitmap
    ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); })
    : new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(file); });
  return make.then(function (bm) {
    var w = bm.width, h = bm.height, s = Math.min(1, MAX_EDGE / Math.max(w, h));
    var cw = Math.round(w * s), ch = Math.round(h * s);
    var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cw, ch); cx.drawImage(bm, 0, 0, cw, ch);
    if (bm.close) bm.close();
    return { data: cv.toDataURL("image/jpeg", QUALITY), w: cw, h: ch, resized: s < 1, ow: w, oh: h };
  });
}

/* =========================================================== カードの枠 */
RG.postsHtml = function (p) {
  if (!RG.postsEnabled()) return "";
  return '<section class="pst" data-pst="1"><h3 class="pst__h">📷 みんなの写真と声 <span class="pst__n" data-pst-n></span></h3>' +
    '<div class="pst__grid" data-pst-grid><p class="pst__ld">読み込んでいます…</p></div>' +
    '<div class="pst__up">' +
      '<label class="pst__btn"><input type="file" accept="image/*" multiple hidden data-pst-file>📷 写真を投稿する（まとめて選べます）</label>' +
      '<p class="pst__note">大きな写真は自動で縮めて送ります（長辺 ' + MAX_EDGE + 'px）。1 スポット ' + MAX_PER_SPOT + ' 枚まで。ご自身で撮った写真だけにしてください。人の顔・車のナンバーが写るものは避けてください。</p>' +
      '<div class="pst__queue" data-pst-queue hidden></div>' +
    "</div>" +
    '<div class="pst__cm" data-pst-cm></div>' +
    '<form class="pst__form" data-pst-form>' +
      '<input class="pst__hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<input class="pst__name" name="name" maxlength="20" placeholder="名前（表示名）" value="' + esc(nick()) + '" required>' +
      '<textarea name="text" maxlength="300" rows="2" placeholder="このスポットへのひとこと（300字まで）" required></textarea>' +
      '<button class="pst__send" type="submit">💬 書きこむ</button><span class="pst__st" data-pst-st></span>' +
    "</form></section>";
};

function nameBtn(it) {
  return '<button type="button" class="pst__who" data-user="' + esc(it.uid) + '" data-uname="' + esc(it.name) + '">' + esc(it.name || "匿名") + '<i>' + esc(tag(it.uid)) + "</i></button>";
}
function renderSpot(root, p, d) {
  var grid = root.querySelector("[data-pst-grid]"), cm = root.querySelector("[data-pst-cm]"), n = root.querySelector("[data-pst-n]");
  var ph = d.photos.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  n.textContent = ph.length ? "（写真 " + ph.length + "／" + MAX_PER_SPOT + "）" : "";
  grid.innerHTML = ph.length ? ph.map(function (x, i) {
    var nc = d.comments.filter(function (c) { return c.pid === x.pid; }).length;
    return '<button type="button" class="pst__th" data-ph="' + i + '" title="' + esc((x.cap || "") + " — " + x.name) + '"><img src="' + esc(thumbUrl(x.f)) + '" alt="' + esc(x.cap || p.n) + '" loading="lazy">' + (nc ? "<i>💬" + nc + "</i>" : "") + "</button>";
  }).join("") : '<p class="pst__ld">まだ写真がありません。最初の 1 枚をどうぞ。</p>';
  var sc = d.comments.filter(function (c) { return !c.pid; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  cm.innerHTML = sc.length ? '<ul class="pst__list">' + sc.map(function (c) {
    return "<li>" + nameBtn(c) + '<span class="pst__dt">' + fmtDate(c.ts) + "</span><p>" + esc(c.text) + "</p></li>";
  }).join("") + "</ul>" : "";
  Array.prototype.forEach.call(grid.querySelectorAll("[data-ph]"), function (b) { b.addEventListener("click", function () { viewer(p, ph, +b.dataset.ph); }); });
  bindWho(root);
  // カード上の «自由に使える写真がありません» の枠を、投稿された写真で埋める
  var hole = document.querySelector(".modal .spotcard__ph");
  if (hole && ph.length && !hole.__pst) {
    hole.__pst = 1;
    hole.innerHTML = '<img class="spotcard__i" src="' + esc(thumbUrl(ph[0].f, 1000)) + '" alt="">' +
      '<span class="pst__credit">📷 ' + esc(ph[0].name) + " さんの投稿" + (ph.length > 1 ? "（ほか " + (ph.length - 1) + " 枚）" : "") + "</span>";
    hole.classList.add("spotcard__ph--user");
    hole.addEventListener("click", function () { viewer(p, ph, 0); });
  }
}
function bindWho(root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-user]"), function (b) {
    if (b.__w) return; b.__w = 1;
    b.addEventListener("click", function (e) { e.stopPropagation(); RG.showUser(b.dataset.user, b.dataset.uname); });
  });
}

RG.postsBind = function (m, p) {
  if (!RG.postsEnabled()) return;
  var root = m.querySelector("[data-pst]"); if (!root) return;
  var k = RG.postKey(p);
  // 写真が取れなかった枠に «写真を投稿» の入口
  var hole = m.querySelector(".spotcard__ph");
  if (hole && !hole.querySelector(".pst__cta")) {
    var cta = document.createElement("button"); cta.type = "button"; cta.className = "pst__cta"; cta.textContent = "📷 写真を投稿する";
    cta.addEventListener("click", function (e) { e.stopPropagation(); root.querySelector("[data-pst-file]").click(); });
    hole.appendChild(cta);
  }
  function refresh(force) {
    loadSpot(k, force).then(function (d) { if (document.body.contains(root)) renderSpot(root, p, d); })
      .catch(function () { root.querySelector("[data-pst-grid]").innerHTML = '<p class="pst__ld">写真を読み込めませんでした（通信を確かめてください）。</p>'; });
  }
  refresh(false);

  // 写真を選んだら: 名前を確認 → 1 枚ずつ縮めて送る
  root.querySelector("[data-pst-file]").addEventListener("change", function (ev) {
    var files = Array.prototype.slice.call(ev.target.files || []).filter(function (f) { return /^image\//.test(f.type); });
    ev.target.value = "";
    if (!files.length) return;
    var have = (mem[k] && mem[k].photos.length) || 0, room = MAX_PER_SPOT - have;
    var q = root.querySelector("[data-pst-queue]");
    if (room <= 0) { q.hidden = false; q.innerHTML = '<p class="pst__err">このスポットの写真は上限（' + MAX_PER_SPOT + " 枚）に達しています。</p>"; return; }
    if (files.length > room) files = files.slice(0, room);
    q.hidden = false;
    q.innerHTML = '<div class="pst__qh"><b>' + files.length + " 枚を投稿します</b>" + (files.length < ev.target.files.length ? "（上限まで残り " + room + " 枚）" : "") + "</div>" +
      '<input class="pst__name" data-q-name maxlength="20" placeholder="名前（表示名・必須）" value="' + esc(nick()) + '">' +
      '<input class="pst__cap" data-q-cap maxlength="200" placeholder="ひとこと（写真の説明・任意。全部の写真に付きます）">' +
      '<ol class="pst__ql">' + files.map(function (f, i) { return '<li data-qi="' + i + '"><span>' + esc(f.name) + '</span><em>' + (f.size / 1048576).toFixed(1) + "MB</em><b>待機中</b></li>"; }).join("") + "</ol>" +
      '<button type="button" class="pst__send" data-q-go>⬆️ 送る</button> <button type="button" class="pst__cancel" data-q-x>やめる</button>';
    q.querySelector("[data-q-x]").addEventListener("click", function () { q.hidden = true; q.innerHTML = ""; });
    q.querySelector("[data-q-go]").addEventListener("click", function () {
      var nm = q.querySelector("[data-q-name]").value.trim();
      if (!nm) { q.querySelector("[data-q-name]").focus(); return; }
      setNick(nm);
      var cap = q.querySelector("[data-q-cap]").value.trim(), go = this;
      go.disabled = true; go.textContent = "送っています…";
      var chain = Promise.resolve(), ok = 0;
      files.forEach(function (f, i) {
        chain = chain.then(function () {
          var li = q.querySelector('[data-qi="' + i + '"] b');
          li.textContent = "縮めています";
          return shrink(f).then(function (im) {
            li.textContent = (im.resized ? im.ow + "×" + im.oh + " → " : "") + im.w + "×" + im.h + " 送信中";
            return post({ a: "photo", k: k, spot: spotOf(p), uid: uid(), name: nm, cap: cap, img: im.data, w: im.w, h: im.h, hp: "" });
          }).then(function (r) { ok++; li.textContent = "✓ 完了"; li.parentNode.classList.add("ok"); if (mem[k]) mem[k].photos.push(r.photo); })
            .catch(function (e) { li.textContent = "✕ " + e.message; li.parentNode.classList.add("ng"); });
        });
      });
      chain.then(function () {
        go.textContent = ok + " 枚 投稿しました"; refresh(true);
        if (RG.tripStatus) RG.tripStatus("📷 写真を " + ok + " 枚 投稿しました", "ok", 3000);
      });
    });
  });

  // スポットへのコメント
  var form = root.querySelector("[data-pst-form]"), st = root.querySelector("[data-pst-st]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var nm = form.name.value.trim(), tx = form.text.value.trim();
    if (!nm || !tx) return;
    setNick(nm); st.textContent = "送っています…"; form.querySelector("button").disabled = true;
    post({ a: "comment", k: k, spot: spotOf(p), uid: uid(), name: nm, text: tx, pid: "", hp: form.hp.value })
      .then(function (r) { form.text.value = ""; st.textContent = "✓ 書きこみました"; if (mem[k]) mem[k].comments.push(r.comment); renderSpot(root, p, mem[k]); })
      .catch(function (er) { st.textContent = "✕ " + er.message; })
      .then(function () { form.querySelector("button").disabled = false; });
  });
};

/* =========================================================== 写真を大きく見る（写真ごとのコメント） */
function viewer(p, list, i) {
  var old = document.querySelector(".phv"); if (old) old.remove();
  var box = document.createElement("div"); box.className = "phv"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "写真");
  document.body.appendChild(box);
  var k = RG.postKey(p);
  function draw() {
    var x = list[i], d = mem[k] || { comments: [] };
    var cs = d.comments.filter(function (c) { return c.pid === x.pid; }).sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    box.innerHTML = '<div class="phv__in">' +
      '<div class="phv__img"><img src="' + esc(thumbUrl(x.f, MAX_EDGE)) + '" alt="' + esc(x.cap || p.n) + '"></div>' +
      '<div class="phv__side"><div class="phv__meta">' + nameBtn(x) + '<span class="pst__dt">' + fmtDate(x.ts) + "・" + (i + 1) + "／" + list.length + "</span></div>" +
        (x.cap ? '<p class="phv__cap">' + esc(x.cap) + "</p>" : "") +
        '<ul class="pst__list">' + (cs.length ? cs.map(function (c) { return "<li>" + nameBtn(c) + '<span class="pst__dt">' + fmtDate(c.ts) + "</span><p>" + esc(c.text) + "</p></li>"; }).join("") : '<li class="pst__ld">この写真へのコメントはまだありません。</li>') + "</ul>" +
        '<form class="pst__form" data-phv-form><input class="pst__hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<input class="pst__name" name="name" maxlength="20" placeholder="名前（表示名）" value="' + esc(nick()) + '" required>' +
          '<textarea name="text" maxlength="300" rows="2" placeholder="この写真へのコメント" required></textarea>' +
          '<button class="pst__send" type="submit">💬 コメントする</button><span class="pst__st" data-st></span></form>' +
        '<button type="button" class="phv__rep" data-rep>🚩 不適切な写真を報告</button>' +
      "</div></div>" +
      '<button class="phv__x" type="button" aria-label="閉じる">✕</button>' +
      (list.length > 1 ? '<button class="phv__n phv__n--p" type="button" aria-label="前の写真">‹</button><button class="phv__n phv__n--n" type="button" aria-label="次の写真">›</button>' : "");
    box.querySelector(".phv__x").addEventListener("click", close);
    var pv = box.querySelector(".phv__n--p"), nx = box.querySelector(".phv__n--n");
    if (pv) pv.addEventListener("click", function () { i = (i - 1 + list.length) % list.length; draw(); });
    if (nx) nx.addEventListener("click", function () { i = (i + 1) % list.length; draw(); });
    bindWho(box);
    box.querySelector("[data-rep]").addEventListener("click", function () {
      if (!confirm("この写真を「不適切」として報告しますか？（3 件で自動的に非表示になります）")) return;
      post({ a: "report", id: x.pid, uid: uid() }).then(function () { alert("報告しました。ありがとうございます。"); }).catch(function (e) { alert(e.message); });
    });
    var f = box.querySelector("[data-phv-form]"), st = f.querySelector("[data-st]");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = f.name.value.trim(), tx = f.text.value.trim(); if (!nm || !tx) return;
      setNick(nm); st.textContent = "送っています…";
      post({ a: "comment", k: k, spot: spotOf(p), uid: uid(), name: nm, text: tx, pid: x.pid, hp: f.hp.value })
        .then(function (r) { (mem[k] = mem[k] || { t: Date.now(), photos: list, comments: [] }).comments.push(r.comment); draw(); })
        .catch(function (er) { st.textContent = "✕ " + er.message; });
    });
  }
  function close() { box.remove(); document.removeEventListener("keydown", key); }
  function key(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight" && list.length > 1) { i = (i + 1) % list.length; draw(); }
    if (e.key === "ArrowLeft" && list.length > 1) { i = (i - 1 + list.length) % list.length; draw(); }
  }
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  document.addEventListener("keydown", key);
  draw();
}

/* =========================================================== 投稿者のページ */
var userState = { order: "new", pf: "" };
RG.showUser = function (u, name) {
  if (!RG.postsEnabled() || !u) return;
  var old = document.querySelector(".phv"); if (old) old.remove();
  var m = RG.openModal("👤 " + (name || "投稿者") + " " + tag(u), '<div class="usr"><p class="pst__ld">読み込んでいます…</p></div>');
  get("a=user&u=" + encodeURIComponent(u)).then(function (d) {
    if (d.error) throw new Error(d.error);
    var items = (d.photos || []).map(function (x) { return { type: "photo", x: x, ts: x.ts, pf: x.spot.pf || "", spot: x.spot, k: x.k }; })
      .concat((d.comments || []).map(function (c) { return { type: "comment", x: c, ts: c.ts, pf: c.spot.pf || "", spot: c.spot, k: c.k }; }));
    var latest = items.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })[0];
    var shownName = latest ? latest.x.name : name;
    var prefs = {}; items.forEach(function (it) { if (it.pf) prefs[it.pf] = (prefs[it.pf] || 0) + 1; });
    function draw() {
      var list = items.filter(function (it) { return !userState.pf || it.pf === userState.pf; })
        .sort(function (a, b) { return (a.ts < b.ts ? 1 : -1) * (userState.order === "new" ? 1 : -1); });
      var host = m.querySelector(".usr"); if (!host) return;
      var nPh = items.filter(function (it) { return it.type === "photo"; }).length;
      host.innerHTML = '<div class="usr__hd"><b>' + esc(shownName || "匿名") + "</b><i>" + esc(tag(u)) + "</i>" +
          '<span>写真 ' + nPh + " ・ コメント " + (items.length - nPh) + " ・ " + Object.keys(prefs).length + " 都道府県</span>" + (u === uid() ? '<em class="usr__me">あなたの投稿</em>' : "") + "</div>" +
        '<div class="usr__ctl">' +
          '<div class="seg" role="group" aria-label="並び順"><button type="button" data-ord="new" class="' + (userState.order === "new" ? "on" : "") + '">新しい順</button><button type="button" data-ord="old" class="' + (userState.order === "old" ? "on" : "") + '">古い順</button></div>' +
          '<select data-pf aria-label="都道府県で絞る"><option value="">すべての都道府県（' + items.length + "）</option>" +
            Object.keys(prefs).sort(function (a, b) { return prefs[b] - prefs[a]; }).map(function (k) { return '<option value="' + esc(k) + '"' + (userState.pf === k ? " selected" : "") + ">" + esc(k) + "（" + prefs[k] + "）</option>"; }).join("") + "</select>" +
          '<button type="button" class="pst__send" data-map>🗺️ この人の投稿を地図にピンで出す</button>' +
        "</div>" +
        (list.length ? '<ul class="usr__list">' + list.map(function (it, j) {
          var s = it.spot;
          return '<li><button type="button" class="usr__it" data-it="' + j + '">' +
            (it.type === "photo" ? '<img src="' + esc(thumbUrl(it.x.f, 200)) + '" alt="" loading="lazy">' : '<span class="usr__ic">💬</span>') +
            '<span class="usr__tx"><b>' + esc(s.n) + '</b><small>' + esc(it.pf || "") + " ・ " + fmtDate(it.ts) + (it.type === "comment" && it.x.pid ? " ・ 写真へのコメント" : "") + "</small>" +
            (it.type === "photo" ? (it.x.cap ? "<em>" + esc(it.x.cap) + "</em>" : "") : "<em>" + esc(it.x.text) + "</em>") + "</span></button></li>";
        }).join("") + "</ul>" : '<p class="pst__ld">この条件の投稿はありません。</p>');
      Array.prototype.forEach.call(host.querySelectorAll("[data-ord]"), function (b) { b.addEventListener("click", function () { userState.order = b.dataset.ord; draw(); }); });
      host.querySelector("[data-pf]").addEventListener("change", function (e) { userState.pf = e.target.value; draw(); });
      host.querySelector("[data-map]").addEventListener("click", function () {
        RG.closeModal();
        RG.postsMapUser(u, shownName, items.filter(function (it) { return !userState.pf || it.pf === userState.pf; }));
      });
      Array.prototype.forEach.call(host.querySelectorAll("[data-it]"), function (b) { b.addEventListener("click", function () { openSpot(list[+b.dataset.it]); }); });
    }
    draw();
  }).catch(function (e) { var h = m.querySelector(".usr"); if (h) h.innerHTML = '<p class="pst__err">読み込めませんでした: ' + esc(e.message) + "</p>"; });
};

/* 投稿のスポットを開く（地図のデータにあればそれ、無ければ投稿に残る名前と位置で仮のカード） */
function findSpot(k, s) {
  var hit = null;
  (RG.MAPPOI || []).some(function (p) { if (p.la != null && RG.postKey(p) === k) { hit = p; return true; } return false; });
  return hit || { i: "post:" + k, n: s.n, la: s.la, lo: s.lo, g: "userpost", s: 3, ti: 2, t: "投稿されたスポット", be: "📷", bc: "#7B1FA2" };
}
function openSpot(it) {
  var p = findSpot(it.k, it.spot);
  RG.closeModal();
  if (RG.Map && RG.Map.gotoLatLng) RG.Map.gotoLatLng(p.la, p.lo, 180);
  RG.showSpot(p);
}

/* =========================================================== その人の投稿だけを地図にピンで */
RG.userPostFilter = null;
var bar = null;
RG.postsMapUser = function (u, name, items) {
  RG.postsMapClear(true);
  var byK = {};
  items.forEach(function (it) { (byK[it.k] = byK[it.k] || { it: it, n: 0, ph: 0 }).n++; if (it.type === "photo") byK[it.k].ph++; });
  var keys = Object.keys(byK);
  if (!keys.length) return;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  keys.forEach(function (k) {
    var b = byK[k], s = b.it.spot, P = RG.project(s.la, s.lo);
    RG.MAPPOI.push({ i: "up:" + u + ":" + k, n: s.n, la: s.la, lo: s.lo, g: "userpost", s: 5, ti: 0, t: (name || "") + " さんの投稿 " + b.n + " 件",
                     be: b.ph ? "📷" : "💬", bc: "#7B1FA2", upUid: u, upKey: k, spotRef: s });
    x0 = Math.min(x0, P.x); y0 = Math.min(y0, P.y); x1 = Math.max(x1, P.x); y1 = Math.max(y1, P.y);
  });
  RG.userPostFilter = u;
  if (!bar) { bar = document.createElement("div"); bar.className = "upbar"; (document.querySelector(".mapwrap") || document.body).appendChild(bar); }
  bar.hidden = false;
  bar.innerHTML = '<span>👤 <b>' + esc(name || "投稿者") + "</b> " + esc(tag(u)) + " さんの投稿 " + keys.length + " か所を表示中</span>" +
    '<button type="button" data-up-list>一覧</button><button type="button" data-up-x aria-label="地図のしぼりこみを解除">✕ 解除</button>';
  bar.querySelector("[data-up-x]").addEventListener("click", function () { RG.postsMapClear(); });
  bar.querySelector("[data-up-list]").addEventListener("click", function () { RG.showUser(u, name); });
  if (RG.Map) {
    if (keys.length === 1) RG.Map.gotoLatLng(items[0].spot.la, items[0].spot.lo, 180);
    else RG.Map.fitBox(x0, y0, x1, y1, 1.3);
    if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
  }
};
RG.postsMapClear = function (quiet) {
  RG.userPostFilter = null;
  if (RG.MAPPOI) for (var j = RG.MAPPOI.length - 1; j >= 0; j--) if (RG.MAPPOI[j].upUid) RG.MAPPOI.splice(j, 1);
  if (bar) bar.hidden = true;
  if (!quiet && RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
};
/* 地図の印（userpost）を押したとき: 地図のデータに本物のスポットがあればそれを開く */
RG.postsResolve = function (p) { return p && p.upKey ? findSpot(p.upKey, p.spotRef) : p; };
})(window.RG);
