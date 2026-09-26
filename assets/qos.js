/* =========================================================================
   v139: 端末と通信に合わせた «表示の軽さ»（QOS）
   ねらい: 速い回線・速い端末なら全部を一気に。速度制限中（月末のパケット規制など）や力の弱いスマホなら、
          «地図と駅» を最優先にして、残りは «じわじわ» または «押したときだけ» にする。誰でも待たずに使えるように。

   ■ 見るもの（どれも端末の中だけ。外へは送らない）
     通信: navigator.connection（Android の Chrome など）の «データセーバー»・回線の種類・下りの目安
          ＋ 実際に届いた速さ（最初に読む net.json と本体の «バイト数 ÷ かかった時間»）
          iPhone は connection が無いので «実際に届いた速さ» だけで決める
     端末: メモリ（deviceMemory）・CPU の数・起動にかかった時間（RG.bootTiming）
   ■ 決めるもの
     RG.QOS.net  … "fast" / "mid" / "slow"（1.5Mbps 未満・2G 相当）/ "save"（データセーバー）
     RG.QOS.dev  … "strong" / "weak"
     RG.QOS.lite() … 通信を節約する（写真は押したときだけ・追加データはじわじわ・書体は端末のもの）
     RG.QOS.weak() … 描く量を控えめにする（駅名・印の数を 3 割減らす・作業の区切りを短く）
     <html> に qos-lite / qos-weak の印（CSS から使える）
   ■ 利用者が選べる: 設定 → «表示の軽さ» 自動（おすすめ）／しっかり表示／軽く（通信を節約）
   ========================================================================= */
(function (RG) {
"use strict";
var C = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
var KEY = "tsg.qos";
function saved() { try { var v = localStorage.getItem(KEY); return v === "full" || v === "lite" ? v : "auto"; } catch (e) { return "auto"; } }
var Q = RG.QOS = { mode: saved(), net: "fast", dev: "strong", kbps: 0, why: "" };

/* 実際に届いた速さ（kbps）。キャッシュから出たもの（transferSize が小さい）は数えない */
function measured() {
  var best = 0;
  try {
    (performance.getEntriesByType("resource") || []).forEach(function (e) {
      if (!/net\.json|app\.bundle\.js|app\.extra\.js|app(\.min)?\.css/.test(e.name)) return;
      var bytes = e.transferSize || 0, ms = e.responseEnd - e.responseStart;
      if (bytes < 30000 || ms < 30) return;
      var k = bytes * 8 / ms;                                         // bit/ms = kbps
      if (k > best) best = k;
    });
  } catch (e) {}
  return Math.round(best);
}
function netClass() {
  if (C && C.saveData) { Q.why = "データセーバーがオン"; return "save"; }
  var et = C && C.effectiveType, k = measured(); Q.kbps = k;
  if (et === "slow-2g" || et === "2g") { Q.why = "回線が 2G 相当"; return "slow"; }
  if (k && k < 1500) { Q.why = "届く速さが約 " + (k >= 1000 ? (k / 1000).toFixed(1) + "Mbps" : k + "kbps"); return "slow"; }
  if (!k && C && C.downlink && C.downlink < 1.2) { Q.why = "回線の目安が " + C.downlink + "Mbps"; return "slow"; }
  if (et === "3g" || (k && k < 5000)) { Q.why = ""; return "mid"; }
  Q.why = ""; return "fast";
}
function devClass() {
  var mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  if (mem && mem <= 2) return "weak";
  if (cores && cores <= 4 && mem && mem <= 4) return "weak";
  var bt = (RG.bootTiming || []).reduce(function (a, x) { return a + x[1]; }, 0);
  if (bt > 900) return "weak";                                        // 起動の作業だけで 0.9 秒以上かかった
  return "strong";
}
Q.lite = function () { return Q.mode === "lite" || (Q.mode === "auto" && (Q.net === "slow" || Q.net === "save")); };
Q.weak = function () { return Q.mode === "lite" || (Q.mode === "auto" && Q.dev === "weak"); };
Q.full = function () { return Q.mode === "full"; };
function paint() {
  var h = document.documentElement;
  h.classList.toggle("qos-lite", Q.lite());
  h.classList.toggle("qos-weak", Q.weak());
}
var told = false;
Q.update = function (why) {
  var was = Q.lite();
  Q.net = netClass(); Q.dev = devClass(); paint();
  if (Q.lite() !== was) document.dispatchEvent(new CustomEvent("rg:qos", { detail: { lite: Q.lite(), weak: Q.weak() } }));
  /* 自動で軽くしたときは 1 回だけ、そっと知らせる */
  if (Q.mode === "auto" && Q.lite() && !told && RG.tripStatus) {
    told = true;
    RG.tripStatus("📶 通信がゆっくりなので «軽い表示» にしています（" + (Q.why || "自動") + "）。写真は押したときだけ読みます。設定で変えられます", "info", 6000);
  }
  return Q;
};
Q.set = function (m) {
  Q.mode = m === "full" || m === "lite" ? m : "auto";
  try { if (Q.mode === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, Q.mode); } catch (e) {}
  Q.update();
  document.dispatchEvent(new CustomEvent("rg:qos", { detail: { lite: Q.lite(), weak: Q.weak() } }));
};
Q.label = function () {
  var a = Q.mode === "full" ? "しっかり表示" : Q.mode === "lite" ? "軽く（通信を節約）" : "自動";
  var now = Q.lite() ? "いまは «軽い表示»" + (Q.why ? "（" + Q.why + "）" : "") : "いまは «しっかり表示»";
  return a + " — " + now + (Q.weak() && !Q.lite() ? "・描く量を控えめ" : "");
};
if (C && C.addEventListener) C.addEventListener("change", function () { Q.update("change"); });
paint();
Q.update();
})(window.RG);
