/* アクセス解析の設定（v98）
   ・endpoint が空のあいだは «この端末の中だけ» で数える（どこにも送らない）
   ・Google Apps Script のウェブアプリ（tools/setup_stats_backend.gs）を公開したら、その URL をここに入れる
   ・送るのは 匿名の利用イベント だけ（ページ表示・検索・比較・駅カード…）。氏名・メール・位置情報・端末 ID は送らない
   ・ブラウザの «追跡しない»（Do Not Track）が ON の人には送らない。設定パネルで OFF にもできる */
RG.ANALYTICS = {
  endpoint: "",           // 例: "https://script.google.com/macros/s/XXXX/exec"
  sample: 1               // 1 = 全員ぶん送る。0.5 = 半分の訪問だけ（アクセスが多くなったら下げる）
};
