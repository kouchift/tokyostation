# TokyoStation v108 実装完了ガイド

## 📦 v108 の変更内容

### 新機能
- **Firestore データベース**: コメント・いいね・評価データをクラウド保存
- **画像アップロード**: Cloud Storage でユーザー写真をホスト
- **5段階評価**: ★★★★★ で評価を記録
- **いいね機能**: ❤️ ボタンでコメントに投票
- **日付記録**: 訪問日を任意で記録

### 対応範囲
- 🚉 **駅の詳細** (タップして出るカード): コメント＋画像＋評価＋いいね
- 🎯 **スポット・POI** (マップ上のエリア): コメント＋画像＋評価＋いいね

## ⚙️ 必要な設定（ユーザー側）

### 1️⃣ Google Cloud Platform で Firebase プロジェクト設定

```
プロジェクト ID: tokyostation
Firestore データベース: (default) を有効化
Cloud Storage バケット: tokyostation-images を作成
```

#### Firestore セットアップ
- Firebase Console → Firestore Database → Create Database
- Mode: Production
- Location: asia-northeast1（日本）
- セキュリティルール（後で設定）:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /spots/{spotId}/comments/{commentId} {
      allow read: if true;
      allow create: if request.resource.data.text.size() > 0 && 
                       request.resource.data.text.size() <= 300;
      allow update: if resource.data.likes != null;
    }
  }
}
```

#### Cloud Storage セットアップ
- Firebase Console → Storage → Create Bucket
- Bucket name: `tokyostation-images`
- Location: asia-northeast1
- Storage class: Standard
- セキュリティルール:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /spots/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 2️⃣ Google Apps Script 配置

1. **Google Apps Script プロジェクトを作成**（または既存を使用）
2. **ファイル: `comments_api_v108.gs` をコピー** して新しい .gs ファイルを作成
3. **デプロイ**
   - 「デプロイ」→ 新しいデプロイ
   - 「種類を選択」→ ウェブアプリ
   - 実行形式: 「自分」
   - アクセス: 「全員」（重要！公開する）
   - デプロイボタン
4. **URL をコピー** 例: `https://script.google.com/macros/d/XXXXXXXXX/usercopy?v=1`

### 3️⃣ サイト設定を更新

ZIPファイルを解凍して、以下をあなたの tokyostation フォルダに上書き:

```
tokyostation-v108-changes.zip を解凍

↓

tokyostation/
├── tools/comments_api_v108.gs        ← NEW: Firestore API
├── assets/comments-v108.js           ← NEW: フロントエンド
├── data/support.js                   ← UPDATED: Firebase設定追加
├── assets/app.css                    ← UPDATED: v108 スタイル
├── index.html                        ← UPDATED: v108 参照
└── sw.js                             ← UPDATED: v108 キャッシュ
```

### 4️⃣ API エンドポイント を設定

`data/support.js` の以下の行を編集:

```javascript
commentsApi: "", // ← Google Apps Script の URL を貼る
```

例:
```javascript
commentsApi: "https://script.google.com/macros/d/XXXXXXXXX/usercopy?v=1",
```

### 5️⃣ アップローダーで公開

いつもの手順で アップローダーにアップして公開してください。

## 🧪 テスト手順

公開後、以下で動作確認:

1. **スポット（POI）をタップ** → ボトムシートが出る
2. **「みんなの声」タブ** → コメント投稿フォームが出る
3. **名前・評価・コメント・写真を入力** → 「投稿する」
   - ステータスが「送信中...」→ 「投稿しました！」と出る
   - コメントがリストに追加される（1秒待機後）
4. **「❤️ 0」ボタン** → いいね投稿（本実装は後）
5. **別のブラウザ/端末でアクセス** → 投稿が表示される（確認用）

## 📝 ユーザーデータの流れ

```
ユーザー入力
    ↓
📸 画像 → Base64 に変換 → Firestore に送信
    ↓
Google Apps Script （comments_api_v108.gs）
    ↓
🔽 画像を Cloud Storage にアップロード
🔽 コメントデータを Firestore に保存
    ↓
📊 Firestore Collection: /spots/{spotId}/comments/{commentId}
```

### Firestore データ構造

```json
{
  "commentId": "uuid-xxxx",
  "name": "田中太郎",
  "rating": 5,
  "text": "景色が最高！",
  "visitDate": "2026-09-25",
  "timestamp": 1726070435000,
  "imageUrl": "https://storage.googleapis.com/tokyostation-images/spots/...",
  "likes": 0,
  "vid": "visitor-uuid"
}
```

## 🛡️ セキュリティ & レート制限

✅ **実装済み**:
- 60秒のクールダウン（同一訪問者が連続投稿できない）
- 1日10件制限（1訪問者あたり）
- XSS対策（HTML エスケープ）
- Base64 画像コンプレッション

⚠️ **要注意**:
- Firestore セキュリティルールは本番前に要確認
- Cloud Storage は「公開読み取り」なため、不適切な画像対策は別途必要（Admin画面など）

## 📚 ファイル詳細

### `tools/comments_api_v108.gs`
- Google Apps Script バックエンド
- 関数: `doGet()`, `doPost()`, `likeComment()`, etc.
- Firestore REST API で直接通信
- Cloud Storage JSON API で画像アップロード

### `assets/comments-v108.js`
- フロントエンド JavaScript
- RG.commentsHTML() → フォームHTML生成
- RG.commentsBind() → イベントリスナー設定
- RG.submitComment() → POST送信
- RG.likeComment() → いいね投票（TODO）

### `data/support.js`
- Firebase 設定（Project ID・API Key・Bucket）
- comments API エンドポイント URL

## 🔄 次のステップ（Phase 1 の予定）

1. **いいね機能の完全実装** （現在は stub）
2. **カメラアイコンの重複排除** （Phase 0 分析の活用）
3. **コメント管理画面** (Admin Console)
4. **スパム検出** (キーワード・画像フィルタ)

## ❓ トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 「コメント機能が設定されていません」 | commentsApi が空 | data/support.js を確認 |
| 「401 Unauthorized」 | Firebase API Key が無効 | GCP コンソール確認 |
| 画像が 404 エラー | Cloud Storage パス問題 | Firestore の imageUrl を確認 |
| 「Too many requests」 | 60秒以内に再投稿 | 少し待ってから再度 |
| 毎回「コメント機能が設定されていません」 | Google Apps Script の URL が間違い | デプロイURLを確認 |

---

**作成日**: 2026-09-25  
**バージョン**: v108  
**ステータス**: ✅ 実装完了・配置待ち
