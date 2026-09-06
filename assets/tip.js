/* =========================================================================
   制作者への窓口：投げ銭と、改善要望  v71〜   （設定パネルの奥の入口から）

   ■ 流れ
     入口 → 【確認POP】「要望は出せますが、実装される見込みは極端に低いです。それでも良いですか？」
          → 窓口（PayPay / Kyash、金額ボタン、救いの言葉、要望フォーム）
     確認POPは «次回からスキップ» を入れると出なくなる（連続して投げ銭するかたのため）。
     スキップ中は «くり返し» 画面が使える：前回の金額を何回くり返すかを決めて、1回ずつ送金リンクを開く。
   ■ 送金
     PayPay / Kyash とも、アカウント名だけで開ける公開URLは用意されていないので、
     data/support.js の paypayLink / kyashLink（アプリで作る送金リンク）が空のときは
     「IDをコピー → アプリで送る」の手順を出す。当サイトは金額もお金も一切あずからない。
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
function yen(n) { return "¥" + n.toLocaleString("ja-JP"); }

/* 起動時：入口の準備と、拒否リストの照合 */
RG.tipInit = function () {
  var v = vid();
  if ((RG.BANLIST || []).indexOf(v) >= 0) {
    document.body.innerHTML = '<div style="max-width:560px;margin:15vh auto;padding:24px;font:15px/1.8 system-ui;text-align:center">' +
      "<h1 style=\"font-size:22px\">🚫 このブラウザからは利用できません</h1>" +
      "<p>制作者の判断により、この端末（ID: <code>" + esc(v) + "</code>）からのアクセスをお断りしています。</p>" +
      "<p>心当たりがないときは、制作者までご連絡ください。</p></div>";
    throw new Error("banned");
  }
};

/* 設定パネルに差し込む入口 */
RG.tipEntryHTML = function () {
  return '<div class="set__sec tjin"><h4>☕ 制作者へ（投げ銭・改善要望）</h4>' +
    '<p class="set__d">このサイトは<b>従業員1名の宗教法人</b>のような世界（非課税・端数なし）で、たった一人の制作者が細々と維持しています。' +
    "維持管理は<b>ここからの投げ銭だけ</b>が頼りです。改善のご要望もここから。</p>" +
    '<button id="tip-open" class="set__b2" type="button">☕ 窓口をひらく</button></div>';
};
RG.tipBind = function (root) {
  var b = $("#tip-open", root);
  if (b) b.addEventListener("click", function () { RG.openTip(); });
};

/* 確認POP（スキップ設定があれば飛ばす） */
RG.openTip = function () {
  var S = st();
  if (S.skipConfirm) { RG.showTip(); return; }
  var m = RG.openModal("⚠️ さきに、ひとつだけ確認", '<div class="tj tj--c">' +
    '<p class="tj__big">改善のご要望は出せます。ただし――</p>' +
    '<p>制作者は<b>「日本でいちばん多忙であるフリ」</b>が非常に上手いため、ご要望が実装される見込みは<b>極端に低い</b>です。' +
    "投げ銭をいただいても、この見込みは<b>上がりません</b>（心は温まります）。</p>" +
    '<p class="tj__q">それでも良いですか？</p>' +
    '<label class="set__sw"><input id="tip-skip" type="checkbox"> 次回からこの確認を出さない（連続して投げ銭するかた向け）</label>' +
    '<div class="tj__row"><button id="tip-yes" class="set__b2" type="button">はい、それでも</button>' +
    '<button id="tip-no" class="set__b" type="button">やめておく</button></div></div>');
  $("#tip-yes", m).addEventListener("click", function () {
    var S2 = st(); S2.skipConfirm = !!$("#tip-skip", m).checked; save(S2); RG.showTip();
  });
  $("#tip-no", m).addEventListener("click", function () { RG.closeModal(); });
};

/* 窓口本体 */
RG.showTip = function (tab) {
  var C = cfg(), S = st(); tab = tab || S.lastTab || "pay";
  var head = '<div class="tj">' +
    '<div class="tj__tabs">' + [["pay", "☕ 投げ銭"], ["loop", "🔁 くり返し"], ["msg", "✉️ 救いの言葉・要望"]].map(function (t) {
      return '<button class="tj__tab' + (t[0] === tab ? " on" : "") + '" type="button" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
  var body = tab === "pay" ? payHTML(C, S) : tab === "loop" ? loopHTML(C, S) : msgHTML(C, S);
  var foot = '<p class="src">当サイトはお金も個人情報も<b>一切あずかりません</b>。送金は各アプリの中で完結し、金額・回数はご自身の判断です。' +
    "確認POPをスキップにした設定は、この端末だけに保存されます。" +
    '<button id="tip-reset" class="tj__lnk" type="button">確認POPを元に戻す</button></p></div>';
  var m = RG.openModal("☕ 制作者への窓口", head + body + foot);
  m.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { var S2 = st(); S2.lastTab = b.dataset.tab; save(S2); RG.showTip(b.dataset.tab); }); });
  $("#tip-reset", m).addEventListener("click", function () { var S2 = st(); S2.skipConfirm = false; save(S2); RG.tripStatus && RG.tripStatus("次回から確認POPが出ます。", "info", 3000); });
  if (tab === "pay") bindPay(m, C); else if (tab === "loop") bindLoop(m, C); else bindMsg(m, C);
};

