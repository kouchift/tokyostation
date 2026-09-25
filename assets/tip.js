/* =========================================================================
   制作者への窓口：投げ銭と、改善要望  v71〜（v73 で履歴・リセット・スマホ即投げを追加）

   ■ 流れ（v87 で «押すだけ» を 1 タップに）
     入口（応援するボタン・設定パネル・PV の最後・投稿の後）→ 押すだけ投げ銭（金額 1 タップ＝コピー＋記録＋アプリへ）
     くわしい窓口（くり返し・履歴・番付・印籠・救いの言葉）は押すだけ画面の «くわしい窓口» から。【確認POP】はそこでだけ出る。
   ■ 送金
     PayPay / Kyash とも、アカウント名だけで開ける公開URLは用意されていないので、
     data/support.js の paypayLink / kyashLink（アプリで作る送金リンク）が空のときは
     「IDをコピー → アプリで送る」の手順。スマホでは ID を自動コピーしてアプリを開く（URLスキーム）。
     当サイトは金額もお金も一切あずからない。
   ■ 履歴
     この端末の localStorage にだけ残る（tsg.tip.v1 の hist）。「履歴をぜんぶ消す」は懺悔のリセット：
     暗いトンネルから光へ抜ける GIF（assets/img/rebirth.gif）を流しながら消す。支援者の印も消える。
   ■ 要望・救いの言葉
     data/support.js の discordWebhook があれば Discord へ、無ければメール（mailto）で送る。
     連投よけ：同じ端末からは 10 分に 1 通。メッセージには来訪者ID（この端末だけの乱数）が付く。
     BANLIST にその ID があると、この端末ではサイトを開けなくする（静的サイトの範囲でできる最大限）。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var KEY = "tsg.tip.v1", VKEY = "tsg.vid";
function cfg() { return RG.TIP || { paypayId: "tonbo7", kyashId: "tonbo7", mailto: "tonbo7@gmail.com", amounts: [100, 500, 1000, 3000] }; }
function st() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
function vid() {
  try {
    var v = localStorage.getItem(VKEY);
    if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem(VKEY, v); }
    return v;
  } catch (e) { return "nosave"; }
}
function yen(n) { return "¥" + (n || 0).toLocaleString("ja-JP"); }
var APPNAME = { paypay: "PayPay", kyash: "Kyash", cotra: "ことら送金", paypal: "PayPal", rakutenpay: "楽天ペイ", dbarai: "d払い", aupay: "au PAY", coinplus: "COIN+", famipay: "FamiPay" };
function appName(a) { return APPNAME[a] || (a === "kyash" ? "Kyash" : "PayPay"); }
function isMainApp(a) { return a === "kyash" || a === "paypay"; }
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (RG.isTouch && RG.isTouch() && innerWidth < 900); }

/* ---- 記録（すべての「送りました」はここを通る） ---- */
var CAP = 999999;   // 9回目の解脱の天井。累計がここに達すると、それ以上の寄付はできない
function record(amt, app) {
  var S = st();
  if ((S.total || 0) >= CAP) { RG.tripStatus && RG.tripStatus("🙏 累計が 999,999 円に達しています。9回目の解脱が最大です。", "info", 6000); return S; }
  if ((S.total || 0) + amt > CAP) amt = CAP - (S.total || 0);
  S.hist = S.hist || [];
  S.hist.push({ t: Date.now(), a: amt, p: app || "paypay" });
  if (S.hist.length > 500) S.hist = S.hist.slice(-500);
  S.lastAmount = amt; S.app = app || "paypay"; S.count = (S.count || 0) + 1; S.total = (S.total || 0) + amt;
  S.life = S.life || { total: 0, count: 0, by: {} };                       // 解脱でリセットされない «生涯» の記録（ランキング用）
  S.life.total += amt; S.life.count += 1; S.life.by[app || "paypay"] = (S.life.by[app || "paypay"] || 0) + amt;
  save(S);
  RG.tripStatus && RG.tripStatus("🙏 " + yen(amt) + " の投げ銭、ありがとうございます（累計 " + S.count + " 回）", "ok", 5000);
  return S;
}
function undoLast() {
  var S = st(); if (!S.hist || !S.hist.length) return;
  var h = S.hist.pop(); S.count = Math.max(0, (S.count || 1) - 1); S.total = Math.max(0, (S.total || 0) - h.a);
  if (!S.count) { delete S.lastAmount; }
  save(S); applyPatron();
  RG.tripStatus && RG.tripStatus("取り消しました（" + yen(h.a) + "）", "info", 2500);
}

/* ---- 起動時：支援者の印と、拒否リストの照合 ---- */
function applyPatron() {
  var S = st(), on = (S.count || 0) >= 1;
  document.documentElement.classList.toggle("patron", on);
  var mark = document.querySelector(".hdr__mark span"), b = mark && mark.querySelector(".patron__b");
  if (on && mark && !b) {
    b = document.createElement("i"); b.className = "patron__b"; b.title = "投げ銭ありがとうございます（この端末での記録）"; b.textContent = "🪙 支援者";
    mark.appendChild(b);
  } else if (!on && b) b.remove();
}
RG.tipInit = function () {
  applyPatron();
  var v = vid();
  if ((RG.BANLIST || []).indexOf(v) >= 0) {
    document.body.innerHTML = '<div style="max-width:560px;margin:15vh auto;padding:24px;font:15px/1.8 system-ui;text-align:center">' +
      "<h1 style=\"font-size:22px\">🚫 このブラウザからは利用できません</h1>" +
      "<p>制作者の判断により、この端末（ID: <code>" + esc(v) + "</code>）からのアクセスをお断りしています。</p>" +
      "<p>心当たりがないときは、制作者までご連絡ください。</p></div>";
    throw new Error("banned");
  }
  // 地図右のズーム列に ☕（電車の中でも親指ひとつで届く入口）
  var zb = document.querySelector(".zoombar");
  if (zb && !document.getElementById("tipfab") && RG.settings && RG.settings.tipFab === true) {   // v79: 既定では出さない（応援の導線はカード・投稿後・現場メモの下だけ）
    var fb = document.createElement("button");
    fb.id = "tipfab"; fb.className = "sm tipfab"; fb.type = "button"; fb.textContent = "☕";
    fb.setAttribute("aria-label", "応援する"); fb.title = "応援する（この地図を現場の声で育て続けたい）";
    fb.addEventListener("click", function () { RG.tipQuick(); });
    zb.appendChild(fb);
  }
  // QR から来た（?tip=1&app=paypay&amt=500）：確認なしで、その金額の «押すだけ» 画面をすぐ開く
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("tip")) {
      var S = st(); S.skipConfirm = true; S.quickSeen = 1; if (q.get("app")) S.app = q.get("app") === "kyash" ? "kyash" : "paypay"; save(S);
      var amt = +q.get("amt") || 0;
      setTimeout(function () { RG.tipQuick(amt || null); }, 600);
      if (history.replaceState) history.replaceState(null, "", location.pathname);
    }
  } catch (e) {}
};

/* ---- カードの «制作者へ更新を依頼する» アイコン（全駅・全スポット） → 窓口へ ---- */
RG.reqHtml = function (kind, name) {
  return '<div class="req"><button class="req__b" type="button" data-req="' + esc(name || "") + '" data-reqkind="' + esc(kind || "") + '">' +
    '<span class="req__i">📮</span><span class="req__t">' + (kind === "station" ? "駅詳細情報の更新を制作者へ依頼する" : "スポット情報の更新を制作者へ依頼する") + "</span>" +
    '<span class="req__s">（依頼は投げ銭窓口から。実装見込みは極端に低い前提で）</span></button></div>';
};
RG.reqBind = function (root) {
  root.querySelectorAll("[data-req]").forEach(function (b) { b.addEventListener("click", function (e) {
    e.stopPropagation();
    var S = st(); S.reqFor = (b.dataset.reqkind === "station" ? "駅「" : "スポット「") + b.dataset.req + "」の情報更新の依頼: "; save(S);
    RG.openTip(function () { RG.showTip("msg"); });
  }); });
};

/* ---- 設定パネルに差し込む入口 ---- */
RG.tipEntryHTML = function () {
  var S = st();
  return '<div class="set__sec tjin"><h4>☕ 制作者へ（応援・改善要望）</h4>' +
    '<p class="set__d">この地図を、現場の声で育て続けたいと思っています。<br>もし少しでも役に立ったら、応援してもらえると嬉しいです。改善のご要望もここから。</p>' +
    '<div class="tj__row"><button id="tip-open" class="set__b2" type="button">☕ 応援する</button>' +
    '<button id="tip-hist" class="set__b" type="button">📜 応援の履歴' + (S.count ? "（" + S.count + "回・" + yen(S.total) + "）" : "") + "</button></div></div>";
};
RG.tipBind = function (root) {
  var b = $("#tip-open", root); if (b) b.addEventListener("click", function () { RG.tipQuick(); });   // v87: 確認POPを挟まず «押すだけ» へ
  var h = $("#tip-hist", root); if (h) h.addEventListener("click", function () { RG.showTip("hist"); });
};

/* ---- 確認POP（スキップ設定があれば飛ばす） ---- */
RG.openTip = function (next) {
  var S = st();
  if (S.skipConfirm) { (next || RG.showTip)(); return; }
  var m = RG.openModal("☕ 応援する", '<div class="tj tj--c">' +
    '<p class="tj__big">この地図を応援していただきます。</p>' +
    '<p>投げ銭は、地図の維持管理に充てられます。改善のご要望も、ここから出せます。</p>' +
    '<p class="tj__q">応援を続けますか？</p>' +
    '<label class="set__sw"><input id="tip-skip" type="checkbox" checked> 次回からこの確認を出さない（連続して投げ銭するかた向け）</label>' +
    '<div class="tj__row"><button id="tip-yes" class="set__b2" type="button">はい、応援する</button>' +
    '<button id="tip-no" class="set__b" type="button">やめておく</button></div></div>');
  $("#tip-yes", m).addEventListener("click", function () {
    var S2 = st(); S2.skipConfirm = !!$("#tip-skip", m).checked; save(S2); (next || RG.showTip)();
  });
  $("#tip-no", m).addEventListener("click", function () { RG.closeModal(); });
};

