/* =========================================================================
   こよみ（週カレンダー・月カレンダー・その日のカード）
   ―― 「出かける日がどんな日か」を、出かける前に見ておくための道具。
      六曜・祝日・今日は何の日を出し、文の中の地名を押すと地図が飛ぶ。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var WD = ["日", "月", "火", "水", "木", "金", "土"];
function ymd(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
function p2(n) { return (n < 10 ? "0" : "") + n; }
function key4(d) { return p2(d.getMonth() + 1) + p2(d.getDate()); }
function key8(d) { return "" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
function parse(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }

/* 六曜：起点の日から何日目かを数えて、文字列から1文字取り出す */
function roku(d) {
  if (!RG.ROKU) return null;
  var from = parse(RG.ROKU_FROM);
  var i = Math.round((d - from) / 86400000);
  if (i < 0 || i >= RG.ROKU.length) return null;
  return (RG.ROKU_NAMES || [])[+RG.ROKU.charAt(i)] || null;
}
RG.rokuOf = roku;
var ROKU_NOTE = {
  "大安": "一日中、縁起がよいとされる日。",
  "友引": "朝と夕がよく、昼はよくないとされる日。",
  "先勝": "午前がよく、午後はよくないとされる日。",
  "先負": "午前はひかえめに、午後がよいとされる日。",
  "仏滅": "何事もひかえめにするとされる日。",
  "赤口": "正午前後だけがよいとされる日。"
};

/* 見られる範囲：今日の1か月前の月初 〜 1年後の月末 */
function minDate() {
  var t = new Date(); t.setHours(0, 0, 0, 0);
  return new Date(t.getFullYear(), t.getMonth() - 1, 1);
}
function maxDate() {
  var t = new Date();
  return new Date(t.getFullYear() + 1, t.getMonth() + 1, 0);
}
RG.calMin = minDate; RG.calMax = maxDate;

/* ------------------------------------------------------- 上の週カレンダー */
RG.buildWeekBar = function () {
  var host = $("#weekbar");
  if (!host) return;
  var base = RG.calCursor ? parse(RG.calCursor) : new Date();
  base.setHours(0, 0, 0, 0);
  var sun = new Date(base); sun.setDate(sun.getDate() - sun.getDay());
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var cells = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(sun); d.setDate(sun.getDate() + i);
    var hol = (RG.HOLIDAY || {})[key8(d)];
    var isT = d.getTime() === today.getTime();
    var old = d < minDate();
    cells.push('<button class="wb__d' + (isT ? " today" : "") + (hol ? " hol" : "") +
      (i === 0 ? " sun" : i === 6 ? " sat" : "") + (old ? " old" : "") +
      '" type="button" data-day="' + ymd(d) + '" title="' + esc(hol || "") + '">' +
      '<span class="wb__w">' + WD[i] + "</span>" +
      '<span class="wb__n">' + d.getDate() + "</span>" +
      '<span class="wb__r">' + esc((roku(d) || "").slice(0, 2)) + "</span></button>");
  }
  host.innerHTML =
    '<button class="wb__m" type="button" id="wb-month">📅 ' +
      (sun.getMonth() + 1) + "月</button>" +
    '<div class="wb__row">' + cells.join("") + "</div>";
  $("#wb-month", host).addEventListener("click", function () { RG.showMonth(); });
  $$("[data-day]", host).forEach(function (b) {
    b.addEventListener("click", function () { RG.showDay(b.dataset.day); });
  });
};

/* ----------------------------------------------------------- 月カレンダー
   目的の日にいちばん速くたどり着けることを最優先にした作り。
   ・上に «13か月ぶんのチップ» を横に並べ、ワンタップでその月へ
   ・月を変えてもモーダルは開いたまま、中身だけ差し替える（再描画は数ミリ秒）
   ・← → キーで前後の月、↑ ↓ で前後の年
   ・土曜は青・日曜と祝日は赤（だれもが知っている色分け） */
function monthChips(y, m) {
  var lo = minDate(), hi = maxDate(), out = [];
  var c = new Date(lo.getFullYear(), lo.getMonth(), 1);
  while (c <= hi) {
    var on = c.getFullYear() === y && c.getMonth() === m;
    out.push('<button class="mch' + (on ? " on" : "") + '" type="button" data-ym="' +
      c.getFullYear() + "-" + p2(c.getMonth() + 1) + '">' +
      (c.getMonth() === 0 || out.length === 0 ? '<i>' + (c.getFullYear() % 100) + "</i>" : "") +
      (c.getMonth() + 1) + "月</button>");
    c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
  }
  return '<div class="mchips">' + out.join("") + "</div>";
}

