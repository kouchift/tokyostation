/* =========================================================================
   郵便番号（v67〜）

   ■ できること
     ・地図に寄っているとき、カーソルの位置の郵便番号と町名を小さな札で出す（PC）
     ・スマホは 〒 ボタンで «郵便番号モード» にして、地図をタップすると札が出る
     ・札の「コピー」で 176-0021 の形でクリップボードへ
     ・検索窓に郵便番号を入れると、その場所へ地図が寄る（外部サービスに頼らない）
   ■ 仕組み（重くしないため）
     ・全国 27.6万件の町丁目の代表点を 0.2度の升目（1,352枚）に分けて置き、
       見えている升目だけ読む（1枚 gzip後 10〜50KB）。地図が 12km 幅より広いときは読まない
     ・郵便番号 → 座標の索引は上3桁ごとのファイル。番号が打たれたときだけ1枚読む
     ・«いちばん近い代表点» の番号を出す。町丁目の代表点なので、境目のあたりでは
       となりの町の番号になることがある（札にもそう書く）
   ■ 出典
     日本郵便 郵便番号データ／Geolonia 住所データ（CC BY 4.0・元は国土交通省 位置参照情報）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;
var CELL = 0.2, GRID = 0.01;
var tiles = {}, loading = {}, grid = {};     // grid: "la,lo"(0.01度) → [pt,...]
var chip = null, chipT = null, touchMode = false, lastKey = "";

function tileKey(la, lo) { return Math.floor(la * 5) + "_" + Math.floor(lo * 5); }
function addTile(rows) {
  rows.forEach(function (r) {
    var k = Math.floor(r[0] / GRID) + "," + Math.floor(r[1] / GRID);
    (grid[k] = grid[k] || []).push(r);
  });
}
function loadTile(k) {
  if (tiles[k] || loading[k]) return;
  loading[k] = 1;
  var url = "data/zip/t/" + k + ".json";
  fetch(RG.withV ? RG.withV(url) : url).then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (rows) { tiles[k] = rows.length; addTile(rows); })
    .catch(function () { tiles[k] = 0; })
    .then(function () { delete loading[k]; });
}
/* 見えている範囲の升目を読む（地図が 12km 幅より広いときは読まない） */
RG.zipLoadFor = function (bbox) {
  var span = Math.max(bbox.n - bbox.s, bbox.e - bbox.w);
  if (span > 0.14) return;
  var n = 0;
  for (var la = Math.floor(bbox.s * 5); la <= Math.floor(bbox.n * 5); la++)
    for (var lo = Math.floor(bbox.w * 5); lo <= Math.floor(bbox.e * 5); lo++) {
      if (++n > 9) return;
      loadTile(la + "_" + lo);
    }
};
function nearest(la, lo) {
  var ia = Math.floor(la / GRID), io = Math.floor(lo / GRID), best = null, bd = 1e9;
  var cosl = Math.cos(la * Math.PI / 180);
  for (var da = -1; da <= 1; da++) for (var dO = -1; dO <= 1; dO++) {
    var cell = grid[(ia + da) + "," + (io + dO)]; if (!cell) continue;
    for (var i = 0; i < cell.length; i++) {
      var r = cell[i], dy = (r[0] - la) * 111.0, dx = (r[1] - lo) * 111.32 * cosl, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r; }
    }
  }
  if (!best || bd > 0.9 * 0.9) return null;        // 900m 以内に代表点が無ければ出さない
  return { r: best, km: Math.sqrt(bd) };
}
function fmt(z) { return z.slice(0, 3) + "-" + z.slice(3); }
RG.zipAt = function (la, lo) { var h = nearest(la, lo); return h ? { zip: fmt(h.r[2]), town: h.r[3], approx: !!h.r[4], km: h.km } : null; };

