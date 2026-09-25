# TokyoStation v109 実装完了ガイド

## 📦 v109 の変更内容

### ✨ 新機能
- **ソート UI**: いいね順/新しい順/古い順でコメントを並び替え
- **いいね完全実装**: 重複投票防止、状態表示（❤️/🤍）
- **URL バリデーション**: 短縮 URL ブロック、スパムキーワード検出
- **URL リンク表示**: コメント内の URL を自動リンク化
- **ユーザープロフィール**: 投稿者クリック → 活動履歴モーダル表示
- **活動タイムライン**: ユーザーの全投稿を時系列表示

### 対応範囲（v108 から継続）
- 🚉 **駅の詳細**: コメント＋画像＋評価＋いいね
- 🎯 **スポット・POI**: コメント＋画像＋評価＋いいね＋ソート＋プロフィール

## ⚙️ 必要な設定（変更なし）

### 1️⃣ Google Cloud Platform（v108 と同じ）

```
プロジェクト ID: tokyostation
Firestore Database: (default)
Cloud Storage Bucket: tokyostation-images
```

### 2️⃣ Google Apps Script デプロイ（**v109 更新版を使用**）

**【重要】v108 の Google Apps Script をデプロイ済みの場合：**

1. **Google Apps Script プロジェクトを開く**
2. **`tools/comments_api_v108.gs` の内容全体を削除**
3. **`tools/comments_api_v109.gs` の内容をコピーして貼り付け**
4. **デプロイ**
   - 「デプロイ」→ 新しいデプロイ
   - 「種類を選択」→ ウェブアプリ
   - 実行形式: 「自分」
   - アクセス: 「全員」
   - 【保存】（新しい URL が生成される場合と、既存のまま場合がある）

5. **デプロイ URL をコピー**
   - 例: `https://script.google.com/macros/d/XXXXXXXXX/usercopy?v=1`

### 3️⃣ サイト更新

ZIP ファイルを解凍して、以下をあなたの `tokyostation` フォルダに上書き:

```
tokyostation-v109-changes.zip を解凍

↓

tokyostation/
├── tools/comments_api_v109.gs        ← UPDATED: URL/いいね/プロフィール
├── assets/comments-v109.js           ← UPDATED: ソート UI・プロフィール・いいね
├── data/support.js                   ← (変更なし: commentsApi URL を設定)
├── assets/app.css                    ← UPDATED: v109 スタイル追加
├── index.html                        ← UPDATED: v109 参照
└── sw.js                             ← UPDATED: v109 キャッシュ
```

### 4️⃣ API エンドポイント設定（v108 と同じ）

`data/support.js` の以下の行を確認:

```javascript
commentsApi: "https://script.google.com/macros/d/XXXXXXXXX/usercopy?v=1",
```

**v108 から v109 へ移行する場合：**
- 新しい Google Apps Script デプロイ URL に更新してください（上の手順で生成）

### 5️⃣ アップローダーで公開

いつもの手順でアップローダーにアップして公開してください。

## 🧪 テスト手順

公開後、以下で動作確認:

### コメント投稿
1. **スポット（POI）をタップ** → ボトムシートが出る
2. **「みんなの声」タブ** → ソート UI が見える（❤️いいね順 / 🕐新しい順 / 📅古い順）
3. **名前・評価・コメント・写真を入力** → 「投稿する」
   - ステータスが「送信中...」→ 「投稿しました！」
   - コメント一覧に追加される（1秒待機後）

### ソート機能
4. **ソートボタンをクリック** → コメント並び替え
   - 「❤️いいね順」→ いいね数の多い順（デフォルト）
   - 「🕐新しい順」→ 投稿日時の新しい順
   - 「📅古い順」→ 投稿日時の古い順

### いいね機能
5. **「🤍 0」ボタン** → いいね投稿
   - 「❤️ 1」に変更（ボタン色が赤くなる）
   - **2度目は投票不可** (ボタン disabled)
   - 別のブラウザ/端末でアクセス → いいね数が更新される

### プロフィール機能
6. **投稿者名をクリック** → プロフィールモーダル表示
   - 投稿者の名前
   - 総投稿数
   - 投稿一覧（時系列）

### URL 機能
7. **コメント内に URL を貼り付け**
   - `https://example.com` → 青いボタン「🔗 link」に自動変換
   - クリック → 新規タブで開く
   - **短縮 URL ブロック** (bit.ly 等は投稿拒否)

### 別のブラウザ/端末でアクセス
8. **別の端末から同じスポットを見る**
   - 投稿が表示される ✓
   - いいね数が反映されている ✓
   - プロフィール機能が動作 ✓

## 📝 v109 で実装した機能の詳細

### ソート API の仕様

フロントエンド `RG.loadComments()` で `sortType` パラメータを受け取り:
- `sortType = "likes"` (デフォルト) → Firestore で `likes` 値の降順
- `sortType = "newest"` → タイムスタンプの降順
- `sortType = "oldest"` → タイムスタンプの昇順

### いいね API の仕様

**POST リクエスト:**
```json
{
  "action": "likeComment",
  "spotId": "spot_001",
  "commentId": "uuid-xxxx",
  "vid": "visitor-uuid"
}
```

**Google Apps Script の処理:**
1. コメント取得 → 現在の `likes` と `likeVids` 配列を確認
2. `likeVids` に `vid` が含まれているか チェック
3. **含まれていない場合:**
   - `likes` をインクリメント
   - `likeVids` 配列に `vid` を追加
   - Firestore 更新 → 成功応答