/* ---- 窓口本体 ---- */
RG.showTip = function (tab) {
  var C = cfg(), S = st(); tab = tab || S.lastTab || "pay";
  var head = '<div class="tj">' +
    '<div class="tj__tabs">' + [["pay", "☕ 投げ銭"], ["ways", "💳 107の手段"], ["loop", "🔁 くり返し"], ["hist", "📜 履歴"], ["rank", "🏅 番付"], ["inro", "🪪 印籠"], ["msg", "✉️ 救いの言葉"]].map(function (t) {
      return '<button class="tj__tab' + (t[0] === tab ? " on" : "") + '" type="button" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
  var body = tab === "pay" ? payHTML(C, S) : tab === "ways" ? waysHTML(C, S) : tab === "loop" ? loopHTML(C, S) : tab === "hist" ? histHTML(C, S)
           : tab === "rank" ? rankHTML(C, S) : tab === "inro" ? (RG.inroForm ? RG.inroForm(S, vid()) : "") : msgHTML(C, S);
  var foot = '<p class="src">当サイトはお金も個人情報も<b>一切あずかりません</b>。送金は各アプリの中で完結し、金額・回数はご自身の判断です。' +
    "確認POPをスキップにした設定・履歴は、この端末だけに保存されます。" +
    '<button id="tip-reset" class="tj__lnk" type="button">確認POPを元に戻す</button></p></div>';
  var m = RG.openModal("☕ 制作者への窓口", head + body + foot);
  m.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { var S2 = st(); S2.lastTab = b.dataset.tab; save(S2); RG.showTip(b.dataset.tab); }); });
  $("#tip-reset", m).addEventListener("click", function () { var S2 = st(); S2.skipConfirm = false; save(S2); RG.tripStatus && RG.tripStatus("次回から確認POPが出ます。", "info", 3000); });
  if (tab === "pay") bindPay(m, C); else if (tab === "ways") bindWays(m, C); else if (tab === "loop") bindLoop(m, C); else if (tab === "hist") bindHist(m, C);
  else if (tab === "rank") bindRank(m, C); else if (tab === "inro") { if (RG.inroBind) RG.inroBind(m, st, vid(), save); } else bindMsg(m, C);
  var gd = gedatsuBadge(S); var hd = m.querySelector(".modal__hd b"); if (gd && hd && !hd.querySelector(".gd")) hd.insertAdjacentHTML("beforeend", " " + gd);
};
/* 解脱回数のアイコン（3回目以降は ★ ギラギラ、1桁） */
function gedatsuBadge(S) {
  var n = Math.min(9, S.gedatsu || 0); if (!n) return "";
  if (n < 3) return '<span class="gd gd--soft" title="解脱 ' + n + ' 回">' + "🕊️".repeat(n) + "</span>";
  return '<span class="gd gd--star" title="解脱 ' + n + ' 回（3回目以降は累計額の壁を越えた証）">★' + n + "</span>";
}
RG.gedatsuBadge = function () { return gedatsuBadge(st()); };

/* ---- 107 の手段 ---- */
var SCHOOL_NOTE = '<div class="tj__school">🏫 <b>学校法人（幼稚園・小学校は免除）・学習塾・セミナー</b>など、第三者から対価を得て開催される場で本サイトを使う場合は、' +
  "社会人である閲覧者からの<b>最低 100 円</b>の投げ銭を渇望しています。一度でも投げ銭をすると、所属組織（複数拠点なら拠点数分）またはご本人に永続利用の <b>🪪 デジタル印籠</b> を発行します。</div>";
function waysHTML(C, S) {
  var M = (RG.PAYMETHODS || []).slice().sort(function (a, b) { return (b.ease + b.users) - (a.ease + a.users) || b.users - a.users; });
  var cats = []; M.forEach(function (x) { if (cats.indexOf(x.cat) < 0) cats.push(x.cat); });
  var cur = S.wayCat || "";
  M.forEach(function (x) { if (x.svc && x.st !== "end" && x.st !== "neta") { var s2 = svcState(x.svc).st; x.st = s2 === "ok" ? "ok" : "prep"; } });   // v100: 受取先の設定で «いま送れる» が決まる
  var list = cur ? M.filter(function (x) { return x.cat === cur; }) : M;
  var ST = { ok: ["いま送れる", "ok"], prep: ["制作者の準備待ち", "prep"], end: ["サービス終了（供養）", "end"], neta: ["金額ではないが潤う", "neta"] };
  return SCHOOL_NOTE +
    '<p class="tj__lead">寄付の手段 <b>' + M.length + ' 種類</b>。手順のかんたんさ × 利用者の多さで上から並んでいます。' + esc(RG.PAYMETHODS_NOTE || "") + "</p>" +
    '<div class="ways__cats"><button class="ways__c' + (!cur ? " on" : "") + '" type="button" data-wcat="">すべて</button>' + cats.map(function (c) { return '<button class="ways__c' + (c === cur ? " on" : "") + '" type="button" data-wcat="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
    '<ol class="ways">' + list.map(function (x, i) {
      var rank = M.indexOf(x) + 1;
      return '<li class="way way--' + x.st + '"><span class="way__rk">' + rank + '</span><span class="way__ic" style="--lc:' + esc(x.c) + '">' + esc(x.ic || x.n.charAt(0)) + "</span>" +
        '<span class="way__b"><b>' + esc(x.n) + '</b><span class="way__st way__st--' + x.st + '">' + ST[x.st][0] + "</span>" + (x.money ? "" : '<span class="way__st">累計に数えない</span>') +
        '<i>' + esc(x.how) + (x.to ? "　▶ " + esc(x.to) : "") + "</i>" +
        '<span class="way__meter" title="かんたんさ ' + x.ease + '/5・利用者 ' + x.users + '/5">' + "●".repeat(x.ease) + "○".repeat(5 - x.ease) + " ／ " + "●".repeat(x.users) + "○".repeat(5 - x.users) + "</span></span>" +
        '<span class="way__act">' + (x.id === "paypay" || x.id === "kyash" ? '<button class="tj__cp" type="button" data-way-quick="' + x.id + '">送る</button>'
          : x.svc && svcState(x.svc).st === "ok" ? '<button class="tj__cp" type="button" data-way-svc="' + x.svc + '">送る</button>'
          : x.bank ? '<button class="tj__cp" type="button" data-way-bank="' + x.id + '">振込依頼書／FBデータ</button>'
          : x.id === "cheerword" || x.id === "photo" || x.id === "info" ? '<button class="tj__cp" type="button" data-way-msg="1">窓口へ</button>'
          : x.id === "share" ? '<button class="tj__cp" type="button" data-way-share="1">共有</button>'
          : x.url ? '<a class="tj__cp" href="' + esc(x.url) + '" target="_blank" rel="noopener">公式 ↗</a>' : "") + "</span></li>"; }).join("") + "</ol>" +
    '<p class="src">アイコンは頭文字とブランド色による表現で、各社のロゴ（商標）は使っていません。「準備待ち」は制作者側のアカウント・リンク・口座の登録が要るもの。手数料・上限・本人確認は各サービスの規約に従います。</p>';
}
function bindWays(m, C) {
  m.querySelectorAll("[data-wcat]").forEach(function (b) { b.addEventListener("click", function () { var S = st(); S.wayCat = b.dataset.wcat; save(S); RG.showTip("ways"); }); });
  m.querySelectorAll("[data-way-quick]").forEach(function (b) { b.addEventListener("click", function () { var S = st(); S.app = b.dataset.wayQuick; save(S); RG.tipQuick(); }); });
  m.querySelectorAll("[data-way-svc]").forEach(function (b) { b.addEventListener("click", function () { var S = st(); S.app = b.dataset.waySvc; save(S); RG.tipQuick(); }); });   // v100: カードを開いた状態で «押すだけ» へ
  m.querySelectorAll("[data-way-bank]").forEach(function (b) { b.addEventListener("click", function () { RG.bankForm(b.dataset.wayBank); }); });
  m.querySelectorAll("[data-way-msg]").forEach(function (b) { b.addEventListener("click", function () { RG.showTip("msg"); }); });
  m.querySelectorAll("[data-way-share]").forEach(function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.shareOpen && RG.shareOpen(); }); });
}

