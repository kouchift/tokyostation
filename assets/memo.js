/* =========================================================================
   ユーザー貢献型の「現場メモ」（v79）
   ・駅カードに «現場メモ» セクション: 静けさ／ベビーカー・車いす／乗り換えのわかりやすさ／夜間の明るさ／トイレ の 4 段階 ＋ 自由記述 80 字 ＋ 任意ニックネーム
   ・ログイン不要（匿名可）。投稿は即時に画面へ反映し「ありがとう。あなたのメモが地図に反映されました」
   ・保存先: この端末（localStorage）＋ 制作者が用意すれば Google フォーム（送信）と公開シート CSV（みんなのメモの読み込み）
     data/support.js の RG.TIP.memoForm / RG.TIP.memoCsv に設定（未設定でも端末内で動く）
   ・「調査ずみ」フィルターは、メモが RG.MEMO_MIN（既定 3）件以上ある駅だけ
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var KEY = "tsg.memo.v1", MAXTXT = 80;
RG.MEMO_MIN = RG.MEMO_MIN || 3;
var ITEMS = [
  { id: "quiet", e: "🌿", label: "静けさ", lv: ["騒がしい", "やや騒がしい", "静か", "とても静か"] },
  { id: "step", e: "👶", label: "ベビーカー・車いすの移動", lv: ["つらい", "やや不便", "まあ楽", "とても楽"] },
  { id: "xfer", e: "🔀", label: "乗り換えのわかりやすさ", lv: ["迷う", "やや迷う", "わかる", "とても明快"] },
  { id: "night", e: "🌙", label: "夜間の明るさ・安心感", lv: ["暗い・不安", "やや不安", "まあ明るい", "明るく安心"] },
  { id: "toilet", e: "🚻", label: "トイレの清潔さ・使いやすさ", lv: ["きれいでない", "ふつう以下", "きれい", "とてもきれい"] },
  { id: "elev", e: "🛗", label: "エレベーターのわかりやすさ", lv: ["見つからない", "わかりにくい", "わかる", "すぐわかる"] }
];
var KIDS_RE = /ベビーカー|子連れ|子ども|子供|赤ちゃん|エレベーター|スロープ|段差|授乳|おむつ|車いす|車椅子/;
RG.MEMO_ITEMS = ITEMS;
var local = null, remote = [], remoteAt = 0;
function loadLocal() { if (local) return local; try { local = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { local = []; } if (!Array.isArray(local)) local = []; return local; }
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(local.slice(-500))); } catch (e) {} }
function vid() { try { var v = localStorage.getItem("tsg.vid"); if (!v) { v = "v" + Math.random().toString(36).slice(2, 10); localStorage.setItem("tsg.vid", v); } return v; } catch (e) { return "anon"; } }
function cfg() { return RG.TIP || {}; }

/* ---- みんなのメモ（公開シート CSV） ---- */
function parseCsv(txt) {
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < txt.length; i++) {
    var ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
RG.memoSync = function (cb) {
  var C = cfg(); if (!C.memoCsv) { cb && cb(); return; }
  if (Date.now() - remoteAt < 5 * 60000) { cb && cb(); return; }
  remoteAt = Date.now();
  fetch(C.memoCsv + (C.memoCsv.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
    var rows = parseCsv(t); if (!rows.length) return;
    var head = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
    function col(n) { var i = head.indexOf(n); return i; }
    var ci = { st: col("st"), name: col("name"), nick: col("nick"), text: col("text"), vid: col("vid"), t: col("t") };
    ITEMS.forEach(function (it) { ci[it.id] = col(it.id); });
    remote = rows.slice(1).map(function (r) {
      var m = { st: r[ci.st] || "", name: r[ci.name] || "", nick: r[ci.nick] || "", text: (r[ci.text] || "").slice(0, MAXTXT), vid: r[ci.vid] || "", t: +(r[ci.t] || 0) || 0, q: {} , remote: true };
      ITEMS.forEach(function (it) { var v = +(r[ci[it.id]] || 0); if (v >= 1 && v <= 4) m.q[it.id] = v; });
      return m;
    }).filter(function (m) { return m.name; });
    cb && cb();
  }).catch(function () { cb && cb(); });
};
function all() {
  var L = loadLocal(), seen = {}, out = [];
  L.concat(remote).forEach(function (m) { var k = (m.vid || "") + ":" + (m.t || 0) + ":" + m.name; if (seen[k]) return; seen[k] = 1; out.push(m); });
  return out;
}
RG.memosOf = function (name) { return all().filter(function (m) { return m.name === name; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }); };
RG.memoCount = function (name) { return RG.memosOf(name).length; };
RG.memoCountMap = function () { var c = {}; all().forEach(function (m) { c[m.name] = (c[m.name] || 0) + 1; }); return c; };
RG.memoPeople = function (name) { var ms = RG.memosOf(name), seen = {}, n = 0; ms.forEach(function (m) { var k = m.vid || ("t" + m.t); if (!seen[k]) { seen[k] = 1; n++; } }); return n; };
/* 駅名の直下に出す一行 */
RG.memoHeadline = function (name) {
  var n = RG.memoCount(name), ppl = RG.memoPeople(name);
  if (n > 0) return '<div class="mm__hl"><span class="mm__hl-b">みんなで更新中</span>　・　<b>' + ppl + "</b>人が実際に通って情報を追加しています" + (n !== ppl ? "（メモ " + n + " 件）" : "") + "</div>";
  return '<div class="mm__hl mm__hl--zero">まだ情報が少ない駅です。<button type="button" class="mm__hl-go" data-memo-go="1">最初のメモを残しませんか？</button></div>';
};
RG.memoAvg = function (name) {
  var ms = RG.memosOf(name), out = {};
  ITEMS.forEach(function (it) { var vs = ms.map(function (m) { return m.q && m.q[it.id]; }).filter(Boolean); out[it.id] = vs.length ? { avg: vs.reduce(function (a, b) { return a + b; }, 0) / vs.length, n: vs.length } : null; });
  return out;
};

/* ---- 送信（Google フォーム、任意） ---- */
function sendRemote(m) {
  var F = cfg().memoForm; if (!F || !F.action || !F.fields) return;
  try {
    var fd = new FormData();
    Object.keys(F.fields).forEach(function (k) { var v = k in m ? m[k] : (m.q && m.q[k] != null ? m.q[k] : ""); fd.append(F.fields[k], v == null ? "" : String(v)); });
    fetch(F.action, { method: "POST", mode: "no-cors", body: fd }).catch(function () {});
  } catch (e) {}
}

/* ---- 駅カードのセクション ---- */
function bar(v) { var w = Math.round((v - 1) / 3 * 100); return '<span class="mm__bar"><i style="width:' + w + '%"></i></span>'; }
RG.memoHtml = function (name) {
  var ms = RG.memosOf(name), avg = RG.memoAvg(name), n = ms.length;
  RG.__memoAny = RG.__memoAny || n > 0;
  var sum = ITEMS.map(function (it) { var a = avg[it.id]; if (!a) return ""; return '<div class="mm__row"><span class="mm__k">' + it.e + " " + esc(it.label) + "</span>" + bar(a.avg) + '<b class="mm__v">' + esc(it.lv[Math.min(3, Math.max(0, Math.round(a.avg) - 1))]) + '</b><i class="mm__n">' + a.n + "件</i></div>"; }).join("");
  // 一覧（新しい順。子連れモードのときは子連れ関連を先に）
  var kids = RG.Trip && RG.CONFIG && RG.CONFIG.aggr[RG.Trip.aggr] && RG.CONFIG.aggr[RG.Trip.aggr].kids;
  var list = ms.filter(function (m) { return m.text; });
  if (kids) list = list.filter(function (m) { return KIDS_RE.test(m.text); }).concat(list.filter(function (m) { return !KIDS_RE.test(m.text); }));
  var texts = list.slice(0, 8).map(function (m) { var d = m.t ? new Date(m.t) : null; return '<li class="mm__t">' + esc(m.text) + "<small>" + esc(m.nick || "匿名") + (d ? "・" + (d.getMonth() + 1) + "/" + d.getDate() : "") + "</small></li>"; }).join("");
  var form = '<form class="mm__f" data-memo-form="' + esc(name) + '" hidden>' +
    ITEMS.slice(0, 5).map(function (it) { return '<div class="mm__q"><div class="mm__ql">' + esc(it.label) + '</div><div class="mm__seg" role="radiogroup" aria-label="' + esc(it.label) + '">' + it.lv.map(function (l, i) { return '<button type="button" class="mm__b" data-q="' + it.id + '" data-v="' + (i + 1) + '" aria-pressed="false">' + esc(l) + "</button>"; }).join("") + "</div></div>"; }).join("") +
    '<details class="mm__more"><summary>エレベーターのわかりやすさ（任意）</summary><div class="mm__seg" role="radiogroup">' + ITEMS[5].lv.map(function (l, i) { return '<button type="button" class="mm__b" data-q="elev" data-v="' + (i + 1) + '" aria-pressed="false">' + esc(l) + "</button>"; }).join("") + "</div></details>" +
    '<label class="mm__l">ひとこと（任意・' + MAXTXT + '字まで）<textarea class="mm__ta" name="text" maxlength="' + MAXTXT + '" rows="2" placeholder="例：夕方はホームが混みます"></textarea><span class="mm__cnt">0/' + MAXTXT + "</span></label>" +
    '<label class="mm__l mm__l--nick">ニックネーム<input class="mm__in" name="nick" maxlength="20" placeholder="匿名"><small class="mm__note">匿名でも投稿できます</small></label>' +
    '<button type="submit" class="mm__go">追加する</button>' +
    '<p class="src">' + (cfg().memoForm && cfg().memoForm.action ? "メモは制作者の受信箱に送られ、数分後にみんなの地図にも反映されます。" : "いまはこの端末に保存されます（受け皿ができると、みんなで共有されます）。") + "個人情報や誹謗中傷は書かないでください。</p></form>";
  return '<section class="sec sec--memo"><h3>実際に通った人の声 <small>' + (n ? n + " 件" : "") + (n >= RG.MEMO_MIN ? '・<b class="mm__ok">調査ずみ</b>' : n ? "・あと " + (RG.MEMO_MIN - n) + " 件で調査ずみ" : "") + "</small></h3>" +
    (sum ? '<div class="mm__sum">' + sum + "</div>" : "") +
    (texts ? '<ul class="mm__ts">' + texts + "</ul>" : '<p class="mm__empty">まだ声がありません。最初のひとことを残しませんか？</p>') +
    '<button type="button" class="mm__open">この駅の情報を追加する</button>' + form +
    '<p class="mm__cheerline">この地図を、現場の声で育て続けたいと思っています。もし少しでも役に立ったら、応援してもらえると嬉しいです。 <button type="button" class="mm__cheer mm__cheer--s" data-cheer="1">応援する</button></p></section>';
};
RG.memoBind = function (root, name) {
  var f = root.querySelector('[data-memo-form="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]') || root.querySelector("[data-memo-form]"); if (!f) return;
  var ob = root.querySelector(".mm__open");
  if (ob) ob.addEventListener("click", function () { f.hidden = !f.hidden; ob.textContent = f.hidden ? "この駅の情報を追加する" : "閉じる"; if (!f.hidden) { var b0 = f.querySelector(".mm__b"); b0 && b0.scrollIntoView({ behavior: "smooth", block: "center" }); } });
  Array.prototype.forEach.call(root.querySelectorAll("[data-cheer]"), function (b) { b.addEventListener("click", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); }); });
  var picked = {};
  Array.prototype.forEach.call(f.querySelectorAll(".mm__b"), function (b) {
    b.addEventListener("click", function () {
      var q = b.dataset.q, v = +b.dataset.v;
      picked[q] = picked[q] === v ? 0 : v;
      Array.prototype.forEach.call(f.querySelectorAll('.mm__b[data-q="' + q + '"]'), function (x) { x.setAttribute("aria-pressed", String(+x.dataset.v === picked[q])); });
    });
  });
  var ta = f.querySelector(".mm__ta"), cnt = f.querySelector(".mm__cnt");
  if (ta) ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/" + MAXTXT; });
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = (ta ? ta.value : "").trim().slice(0, MAXTXT), nick = (f.querySelector(".mm__in").value || "").trim().slice(0, 20);
    var q = {}; ITEMS.forEach(function (it) { if (picked[it.id]) q[it.id] = picked[it.id]; });
    if (!Object.keys(q).length && !text) { RG.tripStatus && RG.tripStatus("どれか 1 つ選ぶか、ひとことを書いてください", "warn", 3000); return; }
    var st = (RG.byName && RG.byName[name] || [])[0];
    var m = { st: st ? st.id : "", name: name, nick: nick, text: text, q: q, t: Date.now(), vid: vid() };
    // 保存できなかったときは入力を消さず、次の行動を案内する
    var ok = false;
    try { loadLocal(); local.push(m); try { localStorage.setItem(KEY, JSON.stringify(local.slice(-500))); ok = true; } catch (e) { local.pop(); ok = false; } } catch (e) { ok = false; }
    if (!ok) {
      f.__fails = (f.__fails || 0) + 1;
      var msg = f.__fails >= 2 ? "送信に失敗しました。少し時間をおいてから、もう一度「追加する」を押してみてください。" : "送信に失敗しました。もう一度「追加する」を押してみてください。";
      var er = f.querySelector(".mm__err") || (function () { var d = document.createElement("p"); d.className = "mm__err"; f.insertBefore(d, f.querySelector(".mm__go")); return d; })();
      er.textContent = msg; return;
    }
    var er0 = f.querySelector(".mm__err"); if (er0) er0.remove(); f.__fails = 0;
    sendRemote(Object.assign({}, m, q));
    RG.tripStatus && RG.tripStatus("ありがとう。あなたの経験が、この駅の情報に追加されました。", "ok", 2000);
    var sec = root.querySelector(".sec--memo");
    if (sec) { var wrap = document.createElement("div"); wrap.innerHTML = RG.memoHtml(name); sec.replaceWith(wrap.firstChild); RG.memoBind(root, name);
      var sec2 = root.querySelector(".sec--memo"), th = document.createElement("div"); th.className = "mm__thanks";
      th.innerHTML = '<p class="mm__thanks-t">ありがとう。あなたの経験が、この駅の情報に追加されました。</p><p class="mm__thanks-s">ありがとう。あなたの経験が地図に残りました。この地図を育て続けたいと思っています。 <button type="button" class="mm__cheer mm__cheer--s">応援する</button></p>';
      sec2.insertBefore(th, sec2.firstChild.nextSibling);
      th.querySelector(".mm__cheer").addEventListener("click", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); });
      setTimeout(function () { var t0 = th.querySelector(".mm__thanks-t"); if (t0) t0.remove(); }, 2000);
      if (RG.Map && RG.Map.lod) RG.Map.lod();
    }
    var hl = root.querySelector(".mm__hl"); if (hl) { var w2 = document.createElement("div"); w2.innerHTML = RG.memoHeadline(name); hl.replaceWith(w2.firstChild); bindHeadline(root); }
    var kd = root.querySelector(".sec--kids"); if (kd) kd.remove();
    var kh = RG.kidsHtml(name), secM = root.querySelector(".sec--memo");
    if (kh && secM) { var w3 = document.createElement("div"); w3.innerHTML = kh; secM.parentNode.insertBefore(w3.firstChild, secM.nextSibling); }
    if (RG.Map && RG.Map.paintFilter && RG.__memoFilterOn) RG.memoRefilter();
  });
};
RG.memoRefilter = function () { if (RG.memoRefilterFn) RG.memoRefilterFn(); };
function bindHeadline(root) {
  var b = root.querySelector("[data-memo-go]");
  if (b) b.addEventListener("click", function () { var d = root.querySelector(".mm__d"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); var f = d.querySelector(".mm__b"); if (f) f.focus(); } });
}
RG.memoHeadlineBind = bindHeadline;
/* 子連れ情報（駅カード） */
RG.kidsHtml = function (name) {
  var avg = RG.memoAvg(name), ms = RG.memosOf(name);
  var step = avg.step, elev = avg.elev;
  var kidsTexts = ms.filter(function (m) { return m.text && KIDS_RE.test(m.text); }).slice(0, 4);
  var det = RG.details && RG.details[name], detEv = det && det !== "none" && det !== "loading" && det.elevators ? det.elevators : null;
  function row(e, label, a, lv) { return '<div class="mm__row"><span class="mm__k">' + e + " " + label + "</span>" + (a ? bar(a.avg) + '<b class="mm__v">' + esc(lv[Math.min(3, Math.max(0, Math.round(a.avg) - 1))]) + '</b><i class="mm__n">' + a.n + "件</i>" : '<span class="mm__none">まだ情報がありません</span>') + "</div>"; }
  if (!step && !elev && !kidsTexts.length && !detEv) return "";
  return '<section class="sec sec--kids"><h3>子連れ情報 <small>現場メモから</small></h3><div class="mm__sum">' +
    row("👶", "ベビーカーでの移動しやすさ", step, ITEMS[1].lv) + row("🛗", "エレベーターのわかりやすさ", elev, ITEMS[5].lv) + "</div>" +
    (detEv ? '<p class="nat__d">🛗 ' + esc(String(detEv)) + "</p>" : "") +
    (kidsTexts.length ? '<div class="mm__vh">子連れで通った人の声</div><ul class="mm__ts">' + kidsTexts.map(function (m) { return '<li class="mm__t">' + esc(m.text) + "<small>" + esc(m.nick || "匿名") + "</small></li>"; }).join("") + "</ul>" : "") +
    "</section>";
};
/* 調査ずみ判定（フィルター用） */
RG.memoSurveyed = function (s) { return RG.memoCount(s.n) >= RG.MEMO_MIN; };
RG.memoInit = function () { RG.__memoAny = all().length > 0; RG.memoSync(function () { RG.__memoAny = all().length > 0; if (RG.Map && RG.Map.lod) RG.Map.lod(); }); };
})(window.RG);
