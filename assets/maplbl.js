/* =========================================================================
   v144: 地図の文字を «地図とは別の重ね層»（HTML）で描く
   ねらい: SVG の <text> は、地図の表示範囲（viewBox）を変えるたびに «全部の文字の配置計算» がやり直しになる
          （文字の大きさが画面の倍率で決まるため）。駅名・道や川の名前・IC・区名などが 50〜100 個あると、
          描き直し 1 回の配置計算の 8〜9 割が文字だった。
   しくみ: 対象の SVG の文字（下の KIND）は «見えないまま»（display:none）にして、同じ文字を HTML の <span> で重ねる。
          各部品（app.js の駅名・roads.js の道の名前…）は、これまでどおり SVG の文字に位置・大きさ・表示を書くだけ。
          その変化を MutationObserver で受け取り、<span> に写す（色・太さなどは SVG の CSS から読む＝見た目の決まりは 1 か所のまま）
          表示範囲が変わったら、<span> は «位置（transform）» を変えるだけ（配置計算が起きない）。
          指で動かしている間は、重ね層にも地図と同じ transform をかける（app.js paintGesture）
   ・3D 表示（d3on）のときは使わない（SVG の文字に戻す）
   ・文字を押したとき（駅名・海の名前など、もともと押せたもの）は、元の SVG の文字に «押した» を伝える
   ========================================================================= */