function monthHTML(y, m) {
  var first = new Date(y, m, 1), lim = minDate(), hi = maxDate();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var start = new Date(first); start.setDate(1 - first.getDay());
  var bigs = RG.bigEventDays ? RG.bigEventDays(y, m) : {};
  var cells = [];
  for (var i = 0; i < 42; i++) {
    var d = new Date(start); d.setDate(start.getDate() + i);
    var out = d.getMonth() !== m;
    var hol = (RG.HOLIDAY || {})[key8(d)];
    var him = (RG.HIMEKURI || {})[key4(d)];
    var old = d < lim || d > hi;
    var bg = !out && bigs[d.getDate()];
    cells.push('<button class="mc__d' + (out ? " out" : "") + (hol ? " hol" : "") +
      (d.getTime() === today.getTime() ? " today" : "") + (old ? " old" : "") +
      (d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : "") +
      '" type="button" data-day="' + ymd(d) + '"' + (old ? ' data-old="1"' : "") + ">" +
      '<span class="mc__n">' + d.getDate() + "</span>" +
      '<span class="mc__r">' + esc(roku(d) || "") + "</span>" +
      (hol ? '<span class="mc__h">' + esc(hol) + "</span>"
           : bg ? '<span class="mc__ev">' + bg.e + esc(bg.n.slice(0, 7)) + "</span>" : "") +
      (him && him.e ? '<span class="mc__dot">•</span>' : "") + "</button>");
  }
  return monthChips(y, m) +
    '<div class="mc__hd">' +
      '<button class="mc__nav" type="button" data-mv="-1">◀</button>' +
      "<b>" + y + "年 " + (m + 1) + "月</b>" +
      '<button class="mc__nav" type="button" data-mv="1">▶</button>' +
      '<button class="mc__nav mc__nav--t" type="button" data-mv="today">今日</button>' +
    "</div>" +
    '<div class="mc__wd">' + WD.map(function (w, i) {
      return '<span class="' + (i === 0 ? "sun" : i === 6 ? "sat" : "") + '">' + w + "</span>";
    }).join("") + "</div>" +
    '<div class="mc__grid">' + cells.join("") + "</div>" +
    '<p class="mc__note">• は「今日は何の日」、色の付いた文字は大きな行事です。' +
    "← → キーでも月を動かせます。<br>" +
    "うすい日付は、いまのプランでは開けません（今日の1か月前 〜 1年後まで）。</p>";
}

RG.showMonth = function (ym) {
  var cur = ym ? parse(ym + "-01") : (RG.calCursor ? parse(RG.calCursor) : new Date());
  var y = cur.getFullYear(), m = cur.getMonth();
  var m2 = RG.openModal("📅 カレンダー", '<div class="mc" id="mc-host"></div>');
  function render(yy, mm) {
    y = yy; m = mm;
    var host = $("#mc-host", m2);
    host.innerHTML = monthHTML(y, m);
    $$("[data-ym]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.ym.split("-"); render(+a[0], +a[1] - 1);
      });
    });
    $$("[data-mv]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.mv === "today") { var t = new Date(); render(t.getFullYear(), t.getMonth()); return; }
        var d2 = new Date(y, m + (+b.dataset.mv), 1);
        var lo = minDate(), hi = maxDate();
        if (d2 < new Date(lo.getFullYear(), lo.getMonth(), 1)) { RG.showPlanWall(); return; }
        if (d2 > hi) { RG.tripStatus("1年より先の予定は出せません。", "info", 2600); return; }
        render(d2.getFullYear(), d2.getMonth());
      });
    });
    $$("[data-day]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.old) { RG.showPlanWall(); return; }
        RG.showDay(b.dataset.day);
      });
    });
    // 選んでいる月のチップを見える位置へ
    var on = host.querySelector(".mch.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  render(y, m);
  // キーボードでも動かせるように
  m2.tabIndex = -1;
  m2.addEventListener("keydown", function (ev) {
    var k = ev.key, d2 = null;
    if (k === "ArrowLeft") d2 = new Date(y, m - 1, 1);
    else if (k === "ArrowRight") d2 = new Date(y, m + 1, 1);
    else if (k === "ArrowUp") d2 = new Date(y - 1, m, 1);
    else if (k === "ArrowDown") d2 = new Date(y + 1, m, 1);
    else return;
    ev.preventDefault();
    var lo = minDate(), hi = maxDate();
    if (d2 < new Date(lo.getFullYear(), lo.getMonth(), 1) || d2 > hi) return;
    render(d2.getFullYear(), d2.getMonth());
  });
  if (m2.focus) m2.focus();
};