/* ---- 投げ銭 ---- */
function payHTML(C, S) {
  var app = S.app || "paypay";
  return '<p class="tj__lead">たった一人の制作者（<b>従業員1名の宗教法人</b>のような、非課税で端数の概念が無い世界の住人）を、確実に笑顔にできます。' +
    "このサイトの維持管理は<b>この投げ銭だけ</b>で成り立っています。</p>" +
    '<div class="tj__apps"><button class="tj__app' + (app === "paypay" ? " on" : "") + '" type="button" data-app="paypay">PayPay <small>' + esc(C.paypayId) + "</small></button>" +
    '<button class="tj__app' + (app === "kyash" ? " on" : "") + '" type="button" data-app="kyash">Kyash <small>' + esc(C.kyashId) + "</small></button></div>" +
    '<div class="tj__amts">' + (C.amounts || [100, 500, 1000, 3000]).map(function (a) {
      var e = a >= 3000 ? "💎" : a >= 1000 ? "🍱" : a >= 500 ? "☕" : "🍬";
      return '<button class="tj__amt' + (S.lastAmount === a ? " on" : "") + '" type="button" data-amt="' + a + '"><span>' + e + "</span>" + yen(a) + "</button>"; }).join("") +
    '<button class="tj__amt tj__amt--poor" type="button" data-poor="1"><span>🙏</span>貧乏なので<br>救いの言葉を</button></div>' +
    '<div id="tip-how" class="tj__how"></div>' +
    (S.lastAmount ? '<p class="tj__last">前回: ' + yen(S.lastAmount) + "（" + (S.app === "kyash" ? "Kyash" : "PayPay") + "）。同じ額をくり返すなら「🔁 くり返し」へ。</p>" : "");
}
function link(C, app, amt) {
  var l = app === "kyash" ? C.kyashLink : C.paypayLink;
  return l ? l : null;
}
function howHTML(C, app, amt) {
  var id = app === "kyash" ? C.kyashId : C.paypayId, name = app === "kyash" ? "Kyash" : "PayPay", l = link(C, app, amt);
  if (l) {
    return '<p><b>' + yen(amt) + "</b> を " + name + " で送ります。下のボタンでアプリ（またはリンク先）が開きます。金額はアプリ側で <b>" + yen(amt) + "</b> と入力してください。</p>" +
      '<a class="set__b2 tj__go" href="' + esc(l) + '" target="_blank" rel="noopener" data-done="1">' + name + " をひらく ↗</a>";
  }
  return '<p><b>' + yen(amt) + "</b> を " + name + " で送る手順（" + name + " は<b>アカウント名だけで開ける送金URL</b>を用意していないため、コピーしてアプリで送ります）：</p>" +
    '<ol class="tj__ol"><li>送り先のID <code>' + esc(id) + '</code> を <button class="tj__cp" type="button" data-cp="' + esc(id) + '">コピー</button></li>' +
    "<li>" + name + " アプリを開き、「送る」→ ID（" + (app === "kyash" ? "Kyash ID" : "PayPay ID") + "）で検索 → 貼り付け</li>" +
    "<li>金額 <b>" + yen(amt) + "</b> を入れて送る（メッセージ欄に「東京ステーションガイド」と書くと制作者が泣いて喜びます）</li></ol>" +
    '<button class="set__b2 tj__go" type="button" data-done="1">送りました（記録する）</button>';
}
function bindPay(m, C) {
  var S = st(), app = S.app || "paypay", amt = S.lastAmount || 0, how = $("#tip-how", m);
  function paint() { how.innerHTML = amt ? howHTML(C, app, amt) : '<p class="tj__hint">金額を選ぶと手順が出ます。</p>'; bindHow(); }
  function bindHow() {
    how.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    how.querySelectorAll("[data-done]").forEach(function (b) { b.addEventListener("click", function () {
      var S2 = st(); S2.lastAmount = amt; S2.app = app; S2.count = (S2.count || 0) + 1; S2.total = (S2.total || 0) + amt; save(S2);
      RG.tripStatus && RG.tripStatus("🙏 " + yen(amt) + " の投げ銭、ありがとうございます（累計 " + S2.count + " 回）", "ok", 5000);
    }); });
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
function copy(text, btn) {
  function done(ok) { if (btn) { var t = btn.textContent; btn.textContent = ok ? "コピーしました" : "コピーできません"; setTimeout(function () { btn.textContent = t; }, 1500); } }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; } } catch (e) {}
  try { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); done(ok); } catch (e2) { done(false); }
}

