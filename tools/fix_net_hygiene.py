#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""data/net.json の掃除（v80）。何度実行しても同じ結果（冪等）。

Wikidata 由来の全国路線網には、経路探索に使ってはいけないものが混ざっている:
  ・廃止された路線（夕張鉄道線・定山渓鉄道線・鹿島鉄道線・くりはら田園鉄道線・湘南軌道 …）
  ・貨物専用線（東海道貨物線・新金貨物線・各地の臨海鉄道・臨港線）
  ・計画・建設中の路線（都心部・臨海地域地下鉄構想・中央新幹線）
  ・信号場・貨物駅・操車場（駅ではない）
1. 名前のパターンで貨物線・計画線・信号場などを外す
2. Wikidata に「廃止日（P576）」「閉鎖日（P3999）」がある鉄道路線の日本語ラベルを引いて、同名の路線を外す
   （--offline のときは 2 を飛ばし、埋め込みの既知リストだけ使う）
3. 辺がなくなった駅を外し、乗り換え辺だけの駅も外す
"""
import json, os, re, sys, io
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "..", "data", "net.json")
OFFLINE = "--offline" in sys.argv
DRY = "--dry" in sys.argv

RX_LINE = re.compile(r"貨物|構想|計画|中央新幹線|臨港線|臨港鉄道|(仙台|京葉|名古屋|神奈川|衣浦|秋田|福島|八戸|水島(?!臨海鉄道水島本線))臨海鉄道|鹿島臨海鉄道鹿島臨港線|(?<!旅客)専用線")
RX_NODE = re.compile(r"信号場|貨物|操車場|分岐部|保守基地|車両基地|検車区")
# Wikidata が引けないときのための既知の廃線（2026 時点で営業していない路線名）
KNOWN_CLOSED = """夕張鉄道線 定山渓鉄道線 鹿島鉄道線 くりはら田園鉄道線 湘南軌道 仙台市電 熊本市電春竹線 岡山臨港鉄道線 秋田臨海鉄道線
三菱石炭鉱業大夕張鉄道線 三菱鉱業美唄鉄道線 南部縦貫鉄道線 蒲原鉄道線 有田鉄道線 村松軌道 軽石軌道 磐梯急行電鉄 加越能鉄道加越線 筑波山鋼索鉄道線 美幸線 大社線 三国線 東武熊谷線 三井芦別鉄道
名古屋臨海鉄道汐見町線 名古屋臨海鉄道東港線 名古屋臨海鉄道東築線 名古屋臨海鉄道南港線 神奈川臨海鉄道浮島線 神奈川臨海鉄道水江線 神奈川臨海鉄道千鳥線
仙台臨海鉄道臨海本線 仙台臨海鉄道仙台埠頭線 仙台臨海鉄道仙台西港線 京葉臨海鉄道臨海本線 衣浦臨海鉄道半田線 衣浦臨海鉄道碧南線 水島臨海鉄道港東線
新金貨物線 東海道貨物線 都心部・臨海地域地下鉄構想 中央新幹線 日高本線 札沼線 石勝線夕張支線 留萌本線 根室本線 江差線 三江線 大隅線 志布志線""".split()
# ※ 日高本線・留萌本線・根室本線・札沼線は一部区間のみ廃止。区間の判定は Wikidata の駅ごとの廃止日で行うので路線名では外さない
KNOWN_CLOSED = [n for n in KNOWN_CLOSED if n not in ("日高本線", "札沼線", "留萌本線", "根室本線")]

def wikidata_closed():
    """廃止日か閉鎖日のある日本の鉄道路線・軌道路線の日本語ラベル"""
    sys.path.insert(0, HERE)
    try:
        from build_views import sparql
    except Exception as e:
        print("build_views を読めません:", e); return set()
    q = """SELECT DISTINCT ?l ?lab WHERE {
      VALUES ?cls { wd:Q728937 wd:Q15079663 wd:Q1311958 wd:Q22667 wd:Q2354973 }
      ?l wdt:P31/wdt:P279* ?cls ; wdt:P17 wd:Q17 .
      { ?l wdt:P576 ?d } UNION { ?l wdt:P3999 ?d }
      ?l rdfs:label ?lab . FILTER(LANG(?lab) = "ja")
    }"""
    try:
        rows = sparql(q)
    except Exception as e:
        print("Wikidata に届きません:", e); return set()
    out = set()
    for r in rows:
        out.add(r["lab"]["value"].strip())
    print("Wikidata の廃止路線ラベル %d 件" % len(out))
    return out

def closed_stations():
    """廃止日のある日本の駅の (ラベル, 緯度, 経度)。同名の現役駅と取り違えないよう座標で照合する"""
    sys.path.insert(0, HERE)
    try:
        from build_views import sparql
    except Exception:
        return []
    q = """SELECT DISTINCT ?s ?lab ?c WHERE {
      ?s wdt:P31/wdt:P279* wd:Q55488 ; wdt:P17 wd:Q17 ; wdt:P625 ?c .
      { ?s wdt:P576 ?d } UNION { ?s wdt:P3999 ?d }
      ?s rdfs:label ?lab . FILTER(LANG(?lab) = "ja")
    }"""
    try:
        rows = sparql(q)
    except Exception as e:
        print("廃駅の取得に失敗:", e); return []
    out = []
    for r in rows:
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["c"]["value"])
        if m: out.append((r["lab"]["value"].strip(), float(m.group(2)), float(m.group(1))))
    print("Wikidata の廃駅 %d 件" % len(out))
    return out

net = json.load(io.open(P, encoding="utf-8"))
L, st, ed = net["lines"], net["stations"], net["edges"]
closed = set(KNOWN_CLOSED)
cst = []
if not OFFLINE:
    closed |= wikidata_closed()
    cst = closed_stations()
def norm(n): return re.sub(r"駅$", "", n or "").strip()
import math
def hav(a, b):
    R = 6371.0088
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))
cst_by = {}
for n, la, lo in cst: cst_by.setdefault(norm(n), []).append((la, lo))
def flagged(i):
    """Wikidata の廃駅と名前が同じで 300m 以内"""
    s = st[i]
    for la, lo in cst_by.get(norm(s[1]), []):
        if hav((s[2], s[3]), (la, lo)) < 0.3: return True
    return False
FLAG = {i for i in range(len(st)) if flagged(i)}
XFER = {i for i, l in enumerate(L) if l[0] == "乗り換え"}
# 路線ごとの駅と «廃駅率»
nodes_of = {}
for e in ed: nodes_of.setdefault(e[2], set()).update([e[0], e[1]])
def frac(i):
    ns = nodes_of.get(i, set())
    return (sum(1 for n in ns if n in FLAG) / len(ns)) if ns else 0.0
# 0) あり得ない長さの在来線の辺を外す（駅名が同じ別の駅（入谷・菊川・平和台・江北 …）が 1 つに束ねられて生まれた辺）。
#    首都圏（緯度 35.3〜36.3・経度 139.0〜140.4）の在来線は 13km 超、全国では 36km 超（石勝線 新夕張–占冠 34km が最長）
RX_LONG_OK = re.compile(r"新幹線|ライナー|特急|快速|エクスプレス|乗り換え")
def kanto(s): return 35.3 <= s[2] <= 36.3 and 139.0 <= s[3] <= 140.4
long_edges = set()
for k, e in enumerate(ed):
    n = L[e[2]][0]
    if RX_LONG_OK.search(n): continue
    a, b = st[e[0]], st[e[1]]
    d = hav(a[2:4], b[2:4])
    if d > 36 or (d > 13 and kanto(a) and kanto(b)): long_edges.add(k)
if long_edges:
    print("長すぎる辺 %d 本を除外: %s" % (len(long_edges), " / ".join("%s %s–%s %.0fkm" % (L[ed[k][2]][0], st[ed[k][0]][1], st[ed[k][1]][1], hav(st[ed[k][0]][2:4], st[ed[k][1]][2:4])) for k in sorted(long_edges))[:1200]))
ed = [e for k, e in enumerate(ed) if k not in long_edges]
nodes_of = {}
for e in ed: nodes_of.setdefault(e[2], set()).update([e[0], e[1]])
# 1) 路線ごと外す（辺をすべて消す）: 名前パターン ／ 既知の廃線 ／ Wikidata に廃止日があり駅の半分以上が廃駅 ／ 駅が 2 つ以下で全部廃駅
drop_line = set()
for i, l in enumerate(L):
    n = l[0]
    if i in XFER: continue
    f = frac(i); k = len(nodes_of.get(i, ()))
    if RX_LINE.search(n) or n in KNOWN_CLOSED or ((n in closed or norm(n) in closed) and (f >= 0.5 or k <= 2)) or (k >= 2 and f >= 0.999):
        drop_line.add(i)
keep_edges = [e for e in ed if e[2] not in drop_line]
# 2) 駅を外す: 信号場・貨物駅 ／ 廃駅（ただし乗降人員があるか、営業中の 2 路線以上が通る駅は残す）
#    途中駅を外すときは、その路線の両隣どうしを直接つなぐ（路線が途切れないように «バイパス»）。
#    路線の端の廃止区間は、端から順に外れていって消える
lines_at = {}
for e in keep_edges:
    if e[2] in XFER: continue
    lines_at.setdefault(e[0], set()).add(e[2]); lines_at.setdefault(e[1], set()).add(e[2])
drop_node = set()
for i, s in enumerate(st):
    if RX_NODE.search(s[1]): drop_node.add(i); continue
    if i in FLAG and not (s[8] and s[8] > 0) and len(lines_at.get(i, ())) < 2: drop_node.add(i)
# 可変の隣接表で順に外す
E = {}   # (a,b,line) -> 1  (a<b)
def ek(a, b, l): return (a, b, l) if a < b else (b, a, l)
for e in keep_edges: E[ek(e[0], e[1], e[2])] = 1
nbr = {}
for (a, b, l) in E: nbr.setdefault(a, set()).add((b, l)); nbr.setdefault(b, set()).add((a, l))
bypass = 0
for i in sorted(drop_node):
    byline = {}
    for (o, l) in list(nbr.get(i, ())):
        if l in XFER: continue
        byline.setdefault(l, []).append(o)
    for l, os_ in byline.items():
        if len(os_) == 2 and os_[0] != os_[1]:
            k = ek(os_[0], os_[1], l)
            if k not in E:
                E[k] = 1; nbr.setdefault(os_[0], set()).add((os_[1], l)); nbr.setdefault(os_[1], set()).add((os_[0], l)); bypass += 1
    for (o, l) in list(nbr.get(i, ())):
        E.pop(ek(i, o, l), None); nbr[o].discard((i, l))
    nbr.pop(i, None)
keep_edges = [[a, b, l] for (a, b, l) in E]
# 路線を全部外されて辺がなくなった駅も外す（もともと隣接データのない駅は残す）
had = {}
for e in ed:
    if e[2] in XFER: continue
    had[e[0]] = 1; had[e[1]] = 1
deg2 = {}
for e in keep_edges:
    if e[2] in XFER: continue
    deg2[e[0]] = deg2.get(e[0], 0) + 1; deg2[e[1]] = deg2.get(e[1], 0) + 1
iso = {i for i in range(len(st)) if had.get(i) and deg2.get(i, 0) == 0} - drop_node
drop_node |= iso
keep_edges = [e for e in keep_edges if e[0] not in drop_node and e[1] not in drop_node]
print("途中駅のバイパス %d 本" % bypass)
print("路線 %d 本を除外: %s" % (len(drop_line), " ".join(sorted(L[i][0] for i in drop_line))))
print("駅 %d 件を除外（信号場・貨物駅 %d、廃駅 %d、辺なし %d）" % (len(drop_node), sum(1 for i in drop_node if RX_NODE.search(st[i][1])), sum(1 for i in drop_node if i in FLAG and not RX_NODE.search(st[i][1]) and i not in iso), len(iso)))
print("辺 %d → %d" % (len(ed), len(keep_edges)))
if "--list" in sys.argv:
    for i in sorted(drop_node, key=lambda i: st[i][1]): print("  -", st[i][1], [L[k][0] for k in st[i][4]][:3])
if DRY: sys.exit(0)
# 番号を詰め直す
remap = {}
new_st = []
for i, s in enumerate(st):
    if i in drop_node: continue
    remap[i] = len(new_st); new_st.append(s)
new_ed = [[remap[e[0]], remap[e[1]], e[2]] for e in keep_edges]
alive = {}
for e in new_ed: alive.setdefault(e[0], set()).add(e[2]); alive.setdefault(e[1], set()).add(e[2])
for j, s in enumerate(new_st):
    s[4] = [k for k in s[4] if k not in drop_line]
cnt = {}
for e in new_ed: cnt[e[2]] = cnt.get(e[2], 0) + 1
for i, l in enumerate(L): l[2] = cnt.get(i, 0)
net["stations"], net["edges"] = new_st, new_ed
json.dump(net, io.open(P, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", os.path.normpath(P), "stations", len(new_st), "edges", len(new_ed))
