# -*- coding: utf-8 -*-
"""
まるごと入れ替え（差分＋削除）を、確認なしで --go 付きのときだけ実行するヘッドレス版。
tsg_uploader.py の GUI 版「まるごと入れ替え」と同じロジック（sha:None で削除）を
コマンドラインから実行するためのもの。

  python tsg_push_full.py --dir <path>          … 下見だけ
  python tsg_push_full.py --dir <path> --go      … 実際に反映（追加・更新・削除）
"""
import os, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tsg_uploader import GH, collect, git_blob_sha, load_conf  # noqa: E402


def main():
    go = "--go" in sys.argv
    conf = load_conf()
    root = conf.get("dir", "")
    if "--dir" in sys.argv:
        root = sys.argv[sys.argv.index("--dir") + 1]
    if not os.path.isdir(root):
        print("✕ アップ元フォルダが見つかりません:", root); return 2
    if not (conf.get("token") and conf.get("owner") and conf.get("repo")):
        print("✕ 設定（owner / repo / token）がありません"); return 2
    gh = GH(conf["token"], conf["owner"], conf["repo"], conf.get("branch") or "main")
    print("■ 手元のファイルを数えています…", root)
    local = collect(root)
    print("   %d 個 / %.1f MB" % (len(local), sum(len(v) for v in local.values()) / 1048576))
    print("■ GitHub 側を見ています… %s/%s (%s)" % (gh.o, gh.r, gh.b))
    head_sha, tree_sha = gh.head()
    remote, truncated = gh.remote_files(tree_sha)
    print("   %d 個%s" % (len(remote), "（一覧が途中まで）" if truncated else ""))

    add, upd, same = [], [], 0
    for rel, data in local.items():
        sha = git_blob_sha(data)
        if rel not in remote: add.append(rel)
        elif remote[rel] != sha: upd.append(rel)
        else: same += 1
    import fnmatch
    from tsg_uploader import KEEP_REMOTE
    dele = [p for p in remote if p not in local and not any(fnmatch.fnmatch(p, k) for k in KEEP_REMOTE)]   # v114: GitHub Actions の出力は消さない

    print("■ 変わりぶん  新しく増える %d / 中身が変わる %d / そのまま %d / 消える %d" % (len(add), len(upd), same, len(dele)))
    for p in (add + upd)[:20]: print("     ＋ " + p)
    if len(add) + len(upd) > 20: print("     …ほか %d 個" % (len(add) + len(upd) - 20))
    for p in dele[:20]: print("     － " + p)
    if len(dele) > 20: print("     …ほか %d 個" % (len(dele) - 20))

    if not (add or upd or dele):
        print("✓ 変わったところはありません。"); return 0
    if not go:
        print("（下見だけ。実行するには --go）"); return 0

    send = add + upd
    print("■ ファイルを送っています… %d 個" % len(send))
    entries = []
    for i, rel in enumerate(send, 1):
        data = local[rel]
        try:
            txt = data.decode("utf-8")
            entries.append({"path": rel, "mode": "100644", "type": "blob", "content": txt})
        except UnicodeDecodeError:
            entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": gh.put_blob(data)})
        if i % 25 == 0 or i == len(send): print("   %d / %d" % (i, len(send)))
    for rel in dele:
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": None})

    base = tree_sha
    CH = 200
    for i in range(0, len(entries), CH):
        for attempt in range(4):
            try:
                base = gh.make_tree(base, entries[i:i + CH]); break
            except Exception as ex:
                if attempt == 3: raise
                print("   （少し休んで再挑戦: %s）" % str(ex)[:60]); time.sleep(5 * (attempt + 1))
        print("   反映 %d / %d" % (min(i + CH, len(entries)), len(entries)))

    msg = "アップローダーから反映（＋%d 変更%d 削除%d）" % (len(add), len(upd), len(dele))
    c = gh.commit(msg, base, head_sha)
    gh.move_branch(c)
    print("✓ 完了しました。コミット: %s" % c[:8])
    print("   2〜3分で公開ページに反映されます。 https://%s.github.io/%s/" % (gh.o, gh.r))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main() or 0)
    except Exception as e:
        print("✕ うまくいきませんでした:", str(e)[:300]); sys.exit(1)
