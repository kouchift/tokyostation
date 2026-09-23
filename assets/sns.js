/* =========================================================================
   SNS へ送る（v84）  ルートカード・ルート PV・画面の共有・おでかけプランで同じ並び
   ・主軸: X ／ Instagram ／ TikTok ／ LINE。「その他」を開くと Facebook ／ WhatsApp ／ Telegram ／ Discord ／ WeChat ／ YouTube（動画のとき）／ メール ／ SMS ／ 共有シート ／ コピー
   ・できること・できないこと（正直に）
     - リンクや文だけで投稿画面を開けるのは X・LINE・Facebook・WhatsApp・Telegram・メール・SMS
     - Instagram・TikTok・Discord・WeChat・YouTube は Web から画像や動画を渡す入口が無い
       → スマホ: OS の共有シートにファイルと本文を載せて渡す（共有先でそのアプリを選ぶ）
       → PC: 画像／動画を保存し、本文をコピーして、そのサービスを新しいタブで開く（貼り付けるだけ）
     - X は PC でも画像をクリップボードに入れて投稿画面を開く（Ctrl/⌘+V で貼れる）
   ・payload: { title, text, url, file (File|null), blobUrl, fileName, kind: "image"|"video"|"" }
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var SITE = "https://kouchift.github.io/tokyostation/";
var MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

function canShareFiles(f) { try { return !!(f && navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
function enc(s) { return encodeURIComponent(s || ""); }
function textWithUrl(p) { var t = p.text || ""; if (p.url && t.indexOf(p.url) < 0) t += (t ? "\n" : "") + p.url; return t; }
function textOnly(p) { var t = p.text || ""; if (p.url) t = t.replace(p.url, "").replace(/地図で確認 →\s*$/, "").trim(); return t; }

/* 送り先の定義。url(p): 開くだけで済むもの。steps: Web の入口が無く «保存＋コピー＋開く» で渡すもの */
var T = {
  x:         { label: "X", cls: "sns--x", url: function (p) { return "https://twitter.com/intent/tweet?text=" + enc(p.text) + (p.url && (p.text || "").indexOf(p.url) < 0 ? "&url=" + enc(p.url) : ""); }, paste: true, how: "開いた投稿画面に保存した動画（画像）をドラッグするだけ（本文は入っています）" },
  instagram: { label: "Instagram", cls: "sns--ig", steps: "https://www.instagram.com/", app: "Instagram", how: "アプリで「＋」→ 保存した画像／動画を選ぶ → 本文（コピー済み）を貼り付け" },
  tiktok:    { label: "TikTok", cls: "sns--tt", steps: "https://www.tiktok.com/upload", app: "TikTok", how: "アップロード画面で保存したファイルを選ぶ → 本文（コピー済み）を貼り付け" },
  line:      { label: "LINE", cls: "sns--line", url: function (p) { return "https://social-plugins.line.me/lineit/share?url=" + enc(p.url || SITE) + "&text=" + enc(textOnly(p)); }, how: "開いた画面で送る相手を選ぶ（本文とリンクは入っています）。動画はトーク画面の「＋」→ 保存したファイルを選んで送ってください（LINE は Web から動画を受け取れないため）" },
  facebook:  { label: "Facebook", cls: "sns--fb", url: function (p) { return "https://www.facebook.com/sharer/sharer.php?u=" + enc(p.url || SITE); }, note: "Facebook はリンクだけ受け取ります（本文はコピーしてあります）", copy: true },
  whatsapp:  { label: "WhatsApp", cls: "sns--wa", url: function (p) { return "https://wa.me/?text=" + enc(textWithUrl(p)); } },
  telegram:  { label: "Telegram", cls: "sns--tg", url: function (p) { return "https://t.me/share/url?url=" + enc(p.url || SITE) + "&text=" + enc(textOnly(p)); } },
  discord:   { label: "Discord", cls: "sns--dc", steps: "https://discord.com/channels/@me", app: "Discord", how: "送りたいチャンネルで、保存したファイルをドラッグ＆ドロップ → 本文（コピー済み）を貼り付け" },
  wechat:    { label: "WeChat", cls: "sns--wc", steps: null, app: "WeChat（微信）", how: "WeChat のチャットやモーメンツで、保存したファイルを選ぶ → 本文（コピー済み）を貼り付け" },
  youtube:   { label: "YouTube", cls: "sns--yt", steps: "https://www.youtube.com/upload", app: "YouTube", video: true, how: "開いたアップロード画面に保存した動画をドラッグ（または「ファイルを選択」）→ タイトル・説明に本文を貼り付け（20 秒の縦動画なのでショートになります）" },
  obsidian:  { label: "Obsidian", cls: "sns--ob", md: true, custom: "obsidian" },
  mdfile:    { label: ".md を保存", cls: "", md: true, custom: "md" },
  mail:      { label: "メール", cls: "", url: function (p) { return "mailto:?subject=" + enc(p.title || "東京ステーションガイド") + "&body=" + enc(textWithUrl(p) + (p.file ? "\n\n（画像／動画は保存したファイルを添付してください）" : "")); }, same: true },
  sms:       { label: "SMS", cls: "", url: function (p) { return "sms:?&body=" + enc(textWithUrl(p)); }, mobile: true, same: true },
  native:    { label: "共有シート", cls: "", native: true },
  copy:      { label: "本文をコピー", cls: "", copy: true }
};
var PRIMARY = ["x", "instagram", "tiktok", "line"];
var PRIMARY_VIDEO = ["youtube", "x", "instagram", "tiktok", "line"];   // v88: 動画は YouTube を主軸の先頭に
var OTHERS = ["facebook", "whatsapp", "telegram", "discord", "wechat", "youtube", "obsidian", "mdfile", "mail", "sms", "native", "copy"];
RG.SNS = T;

