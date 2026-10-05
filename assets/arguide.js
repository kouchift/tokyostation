/* =========================================================================
   v150: 📷 AR で方角を見る（カメラ越しに «目的地はあっち・直線で何 m»）
   ・カメラ（背面）の映像に、目的地の方角の矢印と直線距離を重ねる。位置は GPS、向きは端末のコンパス
   ・出すのは «本当に測った値» だけ。位置の精度（±m）も出し、精度が悪いとき（屋内・ビルの谷間）はそう書く
     ※ 道順ではなく «直線の方角»。屋内の現在地はブラウザでは測れないので、駅の中の案内は «構内図»（indoor.js）で
   ・iPhone は «押したとき» にコンパスの許可を求める必要がある（DeviceOrientationEvent.requestPermission）
   ・Android は deviceorientationabsolute（北が基準の向き）を使う。取れなければ «方角が取れない» と出して、北を上にした矢印にする
   ・閉じたら（✕・戻る・画面を離れた）カメラ・GPS・センサーを必ず止める
   ・入口: どのカードでも [data-ar] のボタン（RG.arBtn が作る）。地図アプリで開くボタンの横にも自動で付く
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var S = null;                                                       // 動いている間の状態（閉じたら null）
function km(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; }
function bearing(la1, lo1, la2, lo2) {
  var r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r),
      x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
var DIR8 = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
function dir8(b) { return DIR8[Math.round(b / 45) % 8]; }
function norm(d) { d = (d + 540) % 360 - 180; return d; }          // -180〜180
/* 端末の背中（カメラの向き）の方位。W3C の DeviceOrientation 仕様の例の式（alpha が北基準のとき） */
function headingOf(a, b, g) {
  var r = Math.PI / 180; a *= r; b *= r; g *= r;
  var cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  var rA = -cA * sG - sA * sB * cG, rB = -sA * sG + cA * sB * cG;
  return (Math.atan2(rA, rB) / r + 360) % 360;
}
function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km"; }

RG.arBtn = function (n, la, lo) {
  if (la == null || lo == null) return "";
  return '<button class="lnk arb" type="button" data-ar="' + esc(n || "") + '" data-ar-la="' + la + '" data-ar-lo="' + lo + '"><span>📷</span>AR で方角を見る</button>';
};
function supported() { return !!(navigator.geolocation); }