/* ---- 銀行振込：振込依頼書（印刷）と FB データ（全銀フォーマット・総合振込） ---- */
RG.bankForm = function (fromId) {
  var C = cfg(), B = C.bank || {}, S = st();
  var ready = !!(B.code && B.branch && B.number);
  var html = '<div class="bank">' +
    '<p class="tj__lead">🏦 銀行振込（ゆうちょ銀行 ほか）。振込先は制作者が <code>data/support.js</code> の <code>bank</code> に登録したものを使います。' + (ready ? "" : "<b>まだ未登録です</b>（制作者の準備待ち。フォームの動きは試せます）。") + "</p>" +
    '<div class="bank__to"><b>振込先</b><div>' + esc(B.bankName || "ゆうちょ銀行") + "　" + (B.symbol ? "記号 " + esc(B.symbol) + "　番号 " + esc(B.number || "") : "店名 " + esc(B.branchName || "―") + "（" + esc(B.branch || "―") + "）　普通 " + esc(B.number || "―")) + "　" + esc(B.holder || "受取人名 ―") + "</div></div>" +
    '<div class="tj__form"><label>振込人名（半角カナは FB データ用に自動変換されません。カナ欄に入力）<input id="bk-name" maxlength="40" value="' + esc(S.name || "") + '"></label>' +
    '<label>振込人名（半角カナ・FBデータ用）<input id="bk-kana" maxlength="30" placeholder="ﾀﾅｶ ﾀﾛｳ"></label>' +
    '<label>金額（100〜999,999 円）<input id="bk-amt" type="number" min="100" max="999999" step="1" value="' + (S.lastAmount || 500) + '"></label>' +
    '<label>振込指定日<input id="bk-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
    '<label>ご自身の金融機関コード（4桁・FBデータの仕向銀行）<input id="bk-mycode" maxlength="4" placeholder="9900"></label>' +
    '<div class="tj__row"><button id="bk-slip" class="set__b2" type="button">🖨️ 振込依頼書を表示・印刷</button>' +
    '<button id="bk-fb" class="set__b2" type="button">💾 FBデータ（全銀フォーマット）を作る</button>' +
    '<button id="bk-done" class="set__b" type="button">振込みました（記録する）</button></div><div id="bk-res" class="tj__res"></div></div>' +
    '<p class="src">FB データは全銀協 総合振込フォーマット（120 バイト固定長・Shift_JIS 想定の半角カナ）で、多くの法人向けインターネットバンキングで取り込めます。振込依頼書は窓口用の様式（当サイト独自）です。振込手数料はご負担ください。</p></div>';
  var m = RG.openModal("🏦 銀行振込", html);
  $("#bk-slip", m).addEventListener("click", function () {
    var amt = Math.max(100, Math.min(999999, +$("#bk-amt", m).value || 0)), nm = $("#bk-name", m).value || "";
    var w = window.open("", "_blank");
    if (!w) { $("#bk-res", m).textContent = "ポップアップがブロックされました。許可してもう一度。"; return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>振込依頼書</title><style>body{font:14px/1.8 serif;margin:32px;color:#111}h1{text-align:center;letter-spacing:.3em;font-size:22px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #333;padding:8px 10px;text-align:left}th{width:9em;background:#f3f3f3}.amt{font-size:26px;font-weight:700;letter-spacing:.1em}.foot{font-size:10px;color:#555}.stamp{border:2px solid #b00;color:#b00;display:inline-block;padding:4px 12px;border-radius:6px;margin-top:8px}@media print{button{display:none}}</style>' +
      '<h1>振 込 依 頼 書</h1><p style="text-align:right">' + new Date().toLocaleDateString("ja-JP") + "</p>" +
      "<table><tr><th>金融機関</th><td>" + esc(B.bankName || "ゆうちょ銀行") + "</td></tr>" +
      "<tr><th>店名・口座</th><td>" + (B.symbol ? "記号 " + esc(B.symbol) + "　番号 " + esc(B.number || "") : "店名 " + esc(B.branchName || "―") + "（店番 " + esc(B.branch || "―") + "）　普通 " + esc(B.number || "―")) + "</td></tr>" +
      "<tr><th>受取人</th><td>" + esc(B.holder || "―") + "</td></tr>" +
      '<tr><th>金額</th><td class="amt">￥' + amt.toLocaleString("ja-JP") + "－</td></tr>" +
      "<tr><th>依頼人</th><td>" + esc(nm) + "</td></tr>" +
      "<tr><th>摘要</th><td>東京ステーションガイド お布施（投げ銭）</td></tr></table>" +
      '<div class="stamp">お布施・非課税・端数なし</div>' +
      '<p class="foot">本書は「東京ステーションガイド」が生成した窓口提出用の様式です。1人宗教法人へのお布施の形式であり、非課税・端数処理の無い世界で発行されているため、発行者の事業所番号は記載されません。振込手数料は依頼人負担。</p>' +
      '<button onclick="print()">印刷 / PDF に保存</button>');
    w.document.close();
  });
  $("#bk-fb", m).addEventListener("click", function () {
    var amt = Math.max(100, Math.min(999999, +$("#bk-amt", m).value || 0)), kana = ($("#bk-kana", m).value || "").trim() || "ﾌﾒｲ";
    var d = ($("#bk-date", m).value || "").replace(/-/g, "").slice(4), my = ($("#bk-mycode", m).value || "0000").padStart(4, "0");
    function pad(s, n, right) { s = String(s == null ? "" : s); if (s.length > n) s = s.slice(0, n); return right ? s.padEnd(n, " ") : s.padStart(n, "0"); }
    // 全銀 総合振込: ヘッダ(1) データ(2) トレーラ(8) エンド(9)。各 120 バイト
    var hdr = "1" + "21" + "0" + pad("", 10) + pad(kana, 40, true) + pad(d, 4) + pad(my, 4) + pad("", 15, true) + pad("", 3) + pad("", 15, true) + "1" + pad("", 7) + pad("", 17, true);
    var dat = "2" + pad(B.code || "9900", 4) + pad(B.bankName ? B.bankKana || "ﾕｳﾁﾖ" : "ﾕｳﾁﾖ", 15, true) + pad(B.branch || "", 3) + pad(B.branchKana || "", 15, true) + pad("", 4) + (B.type || "1") + pad(B.number || "", 7) + pad(B.holderKana || "", 30, true) + pad(amt, 10) + "0" + pad("", 10, true) + pad("", 10, true) + "7" + pad("", 8, true);
    var trl = "8" + pad(1, 6) + pad(amt, 12) + pad("", 101, true);
    var end = "9" + pad("", 119, true);
    var txt = [hdr, dat, trl, end].map(function (l) { return pad(l, 120, true); }).join("\r\n") + "\r\n";
    var blob = new Blob([txt], { type: "text/plain" }), url = URL.createObjectURL(blob);
    $("#bk-res", m).innerHTML = '<a class="set__b2" download="fb_sougou_' + d + '.txt" href="' + url + '">💾 FBデータを保存</a> <span class="tj__hint">半角カナは Shift_JIS で保存し直す必要がある銀行もあります（テキストエディタで文字コードを変更）。</span>';
  });
  $("#bk-done", m).addEventListener("click", function () { var amt = Math.max(100, Math.min(999999, +$("#bk-amt", m).value || 0)); var S2 = record(amt, "bank"); afterTip(S2, amt); });
};

/* ---- 番付（ランキング） ---- */
var RANKS = [[0, "序ノ口", "🌱"], [500, "三段目", "🍃"], [3000, "幕下", "🌿"], [10000, "十両", "🎋"], [30000, "前頭", "🏵️"], [100000, "小結", "🥉"], [200000, "関脇", "🥈"], [400000, "大関", "🥇"], [800000, "横綱", "👑"]];
function scoreOf(life, gedatsu) { return (life ? life.total : 0) + (gedatsu || 0) * 50000; }   // 解脱 1 回 = 5 万円ぶんの加点（ブースト）
function rankHTML(C, S) {
  var life = S.life || { total: S.total || 0, count: S.count || 0, by: {} }, g = S.gedatsu || 0, sc = scoreOf(life, g);
  var tier = RANKS[0]; RANKS.forEach(function (r) { if (sc >= r[0]) tier = r; });
  var next = RANKS[RANKS.indexOf(tier) + 1];
  var by = Object.keys(life.by || {}).map(function (k) { var M = (RG.PAYMETHODS || []).filter(function (x) { return x.id === k; })[0]; return { k: k, n: M ? M.n : k, v: life.by[k] }; }).sort(function (a, b) { return b.v - a.v; });
  return '<div class="rank"><div class="rank__me"><div class="rank__tier">' + tier[2] + " " + tier[1] + "</div>" +
    '<div class="rank__sc">番付スコア <b>' + sc.toLocaleString("ja-JP") + "</b><small>＝ 生涯累計 " + yen(life.total) + " ＋ 解脱 " + g + " 回 × 50,000</small></div>" +
    (g ? '<div class="rank__gd">' + gedatsuBadge(S) + " 解脱 " + g + " 回（何よりも重視。ランキングを押し上げるブースト）</div>" : '<div class="rank__gd tj__hint">解脱（懺悔のリセット）はまだ 0 回。解脱 1 回で 50,000 点のブースト。</div>') +
    (next ? '<div class="tj__hint">次の番付 ' + next[2] + next[1] + " まで、あと " + (next[0] - sc).toLocaleString("ja-JP") + " 点</div>" : '<div class="tj__hint">最高位です。</div>') + "</div>" +
    '<table class="th__t"><thead><tr><th>番付</th><th>必要スコア</th><th>あなた</th></tr></thead><tbody>' + RANKS.slice().reverse().map(function (r) { return "<tr" + (r === tier ? ' class="on"' : "") + "><td>" + r[2] + " " + r[1] + "</td><td>" + r[0].toLocaleString("ja-JP") + " 〜</td><td>" + (r === tier ? "◀ いまここ" : "") + "</td></tr>"; }).join("") + "</tbody></table>" +
    '<h4 class="rank__h">決済方法別（生涯）</h4>' + (by.length ? '<table class="th__t"><tbody>' + by.map(function (x) { return "<tr><td>" + esc(x.n) + '</td><td class="th__a">' + yen(x.v) + "</td></tr>"; }).join("") + '<tr><td><b>総トータル</b></td><td class="th__a"><b>' + yen(life.total) + "</b></td></tr></tbody></table>" : '<p class="tj__hint">まだ記録がありません。</p>') +
    '<div id="rank-lb"></div>' +
    '<p class="src">番付はこの端末の記録から計算します（累計・回数は「金額に換算できる」手段だけを数えます）。他の来訪者との比較表は、制作者が <code>data/support.js</code> の <code>leaderboardCsv</code>（公開スプレッドシートの CSV）を設定すると、ここに出ます。解脱 3 回目以降は累計額の壁（1万円→等比級数→9回目 999,999 円）があります。</p></div>';
}
function bindRank(m, C) {
  var url = C.leaderboardCsv; var box = $("#rank-lb", m); if (!url || !box) return;
  box.innerHTML = '<p class="tj__hint">みんなの番付を読み込んでいます…</p>';
  fetch(url).then(function (r) { return r.text(); }).then(function (t) {
    var rows = t.split(/\r?\n/).slice(1).map(function (l) { return l.split(","); }).filter(function (r) { return r.length >= 3; })
      .map(function (r) { return { n: r[0], total: +r[1] || 0, count: +r[2] || 0, g: +r[3] || 0, sc: (+r[1] || 0) + (+r[3] || 0) * 50000 }; }).sort(function (a, b) { return b.sc - a.sc; });
    box.innerHTML = '<h4 class="rank__h">みんなの番付</h4><table class="th__t"><thead><tr><th>#</th><th>名前</th><th>解脱</th><th>累計</th><th>スコア</th></tr></thead><tbody>' +
      rows.slice(0, 50).map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(r.n) + "</td><td>" + (r.g >= 3 ? '<span class="gd gd--star">★' + Math.min(9, r.g) + "</span>" : "🕊️".repeat(Math.min(2, r.g))) + '</td><td class="th__a">' + yen(r.total) + '</td><td class="th__a">' + r.sc.toLocaleString("ja-JP") + "</td></tr>"; }).join("") + "</tbody></table>";
  }).catch(function () { box.innerHTML = '<p class="tj__hint">みんなの番付を読み込めませんでした。</p>'; });
}