/* ------------------------------------------------- 有償プランのご案内（工事中） */
RG.showPlanWall = function () {
  RG.openModal("🚧 ただいま工事中です", '<div class="wall">' +
    '<div class="wall__e">🚧</div>' +
    "<p class=\"wall__t\">1か月より前のこよみを見る機能は、<b>有償プラン</b>で用意する予定です。</p>" +
    '<p class="wall__b">…と言いたいところですが、<b>その有償プランは絶賛工事中</b>で、' +
    "いつできるかは決まっていません。<br>作るかどうかは、みなさんの声（VOC）だけで決めます。</p>" +
    '<p class="wall__b">つまり今のところ、<b>無料のままで十分に使えます</b>。' +
    "1か月ぶんさかのぼれれば、たいていの «行った・行かなかった» は思い出せるはずです。</p>" +
    '<p class="wall__b wall__b--s">どうしても古い日を残したい方は、その日のうちに' +
    "「📝 訪問メモに残す」を押しておいてください。メモは期限なく残ります。</p>" +
    '<div class="wall__f"><button class="set__b2" type="button" onclick="RG.closeModal()">' +
    "わかりました</button></div></div>");
};

/* --------------------------------------------------------- その日のカード */
/* 文章の中の «地図で見られる場所» を押せるようにする */
function linkPlaces(text) {
  var names = placeIndex();
  var out = esc(text), hits = [];
  names.forEach(function (n) {
    if (n.length < 2) return;
    if (text.indexOf(n) < 0) return;
    if (hits.indexOf(n) < 0) hits.push(n);
  });
  // 長い名前から置き換える（「東京」より「東京タワー」を優先）
  hits.sort(function (a, b) { return b.length - a.length; });
  hits.slice(0, 6).forEach(function (n) {
    out = out.split(esc(n)).join('<button class="pl" type="button" data-place="' +
      esc(n) + '">' + esc(n) + "</button>");
  });
  return out;
}
var PIDX = null;
function placeIndex() {
  if (PIDX) return PIDX;
  var s = {};
  (RG.NET.stations || []).forEach(function (t) { s[t.n] = 1; });
  Object.keys(RG.WARDINFO || {}).forEach(function (w) { s[w] = 1; });
  (RG.BLDG3D || []).forEach(function (b) { s[b.n] = 1; });
  (RG.LANDMARKS_TOP || []).forEach(function (l) { s[l.n] = 1; });
  (RG.MAPPOI || []).forEach(function (p) { if (p.ti === 0) s[p.n] = 1; });
  PIDX = Object.keys(s).filter(function (n) { return n.length >= 2 && n.length <= 14; });
  return PIDX;
}
/* 名前から場所を探して地図を飛ばす */
RG.gotoPlace = function (n) {
  var st = (RG.NET.stations || []).filter(function (t) { return t.n === n; })[0];
  if (st) { RG.closeModal(); RG.openStation(st.id); return; }
  if ((RG.WARDINFO || {})[n]) { RG.showWard(n); return; }
  var b = (RG.BLDG3D || []).filter(function (x) { return x.n === n; })[0];
  if (b) { RG.showBldg(b); return; }
  var p = (RG.MAPPOI || []).filter(function (x) { return x.n === n; })[0];
  if (p) { RG.showSpot(p); return; }
  var l = (RG.LANDMARKS_TOP || []).filter(function (x) { return x.n === n; })[0];
  if (l) { RG.showLandmark(l); return; }
  RG.tripStatus("「" + n + "」はこの地図には載っていませんでした。", "info", 2600);
};

