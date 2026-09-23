# -*- coding: utf-8 -*-
"""
data/network.js → data/net.json（起動用のコンパクト版）
  ・駅は配列に詰める（キー名を省いて容量を減らす）
  ・明らかに壊れている区間（新幹線以外で 45km 超）を落とす
  ・JSON にすると script 評価より速く、fetch で並列に取れる
使い方: python3 tools/build_netjson.py
"""
import json, math, re, io, os
src = os.path.join(os.path.dirname(__file__), "..", "data", "network.js")
dst = os.path.join(os.path.dirname(__file__), "..", "data", "net.json")
s = io.open(src, encoding="utf-8").read()
j = json.loads(s[s.index("RG.NET = ") + 9:].strip().rstrip(";"))

def hav(a, b):
    R = 6371; r = math.pi / 180
    dla = (b["la"] - a["la"]) * r; dlo = (b["lo"] - a["lo"]) * r
    x = math.sin(dla / 2) ** 2 + math.cos(a["la"] * r) * math.cos(b["la"] * r) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

lines = [l["name"] for l in j["lines"]]
lidx = {n: i for i, n in enumerate(lines)}
for l in j["lines"]:
    pass
sidx = {}
S = []
for i, st in enumerate(j["stations"]):
    sidx[st["id"]] = i
    ls = [lidx[x] for x in st.get("ls", []) if x in lidx]
    # id(名前と同じなら空), n, la, lo, ls, k, pf, op, px, py, pxOps, jp
    S.append(["" if st["id"] == st["n"] else st["id"], st["n"], round(st["la"], 6), round(st["lo"], 6), ls, st.get("k", ""),
              st.get("pf", 0), st.get("op", ""), st.get("px", 0), st.get("py", ""), st.get("pxOps", 0),
              1 if st.get("jp") else 0])
by = {st["id"]: st for st in j["stations"]}
E = []; dropped = 0
for e in j["edges"]:
    a = by.get(e[0]); b = by.get(e[1])
    if not a or not b: continue
    d = hav(a, b)
    if d > 45 and "新幹線" not in (e[2] or ""):
        dropped += 1; continue
    E.append([sidx[e[0]], sidx[e[1]], lidx.get(e[2] or "", -1)])
out = {"source": j.get("source"), "area": j.get("area"),
       "lines": [[l["name"], l["color"], l.get("edges", 0)] for l in j["lines"]],
       "stations": S, "edges": E}
txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
io.open(dst, "w", encoding="utf-8").write(txt)
print("stations", len(S), "edges", len(E), "dropped(bogus >45km)", dropped, "bytes", len(txt.encode("utf-8")))
