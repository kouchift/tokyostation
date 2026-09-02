# -*- coding: utf-8 -*-
"""
東京ステーションガイド アップローダー（Windows で動く GUI ツール）

■ できること
  ・GitHub のリポジトリへ、フォルダの中身を «まるごと» 上げる
  ・2回目からは «変わったファイルだけ» を上げる（差分反映）
  ・いらなくなったファイルを、GitHub 側から消す
  ・4,000枚を超える升目ファイルも扱える（数千ファイルでも動きます）

■ しくみ
  GitHub の Git Data API を使い、
    ① 変わったファイルを blob として登録
    ② tree（フォルダの中身の一覧）を作る
    ③ commit を1つ作り、ブランチを進める
  という手順で、**1回のコミットにまとめて**反映します。
  ブラウザのドラッグ＆ドロップと違い、数千ファイルでも失敗しません。

■ 用意するもの
  ・Python 3.8 以上（Windows なら python.org のインストーラでOK）
  ・GitHub の «個人用アクセストークン»（下の «トークンの作り方» を参照）

■ 使いかた
  1) このファイルをダブルクリック（または python tsg_uploader.py）
  2) はじめの1回だけ、リポジトリとトークンを入れる
  3) «変わったものだけ上げる» を押す
"""
import os, sys, json, time, base64, hashlib, threading, queue, fnmatch
import urllib.request, urllib.error
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

APP = "東京ステーションガイド アップローダー"
CONF = os.path.join(os.path.expanduser("~"), ".tsg_uploader.json")
API = "https://api.github.com"

# 上げないもの（作業用のファイル）
SKIP = ["*.pyc", "__pycache__/*", ".git/*", "node_modules/*", "*.zip",
        "standalone.html", ".DS_Store", "Thumbs.db", "*.tmp", "*.log"]


# ----------------------------------------------------------------- 設定
def load_conf():
    try:
        with open(CONF, encoding="utf-8") as f: return json.load(f)
    except Exception: return {}

def save_conf(c):
    try:
        with open(CONF, "w", encoding="utf-8") as f: json.dump(c, f, ensure_ascii=False, indent=1)
    except Exception: pass


# ------------------------------------------------------------- GitHub
class GH:
    def __init__(self, token, owner, repo, branch="main"):
        self.t, self.o, self.r, self.b = token, owner, repo, branch

    def _req(self, path, data=None, method=None):
        url = path if path.startswith("http") else API + path
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(url, data=body, method=method or ("POST" if data else "GET"))
        req.add_header("Authorization", "Bearer " + self.t)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("User-Agent", "tsg-uploader")
        if body: req.add_header("Content-Type", "application/json")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.loads(r.read().decode() or "{}")
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "ignore")[:300]
                if e.code in (403, 429, 502, 503) and attempt < 3:
                    time.sleep(4 * (attempt + 1)); continue
                raise RuntimeError("GitHub が %d を返しました: %s" % (e.code, msg))
            except Exception as e:
                if attempt < 3: time.sleep(3); continue
                raise
        raise RuntimeError("GitHub につながりません")

    def check(self):
        me = self._req("/user")
        repo = self._req("/repos/%s/%s" % (self.o, self.r))
        return me.get("login"), repo.get("default_branch") or "main"

    def head(self):
        """いまのブランチの先頭（commit と tree）"""
        ref = self._req("/repos/%s/%s/git/ref/heads/%s" % (self.o, self.r, self.b))
        sha = ref["object"]["sha"]
        commit = self._req("/repos/%s/%s/git/commits/%s" % (self.o, self.r, sha))
        return sha, commit["tree"]["sha"]

    def remote_files(self, tree_sha, prefix="", depth=0):
        """GitHub 側にあるファイルの一覧（パス → 中身のSHA）。
           ファイルが多いと一覧が途中で切れるので、
           そのときはフォルダを1つずつたどって集め直します。"""
        t = self._req("/repos/%s/%s/git/trees/%s?recursive=1" % (self.o, self.r, tree_sha))
        out = {}
        if not t.get("truncated"):
            for e in t.get("tree", []):
                if e.get("type") == "blob":
                    out[(prefix + e["path"]) if prefix else e["path"]] = e["sha"]
            return out, False
        # 切れていたので、この階層だけ見て、フォルダは中へ入る
        t2 = self._req("/repos/%s/%s/git/trees/%s" % (self.o, self.r, tree_sha))
        for e in t2.get("tree", []):
            path = (prefix + e["path"]) if prefix else e["path"]
            if e.get("type") == "blob":
                out[path] = e["sha"]
            elif e.get("type") == "tree" and depth < 6:
                sub, _ = self.remote_files(e["sha"], path + "/", depth + 1)
                out.update(sub)
        return out, False

    def put_blob(self, data: bytes):
        r = self._req("/repos/%s/%s/git/blobs" % (self.o, self.r),
                      {"content": base64.b64encode(data).decode(), "encoding": "base64"})
        return r["sha"]

    def make_tree(self, base_tree, entries):
        r = self._req("/repos/%s/%s/git/trees" % (self.o, self.r),
                      {"base_tree": base_tree, "tree": entries})
        return r["sha"]

    def commit(self, msg, tree, parent):
        r = self._req("/repos/%s/%s/git/commits" % (self.o, self.r),
                      {"message": msg, "tree": tree, "parents": [parent]})
        return r["sha"]

    def move_branch(self, sha):
        self._req("/repos/%s/%s/git/refs/heads/%s" % (self.o, self.r, self.b),
                  {"sha": sha, "force": False}, method="PATCH")


