# -*- coding: utf-8 -*-
"""
駅の「地下の深さ」を作る。

■ 考え方
  OpenStreetMap のホーム（platform）には level タグが付いていることがある。
  level=-4 なら「地下4階」。これを駅ごとに集めて、いちばん深い階を採用する。

  メートルへの換算は、地下鉄の階高をおよそ 6.5m として推定している。
  （東京メトロ・都営の資料でおおむね 5〜8m。中間をとった）
  「地下◯階」は実データ、「およそ◯m」は推定値であることを画面にも明記する。

■ 出典
  © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, math, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

FLOOR_M = 6.5          # 地下1階ぶんの高さ（推定）

net = io.open("data/network.js", encoding="utf-8").read()
i = net.index(" stations: ") + len(" stations: ")
STS = json.loads(net[i:net.index("\n", i)].rstrip(","))

lv = json.load(open("/tmp/poi/levels.json", encoding="utf-8"))
print("ホームの level データ:", len(lv), "件")

def hav_m(a, b):
    R = 6371000.0; r = math.radians
    dla, dlo = r(b[0] - a[0]), r(b[1] - a[1])
    x = math.sin(dla / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

# 駅を格子に入れて、近いホームだけ突き合わせる
CELL = 0.004
grid = collections.defaultdict(list)
for s in STS:
    grid[(int(s["la"] / CELL), int(s["lo"] / CELL))].append(s)

best = {}          # 駅ID -> {lv, up, n}
for p in lv:
    ci, cj = int(p["la"] / CELL), int(p["lo"] / CELL)
    cand = []
    for a in range(ci - 1, ci + 2):
        for b in range(cj - 1, cj + 2):
            cand += grid.get((a, b), [])
    if not cand: continue
    near = min(cand, key=lambda s: hav_m((p["la"], p["lo"]), (s["la"], s["lo"])))
    d = hav_m((p["la"], p["lo"]), (near["la"], near["lo"]))
    if d > 420: continue                     # 遠すぎるものは別の駅とみなす
    e = best.setdefault(near["id"], {"lv": 0, "up": 0, "src": []})
    if p["lv"] < e["lv"]: e["lv"] = p["lv"]
    if p["lv"] > e["up"]: e["up"] = p["lv"]
    if p.get("line"): e["src"].append(p["line"])

out = {}
for sid, e in best.items():
    if e["lv"] >= 0 and e["up"] <= 0: continue
    o = {}
    if e["lv"] < 0:
        o["d"] = int(-e["lv"])                       # 地下 何階
        o["m"] = round(-e["lv"] * FLOOR_M, 1)        # およそ何メートル
    if e["up"] > 0:
        o["u"] = int(e["up"])                        # 高架 何階
    ls = sorted(set(x for x in e["src"] if x))
    if ls: o["l"] = ls[:3]
    out[sid] = o

deep = sorted([(k, v) for k, v in out.items() if v.get("d")], key=lambda x: -x[1]["d"])
io.open("data/depth.js", "w", encoding="utf-8").write(
"""/* 駅の深さ・高さ（自動生成: tools/build_depth.py）
   d = 地下 何階か（OpenStreetMap のホームの level タグから。実データ）
   m = およその深さ（メートル）。地下1階ぶんを 6.5m として計算した推定値
   u = 高架 何階か
   l = そのホームの路線名（OSM の表記）

   ※ 「地下◯階」は実データ、「およそ◯m」は推定です。正確な深さは各社の資料をご覧ください。
   出典: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.DEPTH = %s;\nRG.DEPTH_FLOOR_M = %s;\n"
      % (json.dumps(out, ensure_ascii=False, separators=(",", ":")), FLOOR_M))

print("深さ・高さのある駅:", len(out), "/", os.path.getsize("data/depth.js"), "bytes")
print("地下の深い駅トップ15:")
for k, v in deep[:15]:
    print("  %-14s 地下%d階 約%.1fm  %s" % (k, v["d"], v["m"], "・".join(v.get("l", []))[:28]))
print("高架:", sum(1 for v in out.values() if v.get("u")), "駅")