/* ---- 投げ銭 ---- */
function payHTML(C, S) {
  var app = isMainApp(S.app) ? S.app : "paypay";
  return SCHOOL_NOTE + '<p class="tj__lead">たった一人の制作者（<b>従業員1名の宗教法人</b>のような、非課税で端数の概念が無い世界の住人）を、確実に笑顔にできます。' +
    "このサイトの維持管理は<b>この投げ銭だけ</b>で成り立っています。</p>" +
    '<p class="tj__hint">投げ銭が積み上がるほど、制作者はビジュアルをよりリアルに・より高解像に・コンテンツをより充実させていきます。初回の投げ銭では画面が確かに変わります。2回目以降も、あなたのご支援が地図をより良いものにしていきます。</p>' +
    '<div class="tj__apps"><button class="tj__app' + (app === "paypay" ? " on" : "") + '" type="button" data-app="paypay">PayPay <small>' + esc(C.paypayId) + "</small></button>" +
    '<button class="tj__app' + (app === "kyash" ? " on" : "") + '" type="button" data-app="kyash">Kyash <small>' + esc(C.kyashId) + "</small></button></div>" +
    '<div class="tj__amts">' + (C.amounts || [100, 500, 1000, 3000]).map(function (a) {
      var e = a >= 3000 ? "💎" : a >= 1000 ? "🍱" : a >= 500 ? "☕" : "🍬";
      return '<button class="tj__amt' + (S.lastAmount === a ? " on" : "") + '" type="button" data-amt="' + a + '"><span>' + e + "</span>" + yen(a) + "</button>"; }).join("") +
    '<button class="tj__amt tj__amt--poor" type="button" data-poor="1"><span>💬</span>感想・応援の<br>お言葉</button></div>' +
    '<div id="tip-how" class="tj__how"></div>' +
    (S.lastAmount ? '<p class="tj__last">前回: ' + yen(S.lastAmount) + "（" + appName(S.app) + "）。同じ額をくり返すなら「🔁 くり返し」へ。</p>" : "") +
    (isMobile() ? '<p class="tj__hint">📱 スマホなら <button class="tj__lnk" type="button" data-quick="1">☕ 押すだけ投げ銭</button> が 1 タップです（ID を自動コピーしてアプリを開きます）。</p>' : "");
}
function link(C, app) { var l = app === "kyash" ? C.kyashLink : C.paypayLink; return l ? l : null; }
function scheme(app) { return app === "kyash" ? "kyash://" : "paypay://"; }
function howHTML(C, app, amt) {
  var id = app === "kyash" ? C.kyashId : C.paypayId, name = appName(app), l = link(C, app);
  if (l) {
    return '<p><b>' + yen(amt) + "</b> を " + name + " で送ります。下のボタンでアプリ（またはリンク先）が開きます。金額はアプリ側で <b>" + yen(amt) + "</b> と入力してください。</p>" +
      '<a class="set__b2 tj__go" href="' + esc(l) + '" target="_blank" rel="noopener" data-done="1">' + name + " をひらく ↗</a>";
  }
  return '<p><b>' + yen(amt) + "</b> を " + name + " で送る手順（" + name + " は<b>アカウント名だけで開ける送金URL</b>を用意していないため、コピーしてアプリで送ります）：</p>" +
    '<ol class="tj__ol"><li>送り先のID <code>' + esc(id) + '</code> を <button class="tj__cp" type="button" data-cp="' + esc(id) + '">コピー</button></li>' +
    "<li>" + name + " アプリを開き、「送る」→ ID（" + (app === "kyash" ? "Kyash ID" : "PayPay ID") + "）で検索 → 貼り付け" +
    (isMobile() ? ' <a class="tj__cp" href="' + scheme(app) + '">アプリを開く</a>' : "") + "</li>" +
    "<li>金額 <b>" + yen(amt) + "</b> を入れて送る（メッセージ欄に「東京ステーションガイド」と書くと制作者が泣いて喜びます）</li></ol>" +
    '<button class="set__b2 tj__go" type="button" data-done="1">送りました（記録する）</button>';
}
/* 回数に応じたひとこと（くり返すほど、ウィットで追い打ち） */
var WIT = [
  "2回目。1回目で画面は変わりました。2回目以降の変化をお楽しみに。",
  "3回目。三度目の正直。あなたのご支援で、より良いものが生まれています。",
  "4回目。ここまで来ると、もはや «常連»。常連のあなただからこそ、大事です。",
  "5回目。五円玉なら «ご縁»。五回目のご縁で、地図はさらに育ちます。",
  "6回目。制作者も応援されていることに気づいています。ここまでの応援、ありがとうございます。",
  "7回目。ラッキーセブン。抽選はありませんが、確実に地図が良くなっています。",
  "8回目。末広がり。広がるのは制作者の笑顔だけではなく、ユーザーも増えています。",
  "9回目。ここまで応援していただける方は本当に少ないです。本当にありがとうございます。",
  "10回目。ついに二桁。あなたのような応援者がいるから、この地図は存在できます。",
  "11回目以降。もう何も言うことはありません。この感謝は言葉では足りません。本当にありがとうございます。"
];
function afterTip(S2, amt) {
  var n = S2.count || 1, msg;
  if (n === 1) {
    applyPatron();
    RG.openModal("🎉 初回の投げ銭、確かに", '<div class="tj tj--c">' +
      '<p class="tj__big">ありがとうございます。<b>画面が変わりました</b>。</p>' +
      "<p>ヘッダーに <b>🪙 支援者</b> の印がつき、地図の縁がほんのり金色になりました（この端末だけの記録です）。</p>" +
      '<p>そして、ここからが大事なお知らせです。<b>2回目以降は、何度投げても画面は変わりません。</b>' +
      "これが世の中の世知辛さであり、この事実は本サイトの更新に限らず、輪廻転生した地球のあらゆる場所に存在しています。</p>" +
      "<p>それでも投げ銭が積み上がれば、制作者はサイトのビジュアルを<b>よりリアルに、より高解像に、より充実したコンテンツに</b>していく努力をするつもりです。" +
      "その日が訪れる<b>保証はまるでありません</b>が、楽しみにお待ちください。</p>" +
      '<div class="tj__row"><button class="set__b2" type="button" onclick="RG.closeModal()">わかった上で、また投げる</button>' +
      '<button class="set__b" type="button" id="tip-undo">まちがえた（取り消す）</button></div></div>');
    var u = document.getElementById("tip-undo"); if (u) u.addEventListener("click", function () { undoLast(); RG.closeModal(); });
    return;
  }
  msg = WIT[Math.min(WIT.length - 1, n - 2)];
  RG.openModal("🙏 " + n + " 回目の投げ銭", '<div class="tj tj--c">' +
    '<p class="tj__big">' + esc(yen(amt)) + "、確かに（累計 " + esc(yen(S2.total || 0)) + "・" + n + " 回）。</p>" +
    "<p>" + esc(msg) + "</p>" +
    '<p class="tj__hint">画面の変化: なし（仕様）。ビジュアルが高解像になる日: 未定（保証なし）。制作者の感謝: 上限なし。</p>' +
    '<div class="tj__row"><button class="set__b2" type="button" id="tip-again">もう一回</button>' +
    '<button class="set__b" type="button" onclick="RG.closeModal()">今日はここまで</button>' +
    '<button class="tj__lnk" type="button" id="tip-undo">取り消す</button></div></div>');
  var ag = document.getElementById("tip-again"); if (ag) ag.addEventListener("click", function () { RG.showTip("loop"); });
  var u2 = document.getElementById("tip-undo"); if (u2) u2.addEventListener("click", function () { undoLast(); RG.closeModal(); });
}
function bindPay(m, C) {
  var S = st(), app = isMainApp(S.app) ? S.app : "paypay", amt = S.lastAmount || 0, how = $("#tip-how", m);
  function paint() { how.innerHTML = amt ? howHTML(C, app, amt) : '<p class="tj__hint">金額を選ぶと手順が出ます。</p>'; bindHow(); }
  function bindHow() {
    how.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    how.querySelectorAll("[data-done]").forEach(function (b) { b.addEventListener("click", function () { var S2 = record(amt, app); afterTip(S2, amt); }); });
  }
  m.querySelectorAll("[data-app]").forEach(function (b) { b.addEventListener("click", function () {
    app = b.dataset.app; m.querySelectorAll("[data-app]").forEach(function (x) { x.classList.toggle("on", x === b); });
    var S2 = st(); S2.app = app; save(S2); paint();
  }); });
  m.querySelectorAll("[data-amt]").forEach(function (b) { b.addEventListener("click", function () {
    amt = +b.dataset.amt; m.querySelectorAll("[data-amt]").forEach(function (x) { x.classList.toggle("on", x === b); }); paint();
  }); });
  var poor = m.querySelector("[data-poor]"); if (poor) poor.addEventListener("click", function () { RG.showTip("msg"); });
  var qk = m.querySelector("[data-quick]"); if (qk) qk.addEventListener("click", function () { RG.tipQuick(); });
  paint();
}
function copy(text, btn, cb) {
  function done(ok) { if (btn) { var t = btn.textContent; btn.textContent = ok ? "コピーしました" : "コピーできません"; setTimeout(function () { btn.textContent = t; }, 1500); } cb && cb(ok); }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; } } catch (e) {}
  try { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); done(ok); } catch (e2) { done(false); }
}

