#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""data/net.json: 新幹線しか辺のない大駅を、脇を通る在来線の辺に «はめ込む»（v80、冪等）。

Wikidata の隣接データでは 京都・新大阪 の在来線ホームが抜けていて、東海道本線が
西大路–山科、東淀川–大阪 と駅を飛ばしてつながっている。そのため 東京→大阪 が
「米原で在来線に乗り換え 30 駅各停」になっていた。
新幹線の辺しかない駅（乗り換え辺は除く）のうち、在来線の辺が 300m 以内を通り、
その辺の途中（5〜95%）にあるものは、辺を 2 つに割って駅を入れる。
（本庄早稲田・新富士・岐阜羽島など、本当に新幹線単独の駅には近くを通る在来線がないので変わらない）
"""
import json, io, os, math, sys, collections, re
RX_JR = re.compile(r"本線|^JR|東海道線|関西線|奈良線|湖西線|おおさか東線|中央線|山陰線|阪和線|大和路線|学研都市線|嵯峨野線|琵琶湖線|宇都宮線|高崎線|常磐線|横須賀線|京葉線|埼京線|上野東京ライン|湘南新宿ライン")
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "..", "data", "net.json")
DRY = "--dry" in sys.argv
net = json.load(io.open(P, encoding="utf-8"))
L, st, ed = net["lines"], net["stations"], net["edges"]
XFER = {i for i, l in enumerate(L) if l[0] == "乗り換え"}
SHIN = {i for i, l in enumerate(L) if "新幹線" in l[0]}
def seg_dist(p, a, b):
    kx = math.cos(math.radians(p[0])) * 111.32; ky = 110.57
    ax, ay = (a[1] - p[1]) * kx, (a[0] - p[0]) * ky; bx, by = (b[1] - p[1]) * kx, (b[0] - p[0]) * ky
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, -(ax * dx + ay * dy) / L2))
    return math.hypot(ax + t * dx, ay + t * dy), t
lines_at = collections.defaultdict(set)
for e in ed: lines_at[e[0]].add(e[2]); lines_at[e[1]].add(e[2])
targets = [i for i in range(len(st)) if lines_at.get(i) and not (lines_at[i] - XFER - SHIN) and (lines_at[i] & SHIN)]
added, removed = [], set()
new_edges = []
for i in targets:
    s = st[i]
    for k, e in enumerate(ed):
        if k in removed or e[2] in XFER or e[2] in SHIN or i in e[:2]: continue
        if not RX_JR.search(L[e[2]][0]): continue                   # 新幹線駅の在来線ホームは JR。地下鉄・私鉄は乗り換え辺で
        a, b = st[e[0]], st[e[1]]
        ab = seg_dist(a[2:4], b[2:4], b[2:4])[0]
        if ab < 2.0 or ab > 60: continue                             # 駅が抜けているのは長い辺。壊れた辺は触らない
        # 短い辺（1km 未満）は割らない。長い辺の途中にあるときだけ
        d, t = seg_dist((s[2], s[3]), a[2:4], b[2:4])
        if d < 0.3 and 0.05 < t < 0.95:
            removed.add(k)
            new_edges.append([e[0], i, e[2]]); new_edges.append([i, e[1], e[2]])
            if e[2] not in s[4]: s[4].append(e[2])
            added.append((s[1], a[1], b[1], L[e[2]][0], round(d, 2)))
for x in added: print("  はめ込み: %s を %s–%s（%s, %.2fkm）" % x)
print("%d 辺を割って %d 駅を入れた" % (len(removed), len(set(x[0] for x in added))))
if DRY or not added: sys.exit(0)
ed2 = [e for k, e in enumerate(ed) if k not in removed] + new_edges
cnt = collections.Counter(e[2] for e in ed2)
for i, l in enumerate(L): l[2] = cnt.get(i, 0)
net["edges"] = ed2
json.dump(net, io.open(P, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", os.path.normpath(P), "edges", len(ed2))