# --------------------------------------------------------- ファイル集め
def git_blob_sha(data: bytes) -> str:
    """Git が付けるのと同じ SHA を計算する（変わったかどうかの判定に使う）"""
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()

def collect(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__", ".git", "node_modules")]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            if any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(fn, p) for p in SKIP): continue
            try:
                with open(full, "rb") as f: data = f.read()
            except Exception: continue
            out[rel] = data
    return out


# --------------------------------------------------------------- 画面
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP)
        self.geometry("760x560")
        self.minsize(700, 520)
        self.conf = load_conf()
        self.q = queue.Queue()
        self.busy = False
        self._build()
        self.after(120, self._pump)

    def _build(self):
        pad = {"padx": 10, "pady": 5}
        top = ttk.LabelFrame(self, text=" 1. 上げる先（はじめの1回だけ） ")
        top.pack(fill="x", **pad)
        self.v_owner = tk.StringVar(value=self.conf.get("owner", ""))
        self.v_repo = tk.StringVar(value=self.conf.get("repo", ""))
        self.v_branch = tk.StringVar(value=self.conf.get("branch", "main"))
        self.v_token = tk.StringVar(value=self.conf.get("token", ""))
        g = ttk.Frame(top); g.pack(fill="x", padx=8, pady=6)
        def row(r, label, var, show=None, width=30):
            ttk.Label(g, text=label).grid(row=r, column=0, sticky="w", pady=3)
            e = ttk.Entry(g, textvariable=var, width=width, show=show)
            e.grid(row=r, column=1, sticky="we", padx=6)
            return e
        g.columnconfigure(1, weight=1)
        row(0, "GitHub のユーザー名", self.v_owner)
        row(1, "リポジトリ名", self.v_repo)
        row(2, "ブランチ", self.v_branch, width=14)
        row(3, "アクセストークン", self.v_token, show="*")
        b = ttk.Frame(g); b.grid(row=4, column=1, sticky="w", pady=4)
        ttk.Button(b, text="つながるか試す", command=self.on_test).pack(side="left")
        ttk.Button(b, text="トークンの作り方", command=self.on_help).pack(side="left", padx=6)

        mid = ttk.LabelFrame(self, text=" 2. 上げるフォルダ ")
        mid.pack(fill="x", **pad)
        self.v_dir = tk.StringVar(value=self.conf.get("dir", ""))
        f = ttk.Frame(mid); f.pack(fill="x", padx=8, pady=6)
        ttk.Entry(f, textvariable=self.v_dir).pack(side="left", fill="x", expand=True)
        ttk.Button(f, text="えらぶ…", command=self.on_pick).pack(side="left", padx=6)

        act = ttk.LabelFrame(self, text=" 3. 反映する ")
        act.pack(fill="x", **pad)
        a = ttk.Frame(act); a.pack(fill="x", padx=8, pady=8)
        self.b_diff = ttk.Button(a, text="① 変わったものだけ上げる（おすすめ）",
                                 command=lambda: self.run(False))
        self.b_diff.pack(side="left")
        self.b_all = ttk.Button(a, text="② ぜんぶ入れ替える（古いファイルも消す）",
                                command=lambda: self.run(True))
        self.b_all.pack(side="left", padx=8)
        self.v_dry = tk.BooleanVar(value=True)
        ttk.Checkbutton(a, text="下見だけ（まだ上げない）", variable=self.v_dry).pack(side="left", padx=10)

        self.pb = ttk.Progressbar(self, mode="determinate")
        self.pb.pack(fill="x", padx=10)
        self.log = tk.Text(self, height=16, wrap="word", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, padx=10, pady=8)
        self.say("準備ができました。\n"
                 "はじめての方は、上の «トークンの作り方» を押してください。\n")

    # -------------------------------------------------- 画面への書き出し
    def say(self, s):
        self.log.insert("end", s if s.endswith("\n") else s + "\n")
        self.log.see("end")

    def _pump(self):
        try:
            while True:
                kind, val = self.q.get_nowait()
                if kind == "log": self.say(val)
                elif kind == "pb": self.pb["value"] = val
                elif kind == "max": self.pb["maximum"] = val
                elif kind == "done":
                    self.busy = False
                    self.b_diff.state(["!disabled"]); self.b_all.state(["!disabled"])
                elif kind == "err":
                    messagebox.showerror(APP, val)
        except queue.Empty:
            pass
        self.after(120, self._pump)

    def L(self, s): self.q.put(("log", s))

    # -------------------------------------------------------- ボタンたち
    def on_pick(self):
        d = filedialog.askdirectory(title="上げるフォルダをえらんでください")
        if d: self.v_dir.set(d)

    def on_help(self):
        messagebox.showinfo(APP,
            "GitHub のアクセストークンの作り方\n\n"
            "1) GitHub にログインし、右上のアイコン → Settings\n"
            "2) 左のいちばん下 → Developer settings\n"
            "3) Personal access tokens → Tokens (classic) → Generate new token (classic)\n"
            "4) Note に「tsg uploader」など好きな名前を入れる\n"
            "5) Expiration（期限）は 90 days などお好みで\n"
            "6) Select scopes で «repo» にチェック（これだけでOK）\n"
            "7) いちばん下の Generate token を押す\n"
            "8) 表示された ghp_ で始まる文字列をコピーし、この画面に貼る\n\n"
            "※ トークンは «パスワードと同じ» です。人に見せないでください。\n"
            "※ この画面に入れた内容は、ご自分のパソコンの中だけに保存されます。")

    def on_test(self):
        try:
            gh = GH(self.v_token.get().strip(), self.v_owner.get().strip(),
                    self.v_repo.get().strip(), self.v_branch.get().strip() or "main")
            who, default = gh.check()
            self.say("✓ つながりました。ログイン名: %s ／ 既定のブランチ: %s" % (who, default))
            self._save()
        except Exception as e:
            self.say("✕ つながりません: %s" % e)
            messagebox.showerror(APP, str(e))

    def _save(self):
        self.conf.update({"owner": self.v_owner.get().strip(), "repo": self.v_repo.get().strip(),
                          "branch": self.v_branch.get().strip() or "main",
                          "token": self.v_token.get().strip(), "dir": self.v_dir.get().strip()})
        save_conf(self.conf)

    def run(self, replace_all):
        if self.busy: return
        d = self.v_dir.get().strip()
        if not os.path.isdir(d):
            messagebox.showwarning(APP, "上げるフォルダをえらんでください。"); return
        if not (self.v_token.get().strip() and self.v_owner.get().strip() and self.v_repo.get().strip()):
            messagebox.showwarning(APP, "ユーザー名・リポジトリ名・トークンを入れてください。"); return
        if replace_all and not self.v_dry.get():
            if not messagebox.askyesno(APP,
                "GitHub 側にあって、こちらに無いファイルは «消えます»。\n進めてよろしいですか？"):
                return
        self._save()
        self.busy = True
        self.b_diff.state(["disabled"]); self.b_all.state(["disabled"])
        self.log.delete("1.0", "end")
        threading.Thread(target=self._work, args=(d, replace_all), daemon=True).start()

    # ------------------------------------------------------------ 本体
    def _work(self, root, replace_all):
        try:
            gh = GH(self.v_token.get().strip(), self.v_owner.get().strip(),
                    self.v_repo.get().strip(), self.v_branch.get().strip() or "main")
            self.L("■ 手元のファイルを数えています…")
            local = collect(root)
            self.L("   %d 個 / %.1f MB" % (len(local), sum(len(v) for v in local.values()) / 1048576))

            self.L("■ GitHub 側を見ています…")
            head_sha, tree_sha = gh.head()
            remote, truncated = gh.remote_files(tree_sha)
            if truncated:
                self.L("   ※ 一覧が途中までです（ファイルが多いため）。")
            self.L("   %d 個" % len(remote))

            # 変わったもの・増えたもの・消すもの
            add, upd, same = [], [], 0
            for rel, data in local.items():
                sha = git_blob_sha(data)
                if rel not in remote: add.append(rel)
                elif remote[rel] != sha: upd.append(rel)
                else: same += 1
            dele = [p for p in remote if p not in local] if replace_all else []

            self.L("")
            self.L("■ 変わりぶん")
            self.L("   新しく増える : %d 個" % len(add))
            self.L("   中身が変わる : %d 個" % len(upd))
            self.L("   そのまま     : %d 個" % same)
            self.L("   消す         : %d 個" % len(dele))
            for p in (add + upd)[:12]: self.L("     ＋ " + p)
            if len(add) + len(upd) > 12: self.L("     …ほか %d 個" % (len(add) + len(upd) - 12))
            for p in dele[:8]: self.L("     － " + p)
            if len(dele) > 8: self.L("     …ほか %d 個" % (len(dele) - 8))

            if not (add or upd or dele):
                self.L("\n✓ 変わったところはありません。何もしませんでした。")
                self.q.put(("done", 1)); return

            if self.v_dry.get():
                self.L("\n（下見だけの設定なので、ここで止めます。"
                       "実際に上げるときは «下見だけ» のチェックを外してください）")
                self.q.put(("done", 1)); return

            send = add + upd
            self.q.put(("max", max(1, len(send))))
            self.L("\n■ ファイルを送っています…")
            entries = []
            for i, rel in enumerate(send, 1):
                data = local[rel]
                try:
                    txt = data.decode("utf-8")
                    entries.append({"path": rel, "mode": "100644", "type": "blob", "content": txt})
                except UnicodeDecodeError:
                    sha = gh.put_blob(data)          # 画像などはそのまま登録
                    entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": sha})
                if i % 25 == 0 or i == len(send):
                    self.q.put(("pb", i))
                    self.L("   %d / %d" % (i, len(send)))

            for rel in dele:
                entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": None})

            self.L("■ まとめて反映しています…")
            # 一度に送る量が多すぎると失敗するので、200件ずつ tree を重ねる。
            # 升目のように何千枚もあるときは、ここが何十回かに分かれます。
            base = tree_sha
            CH = 200
            self.q.put(("max", max(1, len(entries))))
            for i in range(0, len(entries), CH):
                for attempt in range(4):
                    try:
                        base = gh.make_tree(base, entries[i:i + CH]); break
                    except Exception as ex:
                        if attempt == 3: raise
                        self.L("   （もう一度ためします: %s）" % str(ex)[:60])
                        time.sleep(5 * (attempt + 1))
                self.q.put(("pb", min(i + CH, len(entries))))
                self.L("   反映 %d / %d" % (min(i + CH, len(entries)), len(entries)))
            msg = "アップローダーから反映（＋%d 変更%d 削除%d）" % (len(add), len(upd), len(dele))
            c = gh.commit(msg, base, head_sha)
            gh.move_branch(c)

            self.L("\n✓ 完了しました。コミット: %s" % c[:8])
            self.L("   2〜3分で公開ページに反映されます。")
            self.L("   https://%s.github.io/%s/" % (gh.o, gh.r))
        except Exception as e:
            self.L("\n✕ うまくいきませんでした: %s" % e)
            self.q.put(("err", str(e)))
        finally:
            self.q.put(("done", 1))


if __name__ == "__main__":
    App().mainloop()
