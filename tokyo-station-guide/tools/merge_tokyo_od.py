# -*- coding: utf-8 -*-
"""
東京都オープンデータカタログ由来のデータを data/tokyo_od.js にまとめる。
・重複（同名かつ50m以内）をまとめる
・件数が多いジャンルは駅からの近さで上限をかける（地図が埋まらないように）
出典表示が必要（CC BY 4.0）なので、団体名を sources に残す。
"""
import json, io, os, math, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
src = json.load(open("/tmp/poi/tokyo_od.json", encoding="utf-8"))

CAP = {"toilet": 1400, "aed": 1000, "shelter": 0, "baby": 250, "wifi": 900,
       "cycle": 405, "sento": 0, "library": 120, "museum2": 90, "park2": 1200}

# 駅の座標（駅の近くにあるものを優先して残す）
net = io.open("data/network.js", encoding="utf-8").read()
i = net.index(" stations: ") + len(" stations: ")
STS = json.loads(net[i:net.index("\n", i)].rstrip(","))
CELL = 0.01
grid = collections.defaultdict(list)
for s in STS: grid[(int(s["la"]/CELL), int(s["lo"]/CELL))].append(s)

def hav_m(a, b):
    R = 6371000.0; r = math.radians
    dla, dlo = r(b[0]-a[0]), r(b[1]-a[1])
    x = math.sin(dla/2)**2 + math.cos(r(a[0]))*math.cos(r(b[0]))*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(x))

def nearest_station(la, lo):
    best = None
    ci, cj = int(la/CELL), int(lo/CELL)
    for i2 in range(ci-2, ci+3):
        for j2 in range(cj-2, cj+3):
            for s in grid.get((i2, j2), ()):
                d = hav_m((la, lo), (s["la"], s["lo"]))
                if best is None or d < best[1]: best = (s["n"], d)
    return best

out, meta = {}, {}
for gid, rows in src["data"].items():
    # 重複除去（同名 かつ 50m 以内）
    seen, uniq = [], []
    byname = collections.defaultdict(list)
    for r in rows:
        key = r["n"][:12]
        dup = False
        for q in byname[key]:
            if hav_m((r["la"], r["lo"]), (q["la"], q["lo"])) < 50: dup = True; break
        if dup: continue
        byname[key].append(r); uniq.append(r)
    # 駅からの近さで並べて上限
    scored = []
    for r in uniq:
        ns = nearest_station(r["la"], r["lo"])
        r["st"] = ns[0] if ns else None
        r["sd"] = int(ns[1]) if ns else 9999
        scored.append(r)
    scored.sort(key=lambda x: x["sd"])
    cap = CAP.get(gid, 600)
    if cap == 0: 
        print("%-8s スキップ（別ソースを使用）" % gid); out[gid] = []; meta[gid] = {"n":0,"kept":0,"orgs":[]}; continue
    kept = scored[:cap]
    out[gid] = [{"n": r["n"][:30], "la": round(r["la"], 5), "lo": round(r["lo"], 5),
                 "ad": (r["ad"] or None) and r["ad"][:34],
                 "no": (r["no"] or None) and r["no"][:34],
                 "st": r["st"], "sd": r["sd"], "org": r["org"]} for r in kept]
    orgs = sorted(set(r["org"] for r in kept))
    meta[gid] = {"n": len(uniq), "kept": len(kept), "orgs": orgs}
    print("%-8s 生 %5d → 重複除去 %5d → 採用 %4d / %d団体" % (gid, len(rows), len(uniq), len(kept), len(orgs)))

io.open("data/tokyo_od.js", "w", encoding="utf-8").write(
"""/* 東京都オープンデータカタログ由来の生活インフラ情報（自動生成: tools/merge_tokyo_od.py）
   n=名称 la/lo=緯度経度 ad=所在地 no=備考 st=最寄り駅 sd=最寄り駅までの直線距離(m) org=提供団体

   出典: 東京都オープンデータカタログサイト（https://portal.data.metro.tokyo.lg.jp/）
         各データセットのライセンスは クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）
         提供団体は各レコードの org と、下の RG.OD_META の orgs に記載しています。
   ※ 更新頻度は団体ごとに異なります。最新は各団体の公開データでご確認ください。
   ※ 地図が埋まらないよう、駅に近い順で件数に上限をかけています。
*/
""" + "RG.OD = %s;\nRG.OD_META = %s;\n"
      % (json.dumps(out, ensure_ascii=False, separators=(",", ":")),
         json.dumps(meta, ensure_ascii=False)))
print("合計", sum(len(v) for v in out.values()), "件 /", os.path.getsize("data/tokyo_od.js"), "bytes")
