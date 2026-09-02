# -*- coding: utf-8 -*-
"""
くらしの施設を «関東1都6県» ぶんに広げる。

■ これまでの問題
  地図は関東に広げたのに、スポットは東京23区ぶんのままだった。
  埼玉や千葉へ地図を動かしても、トイレもコンビニも何も出なかった。

■ 広げかた
  OpenStreetMap から関東ぜんぶを取り（59,150件）、
  «升目» に分けて置く。地図を動かすと、見えている升目だけを読む。
  これで、範囲を広げても最初に読む量は増えない。

  升目は 0.02度（およそ 東西1.8km × 南北2.2km）ごと。
  区や県に関係なく切ってあるので、またいで見ていても欠けない。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, math, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
CELL = 0.02
life = json.load(open("/tmp/poi/kanto_life.json", encoding="utf-8"))

# OSM の種類 → このアプリのジャンル
MAP = {"toilets": "toilet", "convenience": "cvs", "pharmacy": "pharm",
       "hospital": "hosp", "clinic": "hosp", "bank": "atm",
       "post_office": "post", "drinking_water": "water", "police": "police"}
rows = []
for k, lst in life.items():
    g = MAP.get(k)
    if not g: continue
    for r in lst:
        o = {"g": g, "n": r.get("n") or "", "la": r["la"], "lo": r["lo"]}
        if r.get("open"): o["open"] = r["open"]
        if r.get("phon"): o["phon"] = r["phon"]
        rows.append(o)
print("関東のくらしの施設: %d件" % len(rows))
print(collections.Counter(r["g"] for r in rows))

# もとの23区ぶん（升目にすでに入っているもの）も混ぜる
try:
    old = []
    for f in os.listdir("data/tiles"):
        if f.startswith("t_"):
            old += json.load(open("data/tiles/" + f, encoding="utf-8"))
    print("これまでの升目のスポット: %d件" % len(old))
    rows = old + rows
except Exception as e:
    print("これまでの升目が読めません:", e)

# 同じ場所の同じ種類は1つにする
seen, uniq = set(), []
for r in rows:
    k = (r["g"], round(r["la"], 4), round(r["lo"], 4))
    if k in seen: continue
    seen.add(k); uniq.append(r)
print("重なりを除いて: %d件" % len(uniq))

# 升目に分ける
tiles = collections.defaultdict(list)
for r in uniq:
    tiles[(int(math.floor(r["lo"] / CELL)), int(math.floor(r["la"] / CELL)))].append(r)

os.makedirs("data/tiles", exist_ok=True)
for f in os.listdir("data/tiles"):
    if f.startswith("t_") or f == "index.json": os.remove(os.path.join("data/tiles", f))

idx = {}
for (x, y), lst in sorted(tiles.items()):
    # ひとつの升目が大きくなりすぎないよう、多いところは間引く
    if len(lst) > 600:
        lst = sorted(lst, key=lambda r: (0 if r.get("n") else 1))[:600]
    io.open("data/tiles/t_%d_%d.json" % (x, y), "w", encoding="utf-8").write(
        json.dumps(lst, ensure_ascii=False, separators=(",", ":")))
    idx["%d_%d" % (x, y)] = len(lst)

io.open("data/tiles/index.json", "w", encoding="utf-8").write(json.dumps({
    "cell": CELL, "count": sum(idx.values()), "area": "関東1都6県", "tiles": idx,
    "note": "0.02度ごとの升目。県にまたがって見ていても、見えている升目がすべて読まれます。"
}, ensure_ascii=False))

tot = sum(os.path.getsize("data/tiles/" + f) for f in os.listdir("data/tiles"))
las = [r["la"] for r in uniq]; los = [r["lo"] for r in uniq]
print("\n升目 %d枚 / スポット %d件 / 合計 %.1f MB / 1枚あたり平均 %.1f KB"
      % (len(idx), sum(idx.values()), tot / 1048576, tot / 1024 / max(1, len(idx))))
print("範囲: 緯度 %.2f〜%.2f ／ 経度 %.2f〜%.2f"
      % (min(las), max(las), min(los), max(los)))
