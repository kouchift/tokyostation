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
