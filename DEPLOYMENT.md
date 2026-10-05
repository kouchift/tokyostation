# 🚀 本番反映ワークフロー（GitHub 直接実行版）

> このファイルを GitHub 上で更新して commit するだけで、Claude が自動で子セッションを立ち上げ、PR を作成します。
> あなたが PR をマージすれば、GitHub Pages に数分で反映されます。

---

## 1. 目標

帰宅後に、次の手順を最短で実行できます。

1. GitHub で Claude App をインストール
2. 本番反映のための作業メモを更新
3. Claude が子セッションでブランチ作成・PR 作成まで進める
4. PR をマージすると GitHub Pages に反映

---

## 2. 初回だけ実施すること

### Claude App をインストール

1. https://github.com/apps/claude/installations/select_target にアクセス
2. `kouchift/tokyostation` を選択
3. インストール完了

その後、次の状態をこれからの運用では「完了」にして使います。

---

## 3. 毎回の本番反映手順

### ステップ A: GitHub 上で作業内容を記録する

このファイルの下部にある「作業中の変更」セクションを更新して、commit して push します。

例:

```markdown
## 作業中の変更

**日時:** 2026-10-05 20:00
**担当:** @kouchift
**優先度:** 🟡 中

**変更内容:**
- ✅ ルート計算のバグ修正
- ✅ 検索後の UI 表示改善
- ✅ 画像の遅延読み込み追加

**テスト:** ✅ ローカル確認済み
```

### ステップ B: Claude が自動で進めること

更新後、Claude の子セッションが自動的に次を実行します。

- ブランチ作成
- 必要な修正を反映
- バージョン番号更新
- CHANGELOG 更新
- Draft PR の作成

### ステップ C: PR を merge する

PR を確認して、必要ならレビューしたうえで merge します。

merge 後、GitHub Pages が自動でビルドされ、数分で反映されます。

URL 例:

https://kouchift.github.io/tokyostation/

---

## 4. 自動化の対象

GitHub 上で更新があったとき、Claude は次を自動で進めます。

```text
検知: 「作業中の変更」が更新された
→ ブランチを作成
→ 必要な修正を手順に従って適用
→ バンドル/テストを実施
→ Draft PR を作成
→ 進捗をコメント
```

---

## 5. 実行されるコマンド例

```bash
# 版を上げて公開
node tools/release.mjs --yes

# バンドルだけ再作成
node tools/build_bundle.js

# 生成物の確認
node --check assets/app.bundle.js
node --check data/version.js
```

---

## 6. 作業中の変更

このセクションを更新すると、Claude が自動で子セッションを開始します。

```markdown
## 作業中の変更

**日時:** YYYY-MM-DD HH:MM (JST)
**担当:** @username
**優先度:** 🔴 高 / 🟡 中 / 🟢 低

**変更内容:**
- [ ] 変更点 1
- [ ] 変更点 2

**テスト:** ✅ ローカル確認済み
```

---

## 7. 現在の状況

### Claude App インストール状態

| 項目 | 状態 |
|------|------|
| Claude App インストール | 🔴 未実施 |
| 対象リポジトリ | `kouchift/tokyostation` |

以下を実行済みなら、状態を ✅ に更新してください。

- https://github.com/apps/claude/installations/select_target
- `kouchift/tokyostation` を選択してインストール済み

---

## 8. 参考リンク

- [.cursorrules](.cursorrules)
- [CLAUDE.md](CLAUDE.md)
- [data/version.js](data/version.js)
- [data/changelog.js](data/changelog.js)

---

## 9. 実行の最短フロー

```text
1. このファイルを GitHub で開く
2. 「作業中の変更」を更新
3. Commit → push
4. Claude が PR を作成
5. PR を merge
6. GitHub Pages に反映
```

---

## 10. 今すぐやること

帰宅後に、最初にこの作業だけやれば OK です。

1. Claude App をインストールする
2. このファイルを開いて「作業中の変更」を最初の記録として追加する
3. push する
4. Claude が PR まで進める

これで、帰宅後に手動でいちいちコマンドを打たずに、
GitHub 側で本番反映の流れを回せます。
