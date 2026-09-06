#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/net.json の新幹線を «つながった状態» に直す（v75〜）

■ なにが壊れていたか
  ・元データ（OSM 由来）では新幹線の区間が飛び飛びで、新横浜–小田原・米原–京都–新大阪 などが無かった
  ・新大阪・名古屋・京都・博多・仙台 などの大駅が «乗り換え» だけのハブ節点で、新幹線の路線に属していなかった
  ・「新幹線名古屋」という別節点が名古屋と分かれていた
  ・未開業区間（北陸新幹線 敦賀–新大阪、北海道新幹線 新函館北斗–札幌、中央新幹線）の節点・区間が入っていた
  → 経路探索で新幹線が使われず、交通費の候補にも出なかった

■ やること
  data/shinkansen.js の駅順（各路線）どおりに区間を張り直し、駅の所属路線に新幹線を足す。
  未開業の節点は取り除く（索引を詰め直す）。秋田・山形新幹線（ミニ新幹線）、博多南線も路線として持つ。
  build_netjson.py で net.json を作り直したあとは、このスクリプトをもう一度かける。
"""
import json, re, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NET = os.path.join(ROOT, "data", "net.json")

def hav(a, b):
    R = 6371.0088
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

# 路線名 → 駅順（data/shinkansen.js と同じ）
# data/shinkansen.js は JS なので node に読ませて JSON に落とす
import subprocess
SK = json.loads(subprocess.check_output(["node", "-e",
    'var RG={}; eval(require("fs").readFileSync(%r,"utf8")); process.stdout.write(JSON.stringify(RG.SHINKANSEN));' % os.path.join(ROOT, "data", "shinkansen.js")]).decode("utf-8"))
LINES = {k: v["stations"] for k, v in SK["lines"].items()}
COLORS = {k: v.get("color", "#1e50a2") for k, v in SK["lines"].items()}
SK_POS = {s["n"]: (s["la"], s["lo"]) for s in SK["stations"]}

net = json.load(open(NET, encoding="utf-8"))
lines, stations, edges = net["lines"], net["stations"], net["edges"]
lname = [l[0] for l in lines]

# 1) 未開業の節点・路線を落とす
BOGUS_NODES = {"京田辺市附近", "北陸新幹線京都", "小浜市附近", "北陸新幹線新大阪", "新八雲", "長野県", "岐阜県", "新幹線名古屋"}
BOGUS_LINES = {"中央新幹線"}
keep = [i for i, s in enumerate(stations) if s[1] not in BOGUS_NODES]
remap = {old: new for new, old in enumerate(keep)}
stations = [stations[i] for i in keep]
edges = [[remap[e[0]], remap[e[1]], e[2]] for e in edges if e[0] in remap and e[1] in remap]
# 2) 新幹線の既存区間をいったん全部外す
shin_idx = {i for i, n in enumerate(lname) if "新幹線" in n or n == "博多南線"}
edges = [e for e in edges if e[2] not in shin_idx]
for s in stations:
    s[4] = [li for li in s[4] if li not in shin_idx]
# 3) 路線を用意（無ければ追加）
def line_index(name):
    if name in lname: return lname.index(name)
    lines.append([name, COLORS.get(name, "#1e50a2"), 0]); lname.append(name); return len(lines) - 1
# 4) 駅名 → 節点（同名が複数あるときは、乗降人員の大きい方＝索引の小さい方。ただし新幹線の位置に近いものを優先）
by_name = {}
for i, s in enumerate(stations):
    by_name.setdefault(s[1], []).append(i)
def pick(name):
    cands = by_name.get(name)
    if not cands:
        # 名前ゆれ（例: 新幹線側の駅名が「ガーラ湯沢」など）はそのまま新しい節点を作る
        la, lo = SK_POS[name]
        stations.append(["", name, la, lo, [], "", 0, "", 0, "", 0, 0])
        by_name[name] = [len(stations) - 1]
        return len(stations) - 1
    if len(cands) == 1: return cands[0]
    pos = SK_POS.get(name)
    if pos:
        cands = sorted(cands, key=lambda i: hav(pos, (stations[i][2], stations[i][3])))
        if hav(pos, (stations[cands[0]][2], stations[cands[0]][3])) < 2.5: return cands[0]
    return min(cands)
added = 0
for lname_, sts in LINES.items():
    li = line_index(lname_)
    idxs = [pick(n) for n in sts]
    for i in idxs:
        if li not in stations[i][4]: stations[i][4].append(li)
    # ガーラ湯沢は越後湯沢からの枝（列に混ぜず、越後湯沢とだけつなぐ）
    names = list(sts)
    if "ガーラ湯沢" in names:
        g = names.index("ガーラ湯沢"); gi = idxs[g]; yi = idxs[names.index("越後湯沢")]
        edges.append([yi, gi, li]); added += 1
        names.pop(g); idxs.pop(g)
    for a, b in zip(idxs, idxs[1:]):
        if a == b: continue
        edges.append([a, b, li]); added += 1
    lines[li][2] = len(idxs) - 1
# ガーラ湯沢（越後湯沢からの季節枝線）は駅順に含めているので上で処理済み
net["lines"], net["stations"], net["edges"] = lines, stations, edges
txt = json.dumps(net, ensure_ascii=False, separators=(",", ":"))
open(NET, "w", encoding="utf-8").write(txt)
print("stations", len(stations), "edges", len(edges), "shinkansen edges added", added, "bytes", len(txt.encode("utf-8")))
for k in LINES: print(" ", k, len(LINES[k]), "駅")