function download(url, name) { var a = document.createElement("a"); a.href = url; a.download = name || "tokyostation"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 600); }
function copyText(t) { return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject(new Error("no clipboard"))); }
function copyImage(p) {
  if (!p.file || p.kind !== "image" || !window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return Promise.reject(new Error("no image clipboard"));
  var item = {}; item[p.file.type || "image/png"] = p.file;
  return navigator.clipboard.write([new ClipboardItem(item)]);
}
function openTab(u) { var w = null; try { w = window.open(u, "_blank", "noopener"); } catch (e) { w = null; } return w; }
/* v88: ポップアップが止められたら、押せるリンクをヒントに出す（Brave・Firefox の厳しめ設定など） */
function openOrLink(u, label, hint) { var w = openTab(u); if (!w) hint('<a class="sns__go" href="' + esc(u) + '" target="_blank" rel="noopener">▶ ' + esc(label) + " を開く</a>（自動で開けなかったので、ここを押してください）", true); return !!w; }
function mdDownload(p) { var b = new Blob([p.md], { type: "text/markdown;charset=utf-8" }); var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (p.mdName || "tokyostation") + ".md"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }

/* 共有シート（ファイルつき → 無理なら文だけ） */
function nativeShare(p, hint) {
  var data = { title: p.title || "東京ステーションガイド", text: textWithUrl(p) };
  if (p.file && canShareFiles(p.file)) data.files = [p.file];
  return navigator.share(data).catch(function (e) {
    if (e && e.name === "AbortError") return;
    if (data.files) { delete data.files; return navigator.share(data).catch(function () {}).then(function () { hint("このアプリはファイルを受け取れませんでした。「保存」したファイルをアプリ側で選んでください。"); }); }
    hint("共有シートを開けませんでした。本文をコピーして貼り付けてください。");
  });
}

/* v88: PC 向けの «3 ステップ» カード。どこまで自動でできたかを見せる（保存ずみ・コピーずみ・あとは貼るだけ） */
function steps3(p, t, fallbackUrl) {
  var f = p.file ? (p.kind === "video" ? "動画" : "画像") : null;
  return '<span class="sns__steps">' +
    (f ? '<b>① ' + f + 'を保存しました</b>（ダウンロード フォルダ: ' + esc(p.fileName || "") + "）" : "") +
    '<b>' + (f ? "② " : "① ") + '本文をコピーしました</b>' +
    '<b>' + (f ? "③ " : "② ") + esc(t.label) + ' で貼るだけ</b>: ' + esc(t.how || ("開いた画面で" + (f ? f + "を選び、" : "") + "本文を貼り付け")) +
    (fallbackUrl ? ' <a class="sns__go" href="' + esc(fallbackUrl) + '" target="_blank" rel="noopener">▶ ' + esc(t.label) + " を開く</a>" : "") +
    "</span>";
}
/* 1 つの送り先へ */
RG.snsShare = function (id, p, hint) {
  hint = hint || function () {};
  var t = T[id]; if (!t) return;
  var txt = textWithUrl(p);
  if (t.custom === "obsidian") {
    if (!p.md) { hint("Markdown が用意されていません。"); return; }
    var base = "obsidian://new?" + (RG.Plan && RG.Plan.vault ? "vault=" + enc(RG.Plan.vault) + "&" : "") + "name=" + enc(p.mdName || "tokyostation");
    if (RG.sendToObsidian) RG.sendToObsidian({ md: p.md, name: p.mdName || "tokyostation", obsidian: base + "&content=" + enc(p.md) });
    else location.href = base + "&content=" + enc(p.md);
    hint("Obsidian で新しいノートを開きます（Vault 名は設定の「訪問メモ」で指定できます）。開かないときは「.md を保存」→ Vault のフォルダへ。");
    return;
  }
  if (t.custom === "md") { if (!p.md) { hint("Markdown が用意されていません。"); return; } mdDownload(p); hint("Markdown（.md）を保存しました。Obsidian の Vault フォルダに入れるだけで読めます。"); return; }
  if (t.copy && !t.url) { copyText(txt).then(function () { hint("本文をコピーしました。"); }).catch(function () { hint("コピーできませんでした。「本文を見る」から選んでコピーしてください。"); }); return; }
  if (t.native) { if (navigator.share) nativeShare(p, hint); else hint("この端末には共有シートがありません。"); return; }
  // スマホでファイルつき: どの SNS でも共有シートに載せて渡す（Web から直接アプリの投稿画面に画像を渡す入口が無いため）
  if (p.file && MOBILE && canShareFiles(p.file) && !t.same) {
    hint("共有先で「" + t.label + "」を選んでください。本文も一緒に渡します。");
    nativeShare(p, hint); return;
  }
  if (t.url) {
    // v88: 開くのを先に（クリック直後のうちに window.open）。そのあと保存とコピー
    var u = t.url(p), opened = false;
    if (t.same) { location.href = u; }
    else opened = openOrLink(u, t.label, hint);
    if (id === "x" && p.file && p.kind === "image") {
      // PC の X: 画像をクリップボードへ → 投稿画面で貼るだけ
      copyImage(p).then(function () { hint("画像をクリップボードに入れました。X の投稿画面で貼り付け（Ctrl/⌘+V）してください。"); })
        .catch(function () { download(p.blobUrl, p.fileName); hint("画像を保存しました。X の投稿画面で添付してください。"); });
    } else if (p.file) {
      download(p.blobUrl, p.fileName); hint(steps3(p, t, opened ? null : u), true);
    }
    if (t.copy) copyText(txt).catch(function () {});
    if (t.note) hint(t.note);
    return;
  }
  if (t.steps !== undefined) {
    // Web の入口が無いサービス: 開く → 保存 → 本文コピー（順番が大事: window.open はクリック直後、コピーは画面がまだ手前のうちに）
    var ok2 = t.steps ? openTab(t.steps) : null;
    copyText(txt).catch(function () {});
    if (p.file) download(p.blobUrl, p.fileName);
    hint(steps3(p, t, t.steps && !ok2 ? t.steps : null), true);
    return;
  }
};

/* ボタンの並び（HTML）。opts: { video: 動画のとき true, primary: 主軸に含める id, main: いちばん目立つボタンの id } */
RG.snsPanelHTML = function (opts) {
  opts = opts || {};
  var prim = (opts.primary || (opts.video ? PRIMARY_VIDEO : PRIMARY)).filter(function (id) { var t = T[id]; return t && !(t.md && !opts.md); });
  var others = OTHERS.filter(function (id) {
    var t = T[id];
    if (t.video && !opts.video) return false;
    if (t.md && !opts.md) return false;
    if (t.mobile && !MOBILE) return false;
    if (t.native && !navigator.share) return false;
    return prim.indexOf(id) < 0;
  });
  function btn(id, big) { var t = T[id]; return '<button class="sns ' + t.cls + (big ? " sns--big" : "") + '" type="button" data-sns="' + id + '">' + esc(t.label) + "</button>"; }
  return '<div class="snsp">' +
    '<div class="snsp__row">' + prim.map(function (id) { return btn(id, id === opts.main); }).join("") +
      '<button class="sns sns--more" type="button" data-sns-more aria-expanded="false">その他 ▾</button></div>' +
    '<div class="snsp__row snsp__more" hidden>' + others.map(function (id) { return btn(id); }).join("") +
      (opts.showText !== false ? '<button class="sns" type="button" data-sns-text>本文を見る</button>' : "") + "</div>" +
    '<p class="snsp__hint" data-sns-hint></p><pre class="snsp__txt" data-sns-txt hidden></pre></div>';
};
/* 結びつけ。getPayload(): いまの payload を返す（画像ができる前に押されても困らないように、押した時点で取る） */
RG.snsBind = function (root, getPayload) {
  if (!root) return;
  var hintEl = root.querySelector("[data-sns-hint]"), txtEl = root.querySelector("[data-sns-txt]");
  function hint(s, html) { if (!hintEl) return; if (html) hintEl.innerHTML = s || ""; else hintEl.textContent = s || ""; }
  var more = root.querySelector("[data-sns-more]"), moreRow = root.querySelector(".snsp__more");
  if (more) more.addEventListener("click", function () { var open = moreRow.hidden; moreRow.hidden = !open; more.setAttribute("aria-expanded", String(open)); more.textContent = open ? "その他 ▴" : "その他 ▾"; });
  var tb = root.querySelector("[data-sns-text]"); if (tb) tb.addEventListener("click", function () { var p = getPayload(); if (!txtEl) return; txtEl.textContent = textWithUrl(p); txtEl.hidden = !txtEl.hidden; });
  Array.prototype.forEach.call(root.querySelectorAll("[data-sns]"), function (b) {
    b.addEventListener("click", function () {
      var p = getPayload(); if (!p) { hint("まだ準備中です。少し待ってからもう一度押してください。"); return; }
      hint(""); RG.snsShare(b.dataset.sns, p, hint);
    });
  });
};
/* 文（＋あればファイル）を送るための小さな画面 */
RG.snsOpen = function (title, payload, opts) {
  opts = Object.assign({ md: !!payload.md }, opts || {});
  var m = RG.openModal(title || "📤 共有", '<div class="sh">' + (payload.preview || "") + RG.snsPanelHTML(opts) +
    (payload.file ? '<p class="mini"><a class="sh__b" href="' + payload.blobUrl + '" download="' + esc(payload.fileName || "tokyostation") + '">💾 ' + (payload.kind === "video" ? "動画" : "画像") + "を保存</a></p>" : "") + "</div>");
  RG.snsBind(m.querySelector(".snsp"), function () { return payload; });
  return m;
};
RG.snsIsMobile = function () { return MOBILE; };
RG.snsCanShareFiles = canShareFiles;
})(window.RG);
