/* =========================================================================
   おとな向けの表示について
   ―― 小学生やお年寄りも使うサイトなので、既定では出しません。
      設定のいちばん奥（詳しい設定 → 表示するものを増やす）に切り替えがあります。
      アダルト系のライブ映像は «有償プラン» 扱い。ただし工事中です。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var AKEY = "tsg.adult.v1";

/* 有償プランの合いことばの照合。
   合いことばそのものはこのファイルにも説明書にも書きません。
   入力された文字列から数を作り、あらかじめ用意した数と合うかだけを見ます。
   （元の文字列を復元することはできません） */
var GATE = 2085747948;
function digest(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}
function okPass(s) { return digest(String(s || "").trim()) === GATE; }
function on() { try { return localStorage.getItem(AKEY) === "1"; } catch (e) { return false; } }
function setOn(v) { try { v ? localStorage.setItem(AKEY, "1") : localStorage.removeItem(AKEY); } catch (e) {} }
RG.adultOn = on;

/* ------------------------------------------------- 見つけたときの案内 */
RG.showAdultGate = function () {
  var html = '<div class="gate">' +
    '<div class="gate__e">😅💦</div>' +
    '<p class="gate__t">おっと…その先は <b>おとなの領域</b> です。</p>' +
    '<p class="gate__b">このサイトは小学生からお年寄りまで使います。' +
    "そのため、ラブホテルやアダルトショップは<b>はじめから地図に出しません</b>。</p>" +
    '<p class="gate__b">ご覧になるには <b>2つ</b> が必要です。<br>' +
    "① <b>⚙️設定 → いちばん下の «くわしい設定» → «表示するものを増やす»</b> まで進む<br>" +
    "② <b>有償プランの合いことば</b>を入れる</p>" +
    '<p class="gate__b gate__b--s">なお、有償プランのお申し込み口は絶賛工事中です。' +
    "いまのところ新しくご加入いただく方法はありません。</p>" +
    '<div class="gate__f"><button class="set__b2" type="button" onclick="RG.closeModal()">' +
    "わかりました</button></div></div>";
  RG.openModal("😅 おとなの領域", html);
};

/* ------------------------------------------------------- 施設1件のカード */
RG.showAdult = function (a) {
  var K = (RG.ADULT_KIND || {})[a.k] || {};
  var near = RG.nearestStation ? RG.nearestStation(a.la, a.lo) : null;
  var html = '<div class="smk">' +
    '<div class="smk__hd" style="--lc:' + (K.c || "#888") + '">' +
      '<span class="smk__e">' + (K.e || "🔞") + "</span>" +
      "<div><h3>" + esc(a.n) + '</h3><p class="smk__k">' + esc(K.label || "") + "</p></div></div>" +
    '<div class="smkg">' +
      (a.op ? '<div class="smkr"><span>🕐 営業時間</span><b>' + esc(a.op) + "</b></div>" : "") +
      (a.br ? '<div class="smkr"><span>🏢 チェーン</span><b>' + esc(a.br) + "</b></div>" : "") +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
      '<div class="smkr"><span>💰 料金・くわしい情報</span><b class="na">有償プラン（工事中）</b></div>' +
    "</div>" +
    '<button class="gate__more" type="button" id="ad-more">💰 くわしい情報を見る</button>' +
    RG.outLinks({ site: a.web, map: a.la + "," + a.lo }) +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。<br>' +
    "<b>18歳未満の方は利用できません。</b>営業の有無・料金は変わります。" +
    "現地の表示と公式情報をご確認ください。</p></div>";
  var m = RG.openModal((K.e || "🔞") + " " + a.n, html);
  var b = $("#ad-more", m);
  if (b) b.addEventListener("click", function () {
    RG.openModal("🚧 くわしい情報は工事中です", '<div class="gate">' +
      '<div class="gate__e">🚧😅</div>' +
      '<p class="gate__t">料金・部屋の様子などのくわしい情報は <b>有償プラン</b> の予定です。</p>' +
      '<p class="gate__b">その有償プランは<b>絶賛工事中</b>で、いつできるかは決まっていません。' +
      "作るかどうかは、みなさんの声（VOC）だけで決めます。</p>" +
      '<div class="gate__f"><button class="set__b2" type="button" onclick="RG.closeModal()">' +
      "そうですか</button></div></div>");
  });
};

