/* =========================================================================
   制作者への窓口：投げ銭と、改善要望  v71〜（v73 で履歴・リセット・スマホ即投げを追加）

   ■ 流れ
     入口（設定パネル／地図右のズーム列の ☕）→ 【確認POP】→ 窓口（投げ銭・くり返し・履歴・救いの言葉）
     確認POPは «次回からスキップ» を入れると出なくなる。
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
function appName(a) { return a === "kyash" ? "Kyash" : "PayPay"; }
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (RG.isTouch && RG.isTouch() && innerWidth < 900); }

/* ---- 記録（すべての「送りました」はここを通る） ---- */
var CAP = 999999;   // 9回目の解脱の天井。累計がここに達すると、それ以上の寄付はできない
function record(amt, app) {
  var S = st();
  if ((S.total || 0) >= CAP) { RG.tripStatus && RG.tripStatus("🙏 累計が 999,999 円に達しています。これ以上の寄付はできません（9回目の解脱が最大です）。", "info", 6000); return S; }
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
  var b = $("#tip-open", root); if (b) b.addEventListener("click", function () { RG.openTip(); });
  var h = $("#tip-hist", root); if (h) h.addEventListener("click", function () { RG.showTip("hist"); });
};

/* ---- 確認POP（スキップ設定があれば飛ばす） ---- */
RG.openTip = function (next) {
  var S = st();
  if (S.skipConfirm) { (next || RG.showTip)(); return; }
  var m = RG.openModal("⚠️ さきに、ひとつだけ確認", '<div class="tj tj--c">' +
    '<p class="tj__big">改善のご要望は出せます。ただし――</p>' +
    '<p>制作者は<b>「日本でいちばん多忙であるフリ」</b>が非常に上手いため、ご要望が実装される見込みは<b>極端に低い</b>です。' +
    "投げ銭をいただいても、この見込みは<b>上がりません</b>（心は温まります）。</p>" +
    '<p class="tj__q">それでも良いですか？</p>' +
    '<label class="set__sw"><input id="tip-skip" type="checkbox" checked> 次回からこの確認を出さない（連続して投げ銭するかた向け）</label>' +
    '<div class="tj__row"><button id="tip-yes" class="set__b2" type="button">はい、それでも</button>' +
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
          : x.bank ? '<button class="tj__cp" type="button" data-way-bank="' + x.id + '">振込依頼書／FBデータ</button>'
          : x.id === "cheerword" || x.id === "photo" || x.id === "info" ? '<button class="tj__cp" type="button" data-way-msg="1">窓口へ</button>'
          : x.id === "share" ? '<button class="tj__cp" type="button" data-way-share="1">共有</button>'
          : x.url ? '<a class="tj__cp" href="' + esc(x.url) + '" target="_blank" rel="noopener">公式 ↗</a>' : "") + "</span></li>"; }).join("") + "</ol>" +
    '<p class="src">アイコンは頭文字とブランド色による表現で、各社のロゴ（商標）は使っていません。「準備待ち」は制作者側のアカウント・リンク・口座の登録が要るもの。手数料・上限・本人確認は各サービスの規約に従います。</p>';
}
function bindWays(m, C) {
  m.querySelectorAll("[data-wcat]").forEach(function (b) { b.addEventListener("click", function () { var S = st(); S.wayCat = b.dataset.wcat; save(S); RG.showTip("ways"); }); });
  m.querySelectorAll("[data-way-quick]").forEach(function (b) { b.addEventListener("click", function () { var S = st(); S.app = b.dataset.wayQuick; save(S); RG.tipQuick(); }); });
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
  var app = S.app || "paypay";
  return SCHOOL_NOTE + '<p class="tj__lead">たった一人の制作者（<b>従業員1名の宗教法人</b>のような、非課税で端数の概念が無い世界の住人）を、確実に笑顔にできます。' +
    "このサイトの維持管理は<b>この投げ銭だけ</b>で成り立っています。</p>" +
    '<p class="tj__hint">いま見えているのは «投げ銭前» の姿です。投げ銭が積み上がるほど、制作者はビジュアルをよりリアルに・より高解像に・コンテンツをより充実させる努力をするつもりです（実現の日は未定、保証はまるでありません）。' +
    "初回の投げ銭では画面が確かに変わります。2回目以降は何も変わりません――それが世知辛さというものです。</p>" +
    '<div class="tj__apps"><button class="tj__app' + (app === "paypay" ? " on" : "") + '" type="button" data-app="paypay">PayPay <small>' + esc(C.paypayId) + "</small></button>" +
    '<button class="tj__app' + (app === "kyash" ? " on" : "") + '" type="button" data-app="kyash">Kyash <small>' + esc(C.kyashId) + "</small></button></div>" +
    '<div class="tj__amts">' + (C.amounts || [100, 500, 1000, 3000]).map(function (a) {
      var e = a >= 3000 ? "💎" : a >= 1000 ? "🍱" : a >= 500 ? "☕" : "🍬";
      return '<button class="tj__amt' + (S.lastAmount === a ? " on" : "") + '" type="button" data-amt="' + a + '"><span>' + e + "</span>" + yen(a) + "</button>"; }).join("") +
    '<button class="tj__amt tj__amt--poor" type="button" data-poor="1"><span>🙏</span>貧乏なので<br>救いの言葉を</button></div>' +
    '<div id="tip-how" class="tj__how"></div>' +
    (S.lastAmount ? '<p class="tj__last">前回: ' + yen(S.lastAmount) + "（" + appName(S.app) + "）。同じ額をくり返すなら「🔁 くり返し」へ。</p>" : "") +
    (isMobile() ? '<p class="tj__hint">📱 スマホなら、地図の右の <b>☕</b> ボタンから「押すだけ」で送れます（IDを自動コピーしてアプリを開きます）。</p>' : "");
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
  "2回目。1回目で画面は変わりました。2回目で変わるのは、制作者の表情だけです。",
  "3回目。三度目の正直、と言いますが、画面は正直に何も変わりません。心は変わります。",
  "4回目。ここまで来ると、もはや «常連»。常連に特典が無いのが、この世の世知辛さです。",
  "5回目。五円玉なら «ご縁»。五回目は «業» と書いて «カルマ» と読みます。",
  "6回目。制作者は今、多忙のフリをやめて、あなたの投げ銭画面を見つめています。",
  "7回目。ラッキーセブン。抽選はありません。当たりも外れも、はじめから無いのです。",
  "8回目。末広がり。広がるのは制作者の笑顔だけで、機能は広がりません（現時点では）。",
  "9回目。苦しいときの神頼み、と言いますが、神は宗教法人（従業員1名）の側にいます。",
  "10回目。ついに二桁。ここから先は、あなたと制作者だけの秘密の修行です。",
  "11回目以降。もう何も言うことはありません。輪廻転生した地球のどこかで、この徳は必ず……返ってこないかもしれません。"
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
  var S = st(), app = S.app || "paypay", amt = S.lastAmount || 0, how = $("#tip-how", m);
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
  paint();
}
function copy(text, btn, cb) {
  function done(ok) { if (btn) { var t = btn.textContent; btn.textContent = ok ? "コピーしました" : "コピーできません"; setTimeout(function () { btn.textContent = t; }, 1500); } cb && cb(ok); }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; } } catch (e) {}
  try { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); done(ok); } catch (e2) { done(false); }
}

