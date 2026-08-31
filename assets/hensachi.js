/* =========================================================================
   偏差値の手入力と、一括提供の «申請»
   ・手入力は本当にできる。入れた瞬間に地図の色が変わり、端末に残る。
   ・一括反映は «有償プラン»。ただし工事中。
   ・塾・予備校の方からの提供は «申請フォーム» で受ける。ただし…（後述）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var KEY = "tsg.hensachi.v1";
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
RG.hensachiUser = load;

/* data/user_hensachi.js の値と、手入力の値を重ねる（手入力が優先） */
RG.rebuildHensachi = function () {
  var base = RG.HENSACHI_FILE || RG.HENSACHI || {};
  if (!RG.HENSACHI_FILE) RG.HENSACHI_FILE = Object.assign({}, base);
  RG.HENSACHI = Object.assign({}, RG.HENSACHI_FILE, load());
  RG.__hrankReset && RG.__hrankReset();
  if (RG.remergeEdu) RG.remergeEdu();
};

/* ------------------------------------------------------- 手入力の画面 */
RG.showHensachiEdit = function (preset) {
  var mine = load();
  var n = Object.keys(mine).length;
  var html = '<div class="hs">' +
    '<p class="set__d">学校の名前と偏差値を入れると、<b>その場で地図の色が変わります</b>。' +
    "入れた数字はこの端末に残り、次に開いたときも使われます。</p>" +
    '<div class="hs__add">' +
      '<input id="hs-n" type="search" placeholder="学校の名前（例: 東京大学）" ' +
        'autocomplete="off" value="' + esc(preset || "") + '">' +
      '<input id="hs-v" type="number" inputmode="numeric" min="20" max="90" placeholder="偏差値">' +
      '<button id="hs-go" type="button">入れる</button>' +
    "</div>" +
    '<div id="hs-sug" class="hs__sug"></div>' +
    '<div class="hs__list" id="hs-list"></div>' +
    '<div class="legend__foot">' +
      '<button id="hs-imp" class="set__b2" type="button">📋 まとめて貼りつけ</button>' +
      '<button id="hs-exp" class="set__b2" type="button">💾 書き出す</button>' +
      '<button id="hs-clr" class="set__b2" type="button">ぜんぶ消す</button>' +
    "</div>" +
    '<div class="hs__note">' +
      "<b>🚀 一括で反映したい方へ</b>" +
      "<p>何百校ぶんもの数字を一度に反映する機能は <b>有償プラン</b> の予定です。" +
      "…と言いたいところですが、<b>その有償プランは絶賛工事中</b>で、いつできるかは決まっていません。</p>" +
      "<p><b>手で入れるぶんには、いまこの瞬間から何校でも入れられます。</b>" +
      "上の «まとめて貼りつけ» を使えば、表計算ソフトからコピーした数百行を一度に取り込めます。" +
      "つまり実質、困ることはありません。</p>" +
      '<button id="hs-vendor" class="hs__vb" type="button">' +
      "🏫 塾・予備校の方はこちら（データ提供のご相談）</button>" +
    "</div>" +
    '<p class="src">偏差値は予備校各社が独自に調べたもので、複製・転載が禁じられています。' +
    "このアプリは数字を持っていません。<b>ご自分で調べた値を、ご自分のために使ってください。</b></p></div>";
  var m = RG.openModal("📊 偏差値を入れる（" + n + "校）", html);

  function paint() {
    var mine2 = load(), ks = Object.keys(mine2).sort(function (a, b) { return mine2[b] - mine2[a]; });
    $("#hs-list", m).innerHTML = ks.length
      ? ks.map(function (k) {
          var c = RG.hensachiColor(k);
          return '<div class="hs__r"><span class="hs__v" style="background:' +
            (c ? c.c : "#ccc") + '">' + mine2[k] + "</span>" +
            '<span class="hs__n">' + esc(k) + "</span>" +
            '<button class="hs__x" type="button" data-del="' + esc(k) + '">✕</button></div>';
        }).join("")
      : '<p class="set__d">まだ1校も入っていません。上の枠から入れてみてください。</p>';
    $$("[data-del]", m).forEach(function (b) {
      b.addEventListener("click", function () {
        var o = load(); delete o[b.dataset.del]; save(o);
        RG.rebuildHensachi(); paint();
      });
    });
  }
  function add() {
    var nm = $("#hs-n", m).value.trim(), v = parseFloat($("#hs-v", m).value);
    if (!nm || !(v >= 20 && v <= 90)) {
      RG.tripStatus("学校の名前と、20〜90の数字を入れてください。", "warn", 2800); return;
    }
    var o = load(); o[nm] = v; save(o);
    RG.rebuildHensachi(); paint();
    $("#hs-n", m).value = ""; $("#hs-v", m).value = "";
    RG.tripStatus("📊 " + nm + " に " + v + " を入れました。地図の色が変わります。", "ok", 3000);
  }
  $("#hs-go", m).addEventListener("click", add);
  $("#hs-v", m).addEventListener("keydown", function (e) { if (e.key === "Enter") add(); });
  // 学校名の候補を出す
  $("#hs-n", m).addEventListener("input", function () {
    var q = this.value.trim();
    var box = $("#hs-sug", m);
    if (q.length < 2) { box.innerHTML = ""; return; }
    var names = [];
    (RG.UNIV || []).forEach(function (u) { if (names.indexOf(u.b) < 0) names.push(u.b); });
    (RG.HIGH || []).forEach(function (h) { names.push(h.n); });
    var hit = names.filter(function (x) { return x.indexOf(q) >= 0; }).slice(0, 8);
    box.innerHTML = hit.map(function (x) {
      return '<button class="hs__s" type="button" data-pick="' + esc(x) + '">' + esc(x) + "</button>";
    }).join("");
    $$("[data-pick]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        $("#hs-n", m).value = b.dataset.pick; box.innerHTML = ""; $("#hs-v", m).focus();
      });
    });
  });
  $("#hs-clr", m).addEventListener("click", function () {
    save({}); RG.rebuildHensachi(); paint();
    RG.tripStatus("入れた数字をぜんぶ消しました。", "info", 2600);
  });
  $("#hs-exp", m).addEventListener("click", function () {
    var o = load();
    var txt = "RG.HENSACHI = " + JSON.stringify(o, null, 2) + ";\n";
    RG.openModal("💾 書き出し", '<p class="set__d">この中身を <code>data/user_hensachi.js</code> に' +
      "貼りつけると、この端末以外でも使えます。</p>" +
      '<textarea class="hs__ta" readonly>' + esc(txt) + "</textarea>");
  });
  $("#hs-imp", m).addEventListener("click", function () {
    var m2 = RG.openModal("📋 まとめて貼りつけ",
      '<p class="set__d">表計算ソフトから <b>学校名 と 偏差値</b> の2列をコピーして、' +
      "そのまま貼りつけてください。1行に1校です。<br>" +
      "区切りは <b>タブ・カンマ・スペース</b> のどれでもかまいません。</p>" +
      '<textarea class="hs__ta" id="hs-in" placeholder="東京大学\t72\n早稲田大学\t68\n慶應義塾大学\t68"></textarea>' +
      '<div class="legend__foot"><button id="hs-run" class="set__b2" type="button">取り込む</button></div>');
    $("#hs-run", m2).addEventListener("click", function () {
      var o = load(), ok = 0, ng = 0;
      ($("#hs-in", m2).value || "").split(/\r?\n/).forEach(function (line) {
        var p = line.trim().split(/[\t,;]+|\s{1,}/);
        if (p.length < 2) { if (line.trim()) ng++; return; }
        var v = parseFloat(p[p.length - 1]);
        var nm = p.slice(0, -1).join(" ").trim();
        if (!nm || !(v >= 20 && v <= 90)) { ng++; return; }
        o[nm] = v; ok++;
      });
      save(o); RG.rebuildHensachi();
      RG.closeModal();
      RG.showHensachiEdit();
      RG.tripStatus("📊 " + ok + " 校を取り込みました" + (ng ? "（" + ng + " 行は読めませんでした）" : "") +
        "。地図の色が変わります。", ok ? "ok" : "warn", 4200);
    });
  });
  $("#hs-vendor", m).addEventListener("click", function () { RG.showVendorForm(); });
  paint();
};

