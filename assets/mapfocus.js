/* =========================================================================
   地図ファースト（v102）— 入口カードの折りたたみ と «地図を広く»
   ・入口カード（heroSearch）は full（いつものカード）／mini（1 行のピル）の 2 状態。
       - 地図をドラッグ・ピンチ・ホイールで動かしたら自動で mini（カードが地図をふさがないように）
       - ルート比較を始めたとき、スマホで駅カード・スポット・現地モードを開いたときも mini
       - ピルを押すと full に戻る。カード右上の ▴ でたたむと «常に mini» を覚える（RG.settings.heroFold = "mini"）
   ・«地図を広く»（body.mapfocus）: ヘッダー・出発バー・スポット帯・下のチップ・ヒントなどを消し、
     地図＋ピル＋ズームボタン＋探索だけにする。ズームバーの ⛶ で出入り（Esc でも戻る）。RG.settings.mapFocus に保存
   ・ヒント「駅をタップで詳細…」は、いちど地図を動かしたら文を消してズーム段だけ残す（タッチ端末）
   ・44px・aria-expanded／aria-pressed・キーボード対応
   v103 細身化（スマホ ≤720px・body.slim）:
   ・ヘッダー 60→44px、出発バーはルート比較を始めるまで出さない（設定で «いつも表示» にもできる）、
     «📍 スポットをさがす» の帯はやめて地図の上の小さなボタンに（選んでいる数を出す）、ズームボタンを小さく
   ・地図の高さが変わったら（バーの出入り・パネルの開閉）viewBox の縦横比を合わせ直す（ResizeObserver）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$;
var hero = null, pill = null, fold = null, focusBtn = null, mode = "full", inited = false;
function mobile() { return window.matchMedia("(max-width:720px)").matches; }
function pref() { return (RG.settings && RG.settings.heroFold) || "auto"; }
function save() { if (RG.saveSettings) try { RG.saveSettings(); } catch (e) {} }
function pillText() {
  var inp = $("#hero-q"), v = inp && inp.value ? inp.value.trim() : "";
  if (v) return v;
  var h1 = hero && hero.querySelector("h1");
  return h1 ? h1.textContent.replace(/\s+/g, "") : "東京駅から、どこへ行く？";
}
function paintPill() { if (!pill) return; var b = pill.querySelector("b"); if (b) b.textContent = pillText(); }
function apply(m, why) {
  if (!hero) return;
  mode = m;
  document.body.classList.toggle("hero-mini", m === "mini");
  hero.classList.toggle("heroSearch--mini", m === "mini");
  if (pill) { pill.hidden = m !== "mini"; paintPill(); }
  if (fold) { fold.setAttribute("aria-expanded", m === "mini" ? "false" : "true"); }
  if (m === "mini") {
    var sug = $("#hero-sug"); if (sug) sug.hidden = true;
    var inp = $("#hero-q"); if (inp && document.activeElement === inp) inp.blur();
  }
  document.dispatchEvent(new CustomEvent("rg:heromode", { detail: { mode: m, why: why || "" } }));
}
RG.heroMode = function () { return mode; };
/* たたむ。why: drag／route／card／focus／user。設定が "full"（常に表示）のときは自動ではたたまない */
RG.heroFold = function (why) {
  if (!hero || mode === "mini") return;
  if (why !== "user" && why !== "focus" && pref() === "full") return;
  apply("mini", why);
};
RG.heroExpand = function (focus) {
  if (!hero) return;
  if (mode !== "full") apply("full", "user");
  if (focus) { var inp = $("#hero-q"); if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }, 60); }
};
RG.heroToggle = function () { if (mode === "mini") RG.heroExpand(false); else RG.heroFold("user"); };

/* ---- «地図を広く» ---- */
function paintFocus(on) {
  document.body.classList.toggle("mapfocus", !!on);
  if (focusBtn) {
    focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
    focusBtn.setAttribute("aria-label", on ? "ふつうの画面に戻す（ヘッダーとバーを出す）" : "地図を広く（ヘッダーとバーを隠す）");
    focusBtn.title = on ? "ふつうの画面に戻す" : "地図を広く";
    var ic = focusBtn.querySelector(".ms"); if (ic) ic.textContent = on ? "fullscreen_exit" : "fullscreen";
  }
  // 地図の縦横比を合わせ直す（ヘッダーぶん高さが変わる）
  setTimeout(function () { if (RG.syncAspect) RG.syncAspect(); try { window.dispatchEvent(new Event("resize")); } catch (e) {} }, 40);
  setTimeout(function () { if (RG.syncAspect) RG.syncAspect(); }, 400);
}
RG.mapFocus = function () { return document.body.classList.contains("mapfocus"); };
RG.setMapFocus = function (on, remember) {
  on = !!on;
  paintFocus(on);
  if (on) RG.heroFold("focus");
  if (remember !== false && RG.settings) { RG.settings.mapFocus = on; save(); }
  if (RG.tripStatus && remember !== false) RG.tripStatus(on ? "⛶ 地図を広くしました。右下の ⛶ か Esc で戻ります" : "ふつうの画面に戻しました", "info", 2600);
  document.dispatchEvent(new CustomEvent("rg:mapfocus", { detail: { on: on } }));
};

