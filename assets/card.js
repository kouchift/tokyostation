/* =========================================================================
   シェアできるルートカード（1080×1080）  v79
   ・Canvas 2D で直接描く（外部ライブラリ不要・端末内だけ）。背景は純白、余白 72px
   ・上から: サイト名 24px #999 → 起点→終点 68〜72px 太字 #1A1A1A → 条件バッジ → 所要・乗換 34px #333
             → 一言 32px #222 行間1.5 最大2行（全角35字）→ 最下部に URL 26px #888 と応援文言 24px #AAA
   ・押した瞬間にスピナー＋骨組み → requestAnimationFrame で段階描画（背景→起点終点→バッジ・所要→一言・下部）
   ・同じ起点・終点・条件・一言はキャッシュ（2回目は即時）。3秒超「もう少しで完成します」、5秒超は文字版を先に
   ・完了後: 「Xに投稿」「画像を保存」「閉じる」。X が開けないときは画像を自動保存して案内
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var SITE = "https://kouchift.github.io/tokyostation/";
var W = 1080, H = 1080, M = 72, FONT = "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif";
var COND = {
  0: { id: 0, label: "安全第一", bg: "#E8F8EF", fg: "#1B7A4A", tag: "安全第一" },
  1: { id: 1, label: "標準", bg: "#F2F2F2", fg: "#555555", tag: "" },
  2: { id: 2, label: "攻める", bg: "#FFF1E6", fg: "#C45E1A", tag: "最速寄り" },
  3: { id: 3, label: "子連れ", bg: "#E8F3FF", fg: "#1A6FB5", tag: "子連れ向け" }
};
RG.CARD_COND = COND;
var CHEER = "この地図を現場の声で育て続けたい。役に立ったら応援してもらえると嬉しいです。";

/* ---- 素材 ---- */
function linesOf(ids, segs) {
  var out = [];
  if (segs && segs.length) { segs.forEach(function (g) { if (g.line && g.line !== "乗り換え" && out[out.length - 1] !== g.line) out.push(g.line); }); return out; }
  for (var i = 1; i < ids.length; i++) {
    var adj = RG.adj[ids[i - 1]] || [], ln = null;
    for (var j = 0; j < adj.length; j++) if (adj[j].to === ids[i]) { ln = adj[j].line; break; }
    if (ln && ln !== "乗り換え" && out[out.length - 1] !== ln) out.push(ln);
  }
  return out;
}
function cleanLine(n) { return String(n || "").replace(/\s*[:：].*$/, "").replace(/(東京地下鉄|東京メトロ)/, "メトロ").replace(/都営地下鉄/, "都営").replace(/^(西武|東武)鉄道/, "$1").replace(/^(京成|京王|小田急|京阪|阪急|阪神|南海)電鉄/, "$1").replace(/^東京急行電鉄|^東急電鉄/, "東急").replace(/^京浜急行電鉄/, "京急").replace(/^相模鉄道/, "相鉄").replace(/^近畿日本鉄道/, "近鉄").replace(/^名古屋鉄道/, "名鉄").replace(/^西日本鉄道/, "西鉄"); }
RG.cardTrim = function (txt) { txt = String(txt || "").replace(/\s+/g, " ").trim(); return txt.length > 35 ? txt.slice(0, 34) + "…" : txt; };
RG.cardComment = function (s) {
  var c = s.cond, t = s.transfers, txt;
  if (c === 3) txt = t === 0 ? "乗り換えなし。ベビーカーでもそのまま乗っていけます。" : t === 1 ? "乗り換えは1回。ベビーカーでも動きやすいルートです。" : "乗り換えが" + t + "回あります。ゆとりを持って動きたいときに。";
  else if (c === 0) txt = s.night ? "夜でも明るく人の多い駅を通る、安心寄りのルート。" : t === 0 ? "乗り換えなしで迷いにくい、いちばん無理のない行き方。" : "乗り換えの少ない、無理のないルート。混雑が苦手な人に。";
  else if (c === 2) txt = s.shinkansen ? "新幹線で時間を最優先。体力より速さをとる行き方。" : "所要時間を最優先。少し歩いても早く着くルート。";
  else txt = s.shinkansen ? "新幹線を含む標準ルート。運賃はめやすです。" : t === 0 ? "乗り換えなしの標準ルート。時間帯を選ばず使いやすい。" : "時間と乗り換えのバランスがよい、ふだん使いのルート。";
  return RG.cardTrim(txt);
};
RG.cardSpec = function (fromId, toId, cond, when) {
  var a = RG.byId[fromId], b = RG.byId[toId]; if (!a || !b) return null;
  var date = when || (RG.Trip && RG.Trip.when) || new Date();
  if (RG.Planner.setAggr) RG.Planner.setAggr(cond); else if (RG.Planner.setKids) RG.Planner.setKids(cond === 3);
  var rp = null; try { rp = RG.Planner.railPath([a.la, a.lo], [b.la, b.lo], date); } catch (e) { rp = null; }
  if (RG.Planner.setAggr) RG.Planner.setAggr(1); else if (RG.Planner.setKids) RG.Planner.setKids(false);
  var lines = rp ? linesOf(rp.ids, rp.segs).map(cleanLine) : [], uniq = [];
  lines.forEach(function (l) { if (uniq.indexOf(l) < 0) uniq.push(l); });
  var kind = RG.Planner.hourKind ? RG.Planner.hourKind(date) : "day";
  var s = { from: a, to: b, cond: cond, minutes: rp ? Math.round(rp.minutes) : null, transfers: rp ? rp.transfers : null, lines: uniq, yen: rp ? rp.yen : null, shinkansen: !!(rp && rp.shinkansen), night: kind === "night", date: date };
  s.comment = RG.cardComment(s);
  return s;
};