4. **含まれている場合:**
   - エラー「Already liked」を返す
   - フロント側でボタンを disabled に

### プロフィール API の仕様

**GET リクエスト:**
```
?action=getUserProfile&vid={visitor-id}
```

**Google Apps Script の処理:**
1. Firestore `/profiles/{vid}` ドキュメント取得
2. 以下を返す:
   - `name`: ユーザー名
   - `totalComments`: 総投稿数
   - `joinDate`: 参加日
   - `activities`: 最新 50 件の活動履歴

### URL バリデーションの仕様

**ブロック対象:**
- **短縮 URL**: bit.ly, tinyurl, goo.gl, short.link, ow.ly, rebrand.ly, cuttly.com
- **スパムキーワード**: viagra, casino, lottery, cryptocurrency, bitcoin
- **疑わしい TLD**: .tk, .ml, .ga, .cf

**許可対象:**
- `https://` または `http://` で始まる正式な URL
- 2個以上の URL を含むコメント（制限なし）

### プロフィールモーダル UI

**レイアウト:**
```
┌─────────────────────────────┐
│ [✕] プロフィール             │
├─────────────────────────────┤
│ 【ユーザー名】               │
│ 投稿数: 15                   │
│ 参加日: 2026年9月25日       │
├─────────────────────────────┤
│ この人の投稿                  │
│ 1. 投稿 #abc123xyz          │
│ 2. 投稿 #def456xyz          │
│ ... (最新 50 件)            │
└─────────────────────────────┘
```

## 🔄 次のステップ（Phase 2 計画）

### v110 で検討予定
1. **URL プレビュー機能** (Open Graph 取得)
2. **荒し対策強化** (IP ベース制限、連続投稿検知)
3. **コメント管理画面** (Admin Console - 削除・非表示機能)
4. **通知機能** (いいねされたらアラート)
5. **検索機能** (ユーザー名・キーワード検索)

## 📊 Firestore データ構造（v109）

```json
// /spots/{spotId}/comments/{commentId}
{
  "spotId": "spot_001",
  "commentId": "uuid-xxxx",
  "name": "田中太郎",
  "rating": 5,
  "text": "景色が最高！ https://example.com",
  "urls": ["https://example.com"],
  "visitDate": "2026-09-25",
  "timestamp": 1726070435000,
  "imageUrl": "https://storage.googleapis.com/tokyostation-images/spots/...",
  "likes": 3,
  "likeVids": ["visitor-uuid-1", "visitor-uuid-2", "visitor-uuid-3"],
  "vid": "visitor-uuid"
}

// /profiles/{vid}
{
  "name": "田中太郎",
  "totalComments": 15,
  "joinDate": "2026-09-01T10:00:00Z",
  "activities": [
    {"spotId": "spot_001", "commentId": "uuid-xxxx", "timestamp": 1726070435000},
    {...}
  ]
}
```

## 🛡️ セキュリティ & レート制限

✅ **実装済み**:
- 60秒のクールダウン（同一訪問者が連続投稿できない）
- 1日10件制限（1訪問者あたり）
- XSS対策（HTML エスケープ）
- Base64 画像コンプレッション
- URL バリデーション＆短縮 URL ブロック
- スパムキーワード検出
- いいね重複投票防止

⚠️ **要注意**:
- Firestore セキュリティルールは本番前に要確認
- Cloud Storage は「公開読み取り」のため、不適切な画像対策は別途必要（Admin画面など）
- IP ベース制限は v110 で実装予定

## 📚 ファイル詳細

### `tools/comments_api_v109.gs`
- **v108 からの変更:**
  - `validateAndExtractUrls()`: URL バリデーション＆抽出
  - `validateUrl()`: 短縮 URL・疑わしい TLD 検出
  - `likeVids` 配列による重複投票防止
  - `saveUserActivity()`: ユーザープロフィール保存
  - `getUserProfileFromFirestore()`: プロフィール取得

### `assets/comments-v109.js`
- **v108 からの変更:**
  - `RG.commentsHTML()`: ソート UI、プロフィールモーダル追加
  - `RG.renderCommentsList()`: ソート処理、URL リンク化、プロフィールリンク
  - `RG.likeComment()`: 完全実装＆重複投票防止
  - `RG.showUserProfile()`: プロフィールモーダル表示・データ取得

### `assets/app.css`
- **v109 追加スタイル:**
  - `.comments__sort` / `.comments__sort-btn`: ソート UI
  - `.comments__like-btn--liked`: いいね済み状態
  - `.comments__url-link`: URL リンク表示
  - `.comments__profile-modal`: プロフィールモーダル

## ❓ トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| ソート UI が出ない | v109 JS が読み込まれていない | index.html に `?v=109` が付いているか確認 |
| いいねボタンが動作しない | Google Apps Script が v109 に更新されていない | 手順 2️⃣ を確認 |
| プロフィール modal が出ない | /profiles コレクションが Firestore に無い | フロント side で自動作成される（最初は「投稿がありません」表示） |
| URL が リンク化されない | バリデーション失敗 | コメント内の URL が正式な http/https URL か確認 |
| 「Already liked」で投稿できない | 同じコメントに 2 回いいねしようとした | 正常動作（重複防止） |

---

**作成日**: 2026-09-25  
**バージョン**: v109  
**ステータス**: ✅ 実装完了・配置待ち

**次のバージョン (v110) での予定:**
- URL プレビュー機能
- 荒し対策強化
- Admin 管理画面
- 通知機能
