/* =========================================================================
   みんなの声の «受け皿» を 1 回の実行で作る Google Apps Script（v88）
   ―― 投稿（memo）・イイね！（like）・閲覧（view）の 3 つの Google フォームと回答シートを作り、
      data/support.js に貼る設定（action と entry.xxxx）をログに出す。
   使いかた（3 分・制作者の Google アカウントで）
     1. https://script.google.com/ → 「新しいプロジェクト」→ この内容をぜんぶ貼り付け → 保存
     2. 上の関数名で setupAll を選び「実行」→ 初回は権限の許可（フォーム・スプレッドシート・ドライブ）
     3. 「実行ログ」に出た JSON を data/support.js の memoForm / likeForm / viewForm に貼る
     4. ログに出る 3 つのスプレッドシートの URL を開き、それぞれ  ファイル → 共有 → ウェブに公開 → 「カンマ区切り形式(.csv)」 で公開
        → 出た URL を memoCsv / likeCsv / viewCsv に貼る（列名は自動で質問名＝キーになっているので、そのままで読める）
   ※ フォームは「回答を 1 回に制限」しない（ログインなしで誰でも送れるように）。メールアドレス収集もオフ。
   ========================================================================= */
var FIELDS = {
  memo: ["st", "name", "nick", "text", "vid", "t", "quiet", "step", "xfer", "night", "toilet", "elev", "kind", "pref", "la", "lo"],
  like: ["id", "vid", "t", "name"],
  view: ["name", "vid", "t"]
};
var TITLES = { memo: "東京ステーションガイド みんなの声（投稿）", like: "東京ステーションガイド イイね！", view: "東京ステーションガイド 閲覧" };

function makeForm(key) {
  var form = FormApp.create(TITLES[key]);
  form.setDescription("東京ステーションガイド（https://kouchift.github.io/tokyostation/）の受け皿。サイトから自動で送られます。手で入力する必要はありません。");
  form.setCollectEmail(false); form.setLimitOneResponsePerUser(false); form.setRequireLogin(false);
  form.setShowLinkToRespondAgain(false); form.setProgressBar(false);
  var fields = {};
  FIELDS[key].forEach(function (k) {
    var item = form.addTextItem().setTitle(k).setRequired(false);
    fields[k] = "entry." + item.getId();
  });
  var ss = SpreadsheetApp.create(TITLES[key] + " 回答");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return { action: form.getPublishedUrl().replace(/\/viewform.*$/, "/formResponse"), fields: fields, sheetUrl: ss.getUrl(), editUrl: form.getEditUrl() };
}

function setupAll() {
  var out = {};
  ["memo", "like", "view"].forEach(function (k) { out[k] = makeForm(k); });
  var cfg = {
    memoForm: { action: out.memo.action, fields: out.memo.fields },
    likeForm: { action: out.like.action, fields: out.like.fields },
    viewForm: { action: out.view.action, fields: out.view.fields }
  };
  Logger.log("===== data/support.js に貼る（memoForm / likeForm / viewForm を置き換え） =====");
  Logger.log(JSON.stringify(cfg, null, 2));
  Logger.log("===== それぞれ «ファイル → 共有 → ウェブに公開 → CSV» にして、出た URL を memoCsv / likeCsv / viewCsv に =====");
  Logger.log("memoCsv の元: " + out.memo.sheetUrl);
  Logger.log("likeCsv の元: " + out.like.sheetUrl);
  Logger.log("viewCsv の元: " + out.view.sheetUrl);
  Logger.log("（フォームの編集画面: " + out.memo.editUrl + " ほか）");
  return cfg;
}
