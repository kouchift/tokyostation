/* =========================================================================
   いま見ている地図をキャプチャして、SNS へ共有する  v75〜
   ・地図（SVG）を Canvas に描き、右下にクレジット「～この世知辛い世の、喉の渇きを潤したい～」を焼き込む
   ・共有: v84 から assets/sns.js の共通の並び（X・Instagram・TikTok・LINE ＋ その他）／画像の保存／URL コピー
   ・誘導リンク https://kouchift.github.io/tokyostation/ を必ず添える
   ・外部ライブラリなし。地図の絵文字画像は data: URL なので Canvas が汚染されない
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var CREDIT = "～この世知辛い世の、喉の渇きを潤したい～";
var SITE = "https://kouchift.github.io/tokyostation/";

/* 地図を画像に */
RG.captureMap = function (cb) {
  var svg = document.getElementById("map"), wrap = document.querySelector(".mapwrap");
  if (!svg || !wrap) { cb(null); return; }
  var r = wrap.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height), dpr = Math.min(2, window.devicePixelRatio || 1);
  var clone = svg.cloneNode(true);
  // 外部URLの画像（ロゴなど）は Canvas を汚染するので外す。data: の絵文字画像は残す
  Array.prototype.forEach.call(clone.querySelectorAll("image"), function (im) { var h = im.getAttribute("href") || im.getAttributeNS("http://www.w3.org/1999/xlink", "href") || ""; if (h && h.indexOf("data:") !== 0) im.remove(); });
  clone.setAttribute("width", W); clone.setAttribute("height", H);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  // 適用中の CSS を埋め込む（同一オリジンのスタイルシートだけ）
  var css = "";
  Array.prototype.forEach.call(document.styleSheets, function (ss) { try { Array.prototype.forEach.call(ss.cssRules, function (rl) { css += rl.cssText + "\n"; }); } catch (e) {} });
  var style = document.createElementNS("http://www.w3.org/2000/svg", "style"); style.textContent = css; clone.insertBefore(style, clone.firstChild);
  var bg = getComputedStyle(wrap).backgroundColor || "#fbfbf7";
  var xml = new XMLSerializer().serializeToString(clone);
  var blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), url = URL.createObjectURL(blob);
  var img = new Image();
  img.onload = function () {
    var cv = document.createElement("canvas"); cv.width = W * dpr; cv.height = H * dpr;
    var cx = cv.getContext("2d"); cx.scale(dpr, dpr);
    cx.fillStyle = bg === "rgba(0, 0, 0, 0)" ? "#fbfbf7" : bg; cx.fillRect(0, 0, W, H);
    try { cx.drawImage(img, 0, 0, W, H); } catch (e) {}
    URL.revokeObjectURL(url);
    // v84: 空の色（昼夜）と雲の灰色も焼き込む（地図の上の層は SVG に入っていないので、同じ色を multiply で重ねる）
    try {
      [document.getElementById("wxsky"), document.getElementById("wxcloud")].forEach(function (L) {
        if (!L) return; var st = getComputedStyle(L), o = +st.opacity; if (!(o > 0.02)) return;
        var cols = (st.backgroundImage + " " + st.backgroundColor).match(/rgba?\([^)]*\)/g) || [];
        if (!cols.length) return;
        var fill = cols[0];
        if (cols.length >= 2 && /gradient/.test(st.backgroundImage)) { fill = cx.createLinearGradient(0, 0, 0, H); fill.addColorStop(0, cols[0]); fill.addColorStop(1, cols[1]); }
        cx.save(); cx.globalAlpha = o; cx.globalCompositeOperation = "multiply"; cx.fillStyle = fill; cx.fillRect(0, 0, W, H); cx.restore();
      });
    } catch (e) {}
    // タイトルとクレジット
    cx.font = "700 " + Math.max(13, Math.round(W / 60)) + "px system-ui, sans-serif"; cx.textBaseline = "top";
    var t = "東京ステーションガイド  " + SITE;
    cx.fillStyle = "rgba(255,255,255,.85)"; cx.fillRect(8, 8, cx.measureText(t).width + 16, Math.round(W / 60) + 14);
    cx.fillStyle = "#1a2733"; cx.fillText(t, 16, 14);
    var fs = Math.max(15, Math.round(W / 34));
    cx.font = "900 " + fs + "px 'Hiragino Sans','Yu Gothic',system-ui,sans-serif"; cx.textBaseline = "alphabetic";
    var tw = cx.measureText(CREDIT).width, px = W - tw - 22, py = H - 18;
    cx.fillStyle = "rgba(20,24,32,.72)"; cx.fillRect(px - 12, py - fs - 8, tw + 24, fs + 18);
    cx.lineWidth = Math.max(3, fs / 6); cx.strokeStyle = "rgba(0,0,0,.6)"; cx.strokeText(CREDIT, px, py);
    cx.fillStyle = "#ffe08a"; cx.fillText(CREDIT, px, py);
    cv.toBlob(function (b) { cb(b, cv.toDataURL("image/png")); }, "image/png");
  };
  img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
};