/* ---- くり返し（前回の金額 × 回数） ---- */
function loopHTML(C, S) {
  if (!S.lastAmount) return '<p class="tj__lead">まだ投げ銭の記録がありません。まず「☕ 投げ銭」で1回送ると、ここで同じ額のくり返しができます。</p>';
  var name = S.app === "kyash" ? "Kyash" : "PayPay";
  return '<p class="tj__lead">前回の <b>' + yen(S.lastAmount) + "</b>（" + name + "）を、何回くり返しますか？ 1回ごとに手順（またはアプリ）を開き、「送りました」で次へ進みます。</p>" +
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
  $("#tip-start", m).addEventListener("click", function () {
    var S2 = st(); S2.loopN = total; save(S2); i = 0; step();
  });
  function step() {
    if (i >= total) { box.innerHTML = '<p class="tj__big">🎉 ' + total + " 回、完了。累計 " + yen(st().total || 0) + "。制作者は確実に笑顔です。</p>"; return; }
    box.innerHTML = '<p class="tj__big">' + (i + 1) + " / " + total + " 回目 ― " + yen(S.lastAmount) + "</p>" + howHTML(C, S.app || "paypay", S.lastAmount);
    box.querySelectorAll("[data-cp]").forEach(function (b) { b.addEventListener("click", function () { copy(b.dataset.cp, b); }); });
    box.querySelectorAll("[data-done]").forEach(function (b) { b.addEventListener("click", function () {
      var S3 = st(); S3.count = (S3.count || 0) + 1; S3.total = (S3.total || 0) + S.lastAmount; save(S3); i++; step();
    }); });
  }
}

/* ---- 救いの言葉・要望 ---- */
function msgHTML(C, S) {
  var left = S.lastMsgAt ? Math.ceil((S.lastMsgAt + 600000 - Date.now()) / 60000) : 0;
  return '<p class="tj__lead">🙏 貧乏でも大丈夫。お名前とひとことを入れて「制作者へ届け！」を押すと、制作者のもとへ届きます。改善のご要望もここから（実装見込みは極端に低い前提で）。</p>' +
    '<div class="tj__form"><label>お名前（ニックネーム可）<input id="tip-name" maxlength="40" value="' + esc(S.name || "") + '"></label>' +
    '<label>ひとこと・ご要望（400字まで）<textarea id="tip-text" maxlength="400" rows="4"></textarea></label>' +
    '<div class="tj__row"><button id="tip-send" class="set__b2" type="button"' + (left > 0 ? " disabled" : "") + ">📨 制作者へ届け！</button>" +
    (left > 0 ? '<span class="tj__hint">連投よけのため、あと約 ' + left + " 分お待ちください。</span>" : "") + "</div>" +
    '<div id="tip-msgres" class="tj__res"></div></div>' +
    '<p class="tj__hint">送り先: ' + (C.discordWebhook ? "制作者の Discord" : "制作者のメール（" + esc(C.mailto || "") + "）") +
    "。メッセージには、この端末の来訪者ID <code>" + esc(vid()) + "</code> が付きます。連投や制作者の気分を害する内容には、制作者がこのIDのアクセスを断つことがあります。</p>";
}
function bindMsg(m, C) {
  var b = $("#tip-send", m), res = $("#tip-msgres", m); if (!b) return;
  b.addEventListener("click", function () {
    var name = ($("#tip-name", m).value || "").trim(), text = ($("#tip-text", m).value || "").trim();
    if (!name || !text) { res.textContent = "お名前とひとことの両方を入れてください。"; return; }
    var S = st(); if (S.lastMsgAt && Date.now() - S.lastMsgAt < 600000) { res.textContent = "連投よけのため、少し時間をおいてください。"; return; }
    var body = "【東京ステーションガイド】" + name + " さんより\n" + text + "\n---\nvid:" + vid() + "  " + new Date().toLocaleString("ja-JP") +
               (S.total ? "  投げ銭累計 " + yen(S.total) : "");
    S.name = name;
    if (C.discordWebhook) {
      b.disabled = true; res.textContent = "送っています…";
      fetch(C.discordWebhook, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body.slice(0, 1900), username: "東京ステーションガイド 窓口", allowed_mentions: { parse: [] } }) })
        .then(function (r) { if (!r.ok) throw 0; S.lastMsgAt = Date.now(); save(S); res.innerHTML = "📨 届きました。ありがとうございます。制作者は多忙のフリをしながら、必ず読みます。"; })
        .catch(function () { b.disabled = false; res.innerHTML = "送れませんでした。<a href=\"" + mailtoHref(C, body) + "\">メールで送る</a> をお試しください。"; });
    } else {
      S.lastMsgAt = Date.now(); save(S);
      location.href = mailtoHref(C, body);
      res.innerHTML = "メールソフトが開きます（開かないときは <code>" + esc(C.mailto || "") + "</code> 宛に本文をお送りください）。";
    }
  });
}
function mailtoHref(C, body) {
  return "mailto:" + encodeURIComponent(C.mailto || "") + "?subject=" + encodeURIComponent("東京ステーションガイド 窓口") + "&body=" + encodeURIComponent(body);
}
})(window.RG);
