/* =========================================================================
   シェアできるルートカード（1080×1080）  v81 最終仕様
   ・Canvas 2D で直接描く（外部ライブラリ不要・端末内だけ）。背景 #FFFFFF、余白 上下左右 72px
   ・上から: サイト名 24px #999999 → 起点→終点 最大 72px 太字 #1A1A1A（長い駅名は自動で縮小、2 行以内）
             → 条件バッジ（角丸） → 「所要 約○○分　／　乗換 ○回」34px #333333
             → 一言 32px #222222 最大 2 行（全角 35 字。「です。」で終わらせず短く）
             → 最下部に URL 26px #888888 と応援文言 24px #AAAAAA
   ・押した瞬間にスピナー＋骨組み → requestAnimationFrame で段階描画。同じ内容はキャッシュ（2 回目は即時）
     3 秒超「もう少しで完成します」、5 秒超は文字版を先に出して「画像を保存」だけ有効
   ・完了後のボタン: 「Xに投稿」（最も目立つ）「画像を保存」「閉じる」。X が開けないときは画像を自動保存して案内
   ・初期カード 10 パターン（RG.CARD_PRESETS）: 一覧から選んで「カードを作る」「Xに投稿」がすぐできる
   ・やらないこと: アイコン・影・枠線・グラデーション・デザイン切り替え・余計な完了メッセージ
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var SITE = "https://kouchift.github.io/tokyostation/";
var W = 1080, H = 1080, M = 72, FONT = "system-ui, -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif";
var COND = {
  0: { id: 0, label: "安全第一", bg: "#E8F8EF", fg: "#1B7A4A", tag: "安全第一" },
  1: { id: 1, label: "標準",     bg: "#F2F2F2", fg: "#555555", tag: "" },
  2: { id: 2, label: "攻める",   bg: "#FFF1E6", fg: "#C45E1A", tag: "最速寄り" },
  3: { id: 3, label: "子連れ",   bg: "#E8F3FF", fg: "#1A6FB5", tag: "子連れ向け" }
};
RG.CARD_COND = COND;
var CHEER = "この地図を現場の声で育て続けたい。役に立ったら応援してもらえると嬉しいです。";

/* ---- 初期カード（起点・終点・条件を選ばなくても、すぐ作って投稿できる 10 パターン） ---- */
RG.CARD_PRESETS = [
  { id: "kids1",   title: "子連れ",         from: "中村橋",     to: "新宿", cond: 3, minutes: 28, transfers: 1, comment: "ベビーカーでも乗り換えが比較的マシなルート" },
  { id: "calm1",   title: "混雑回避",       from: "石神井公園", to: "池袋", cond: 0, minutes: 22, transfers: 0, comment: "比較的静かに移動できるルート" },
  { id: "night1",  title: "夜間",           from: "中村橋",     to: "東京", cond: 0, minutes: 45, transfers: 1, comment: "人通りと明るさを優先したルート" },
  { id: "easy1",   title: "疲れにくい",     from: "大泉学園",   to: "品川", cond: 1, minutes: 48, transfers: 1, comment: "乗換を1回に抑えて疲れにくくしたルート" },
  { id: "kids2",   title: "子連れ2",        from: "ひばりヶ丘", to: "新宿", cond: 3, minutes: 35, transfers: 1, comment: "ベビーカーでの移動を意識したルート" },
  { id: "morning", title: "朝の移動",       from: "練馬",       to: "渋谷", cond: 1, minutes: 31, transfers: 1, comment: "乗換を少なくしたルート" },
  { id: "quiet1",  title: "静けさ重視",     from: "練馬高野台", to: "池袋", cond: 0, minutes: 25, transfers: 0, comment: "混雑を避けやすいルート" },
  { id: "kids3",   title: "子連れ（当事者感）", from: "中村橋", to: "新宿", cond: 3, minutes: 28, transfers: 1, comment: "実際に通っている人の声で育つ地図から" },
  { id: "night2",  title: "夜間2",          from: "石神井公園", to: "新宿", cond: 0, minutes: 40, transfers: 1, comment: "明るさと人通りを優先したルート" },
  { id: "simple",  title: "シンプル実用",   from: "大泉学園",   to: "東京", cond: 1, minutes: 55, transfers: 1, comment: "乗換を抑えてできるだけ楽に着くルート" }
];
/* 駅名 → 駅（同名が複数あるときは路線数・乗降人員の多い方＝JR 新宿など） */
function stationByName(n) {
  var l = (RG.byName && RG.byName[n]) || []; if (!l.length) return null;
  return l.slice().sort(function (a, b) { return ((b.ls || []).length - (a.ls || []).length) || ((b.px || 0) - (a.px || 0)); })[0];
}
RG.cardStationByName = stationByName;
/* 初期カードの仕様（所要・乗換・一言は登録値をそのまま使う） */
RG.cardPresetSpec = function (p) {
  var a = stationByName(p.from), b = stationByName(p.to); if (!a || !b) return null;
  var kind = RG.Planner && RG.Planner.hourKind ? RG.Planner.hourKind(new Date()) : "day";
  return { from: a, to: b, cond: p.cond, minutes: p.minutes, transfers: p.transfers, lines: [], yen: null, shinkansen: false, night: kind === "night", date: new Date(), comment: RG.cardTrim(p.comment), preset: p.id };
};

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
/* 自動の一言: 短く、「です。」で終わらせない */
RG.cardComment = function (s) {
  var c = s.cond, t = s.transfers, txt;
  if (c === 3) txt = t === 0 ? "乗り換えなし。ベビーカーのまま乗っていける" : t === 1 ? "乗り換え1回。ベビーカーでも動きやすい" : "乗り換え" + t + "回。ゆとりを持って動く日に";
  else if (c === 0) txt = s.night ? "夜でも明るく人の多い駅を通る、安心寄り" : t === 0 ? "乗り換えなしで迷いにくい、いちばん無理のない行き方" : "乗り換えの少ない無理のないルート。混雑が苦手な人に";
  else if (c === 2) txt = s.shinkansen ? "新幹線で時間を最優先。体力より速さ" : "所要時間を最優先。少し歩いても早く着く";
  else txt = s.shinkansen ? "新幹線を含む標準ルート。運賃はめやす" : t === 0 ? "乗り換えなしの標準ルート。時間帯を選ばない" : "時間と乗り換えのバランスがいい、ふだん使い";
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

/* ---- 描画 ---- */
function font(c, size, weight) { c.font = (weight || 400) + " " + size + "px " + FONT; }
function wrap(c, txt, maxW) {
  var lines = [], line = "";
  for (var i = 0; i < txt.length; i++) { if (line && c.measureText(line + txt[i]).width > maxW) { lines.push(line); line = ""; } line += txt[i]; }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
/* 起点→終点の文字サイズ: 72px から縮めて 1 行に収まる大きさ。56px でも入らなければ 2 行（起点／→ 終点） */
function titleLayout(c, s) {
  var maxW = W - M * 2, size, one;
  for (size = 72; size >= 56; size -= 2) {
    font(c, size, 800); var wf = c.measureText(s.from.n).width, wt = c.measureText(s.to.n).width;
    font(c, size * 0.72, 600); var wa = c.measureText("→").width;
    one = wf + wt + wa + size * 0.44;
    if (one <= maxW) return { size: size, lines: 1, wf: wf, wa: wa };
  }
  for (size = 64; size >= 40; size -= 2) {
    font(c, size, 800); var wf2 = c.measureText(s.from.n).width, wt2 = c.measureText(s.to.n).width;
    font(c, size * 0.72, 600); var wa2 = c.measureText("→").width;
    if (wf2 <= maxW && wt2 + wa2 + size * 0.22 <= maxW) return { size: size, lines: 2, wf: wf2, wa: wa2 };
  }
  return { size: 40, lines: 2, wf: 0, wa: 0 };
}
function drawStage(c, s, stage, L) {
  var C = COND[s.cond] || COND[1];
  if (stage === 0) {
    c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, W, H);
    c.textBaseline = "top"; font(c, 24, 400); c.fillStyle = "#999999"; c.fillText("東京ステーションガイド", M, M);
  }
  var y = M + 24 + 56, big = L.size;
  if (stage === 1) {
    c.textBaseline = "top";
    if (L.lines === 1) {
      var gap = big * 0.22;
      font(c, big, 800); c.fillStyle = "#1A1A1A"; c.fillText(s.from.n, M, y);
      font(c, big * 0.72, 600); c.fillStyle = "#B8B8B8"; c.fillText("→", M + L.wf + gap, y + big * 0.14);
      font(c, big, 800); c.fillStyle = "#1A1A1A"; c.fillText(s.to.n, M + L.wf + gap * 2 + L.wa, y);
    } else {
      font(c, big, 800); c.fillStyle = "#1A1A1A"; c.fillText(s.from.n, M, y);
      font(c, big * 0.72, 600); c.fillStyle = "#B8B8B8"; c.fillText("→", M, y + big * 1.25 + big * 0.14);
      font(c, big, 800); c.fillStyle = "#1A1A1A"; c.fillText(s.to.n, M + L.wa + big * 0.22, y + big * 1.25);
    }
  }
  y += big * 1.25 * L.lines + 34;
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
function prepare(canvas) { canvas.width = W; canvas.height = H; var c = canvas.getContext("2d"); if (!c || !c.roundRect) throw new Error("canvas"); return c; }
/* 段階描画。onStage(stage, canvas) を各段で呼び、最後に onDone(dataURL, cached) */
RG.cardDraw = function (s, canvas, onStage, onDone, onFail) {
  var key = cacheKey(s);
  if (CACHE[key]) {
    var img = new Image();
    img.onload = function () { try { canvas.width = W; canvas.height = H; canvas.getContext("2d").drawImage(img, 0, 0); } catch (e) {} onDone(CACHE[key], true); };
    img.onerror = function () { delete CACHE[key]; RG.cardDraw(s, canvas, onStage, onDone, onFail); };
    img.src = CACHE[key]; return;
  }
  var c, L; try { c = prepare(canvas); L = titleLayout(c, s); } catch (e) { onFail && onFail(e); return; }
  var stage = 0;
  function step() {
    try { drawStage(c, s, stage, L); } catch (e) { onFail && onFail(e); return; }
    onStage && onStage(stage, canvas);
    stage++;
    if (stage <= 3) requestAnimationFrame(step);
    else { var url; try { url = canvas.toDataURL("image/png"); } catch (e) { onFail && onFail(e); return; } CACHE[key] = url; onDone(url, false); }
  }
  requestAnimationFrame(step);
};
/* 一気に描いて dataURL を返す（クリック直後に X の投稿画面を開くとき用。ポップアップ抑止を避ける） */
RG.cardDrawSync = function (s, canvas) {
  var key = cacheKey(s); if (CACHE[key]) return CACHE[key];
  var c = prepare(canvas), L = titleLayout(c, s);
  for (var st = 0; st <= 3; st++) drawStage(c, s, st, L);
  var url = canvas.toDataURL("image/png"); CACHE[key] = url; return url;
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
function fileName(s) { return "route-card-" + s.from.n + "-" + s.to.n + ".png"; }
function intentUrl(txt) { return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(txt); }
function fileOf(url, s) { try { return new File([dataUrlToBlob(url)], fileName(s), { type: "image/png" }); } catch (e) { return null; } }
function canShareFile(f) { try { return !!(f && navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
/* 「Xに投稿」の実体。スマホ（共有シートに画像を渡せる）は画像＋投稿文で共有シート、
   それ以外は画像をクリップボードへ入れて X の投稿画面を開く。開けない（ポップアップ抑止など）ときは
   画像を自動保存＋投稿文をコピーして案内する。クリック直後に呼ぶこと（ジェスチャー内で window.open） */
function postToX(url, s, hintEl, txtEl) {
  var txt = postText(s), f = fileOf(url, s);
  if (canShareFile(f) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    navigator.share({ files: [f], title: s.from.n + " → " + s.to.n, text: txt }).catch(function (e) { if (!(e && e.name === "AbortError")) openIntent(); });
    return;
  }
  openIntent();
  function openIntent() {
    var blob = f;
    if (blob && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () { if (hintEl) hintEl.textContent = "画像をクリップボードに入れました。投稿画面で貼り付け（Ctrl/⌘+V）できます。"; }).catch(function () {});
    }
    var w = null; try { w = window.open(intentUrl(txt), "_blank", "noopener"); } catch (e) { w = null; }
    if (!w) {
      download(url, fileName(s));
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {});
      if (hintEl) hintEl.textContent = "画像を保存しました。Xで画像を添付して投稿してください（投稿文はコピーしてあります）。";
      if (txtEl) { txtEl.textContent = txt; txtEl.hidden = false; }
    }
  }
}

/* ---- 初期カードの一覧 ---- */
RG.showCardPresets = function () {
  var html = '<div class="rc"><p class="rc__lead">起点・終点を選ばなくても、すぐ作って投稿できるカードです。</p><div class="rcp">' +
    RG.CARD_PRESETS.map(function (p, i) {
      var C = COND[p.cond] || COND[1], ok = stationByName(p.from) && stationByName(p.to);
      return '<div class="rcp__i' + (ok ? "" : " is-off") + '"><div class="rcp__t"><b>' + esc(p.from) + ' <span>→</span> ' + esc(p.to) + '</b><i class="rcp__b" style="--bg:' + C.bg + ';--fg:' + C.fg + '">' + C.label + '</i></div>' +
        '<div class="rcp__m">所要 約' + p.minutes + '分 ／ 乗換 ' + p.transfers + '回 ・ ' + esc(p.title) + '</div><div class="rcp__c">' + esc(p.comment) + '</div>' +
        '<div class="rcp__a"><button class="rc__a rc__a--main" type="button" data-px="' + i + '">Xに投稿</button><button class="rc__a" type="button" data-pm="' + i + '">カードを作る</button></div></div>';
    }).join("") + '</div><p class="rc__hint" id="rcp-hint"></p><canvas id="rcp-cv" width="1080" height="1080" hidden></canvas><pre class="rc__txt" id="rcp-txt" hidden></pre></div>';
  var m = RG.openModal("用意されたカード", html);
  Array.prototype.forEach.call(m.querySelectorAll("[data-pm]"), function (b) {
    b.addEventListener("click", function () { var p = RG.CARD_PRESETS[+b.dataset.pm]; RG.closeModal(); RG.showRouteCard(null, null, p.cond, p); });
  });
  Array.prototype.forEach.call(m.querySelectorAll("[data-px]"), function (b) {
    b.addEventListener("click", function () {
      var p = RG.CARD_PRESETS[+b.dataset.px], s = RG.cardPresetSpec(p); if (!s) return;
      var url; try { url = RG.cardDrawSync(s, $("#rcp-cv", m)); } catch (e) { RG.closeModal(); RG.showRouteCard(null, null, p.cond, p); return; }
      postToX(url, s, $("#rcp-hint", m), $("#rcp-txt", m));
    });
  });
};

/* ---- 画面 ---- */
RG.showRouteCard = function (fromId, toId, cond, preset) {
  var s;
  if (preset) {
    s = RG.cardPresetSpec(preset); if (!s) { RG.tripStatus && RG.tripStatus("この駅は路線図にありません", "warn"); return; }
    fromId = s.from.id; toId = s.to.id; cond = preset.cond;
  } else {
    if (!fromId) fromId = RG.Trip && RG.Trip.id;
    if (!fromId && RG.Trip && RG.Trip.origin && RG.Planner.accessPoints) { var ap = RG.Planner.accessPoints(RG.Trip.origin, 40, 3.0); if (ap.length) fromId = ap[0].id; }
    if (!toId && !fromId) { RG.showCardPresets(); return; }
    if (!toId) { RG.tripStatus && RG.tripStatus("行き先の駅を決めてください", "warn"); return; }
    if (!fromId) { RG.showCardPresets(); return; }                                   // 出発駅がまだなら、用意されたカードを見せる
    if (fromId === toId) { RG.tripStatus && RG.tripStatus("出発と行き先が同じ駅です", "warn"); return; }
    cond = cond == null ? ((RG.Trip && RG.Trip.aggr) || 1) : cond;
    s = RG.cardSpec(fromId, toId, cond); if (!s) return;
  }
  var html = '<div class="rc">' +
    '<div class="rc__hd">' + esc(s.from.n) + ' <span>→</span> ' + esc(s.to.n) + '<button class="rc__pre" type="button" id="rc-presets">用意されたカード</button></div>' +
    '<div class="rc__cond">' + [0, 1, 2, 3].map(function (k) { var C = COND[k]; return '<button class="rc__c" type="button" data-cond="' + k + '" aria-pressed="' + (k === cond) + '" style="--bg:' + C.bg + ';--fg:' + C.fg + '">' + C.label + "</button>"; }).join("") + "</div>" +
    '<label class="rc__l">一言（全角35字まで・編集できます）<textarea id="rc-comment" class="rc__ta" rows="2" maxlength="35">' + esc(s.comment) + "</textarea></label>" +
    '<div class="rc__mk"><button class="rc__make" type="button" id="rc-make">カードを作る</button><span class="rc__ld" id="rc-ld" hidden>もう少しで完成します</span></div>' +
    '<div class="rc__sk" id="rc-sk" hidden><div class="rc__sk-in"><i class="s1"></i><b class="s2">' + esc(s.from.n) + ' → ' + esc(s.to.n) + '</b><i class="s3"></i><i class="s4"></i><i class="s5"></i><i class="s6"></i></div></div>' +
    '<div class="rc__cvwrap" id="rc-cvwrap" hidden><canvas id="rc-cv" class="rc__cv" width="1080" height="1080"></canvas></div>' +
    '<pre class="rc__textv" id="rc-textv" hidden></pre>' +
    '<p class="rc__fail" id="rc-fail" hidden>カードの生成に失敗しました。<br>起点・終点・条件をもう一度選んで試してください。</p>' +
    '<div id="rc-out" hidden>' +
      '<div class="rc__acts"><button class="rc__a rc__a--main" type="button" id="rc-x">Xに投稿</button><a class="rc__a" id="rc-dl" href="#" download="route-card.png">画像を保存</a><button class="rc__a" type="button" id="rc-close">閉じる</button></div>' +
      '<p class="rc__hint" id="rc-hint"></p>' +
      '<div class="rc__sub">' + (RG.snsPanelHTML ? RG.snsPanelHTML({ primary: ["instagram", "tiktok", "line"] }) : "") + '<button type="button" id="rc-copy" hidden>投稿文をコピー</button><button type="button" id="rc-showtxt" hidden>投稿文を見る</button></div>' +
      '<pre class="rc__txt" id="rc-txt" hidden></pre></div></div>';
  var m = RG.openModal("ルートカード", html);
  var cv = $("#rc-cv", m), sk = $("#rc-sk", m), out = $("#rc-out", m), cvwrap = $("#rc-cvwrap", m), fail = $("#rc-fail", m), textv = $("#rc-textv", m), ld = $("#rc-ld", m), btn = $("#rc-make", m);
  var cur = { url: null }, timers = [];
  function reset() { timers.forEach(clearTimeout); timers = []; out.hidden = true; cvwrap.hidden = true; sk.hidden = true; fail.hidden = true; textv.hidden = true; ld.hidden = true; btn.disabled = false; btn.textContent = "カードを作る"; $("#rc-hint", m).textContent = ""; }
  $("#rc-presets", m).addEventListener("click", function () { RG.closeModal(); RG.showCardPresets(); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-cond]"), function (b) {
    b.addEventListener("click", function () {
      cond = +b.dataset.cond;
      var ns = (preset && preset.cond === cond) ? RG.cardPresetSpec(preset) : RG.cardSpec(fromId, toId, cond); if (ns) s = ns;   // 初期カードは登録値、条件を変えたら計算値
      $("#rc-comment", m).value = s.comment;
      Array.prototype.forEach.call(m.querySelectorAll("[data-cond]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      reset();
    });
  });
  $("#rc-close", m).addEventListener("click", function () { RG.closeModal(); });
  $("#rc-showtxt", m).addEventListener("click", function () { var p = $("#rc-txt", m); p.hidden = !p.hidden; });
  $("#rc-copy", m).addEventListener("click", function () { var t = postText(s); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { RG.tripStatus("投稿文をコピーしました", "ok", 2000); }).catch(function () { $("#rc-txt", m).hidden = false; }); });
  function enableSaveOnly(url) { var dl = $("#rc-dl", m); dl.href = url; dl.download = fileName(s); out.hidden = false; $("#rc-x", m).classList.add("is-off"); }
  /* v84: X 以外の SNS（Instagram・TikTok・LINE・その他）は共通の並び（assets/sns.js）。カードができるまでは押しても案内だけ */
  if (RG.snsBind) RG.snsBind(m.querySelector(".snsp"), function () {
    if (!cur.url) return null;
    return { title: "東京ステーションガイド " + s.from.n + " → " + s.to.n, text: postText(s), url: RG.CARD_SHORT_URL || SITE, file: fileOf(cur.url, s), blobUrl: cur.url, fileName: fileName(s), kind: "image" };
  });
  function finish(url, cached) {
    timers.forEach(clearTimeout); timers = [];
    cur.url = url;
    sk.hidden = true; ld.hidden = true; textv.hidden = true; cvwrap.hidden = false; out.hidden = false; btn.disabled = false; btn.textContent = "作り直す";
    var dl = $("#rc-dl", m); dl.href = url; dl.download = fileName(s);
    var txt = postText(s); $("#rc-txt", m).textContent = txt;
    var xb = $("#rc-x", m); xb.classList.remove("is-off");
    xb.onclick = function () { postToX(url, s, $("#rc-hint", m), $("#rc-txt", m)); };
    if (!finish.scrolled) { finish.scrolled = true; out.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  }
  function make() {
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
  }
  btn.addEventListener("click", make);
  if (preset) make();                                                                  // 初期カードは開いた瞬間に作り始める
};
})(window.RG);