RG.showDay = function (s) {
  var d = parse(s);
  var him = (RG.HIMEKURI || {})[key4(d)] || {};
  var hol = (RG.HOLIDAY || {})[key8(d)];
  var rk = roku(d);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var diff = Math.round((d - today) / 86400000);
  var when = diff === 0 ? "今日" : diff === 1 ? "あした" : diff === -1 ? "きのう"
           : diff > 0 ? diff + "日後" : (-diff) + "日前";
  var html = '<div class="day">' +
    '<div class="day__hd' + (hol ? " hol" : "") + '">' +
      '<div class="day__n">' + d.getDate() + '<span>' + (d.getMonth() + 1) + "月</span></div>" +
      "<div><b>" + d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日（" +
      WD[d.getDay()] + "）</b>" +
      '<p class="day__k">' + esc(when) + (hol ? " ・ " + esc(hol) : "") + "</p></div>" +
      (rk ? '<span class="day__r r-' + esc(rk) + '">' + esc(rk) + "</span>" : "") +
    "</div>" +
    '<div class="dinfo" id="dinfo"></div>' +
    (rk ? '<p class="day__rn">' + esc(ROKU_NOTE[rk] || "") +
      '<em>六曜は旧暦の月と日から決まる、江戸時代からの «日の吉凶» の目安です。' +
      "科学的な根拠はありません。</em></p>" : "") +
    (him.a ? '<div class="sec"><div class="sec__h"><b>🎉 きょうは何の日</b></div>' +
      '<ul class="day__l">' + him.a.map(function (x) {
        return "<li>" + linkPlaces(x) + "</li>"; }).join("") + "</ul></div>" : "") +
    (him.e ? '<div class="sec"><div class="sec__h"><b>📜 この日のできごと</b>' +
      "<em>青い字を押すと地図が動きます</em></div>" +
      '<ul class="day__l">' + him.e.map(function (x) {
        return "<li>" + linkPlaces(x) + "</li>"; }).join("") + "</ul></div>" : "") +
    '<div class="lnks">' +
      '<button class="lnk" type="button" id="dy-set"><span>🧳</span>この日で予定を立てる</button>' +
      '<button class="lnk" type="button" id="dy-memo"><span>📝</span>訪問メモに残す</button>' +
      '<a class="lnk" href="https://ja.wikipedia.org/wiki/' +
        encodeURIComponent((d.getMonth() + 1) + "月" + d.getDate() + "日") +
        '" target="_blank" rel="noopener"><span>📖</span>Wikipediaで見る</a>' +
    "</div>" +
    '<p class="src">できごと・記念日の出典: Wikipedia 日本語版「' + (d.getMonth() + 1) + "月" +
    d.getDate() + "日」（CC BY-SA 4.0）。要約・整形しています。<br>" +
    "祝日: 内閣府「国民の祝日について」。六曜は旧暦から計算しています。</p></div>";
  var m = RG.openModal("📅 " + (d.getMonth() + 1) + "月" + d.getDate() + "日", html);

  /* 天気・月の満ち欠け・大きな行事を、カードの上のほうに並べる */
  var info = $("#dinfo", m);
  var mo = RG.moonOf ? RG.moonOf(d) : null;
  var bigs = RG.bigEventsOn ? RG.bigEventsOn(d) : [];
  function tiles(wx) {
    var t = [];
    if (wx) {
      var ic = RG.wxIcon(wx.code);
      t.push('<div class="ti ti--wx"><span class="ti__e">' + ic[0] + "</span>" +
        '<span class="ti__k">' + esc(ic[1]) + "</span>" +
        '<span class="ti__v"><b>' + Math.round(wx.hi) + "°</b>／" + Math.round(wx.lo) + "°</span>" +
        '<span class="ti__s">☂ ' + (wx.pop == null ? "—" : wx.pop + "%") + "</span></div>");
      if (wx.rise) t.push('<div class="ti"><span class="ti__e">🌅</span>' +
        '<span class="ti__k">日の出・入り</span><span class="ti__v">' + esc(wx.rise) + "</span>" +
        '<span class="ti__s">' + esc(wx.set) + " に沈む</span></div>");
    } else {
      t.push('<div class="ti ti--none"><span class="ti__e">🌡️</span>' +
        '<span class="ti__k">天気</span><span class="ti__v">—</span>' +
        '<span class="ti__s">16日先まで出せます</span></div>');
    }
    if (mo) t.push('<div class="ti"><span class="ti__e">' + mo.label.charAt(0) + mo.label.charAt(1) + "</span>" +
      '<span class="ti__k">月の形</span><span class="ti__v">' + esc(mo.label.slice(3)) + "</span>" +
      '<span class="ti__s">月齢 ' + mo.age.toFixed(1) + "</span></div>");
    info.innerHTML = '<div class="tiles">' + t.join("") + "</div>" +
      (bigs.length ? '<div class="bes">' + bigs.map(function (b) {
        var ev = b.ev;
        var when = b.one ? "この日だけ"
          : "全" + b.days + "日のうち " + b.nth + "日目（" +
            (b.s.getMonth() + 1) + "/" + b.s.getDate() + "〜" +
            (b.e.getMonth() + 1) + "/" + b.e.getDate() + "）";
        return '<button class="be" type="button" data-big="' + esc(ev.n) + '">' +
          '<span class="be__e">' + ev.e + "</span>" +
          '<span class="be__t"><b>' + esc(ev.n) + "</b>" +
          '<i class="' + (b.one ? "one" : "") + '">' + esc(when) + "</i>" +
          (ev.p ? '<u>' + esc(ev.p) + "</u>" : "") + "</span>" +
          '<span class="be__g">' + (ev.sc >= 90 ? "特大" : ev.sc >= 75 ? "大" : "中") + "</span></button>";
      }).join("") + "</div>" : "");
    $$("[data-big]", info).forEach(function (b) {
      b.addEventListener("click", function () { showBig(b.dataset.big, d); });
    });
  }
  tiles(null);
  if (RG.weatherOf) RG.weatherOf(s, function (wx) { tiles(wx); });

  $$("[data-place]", m).forEach(function (b) {
    b.addEventListener("click", function () { RG.gotoPlace(b.dataset.place); });
  });
  $("#dy-set", m).addEventListener("click", function () {
    RG.calCursor = s; RG.closeModal();
    if (RG.setTripDate) RG.setTripDate(s);
    RG.buildWeekBar();
    RG.tripStatus("🧳 " + (d.getMonth() + 1) + "月" + d.getDate() + "日 の予定として設定しました。", "ok", 3000);
  });
  $("#dy-memo", m).addEventListener("click", function () {
    RG.closeModal();
    if (RG.addLogFromDay) RG.addLogFromDay(s, him);
    else RG.tripStatus("訪問メモの機能が読み込まれていません。", "warn");
  });
};


