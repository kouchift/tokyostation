#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/net.json の «同じ路線なのに切れている» 区間をつなぐ（v78〜）

■ なにが問題か
  元データ（Wikidata の隣駅情報）に抜けがあり、路線が途中で切れている。
  例: 札幌圏 347 駅・高知 297 駅・旭川・帯広・釧路・智頭急行・名鉄犬山線の一部 … が本土の路線網から孤立し、
      経路探索が「札幌には行けない」と答えていた（v77 時点で主成分 7,284 駅／全 10,974 駅）。

■ やりかた（機械的・保守的）
  路線ごとに、その路線に属する駅だけで «つながり» を調べ、切れているかたまり同士を
  «いちばん近い駅どうし» で結ぶ（距離 15km 以内。新幹線は対象外）。近いかたまりから順に、
  路線が 1 つにつながるか、15km 以内の候補が無くなるまで繰り返す。
  ・同名の別駅（例: 森＝北海道と大阪）が 1 つの節点に合体している場合は、遠い方の相手にはつながない。
  ・追加した区間は edges に (a, b, 路線番号) で足す。既存の区間はいじらない。

使い方: python3 tools/fix_gaps_net.py [--max-km 15] [--dry]
"""
import json, math, os, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NET = os.path.join(ROOT, "data", "net.json")
MAXKM = float(sys.argv[sys.argv.index("--max-km") + 1]) if "--max-km" in sys.argv else 15.0
DRY = "--dry" in sys.argv


def hav(a, b):
    R = 6371.0088
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


net = json.load(open(NET, encoding="utf-8"))
lines, S, E = net["lines"], net["stations"], net["edges"]
pos = [(s[2], s[3]) for s in S]
name = [s[1] for s in S]
by_line = collections.defaultdict(set)
for i, s in enumerate(S):
    for li in s[4]:
        by_line[li].add(i)
adj_line = collections.defaultdict(lambda: collections.defaultdict(set))
for a, b, li in E:
    adj_line[li][a].add(b)
    adj_line[li][b].add(a)


def comps(nodes, adj):
    seen, out = set(), []
    for n in nodes:
        if n in seen:
            continue
        q, c = [n], []
        seen.add(n)
        while q:
            u = q.pop()
            c.append(u)
            for v in adj.get(u, ()):
                if v in nodes and v not in seen:
                    seen.add(v)
                    q.append(v)
        out.append(c)
    return out


import statistics, re
JUNK = re.compile(r"信号場|操車場|貨物|車両基地|検車区|保線|工場|仮乗降場")
added = []
# 手で直す: 新宿は元データで区間が 1 本も無かった（世界一の乗降客数の駅が経路探索から消えていた）
FORCE = {"新宿": [("山手線", "新大久保"), ("山手線", "代々木"), ("中央本線", "大久保"), ("中央本線", "代々木"), ("中央本線", "中野"), ("中央本線", "四ツ谷"),
                  ("JR埼京線", "池袋"), ("JR埼京線", "渋谷"), ("湘南新宿ライン", "池袋"), ("湘南新宿ライン", "渋谷"), ("京王線", "笹塚"), ("京王新線", "初台"),
                  ("小田急小田原線", "南新宿"), ("小田急電鉄小田原線", "南新宿"), ("東京メトロ丸ノ内線", "新宿三丁目"), ("東京メトロ丸ノ内線", "西新宿"),
                  ("都営新宿線", "新宿三丁目"), ("都営地下鉄新宿線", "新宿三丁目"), ("都営大江戸線", "都庁前"), ("都営大江戸線", "代々木"), ("都営地下鉄大江戸線", "都庁前"), ("都営地下鉄大江戸線", "代々木")]}
lidx = {l[0]: i for i, l in enumerate(lines)}
# 新宿_1（JR ほか 12 路線）と 新宿_2（新金貨物線・葛飾区の «にいじゅく»）の座標が入れ替わっていたので戻す
_sj = {S[i][0]: i for i in range(len(S)) if S[i][1] == "新宿"}
if "新宿_1" in _sj and "新宿_2" in _sj:
    i1, i2 = _sj["新宿_1"], _sj["新宿_2"]
    if S[i1][2] > 35.75 and S[i2][2] < 35.70:
        S[i1][2], S[i2][2] = S[i2][2], S[i1][2]
        S[i1][3], S[i2][3] = S[i2][3], S[i1][3]
        pos[i1], pos[i2] = (S[i1][2], S[i1][3]), (S[i2][2], S[i2][3])
        print("新宿の座標を入れ替えました", pos[i1], pos[i2], file=sys.stderr)
for nm, pairs in FORCE.items():
    srcs = [i for i, s in enumerate(S) if s[1] == nm and not JUNK.search(s[1])]
    srcs = [i for i in srcs if any(lines[li][0] in dict(pairs) or True for li in S[i][4])]
    if not srcs:
        continue
    # 路線を多く持つ方の同名駅（本体）
    a = max(srcs, key=lambda i: len(S[i][4]))
    for lname, nb in pairs:
        li = lidx.get(lname)
        if li is None:
            continue
        cands = [i for i, s in enumerate(S) if s[1] == nb and li in s[4]]
        if not cands:
            continue
        b = min(cands, key=lambda i: hav(pos[a], pos[i]))
        if hav(pos[a], pos[b]) > 6:
            continue
        if li not in S[a][4]:
            S[a][4].append(li)
        if b not in adj_line[li][a]:
            adj_line[li][a].add(b); adj_line[li][b].add(a); added.append((a, b, li, hav(pos[a], pos[b])))
for li, nodes in by_line.items():
    lname = lines[li][0]
    if "新幹線" in lname or lname == "乗り換え" or "貨物" in lname or len(nodes) < 2:
        continue
    adj = adj_line[li]
    good = set(n for n in nodes if not JUNK.search(name[n]))
    # この路線の «ふつうの駅間» の長さ（中央値）→ 橋渡しの上限に使う
    lens = [hav(pos[a], pos[b]) for a in good for b in adj.get(a, ()) if b in good and a < b]
    med = statistics.median(lens) if lens else 3.0
    cap = min(MAXKM, max(3.0, med * 3 + 0.5))
    cap1 = min(cap, med * 2 + 0.5)
    # 1) 孤立した 1 駅（その路線の区間を 1 本も持たない）を、いちばん近い駅とその隣駅の «あいだ» に差し込む
    for n in sorted(good):
        if adj.get(n):
            continue
        cands = sorted(((hav(pos[n], pos[m]), m) for m in good if m != n and adj.get(m)), key=lambda t: t[0])
        if not cands or cands[0][0] > cap1:
            continue
        d1, u = cands[0]
        best = None
        for v in adj[u]:
            if v not in good:
                continue
            duv = hav(pos[u], pos[v]); dnv = hav(pos[n], pos[v])
            if d1 + dnv <= duv * 1.6 + 0.3 and (best is None or dnv < best[0]):
                best = (dnv, v)
        adj[u].add(n); adj[n].add(u); added.append((n, u, li, d1))
        if best:
            v = best[1]; adj[v].add(n); adj[n].add(v); added.append((n, v, li, best[0]))
    # 2) 切れているかたまり同士を、いちばん近い駅どうしで結ぶ（両端とも区間を持つ駅に限る）
    while True:
        cs = [c for c in comps(good, adj) if len(c) >= 2]
        if len(cs) <= 1:
            break
        best = None
        for i in range(len(cs)):
            for j in range(i + 1, len(cs)):
                for a in cs[i]:
                    if not adj.get(a):
                        continue
                    pa = pos[a]
                    for b in cs[j]:
                        if not adj.get(b):
                            continue
                        d = hav(pa, pos[b])
                        if d <= cap and (best is None or d < best[0]):
                            best = (d, a, b)
        if not best:
            break
        d, a, b = best
        adj[a].add(b); adj[b].add(a)
        added.append((a, b, li, d))

print("追加した区間:", len(added), file=sys.stderr)
by_l = collections.Counter(lines[x[2]][0] for x in added)
for l, n in by_l.most_common(25):
    print("  ", l, n, file=sys.stderr)
print("例:", [(name[a], name[b], lines[li][0], round(d, 1)) for a, b, li, d in added[:12]], file=sys.stderr)

# 未開業の区間・駅を経路探索から外す（開業予定年が来るまで）
import datetime
NOW = datetime.date.today().year
FUTURE_EDGES = [("品川", "白金高輪", "東京メトロ南北線")]   # 南北線 品川延伸（2030 年代開業予定）
future_st = set(i for i, st in enumerate(S) if str(st[7]).isdigit() and int(st[7]) > NOW)
def is_future(e):
    a, b, li = e
    if a in future_st or b in future_st:
        return True
    ln = lines[li][0] if li >= 0 else ""
    return any((S[a][1], S[b][1]) in ((x, y), (y, x)) and ln == l for x, y, l in FUTURE_EDGES)
removed = [e for e in E if is_future(e)]
if removed:
    E[:] = [e for e in E if not is_future(e)]
    print("未開業として外した区間:", len(removed), [(S[e[0]][1], S[e[1]][1], lines[e[2]][0]) for e in removed[:6]], file=sys.stderr)

if not DRY:
    for a, b, li, d in added:
        E.append([a, b, li])
    # 全体の連結成分（確認用）
    adj = collections.defaultdict(set)
    for a, b, li in E:
        adj[a].add(b)
        adj[b].add(a)
    cs = comps(set(range(len(S))), adj)
    cs.sort(key=len, reverse=True)
    print("主成分:", len(cs[0]), "/", len(S), " 次点:", [len(c) for c in cs[1:8]], file=sys.stderr)
    txt = json.dumps(net, ensure_ascii=False, separators=(",", ":"))
    open(NET, "w", encoding="utf-8").write(txt)
    print("書き出し", NET, len(txt.encode("utf-8")), "bytes  edges", len(E), file=sys.stderr)