/* ---- 札 ---- */
function ensureChip() {
  if (chip) return chip;
  chip = el("div", { class: "zipchip", role: "status" });
  chip.innerHTML = '<span class="zipchip__z"></span><span class="zipchip__t"></span>' +
    '<button class="zipchip__c" type="button" title="郵便番号をコピー">コピー</button>' +
    '<button class="zipchip__x" type="button" aria-label="閉じる">✕</button>';
  document.body.appendChild(chip);
  chip.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  chip.querySelector(".zipchip__c").addEventListener("click", function () {
    var z = chip.dataset.zip || "";
    copy(z, chip.querySelector(".zipchip__c"));
  });
  chip.querySelector(".zipchip__x").addEventListener("click", hide);
  return chip;
}
function copy(text, btn) {
  function done(ok) {
    if (btn) { btn.textContent = ok ? "コピーしました" : "コピーできません"; setTimeout(function () { btn.textContent = "コピー"; }, 1400); }
    if (RG.tripStatus) RG.tripStatus(ok ? "📋 〒" + text + " をコピーしました" : "コピーできませんでした。長押しで選んでください", ok ? "ok" : "warn", 2200);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
  else fallback();
  function fallback() {
    try { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove(); done(ok); }
    catch (e) { done(false); }
  }
}
function show(hit, cx, cy, sticky) {
  var c = ensureChip();
  c.dataset.zip = hit.zip;
  c.querySelector(".zipchip__z").textContent = "〒" + hit.zip;
  c.querySelector(".zipchip__t").textContent = hit.town + (hit.approx ? "（市区町村の代表番号）" : hit.km > 0.35 ? "（近くの町の番号）" : "");
  c.classList.toggle("sticky", !!sticky);
  var w = c.offsetWidth || 240, h = c.offsetHeight || 40;
  var x = Math.min(innerWidth - w - 8, Math.max(8, cx + 14)), y = cy - h - 12;
  if (y < 8) y = cy + 18;
  c.style.left = x + "px"; c.style.top = y + "px";
  c.classList.add("on");
}
function hide() { if (chip) { chip.classList.remove("on", "sticky"); } lastKey = ""; }
RG.zipHide = hide;

function pointToLatLng(cx, cy) {
  var wrap = document.querySelector(".mapwrap"), vb = RG.Map.viewBox(), r = wrap.getBoundingClientRect();
  var x = vb.x + (cx - r.left) / r.width * vb.w, y = vb.y + (cy - r.top) / r.height * vb.h;
  return RG.unproject(x, y);
}
function zoomOk() { return RG.zoomLevel && RG.zoomLevel() >= 3; }

RG.initZip = function () {
  var wrap = document.querySelector(".mapwrap"); if (!wrap) return;
  // PC：カーソルに追従（0.1秒に1回）
  var raf = 0, lastEv = null;
  wrap.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || touchMode) return;
    lastEv = e;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var ev = lastEv; if (!ev) return;
      if (!zoomOk() || wrap.classList.contains("dragging")) { if (chip && !chip.classList.contains("sticky")) hide(); return; }
      if (ev.target.closest && ev.target.closest("button,a,input,.quickbar,.zoombar,.poipop,.navbar,.heatlegend,.hint,.poicount")) { if (chip && !chip.classList.contains("sticky")) hide(); return; }
      if (chip && chip.classList.contains("sticky")) return;
      var q = pointToLatLng(ev.clientX, ev.clientY), hit = RG.zipAt(q.la, q.lo);
      if (!hit) { hide(); return; }
      var key = hit.zip + hit.town;
      show(hit, ev.clientX, ev.clientY, false);
      lastKey = key;
    });
  });
  wrap.addEventListener("pointerleave", function () { if (chip && !chip.classList.contains("sticky")) hide(); });
  // クリック／タップで «固定»（コピーしやすいように）。スマホは 〒 モードのときだけ
  wrap.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".node,.poi,.lm,button,a,input,.ln__hit,.adm,.b3n,.zipchip")) return;
    if (!zoomOk()) return;
    var isMouse = e.pointerType === "mouse" || !("ontouchstart" in window);
    if (!isMouse && !touchMode) return;
    var q = pointToLatLng(e.clientX, e.clientY), hit = RG.zipAt(q.la, q.lo);
    if (!hit) { if (touchMode && RG.tripStatus) RG.tripStatus("このあたりの郵便番号データはまだ読み込み中か、近くに町丁目がありません", "info", 2500); return; }
    show(hit, e.clientX, e.clientY, true);
  }, true);
  // 〒 ボタン（ズームボタンの列に足す）
  var zb = document.querySelector(".zoombar");
  if (zb) {
    var b = el("button", { id: "zipbtn", class: "sm", type: "button", "aria-label": "郵便番号を調べる", title: "郵便番号：地図をタップすると、その場所の郵便番号が出ます", text: "〒" });
    b.addEventListener("click", function () {
      touchMode = !touchMode; b.classList.toggle("on", touchMode);
      if (touchMode) {
        if (!zoomOk()) { RG.tripStatus && RG.tripStatus("〒 郵便番号は、地図をもう少し寄せると出せます（12km幅より狭く）", "info", 3200); }
        else RG.tripStatus && RG.tripStatus("〒 地図をタップすると、その場所の郵便番号が出ます", "info", 2600);
        RG.Map.lod && RG.Map.lod();
      } else hide();
    });
    zb.appendChild(b);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
};

/* 地図が動いたら：見えている升目を読む（lod から呼ばれる） */
RG.zipOnMove = function (bbox) { if (zoomOk()) RG.zipLoadFor(bbox); else if (chip && !chip.classList.contains("sticky")) hide(); };

/* ---- 検索：郵便番号 → 場所 ---- */
var idxCache = {};
RG.zipLookup = function (zip7, cb) {
  var p3 = zip7.slice(0, 3);
  function finish(d) { var r = d && d[zip7]; cb(r ? { la: r[0], lo: r[1], town: r[2] } : null, d); }
  if (idxCache[p3]) { finish(idxCache[p3]); return; }
  var url = "data/zip/i/" + p3 + ".json";
  fetch(RG.withV ? RG.withV(url) : url).then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) { idxCache[p3] = d; finish(d); })
    .catch(function () { idxCache[p3] = {}; finish(null); });
};

})(window.RG);
