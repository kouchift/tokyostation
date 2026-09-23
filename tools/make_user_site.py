# -*- coding: utf-8 -*-
r"""
ユーザーサイト kouchift.github.io を作る／更新する（v105）

Google は robots.txt・favicon・検索結果のサイト名を «ホスト単位»（kouchift.github.io）でしか扱わないため、
project site（/tokyostation/）だけでは効かない。ホスト直下に最小限のページを置くための道具。

  py tools\make_user_site.py            … 下見（何を作る／変えるかを表示して止まる）
  py tools\make_user_site.py --go       … 実行（リポジトリが無ければ作り、ファイルを上げ、Pages を有効にする）

トークンは ~/.tsg_uploader.json（アップローダーと同じ）から読む。画面にも出力にも出さない。
上げるファイルは tools/user_site/ の中身（index.html・robots.txt・favicon.ico・404.html …）。
"""
import os, sys, io, json, base64, urllib.request, urllib.error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "uploader"))
from tsg_uploader import GH, load_conf, git_blob_sha  # noqa: E402

SRC = os.path.join(HERE, "user_site")
GO = "--go" in sys.argv


def main():
    conf = load_conf()
    if not (conf.get("token") and conf.get("owner")):
        print("✕ 設定（owner / token）がありません。先に tsg_uploader.py で保存してください"); return 2
    owner = conf["owner"]; repo = owner + ".github.io"
    gh = GH(conf["token"], owner, repo, "main")
    files = {}
    for root, _, names in os.walk(SRC):
        for n in names:
            p = os.path.join(root, n); rel = os.path.relpath(p, SRC).replace("\\", "/")
            with open(p, "rb") as f: files[rel] = f.read()
    print("■ 上げるファイル %d 個: %s" % (len(files), ", ".join(sorted(files))))
    # リポジトリの有無
    exists = True
    try: gh._req("/repos/%s/%s" % (owner, repo))
    except RuntimeError as e:
        if "404" in str(e): exists = False
        else: raise
    print("■ リポジトリ %s/%s: %s" % (owner, repo, "あり" if exists else "無い → 作る"))
    if not GO:
        print("（下見だけ。実行するには --go）"); return 0
    if not exists:
        gh._req("/user/repos", {"name": repo, "description": "東京ステーションガイド（kouchift.github.io）— ホスト直下の robots.txt / favicon / 入口ページ", "auto_init": True, "private": False})
        print("✓ リポジトリを作りました")
        import time; time.sleep(3)
    # いまの先頭と中身
    head_sha, tree_sha = gh.head()
    remote, _ = gh.remote_files(tree_sha)
    entries = []; changed = 0
    for rel, data in files.items():
        if remote.get(rel) == git_blob_sha(data): continue
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": gh.put_blob(data)}); changed += 1
    if not changed:
        print("✓ 変わったところはありません")
    else:
        tree = gh.make_tree(tree_sha, entries)
        sha = gh.commit("ユーザーサイト: robots.txt / favicon / 入口ページ / 404（%d ファイル）" % changed, tree, head_sha)
        gh.move_branch(sha); print("✓ %d ファイルを反映しました（%s）" % (changed, sha[:8]))
    # GitHub Pages を main の直下から公開（すでに有効なら 409 → そのまま）
    try:
        gh._req("/repos/%s/%s/pages" % (owner, repo), {"source": {"branch": "main", "path": "/"}})
        print("✓ GitHub Pages を有効にしました")
    except RuntimeError as e:
        if "409" in str(e): print("✓ GitHub Pages はすでに有効です")
        else: print("△ Pages の設定: %s（リポジトリの Settings → Pages で main / (root) を選んでください）" % e)
    print("→ 数分後に https://%s/robots.txt と https://%s/ を確認" % (repo, repo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
