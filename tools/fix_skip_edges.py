#!/usr/bin/env python3
"""data/net.json の «飛び越し辺» を外す（v80）。

Wikidata の隣接駅データには、同じ路線で途中駅を飛ばして A–C を直接つなぐ辺が混ざる
（例: 西武池袋線 大泉学園–桜台 7.5km。石神井公園〜練馬を飛ばしている）。
経路探索では A→B→C の各駅経由と同じ距離なので所要時間は変わらないが、
・停車駅ごとの加減速・停車時間を数える v80 の所要時間モデルでは「急行」のように速く見えてしまう
・経路の駅列（PV・カード・地図の線）から途中駅が抜ける
ので、同じ路線の他の辺だけで A→…→C の経路（途中駅 1 つ以上、長さ 1.3 倍以内）がある辺は外す。
路線の «穴» を埋める橋渡しの辺（fix_gaps_net.py）は迂回路がないので残る。
何度実行しても同じ結果（冪等）。
"""
import json, heapq, math, sys, os, re
EXPRESS = re.compile(r"特急|ライナー|快速|急行|エクスプレス|アクセス|新幹線")
P = os.path.join(os.path.dirname(__file__), "..", "data", "net.json")
DRY = "--dry" in sys.argv

def hav(a, b):
    R = 6371.0088
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

net = json.load(open(P, encoding="utf-8"))
st, ed, L = net["stations"], net["edges"], net["lines"]
pos = [(s[2], s[3]) for s in st]
def km(e): return hav(pos[e[0]], pos[e[1]])
# 路線ごとの隣接
byline = {}
for i, e in enumerate(ed):
    byline.setdefault(e[2], []).append(i)
adj = {}
for i, e in enumerate(ed):
    adj.setdefault((e[2], e[0]), []).append((e[1], i)); adj.setdefault((e[2], e[1]), []).append((e[0], i))

def detour(line, a, b, skip, limit):
    """line 上で辺 skip を使わずに a→b。長さ limit 以内で途中駅ありなら距離を返す"""
    dist = {a: 0.0}; hops = {a: 0}; pq = [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e9): continue
        if u == b: return d if hops[u] >= 2 else None
        for v, ei in adj.get((line, u), []):
            if ei == skip: continue
            nd = d + km(ed[ei])
            if nd > limit: continue
            if nd < dist.get(v, 1e9): dist[v] = nd; hops[v] = hops[u] + 1; heapq.heappush(pq, (nd, v))
    return None

drop = []
for i, e in enumerate(ed):
    if e[2] < 0 or L[e[2]][0] == "乗り換え": continue
    if EXPRESS.search(L[e[2]][0]): continue      # 特急・ライナー・快速などの «列車種別の路線» は飛ばすのが本来の停車駅
    d = km(e)
    if d < 1.5: continue                       # 短い辺は飛び越しではない
    alt = detour(e[2], e[0], e[1], i, d * 1.3)
    if alt is not None: drop.append((i, d, alt))
print("skip edges:", len(drop), "of", len(ed))
for i, d, alt in sorted(drop, key=lambda x: -x[1])[:(200 if "--all" in sys.argv else 25)]:
    e = ed[i]; print("  %-24s %s – %s  %.2fkm (各駅経由 %.2fkm)" % (L[e[2]][0][:24], st[e[0]][1], st[e[1]][1], d, alt))
if DRY: sys.exit(0)
keep = set(range(len(ed))) - set(i for i, _, _ in drop)
net["edges"] = [e for i, e in enumerate(ed) if i in keep]
json.dump(net, open(P, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", P, "edges", len(net["edges"]))