/* ---- «押すだけ» 投げ銭  v87 で作り直し：手数を «1 タップ» に ----
   ■ ねらい
     「投げ銭アイコン → 確認POP → 金額 → コピー → 開く」の 4〜5 手を、「金額（またはいつもの額）を 1 回押す」だけにする。
     ・押した瞬間に (1) 送り先 ID をコピー (2) 履歴に記録 (3) 送金アプリを開く。すべて同じ 1 タップの中で行う
       （<a href> の素の遷移にしているのは、iOS Safari が «タップ直後でない» URL スキーム遷移を止めるため。以前の
       setTimeout(location.href=…) は端末によって開かなかった）。
     ・リンクの優先順位: 金額つきリンク（paypayLinks[金額]）＞ 金額なしリンク（paypayLink）＞ アプリの URL スキーム
       PayPay は «マイコード» の共有リンク、Kyash は «請求リンク» を data/support.js に貼ると、アプリが «送り先入り» で開く。
       リンクが無い場合は ID をコピーしてアプリのトップを開く（アプリ側で「送る → ID を貼る」の 2 手が残る）。
     ・Android はインテント URL（アプリが無ければストアへ自動フォールバック）。iOS はスキーム。
     ・2.5 秒たっても画面がこのサイトのまま（＝アプリが開かなかった）なら、ストアへの案内と手動の手順を出す。
     ・アプリから戻ってきたら「🙏 確かに」と «もう一回 同じ額» の大きなボタン（＝ループは 1 タップで続く）。
     ・いつもの額（前回の額）を最上段の大きなボタンに。他の額はその下の小さなボタン（どれも 1 タップで送れる）。
     ・確認POP（多忙のフリの注意書き）は、この «押すだけ» には出さない。くわしい窓口を開くときだけ。 */
var STORE = {
  paypay: { ios: "https://apps.apple.com/jp/app/id1435783608", android: "https://play.google.com/store/apps/details?id=jp.ne.paypay.android.app", pkg: "jp.ne.paypay.android.app" },
  kyash:  { ios: "https://apps.apple.com/jp/app/id1084264883", android: "https://play.google.com/store/apps/details?id=co.kyash", pkg: "co.kyash" }
};
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function isAndroid() { return /Android/i.test(navigator.userAgent); }
function storeHref(app) { var s = STORE[app] || STORE.paypay; return isIOS() ? s.ios : s.android; }
function schemeHref(app) {
  var s = STORE[app] || STORE.paypay, sc = app === "kyash" ? "kyash" : "paypay";
  if (isAndroid()) return "intent://#Intent;scheme=" + sc + ";package=" + s.pkg + ";S.browser_fallback_url=" + encodeURIComponent(s.android) + ";end";
  return sc + "://";
}
/* 金額に対して «いちばん手数の少ない» 開き先 */
function linkFor(C, app, amt) {
  var L = app === "kyash" ? C.kyashLinks : C.paypayLinks;
  if (L && amt && L[amt]) return { href: L[amt], kind: "amt", ext: true };
  var l = link(C, app); if (l) return { href: l, kind: "link", ext: true };
  return { href: schemeHref(app), kind: "scheme", ext: false };
}
function qrTarget(C, app, amt) {
  var l = linkFor(C, app, amt);
  if (l.ext) return l.href;                                           // 送金リンクがあれば、それを直接 QR に
  var base = C.siteUrl || (location.origin + location.pathname);
  return base + "?tip=1&app=" + app + (amt ? "&amt=" + amt : "");     // 無ければ、このサイトの «押すだけ» 画面を開く QR
}
function emojiOf(a) { return a >= 3000 ? "💎" : a >= 1000 ? "🍱" : a >= 500 ? "☕" : "🍬"; }
RG.tipQuick = function (preAmt) {
  var S = st(), C = cfg(), app = S.app === "kyash" ? "kyash" : "paypay", focusSvc = svcOf(S.app) ? S.app : null, id = app === "kyash" ? C.kyashId : C.paypayId, mob = isMobile(), name = appName(app);
  var amts = C.amounts || [100, 500, 1000, 3000];
  var main = preAmt || S.lastAmount || amts[1] || amts[0];          // いつもの額（初回は 2 番目＝¥500）
  var L = linkFor(C, app, main), direct = L.kind !== "scheme";
  function aTag(amt, cls, inner) {
    var l = linkFor(C, app, amt);
    return '<a class="' + cls + '" href="' + esc(l.href) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : "") + ' data-qamt="' + amt + '">' + inner + "</a>";
  }
  var html = '<div class="tq' + (mob ? " tq--m" : " tq--pc") + '">' +
    '<div class="tq__apps" role="group" aria-label="送金アプリ"><span class="tq__rec">おすすめ</span><button class="tq__app' + (app === "paypay" ? " on" : "") + '" type="button" data-qapp="paypay" aria-pressed="' + (app === "paypay") + '">PayPay</button>' +
    '<button class="tq__app' + (app === "kyash" ? " on" : "") + '" type="button" data-qapp="kyash" aria-pressed="' + (app === "kyash") + '">Kyash</button></div>' +
    (mob
      ? aTag(main, "tq__one", emojiOf(main) + " " + yen(main) + " を " + name + " で送る<small>" +
          (direct ? "1 タップで " + name + " が «送り先入り» で開きます" : "ID をコピーして " + name + " を開きます → 「送る」に貼り付け") + "</small>") +
        '<div class="tq__amts">' + amts.map(function (a) { return aTag(a, "tq__amt" + (a === main ? " on" : ""), "<span>" + emojiOf(a) + "</span>" + yen(a)); }).join("") + "</div>"
      : '<div class="tq__pc"><div class="tq__qr" id="tq-qr"></div>' +
        '<div class="tq__pct"><b>スマホで読むと、そのまま送れます。</b>' +
        (qrImg(C, app) ? name + " の «マイコード» です。" + name + " アプリ（または標準カメラ）で読むと、送り先が入った状態で開きます。" :
         "金額を選ぶと QR にも金額が入り、スマホ側は<b>ボタン 1 回</b>で送れます。") +
        '<div class="tq__amts">' + amts.map(function (a) { return '<button class="tq__amt' + (a === main ? " on" : "") + '" type="button" data-pcamt="' + a + '"><span>' + emojiOf(a) + "</span>" + yen(a) + "</button>"; }).join("") + "</div>" +
        '<div class="tq__pcrow"><button class="tj__cp" type="button" data-cp="' + esc(id) + '">ID をコピー</button>' +
        (link(C, app) ? '<a class="tj__cp" href="' + esc(link(C, app)) + '" target="_blank" rel="noopener">' + name + ' のリンクを開く ↗</a>' : "") +
        '<button class="tj__lnk" type="button" id="tq-pcdone">PC から送りました（記録する）</button></div></div></div>') +
    '<div class="tq__id">送り先 ID <b>' + esc(id) + '</b> <button class="tj__cp" type="button" data-cp="' + esc(id) + '">コピー</button>' +
      (direct ? '<small>（リンクで開くので、ふつうは不要）</small>' : "") + "</div>" +
    '<div id="tq-res" class="tq__res" aria-live="polite"></div>' +
    '<div class="tq__more"><button class="tq__moreb" type="button" id="tq-more" aria-expanded="' + (focusSvc ? "true" : "false") + '" aria-controls="tq-svc">💳 ほかの方法 <small>ことら送金・PayPal・楽天ペイ・d払い・au PAY・COIN+</small><i>▾</i></button>' +
      '<div id="tq-svc" class="tq__svc"' + (focusSvc ? "" : " hidden") + "></div></div>" +
    '<p class="tq__hint">押した時点で «送った» として履歴に残ります（まちがえたら「取り消す」）。当サイトはお金も個人情報もあずかりません。' +
      (S.count ? "これまで " + S.count + " 回・" + yen(S.total) + "。" : "") +
      ' <button class="tj__lnk" type="button" id="tq-full">くわしい窓口</button> <button class="tj__lnk" type="button" id="tq-msg">🙏 救いの言葉・要望</button></p></div>';
  var m = RG.openModal("☕ 押すだけ投げ銭", html);
  m.classList.add("modal--sheet");
  var qrBox = $("#tq-qr", m), res = $("#tq-res", m), curAmt = main;
  function paintQR() {
    if (!qrBox) return;
    var img = qrImg(C, app);
    if (img) { qrBox.innerHTML = '<img class="tq__qrimg" src="' + esc(RG.withV ? RG.withV(img) : img) + '" alt="' + name + ' のマイコード" width="180" height="180"><small>' + name + " マイコード</small>"; return; }
    if (RG.qrSvg) qrBox.innerHTML = RG.qrSvg(qrTarget(C, app, curAmt), 180, { label: "投げ銭のQR" }) + "<small>" + (curAmt ? yen(curAmt) + " の" : "") + "QR</small>";
  }
  paintQR();
  m.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
  m.querySelectorAll("[data-qapp]").forEach(function (b) { b.addEventListener("click", function () { var S2 = st(); S2.app = b.dataset.qapp; save(S2); RG.tipQuick(preAmt); }); });
  /* PC: 金額は «記録する額» と QR の中身。送るのはスマホ側 */
  m.querySelectorAll("[data-pcamt]").forEach(function (b) { b.addEventListener("click", function () {
    curAmt = +b.dataset.pcamt; m.querySelectorAll("[data-pcamt]").forEach(function (x) { x.classList.toggle("on", +x.dataset.pcamt === curAmt); }); paintQR();
  }); });
  var pd = $("#tq-pcdone", m); if (pd) pd.addEventListener("click", function () { var S3 = record(curAmt, app); afterTip(S3, curAmt); });
  /* スマホ: 1 タップ＝コピー＋記録＋アプリへ（<a> の遷移はそのまま通す） */
  var launched = 0, wentAway = false, waitT = null;
  function alive() { return m.classList.contains("show") && m.contains(res); }   // この画面がまだ出ているか（モーダルは共用）
  function onVis() {
    if (!alive()) { document.removeEventListener("visibilitychange", onVis); clearTimeout(waitT); return; }
    if (document.visibilityState === "hidden") { if (launched) wentAway = true; return; }
    if (launched && wentAway) { wentAway = false; clearTimeout(waitT); paintBack(); }
  }
  document.addEventListener("visibilitychange", onVis);
  function paintBack() {
    var S2 = st();
    var top = m.querySelector(".tq__one:not(.tq__one--again)"); if (top) top.style.display = "none";   // 大きなボタンは «もう一回» に役目を渡す
    res.innerHTML = '<div class="tq__thx">🙏 ' + yen(curAmt) + "、確かに。累計 " + (S2.count || 0) + " 回・" + yen(S2.total || 0) + "。" +
      (S2.count === 1 ? " 初回なので画面が変わりました。" : " 画面は変わりません（世知辛さ）。") + "</div>" +
      aTag(curAmt, "tq__one tq__one--again", "🔁 もう一回 " + yen(curAmt) + "<small>1 タップで、また " + name + " へ</small>") +
      '<div class="tq__row"><button class="tj__lnk" type="button" id="tq-undo">取り消す</button><button class="tj__lnk" type="button" onclick="RG.closeModal()">今日はここまで</button></div>';
    bindSend(res);
  }
  function paintWaiting() {
    res.innerHTML = '<div class="tq__wait">📋 ID をコピーしました。' + name + " を開いています…<small>戻ってきたら、ここに «もう一回» が出ます</small></div>";
  }
  function paintFallback() {
    res.innerHTML = '<div class="tq__fb"><b>' + name + " が開かないようです。</b>" +
      '<a class="set__b2" href="' + esc(storeHref(app)) + '" target="_blank" rel="noopener">📲 ' + name + " をインストール（" + (isIOS() ? "App Store" : "Google Play") + "）</a>" +
      '<p>手動で送るなら: ' + name + ' を開く → 「送る」→ ID <code>' + esc(id) + '</code> を貼り付け → ' + yen(curAmt) + "</p>" +
      '<div class="tq__row"><button class="tj__cp" type="button" data-cp="' + esc(id) + '">ID をコピー</button><button class="tj__lnk" type="button" id="tq-undo">取り消す（記録を消す）</button></div></div>';
    res.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    var u = $("#tq-undo", res); if (u) u.addEventListener("click", function () { undoLast(); RG.tipQuick(); });
  }
  function bindSend(root) {
    root.querySelectorAll("[data-qamt]").forEach(function (a) { a.addEventListener("click", function () {
      var amt = +a.dataset.qamt; curAmt = amt;
      m.querySelectorAll(".tq__amt").forEach(function (x) { x.classList.toggle("on", +x.dataset.qamt === amt); });
      copy(id, null);                                                  // ID は保険（リンクがあれば要らない）
      var S2 = record(amt, app); if (S2.count === 1) applyPatron();
      launched = Date.now(); wentAway = false;
      paintWaiting();
      clearTimeout(waitT);
      waitT = setTimeout(function () { if (alive() && !wentAway && document.visibilityState === "visible") paintFallback(); }, 2500);
      // <a> の遷移はそのまま（preventDefault しない）＝ タップ直後の遷移として iOS でも開く
    }); });
    var u = $("#tq-undo", root); if (u) u.addEventListener("click", function () { undoLast(); RG.tipQuick(); });
  }
  bindSend(m);
  var f = $("#tq-full", m); if (f) f.addEventListener("click", function () { RG.openTip(function () { RG.showTip("pay"); }); });
  var mg = $("#tq-msg", m); if (mg) mg.addEventListener("click", function () { RG.showTip("msg"); });
  /* v100: ほかの方法（金額はこの画面で選んだ額を引き継ぐ） */
  var moreB = $("#tq-more", m), svcBox = $("#tq-svc", m);
  function paintSvc() {
    if (!svcBox || svcBox.hidden) return;
    svcBox.innerHTML = '<p class="tq__svcl">' + (curAmt ? "<b>" + yen(curAmt) + "</b> を、ふだん使っている手段で。" : "") + "金額はアプリ側で入力します。</p>" + RG.tipServicesHtml(curAmt, mob);
    RG.tipServicesBind(svcBox, function () { return curAmt; });
    if (focusSvc) { var card = svcBox.querySelector('[data-sv="' + focusSvc + '"]'); if (card) { card.classList.add("sv--focus"); setTimeout(function () { try { card.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {} }, 60); } focusSvc = null; }
  }
  if (moreB && svcBox) {
    moreB.addEventListener("click", function () { svcBox.hidden = !svcBox.hidden; moreB.setAttribute("aria-expanded", svcBox.hidden ? "false" : "true"); paintSvc(); if (!svcBox.hidden && RG.stat) RG.stat("tip", "more"); });
    m.querySelectorAll("[data-qamt],[data-pcamt]").forEach(function (b) { b.addEventListener("click", function () { setTimeout(paintSvc, 0); }); });
    paintSvc();
  }
};
function qrImg(C, app) { return app === "kyash" ? (C.kyashQr || "") : (C.paypayQr || ""); }