/* ---- 描画（段階: 0 背景・サイト名 / 1 起点→終点 / 2 バッジ・所要 / 3 一言・下部） ---- */
function font(c, size, weight) { c.font = (weight || 400) + " " + size + "px " + FONT; }
function wrap(c, txt, maxW) {
  var lines = [], line = "";
  for (var i = 0; i < txt.length; i++) { if (line && c.measureText(line + txt[i]).width > maxW) { lines.push(line); line = ""; } line += txt[i]; }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
function drawStage(c, s, stage) {
  var C = COND[s.cond] || COND[1];
  if (stage === 0) {
    c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, W, H);
    c.textBaseline = "top"; font(c, 24, 400); c.fillStyle = "#999999"; c.fillText("東京ステーションガイド", M, M);
  }
  var y = M + 24 + 56;
  var total = s.from.n.length + s.to.n.length, big = total > 13 ? 56 : total > 10 ? 62 : 72;
  if (stage === 1) {
    c.textBaseline = "top"; c.fillStyle = "#1A1A1A"; font(c, big, 800);
    var wf = c.measureText(s.from.n).width, gap = big * 0.22;
    c.fillText(s.from.n, M, y);
    font(c, big * 0.72, 600); c.fillStyle = "#B8B8B8"; var wa = c.measureText("→").width; c.fillText("→", M + wf + gap, y + big * 0.14);
    font(c, big, 800); c.fillStyle = "#1A1A1A"; c.fillText(s.to.n, M + wf + gap * 2 + wa, y);
  }
  y += big * 1.25 + 34;
  if (stage === 2) {
    font(c, 28, 600); var bw = c.measureText(C.label).width + 56, bh = 60;
    c.fillStyle = C.bg; c.beginPath(); c.roundRect(M, y, bw, bh, bh / 2); c.fill();
    c.fillStyle = C.fg; c.textBaseline = "middle"; c.fillText(C.label, M + 28, y + bh / 2 + 1);
    c.textBaseline = "top"; font(c, 34, 400); c.fillStyle = "#333333";
    c.fillText("所要 約" + (s.minutes != null ? s.minutes : "—") + "分　／　乗換 " + (s.transfers != null ? s.transfers : "—") + "回", M, y + bh + 40);
  }
  y += 60 + 40 + 34 * 1.5 + 44;
  if (stage === 3) {
    c.textBaseline = "top"; font(c, 32, 400); c.fillStyle = "#222222";
    wrap(c, RG.cardTrim(s.comment), W - M * 2).forEach(function (l, i) { c.fillText(l, M, y + i * 48); });
    font(c, 26, 400); c.fillStyle = "#888888"; c.fillText(RG.CARD_SHORT_URL || SITE, M, H - M - 24 - 14 - 26);
    font(c, 24, 400); c.fillStyle = "#AAAAAA"; c.fillText(CHEER, M, H - M - 24);
  }
}
var CACHE = {};
function cacheKey(s) { return [s.from.id, s.to.id, s.cond, s.minutes, s.transfers, RG.cardTrim(s.comment)].join("|"); }
/* 段階描画。onStage(stage, canvas) を各段で呼び、最後に onDone(dataURL, cached) */
RG.cardDraw = function (s, canvas, onStage, onDone, onFail) {
  var key = cacheKey(s);
  if (CACHE[key]) {
    var img = new Image();
    img.onload = function () { try { canvas.width = W; canvas.height = H; canvas.getContext("2d").drawImage(img, 0, 0); } catch (e) {} onDone(CACHE[key], true); };
    img.onerror = function () { delete CACHE[key]; RG.cardDraw(s, canvas, onStage, onDone, onFail); };
    img.src = CACHE[key]; return;
  }
  var c; try { canvas.width = W; canvas.height = H; c = canvas.getContext("2d"); if (!c || !c.roundRect) throw new Error("canvas"); } catch (e) { onFail && onFail(e); return; }
  var stage = 0;
  function step() {
    try { drawStage(c, s, stage); } catch (e) { onFail && onFail(e); return; }
    onStage && onStage(stage, canvas);
    stage++;
    if (stage <= 3) requestAnimationFrame(step);
    else { var url; try { url = canvas.toDataURL("image/png"); } catch (e) { onFail && onFail(e); return; } CACHE[key] = url; onDone(url, false); }
  }
  requestAnimationFrame(step);
};
/* 投稿文（固定テンプレート） */
function postText(s) {
  var C = COND[s.cond] || COND[1];
  return "【東京移動メモ】" + (C.tag ? C.tag : "") + "\n" + s.from.n + " → " + s.to.n + "\n" + RG.cardTrim(s.comment) + "\n\n所要 約" + (s.minutes != null ? s.minutes : "—") + "分 / 乗換 " + (s.transfers != null ? s.transfers : "—") + "回\n\n地図で確認 → " + (RG.CARD_SHORT_URL || SITE);
}
RG.cardPostText = postText;
function textVersion(s) { var C = COND[s.cond] || COND[1]; return s.from.n + " → " + s.to.n + "（" + C.label + "）\n所要 約" + (s.minutes != null ? s.minutes : "—") + "分 ／ 乗換 " + (s.transfers != null ? s.transfers : "—") + "回\n" + RG.cardTrim(s.comment); }
function dataUrlToBlob(url) { var p = url.split(","), bin = atob(p[1]), n = bin.length, u8 = new Uint8Array(n); for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: "image/png" }); }
function download(url, name) { var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }

