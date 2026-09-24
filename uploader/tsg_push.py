# -*- coding: utf-8 -*-
"""
東京ステーションガイド 差分アップロード（画面なし版・v101）

tsg_uploader.py（GUI）と同じ設定ファイル（~/.tsg_uploader.json: dir / owner / repo / branch / token）を読み、
«変わったものだけ上げる» と同じことをコマンドラインで行う。GUI を押せないとき（遠隔・自動）用。

  python tsg_push.py            … 下見だけ（何が変わるかを表示して止まる）
  python tsg_push.py --go       … 実際に上げる
  python tsg_push.py --go --dir C:\\path\\to\\tokyostation   … フォルダを指定

トークンは画面にも出力にも出さない。GitHub 側にしか無いファイルは消さない（«まるごと» ではなく «差分» だけ）。
"""
import os, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tsg_uploader import GH, collect, git_blob_sha, load_conf   # noqa: E402

def main():
    go = "--go" in sys.argv
    conf = load_conf()
    root = conf.get("dir", "")
    if "--dir" in sys.argv:
        root = sys.argv[sys.argv.index("--dir") + 1]
    if not os.path.isdir(root):
        print("✕ 上げるフォルダが見つかりません:", root); return 2
    if not (conf.get("token") and conf.get("owner") and conf.get("repo")):
        print("✕ 設定（owner / repo / token）がありません。先に tsg_uploader.py で保存してください"); return 2
    gh = GH(conf["token"], conf["owner"], conf["repo"], conf.get("branch") or "main")
    print("■ 手元のファイルを数えています…", root)
    local = collect(root)
    print("   %d 個 / %.1f MB" % (len(local), sum(len(v) for v in local.values()) / 1048576))
    print("■ GitHub 側を見ています… %s/%s (%s)" % (gh.o, gh.r, gh.b))
    head_sha, tree_sha = gh.head()
    remote, _ = gh.remote_files(tree_sha)
    print("   %d 個" % len(remote))
    only = None
    if "--only" in sys.argv:   # v108: 月次の自動更新では、作業中のほかのファイルを巻き込まない
        only = set(x.strip().replace("\\", "/") for x in sys.argv[sys.argv.index("--only") + 1].split(",") if x.strip())
        print("■ 対象をしぼります:", ", ".join(sorted(only)))
    add, upd, same = [], [], 0
    for rel, data in local.items():
        if only is not None and rel not in only: continue
        sha = git_blob_sha(data)
        if rel not in remote: add.append(rel)
        elif remote[rel] != sha: upd.append(rel)
        else: same += 1
    print("■ 変わりぶん  新しく増える %d / 中身が変わる %d / そのまま %d" % (len(add), len(upd), same))
    for p in (add + upd)[:40]: print("     ＋ " + p)
    if len(add) + len(upd) > 40: print("     …ほか %d 個" % (len(add) + len(upd) - 40))
    if not (add or upd):
        print("✓ 変わったところはありません。"); return 0
    if not go:
        print("（下見だけ。実際に上げるときは --go を付けてください）"); return 0
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
    base = tree_sha
    CH = 200
    for i in range(0, len(entries), CH):
        for attempt in range(4):
            try:
                base = gh.make_tree(base, entries[i:i + CH]); break
            except Exception as ex:
                if attempt == 3: raise
                print("   （もう一度ためします: %s）" % str(ex)[:60]); time.sleep(5 * (attempt + 1))
        print("   反映 %d / %d" % (min(i + CH, len(entries)), len(entries)))
    msg = ("月次の自動更新（%s）" % ", ".join(sorted(only))) if only else "アップローダーから反映（＋%d 変更%d）" % (len(add), len(upd))
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
