# 第6周回是正・段4a：INP 是正の設計（プロファイリング＋設計書）

- 対象: 本番 v187（main 3096e01）/ index ページの INP・longtask 是正
- 位置づけ: `design/cycle6-rescan-report.md` §3（第6周回再走査）の実測を受けた**設計のみ**の段。製品コード（assets/*.js・index.html・CSS）は変更しない。実装は本書 §5 の段階計画に沿って別段で行う。
- 参照した Modern Web Guidance（`DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest retrieve` で取得）:
  - `break-up-long-tasks` — `scheduler.yield()` で 50ms デッドライン分割（fallback は `setTimeout`）
  - `identify-inp-causes` — INP の3分割（Input Delay / Processing / Presentation）と LoAF（Long Animation Frames）による発生源特定
  - `schedule-tasks-by-priority` — `scheduler.postTask()` の優先度付け（user-blocking / user-visible / background）と `TaskController` による中断

---

## 1. 計測方法（再現手順）

### 1.1 環境と制約

- 本番 URL への headless Chromium 接続はこの VM の egress プロキシ制約（ERR_TUNNEL_CONNECTION_FAILED）で不可。再走査と同様、**ローカル配信（`tools/serve_gz.mjs`、127.0.0.1:8766）＋ filehash 照合で本番同一ビルドであることを確認して代替**する。
  - `node tools/make_filehash.mjs --check` の結果: 対象 4,065 ファイル中、**JS（app.bundle.js / app.extra.js を含む）と data/*.js は全て印が一致**。stale は CSS 3件（assets/app.css・assets/app.min.css・assets/concept.css）のみで、本計測（JS の実行時間）には無関係の既存差分（main 時点で発生。版上げ時の再生成漏れとみられるため、実装段のリリース手順で解消すること）。
- 端末条件: モバイル 390×844・deviceScaleFactor 2・タッチ有効・**CPU 4x スロットル**（CDP `Emulation.setCPUThrottlingRate`）。位置情報は東京駅（35.6812, 139.7671）を許可済みで与えた。
- ブラウザ: Playwright 同梱の chrome-headless-shell を puppeteer-core で CDP 駆動（この VM では agent-browser の外部接続が使えないための代替。再走査の Playwright/Chromium と計測原理は同一）。
- **絶対値の読み方（重要）**: 本 VM は共有 1.5 CPU のため、同じ CPU 4x でも再走査環境より絶対値が約2〜5倍重く出る（例: 初期表示の longtask 合計は再走査 34件に対し本計測 37〜84件）。したがって本書では、絶対値は再走査値と併記し、**発生源の特定は「どの関数が何ms同期実行したか」の相対構成**で行う。合格ライン（§5）は再走査相当環境での絶対値＋環境に依存しない「単一同期処理の上限」で定義する。

### 1.2 計測の3系統

計測スクリプトはリポジトリに入れず /tmp に置いた（§7 に再現手順と置き場所）。

| 系統 | 対象ビルド | 手法 | 得るもの |
|---|---|---|---|
| Run A | 本番同一（minified） | PerformanceObserver（longtask / LoAF / Event Timing）＋ RG 公開関数への計時ラッパ（`performance.now()` 差分） | 操作ごとの longtask 件数・最長・合計、INP 3分割、関数単位の同期実行時間 |
| Run B | 非圧縮バンドルに組み替えた複製（/tmp 上、同一データ） | CDP Profiler（サンプリング 500µs） | 関数名レベルの self time（minified では潰れる名前の復元用。絶対値の根拠には使わない） |
| Run C | 本番同一 | 主要関数の直接呼び出し計時（spots 読込前／後、warm／cold） | 単体コストの切り分け |

再現した操作（再走査 §3 と同一の操作系列）: 初期表示 → ヒーロー主ボタン「現在地から」（#hero-current）→ 検索入力「渋谷」タイプ（#hero-q）→ 検索候補タップ → ルート結果モーダル → モーダル閉 → シート開閉 → POI タップ。

- 「シート」は現行 UI では **#zrail（tune アイコン）で開閉する #linerail**（路線・スポット・絞り込みシート、`assets/lines_ui.js`）に対応する。旧 #sheet は v166 で廃止済み。
- 検索入力の初回タップ/入力は `loader.js` のオンデマンド発火（`armOnDemandTriggers`）で spots グループ（約6MB・約30ファイル）の読込を開始する。再走査の「検索候補タップ 3,696ms」「POI タップ longtask 142件」はこの読込・反映チェーンと重なった状態の計測であり、本計測でも同じ条件で再現した。

---

## 2. 操作ごとの longtask 内訳（実測）

凡例: 「再走査」は rescan-report §3 の値。「本計測」は Run A（本番同一ビルド）の値で、括弧内は発生源の内訳（計時ラッパ／LoAF／Profiler の実測）。

### 2.1 初期表示 — 再走査: FCP 1,200ms / longtask 34件・最長 1,914ms

本計測: FCP 504〜1,112ms（2回）/ longtask 37〜84件・最長 1,182〜1,616ms・合計 5.3〜12.1秒（起動後 quiet まで）。

発生源（`RG.bootTiming` の段別実測、CPU 4x）:

| 段（app.js `RG.boot` / `bootFinish`） | 実測 | 中身 |
|---|---|---|
| メイン検索 `RG.initHeroSearch`（app.js:2610） | **306〜315ms** | ヒーロー検索 UI の構築（候補・人気チップ等の DOM 生成とリスナー登録を一括同期） |
| 検索の索引 `buildIndex`（app.js:314） | **230〜259ms** | 駅 8,410・路線 836・辺 9,876 の索引化＋全駅の投影座標計算（`my()` = log/tan） |
| 路線図の描画 `Map.draw`（app.js:545） | **151〜215ms** | 路線 path（路線別に全辺を文字列化）＋駅プール初期化。SVG 子要素 2,086 / DOM 3,428〜4,234 ノード |
| 最初の表示位置＋出発バー | 各 56〜72ms | `Map.focus`＋`lod()`、plannerui 初期化 |
| （段外）位置情報コールバック | **最長 longtask 1,616ms の主体** | LoAF で `app.bundle.js :: PositionCallback` が 1,617ms。許可済み環境では起動直後に `firstViewHere`（app.js bootRest 内）が現在地を返し、`setOrigin → refreshIso → Planner.isochrone`（§2.2 と同一経路、実測 0.8〜2.0秒）が起動タスク列の合間に割り込む |

加えて app.extra.js（847KB・minified）の評価、IDLE データ 29件（約1.7MB）の逐次読込と `flush()` 反映が起動後も続き、操作可能な状態でもメインスレッドが断続的に埋まる。

### 2.2 ヒーロー主ボタン「現在地から」— 再走査: INP 1,808ms / longtask 21件・最長 1,529ms

本計測: イベント総時間 2,792ms（Input Delay 486 / **Processing ≈0** / Presentation 2,306）、longtask 28件・最長 2,116ms・合計 6,271ms。

発生源:

- クリックハンドラ自体は軽い（LoAF で `BUTTON#hero-current.onclick` 90ms）。重さは**非同期の位置情報コールバック側**にある: LoAF `PositionCallback` 2,117ms。
- その実体は `RG.useGeo`（plannerui.js:114）の成功コールバック → `setOrigin`（plannerui.js:101）→ `refreshIso`（plannerui.js:158）→ **`RG.Planner.isochrone`（planner.js:551）が 1回 2,009ms**（計時ラッパ実測）。
  - `isochrone` は `railField`（planner.js:187、全駅グラフへの Dijkstra）で全網の所要時間場を作り、さらに全駅 8,410 件に `hav()` 距離計算をして out を全駅分返す（Run C: 戻り値キー数 = 8,410 = 全駅）。単体計時でも 804〜1,534ms。
  - `setOrigin` は出発地変更のたびに無条件で `refreshIso()` を呼ぶため、**あらゆる出発地変更がこの全網計算を同期で払う**。
- Presentation 2,306ms は `paintIso`（全駅の iso クラス付け替え→ `repaint()` で駅プール全再描画）と `viewAround` の描画が、上の計算の後ろに直列しているため。

### 2.3 検索入力タイプ「渋谷」— 再走査: INP 2,184ms / longtask 34件

本計測（初回入力＝spots 読込が並走する条件）: longtask **219件・最長 1,507ms・合計 38,221ms**。キー入力イベント自体の Input Delay は 1,037ms（＝入力時点で既に裏のタスクが詰まっている）。

発生源は2層ある。

**(a) 入力ハンドラ自体（キー入力ごと）**

- `RG.heroSearch`（app.js:2588）: 全駅 8,410 件の走査＋ `RG.searchLocal(q,12)`。実測 2回で合計 771ms（最大 599ms）。
- `RG.searchLocal`（search.js:57）: 索引 IDX の**全件走査**で、エントリごとに `hay = n + " " + k + " " + sub + " " + extra` の**文字列連結を作ってから** `indexOf` 判定する。spots 読込後は IDX が駅 8,410＋POI 約19.5万＋住所複製で **約25万件規模**になり、単体計時で warm 244〜1,090ms / **索引再構築込み（cold）1,605ms**（Run C）。
- 索引 `build()`（search.js:14）は POI ごとに `(RG.GENRES||[]).filter(...)` でジャンルを線形探索して作る。再構築は重い（上記 cold の大半）。

**(b) 初回入力で発火する spots 読込・反映チェーン（支配的）**

初回 focus/input で `RG.ensureSpots()`（loader.js:303）が走り、約30ファイル（chains2.js 6.1MB 等、合計約6MB＋履歴クラスタ）の評価と反映が入力の裏で連鎖する。実測（Run A 計時ラッパ、P2 窓内）:

| 関数 | 回数 | 合計 | 最大 | 備考 |
|---|---|---|---|---|
| `RG.mergeExtraPois`（app.js:2380） | 27 | **10,001ms** | 1,507ms | ファイル到着ごとに該当キーの POI を MAPPOI（最終 194,875件）へ一括 push |
| `RG.Map.rebuildPOI`（app.js:1242） | 16 | **6,212ms** | 1,220ms | 呼ぶたび `PIDX = null` にする（下記） |
| `RG.Map.poiLOD`（app.js:1314） | 27 | **5,200ms** | 1,136ms | 候補走査＋プール再描画 |

Run B（Profiler）で `rebuildPOI` の中身を割ると、**`poiIndex`（app.js:1293）の self time が 16,897ms**（B1 窓内最大の名前付き関数）で突出する。`poiIndex` は MAPPOI 全件を升目索引に作り直す処理で、`rebuildPOI` が毎回 `PIDX = null` にするため、**ファイルが1つ届くたびに約19.5万件の索引を全再構築**していた。併せて投影 `my()`（app.js buildIndex 内）6,572ms、GC 9,843ms（索引・文字列の一時オブジェクト大量生成）。
`loader.js` の `runTasks`（loader.js:175）はタスク間を 8ms で区切るが、**タスクそのもの（merge 1回・rebuild 1回）が単体で 0.5〜1.5秒**あるため区切りが効かない。これが「longtask の連鎖」の正体。

### 2.4 検索候補タップ → ルート結果モーダル — 再走査: INP 2,696〜3,696ms

本計測: click イベント総時間 12,664ms（Input Delay 1,388 / **Processing 7,929** / Presentation 3,344）、longtask 最長 8,574ms。

発生源:

- ハンドラ内同期処理の実体は **`RG.showRoutes`（plannerui.js:913）1回 7,602ms**（計時ラッパ）。内訳の最大要素は **`RG.Planner.estimate`（planner.js:519）1回 4,381ms**。
  - Run C の単体計時では estimate は cold 798ms / warm 38ms。差は「初回・状態変化直後のキャッシュ未構築」（運賃キー `fareKeyOf`（planner.js:73）・`railField` 系の初回構築が Run B の Card/isochrone 窓でも上位に出現）と、候補タップ時点でも spots 反映チェーンが裏で競合していたこと。いずれにせよ**モーダルの中身計算が全部終わるまで最初の1フレームも返さない**構造が問題。
  - 残り約3.2秒は showRoutes 内の候補 HTML 一括構築＋ `modal()`（plannerui.js:165）の innerHTML 一括差し込み、`paintRoute` 等の地図描画。
- Input Delay 1,388ms は §2.3(b) の反映チェーンがタップ時点でまだ残っていたため。

### 2.5 シート開閉（#linerail）— 再走査: 開 2,720ms / 閉 4,400ms

本計測: 開 — ハンドラ起因 longtask 最長 7,624ms、LoAF で `BUTTON#zrail.onclick`（app.extra.js）5,610ms。閉 — ハンドラ自体は 97ms と軽いが、その後も longtask 60件・合計 9,746ms が続き、イベント総時間 1,000ms。

発生源:

- 開くたび **`build()`（lines_ui.js:113）が #linerail 全体を innerHTML で作り直す**。Run B で上位の匿名関数2件（合計 3,669ms）はこの build 内の:
  - 路線行の生成（836路線分の map/filter/sort＋ボタン HTML 連結）
  - **ジャンル行の生成でジャンルごとに `(RG.MAPPOI||[]).filter(p => p.g === g.id)` を実行**（lines_ui.js:157 付近）＝ ジャンル数（約100）× POI 194,875件の **O(G×P) 走査**。件数表示のためだけの走査で、`refreshGenreCounts`（lines_ui.js:601）が既に1回走査の集計を持っているのに build 側は使い回していない。
- タブ切替（poi）: `showTab` → `refreshGenreCounts()` の O(P) 1回走査自体は妥当だが、`void p.offsetWidth` の強制リフロー（lines_ui.js showTab 内）と DOM 全体の再レイアウトが乗り、本計測でタブハンドラ 3,575ms（LoAF）。
- `RG.rebuildRail`（lines_ui.js:894）= build() の再実行が、flush の poi 到着ごとに呼ばれる（loader.js:208）。**シートを閉じている間も、データ到着のたびに不可視のシート全体を再構築**しており、これが「閉」の後に続く longtask 群と、POI タップ時の Input Delay の供給源になっている。
- 閉じる操作自体は class 切替のみで軽い。再走査の「閉 4,400ms」は、閉の前後に滞留していた同チェーン（rebuildRail・flush・タイル読込）が INP として観測されたものと本計測は整合する。

### 2.6 POI タップ — 再走査: INP 3,288ms / longtask 142件・最長 3,967ms

本計測: イベント（pointerover）総時間 9,920ms（**Input Delay 7,409** / Processing 87 / Presentation 2,424）、longtask 17件・最長 4,312ms・合計 15,749ms。

発生源:

- **主因は Input Delay**：タップ時点で §2.3(b)／§2.5 の背景チェーン（flush 反映・rebuildRail・タイル追加読込 `tiles.js addRows → rebuildPOI`）がメインスレッドを占有し続け、タップの処理開始自体が数秒待たされる。ガイド `identify-inp-causes` の「Input Delay が支配的なら犯人はハンドラではなく既に走っているコード」の典型。
- ハンドラ側: POI ノードの click → `RG.showSpot`（plannerui.js:420）。本計測では `RG.openModal/openCard` 経路の `modal()` が 1,201ms（カード HTML の一括構築＋innerHTML パース）。LoAF の layout 合計 1,363ms が Presentation を押し上げる（DOM 総数 12,736 ノードまで膨張した状態でのレイアウト）。
- 駅カード（`Card.open`、app.js:2229）も同型で、本計測では開処理 1回が 22,898ms（うち `searchLocal` 3回 12,148ms＝§2.3(a) の索引再構築・全走査が混入、`openCard` 2回 6,025ms、Card.refresh 3,476ms）。絶対値は背景競合で膨らんでいるが、「カードを開く同期処理の中で検索索引の再構築と全走査が走る」構造的問題を示す。

### 2.7 常駐コスト（全操作の底上げ）

- `assets/concept.js` の Canvas 2D フォールバック `frame()`（concept.js:208）が rAF で**常時**回る（停止条件はタブの visibility のみ）。#cx-stage は地図の下（初期表示では画面外）でも描画を続け、Run A/B の全フェーズで `concept.js :: frame / fitCanvas` が LoAF・Profiler 上位に恒常的に出現（フェーズ窓あたり 0.6〜3.2秒）。`fitCanvas`（concept.js:37）はフレームごとに canvas サイズを読み書きする。
- spots 読込後の DOM は 12,736 ノード（初期 4,234）。レイアウト/スタイル再計算の単価が全操作で上がる。
- GC: B1 窓で 9,843ms。索引再構築と hay 文字列生成の一時オブジェクトが主因とみられる（§2.3）。

### 2.8 発生源サマリ（寄与順）

| # | 発生源 | 主に効く操作 | 実測根拠 |
|---|---|---|---|
| S1 | flush ごとの `rebuildPOI → poiIndex` 全再構築（PIDX 無効化）＋ `mergeExtraPois` の単一タスク化 | 検索入力・候補タップ・POI タップ（Input Delay） | poiIndex self 16.9s（B1）/ rebuildPOI 16回 6.2s・merge 27回 10.0s（Run A） |
| S2 | データファイル約30本の評価（parse/eval）自体 | 初回検索・初回スポット操作 | B1 の (program) 38.6s の主成分、chains2.js 等約6MB |
| S3 | `searchLocal` の全件走査＋hay 連結、索引 `build()` の全再構築（resetSearchIndex 連動） | 検索入力・駅カード | warm 0.24〜1.09s、cold 1.6s（Run C）/ Card.open 内 3回 12.1s（Run A） |
| S4 | `setOrigin → isochrone` 全網計算（railField＋全駅 hav） | 現在地から・出発地変更・初期表示 | 1回 2,009ms（Run A）、単体 0.8〜1.5s（Run C） |
| S5 | `showRoutes` の同期一括計算・描画（estimate cold＋HTML＋modal） | 候補タップ | ハンドラ 7,602ms、estimate 4,381ms（Run A） |
| S6 | linerail `build()` の全再構築＋O(G×P) 件数走査、`rebuildRail` の不可視時実行 | シート開閉・タブ切替 | ハンドラ 5,610ms（LoAF）、build 内匿名関数 3.7s（Run B） |
| S7 | `Card.open` / `showSpot` の一括 HTML 構築＋innerHTML | POI タップ・駅カード | modal() 1,201ms（Run A）、992ms（Run B） |
| S8 | concept.js rAF 常駐描画 | 全操作（底上げ） | 全フェーズで frame/fitCanvas が上位 |

---

## 3. 是正方針

### 3.0 共通基盤（最初に1つだけ入れる）

`assets/loader.js`（または app.js の冒頭部）に、ES5 風コードベースに合わせた小さなユーティリティを新設する（Promise ベース、新規構文は使わない）:

```js
// 使い方の形（設計）:
//   RG.yieldMain()  -> Promise。scheduler.yield があればそれ、無ければ setTimeout(0)
//   RG.postTask(fn, priority) -> scheduler.postTask があれば優先度付き、無ければ setTimeout
//   RG.chunked(items, fn, budgetMs) -> 50ms ごとに yield しながら全件処理する Promise
```

- `scheduler.yield()` は Chrome 129+ / Edge 129+ / Firefox 142+。Safari は未対応のため、**feature-detect して `setTimeout(0)` に落とす**（ガイド `break-up-long-tasks` の fallback 形そのまま）。
- `scheduler.postTask()` も同方針。優先度の再順序付けが要らない用途（単に背景へ逃がすだけ）は polyfill を入れず `setTimeout` で劣化させる（ガイド `schedule-tasks-by-priority` の指針）。
- 既存の `runTasks`（8ms 区切り）・`busy()`（操作中 1,200ms は裏作業を待つ）・`whenSettled` の思想は維持し、置き換えではなく**タスク内部の分割**を足す。

### 3.1 S1: POI 索引は「作り直し」から「差分追加」へ（loader.js / app.js）

対象: `RG.Map.rebuildPOI`（app.js:1242）、`poiIndex`（app.js:1293）、`buildPOI`（app.js:1248）、`RG.mergeExtraPois`（app.js:2380）、`flush`（loader.js:189）、`runQueue`（loader.js:246）

1. **PIDX の無効化をやめる**: `poiIndex()` を「MAPPOI の長さが増えた分だけ升目へ追加する増分構築」に変える。`rebuildPOI` は描画プールの作り直しだけを行い、索引は `PIDX.n` 以降の差分を足す。並び替え・削除を伴うキー（whs/grave のマージ等）だけは、そのキーの分だけ再投入する。
2. **flush の合体**: poi 系キーが複数届いたとき、現状はキーごとに `mergeExtraPois(k)` → 最後に `rebuildPOI` だが、merge 自体もキーごとに数百msある。merge を `RG.chunked` 化し（POI 配列を 50ms 予算で push）、**全 merge 完了後に rebuildPOI を1回だけ**呼ぶ（現行の T 配列の組み立て順は維持し、rebuildPOI 呼び出しを T の末尾1回に集約する）。
3. **投影の前計算**: `buildPOI` が全 POI に `project()`（log/tan）を掛ける箇所は、merge 時にチャンク内で済ませ、poiIndex 側では二度と投影しない。
4. `tiles.js addRows` の `rebuildPOI` 直呼びも同じ dirty フラグ経由に寄せ、タイル到着ごとの全再構築を防ぐ。

### 3.2 S2: データ評価の置き場所（loader.js）

対象: `runQueue`（loader.js:246）、`RG.ensureData`（loader.js:266）

- スクリプト評価（parse/eval）自体は分割できない。対策は「**ユーザーが待っている操作と競合させない**」こと:
  - spots 読込は現状どおり初回検索フォーカスで始めるが、**入力ハンドラ側の候補描画を先に返す**（§3.3）と組み合わせ、評価の合間（ファイル間）では必ず `RG.yieldMain()` を挟み、入力イベントが割り込める隙間を作る（現行 runQueue は requestIdleCallback / setTimeout(40) で間隔はあるが、urgent 時は setTimeout(0) で詰める。urgent でも 1 ファイルごとに yield する）。
  - 読込の進捗表示は既存の `setProgress` を維持（表示仕様は変えない）。

### 3.3 S3: 検索は「索引に下ごしらえ、入力では走査だけ」（search.js / app.js）

対象: `build`（search.js:14）、`RG.searchLocal`（search.js:57）、`RG.resetSearchIndex`、`RG.heroSearch`（app.js:2588）、`RG.initHeroSearch` の input ハンドラ（app.js:2645）

1. **hay の事前連結**: 索引構築時に各エントリへ検索用文字列（`n + k + sub + extra`）を1回だけ作って持たせる。クエリ時は連結せず `indexOf` のみ。これで warm 1回の走査コストと GC が大きく減る。
2. **索引の増分追加**: `resetSearchIndex()`（IDX = null）による全再構築をやめ、POI が増えたら新規分だけ IDX へ append する API（例 `RG.appendSearchIndex(pois)`）を flush / merge 側から呼ぶ。削除・入替を伴うマージ（whs/grave）だけ該当分を再投入。
3. **ジャンル引きの定数化**: `build()` 内の POI ごとの `GENRES.filter` を、事前に作る `id → genre` マップ引きに変える（`genreOf` と同じ GMAP パター
...[truncated 14021 chars]