# PHASE0_NEXT_STEPS: Phase 1-4 入力仕様

**実行日**: 2026-09-23
**現在**: CAMS_JP = 2545 件完成

## Phase 0 サマリー

### 既存カメラ分析結果

| 指標 | 値 |
|------|-----|
| **総カメラ数** | 2545 |
| **都道府県カバー** | 47 都道府県全域 |
| **内部重複候補** | 793 件 |
| **映像フォーマット** | ビデオID 53.4% / チャンネルID 35.6% / ハンドル 24.9% |
| **配信元種類** | 1,694 種類 |

### アクセス可能性確認

| ソース | 状態 | メモ |
|------|------|------|
| camera-map.com | ⚠ JavaScript 動的レンダリング | 手動/Playwright 確認必須 |
| cametan | ✅ /area/[pref].html パターン検出 | 東京都 2 件サンプル取得成功 |
| river.go.jp | 未確認 | API 申込状況確認が必須 |

---

## Phase 1: Camera-map.com 大規模統合

**目標**: 35,990 件から 2,000-5,000 件を追加（CAMS_JP との重複除外）

### インプット

1. **データ取得方法**
   - URL: https://camera-map.com/new / /area/* / /sitemap.xml
   - 技術: Playwright / BeautifulSoup （JavaScript レンダリング対応）
   - スケール: 最初は TOP 100 件 → 段階的に全数

2. **検証フロー**
   - YouTube oEmbed で embeddable 確認（401/403 は除外）
   - CAMS_JP との重複判定（名称・座標・配信元）
   - 重複がなければ CAMS_JP に追加

3. **リソース**
   - API: YouTube oEmbed（1 日 ~1,500 件まで検証可能）
   - 推奨進度: 1 日 1,000-1,500 件

### アウトプット

- `data/PHASE1_CAMERA_MAP_NEW.tsv` (取得リスト)
- `data/PHASE1_CAMERA_MAP_VERIFY.tsv` (oEmbed 検証結果)
- `data/cams_jp.js` (更新版)

---

## Phase 2: River.go.jp 河川カメラ統合

**目標**: 河川カメラ 1,000-2,000 件追加

### インプット

1. **水防災オープンAPI**
   - 申込: https://www.river.go.jp/
   - ドキュメント: https://mlit.go.jp/report/press/mizukokudo03_hh_001058.html
   - **確認事項**: API 利用可否、制限条件

2. **代替: 観測所一覧スクレイピング**
   - 観測所マスター取得 → カメラURL パターン逆引き
   - 利用条件厳守: https://www.river.go.jp/kawabou/kwb_apend/html/caution.html

3. **リソース**
   - API quota: 要確認
   - 推奨進度: 応諾後に確定

### アウトプット

- `data/PHASE2_RIVER_LIST.tsv`
- `data/cams_jp.js` (更新版)

---

## Phase 3: 国交省道路 + NEXCO 統合

**目標**: 道路カメラ 500-1,000 件追加

### インプット

1. **国交省一次ソース**
   - リンク: https://www.mlit.go.jp/road/bosai/LIVEcamera.html
   - 各地方整備局・河川国道事務所を列挙
   - mach-tools との突合で漏れ検出

2. **NEXCO & 自治体**
   - NEXCO 東日本: https://www.driveplaza.com/traffic/camera/
   - NEXCO 中日本/西日本: https://ihighway.jp/
   - 都道府県別サイト（livecam.asia 配信元表記から逆引き）

3. **リソース**
   - API: なし（スクレイピング）
   - 推奨進度: 2-3 日

### アウトプット

- `data/PHASE3_ROAD_LIST.tsv`
- `data/cams_jp.js` (更新版)

---

## Phase 4: YouTube Data API v3 + Windy 補完

**目標**: 配信中の YouTube ライブ検索 + 景観カメラ補完

### インプット

1. **YouTube Data API v3**
   - キーワード: （地名 + 「ライブカメラ」）× 47 都道府県 × カテゴリ
   - フィルタ: type=video, eventType=live
   - 無料枠: 100 回/日 × 1 ユニット
   - API URL: https://developers.google.com/youtube/v3/docs/search/list
   - **制約**: ToS 厳守、embeddable 確認必須

2. **Windy Webcams API**
   - PoC: 無料キーで国内カメラ数見積もり
   - 有料版: 年額 9,990 ユーロ（~160万円）→ ROI 判定後
   - API: https://api.windy.com/webcams/docs

3. **リソース**
   - API quota: YouTube 100回/日、Windy 無料枠（offset 上限 1000）
   - 推奨進度: Phase 3 完了後

### アウトプット

- `data/PHASE4_YOUTUBE_LIVE.tsv`
- `data/PHASE4_WINDY_SAMPLE.md`
- `data/cams_jp.js` (最終版)

---

## API Quota 管理

| API | 無料枠 | 推奨運用 |
|-----|--------|--------|
| YouTube Data API v3 search.list | 100回/日 | 1 都道府県 2-3 回/日 |
| YouTube oEmbed | 制限なし | ~1500件/日 まで |
| Windy Webcams | offset≤1000, 画像URL15分失効 | PoC → 有料判定 |
| river.go.jp | [申込後確認] | [調整待ち] |

---

## 重複除外ルール

| パターン | 判定 | 処置 |
|---------|------|------|
| ビデオID 完全一致 | ✅ 明確な重複 | 除外・記録 |
| チャンネルID 完全一致 + 名称一致 | ✅ ほぼ重複 | 除外・確認 |
| 座標一致 + 異なる配信者 | ⚠️ 同一スポット複数配信 | 保持・タグ付け |
| 座標近傍（0.01°以内）+ 異なる名称 | ⚠️ 要確認 | 手動確認 |

---

## 目標スケジュール

| フェーズ | ソース | 件数目標 | 期間 | 状態 |
|---------|--------|--------|------|------|
| 0 | livecam.asia | 2,545 | ✅ 完了 | ✅ 完成 |
| 1 | camera-map.com | +2,000-5,000 | 3-5 日 | ⏳ 準備中 |
| 2 | river.go.jp | +1,000-2,000 | 2-3 日 | 🔄 API 申込確認 |
| 3 | 道路・NEXCO・県道 | +500-1,000 | 2-3 日 | ⏳ 準備中 |
| 4 | YouTube + Windy | +1,000-2,000 | 3-5 日 | ⏳ 準備中 |
| **合計** | | **6,000-11,000** | **2-3 週間** | 進行中 |

---

## 次のアクション

1. **Phase 1 開始前**
   - [ ] camera-map.com ページ構造の手動確認（JavaScript 対応）
   - [ ] Playwright または Selenium の導入

2. **Phase 2 開始前**
   - [ ] river.go.jp 水防災オープンAPI 申込状況確認
   - [ ] API 不可なら観測所一覧スクレイピング計画

3. **全フェーズ共通**
   - [ ] YouTube oEmbed 検証スクリプト準備
   - [ ] 重複判定アルゴリズム実装
   - [ ] git commit: Phase 0 出力ファイル