/* ---- 設定パネルの節 ---- */
RG.mapFocusSwitchHTML = function () {
  var p = pref();
  return '<div class="set__sec"><h4>🗺️ 地図ファースト（v102）</h4>' +
    '<p class="set__d">入口カード「東京駅から、どこへ行く？」の出しかたと、地図だけの画面。</p>' +
    '<div class="set__seg" role="radiogroup" aria-label="入口カードの出しかた">' +
      ['auto|自動でたたむ|地図を動かしたら 1 行に', 'mini|いつも小さく|起動時から 1 行。押すと開く', 'full|いつも表示|自動ではたたまない'].map(function (s) {
        var a = s.split("|");
        return '<label class="set__segi"><input type="radio" name="gs-herofold" value="' + a[0] + '"' + (p === a[0] ? " checked" : "") + "><b>" + a[1] + "</b><small>" + a[2] + "</small></label>";
      }).join("") + "</div>" +
    '<label class="set__sw"><input id="gs-mapfocus" type="checkbox"' + (RG.mapFocus() ? " checked" : "") + "> ⛶ 地図を広く（ヘッダー・出発バー・下のチップを隠す。右下の ⛶ でも切り替え）</label>" +
    '<label class="set__sw"><input id="gs-tripalways" type="checkbox"' + (RG.settings && RG.settings.tripAlways ? " checked" : "") + "> 🧭 出発バー（出発地・時刻・攻めかた）をスマホでもいつも出す（既定: ルート比較を始めたら出る）</label></div>";
};
RG.mapFocusSwitchBind = function (root) {
  Array.prototype.forEach.call(root.querySelectorAll('input[name="gs-herofold"]'), function (r) {
    r.addEventListener("change", function () {
      if (!r.checked) return;
      if (RG.settings) { RG.settings.heroFold = r.value; save(); }
      if (r.value === "mini") RG.heroFold("user"); else if (r.value === "full") RG.heroExpand(false);
    });
  });
  var f = $("#gs-mapfocus", root); if (f) f.addEventListener("change", function () { RG.setMapFocus(f.checked); });
  var t = $("#gs-tripalways", root); if (t) t.addEventListener("change", function () { if (RG.settings) { RG.settings.tripAlways = t.checked; save(); } RG.slimApply(); });
};

/* ---- v103: 細身化（スマホ） ---- */
var slimMQ = window.matchMedia ? window.matchMedia("(max-width:720px)") : null;
RG.slimApply = function () {
  var on = !!(slimMQ && slimMQ.matches);
  document.body.classList.toggle("slim", on);
  document.body.classList.toggle("trip-always", !!(RG.settings && RG.settings.tripAlways));
};
RG.slimSpotHtml = function () {
  if (!(slimMQ && slimMQ.matches)) return "";
  var n = ((RG.settings && RG.settings.genres) || []).filter(function (x) { return x !== "__none__"; }).length;
  return '<button class="qb__open qb__spot" type="button" id="qb-spot" aria-label="スポットをさがす（ジャンルをえらぶ）"' + (n ? ' data-n="' + n + '"' : "") + ">📍 スポット" + (n ? '<b class="qb__n">' + n + "</b>" : "") + "</button>";
};
RG.slimSpotSync = function () {
  var b = $("#qb-spot"); if (!b) return;
  var n = ((RG.settings && RG.settings.genres) || []).filter(function (x) { return x !== "__none__"; }).length;
  var old = b.querySelector(".qb__n"); if (old) old.remove();
  if (n) { var k = document.createElement("b"); k.className = "qb__n"; k.textContent = n; b.appendChild(k); b.setAttribute("data-n", n); } else b.removeAttribute("data-n");
};