/* ==========================================================================
   塾・予備校の方からのデータ提供 «申請フォーム»
   ―― 申し込めるようには見えるが、たどり着くのがたいへんな作りにしてある。
      本当に有料化する気があるのかは、この長さから察していただきたい。
   ========================================================================== */
var TERMS = [
 "提供いただく数値の著作権・データベース権が、貴社に帰属することを確認しました",
 "第三者の調査結果を含まないことを確認しました",
 "掲載後、当サイトが数値を «参考値» として表示することに同意します",
 "数値の更新は年4回（3月・6月・9月・12月の各第2火曜）に限られることに同意します",
 "更新の締切が、反映希望日の45営業日前であることに同意します",
 "当サイトが数値の正確性について一切の保証を行わないことに同意します",
 "掲載順・表示色の決定権が当サイトにあることに同意します",
 "貴社ロゴの表示位置・大きさを当サイトが決定することに同意します",
 "ロゴは SVG（アウトライン化済み・単色・縦横比1:1・8KB以内）でご提供いただきます",
 "掲載の停止を求める場合、90日前までに書面でご連絡いただくことに同意します",
 "本申請が受理されない場合があること、および理由が開示されないことに同意します",
 "本申請に要した費用を貴社が負担することに同意します",
 "謝礼のお支払いが、当サイトの決済システムの完成後となることに同意します",
 "決済システムの完成時期が未定であることを理解しました",
 "上記すべてを、他の誰にも相談せずご自身で判断されたことを確認しました"
];
var SPEC = [
 ["ファイル形式", "UTF-8（BOMつき）の固定長テキスト。CSV・TSV・Excel は受け付けません"],
 ["改行コード", "CR+LF。ファイル末尾にも1つ必要です"],
 ["1行の長さ", "必ず512バイト。足りない分は全角スペースで埋めてください"],
 ["学校コード", "先頭12バイト。文部科学省の学校コード（13桁）の下12桁"],
 ["学校名", "13〜92バイト。JIS X 0208 の範囲。外字は「〓」に置換"],
 ["偏差値", "93〜97バイト。小数第1位まで。右詰め・ゼロ埋め（例: 0725）"],
 ["調査年月", "98〜103バイト。和暦6桁（例: R08 04 → 令和8年4月）"],
 ["区分", "104バイト。1=大学 2=短大 3=高校 4=その他"],
 ["文理", "105バイト。B=文系 R=理系 N=区分なし"],
 ["予備欄", "106〜510バイト。すべて全角スペース"],
 ["チェックディジット", "511〜512バイト。1〜510バイトのモジュラス11（ウェイト2-7循環）"],
 ["ファイル名", "HNS_｛貴社コード8桁｝_｛YYYYMMDD｝_｛連番3桁｝.dat"],
 ["貴社コード", "当サイトが発行します（発行手続きは決済システムの完成後）"],
 ["送付方法", "光ディスク（DVD-R・書き込み後クローズ処理済み）を書留郵便で"],
 ["送付先", "決済システムの完成後にお知らせします"]
];

