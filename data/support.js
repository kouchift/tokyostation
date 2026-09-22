/* 制作者への窓口（投げ銭・改善要望）の設定  v71〜
   ここだけ書き換えれば、コードを触らずに窓口を変えられます。

   paypayId / kyashId : 送金先のアカウント名（画面に出して、コピーできるようにする）
   paypayLink / kyashLink : «送り先入り» でアプリが開くリンク。貼ると、金額ボタン 1 タップでアプリが送金画面まで開く（v87）。
       PayPay: アプリのホーム →「受け取る」→ マイコード →「共有」→ リンクをコピー（https://qr.paypay.ne.jp/… の形）。
               ※「送金リンク（受け取りリンク）」は «自分が誰かに送る» ための 4 日で切れるリンクなので、ここには使えない。
       Kyash : 「請求」→ 金額を入れずに請求リンクを作成 → コピー。
       空のときは「ID をコピー → アプリのトップを開く」になり、アプリ側で「送る → ID を貼る」の 2 手が残る
       （アカウント名だけで開ける公開 URL は両社とも用意していないため）。
   paypayLinks / kyashLinks : 金額ごとのリンク {100: "…", 500: "…"}。PayPay はマイコードで «リクエスト金額» を入れてから共有、
       Kyash は請求リンクに金額を入れて作ると、相手は金額も入力せずに «送る» を押すだけになる（最短）。無い金額は paypayLink に落ちる。
   paypayQr / kyashQr : PC 画面に出す «マイコード» の画像（例 "assets/img/paypay_qr.png"）。スマホのカメラ／アプリで読むと送り先入りで開く。
       空のときは、このサイトの «押すだけ» 画面を開く QR（スマホ側は 1 タップ）を出す。
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
  paypayLinks: {}, kyashLinks: {},          // v87: 金額ごとのリンク（任意）例 { 500: "https://qr.paypay.ne.jp/…" }
  paypayQr: "", kyashQr: "",                // v87: PC に出すマイコード画像（任意）
  discordWebhook: "",
  googleForm: { action: "", name: "", text: "" },
  /* 現場メモ（v79）: 受け皿を用意すると «みんなのメモ» になる（無くても端末内で動く）
     memoForm: Google フォームの action URL と、各項目の entry.xxxx（st,name,nick,text,vid,t,quiet,step,xfer,night,toilet,elev）
     memoCsv : そのフォームの回答スプレッドシートを「ウェブに公開 → CSV」した URL（列名を st,name,nick,text,vid,t,quiet,step,xfer,night,toilet,elev,kind,pref,la,lo にする。kind 以降は任意） */
  memoForm: { action: "", fields: { st: "", name: "", nick: "", text: "", vid: "", t: "", quiet: "", step: "", xfer: "", night: "", toilet: "", elev: "", kind: "", pref: "", la: "", lo: "" } },
  memoCsv: "",
  /* イイね！（v85）: 別の Google フォーム（列: id,vid,t,name）。id は «投稿者の印:投稿時刻» で投稿と結びつく。likeCsv はその回答シートの CSV */
  likeForm: { action: "", fields: { id: "", vid: "", t: "", name: "" } },
  likeCsv: "",
  /* 閲覧（v85、任意）: 場所ごとの閲覧者数を «みんな» で数えたいときだけ（列: name,vid,t。1 端末 1 日 1 回）。無ければ投稿・イイね！した人＋自分だけで数える */
  viewForm: { action: "", fields: { name: "", vid: "", t: "" } },
  viewCsv: "",
  mailto: "tonbo7@gmail.com",
  siteUrl: "https://kouchift.github.io/tokyostation/",
  /* 銀行振込（ゆうちょ）。空のままだと「準備待ち」表示。記号・番号 or 店名・店番・口座番号、受取人名（カナは FB データ用） */
  bank: { bankName: "ゆうちょ銀行", bankKana: "ﾕｳﾁﾖ", code: "9900", symbol: "", branch: "", branchName: "", branchKana: "", type: "1", number: "", holder: "", holderKana: "" },
  /* みんなの番付：公開スプレッドシートの CSV（列: name,total,count,gedatsu）。空なら端末内の番付だけ */
  leaderboardCsv: "",
  amounts: [100, 500, 1000, 3000]
};
RG.BANLIST = [];
