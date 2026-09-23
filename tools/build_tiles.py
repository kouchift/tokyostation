# -*- coding: utf-8 -*-
"""
スポットを «地図の升目（タイル）» に分けて、JSON で保存する。

■ なぜ分けるのか
  いまは23区ぶんのスポットを最初にぜんぶ読んでいる。
  実際に見ているのは画面に入っている範囲だけなので、
  «見えている升目とその周り» だけを読むようにすれば、最初に読む量が減る。

■ 升目の切りかた
  0.02度ごと（およそ 東西1.8km × 南北2.2km）。
  複数の区にまたがって見ていても、升目は区に関係なく切ってあるので、
  «またがっているぶんの升目» がすべて読まれる。区の境目で欠けることはない。

■ 形式
  data/tiles/index.json  … どの升目にいくつ入っているか
  data/tiles/t_<x>_<y>.json … その升目のスポット

  出典は元のデータのまま（各ファイルの先頭に記載）。
"""
import json, io, os, math, collections, re

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
CELL = 0.02

def load_js(path, var):
    s = io.open(path, encoding="utf-8").read()
    i = s.index(var + " = ") + len(var + " = ")
    j = s.index(";\n", i)
    return json.loads(s[i:j])

rows = []          # {g, n, la, lo, ...}
def add(g, n, la, lo, **kw):
    o = {"g": g, "n": n, "la": round(la, 5), "lo": round(lo, 5)}
    for k, v in kw.items():
        if v not in (None, "", []): o[k] = v
    rows.append(o)

# --- 東京都オープンデータ（いちばん大きい） ---
try:
    OD = load_js("data/tokyo_od.js", "RG.OD")
    A = {"museum2": "museum", "park2": "park"}
    for gid, lst in OD.items():
        for r in lst:
            add(A.get(gid, gid), r.get("n") or "", r["la"], r["lo"],
                ad=r.get("ad"), no=r.get("no"), st=r.get("st"), sd=r.get("sd"),
                org=r.get("org"), od=1)
    print("東京都OD", sum(len(v) for v in OD.values()))
except Exception as e: print("OD なし", e)

# --- チェーン店 ---
try:
    BR = {b["id"]: b for b in load_js("data/chains.js", "RG.CHAIN_BRANDS")}
    for r in load_js("data/chains.js", "RG.CHAIN_ROWS"):
        b = BR.get(r[0])
        if not b: continue
        add(b["cat"], r[3] or b["n"], r[1], r[2],
            t=b["n"], brand=b["id"], bc=b["c"], be=b["e"], chain=1)
    print("チェーン店 done")
except Exception as e: print("chains なし", e)

# --- くらしの10ジャンル ---
try:
    O10 = load_js("data/osm10.js", "RG.OSM10")
    M10 = load_js("data/osm10.js", "RG.OSM10_META")
    for gid, lst in O10.items():
        m = M10.get(gid, {})
        for r in lst:
            o = {k: r[k] for k in ("open", "oper", "fee", "emer", "phon", "webs", "capa", "spor", "desc") if r.get(k)}
            add(gid, r.get("n") or m.get("label", ""), r["la"], r["lo"],
                t=m.get("label"), be=m.get("e"), bc=m.get("c"), osm10=o, gid=gid)
    print("くらし10 done")
except Exception as e: print("osm10 なし", e)

# --- 升目に振り分ける ---
tiles = collections.defaultdict(list)
for r in rows:
    tiles[(int(math.floor(r["lo"] / CELL)), int(math.floor(r["la"] / CELL)))].append(r)

os.makedirs("data/tiles", exist_ok=True)
for f in os.listdir("data/tiles"):
    if f.startswith("t_") or f == "index.json": os.remove(os.path.join("data/tiles", f))

idx = {}
for (x, y), lst in sorted(tiles.items()):
    name = "t_%d_%d.json" % (x, y)
    io.open("data/tiles/" + name, "w", encoding="utf-8").write(
        json.dumps(lst, ensure_ascii=False, separators=(",", ":")))
    idx["%d_%d" % (x, y)] = len(lst)

io.open("data/tiles/index.json", "w", encoding="utf-8").write(json.dumps({
    "cell": CELL, "count": len(rows), "tiles": idx,
    "note": "0.02度ごとの升目。区にまたがって見ていても、見えている升目がすべて読まれます。"
}, ensure_ascii=False))

tot = sum(os.path.getsize("data/tiles/" + f) for f in os.listdir("data/tiles"))
big = sorted(idx.items(), key=lambda kv: -kv[1])[:5]
print("升目 %d 枚 / スポット %d 件 / 合計 %.0f KB / 1枚あたり平均 %.1f KB"
      % (len(idx), len(rows), tot / 1024, tot / 1024 / max(1, len(idx))))
print("多い升目:", big)
