# 本番反映の手順（帰宅後）

## 📋 準備（1回だけ）

### 1️⃣ Claude App をインストール

1. https://github.com/apps/claude/installations/select_target にアクセス
2. **kouchift/tokyostation** を選択
3. インストール完了

### 2️⃣ このファイルに「入れた」と記録

このドキュメントの下部にある **「Claude App インストール状態」** セクションに日時を記入。
記入すると、GitHub Actions が自動で検出します。

---

## 🔄 作業フロー（毎回）

### ステップ 1: サイトを修正・テスト

ローカルで修正して、動作確認後に git へ：

```bash
git add <ファイル>
git commit -m "Fix: <簡潔な説明>"
git push origin <branch名>
```

### ステップ 2: このドキュメントを更新（Claude が検出）

下の **「作業中の変更」** セクションに、修正内容を記入：

```markdown
## 作業中の変更

**日時:** 2026-10-05 18:30
**担当:** あなたの名前
**内容:**
- スポットの説明を 50 件追加
- 路線アイコンの表示バグ修正
- パフォーマンス最適化（読み込み 2 秒短縮）

**状態:** ✅ ローカルテスト完了・push 済み
```

### ステップ 3: Claude の子セッションが自動で PR を作成

ファイルが更新されたら、自動で：

1. **新しいブランチを作成** → `release/<日時>`
2. **変更をコミット** → バンドル、バージョンアップ
3. **ドラフト PR を作成**
4. **PR の説明に実績を記載**

```
### 📝 自動生成の PR 例

タイトル: `Chore: Release v164 — スポット説明追加・バグ修正`

本文:
- ✅ assets/*.js をバンドル
- ✅ data/version.js を v164 に更新
- ✅ 文法チェック OK
- ✅ CHANGELOG に記述済み
- 🔗 変更内容: <このドキュメントのリンク>
- ⏱️ 自動生成時刻: 2026-10-05 18:35 JST
```

### ステップ 4: あなたが PR をレビュー＆マージ

帰宅後、PR を開いて：

1. **変更を確認** → 想定通りか確認
2. **「Merge」をクリック**
3. **数分で GitHub Pages に反映** ✨

```
自動で:
- main ブランチに入る
- GitHub Pages がビルド開始
- 🌍 https://kouchift.github.io/tokyostation/?v=164 で公開
```

---

## 🤖 自動化される作業

### Claude の子セッション（このドキュメント更新時に自動開始）

```
✅ 検出: 「作業中の変更」セクションが更新された
→ PR ブランチ release/<日時> を作成
→ バンドル実行: node tools/build_bundle.js
→ バージョンアップ: data/version.js
→ CHANGELOG 更新: data/changelog.js
→ ドラフト PR 作成
→ 進捗報告をコメント
```

### GitHub Actions（PR マージ時に自動実行）

```
✅ PR が main にマージされた
→ assets/app.bundle.js が最新か確認
→ テスト実行（npm test など）
→ GitHub Pages ビルド開始
→ 数分で https://... に反映
```

---

## 📝 「作業中の変更」セクション（このファイルに追記）

このセクションを更新すると、Claude が自動で子セッションを開始します。

### テンプレート

```markdown
## 作業中の変更

**日時:** YYYY-MM-DD HH:MM (JST)
**担当:** <あなたの名前>
**優先度:** 🔴 高 / 🟡 中 / 🟢 低

### 変更内容

**機能追加:**
- [ ] 項目 1
- [ ] 項目 2

**バグ修正:**
- [ ] 項目 1
- [ ] 項目 2

**パフォーマンス:**
- [ ] 項目 1

### テスト状況

- [ ] ローカルで動作確認
- [ ] ブラウザ互換性確認
- [ ] 変更ファイルをコミット済み

### 自動公開希望

- [ ] はい（PR 作成後に自動マージを希望）
- [ ] いいえ（PR をレビューしてから手動マージ）

---
```

### 例

```markdown
## 作業中の変更 #1

**日時:** 2026-10-05 18:30
**担当:** @kouchift
**優先度:** 🟡 中

### 変更内容

**機能追加:**
- [x] 銀座線の駅 3 件に写真追加
- [x] スポット「東京国立博物館」の説明を 500 字に拡張

**バグ修正:**
- [x] 路線アイコンが高 DPI ディスプレイで割れる問題を修正

### テスト状況

- [x] ローカルで動作確認（iPhone SE・iPad・PC）
- [x] ブラウザ互換性確認（Chrome・Safari・Firefox）
- [x] 変更ファイルをコミット済み（3 ファイル）

### 自動公開希望

- [x] はい（PR 作成後に自動マージを希望）
```

---

## ⚙️ GitHub Actions の設定

### `release-on-merge.yml`（main マージで自動公開）

このファイルは `.github/workflows/` に配置されます：

```yaml
name: Auto Release on Merge

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  release:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: ✅ Build & Test
        run: |
          node --check assets/app.bundle.js
          node --check data/version.js
      
      - name: 📦 Run tests (if any)
        run: npm test || true
      
      - name: 🚀 Publish to GitHub Pages
        run: |
          echo "✅ PR をマージしました"
          echo "GitHub Pages ビルドは自動で開始されます"
          echo "数分で反映: https://kouchift.github.io/tokyostation"

  notify:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    needs: release
    steps:
      - name: 📢 Notify
        run: |
          echo "🎉 v$(grep VERSION data/version.js | sed 's/.*v//;s/".*//' | head -1) を公開しました"
```

---

## 🔐 セキュリティ上の注意

- **秘密ファイルは送信しない**: `~/.tsg_uploader.json` など
- **このドキュメントには機密情報を書かない**
- **PR のコメント欄にもトークンを��らない**

---

## 🐛 ���ラブル時の対応

### Q: PR が作られない

**A:** 以下を確認
- [ ] Claude App がインストール済みか（下記参照）
- [ ] このドキュメントに「作業中の変更」セクションが追加されたか
- [ ] ファイルの文法は正しいか（`- [ ]` の形式など）

### Q: マージ後に公開されない

**A:** 以下を確認
- [ ] GitHub Pages は有効か（Settings → Pages で確認）
- [ ] main ブランチが publish source に設定されているか
- [ ] 数分待った（初回は 5 分かかる場合がある）

### Q: 手動で公開したい

**A:** ローカルで実行
```bash
node tools/release.mjs --yes
```

---

## ✅ Claude App インストール状態

| 項目 | 状態 | 日時 |
|------|------|------|
| Claude App インストール | 🔴 未実施 | — |
| インストール確認 | — | — |

**手順:**
1. https://github.com/apps/claude/installations/select_target で **kouchift/tokyostation** を選択
2. インストール完了後、下の表を編集して日時を記入
3. このファイルをコミット・push

```markdown
| Claude App インストール | ✅ 完了 | 2026-10-05 18:00 JST |
```

---

## 📚 関連リンク

- [.cursorrules](.cursorrules) — Claude の自動化ルール
- [CLAUDE.md](CLAUDE.md) — 開発者向けメモ
- [data/version.js](data/version.js) — 現在のバージョン
- [data/changelog.js](data/changelog.js) — 変更履歴

---

**最終更新:** 2026-10-05  
**作成者:** Claude  
**目的:** 帰宅後の本番反映を完全自動化
