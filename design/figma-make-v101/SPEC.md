# v101 Figma Make → 実装メモ

Figma ファイル: https://www.figma.com/design/5Jp0W6VbruZMXGNWeqx03O/ （フレーム: entry／compare／station／local／markers／donate × mobile・desktop、icons-sheet）

## 取り込みかた（2026-09-23）
- Figma MCP は接続アカウント（toshibatec・閲覧席）では読めない（「編集権限がありません」）→ Chrome 拡張で Figma を操作し「SVGとしてコピー」→ クリップボード経由で取得
- icons-sheet（1200×880・10 列 × 8 行・1 マス 120×100）を bbox でマスに分け、`icons_cells.json` に保存 → `tools/build_icons.py` → `assets/icons.svg`
- 6 画面の SVG（文字はアウトライン化されるので文字列は画面の目視で補完）から色・角丸・寸法を `tokens.json` に

## アイコンの id 対応（サイトの genres.js → スプライトの symbol）
スプライトは Figma 側の id（`g-{id}` と `g-{id}-map`）。サイト側で違う id は `assets/icons.js` の ALIAS で読み替える。

| サイト | スプライト | 備考 |
|---|---|---|
| onsen | onsen_sento | 温泉の銭湯 |
| view | view_spot | 展望 |
| cycle | share_cycle | シェアサイクル |
| cycle_park（旧 cycle） | cycle_park | 駐輪場。v101 で id を改名（tokyo_od.js の "cycle" キーは app.js の A 表で cycle_park に） |
| hosp / pharm / drug | hospital / pharmacy / drugstore | |
| cvs / super / disc | convenience / supermarket / discount | |
| corp / corp_gone / meeting | company | 色で区別 |
| noodle / family / other / chuka | ramen / family_rest / yakiniku / chinese | |
| fuel / high / univ / klm | gas / school / university / landmark | |
| camspot / net / elec / cloth / life / food / postbox | camera / wifi / ev / shopping / discount / family_rest / post | 近い意味のものを流用 |

絵文字のまま（スプライトに無い）: hc, kara, manga, locker, water, dog, adult, smoke, food_top。
スプライトにあってサイトに無い: garden, izakaya, bakery, hotel, bank, parking, coin_laundry, gym, clinic, beauty, theater, church, taxi, bus, rental_car, station, ferry。
Figma Make が描き落としたもの: shopping と parking の map 版（ui 版を縮小して使用）。

## 画面ごとの要点（mobile 412×915）
- entry: 地図の上に白いカード（x20 w372 rx16 影 0 4 12 rgba(0,34,74,.06)）。題 20px 濃紺／副 13px 灰／罫線／h1 22px／入力 48px 枠 1.5px 濃紺 rx12／チップ 28px 白 枠 20% 濃紺／「無料・登録不要」
- compare: 上部に手段の要約チップ（選択 #0055AD 白字・他 #F7F9FF）、手段カード（rx16 枠 #E8ECF2、推奨は #008BF2 1.5px）＝ 名前＋路線バッジ（rx4）＋ 分（28px 太）・円・乗換
- station: 白ヘッダー（駅名 28px・路線バッジ列）、主ボタン #0055AD rx12「東京駅から ここへ」＋ 白枠ボタン「ここから出発」、近くのスポット一覧（色丸＋名前＋距離チップ）
- local: 下から 384px の白いパネル（上 rx16・つまみ 40×4 #E8ECF2）、基準チップ（選択 #008BF2）、種類チップ 28px、近い順の行（色丸・名前・種別・距離）。右下に 40px の白い丸ボタン
- markers: 白い丸 28px（枠 #E0E0E0）＋ジャンル色 12% の丸 22px ＋ 16px の線画。まとまりは濃紺の丸角ピル（34×20）に色丸と数字
- donate: 白カード（rx16）に「押すだけ投げ銭」、おすすめ PayPay 帯 #EBF3FF、金額カード 4 つ（rx12・選択は #008BF2 2px）、ほかの方法（折りたたみ）

## v101 で入れたもの／後回し
- 入れた: トークン（--tsg-*）と配色・角丸・影の全体反映、80 アイコンのスプライトと地図の印・一覧・チップ・カード・現地モードへの適用、入口カードの構成（題／副／罫線／h1／無料・登録不要）、比較カード・投げ銭・現地モードの見た目
- 後回し（v102 案）: 駅カードの上部（駅名 28px・主ボタン 2 つ）、比較画面の要約チップ、地図のクラスター・ピル、desktop 専用のレイアウト（1280×800 の左パネル）
