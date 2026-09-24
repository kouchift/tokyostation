/* =========================================================================
   駅名標ステッカー（v116）— SNS（Instagram・LINE・X のストーリーや画像）に貼る «透明な背景» の PNG
   ・駅名・読み・路線の色の帯・となりの駅（← 前 ｜ 次 →）を駅のホームの看板ふうに。まわりに白いふち（切り抜きシールの見た目）
   ・スポット版は «名前・ジャンル・最寄り駅» の丸い札
   ・端末の中だけで描く。スマホは共有シート（画像ファイルつき）、PC は保存
   ・右下に小さく «[渇]@tokyostation»（制作者の意図した表記。変えない）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, CREDIT = "[渇]@tokyostation";
var FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',system-ui,sans-serif";
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fitFont(c, s, maxW, size, weight) { var z = size; do { c.font = weight + " " + z + "px " + FONT; z -= 2; } while (z > 14 && c.measureText(s).width > maxW); return z + 2; }
function colorOf(line) { var c = (RG.lineColor || {})[line] || "#0055AD"; return c; }

/* 駅: いちばん «となり» の多い路線を選び、その路線の前後の駅 */
function stationInfo(id) {
  var s = RG.byId[id], adj = (RG.adj || {})[id] || [], by = {};
  adj.forEach(function (a) { if (a.line && RG.byId[a.to] && RG.byId[a.to].n !== s.n) (by[a.line] = by[a.line] || []).push(RG.byId[a.to].n); });
  var line = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || ((s.ls || []).indexOf(a) - (s.ls || []).indexOf(b)); })[0] || (s.ls || [])[0] || "";
  var nb = (by[line] || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
  return { s: s, line: line, prev: nb[0] || "", next: nb[1] || "" };
}
function drawStation(id) {
  var I = stationInfo(id), s = I.s, col = colorOf(I.line);
  var W = 1200, H = 560, P = 34, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var c = cv.getContext("2d");
  // 白いふち（切り抜きシール）→ 看板
  c.shadowColor = "rgba(0,0,0,.28)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
  rr(c, 6, 6, W - 12, H - 12, 46); c.fillStyle = "#fff"; c.fill();
  c.shadowColor = "transparent";
  rr(c, P, P, W - P * 2, H - P * 2, 26); c.fillStyle = "#FAFAFA"; c.fill(); c.lineWidth = 4; c.strokeStyle = "#D5D9E0"; c.stroke();
  // 駅名・読み
  c.fillStyle = "#1A1A1A"; c.textAlign = "center"; c.textBaseline = "middle";
  var z = fitFont(c, s.n, W - 200, 170, 900); c.fillText(s.n, W / 2, 190);
  if (s.k) { c.font = "700 44px " + FONT; c.fillStyle = "#555"; c.fillText(s.k, W / 2, 300); }
  // 路線の色の帯と、となりの駅
  var by = 340; c.fillStyle = col; c.fillRect(P, by, W - P * 2, 70);
  c.fillStyle = "#fff"; c.font = "800 40px " + FONT; c.textBaseline = "middle";
  c.textAlign = "left"; if (I.prev) c.fillText("◀ " + I.prev, P + 26, by + 36);
  c.textAlign = "right"; if (I.next) c.fillText(I.next + " ▶", W - P - 26, by + 36);
  c.textAlign = "center"; c.font = "700 30px " + FONT; c.fillStyle = "#333"; c.fillText(I.line, W / 2, by + 110);
  c.font = "600 22px " + FONT; c.fillStyle = "#9AA3AF"; c.textAlign = "right"; c.fillText(CREDIT, W - P - 18, H - P - 18);
  return { cv: cv, name: s.n + "駅_ステッカー.png", title: s.n + "駅" };
}
/* スポット: 丸い札 */
function drawSpot(p) {
  var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || { e: "📍", label: "", c: "#0055AD" };
  var near = RG.nearestStation ? RG.nearestStation(p.la, p.lo) : null;
  var W = 1000, H = 1000, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var c = cv.getContext("2d"), cx = W / 2, cy = H / 2;
  c.shadowColor = "rgba(0,0,0,.28)"; c.shadowBlur = 20; c.shadowOffsetY = 6;
  c.beginPath(); c.arc(cx, cy, 480, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.shadowColor = "transparent";
  c.beginPath(); c.arc(cx, cy, 440, 0, Math.PI * 2); c.fillStyle = g.c || "#0055AD"; c.fill();
  c.beginPath(); c.arc(cx, cy, 400, 0, Math.PI * 2); c.fillStyle = "#FFFFFF"; c.fill();
  c.textAlign = "center"; c.textBaseline = "middle";
  c.font = "150px serif"; c.fillText(g.e || "📍", cx, cy - 190);
  c.fillStyle = "#1A1A1A"; fitFont(c, p.n, 700, 110, 900); c.fillText(p.n, cx, cy + 10);
  c.font = "700 44px " + FONT; c.fillStyle = g.c || "#555"; c.fillText(g.label || p.t || "", cx, cy + 120);
  if (near) { c.font = "700 40px " + FONT; c.fillStyle = "#444"; c.fillText("🚉 " + near.t.n + "駅 徒歩 " + near.min + " 分", cx, cy + 200); }
  c.font = "600 26px " + FONT; c.fillStyle = "#9AA3AF"; c.fillText(CREDIT, cx, cy + 300);
  return { cv: cv, name: String(p.n).replace(/[\\/:*?"<>|]/g, "") + "_ステッカー.png", title: p.n };
}

function show(r) {
  var url = r.cv.toDataURL("image/png");
  var m = RG.openModal("🏷️ ステッカー", '<div class="stk"><div class="stk__prev"><img src="' + url + '" alt="' + esc(r.title) + ' のステッカー"></div>' +
    '<p class="set__d">背景が透明な PNG です。Instagram・LINE・X のストーリーや写真の上に貼れます（Instagram は «ステッカー» の «画像» から、LINE は写真の編集で）。</p>' +
    '<div class="sh__btns"><button class="sh__b" type="button" data-stk-share>📤 共有する</button>' +
    '<a class="sh__b" href="' + url + '" download="' + esc(r.name) + '">💾 保存する</a>' +
    '<button class="sh__b" type="button" data-stk-copy>📋 コピー</button></div><p class="rc__hint" data-stk-hint></p></div>');
  var hint = m.querySelector("[data-stk-hint]");
  r.cv.toBlob(function (blob) {
    var file = null; try { file = new File([blob], r.name, { type: "image/png" }); } catch (e) {}
    m.querySelector("[data-stk-share]").addEventListener("click", function () {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: r.title, text: r.title + " #東京ステーションガイド" }).catch(function () {});
      else { var a = document.createElement("a"); a.href = url; a.download = r.name; a.click(); hint.textContent = "この端末は画像つきの共有に対応していないので、保存しました。"; }
    });
    m.querySelector("[data-stk-copy]").addEventListener("click", function () {
      if (navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () { hint.textContent = "コピーしました。ストーリーや投稿の画面で貼り付けてください。"; }, function () { hint.textContent = "コピーできませんでした。«保存する» をお使いください。"; });
      else hint.textContent = "この端末はコピーに対応していません。«保存する» をお使いください。";
    });
  }, "image/png");
}
RG.stickerStation = function (id) { if (RG.byId[id]) show(drawStation(id)); };
RG.stickerSpot = function (p) { if (p && p.n) show(drawSpot(p)); };
RG.stickerDraw = { station: drawStation, spot: drawSpot };                   // 試験用
})(window.RG);