RG.arOpen = function (o) {
  if (S) close();
  if (!supported()) { if (RG.tripStatus) RG.tripStatus("この端末では現在地が取れないため、AR の方角案内は使えません。", "warn", 5000); return; }
  S = { n: o.n || "目的地", la: +o.la, lo: +o.lo, nav: !!o.nav, pos: null, acc: null, head: null, hs: null, beta: null, stream: null, watch: null, raf: 0, gotHead: false, t0: Date.now() };
  var ov = document.createElement("div"); ov.className = "arv"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "AR で方角を見る");
  ov.innerHTML = '<video class="arv__v" playsinline muted autoplay></video>' +
    '<div class="arv__pin" hidden><b></b><span></span></div>' +
    '<div class="arv__top"><button class="arv__x" type="button" aria-label="閉じる">' + (S.nav ? "🗺️ 地図に戻る" : "✕ 地図に戻る") + '</button><span class="arv__acc">📡 現在地を調べています…</span>' +
      (S.nav ? '<span class="arv__nav">🧭 案内は続いています。つぎの目印：<b class="arv__tn">' + esc(S.n) + "</b></span>" : "") + "</div>" +
    '<div class="arv__panel"><div class="arv__arrow" aria-hidden="true"><i></i></div>' +
      '<div class="arv__txt"><div class="arv__n">' + esc(S.n) + '</div><div class="arv__d">—</div><div class="arv__h">スマホを立てて、周りを見わたしてください</div></div></div>' +
    (S.nav ? '<div class="arv__tools"><div class="arv__step"></div>' +
      '<button class="arv__x" type="button" data-arv="detail">📋 移動の詳細</button>' +
      '<button class="arv__x arv__x--stop" type="button" data-arv="stop">案内をやめる</button></div>' : "") +
    '<p class="arv__note">直線の方角と距離です（道なりではありません）。位置は GPS、向きはスマホのコンパスで測っています。' + (S.nav ? "屋内や地下では取れないので、分かりにくいときは地図に戻ってください。" : "") + "</p>";
  document.body.appendChild(ov); S.ov = ov;
  ov.querySelector(".arv__x").addEventListener("click", function () { close(); if (S === null && o.nav && RG.tripStatus) RG.tripStatus("地図に戻りました。案内は続いています。", "info", 2500); });
  /* v164: 案内中（navui.js から）は «移動の詳細» と «案内をやめる» も置く。閉じても案内（nav.js）は続く */
  var bd = ov.querySelector('[data-arv="detail"]'); if (bd) bd.addEventListener("click", function () { close(); if (RG.NavUI) RG.NavUI.openDetail(); });
  var bs = ov.querySelector('[data-arv="stop"]'); if (bs) bs.addEventListener("click", function () { close(); if (RG.stopNav) RG.stopNav(); });
  if (S.nav) stepText();
  /* 1) コンパス（iPhone は押したこの手番で許可を求める） */
  var DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") {
    DOE.requestPermission().then(function (st) { if (st === "granted") listen(); else noHead("コンパスの利用が許可されませんでした"); }).catch(function () { noHead("コンパスを使えませんでした"); });
  } else listen();
  /* 2) カメラ（だめでも続ける: 暗い背景で矢印だけ出す） */
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(function (st) {
      if (!S) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      S.stream = st; var v = ov.querySelector(".arv__v"); v.srcObject = st; var p = v.play(); if (p && p.catch) p.catch(function () {});
    }).catch(function () { ov.classList.add("arv--nocam"); noCam(); });
  } else { ov.classList.add("arv--nocam"); noCam(); }
  function noCam() { var a = ov.querySelector(".arv__note"); if (a) a.textContent = "カメラを使えませんでした（許可がないか、この端末では使えません）。矢印と距離だけ出します。分かりにくいときは «地図に戻る» を押してください。"; }
  /* 3) GPS */
  S.watch = navigator.geolocation.watchPosition(function (p) {
    if (!S) return; S.pos = [p.coords.latitude, p.coords.longitude]; S.acc = p.coords.accuracy; paint();
  }, function (e) {
    if (!S) return; var a = ov.querySelector(".arv__acc");
    a.textContent = e.code === 1 ? "⚠️ 現在地の利用が許可されていません（設定で許可してください）" : "⚠️ 現在地が取れません（屋内や地下では取れないことがあります）";
    a.classList.add("warn");
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", close);
  setTimeout(function () { if (S && !S.gotHead) noHead("この端末では方角（コンパス）が取れません"); }, 2500);
  if (RG.track) try { RG.track("ar", S.n); } catch (e) {}
};
function listen() {
  if (!S) return;
  S.onAbs = function (e) { if (e.alpha == null) return; S.abs = true; setHead(headingOf(e.alpha, e.beta || 0, e.gamma || 0), e.beta); };
  S.onOri = function (e) {
    if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) { setHead(e.webkitCompassHeading, e.beta); return; }   // iPhone
    if (e.absolute && e.alpha != null && !S.abs) setHead(headingOf(e.alpha, e.beta || 0, e.gamma || 0), e.beta);
  };
  window.addEventListener("deviceorientationabsolute", S.onAbs, true);
  window.addEventListener("deviceorientation", S.onOri, true);
}
function setHead(h, beta) {
  if (!S) return;
  var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;   // 横向きに持ったとき
  h = (h + ang + 360) % 360;
  S.gotHead = true; S.beta = beta;
  S.hs = S.hs == null ? h : (S.hs + norm(h - S.hs) * 0.25 + 360) % 360;   // 少しなめらかに（手ぶれ）
  if (!S.raf) S.raf = requestAnimationFrame(function () { if (S) { S.raf = 0; paint(); } });
}
function noHead(msg) { if (!S || S.gotHead) return; S.noHead = msg; paint(); }
function onHide() { if (document.hidden) close(); }
function paint() {
  if (!S) return;
  var ov = S.ov, a = ov.querySelector(".arv__acc"), d = ov.querySelector(".arv__d"), h = ov.querySelector(".arv__h"), ar = ov.querySelector(".arv__arrow i"), pin = ov.querySelector(".arv__pin");
  if (!S.pos) return;
  var m = km(S.pos[0], S.pos[1], S.la, S.lo) * 1000, b = bearing(S.pos[0], S.pos[1], S.la, S.lo), acc = Math.round(S.acc || 0);
  a.textContent = "📡 位置の精度 ±" + acc + " m" + (acc > 100 ? (S.nav ? "（低い: 屋内かもしれません。地図のほうが確実です）" : "（低い: 屋内・ビルの谷間では大きくずれます）") : "");
  a.classList.toggle("warn", acc > 100);
  var near = m < Math.max(30, acc);
  d.textContent = near ? "このあたりです（位置の精度の範囲内）" : "直線で " + fmtDist(m) + "・" + dir8(b) + "の方角" + (m < 3000 ? "（歩いて約 " + Math.max(1, Math.round(m * 1.3 / 80)) + " 分）" : "");
  if (S.hs == null) {                                                // 方角が取れない: 北を上にした矢印（地図と同じ見かた）
    ar.style.transform = "rotate(" + b + "deg)";
    h.textContent = (S.noHead || "方角を調べています…") + "。矢印は «北が上» のときの向きです";
    pin.hidden = true; return;
  }
  var rel = norm(b - S.hs);
  ar.style.transform = "rotate(" + rel + "deg)";
  var up = S.beta == null || (S.beta > 50 && S.beta < 130);
  h.textContent = near ? "目的地の近くです。周りの案内表示も見てください" : Math.abs(rel) < 12 ? "▲ このまままっすぐの方角です" : (rel > 0 ? "右" : "左") + "へ約 " + Math.round(Math.abs(rel)) + "° 向きを変えてください";
  var FOV = 60;                                                      // カメラの横の見える角度（だいたい）
  if (up && Math.abs(rel) < FOV / 2 && !near) {
    pin.hidden = false; pin.style.left = (50 + rel / FOV * 100) + "%";
    pin.querySelector("b").textContent = "📍 " + S.n; pin.querySelector("span").textContent = fmtDist(m);
  } else pin.hidden = true;
}
/* v164: 案内中に «つぎの目印» が進んだら、矢印の先を変える（navui.js の update から） */
function stepText() { if (!S || !S.nav) return; var e = S.ov.querySelector(".arv__step"); if (e && RG.NavUI && RG.NavUI.nextStepText) e.textContent = RG.NavUI.nextStepText(); }
RG.arRetarget = function (n, la, lo) {
  if (!S || !S.nav) return;
  if (S.n !== n || S.la !== +la || S.lo !== +lo) {
    S.n = n || S.n; S.la = +la; S.lo = +lo;
    S.ov.querySelector(".arv__n").textContent = S.n;
    var tn = S.ov.querySelector(".arv__tn"); if (tn) tn.textContent = S.n;
  }
  stepText(); paint();
};
RG.arIsOpen = function () { return !!S; };
function close() {
  if (!S) return;
  var s = S; S = null;
  if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
  if (s.watch != null) navigator.geolocation.clearWatch(s.watch);
  if (s.onAbs) window.removeEventListener("deviceorientationabsolute", s.onAbs, true);
  if (s.onOri) window.removeEventListener("deviceorientation", s.onOri, true);
  if (s.raf) cancelAnimationFrame(s.raf);
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("pagehide", close);
  var v = s.ov.querySelector("video"); if (v) v.srcObject = null;
  s.ov.remove();
}
RG.arClose = close;
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-ar]"); if (!b) return;
  e.preventDefault();
  var n = b.getAttribute("data-ar");
  if (!n) { var t = document.querySelector(".modal.show #modal-title"); n = t ? t.textContent.replace(/^[^\w぀-鿿]+/, "") : "目的地"; }
  RG.arOpen({ n: n, la: b.getAttribute("data-ar-la"), lo: b.getAttribute("data-ar-lo") });
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S) close(); });
})(window.RG);