(function (RG) {
"use strict";
var KIND = ["st-lbl", "poi__t", "ic__t", "hw__t", "kok__t", "kai__t", "trv__t", "trg__t", "tcur__t", "tsea", "adm__t", "jpadm__t", "geo__pn", "geo__mn", "kuni__t"];
var SEL = KIND.map(function (k) { return "text." + k; }).join(",");
var svg = null, layer = null, mo = null, on = false, dirty = [], raf = 0, T = null;
var act = [];                                  // いま出している <span> の元の SVG 文字

function isKind(t) { if (!t || t.tagName !== "text" || !t.classList) return false; for (var i = 0; i < KIND.length; i++) if (t.classList.contains(KIND[i])) return true; return false; }

/* 地図の座標 → 画面（重ね層）の px。viewBox は xMidYMid meet */
function frame() {
  var vb = RG.Map && RG.Map.viewBox ? RG.Map.viewBox() : null, ws = RG.mapWrapSize ? RG.mapWrapSize() : null;
  if (!vb || !ws || !ws.width) return null;
  var k = Math.min(ws.width / vb.w, ws.height / vb.h);
  return { x: vb.x, y: vb.y, k: k, ox: (ws.width - vb.w * k) / 2, oy: (ws.height - vb.h * k) / 2 };
}
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/* 見えるはずか（自分の display と、先祖の display）。自分の «見えないまま» は class «mlh» で付けている。
   先祖の結果は 1 回の flush の間だけ覚える（同じグループの文字が多いので） */
var gvis = null;
function ancVisible(p) {
  if (!p || p === svg) return !!p;
  var v = gvis.get(p); if (v !== undefined) return v;
  v = !(p.style && p.style.display === "none") && !cssHidden(p) && ancVisible(p.parentNode);
  gvis.set(p, v); return v;
}
/* CSS で隠すグループ（app.css の #map.blank / #map.airmode / .poi.hide）。getComputedStyle は重いので、決まりをここに写す */
var HIDE = { blank: ["edges", "nodes", "pois", "lms", "relief", "adminval"], airmode: ["edges", "nodes", "lms", "relief", "terra", "kuni", "roads", "jpadm", "adm-labels", "adminval"] };
function cssHidden(p) {
  var c = p.classList; if (!c) return false;
  if (c.contains("poi") && (c.contains("hide") || (svg.classList.contains("airmode") && !c.contains("poi--airport")))) return true;
  for (var m in HIDE) if (svg.classList.contains(m)) for (var i = 0; i < HIDE[m].length; i++) if (c.contains(HIDE[m][i])) return true;
  return false;
}
function shownish(t) {
  if (t.style.display === "none" || !t.textContent) return false;
  var p = t.parentNode;
  if (t.classList.contains("st-lbl") && p && p.classList && p.classList.contains("noname") && !/\b(sel|hub|pick|watch)\b/.test(p.getAttribute("class"))) return false;
  if (t.classList.contains("geo__pn") && document.documentElement.classList.contains("kuni-on")) return false;
  return ancVisible(p);
}
/* 色・太さなど（SVG の CSS がそのまま決める）。グループの透明度（駅の «うすく» など）もかける。
   決まりは class で決まるので、class の組み合わせごとに覚える（getComputedStyle は重い） */
var looks = {}, looksFor = "";
function look(t) {
  var p = t.parentNode, key = t.getAttribute("class") + "|" + (t.style.fill || "") + "|" + (p && p.getAttribute ? p.getAttribute("class") : "") + "|" + (p && p.style ? p.style.opacity : "");
  var L = looks[key]; if (L) return L;
  var cs = getComputedStyle(t), op = cs.opacity === "" ? 1 : num(cs.opacity);
  for (var q = p; q && q !== svg; q = q.parentNode) { var o = getComputedStyle(q).opacity; if (o !== "1" && o !== "") op *= num(o); }
  L = looks[key] = { c: cs.fill, s: cs.stroke, fw: cs.fontWeight, fi: cs.fontStyle, ff: cs.fontFamily, op: op, fs: num(cs.fontSize), sw: num(cs.strokeWidth), ls: num(cs.letterSpacing), anc: cs.textAnchor,
    pe: (cs.pointerEvents !== "none" && t.classList.contains("st-lbl")) || t.classList.contains("tsea") };
  return L;
}
function span(t) {
  var s = t.__mls;
  if (!s) {
    s = t.__mls = document.createElement("span"); s.className = "ml"; s.__t = t;
    /* v171: ここでは足さない。位置（transform）を決めてから足す（(0,0) に一度描かれてから動くと «画面のずれ»（CLS 0.76）に数えられる） */
  }
  return s;
}
/* Chrome 122 以前（と、それをもとにしたブラウザ）は、HTML の文字の «ふち» を文字の後ろに描けない（paint-order が効かない） */
var OLDPO = (function () { var m = /Chrome\/(\d+)/.exec(navigator.userAgent || ""); return !!m && +m[1] < 123; })();
function shadowHalo(w, c) { w = Math.max(0.8, Math.min(2.5, w)); var o = [], i, a; for (i = 0; i < 8; i++) { a = i * Math.PI / 4; o.push((Math.cos(a) * w).toFixed(2) + "px " + (Math.sin(a) * w).toFixed(2) + "px 0 " + c); } return o.join(","); }
function set(s, k, v) { var c = s.__c || (s.__c = {}); if (c[k] !== v) { c[k] = v; s.style.setProperty(k, v); } }

/* 1 つの SVG 文字を読む（読むだけ。書くのは apply） */
function read(t) {
  if (!shownish(t)) return null;
  var u = RG.__u || 1, L = look(t);
  var fs = num(t.style.getPropertyValue("font-size")) || L.fs, sw = num(t.style.getPropertyValue("stroke-width")) || L.sw, ls = num(t.style.getPropertyValue("letter-spacing")) || L.ls;
  var anc = t.getAttribute("text-anchor") || L.anc, dy = t.getAttribute("dy") || "0", tr = t.getAttribute("transform") || "", m = /rotate\(\s*([-\d.]+)/.exec(tr);
  return { L: L, txt: t.textContent, fs: fs / u, sw: sw / u, ls: ls / u, x: num(t.getAttribute("x")), y: num(t.getAttribute("y")), r: m ? num(m[1]) : 0,
           a: anc === "middle" ? "-50%" : anc === "end" ? "-100%" : "0", dy: /em$/.test(dy) ? num(dy) : num(dy) / (fs || 1) };
}
function apply(t, d, F) {
  var s = t.__mls;
  if (!d) { if (s && s.__on) { s.__on = false; s.style.display = "none"; } return; }
  s = span(t); var L = d.L;
  if (s.__txt !== d.txt) { s.__txt = d.txt; s.textContent = d.txt; }
  set(s, "font-size", d.fs.toFixed(1) + "px");
  set(s, "letter-spacing", d.ls ? d.ls.toFixed(2) + "px" : "normal");
  set(s, "color", L.c === "none" ? "transparent" : L.c);
  var halo = L.s && L.s !== "none" && d.sw;
  if (!OLDPO) set(s, "-webkit-text-stroke", halo ? d.sw.toFixed(2) + "px " + L.s : "0");
  else set(s, "text-shadow", halo ? shadowHalo(d.sw / 2, L.s) : "none");   // 古い Chrome は HTML の文字に paint-order が効かない → 影でふちどり
  set(s, "font-weight", L.fw); set(s, "font-style", L.fi); set(s, "font-family", L.ff);
  set(s, "opacity", String(Math.round(L.op * 100) / 100));
  set(s, "pointer-events", L.pe ? "auto" : "none");
  s.__x = d.x; s.__y = d.y; s.__r = d.r; s.__a = d.a; s.__dy = d.dy;
  if (!s.__on) { s.__on = true; s.style.display = ""; act.push(t); }
  place(s, F);
  if (!s.parentNode) layer.appendChild(s);   // v171: 位置が決まってから足す
}
function place(s, F) {
  if (!F) return;
  var x = (s.__x - F.x) * F.k + F.ox, y = (s.__y - F.y) * F.k + F.oy;
  /* v171: 位置は left/top で（transform だけだと、Chrome が «(0,0) から動いた» と数えて «画面のずれ»（CLS 0.76）になる）。回転と字の寄せは transform */
  var lt = x.toFixed(1) + "px," + y.toFixed(1) + "px";
  if (s.__lt !== lt) { s.__lt = lt; s.style.left = x.toFixed(1) + "px"; s.style.top = y.toFixed(1) + "px"; }
  var tr = (s.__r ? "rotate(" + s.__r.toFixed(1) + "deg) " : "") + "translate(" + s.__a + "," + (-0.82 + s.__dy).toFixed(2) + "em)";
  if (s.__tr !== tr) { s.__tr = tr; s.style.transform = tr; }
}
function flush() {
  raf = 0; if (!on) { dirty = []; return; }
  var F = frame(); if (!F) { raf = requestAnimationFrame(flush); return; }   // 地図の準備がまだ
  var list = dirty, D = [], i; dirty = [];
  var sk = svg.getAttribute("class") + "|" + document.documentElement.className; if (sk !== looksFor) { looksFor = sk; looks = {}; }   // 地図の class（白地図など）が変わったら、見た目を読み直す
  gvis = new Map();
  for (i = 0; i < list.length; i++) { var t = list[i]; t.__mlq = 0; D.push(t.isConnected ? read(t) : null); }   // まず全部読む（読む・書くを交互にすると、そのたびに見た目の計算が走る）
  gvis = null;
  for (i = 0; i < list.length; i++) apply(list[i], D[i], F);
  act = act.filter(function (t) { return t.__mls && t.__mls.__on && t.isConnected; });
}
function mark(t) { if (!t.__mlq) { t.__mlq = 1; dirty.push(t); } }
function markAll(root) { Array.prototype.forEach.call((root || svg).querySelectorAll(SEL), function (t) { if (!t.classList.contains("mlh")) t.classList.add("mlh"); mark(t); }); }
function kick() { if (!raf) raf = requestAnimationFrame(flush); }

function onMut(list) {
  var groups = false, svgStyle = false, svgClass = false;
  for (var i = 0; i < list.length; i++) {
    var r = list[i], t = r.target;
    if (r.type === "childList") {
      for (var j = 0; j < r.addedNodes.length; j++) {
        var a = r.addedNodes[j]; if (a.nodeType !== 1) continue;
        if (isKind(a)) { a.classList.add("mlh"); mark(a); }
        else if (a.querySelectorAll) markAll(a);
      }
      for (var j2 = 0; j2 < r.removedNodes.length; j2++) { var d = r.removedNodes[j2]; if (d.nodeType === 1) drop(d); }
      if (isKind(t)) mark(t);                       // 文字の中身が変わった
    } else if (r.type === "characterData") { var pt = t.parentNode; if (isKind(pt)) mark(pt); }
    else if (t === svg) { if (r.attributeName === "class") { mode(); svgClass = true; } else if (r.attributeName === "style") svgStyle = true; }   // --u（画面 1px の大きさ）などが変わった
    else if (isKind(t)) mark(t);
    else if (t.tagName === "g" || t.tagName === "svg") groups = true;   // グループの表示・うすさ・class が変わった → 中の文字を見直す
  }
  if (svgClass && on) markAll();                                      // 白地図・空の表示など → 出す文字が変わる
  else if (svgStyle) act.forEach(mark);
  if (groups) markGroups(list);
  if (dirty.length) kick();
}
function markGroups(list) { for (var i = 0; i < list.length; i++) { var g = list[i].target; if (list[i].type === "attributes" && g !== svg && (g.tagName === "g") && g.querySelectorAll) Array.prototype.forEach.call(g.querySelectorAll(SEL), mark); } }
function drop(n) {
  var ts = isKind(n) ? [n] : n.querySelectorAll ? Array.prototype.slice.call(n.querySelectorAll(SEL)) : [];
  ts.forEach(function (t) { if (t.__mls) { t.__mls.remove(); t.__mls = null; } });
}
/* 3D のときは SVG の文字に戻す */
function mode() {
  var want = !svg.classList.contains("d3on");
  if (want === on) return;
  on = want; svg.classList.toggle("mlon", on); layer.hidden = !on;
  if (on) { markAll(); kick(); }
}

RG.ML = {
  /* 表示範囲が変わった（commitView）→ 位置だけ付け直す */
  sync: function () {
    if (!on || !layer) return;
    layer.style.transform = "";
    var F = frame(); if (!F) return;
    for (var i = 0; i < act.length; i++) { var s = act[i].__mls; if (s && s.__on) place(s, F); }
  },
  /* 指で動かしている間: 地図と同じ transform */
  gesture: function (tr) { if (on && layer) layer.style.transform = tr; },
  refresh: function () { if (svg) { markAll(); kick(); } }
};
function init() {
  svg = document.getElementById("map"); var wrap = document.querySelector(".mapwrap");
  if (!svg || !wrap || !window.MutationObserver || layer) return;
  layer = document.createElement("div"); layer.className = "maplbl"; layer.setAttribute("aria-hidden", "true");
  svg.parentNode.insertBefore(layer, svg.nextSibling);
  layer.addEventListener("click", function (ev) {                          // 押せる文字（駅名・海の名前）は、元の SVG の文字に伝える
    var s = ev.target.closest && ev.target.closest(".ml"); if (!s || !s.__t) return;
    ev.stopPropagation(); var t = s.__t;
    t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY }));
  });
  mo = new MutationObserver(onMut);
  mo.observe(svg, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "x", "y", "transform", "class", "dy", "text-anchor"] });
  mode();
  if (on) { markAll(); kick(); }
  document.addEventListener("rg:qos", RG.ML.refresh);
}
RG.mlInit = init;
})(window.RG);
