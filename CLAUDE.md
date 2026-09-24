# 東京ステーションガイド（tokyostation）— Claude 向けメモ

静的サイト（GitHub Pages: https://kouchift.github.io/tokyostation/ ・リポジトリ kouchift/tokyostation）。
このフォルダは **git リポジトリではない**。GitHub へは `uploader/` の自作アップローダー（GitHub の Git Data API）で差分を上げる。

## 公開の手順（いちばん大事）
- **サイトのファイルを直したら、Claude が自分で `node tools/release.mjs --yes` を実行して公開まで済ませる**（持ち主に叩かせない。持ち主の指示 2026-09-24）。
  サイトに関係しない直し（tools だけ等）は `--no-bump --yes`。試験が通っていないときは公開しないで報告する
- CLAUDE.md は公開しない（uploader の SKIP に入れてある）
- `assets/*.js` を直したら **必ず** まとめ直す。index.html が読むのは `assets/app.bundle.js` だけ
- 版を上げないと、一度見た人のブラウザ（Service Worker のキャッシュ）に新しいファイルが届かない
- ふつうは **`tools/release.bat`**（= `node tools/release.mjs`）で全部やる:
  版を +1（index.html の data-build と `?v=`・sw.js の CACHE と V・data/version.js の VERSION と BUILT）→ まとめ直し → 文法確認 → 下見 → y で GitHub へ → 公開の確認
  - `--no-bump`（版はそのまま）/ `--dry`（下見だけ）/ `--yes`（確認なし）
  - 縮小の terser は `%USERPROFILE%\.tsg_node` に自動で入る
- まとめるだけ: `NODE_PATH=%USERPROFILE%\.tsg_node\node_modules node tools/build_bundle.js`（まとめる順は build_bundle.js の ORDER。新しい部品はここに足す）
- 一部のファイルだけ上げる: `python uploader/tsg_push.py --go --only data/a.js,data/b.md`（`--go` なしは下見）
- 変わったことは `data/version.js` の CHANGELOG の先頭に `"v<番号> …"` で 1 行（設定パネルに出る。短く・平易に）

## 秘密（絶対に表示・送信・コミットしない）
- `~/.tsg_uploader.json`（GitHub トークン入り）、`~/.tsg_posts.json`（管理の鍵）、`~/.clasprc.json`
- 管理の鍵は `tools/posts_api.gs` の `"__ADMIN_KEY__"` をデプロイ時にだけ置き換える。リポジトリのファイルには入れない
- clasp login・Apps Script の公開・Google の許可は **持ち主が自分で** やる（`tools/posts_deploy.bat`）

## 構成
- `index.html` → `assets/loader.js` が段階読み込み。データは `data/*.js`（`RG.XXX = [...]` の形）、ジャンルは `data/genres.js`
- `assets/*.js` … 機能ごとの部品（places・nature・history・posts・cvsfilter・onsite など）。すべて `window.RG` にぶら下げる古い書き方（ES5 風・`var`・モジュールなし）
- `tools/build_*.py` / `fetch_*.py` … データを作る道具。出典は `DATA_SOURCES.md` に 1 行ずつ
- `admin/` … 管理ページ（検索エンジンに載せない）。`admin/posts.html` は投稿写真の撮影データ（管理人だけ）
- `sw.js` … キャッシュ優先。html と `data/support.js` だけネット優先
- 受け皿（Google Apps Script）: `tools/posts_api.gs`（写真と声）、`comments_api.gs`、`setup_*_backend.gs`。URL は `data/support.js`

## 定期の仕事
- コンビニ 3 社の月次更新: `tools/cvs_monthly.bat`（登録は `cvs_monthly_register.bat`・毎月 1 日 4:00）

## 書き方
- 画面の文字・コメントは **やさしい日本語**（«» で名前を囲む）。周りのコードの密度と書き方に合わせる
- 利用者の投稿写真まわりの決まり: 公開する写真は縮小して EXIF なし（サーバーでも JPEG を作り直す）。撮影位置・日時・機種・現在地は管理人だけの ExifLog に。公開 API（spot/user/recent）に出さない
- クレジットの表記は **«[渇]@tokyostation»**（文字化けではない。制作者の意図。変えない）
- シートに書く利用者の文字列は `txt_()` を通す（数式の実行を防ぐ）

## 試験
- ブラウザの確かめは headless Chrome（CDP）。Apps Script は Node で模擬して本物の .gs を動かす（前のセッションの一時フォルダにあった `gas_emu.mjs` の方式）
- 公開前に最低限: `node --check assets/app.bundle.js`（release.mjs がやる）

## 持ち主について
- 返事は日本語。手作業の手数は最小に（押すところ・貼るところを減らす）。AI クレジットの節約を気にしている → 大きな並列作業は節目だけ
