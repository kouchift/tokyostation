# -*- coding: utf-8 -*-
"""単一ファイル版 standalone.html を生成（配布・提出用）。
   index.html 内のローカル <link>/<script> をすべてインライン化し、
   さらに data/details/*.js を全部埋め込む（遅延ロードが不要になる）。
   実行: python3 tools/build_standalone.py"""
import io, os, re, glob
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

def read(p): return io.open(p, encoding="utf-8").read()

html = read("index.html")

def sub_link(m):
    p = m.group(1)
    return "<style>\n" + read(p) + "\n</style>" if os.path.exists(p) else m.group(0)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', sub_link, html)

def sub_script(m):
    p = m.group(1)
    return "<script>\n" + read(p) + "\n</script>" if os.path.exists(p) else m.group(0)
html = re.sub(r'<script src="([^"]+)"></script>', sub_script, html)

# 段階読み込み用のデータも、単一ファイル版では直接埋め込む
DATA = ["network", "config", "lines_meta", "genres", "score", "areas",
        "landmarks", "mappois", "heat", "admin", "relief", "poi", "descs",
        "tokyo_od2", "tokyo_od", "flood", "events", "chains", "user_pois"]
blob = "\n".join(read("data/%s.js" % d) for d in DATA if os.path.exists("data/%s.js" % d))
html = html.replace("<script>RG.startApp();</script>",
                    "<script>\n" + blob + "\n</script>\n<script>RG.startApp();</script>")

# 駅の詳細データを全部埋め込む（単一ファイルでは動的ロードできないため）
details = "\n".join(read(p) for p in sorted(glob.glob("data/details/*.js")))
html = html.replace("<script>RG.startApp();</script>",
                    "<script>\n" + details + "\n</script>\n<script>RG.startApp();</script>")

# 地形画像も data URI にして 1 ファイルに収める
import base64
for _rp, _mt in (("assets/relief.jpg", "image/jpeg"), ("assets/flood.png", "image/png")):
    if os.path.exists(_rp):
        _b = base64.b64encode(open(_rp, "rb").read()).decode()
        html = html.replace('"' + _rp + '"', '"data:' + _mt + ";base64," + _b + '"')

# standalone 版は全部が1ファイルに入っているので、段階読み込みは使わず即起動する
html = html.replace("<script>RG.startApp();</script>", "<script>RG.boot();</script>")

io.open("standalone.html", "w", encoding="utf-8").write(html)
left = re.findall(r'(?:src|href)="((?!http)[^"]+)"', html)
print("standalone.html", os.path.getsize(html and "standalone.html"), "bytes")
print("残った外部参照:", left or "なし")