/* 大きな行事のくわしいカード（クリックしたときだけ出す） */
function showBig(name, d) {
  var ev = (RG.BIGEVENTS || []).filter(function (x) { return x.n === name; })[0];
  if (!ev) return;
  var on = (RG.bigEventsOn ? RG.bigEventsOn(d) : []).filter(function (b) { return b.ev === ev; })[0];
  var html = '<div class="bigcard">' +
    '<div class="bigcard__hd"><span class="bigcard__e">' + ev.e + "</span>" +
      "<div><h3>" + esc(ev.n) + '</h3><p class="bigcard__k">' + esc(ev.cat) +
      (ev.p ? " ・ " + esc(ev.p) : "") + "</p></div>" +
      '<span class="be__g be__g--l">' + (ev.sc >= 90 ? "特大" : ev.sc >= 75 ? "大" : "中") + "</span></div>" +
    (ev.d ? '<p class="bigcard__d">' + esc(ev.d) + "</p>" : "") +
    (on ? '<div class="exgrid">' +
      '<div class="ex"><span class="ex__k">📅 会期</span><span class="ex__v">' +
        (on.s.getMonth() + 1) + "/" + on.s.getDate() +
        (on.one ? "" : " 〜 " + (on.e.getMonth() + 1) + "/" + on.e.getDate()) + "</span>" +
      '<span class="ex__s">' + (on.one ? "この日だけの行事です" :
        "全" + on.days + "日間。えらんだ日は " + on.nth + "日目です") + "</span></div>" +
      "</div>" : "") +
    (ev.note ? '<p class="bigcard__w">⚠ ' + esc(ev.note) + "</p>" : "") +
    RG.outLinks({ site: ev.u, yt: ev.n, news: ev.n,
                  map: ev.la ? ev.la + "," + ev.lo : ev.n + " 東京" }) +
    (ev.la ? '<div class="lnks"><button class="lnk" type="button" id="bg-map">' +
      "<span>📍</span>地図でこの場所を見る</button></div>" : "") +
    '<p class="src">日付は <b>おおよその目安</b> です。主催者の都合で動きますし、' +
    "隔年・3年に一度のものもあります。<b>行く前に必ず主催者の公式情報をご確認ください。</b><br>" +
    "来場者数は主催者や報道で一般に知られている概数です。</p></div>";
  var mm = RG.openModal(ev.e + " " + ev.n, html);
  var b2 = $("#bg-map", mm);
  if (b2) b2.addEventListener("click", function () {
    RG.closeModal();
    var n = RG.nearestStation && RG.nearestStation(ev.la, ev.lo);
    if (n) RG.openStation(n.t.id);
  });
}
RG.showBigEvent = showBig;

})(window.RG);