/* ---- 画面 ---- */
RG.showRouteCard = function (fromId, toId, cond) {
  if (!fromId) fromId = RG.Trip && RG.Trip.id;
  if (!fromId && RG.Trip && RG.Trip.origin && RG.Planner.accessPoints) { var ap = RG.Planner.accessPoints(RG.Trip.origin, 40, 3.0); if (ap.length) fromId = ap[0].id; }
  if (!toId) { RG.tripStatus && RG.tripStatus("行き先の駅を決めてください", "warn"); return; }
  if (!fromId) { RG.tripStatus && RG.tripStatus("出発の駅を決めてください（駅カードの「📍 ここから出発」）", "warn", 4000); return; }
  if (fromId === toId) { RG.tripStatus && RG.tripStatus("出発と行き先が同じ駅です", "warn"); return; }
  cond = cond == null ? ((RG.Trip && RG.Trip.aggr) || 1) : cond;
  var s = RG.cardSpec(fromId, toId, cond); if (!s) return;
  var html = '<div class="rc">' +
    '<div class="rc__hd">' + esc(s.from.n) + ' <span>→</span> ' + esc(s.to.n) + '</div>' +
    '<div class="rc__cond">' + [0, 1, 2, 3].map(function (k) { var C = COND[k]; return '<button class="rc__c" type="button" data-cond="' + k + '" aria-pressed="' + (k === cond) + '" style="--bg:' + C.bg + ';--fg:' + C.fg + '">' + C.label + "</button>"; }).join("") + "</div>" +
    '<label class="rc__l">一言（全角35字まで・編集できます）<textarea id="rc-comment" class="rc__ta" rows="2" maxlength="35">' + esc(s.comment) + "</textarea></label>" +
    '<div class="rc__mk"><button class="rc__make" type="button" id="rc-make">カードを作る</button><span class="rc__ld" id="rc-ld" hidden>もう少しで完成します</span></div>' +
    '<div class="rc__sk" id="rc-sk" hidden><div class="rc__sk-in"><i class="s1"></i><b class="s2">' + esc(s.from.n) + ' → ' + esc(s.to.n) + '</b><i class="s3"></i><i class="s4"></i><i class="s5"></i><i class="s6"></i></div></div>' +
    '<div class="rc__cvwrap" id="rc-cvwrap" hidden><canvas id="rc-cv" class="rc__cv" width="1080" height="1080"></canvas></div>' +
    '<pre class="rc__textv" id="rc-textv" hidden></pre>' +
    '<p class="rc__fail" id="rc-fail" hidden>カードの生成に失敗しました。<br>起点・終点・条件をもう一度選んで試してください。</p>' +
    '<div id="rc-out" hidden>' +
      '<div class="rc__acts"><button class="rc__a rc__a--main" type="button" id="rc-share">共有する</button><a class="rc__a" id="rc-x" href="#" rel="noopener">Xに投稿</a><a class="rc__a" id="rc-dl" href="#" download="route-card.png">画像を保存</a></div>' +
      '<p class="rc__hint" id="rc-hint"></p>' +
      '<div class="rc__sub"><a id="rc-line" target="_blank" rel="noopener">LINEで送る</a><button type="button" id="rc-copy">投稿文をコピー</button><button type="button" id="rc-showtxt">投稿文を見る</button><button type="button" id="rc-close">閉じる</button></div>' +
      '<pre class="rc__txt" id="rc-txt" hidden></pre></div></div>';
  var m = RG.openModal("ルートカード", html);
  var cv = $("#rc-cv", m), sk = $("#rc-sk", m), out = $("#rc-out", m), cvwrap = $("#rc-cvwrap", m), fail = $("#rc-fail", m), textv = $("#rc-textv", m), ld = $("#rc-ld", m), btn = $("#rc-make", m);
  var cur = { url: null, blob: null }, timers = [];
  function reset() { timers.forEach(clearTimeout); timers = []; out.hidden = true; cvwrap.hidden = true; sk.hidden = true; fail.hidden = true; textv.hidden = true; ld.hidden = true; btn.disabled = false; btn.textContent = "カードを作る"; $("#rc-hint", m).textContent = ""; }
  Array.prototype.forEach.call(m.querySelectorAll("[data-cond]"), function (b) {
    b.addEventListener("click", function () {
      cond = +b.dataset.cond; var ns = RG.cardSpec(fromId, toId, cond); if (ns) s = ns;
      $("#rc-comment", m).value = s.comment;
      Array.prototype.forEach.call(m.querySelectorAll("[data-cond]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      reset();
    });
  });
  $("#rc-close", m).addEventListener("click", function () { RG.closeModal(); });
  $("#rc-showtxt", m).addEventListener("click", function () { var p = $("#rc-txt", m); p.hidden = !p.hidden; });
  $("#rc-copy", m).addEventListener("click", function () { var t = postText(s); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { RG.tripStatus("投稿文をコピーしました", "ok", 2000); }).catch(function () { $("#rc-txt", m).hidden = false; }); });
  function enableSaveOnly(url) { var dl = $("#rc-dl", m); dl.href = url; dl.download = "route-card-" + s.from.n + "-" + s.to.n + ".png"; out.hidden = false; $("#rc-x", m).classList.add("is-off"); }
  function finish(url, cached) {
    timers.forEach(clearTimeout); timers = [];
    cur.url = url; try { cur.blob = dataUrlToBlob(url); } catch (e) { cur.blob = null; }
    sk.hidden = true; ld.hidden = true; textv.hidden = true; cvwrap.hidden = false; out.hidden = false; btn.disabled = false; btn.textContent = "作り直す";
    var dl = $("#rc-dl", m); dl.href = url; dl.download = "route-card-" + s.from.n + "-" + s.to.n + ".png";
    var txt = postText(s); $("#rc-txt", m).textContent = txt;
    var xb = $("#rc-x", m); xb.classList.remove("is-off"); xb.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(txt);
    $("#rc-line", m).href = "https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(RG.CARD_SHORT_URL || SITE) + "&text=" + encodeURIComponent(txt.replace(RG.CARD_SHORT_URL || SITE, "").replace(/地図で確認 →\s*$/, "").trim());
    var f = cur.blob ? new File([cur.blob], dl.download, { type: "image/png" }) : null;
    function canShareFiles() { try { return !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
    var canFiles = canShareFiles();
    var sb = $("#rc-share", m);
    /* 共有する: Web Share API（画像ファイル＋投稿文＋URL）→ スマホのネイティブ共有シート（Instagram・TikTok・X・LINE…）。
       使えないときは投稿文をコピー＋画像を自動保存して案内し、X の投稿画面を開く */
    sb.onclick = function () {
      canFiles = canShareFiles();                                        // 押した時点で判定（環境差に強く）
      var data = { title: "東京ステーションガイド", text: txt, url: RG.CARD_SHORT_URL || SITE };
      if (canFiles) data.files = [f];
      if (navigator.share && (canFiles || !f)) {
        navigator.share(data).catch(function (e) {
          if (e && e.name === "AbortError") return;                    // 取りやめ: 何も出さない
          if (e && e.name === "TypeError" && data.files) { delete data.files; navigator.share(data).catch(function (e2) { if (!(e2 && e2.name === "AbortError")) fallbackShare(); }); return; }
          fallbackShare();
        });
      } else fallbackShare();
    };
    function fallbackShare() {
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {});
      download(cur.url, dl.download);
      $("#rc-hint", m).innerHTML = "画像を保存し、投稿文をコピーしました。<br>・X：このまま投稿画面が開きます<br>・Instagram / TikTok：保存した画像を選び、コピーした文を貼り付けて投稿してください";
      setTimeout(function () { try { window.open(xb.href, "_blank", "noopener"); } catch (e) {} }, 600);
    }
    function openIntent() {
      if (cur.blob && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ "image/png": cur.blob })]).then(function () { $("#rc-hint", m).textContent = "画像をクリップボードに入れました。投稿画面で貼り付け（Ctrl/⌘+V）できます。"; }).catch(function () {});
      }
      var w = null; try { w = window.open(xb.href, "_blank", "noopener"); } catch (e) { w = null; }
      if (!w) {
        download(cur.url, dl.download);
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {});
        $("#rc-hint", m).textContent = "画像を保存しました。Xで画像を添付して投稿してください（投稿文はコピーしてあります）。";
        $("#rc-txt", m).hidden = false;
      }
    }
    xb.onclick = function (ev) {
      ev.preventDefault();
      if (canFiles && /Android|iPhone|iPad/i.test(navigator.userAgent)) { navigator.share({ files: [f], title: s.from.n + " → " + s.to.n, text: txt }).catch(function () { openIntent(); }); return; }
      openIntent();
    };
    if (!finish.scrolled) { finish.scrolled = true; out.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }
  btn.addEventListener("click", function () {
    var t0 = Date.now();
    s.comment = RG.cardTrim($("#rc-comment", m).value);
    timers.forEach(clearTimeout); timers = [];
    fail.hidden = true; textv.hidden = true; out.hidden = true; cvwrap.hidden = true;
    btn.disabled = true; btn.innerHTML = '<span class="rc__spin"></span>カードを作成しています…';
    sk.hidden = false;
    ["s1", "s2", "s3", "s4", "s5", "s6"].forEach(function (k, i) { var e = sk.querySelector("." + k); if (e) { e.classList.remove("on"); timers.push(setTimeout(function () { e.classList.add("on"); }, 40 + i * 70)); } });
    timers.push(setTimeout(function () { if (out.hidden) ld.hidden = false; }, 3000));
    timers.push(setTimeout(function () { if (out.hidden) { textv.textContent = textVersion(s); textv.hidden = false; if (cur.url) enableSaveOnly(cur.url); } }, 5000));
    RG.cardDraw(s, cv, function (stage) { if (stage >= 1) { sk.hidden = true; cvwrap.hidden = false; } },
      function (url, cached) { var wait = cached ? 0 : Math.max(0, 260 - (Date.now() - t0)); setTimeout(function () { finish(url, cached); }, wait); },
      function () { timers.forEach(clearTimeout); sk.hidden = true; cvwrap.hidden = true; ld.hidden = true; fail.hidden = false; btn.disabled = false; btn.textContent = "カードを作る"; var c0 = m.querySelector(".rc__cond"); if (c0) c0.scrollIntoView({ behavior: "smooth", block: "start" }); });
  });
};
})(window.RG);