/* ------------------------------------------------ 設定のいちばん奥の切り替え */
RG.adultSwitchHTML = function () {
  return '<details class="deep"><summary>くわしい設定</summary>' +
    '<div class="deep__b">' +
      '<p class="deep__d">ここから先は、ふだん使わない設定です。</p>' +
      '<label class="set__sw"><input id="big-sw" type="checkbox"' +
      ((RG.settings && RG.settings.bigtext) ? " checked" : "") +
      "> 🔠 文字を大きくする（画面ぜんぶ）</label>" +
      '<p class="deep__d">小さい字が読みづらいときに。地図の文字は変わりません。</p>' +
      '<details class="deep deep--in"><summary>表示するものを増やす</summary>' +
        '<div class="deep__b">' +
          '<label class="set__sw"><input id="ad-sw" type="checkbox"' + (on() ? " checked" : "") +
          "> 🔞 おとな向けの施設を地図に出す（ラブホテル・アダルトショップ）</label>" +
          '<p class="deep__d">18歳未満の方は入れないでください。' +
          "既定では出しません。切り替えると " + ((RG.ADULT || []).length) +
          " 件が地図に出ます。</p>" +
          '<label class="set__sw"><input id="cs-sw" type="checkbox"' +
          ((RG.settings && RG.settings.camspot) ? " checked" : "") +
          "> 📷 防犯カメラの設置場所を地図に出す（映像は見られません）</label>" +
          '<p class="deep__d">まちに置かれている防犯カメラの位置です。' +
          ((RG.CAMSPOT || []).length) + " 件。映像は公開されていません。</p>" +
        "</div></details>" +
    "</div></details>";
};
RG.bindAdultSwitch = function (root) {
  var a = $("#ad-sw", root);
  if (a) a.addEventListener("change", function () {
    var self = this;
    if (self.checked && !on()) {
      // 入れるときは、有償プランの合いことばが要ります
      self.checked = false;
      RG.askAdultPass(function () {
        self.checked = true;
        setOn(true);
        RG.__adultMerged = false;
        if (RG.mergeAdult) RG.mergeAdult();
        if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
        if (RG.rebuildRail) RG.rebuildRail();
        RG.tripStatus("🔞 おとな向けの施設を地図に出しました。", "info", 3000);
      });
      return;
    }
    setOn(this.checked);
    RG.__adultMerged = false;
    if (RG.mergeAdult) RG.mergeAdult();
    if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
    if (RG.rebuildRail) RG.rebuildRail();
    RG.tripStatus(this.checked
      ? "🔞 おとな向けの施設を地図に出しました。"
      : "おとな向けの施設を地図から消しました。", "info", 3000);
  });
  var bg = $("#big-sw", root);
  if (bg) bg.addEventListener("change", function () {
    if (RG.settings) RG.settings.bigtext = this.checked;
    if (RG.saveSettings) RG.saveSettings();
    document.documentElement.classList.toggle("bigtext", this.checked);
  });
  var c = $("#cs-sw", root);
  if (c) c.addEventListener("change", function () {
    if (RG.settings) RG.settings.camspot = this.checked;
    if (RG.saveSettings) RG.saveSettings();
    RG.__camspotMerged = false;
    if (RG.mergeCamSpot) RG.mergeCamSpot();
    if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
    if (RG.rebuildRail) RG.rebuildRail();
  });
};

/* ------------------------------------------- 有償プランの合いことばを聞く */
RG.askAdultPass = function (onOK) {
  var html = '<div class="pw">' +
    '<div class="pw__e">🔐</div>' +
    '<p class="pw__t">ここから先は <b>有償プラン</b> の方だけがご覧になれます。</p>' +
    '<p class="pw__b">おとな向けの施設（ラブホテル・アダルトショップ）と、' +
    "おとな向けのライブ映像は、<b>有償プランにご加入いただいた方にお伝えする合いことば</b>を" +
    "入れていただくと表示できます。</p>" +
    '<div class="pw__f"><input id="pw-in" type="password" inputmode="numeric" ' +
      'autocomplete="off" placeholder="合いことば" maxlength="24">' +
      '<button id="pw-go" type="button">確かめる</button></div>' +
    '<p class="pw__ng" id="pw-ng" hidden>合いことばがちがいます。</p>' +
    '<div class="pw__note"><b>💰 ご加入について</b>' +
    "<p>有償プランのお申し込み口は<b>絶賛工事中</b>で、いつできるかは決まっていません。" +
    "作るかどうかは、みなさんの声（VOC）だけで決めます。<br>" +
    "つまり、いまのところ新しくご加入いただく方法はありません。</p>" +
    "<p>この工事は、こよみの有償プラン・ヤニカスチケットの決済・" +
    "偏差値の一括反映と同じ現場が担当しています。現場はたいへん混み合っております。</p></div>" +
    '<p class="src">18歳未満の方はご覧になれません。' +
    "合いことばはこの端末にのみ記録され、どこにも送られません。</p></div>";
  var m = RG.openModal("🔐 合いことばの確認", html);
  function go() {
    var v = $("#pw-in", m).value;
    if (okPass(v)) { RG.closeModal(); if (onOK) onOK(); return; }
    var ng = $("#pw-ng", m);
    if (ng) ng.hidden = false;
    $("#pw-in", m).value = "";
    $("#pw-in", m).focus();
  }
  $("#pw-go", m).addEventListener("click", go);
  $("#pw-in", m).addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  setTimeout(function () { var el = $("#pw-in", m); if (el) el.focus(); }, 50);
};

