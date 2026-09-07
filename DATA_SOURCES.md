# データの出どころとライセンス

このサイトのデータは、すべて公開されているオープンデータです。
どこから取ってきて、どういう条件で使えるのかを、ここに全部書いておきます。

## 一覧

| データ | 件数 | 出どころ | ライセンス | 表示義務 |
|---|---|---|---|---|
| 駅・路線・隣接・乗降人員・ホーム数・開業年 | 669駅 / 77路線 | [Wikidata](https://www.wikidata.org) | **CC0 1.0** | なし（謝意として表示） |
| 文化財・史跡・社寺・博物館・公園・ランドマーク | 約1,400 | Wikidata | **CC0 1.0** | なし |
| 駅とスポットの説明文（一行） | 716 | Wikidata description | **CC0 1.0** | なし |
| 駅とスポットの概要（2〜3文） | 716 | [Wikipedia 日本語版](https://ja.wikipedia.org) | **CC BY-SA 4.0** | **出典＋リンク＋継承** |
| 写真 | 約2,000 | [Wikimedia Commons](https://commons.wikimedia.org) | ファイルごとに異なる | **個別に表示** |
| 公衆トイレ・AED・避難場所・Wi-Fi・駐輪場・赤ちゃんの駅・図書館・博物館・公園 | 6,672 | [東京都オープンデータカタログ](https://portal.data.metro.tokyo.lg.jp/) | **CC BY 4.0** | **出典表示** |
| 河川監視・海面ライブカメラ | 94 | 東京都建設局・港湾局 | 東京都のオープンデータ | **出典表示** |
| 銭湯・温泉銭湯 | 283 | [東京銭湯マップ](https://www.1010.or.jp/map/)（東京都公衆浴場業生活衛生同業組合） | 公開情報（事実データのみ利用） | **出典表示** |
| チェーン店 | 10,143 / 21ブランド | [OpenStreetMap](https://www.openstreetmap.org/) | **ODbL 1.0** | **出典表示＋継承** |
| 住所・建物名の検索 | 都度 | OpenStreetMap Nominatim | **ODbL 1.0** | **出典表示** |
| 行政区域ポリゴン | 45自治体 | [国土数値情報 N03](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html)（国土交通省） | 出典明示で利用可 | **出典表示** |
| 公示地価 | 2,560地点 | 国土数値情報 L01（国土交通省） | 出典明示で利用可 | **出典表示** |
| 標高・陰影起伏 | 96×96グリッド＋画像1枚 | [国土地理院 標高タイル](https://maps.gsi.go.jp/development/ichiran.html) | 国土地理院コンテンツ利用規約 | **出典表示** |
| 人口・面積（ヒートマップ） | 23区 | Wikidata | **CC0 1.0** | なし |

## 使わなかったもの（と、その理由）

| 候補 | 理由 |
|---|---|
| 食べログのランキング・百名店 | 利用規約で複製・転載・改変が禁止されています。ランキングは編集著作物にあたる可能性が高く、robots.txt が許していても規約は別です |
| インスタベース（レンタルスペース） | 商用予約サイトの在庫データで、取得の許諾がありません |
| 鉄道会社・チェーン店のロゴ画像 | 商標権と著作権の両方で保護されています。公表されているブランドカラーと絵文字で代用しています |
| 銭湯の写真 | 組合の著作物です。直リンク表示は権利上グレーで、先方のサーバー負荷にもなります |

## CC BY-SA 4.0 について（継承が必要な部分）

`data/descs.js` に入っている **`x` フィールド（Wikipedia の冒頭抜粋）** は
CC BY-SA 4.0 です。この部分を再利用する場合は、

1. 出典（Wikipedia 日本語版の記事名とリンク）を示す
2. 同じ CC BY-SA 4.0 で公開する

の2つが必要です。アプリ内では、駅カードとスポットカードに
「出典: Wikipedia 日本語版（CC BY-SA 4.0）」と記事へのリンクを必ず表示しています。

## ODbL について（OpenStreetMap 由来）

チェーン店データ（`data/chains.js`）と、検索の住所照会（Nominatim）は
OpenStreetMap 由来です。画面に **「© OpenStreetMap contributors」** を表示しています。
このデータを加工して再配布する場合は ODbL 1.0 の継承が必要です。

## データを作り直したいとき

`tools/` にすべてのビルドスクリプトがあります。

```
tools/build_network.py     駅・路線（Wikidata SPARQL）
tools/build_poi.py         駅まわりの文化財・社寺・地価・写真
tools/build_mappois.py     地図に出すスポット
tools/build_landmarks.py   ランドマーク TOP100
tools/build_lines_meta.py  ラインカラー
tools/build_admin.py       行政区域ポリゴン（N03 を簡略化）
tools/build_relief.py      標高グリッドと陰影起伏画像（国土地理院）
tools/build_heat.py        区ごとのヒートマップ因子
tools/fetch_tokyo_od.py    東京都オープンデータの収集
tools/merge_tokyo_od.py    同・整形
tools/fetch_chains.py      チェーン店（Overpass API）
tools/build_chains.py      同・整形
tools/build_standalone.py  単一ファイル版の生成
```

外部サービスに負荷をかけないよう、どのスクリプトも間隔をあけてアクセスします。
実行する前に、各サービスの利用規約を確認してください。


## v67 で追加したもの

| データ | 出どころ | ライセンス／表示 | 使いかた |
|---|---|---|---|
| 都道府県・市区町村の境界（`data/geo/`） | スマートニュース メディア研究所「市区町村・選挙区 地形データ」（https://github.com/smartnews-smri/japan-topography）。元データは国土交通省 国土数値情報（行政区域データ）N03 | 国土数値情報の利用規約に従い「国土数値情報（行政区域データ）（国土交通省）を加工して作成」と表示 | 下敷きの地図。県は起動直後、市区町村は暇なとき、県ごとの詳しい境界は寄ったときだけ |
| 郵便番号（`data/zip/`） | 日本郵便「郵便番号データ」（https://www.post.japanpost.jp/zipcode/download.html）と Geolonia 住所データ（https://github.com/geolonia/japanese-addresses、元は国土交通省 位置参照情報） | 日本郵便: 自由に配布可 ／ Geolonia: CC BY 4.0 | 町丁目の代表点に郵便番号を付け、0.2度の升目に分割。見えている升目だけ読む |
| カードの写真・数字・説明（その場で取得） | Wikipedia 日本語版 API ／ Wikidata API ／ Wikimedia Commons API | Wikipedia: CC BY-SA 4.0 ／ Wikidata: CC0 ／ Commons: 写真ごとに異なる（カードに撮影者・ライセンスを表示） | カードを開いたときだけ問い合わせ、端末に7日間キャッシュ。地図の描画には関与しない |

## v71
- `data/cams_jp.js` — 各配信元の YouTube チャンネル。一覧の入手元: 国土交通省 九州地方整備局「河川カメラ YouTube 一覧」、近畿地方整備局「ライブカメラ」、水管理・国土保全局「河川ライブ配信一覧」、各放送局・新聞社・自治体の公式チャンネル。動画IDは YouTube oEmbed で 2026-09-06 に有効確認。
- `data/buzz.js` — 投稿の存在は X 公式 oEmbed（publish.twitter.com/oembed）で確認。「話題になった」根拠は各件の `src`（Togetter まとめ・報道）。見出しは当サイトの要約。

## v77
- `data/mountains.js` — Wikidata（山 Q8502 の下位分類、標高 P2044、写真 P18、山脈 P4552）CC0 ／ Wikipedia 日本語版「日本百名山」「Template:日本二百名山」「Template:日本三百名山」、山脈記事の冒頭（CC BY-SA 4.0）。都道府県は data/geo/pref.json で判定。
- `data/castles.js` — Wikidata（城・日本の城・城跡・陣屋、P625/P18/P571/P1435）CC0 ／ Wikipedia 日本語版「日本100名城」「続日本100名城」「現存天守」「石高」（幕末の表高一覧）、各藩の記事、{{日本の城郭概要表}} の座標（CC BY-SA 4.0）。
- `data/kuni.js` — Wikidata（令制国 P36 国府 ほか）CC0 ／ Wikipedia 日本語版 各令制国・郡の記事「領域」節（CC BY-SA 4.0）／ 境界: OpenHistoricalMap（CC0 1.0, https://www.openhistoricalmap.org/copyright）の admin_level=4（1871 年ごろ）53 国、残り 27 国は data/geo/muni.json（国土数値情報 N03 加工）を旧国ごとに結合。NII Geoshape の旧国データは CC BY-NC のため未使用。
- `data/water.js` — Wikipedia 日本語版「一級水系」「二級水系」「日本の川一覧」、各河川・海域・海流の記事（CC BY-SA 4.0）／ Wikidata（P625 河口・水源、P885、P974/P403）CC0 ／ Natural Earth 10m rivers（パブリックドメイン）／ Wikimedia Commons の Data: 地図（CC0）。海流の流路は概略を手描き。
- `data/chains2.js`（v77 で全面更新）・`data/osm_extra.js` — © OpenStreetMap contributors（ODbL 1.0）。Overpass API から 2026-09-06 に取得。ブランド色は目安、ロゴは Wikidata P154 の Commons ファイル（商標は各社に帰属、店舗位置の識別目的で極小表示）、公式サイトは Wikidata P856。
- `tools/build_youtube_spots.py` — YouTube Data API v3（利用規約に従い、動画 ID・タイトル・再生数・公開日と当サイト独自の要約のみ保存。定期的に再取得）。種チャンネルの登録者数は Wikidata P8687（CC0）。

## v78
- `data/air.js` — Wikidata（空港 Q62447 系、航空会社、IATA/ICAO P238/P239/P229/P230、旅客数 P3872、公式サイト P856、写真 P18）CC0 ／ Wikipedia 日本語版 各空港記事「就航路線」節・Infobox・概要（CC BY-SA 4.0）。運賃係数は当サイトの概算モデル（公表運賃ではない）。
- `data/net.json`（修復） — 追加した区間は既存の駅位置からの機械的推定（tools/fix_gaps_net.py）。新宿の座標は Wikidata の値に基づき手で修正。

## v79
- `data/roads.js` — 国土数値情報（高速道路時系列データ N06-23、道路 N01-07L）（国土交通省）を加工して作成。
- `data/river_geo.js` — 国土数値情報（河川データ W05、都道府県別 平成18〜21年度）（国土交通省）を加工して作成。W05 の利用条件（非商用）に注意。
- `data/tokaido.js` — Wikidata（CC0）・Wikipedia 日本語版（CC BY-SA 4.0）「東海道五十三次」「中山道六十九次」ほか一覧記事と各宿場の記事。
- 地震情報 — P2P地震情報 API v2（https://www.p2pquake.net/develop/json_api_v2/）。気象庁発表の中継。利用規約に従いキャッシュせず、出典を表示。
- ルートカードの画像生成 — html2canvas 1.4.1（MIT、cdnjs）。
- `data/net.json`（v80 で掃除）— Wikidata（CC0）由来の全国路線網から、廃線・廃駅（Wikidata P576 廃止日／P3999 閉鎖日）、貨物線・計画線、信号場・貨物駅、同名別駅の混同による長すぎる辺、途中駅を飛ばす辺を除いたもの。手順は tools/fix_skip_edges.py → tools/fix_net_hygiene.py → tools/fix_net_snap.py（冪等）。
- `assets/vendor/mp4-muxer.min.js` — mp4-muxer 5.2.2（MIT License, Copyright (c) 2023-present Vanilagy, https://github.com/Vanilagy/mp4-muxer）。ルート PV の MP4 化に使用。ルート PV 生成時だけ読み込む。

## v84
- いまの天気（`assets/weather.js`）— [Open-Meteo](https://open-meteo.com/) Forecast API（https://api.open-meteo.com/v1/forecast）。非商用・API キー不要・CC BY 4.0（「Weather data by Open-Meteo.com」の表示を天気の画面に記載）。各国気象機関（気象庁 MSM/GSM を含む）の数値予報を合成した推定値。端末から直接取得し、サーバーを介さない。0.1 度の升目・10 分キャッシュで 1 人あたり多くても 1 時間に数回。
- 昼夜（太陽の高さ）— NOAA の太陽位置の近似式（Astronomical Algorithms に基づく一般式）を自前で計算。外部データなし。
- 参考にした表現 — Mini Tokyo 3D（https://minitokyo3d.com/ 、Akihiko Kusanagi 氏。オープンソースで公開）。コード・データは使っていない（見た目の参考のみ）。