RG.showVendorForm = function () {
  var step = 0, checked = {}, form = {};
  function render() {
    var html = '<div class="vf">' +
      '<div class="vf__bar"><i style="width:' + ((step / 4) * 100).toFixed(0) + '%"></i></div>' +
      '<div class="vf__st">ステップ ' + (step + 1) + " / 5</div>";
    if (step === 0) {
      html += '<h4 class="vf__h">1. ご提供の趣旨</h4>' +
        '<p class="set__d">偏差値データを一括で提供いただける塾・予備校の皆さまへ。' +
        "ご提供いただいた場合、<b>貴社のロゴを当サイトに掲出</b>いたします。</p>" +
        '<div class="vf__f"><label>貴社名<input id="vf-c" type="text" value="' +
          esc(form.c || "") + '" placeholder="◯◯予備校"></label>' +
        "<label>ご担当者名<input id=\"vf-p\" type=\"text\" value=\"" + esc(form.p || "") + '"></label>' +
        "<label>ご提供予定の校数<input id=\"vf-n\" type=\"number\" value=\"" + esc(form.n || "") +
          '" placeholder="例: 3000"></label></div>';
    } else if (step === 1) {
      html += '<h4 class="vf__h">2. 利用規約のご確認（' + TERMS.length + "項目)</h4>" +
        '<p class="set__d">恐れ入りますが、<b>すべて</b>にチェックをお願いいたします。</p>' +
        '<div class="vf__terms">' + TERMS.map(function (t, i) {
          return '<label class="vf__t"><input type="checkbox" data-t="' + i + '"' +
            (checked[i] ? " checked" : "") + "><span>" + esc(t) + "</span></label>";
        }).join("") + "</div>";
    } else if (step === 2) {
      html += '<h4 class="vf__h">3. ファイル仕様のご確認</h4>' +
        '<p class="set__d">ご提供データは、下記の仕様に<b>完全に</b>合致している必要があります。</p>' +
        '<table class="vf__spec">' + SPEC.map(function (r) {
          return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>";
        }).join("") + "</table>" +
        '<label class="vf__t vf__t--big"><input type="checkbox" data-spec="1"' +
        (checked.spec ? " checked" : "") + "><span>上記の仕様をすべて満たすファイルを作成できます</span></label>";
    } else if (step === 3) {
      html += '<h4 class="vf__h">4. 謝礼のご予算</h4>' +
        '<p class="set__d">当サイトからお支払いする謝礼の<b>ご希望額</b>をご入力ください。' +
        "お支払いは当サイトの決済システム完成後となります。</p>" +
        '<div class="vf__f"><label>ご希望の謝礼額（円）<input id="vf-y" type="number" value="' +
          esc(form.y || "") + '" placeholder="例: 500000"></label>' +
        '<label>お支払い希望時期<select id="vf-w">' +
          ["決済システムの完成後", "決済システムの完成後", "決済システムの完成後"].map(function (o, i) {
            return '<option value="' + i + '">' + o + "</option>"; }).join("") +
        "</select></label></div>" +
        '<p class="vf__warn">※ 選択肢は1つです。</p>';
    } else {
      html += '<h4 class="vf__h">5. 送信</h4>' +
        '<div class="vf__sum">' +
          "<div><span>貴社名</span><b>" + esc(form.c || "—") + "</b></div>" +
          "<div><span>ご担当者</span><b>" + esc(form.p || "—") + "</b></div>" +
          "<div><span>校数</span><b>" + esc(form.n || "—") + "</b></div>" +
          "<div><span>謝礼ご希望額</span><b>" +
            (form.y ? "¥" + Number(form.y).toLocaleString("ja-JP") : "—") + "</b></div>" +
          "<div><span>規約の確認</span><b>" + TERMS.length + " / " + TERMS.length + " 項目</b></div>" +
        "</div>" +
        '<button class="vf__send" id="vf-send" type="button">📮 この内容で申請する</button>';
    }
    html += '<div class="vf__nav">' +
      (step > 0 ? '<button class="set__b2" id="vf-prev" type="button">← 戻る</button>' : "") +
      (step < 4 ? '<button class="set__b2 vf__next" id="vf-next" type="button">次へ →</button>' : "") +
      "</div></div>";
    var m = RG.openModal("🏫 データ提供のお申し込み", html);
    if (step === 0) {
      ["c", "p", "n"].forEach(function (k) {
        var el = $("#vf-" + k, m);
        if (el) el.addEventListener("input", function () { form[k] = this.value; });
      });
    }
    if (step === 1) {
      $$("[data-t]", m).forEach(function (b) {
        b.addEventListener("change", function () { checked[b.dataset.t] = this.checked; });
      });
    }
    if (step === 2) {
      var sp = $("[data-spec]", m);
      if (sp) sp.addEventListener("change", function () { checked.spec = this.checked; });
    }
    if (step === 3) {
      var y = $("#vf-y", m);
      if (y) y.addEventListener("input", function () { form.y = this.value; });
    }
    var nx = $("#vf-next", m);
    if (nx) nx.addEventListener("click", function () {
      if (step === 1) {
        var miss = TERMS.filter(function (_, i) { return !checked[i]; }).length;
        if (miss) { RG.tripStatus("あと " + miss + " 項目のチェックが必要です。", "warn", 3200); return; }
      }
      if (step === 2 && !checked.spec) {
        RG.tripStatus("ファイル仕様のご確認にチェックをお願いいたします。", "warn", 3200); return;
      }
      step++; render();
    });
    var pv = $("#vf-prev", m);
    if (pv) pv.addEventListener("click", function () { step--; render(); });
    var sd = $("#vf-send", m);
    if (sd) sd.addEventListener("click", function () {
      RG.openModal("🚧 送信先が工事中です", '<div class="gate">' +
        '<div class="gate__e">🚧📮</div>' +
        '<p class="gate__t">ここまでお進みいただき、ありがとうございました。</p>' +
        '<p class="gate__b">申し訳ありません。<b>申請の送信先が絶賛工事中</b>です。' +
        "このフォームはどこにも送られません。<br>" +
        "そもそも当サイトには送信を受け取るしくみがありません（すべてブラウザの中で動いています）。</p>" +
        '<p class="gate__b">工事の完了時期は決まっていません。' +
        "作るかどうかは、みなさんの声（VOC）だけで決めます。</p>" +
        '<p class="gate__b gate__b--s">なお、この工事は<b>こよみの有償プラン</b>・' +
        "<b>ヤニカスチケットの決済</b>・<b>おとな向けの映像</b>と同じ現場が担当しています。<br>" +
        "現場はいま、たいへん混み合っております。</p>" +
        '<p class="gate__b"><b>その間も、偏差値の手入力は何校でもできます。</b>' +
        "«まとめて貼りつけ» なら、表計算ソフトからコピーした数百行を一度に取り込めます。</p>" +
        '<div class="gate__f"><button class="set__b2" type="button" ' +
        'onclick="RG.closeModal();RG.showHensachiEdit()">手で入れるほうへ戻る</button></div></div>');
    });
  }
  render();
};

})(window.RG);