/* ---- v100: サービスカード（PayPay・Kyash 以外の受取先） ----
   ・受取先は data/support.js の services にだけ書く（ここには ID を書かない）
   ・「送れる」と表示するのは、公式に確認できた指定方法（メールアドレス・ユーザー番号・PayPal.Me）か、制作者が固定リンク／QR を設定したものだけ
   ・架空 URL・期限つき URL・推測のディープリンクは作らない。電話番号・口座番号は扱わない */
var SVC = [
  { id: "cotra",      pm: "kotora",     n: "ことら送金", ic: "こ", c: "#00A0E9", url: "https://www.cotra.ne.jp/p2pservice/" },
  { id: "paypal",     pm: "paypal",     n: "PayPal",     ic: "PP", c: "#003087", url: "https://www.paypal.com/jp/home" },
  { id: "rakutenpay", pm: "rakutenpay", n: "楽天ペイ",   ic: "R",  c: "#BF0000", url: "https://pay.rakuten.co.jp/guide/cash/send_receive/" },
  { id: "dbarai",     pm: "dbarai",     n: "d払い",      ic: "d",  c: "#CC0033", url: "https://service.smt.docomo.ne.jp/keitai_payment/guide/wallet/remit.html" },
  { id: "aupay",      pm: "aupay",      n: "au PAY",     ic: "au", c: "#EB5505", url: "https://wallet.auone.jp/contents/sp/guide/moneytransfer.html" },
  { id: "coinplus",   pm: "coinplus",   n: "COIN+",      ic: "C+", c: "#1F6FE5", url: "https://coinplus.jp/remittancemethod/" },
  { id: "famipay",    pm: null,         n: "FamiPay",    ic: "F",  c: "#00A040", url: "" }
];
function svcOf(id) { return SVC.filter(function (x) { return x.id === id; })[0] || null; }
function svcCfg(id) { var C = cfg(); return (C.services && C.services[id]) || {}; }
function httpOk(u) { return typeof u === "string" && /^https:\/\//.test(u); }
/* いま «送れる» か。st: ok（送れる）／prep（制作者の設定待ち）／off（対象外） */
function svcState(id, amt) {
  var c = svcCfg(id), ids = [], go = null, how = "", note = "";
  switch (id) {
    case "cotra":
      if (c.email) ids.push(["メールアドレス", c.email]);
      how = "対応する銀行アプリ（ゆうちょ通帳アプリ・各行アプリ）の「ことら送金」で、送り先に <b>メールアドレス</b> を入れて送金。1 回 10 万円まで、手数料は無料の先が多い（専用アプリはありません）";
      note = "※送金時の受取人名義等の表示は、ことら送金・ご利用アプリの仕様に従います。";
      if (!c.enabled) return { st: "off", label: "対象外", ids: ids, how: how, note: note };
      if (!c.registered) return { st: "prep", label: "受取設定が必要です", ids: ids, how: how, note: "制作者側で «メールアドレスと口座の紐付け（受取設定）» が済むと送れるようになります。" };
      return { st: c.email ? "ok" : "prep", label: c.email ? "メールアドレスで送れます" : "受取先が未設定", ids: ids, how: how, note: note };
    case "paypal":
      if (c.paypalMe) go = { href: "https://www.paypal.com/paypalme/" + encodeURIComponent(c.paypalMe) + (amt ? "/" + amt + "JPY" : ""), label: "PayPal.Me をひらく（" + (amt ? yen(amt) : "金額はリンク先で") + "）" };
      else if (httpOk(c.link)) go = { href: c.link, label: "PayPal をひらく" };
      if (c.email) ids.push(["受取先（メールアドレス）", c.email]);
      how = go ? "リンクを開いて金額を確認して送るだけ" : "PayPal アプリ／サイトの「送金」で <b>メールアドレス</b> を指定して送金（「友達や家族に送金」を選ぶと手数料がかかりません）";
      return { st: go || c.email ? "ok" : "prep", label: go ? "1 タップで開けます" : (c.email ? "メールアドレスで送れます" : "受取先が未設定"), ids: ids, how: how, go: go, qr: c.qr };
    case "rakutenpay":
      if (httpOk(c.link)) go = { href: c.link, label: "楽天ペイをひらく" };
      if (c.email) ids.push(["受取アカウント（参考）", c.email]);
      how = go ? "リンクを開いて送る" : "楽天ペイアプリの「送る」→ 送り先一覧（連絡先）から。受け取り用リンクは 3 日・請求用リンクは 2 週間で切れるため、このサイトに固定リンクはありません";
      return { st: go || httpOk(c.qr) ? "ok" : "prep", label: go ? "リンクで送れます" : "制作者の設定待ち（固定リンクなし）", ids: ids, how: how, go: go, qr: c.qr };
    case "dbarai":
      if (httpOk(c.link)) go = { href: c.link, label: "d払いをひらく" };
      if (c.number) ids.push(["d払い番号", c.number]);
      if (c.email) ids.push(["受取アカウント（参考）", c.email]);
      how = go || c.number ? "d払いアプリの「送る」で d払い番号（またはリンク）を指定" : "d払いアプリの「送る」は 電話番号・d払い番号・QR・リンク宛（メールアドレス宛は不可）。制作者が d払い番号か固定リンクを設定すると送れるようになります";
      return { st: go || c.number || httpOk(c.qr) ? "ok" : "prep", label: go || c.number ? "送れます" : "制作者の設定待ち", ids: ids, how: how, go: go, qr: c.qr };
    case "aupay":
      if (httpOk(c.link)) go = { href: c.link, label: "au PAY をひらく" };
      if (c.number) ids.push(["au PAY 会員ナンバー", c.number]);
      if (c.email) ids.push(["受取アカウント（参考）", c.email]);
      how = go || c.number ? "au PAY アプリの「送る」で会員ナンバー（またはリンク）を指定。送る側は本人確認（または auじぶん銀行の口座連携）が必要" : "au PAY の「送る」は 携帯電話番号・会員ナンバー・QR 宛（メールアドレス宛は不可）。制作者が会員ナンバーか固定リンクを設定すると送れるようになります";
      return { st: go || c.number || httpOk(c.qr) ? "ok" : "prep", label: go || c.number ? "送れます" : "制作者の設定待ち", ids: ids, how: how, go: go, qr: c.qr };
    case "coinplus":
      if (c.userNumber) ids.push(["ユーザー番号", c.userNumber]);
      if (c.userName) ids.push(["受取人の表示名", c.userName]);
      if (httpOk(c.link)) go = { href: c.link, label: "エアウォレットをひらく" };
      how = "1. エアウォレット等の対応アプリを開く → 2.「送金」→ 3. ユーザー番号「" + esc(c.userNumber || "—") + "」を指定 → 4. 金額を入力 → 5. 送金。手数料無料（ブラウザからの自動送金はできません）";
      return { st: c.userNumber ? "ok" : "prep", label: c.userNumber ? "対応アプリで送れます" : "受取先が未設定", ids: ids, how: how, go: go, qr: c.qr };
    case "famipay":
      if (c.id) ids.push(["FamiPay ID（参考）", c.id]);
      how = "FamiPay 残高の個人間送金を公式に確認できないため、現在は投げ銭の送金対象外です（ギフトとは別物）。確認できたら data/support.js の famipay.enabled を true に";
      if (c.enabled && (httpOk(c.link) || httpOk(c.qr))) { if (httpOk(c.link)) go = { href: c.link, label: "FamiPay をひらく" }; return { st: "ok", label: "送れます", ids: ids, how: "リンク／QR から送る", go: go, qr: c.qr }; }
      return { st: "off", label: "現在は投げ銭送金対象外", ids: ids, how: how };
  }
  return { st: "prep", label: "未設定", ids: [], how: "" };
}
RG.tipServiceState = svcState;
function svcCardHtml(sv, amt, mob) {
  var s = svcState(sv.id, amt), st = s.st;
  return '<div class="sv sv--' + st + '" data-sv="' + sv.id + '" role="group" aria-label="' + esc(sv.n) + "（" + esc(s.label) + '）">' +
    '<div class="sv__hd"><span class="sv__ic" style="--lc:' + sv.c + '">' + esc(sv.ic) + "</span><b>" + esc(sv.n) + '</b><span class="sv__st sv__st--' + st + '">' + esc(s.label) + "</span></div>" +
    (s.how ? '<p class="sv__how">' + s.how + "</p>" : "") +
    s.ids.map(function (x) { return '<div class="sv__id"><small>' + esc(x[0]) + "</small><code>" + esc(x[1]) + '</code><button class="tj__cp" type="button" data-cp="' + esc(x[1]) + '" aria-label="' + esc(x[0]) + " " + esc(x[1]) + ' をコピー">コピー</button></div>'; }).join("") +
    '<div class="sv__acts">' +
      (st === "ok" && s.go ? '<a class="set__b2 sv__go" href="' + esc(s.go.href) + '" target="_blank" rel="noopener" data-sv-go="' + sv.id + '">' + esc(s.go.label) + " ↗</a>" : "") +
      (!mob && st === "ok" && httpOk(s.qr) ? '<button class="tj__cp" type="button" data-sv-qr="' + sv.id + '">QR を見る</button>' : "") +
      (sv.url ? '<a class="tj__cp" href="' + esc(sv.url) + '" target="_blank" rel="noopener">送る方法を見る ↗</a>' : "") +
      (st === "ok" ? '<button class="tj__lnk" type="button" data-sv-done="' + sv.id + '">送りました（' + (amt ? yen(amt) + " を" : "") + '記録する）</button>' : "") +
    "</div>" +
    (s.note ? '<p class="sv__note">' + esc(s.note) + "</p>" : "") +
    (!mob && st === "ok" && httpOk(s.qr) ? '<div class="sv__qr" hidden><img src="' + esc(s.qr) + '" alt="' + esc(sv.n) + ' の受取用 QR" width="180" height="180"></div>' : "") +
  "</div>";
}
/* 一覧: おすすめ（PayPay）に続く «その他の方法»。ok → prep → off の順で、ok の中は 108 手段の ease+users 順 */
RG.tipServicesHtml = function (amt, mob) {
  var order = { ok: 0, prep: 1, off: 2 };
  var list = SVC.slice().sort(function (a, b) {
    var sa = svcState(a.id, amt).st, sb = svcState(b.id, amt).st;
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    var pa = (RG.PAYMETHODS || []).filter(function (x) { return x.id === a.pm; })[0] || { ease: 0, users: 0 }, pb = (RG.PAYMETHODS || []).filter(function (x) { return x.id === b.pm; })[0] || { ease: 0, users: 0 };
    return (pb.ease + pb.users) - (pa.ease + pa.users);
  });
  return '<div class="svl">' + list.map(function (sv) { return svcCardHtml(sv, amt, mob); }).join("") +
    '<p class="sv__foot">受取先は data/support.js に集約（画面には公開してよい識別子だけ）。「準備待ち」は制作者側の設定が要るもの。当サイトはお金も個人情報もあずかりません。</p></div>';
};
RG.tipServicesBind = function (root, getAmt, onRecorded) {
  root.querySelectorAll("[data-cp]").forEach(function (b) { if (!b.__cp) { b.__cp = 1; b.addEventListener("click", function () { copy(b.dataset.cp, b); }); } });
  root.querySelectorAll("[data-sv-qr]").forEach(function (b) { b.addEventListener("click", function () { var q = b.closest(".sv").querySelector(".sv__qr"); if (q) { q.hidden = !q.hidden; b.textContent = q.hidden ? "QR を見る" : "QR をとじる"; } }); });
  root.querySelectorAll("[data-sv-done]").forEach(function (b) { b.addEventListener("click", function () { var amt = getAmt ? getAmt() : 0; if (!amt) { RG.tripStatus && RG.tripStatus("上で金額を選んでから記録してください", "info", 3000); return; } var S2 = st(); S2.app = b.dataset.svDone; save(S2); var S3 = record(amt, b.dataset.svDone); if (S3.count === 1) applyPatron(); onRecorded ? onRecorded(S3, amt, b.dataset.svDone) : afterTip(S3, amt); }); });
  root.querySelectorAll("[data-sv-go]").forEach(function (a) { a.addEventListener("click", function () { var S2 = st(); S2.app = a.dataset.svGo; save(S2); }); });   // 最後に選んだ手段だけ覚える（決済情報は保存しない）
};


/* ---- くり返し（前回の金額 × 回数） ---- */
function loopHTML(C, S) {
  if (!S.lastAmount) return '<p class="tj__lead">まだ投げ銭の記録がありません。まず「☕ 投げ銭」で1回送ると、ここで同じ額のくり返しができます。</p>';
  return '<p class="tj__lead">前回の <b>' + yen(S.lastAmount) + "</b>（" + appName(S.app) + "）を、何回くり返しますか？ 1回ごとに手順（またはアプリ）を開き、「送りました」で次へ進みます。</p>" +
    '<div class="tj__loopset"><label>回数 <input id="tip-n" type="number" min="1" max="99" value="' + (S.loopN || 3) + '"></label>' +
    '<span id="tip-sum" class="tj__sum"></span>' +
    '<button id="tip-start" class="set__b2" type="button">▶ はじめる</button></div>' +
    '<div id="tip-loop" class="tj__loop"></div>' +
    (S.skipConfirm ? "" : '<p class="tj__hint">※ 確認POPを「次回から出さない」にしておくと、次からはこの画面に直接来られます。</p>');
}
function bindLoop(m, C) {
  var S = st(); if (!S.lastAmount) return;
  var n = $("#tip-n", m), sum = $("#tip-sum", m), box = $("#tip-loop", m), i = 0, total = 0;
  function paintSum() { total = Math.max(1, Math.min(99, +n.value || 1)); sum.textContent = "合計 " + yen(S.lastAmount * total); }
  n.addEventListener("input", paintSum); paintSum();
  $("#tip-start", m).addEventListener("click", function () { var S2 = st(); S2.loopN = total; save(S2); i = 0; step(); });
  function step() {
    if (i >= total) { box.innerHTML = '<p class="tj__big">🎉 ' + total + " 回、完了。累計 " + yen(st().total || 0) + "。制作者は確実に笑顔です。</p>"; return; }
    box.innerHTML = '<p class="tj__big">' + (i + 1) + " / " + total + " 回目 ― " + yen(S.lastAmount) + "</p>" + howHTML(C, isMainApp(S.app) ? S.app : "paypay", S.lastAmount);
    box.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    box.querySelectorAll("[data-done]").forEach(function (b) { b.addEventListener("click", function () {
      var S3 = record(S.lastAmount, isMainApp(S.app) ? S.app : "paypay"); i++;
      if (S3.count === 1) afterTip(S3, S.lastAmount);
      step();
    }); });
  }
}

/* ---- 履歴 ---- */
function histHTML(C, S) {
  var H = (S.hist || []).slice().reverse();
  if (!H.length && S.count) H = [{ t: 0, a: S.total || 0, p: S.app || "paypay", legacy: S.count }];   // 履歴機能より前の記録
  if (!H.length) return '<p class="tj__lead">まだ投げ銭の記録がありません。ここには、この端末で送った投げ銭が1件ずつ残ります。</p>';
  var byMonth = {};
  (S.hist || []).forEach(function (h) { var k = new Date(h.t).toLocaleDateString("ja-JP", { year: "numeric", month: "short" }); byMonth[k] = (byMonth[k] || 0) + h.a; });
  return '<div class="th__sum"><div><b>' + yen(S.total) + "</b><small>累計</small></div><div><b>" + (S.count || 0) + "</b><small>回</small></div>" +
    "<div><b>" + (S.count ? yen(Math.round((S.total || 0) / S.count)) : "—") + "</b><small>1回あたり</small></div></div>" +
    (Object.keys(byMonth).length ? '<div class="th__m">' + Object.keys(byMonth).map(function (k) { return "<span>" + esc(k) + " " + yen(byMonth[k]) + "</span>"; }).join("") + "</div>" : "") +
    '<table class="th__t"><thead><tr><th>#</th><th>日時</th><th>手段</th><th>金額</th></tr></thead><tbody>' +
    H.map(function (h, i) {
      return "<tr><td>" + (H.length - i) + "</td><td>" + (h.t ? esc(new Date(h.t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) : "（履歴機能より前・" + h.legacy + "回分の合計）") +
        "</td><td>" + appName(h.p) + "</td><td class=\"th__a\">" + yen(h.a) + "</td></tr>"; }).join("") + "</tbody></table>" +
    '<p class="tj__hint">記録はこの端末のブラウザにだけあります（当サイトのサーバーには何も送られていません）。</p>' +
    '<div class="th__clr">' + (S.gedatsu ? '<p class="tj__hint">これまでの解脱: ' + gedatsuBadge(S) + " " + S.gedatsu + " 回</p>" : "") +
    '<button id="tip-clear" class="tj__clr" type="button">🧹 履歴をぜんぶ消す（懺悔のリセット＝解脱）</button>' +
    '<p class="tj__hint">消すと、支援者の印と累計も消えて «まっさら» に戻ります。次の投げ銭がまた «初回» になります。</p></div>';
}
function bindHist(m, C) {
  var b = $("#tip-clear", m); if (!b) return;
  b.addEventListener("click", function () {
    var S0 = st(), n = (S0.gedatsu || 0) + 1, need = GEDATSU_WALL[n];
    if (n > 9) { RG.openModal("🎊 究極の解脱", '<div class="tj tj--c"><p class="tj__big">9 回目の解脱を達成されました。</p><p>あなたはすでに 9 回、暗いトンネルを抜けました。最高位に到達したあなたは、地図の伝説的なサポーターです。これまでのご応援、本当にありがとうございました。</p></div>'); return; }
    if (need && (S0.total || 0) < need) {
      RG.openModal("⚠️ 所定の金額に達していません", '<div class="tj tj--c">' +
        '<p class="tj__big">' + n + " 回目の解脱には、累計 <b>" + yen(need) + "</b> が必要です。</p>" +
        "<p>いまの累計は <b>" + yen(S0.total || 0) + "</b>。あと " + yen(need - (S0.total || 0)) + "。</p>" +
        '<img class="gd__gif" src="' + (RG.withV ? RG.withV("assets/img/gedatsu.gif") : "assets/img/gedatsu.gif") + '" alt="解脱の壁のグラフ">' +
        "<p>2 回目までは上限なしで容易に解脱できましたが、3 回目からは <b>1 万円</b>、以降は <b>×2.155 の等比級数</b>で壁が高くなり、9 回目の <b>999,999 円</b>が天井です（そこで寄付も打ち止め）。" +
        "べらぼうに上がっていくのが、解脱の厳しさです。ここで初めてお伝えしました。</p>" +
        '<div class="tj__row"><button class="set__b2" type="button" id="gd-pay">☕ 投げ銭で壁を越える</button><button class="set__b" type="button" onclick="RG.closeModal()">今日は俗世で</button></div></div>');
      var gp = document.getElementById("gd-pay"); if (gp) gp.addEventListener("click", function () { RG.showTip("pay"); });
      return;
    }
    var mm = RG.openModal("🧹 懺悔のリセット", '<div class="tj tj--c">' +
      '<p class="tj__big">これまでの投げ銭の記録を、すべて消します。</p>' +
      "<p>日々の懺悔を水に流すように。暗いトンネルを抜けて、まっさらな明るい世界へ。出家するかのような、すがすがしい気持ちで押してください。</p>" +
      '<p class="tj__hint">※ 消えるのはこの端末の記録だけです。送ったお金は（当然ながら）戻りません。</p>' +
      '<div class="tj__row"><button class="set__b2" type="button" id="tip-clear-go">🕊️ 出家する（履歴を消す）</button>' +
      '<button class="set__b" type="button" onclick="RG.closeModal()">まだ俗世にいる</button></div></div>');
    $("#tip-clear-go", mm).addEventListener("click", function () { RG.closeModal(); rebirth(); });
  });
}
var GEDATSU_WALL = { 3: 10000, 4: 21550, 5: 46440, 6: 100090, 7: 215700, 8: 464800, 9: 999999 };   // 3回目 1万円、以降 ×2.155、9回目 999,999円
/* トンネルの向こうの光へ（GIF を流しながら履歴を消す） */
function rebirth() {
  var ov = document.createElement("div"); ov.className = "rebirth";
  ov.innerHTML = '<img src="' + (RG.withV ? RG.withV("assets/img/rebirth.gif") : "assets/img/rebirth.gif") + '?t=' + Date.now() + '" alt="">' +
    '<div class="rebirth__t"><b>……</b><span>暗いトンネルを、抜けていきます</span></div>';
  document.body.appendChild(ov);
  requestAnimationFrame(function () { ov.classList.add("on"); });
  var t = ov.querySelector(".rebirth__t");
  setTimeout(function () {
    var S = st(); var keep = { skipConfirm: S.skipConfirm, name: S.name, org: S.org, sites: S.sites, lastTab: "hist", quickSeen: S.quickSeen,
                               gedatsu: (S.gedatsu || 0) + 1, life: S.life, inro: S.inro };   // 解脱回数と «生涯» 記録は残す（番付・印籠のため）
    save(keep); applyPatron();
    t.innerHTML = "<b>すべて、消えました</b><span>懺悔も、累計も、支援者の印も（解脱 " + ((S.gedatsu || 0) + 1) + " 回目）</span>";
  }, 1600);
  setTimeout(function () { t.innerHTML = "<b>🌅 新しい世界へ</b><span>おかえりなさい。次の投げ銭は、また «初回» です</span>"; ov.classList.add("light"); }, 3200);
  setTimeout(function () { ov.classList.remove("on"); setTimeout(function () { ov.remove(); RG.showTip("hist"); }, 600); }, 5200);
  ov.addEventListener("click", function () { ov.classList.remove("on"); setTimeout(function () { ov.remove(); RG.showTip("hist"); }, 300); });
}

/* ---- 感想・要望 ---- */
function msgHTML(C, S) {
  var left = S.lastMsgAt ? Math.ceil((S.lastMsgAt + 600000 - Date.now()) / 60000) : 0;
  return '<p class="tj__lead">💬 ご感想やご要望をお聞かせください。お名前とひとことを入れて「制作者へ届け！」を押すと、制作者のもとへ届きます。改善のご指摘やご提案が、地図をより良くしていきます。</p>' +
    '<div class="tj__form"><label>お名前（ニックネーム可）<input id="tip-name" maxlength="40" value="' + esc(S.name || "") + '"></label>' +
    '<label>ひとこと・ご要望（400字まで）<textarea id="tip-text" maxlength="400" rows="4">' + esc(S.reqFor || "") + '</textarea></label>' +
    (S.reqFor ? '<p class="tj__hint">📮 更新依頼として下書きを入れました。ご要望とともに投げ銭をいただくと、制作者のやる気が高まります。</p>' : "") +
    '<div class="tj__row"><button id="tip-send" class="set__b2" type="button"' + (left > 0 ? " disabled" : "") + ">📨 制作者へ届け！</button>" +
    (left > 0 ? '<span class="tj__hint">連投よけのため、あと約 ' + left + " 分お待ちください。</span>" : "") + "</div>" +
    '<div id="tip-msgres" class="tj__res"></div></div>' +
    '<p class="tj__hint">送り先: ' + (C.discordWebhook ? "制作者の Discord" : (C.googleForm && C.googleForm.action) ? "制作者の受信箱（フォーム）" : "制作者（メールアプリが開きます）") +
    "。メッセージには、この端末の来訪者ID <code>" + esc(vid()) + "</code> が付きます。連投や制作者の気分を害する内容には、制作者がこのIDのアクセスを断つことがあります。</p>";
}
function bindMsg(m, C) {
  var b = $("#tip-send", m), res = $("#tip-msgres", m); if (!b) return;
  b.addEventListener("click", function () {
    var name = ($("#tip-name", m).value || "").trim(), text = ($("#tip-text", m).value || "").trim();
    if (!name || !text) { res.textContent = "お名前とひとことの両方を入れてください。"; return; }
    var S = st(); if (S.lastMsgAt && Date.now() - S.lastMsgAt < 600000) { res.textContent = "連投よけのため、少し時間をおいてください。"; return; }
    delete S.reqFor;
    var body = "【東京ステーションガイド】" + name + " さんより\n" + text + "\n---\nvid:" + vid() + "  " + new Date().toLocaleString("ja-JP") +
               (S.total ? "  投げ銭累計 " + yen(S.total) : "");
    S.name = name;
    if (C.discordWebhook) {
      b.disabled = true; res.textContent = "送っています…";
      fetch(C.discordWebhook, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body.slice(0, 1900), username: "東京ステーションガイド 窓口", allowed_mentions: { parse: [] } }) })
        .then(function (r) { if (!r.ok) throw 0; S.lastMsgAt = Date.now(); save(S); res.innerHTML = "📨 届きました。ありがとうございます。制作者が確認いたします。"; })
        .catch(function () { b.disabled = false; res.innerHTML = "送れませんでした。<a href=\"" + mailtoHref(C, body) + "\">メールで送る</a> をお試しください。"; });
    } else if (C.googleForm && C.googleForm.action) {
      b.disabled = true; res.textContent = "送っています…";
      var fd = new FormData(); fd.append(C.googleForm.name, name); fd.append(C.googleForm.text, text + "\n---\nvid:" + vid() + (S.total ? " 投げ銭累計 " + yen(S.total) : ""));
      fetch(C.googleForm.action, { method: "POST", mode: "no-cors", body: fd })
        .then(function () { S.lastMsgAt = Date.now(); save(S); res.innerHTML = "📨 届きました。ありがとうございます。制作者が確認いたします。"; })
        .catch(function () { b.disabled = false; res.innerHTML = "送れませんでした。しばらくしてからもう一度お試しください。"; });
    } else {
      S.lastMsgAt = Date.now(); save(S);
      location.href = mailtoHref(C, body);
      res.innerHTML = "メールアプリが開きます。そのまま送信してください。";
    }
  });
}
function mailtoHref(C, body) {
  return "mailto:" + encodeURIComponent(C.mailto || "") + "?subject=" + encodeURIComponent("東京ステーションガイド 窓口") + "&body=" + encodeURIComponent(body);
}
})(window.RG);