/* ---- «押すだけ» 投げ銭（スマホ：押す→IDコピー→アプリ／PC：QR をスマホで読む） ---- */
function qrTarget(C, app, amt) {
  var l = link(C, app);
  if (l) return l;                                                    // 送金リンクがあれば、それを直接 QR に
  var base = C.siteUrl || (location.origin + location.pathname);
  return base + "?tip=1&app=" + app + (amt ? "&amt=" + amt : "");     // 無ければ、このサイトの «押すだけ» 画面を開く QR
}
RG.tipQuick = function (preAmt) {
  var S = st();
  if (!S.skipConfirm && !S.quickSeen) { S.quickSeen = 1; save(S); RG.openTip(function () { RG.tipQuick(preAmt); }); return; }
  var C = cfg(), app = S.app || "paypay", id = app === "kyash" ? C.kyashId : C.paypayId, mob = isMobile();
  var amts = C.amounts || [100, 500, 1000, 3000];
  var html = '<div class="tq' + (mob ? " tq--m" : " tq--pc") + '">' +
    '<div class="tq__apps"><button class="tq__app' + (app === "paypay" ? " on" : "") + '" type="button" data-qapp="paypay">PayPay</button>' +
    '<button class="tq__app' + (app === "kyash" ? " on" : "") + '" type="button" data-qapp="kyash">Kyash</button></div>' +
    '<div class="tq__id">送り先 ID <b>' + esc(id) + '</b> <button class="tj__cp" type="button" data-cp="' + esc(id) + '">コピー</button></div>' +
    (preAmt ? '<button class="tq__one" type="button" data-qamt="' + preAmt + '">☕ ' + yen(preAmt) + ' を送る <small>' + (mob ? "押すとIDをコピーして " + appName(app) + " が開きます" : "押すとIDをコピーします（PC は " + appName(app) + " のアプリ／ウェブで送ってください）") + '</small></button>' +
              '<p class="tq__hint">ほかの金額:</p>' : '') +
    '<div class="tq__amts">' + amts.map(function (a) {
      var e = a >= 3000 ? "💎" : a >= 1000 ? "🍱" : a >= 500 ? "☕" : "🍬";
      return '<button class="tq__amt" type="button" data-qamt="' + a + '"><span>' + e + "</span>" + yen(a) + "</button>"; }).join("") + "</div>" +
    (mob ? '<p class="tq__lead">金額を押すと <b>ID をコピー</b>して ' + appName(app) + ' が開きます。アプリで「送る」→ 貼り付け → 金額を入れるだけ。</p>'
         : '<div class="tq__pc"><div class="tq__qr" id="tq-qr"></div>' +
           '<div class="tq__pct"><b>スマホで読むと、そのまま「押すだけ」画面が開きます。</b>' +
           "金額を選ぶと QR にも金額が入り、スマホ側は<b>ボタン1回</b>で送れます。" +
           (link(C, app) ? "（この QR は " + appName(app) + " の送金リンクを直接開きます）" : "") + "</div></div>") +
    '<div id="tq-res" class="tq__res"></div>' +
    '<p class="tq__hint">押した時点で «送った» として履歴に残ります（まちがえたら「取り消す」）。' + (S.count ? "これまで " + S.count + " 回・" + yen(S.total) + "。" : "") +
    ' <button class="tj__lnk" type="button" id="tq-full">くわしい窓口</button> <button class="tj__lnk" type="button" id="tq-msg">🙏 救いの言葉・要望</button></p></div>';
  var m = RG.openModal("☕ 押すだけ投げ銭", html);
  m.classList.add("modal--sheet");
  var qrBox = $("#tq-qr", m), curAmt = preAmt || S.lastAmount || 0;
  function paintQR() { if (qrBox && RG.qrSvg) qrBox.innerHTML = RG.qrSvg(qrTarget(C, app, curAmt), 180, { label: "投げ銭のQR" }) + '<small>' + (curAmt ? yen(curAmt) + " の" : "") + "QR</small>"; }
  paintQR();
  m.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
  m.querySelectorAll("[data-qapp]").forEach(function (b) { b.addEventListener("click", function () { var S2 = st(); S2.app = b.dataset.qapp; save(S2); RG.tipQuick(preAmt); }); });
  m.querySelectorAll("[data-qamt]").forEach(function (b) { b.addEventListener("click", function () {
    var amt = +b.dataset.qamt, res = $("#tq-res", m);
    curAmt = amt; m.querySelectorAll(".tq__amt").forEach(function (x) { x.classList.toggle("on", +x.dataset.qamt === amt); });
    if (!mob) { paintQR(); copy(id, null);
      res.innerHTML = "📋 ID をコピーしました。📱 左の QR をスマホで読むと、" + yen(amt) + " の「押すだけ」画面が開きます。PC から送るなら " + appName(app) + " のアプリ／ウェブで ID を貼り付けて送ってください。" +
      ' <button class="tj__lnk" type="button" id="tq-pcdone">PC から送りました（記録する）</button>';
      var pd = $("#tq-pcdone", m); if (pd) pd.addEventListener("click", function () { var S3 = record(amt, app); afterTip(S3, amt); });
      return; }
    copy(id, null, function (ok) {
      var S2 = record(amt, app);
      res.innerHTML = (ok ? "📋 ID をコピーしました。" : "⚠️ コピーできませんでした。ID: <code>" + esc(id) + "</code>") +
        (link(C, app) ? ' <a class="set__b2" href="' + esc(link(C, app)) + '" target="_blank" rel="noopener">' + appName(app) + ' をひらく ↗</a>'
                      : ' <a class="set__b2" href="' + scheme(app) + '">' + appName(app) + ' をひらく</a>') +
        ' <button class="tj__lnk" type="button" id="tq-undo">取り消す</button>' +
        '<div class="tq__thx">🙏 ' + yen(amt) + "、確かに。累計 " + S2.count + " 回・" + yen(S2.total) + "。" + (S2.count === 1 ? " 初回なので画面が変わりました。" : " 画面は変わりません（世知辛さ）。") + "</div>";
      var u = $("#tq-undo", m); if (u) u.addEventListener("click", function () { undoLast(); RG.tipQuick(); });
      if (S2.count === 1) applyPatron();
      setTimeout(function () { try { location.href = link(C, app) || scheme(app); } catch (e) {} }, 350);   // アプリへ（スキームが無効なら何も起きない＝安全）
    });
  }); });
  var f = $("#tq-full", m); if (f) f.addEventListener("click", function () { RG.showTip("pay"); });
  var mg = $("#tq-msg", m); if (mg) mg.addEventListener("click", function () { RG.showTip("msg"); });
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
    box.innerHTML = '<p class="tj__big">' + (i + 1) + " / " + total + " 回目 ― " + yen(S.lastAmount) + "</p>" + howHTML(C, S.app || "paypay", S.lastAmount);
    box.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    box.querySelectorAll("[data-done]").forEach(function (b) { b.addEventListener("click", function () {
      var S3 = record(S.lastAmount, S.app || "paypay"); i++;
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
    if (n > 9) { RG.openModal("🧹 懺悔のリセット", '<div class="tj tj--c"><p class="tj__big">解脱は 9 回目が最大です。</p><p>あなたはすでに 9 回、暗いトンネルを抜けました。これ以上の解脱はなく、累計 999,999 円を超える寄付もできません。あとは静かに地図を眺めてください。</p></div>'); return; }
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

/* ---- 救いの言葉・要望 ---- */
function msgHTML(C, S) {
  var left = S.lastMsgAt ? Math.ceil((S.lastMsgAt + 600000 - Date.now()) / 60000) : 0;
  return '<p class="tj__lead">🙏 貧乏でも大丈夫。お名前とひとことを入れて「制作者へ届け！」を押すと、制作者のもとへ届きます。改善のご要望もここから（実装見込みは極端に低い前提で）。</p>' +
    '<div class="tj__form"><label>お名前（ニックネーム可）<input id="tip-name" maxlength="40" value="' + esc(S.name || "") + '"></label>' +
    '<label>ひとこと・ご要望（400字まで）<textarea id="tip-text" maxlength="400" rows="4">' + esc(S.reqFor || "") + '</textarea></label>' +
    (S.reqFor ? '<p class="tj__hint">📮 更新依頼として下書きを入れました。要望の前に <b>☕ 投げ銭</b> を一つ添えると、制作者の多忙のフリが 3% ほど揺らぎます。</p>' : "") +
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
        .then(function (r) { if (!r.ok) throw 0; S.lastMsgAt = Date.now(); save(S); res.innerHTML = "📨 届きました。ありがとうございます。制作者は多忙のフリをしながら、必ず読みます。"; })
        .catch(function () { b.disabled = false; res.innerHTML = "送れませんでした。<a href=\"" + mailtoHref(C, body) + "\">メールで送る</a> をお試しください。"; });
    } else if (C.googleForm && C.googleForm.action) {
      b.disabled = true; res.textContent = "送っています…";
      var fd = new FormData(); fd.append(C.googleForm.name, name); fd.append(C.googleForm.text, text + "\n---\nvid:" + vid() + (S.total ? " 投げ銭累計 " + yen(S.total) : ""));
      fetch(C.googleForm.action, { method: "POST", mode: "no-cors", body: fd })
        .then(function () { S.lastMsgAt = Date.now(); save(S); res.innerHTML = "📨 届きました。ありがとうございます。制作者は多忙のフリをしながら、必ず読みます。"; })
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