/* おとな向けのライブ映像も、同じ合いことばの先にある */
RG.showAdultCam = function () {
  if (!on()) { RG.askAdultPass(function () { RG.showAdultCam(); }); return; }
  RG.openModal("😅 おっとっと", '<div class="gate">' +
    '<div class="gate__e">🫠💦</div>' +
    '<p class="gate__t">合いことばの確認、ありがとうございました。</p>' +
    '<p class="gate__b">…なのですが、<b>肝心の映像を配信するしくみが絶賛工事中</b>です。' +
    "いつできるかは決まっていません。</p>" +
    '<p class="gate__b gate__b--s">この工事は、こよみの有償プラン・ヤニカスチケットの決済・' +
    "偏差値の一括反映・提供のお申し込み口と同じ現場が担当しています。<br>" +
    "現場はいま、たいへん混み合っております。</p>" +
    '<div class="gate__f"><button class="set__b2" type="button" onclick="RG.closeModal()">' +
    "残念でした</button></div></div>");
};

/* --------------------------------------------------------- 取り込み */
RG.mergeAdult = function () {
  if (!on() || RG.__adultMerged || !RG.ADULT) return;
  RG.__adultMerged = true;
  var K = RG.ADULT_KIND || {};
  RG.ADULT.forEach(function (a, i) {
    var k = K[a.k] || {};
    RG.MAPPOI.push({ i: "ad" + i, n: a.n, la: a.la, lo: a.lo, g: "adult",
                     s: 2.5, ti: 2, t: k.label, be: k.e, bc: k.c, adult: a });
  });
};
RG.mergeCamSpot = function () {
  if (!(RG.settings && RG.settings.camspot) || RG.__camspotMerged || !RG.CAMSPOT) return;
  RG.__camspotMerged = true;
  RG.CAMSPOT.forEach(function (c, i) {
    RG.MAPPOI.push({ i: "cs" + i, n: c.n || "防犯カメラ", la: c.la, lo: c.lo, g: "camspot",
                     s: 2.0, ti: 2, t: c.z || "防犯カメラ", be: "📷", bc: "#5A6472", camspot: c });
  });
};

/* 防犯カメラ1件のカード */
RG.showCamSpot = function (c) {
  var near = RG.nearestStation ? RG.nearestStation(c.la, c.lo) : null;
  RG.openModal("📷 " + (c.n || "防犯カメラ"), '<div class="smk">' +
    '<div class="smk__hd" style="--lc:#5A6472"><span class="smk__e">📷</span>' +
    "<div><h3>" + esc(c.n || "防犯カメラ") + '</h3><p class="smk__k">設置場所の記録</p></div></div>' +
    '<p class="smk__d">まちに置かれている防犯カメラの位置です。' +
    "<b>映像は公開されていません。</b>ここで見ることはできません。</p>" +
    '<div class="smkg">' +
      (c.z ? '<div class="smkr"><span>👁 写している場所</span><b>' + esc(c.z) + "</b></div>" : "") +
      (c.by ? '<div class="smkr"><span>🏢 設置者</span><b>' + esc(c.by) + "</b></div>" : "") +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
    "</div>" +
    RG.outLinks({ map: c.la + "," + c.lo }) +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。' +
    "地図に載っているのは登録されたものだけで、すべてではありません。</p></div>");
};

})(window.RG);