/* 共有パネル */
RG.shareOpen = function () {
  var vb = RG.Map && RG.Map.viewBox ? RG.Map.viewBox() : null, ctr = "";
  try { if (vb) { var c = RG.unproject(vb.x + vb.w / 2, vb.y + vb.h / 2); ctr = "?ll=" + c.la.toFixed(4) + "," + c.lo.toFixed(4) + "&w=" + Math.round(vb.w / (RG.K || 1)); } } catch (e) {}
  var link = SITE + ctr;
  var text = "東京ステーションガイド " + CREDIT + " " + link;
  var m = RG.openModal("📤 この画面を共有", '<div class="sh">' +
    '<div class="sh__pv"><p class="mini">画像をつくっています…</p></div>' +
    (RG.snsPanelHTML ? RG.snsPanelHTML({ main: "x" }) : "") +
    '<div class="sh__btns">' +
      '<button class="sh__b" type="button" id="sh-copy">🔗 リンクをコピー</button>' +
      '<a class="sh__b" id="sh-dl" download="tokyostation.png" href="#">💾 画像を保存</a>' +
    "</div>" +
    '<p class="mini">スマホは各ボタンで共有シートが開き、画像と文を一緒に渡せます。PC の X は画像をクリップボードに入れて投稿画面を開きます（貼り付けるだけ）。' +
    "画像の右下にはクレジット「" + esc(CREDIT) + "」、左上にサイトのURLが入ります。</p></div>");
  var cur = { blob: null, dataUrl: null };
  if (RG.snsBind) RG.snsBind(m.querySelector(".snsp"), function () {
    var f = null; try { if (cur.blob) f = new File([cur.blob], "tokyostation.png", { type: "image/png" }); } catch (e) { f = null; }
    return { title: "東京ステーションガイド", text: "東京ステーションガイド " + CREDIT, url: link, file: f, blobUrl: cur.dataUrl, fileName: "tokyostation.png", kind: f ? "image" : "" };
  });
  RG.captureMap(function (blob, dataUrl) {
    var pv = $(".sh__pv", m); if (!pv) return;
    if (!blob) { pv.innerHTML = '<p class="mini">この端末では画像化できませんでした（リンクの共有はできます）。</p>'; return; }
    cur.blob = blob; cur.dataUrl = dataUrl;
    pv.innerHTML = '<img src="' + dataUrl + '" alt="地図のキャプチャ">';
    var dl = $("#sh-dl", m); if (dl) dl.href = dataUrl;
  });
  var cp = $("#sh-copy", m); if (cp) cp.addEventListener("click", function () {
    try { navigator.clipboard.writeText(text).then(function () { cp.textContent = "コピーしました"; }); } catch (e) { cp.textContent = link; }
  });
};

/* ヘッダーのボタン＋ URL の ?ll= で開始位置を復元 */
RG.shareInit = function () {
  var b = document.getElementById("btn-share");
  if (b && !b.__sh) { b.__sh = 1; b.addEventListener("click", RG.shareOpen); }
  try {
    var q = new URLSearchParams(location.search), ll = q.get("ll");
    if (ll && RG.Map && RG.Map.gotoLatLng) { var p = ll.split(","); setTimeout(function () { RG.Map.gotoLatLng(+p[0], +p[1], +q.get("w") || 300); }, 400); }
  } catch (e) {}
};
})(window.RG);
