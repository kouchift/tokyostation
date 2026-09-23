# -*- coding: utf-8 -*-
"""
関東の «見どころ» を地図に足す。

  ディズニーランド（千葉）、横浜国際総合競技場（神奈川）のように、
  都県をまたいだ行き先を出せるようにする。

  出典: Wikidata (CC0)
"""
import json, io, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
lm = json.load(open("/tmp/poi/kanto_landmarks.json", encoding="utf-8"))

# 種類 → 絵文字と色
T = {"テーマパーク": ("🎡", "#E4007F"), "城": ("🏯", "#7B4A12"),
     "神社": ("⛩️", "#C62828"), "寺": ("🛕", "#6D4C41"),
     "博物館": ("🏛️", "#5E35B1"), "公園": ("🌳", "#2E7D32"),
     "競技場": ("🏟️", "#0277BD"), "美術館": ("🎨", "#8E24AA"),
     "観光名所": ("📍", "#F0851E")}

# もとの23区のランドマークは残す（そのまま使われている）
try:
    s = io.open("data/landmarks.js", encoding="utf-8").read()
    i = s.index("RG.LANDMARKS_TOP = ") + len("RG.LANDMARKS_TOP = ")
    OLD = json.loads(s[i:s.index(";\n", i)])
except Exception as e:
    OLD = []; print("もとのランドマークが読めません:", e)
known = set(o.get("n") for o in OLD)

out = []
for r in lm:
    if r["n"] in known: continue
    e, c = T.get(r.get("t"), ("📍", "#F0851E"))
    o = {"n": r["n"], "la": r["la"], "lo": r["lo"], "t": r.get("t", ""), "e": e, "c": c}
    if r.get("sl"): o["sl"] = r["sl"]
    out.append(o)

io.open("data/kanto_lm.js", "w", encoding="utf-8").write(
"""/* 関東の見どころ（自動生成: tools/build_kanto_lm.py）
   n=名前 la/lo=座標 t=種類 e=絵文字 c=色 sl=Wikipediaの言語版の数（有名さの目安）

   東京23区ぶんのランドマーク（data/landmarks.js）と重ならないようにしています。
   出典: Wikidata (CC0)
*/
""" + "RG.KANTO_LM = %s;\n" % json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print("関東の見どころ %d件 / %.0f KB" % (len(out), os.path.getsize("data/kanto_lm.js") / 1024))
print(dict(collections.Counter(o["t"] for o in out)))
print("有名な順:", [o["n"] for o in sorted(out, key=lambda x: -(x.get("sl") or 0))[:8]])