/* ---- 起動 ---- */
RG.mapFocusInit = function () {
  if (inited) return; inited = true;
  hero = $("#hero"); if (!hero) return;
  // 1 行のピル（mini のときだけ見える）
  pill = document.createElement("button");
  pill.type = "button"; pill.className = "heroSearch__pill"; pill.id = "hero-pill"; pill.hidden = true;
  pill.setAttribute("aria-label", "行き先の検索を開く");
  pill.innerHTML = '<span class="ms" aria-hidden="true">search</span><b></b><i class="ms" aria-hidden="true">expand_more</i>';
  pill.addEventListener("click", function () { RG.heroExpand(!mobile()); if (RG.settings && RG.settings.heroFold === "mini") { /* «いつも小さく» は開いても設定は変えない */ } });
  hero.insertBefore(pill, hero.firstChild);
  // たたむボタン（見出しの行の右）
  var eyebrow = hero.querySelector(".heroSearch__eyebrow");
  fold = document.createElement("button");
  fold.type = "button"; fold.className = "heroSearch__fold"; fold.id = "hero-fold";
  fold.setAttribute("aria-label", "入口をたたんで地図を広く見る"); fold.title = "たたむ（地図を広く）"; fold.setAttribute("aria-expanded", "true");
  fold.innerHTML = '<span class="ms" aria-hidden="true">expand_less</span>';
  fold.addEventListener("click", function () { RG.heroFold("user"); if (RG.settings) { RG.settings.heroFold = "mini"; save(); } });
  (eyebrow || hero).appendChild(fold);
  var inp = $("#hero-q"); if (inp) inp.addEventListener("input", paintPill);
  // 地図を動かしたら自動でたたむ（ボタンの上で始まった操作は数えない）
  var wrap = $(".mapwrap"), start = null;
  if (wrap) {
    wrap.addEventListener("pointerdown", function (e) {
      if (hero.contains(e.target)) { start = null; return; }
      if (e.target.closest && e.target.closest("button,a,input,.zoombar,.quickbar,.hint,.poicount,.attrib,.onsite,.cvsbar")) { start = null; return; }
      start = { x: e.clientX, y: e.clientY };
    }, true);
    wrap.addEventListener("pointermove", function (e) {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 12) { start = null; RG.heroFold("drag"); markUsed(); }
    }, true);
    wrap.addEventListener("pointerup", function () { start = null; }, true);
    wrap.addEventListener("wheel", function (e) { if (!hero.contains(e.target)) { RG.heroFold("drag"); markUsed(); } }, { passive: true, capture: true });
    wrap.addEventListener("touchstart", function (e) { if (e.touches && e.touches.length >= 2) { RG.heroFold("drag"); markUsed(); } }, { passive: true, capture: true });
  }
  // ルート比較を始めたら（body.route-active）たたむ
  var wasRoute = document.body.classList.contains("route-active");
  if (window.MutationObserver) new MutationObserver(function () {
    var now = document.body.classList.contains("route-active");
    if (now && !wasRoute) RG.heroFold("route");   // «付いた瞬間» だけ（開き直したあとに再びたたまないように）
    wasRoute = now;
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // スマホ: 駅カード・スポット・現地モードを開いたらたたむ
  function wrapFn(obj, key, why) {
    if (!obj || typeof obj[key] !== "function" || obj[key].__mf) return;
    var f = obj[key]; obj[key] = function () { var r = f.apply(this, arguments); if (mobile()) RG.heroFold(why); return r; }; obj[key].__mf = 1;
  }
  wrapFn(RG.Card, "open", "card"); wrapFn(RG, "showSpot", "card"); wrapFn(RG.onsite, "open", "card");
  // ヒントの文は、地図を使い始めたら消す（ズーム段だけ残す）
  var hint = $(".hint");
  if (hint) Array.prototype.slice.call(hint.childNodes).forEach(function (n) { if (n.nodeType === 3 && n.textContent.trim()) { var s = document.createElement("span"); s.className = "hint__t"; s.textContent = n.textContent; hint.replaceChild(s, n); } });
  // ズームバーの ⛶
  focusBtn = $("#zfocus");
  if (focusBtn) focusBtn.addEventListener("click", function () { RG.setMapFocus(!RG.mapFocus()); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !RG.mapFocus()) return;
    if (document.querySelector(".modal.show, #sheet.show, #onsite:not([hidden])")) return;   // 先に開いているものを閉じる番
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    RG.setMapFocus(false);
  });
  // v103: 細身化（スマホ）。浮きボタン «📍 スポット» はジャンル一覧を開く
  RG.slimApply();
  if (slimMQ && slimMQ.addEventListener) slimMQ.addEventListener("change", function () { RG.slimApply(); if (RG.renderQuick) RG.renderQuick(); });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#qb-spot"); if (!b) return;
    e.preventDefault(); RG.__grpShow = !RG.__grpShow; if (RG.buildGroupBar) RG.buildGroupBar();
    var gb = $("#groupbar"); if (gb && RG.__grpShow) try { gb.scrollIntoView({ block: "nearest" }); } catch (err) {}
  });
  // 地図の高さが変わったら viewBox の縦横比を合わせ直す（バーの出入り・パネルの開閉。タップ位置がずれないように）
  if (wrap && window.ResizeObserver) { var rt = null; new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { if (RG.syncAspect) RG.syncAspect(); }, 60); }).observe(wrap); }
  // 起動時の状態
  var p = pref();
  if (RG.settings && RG.settings.mapFocus) { paintFocus(true); apply("mini", "focus"); }
  else if (p === "mini" || (document.body.classList.contains("route-active"))) apply("mini", "boot");
  else apply("full", "boot");
};
function markUsed() { document.body.classList.add("map-used"); }
})(window.RG);
