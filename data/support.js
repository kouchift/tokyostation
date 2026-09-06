/* 制作者への窓口（投げ銭・改善要望）の設定  v71〜
   ここだけ書き換えれば、コードを触らずに窓口を変えられます。

   paypayId / kyashId : 送金先のアカウント名（画面に出して、コピーできるようにする）
   paypayLink / kyashLink : アプリ内で作った «送金リンク／請求リンク» を貼ると、金額ボタンから直接そのリンクを開く。
                            空のときは「IDをコピー → アプリで送る」の案内になる（アカウント名だけで開ける公開URLは両社とも用意していないため）。
   discordWebhook : Discord のサーバー設定 → 連携サービス → ウェブフック で作った URL を貼ると、
                    「制作者へ届け！」のメッセージがそのチャンネルに届く。空のときはメール（mailto）で送る案内になる。
                    ※ 公開サイトに置いた URL は誰でも叩けます。荒らされたら Discord 側で作り直してここを差し替える。
   googleForm : Google フォームで受ける（メールアドレスを画面に出さずに済む・無料・5分）。
                ① Google フォームを新規作成し、記述式の質問を2つ（お名前／ひとこと）作る
                ② 「送信」→ <> 埋め込み → HTML の中の action="https://docs.google.com/forms/d/e/XXXX/formResponse" と
                   各質問の name="entry.123456" を控える（プレビュー画面のソースでも見える）
                ③ ここに action / name / text を貼る。回答は Google フォームの「回答」タブとスプレッドシートに届く
                優先順位: discordWebhook → googleForm → mailto（mailto はメールアプリを開くため、アドレスが相手に見える）
   mailto : 上の2つが無いときの送り先。画面には表示しない。
   amounts : 金額ボタン。
   BANLIST : アクセスを断つ来訪者ID（メッセージの末尾に付く vid:xxxx の xxxx）。
             ※ 静的サイトなので «その端末のブラウザ» に対する拒否にとどまる（別の端末・シークレットモードでは無効）。
               本当に止めるには GitHub Pages の前に Cloudflare などを置く必要がある。
*/
RG.TIP = {
  paypayId: "tonbo7", kyashId: "tonbo7",
  paypayLink: "", kyashLink: "",
  discordWebhook: "",
  googleForm: { action: "", name: "", text: "" },
  mailto: "tonbo7@gmail.com",
  siteUrl: "https://kouchift.github.io/tokyostation/",
  amounts: [100, 500, 1000, 3000]
};
RG.BANLIST = [];
