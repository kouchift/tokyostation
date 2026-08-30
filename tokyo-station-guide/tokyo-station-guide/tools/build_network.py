# -*- coding: utf-8 -*-
"""
Wikidata から取得した生データ（/tmp/st_*.json）を
data/network.js（駅マスタ＋路線＋隣接グラフ）にまとめる。

出典: Wikidata (https://www.wikidata.org) — CC0 1.0
  st_base.json : 駅ID・駅名・かな・座標・ホーム数・開業年
  st_adj.json  : 隣接駅（P197）＋路線（P81 qualifier）
  st_lines.json: 乗り入れ路線・事業者
  st_pax2.json : 1日平均乗降人員（P1373）＋年次
"""
import json, io, os, math, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
SRC = "/tmp"

def load(n): return json.load(open(os.path.join(SRC, n + ".json"), encoding="utf-8"))
def qid(u): return u.rsplit("/", 1)[-1]
def val(row, k, d=None):
    return row[k]["value"] if k in row else d

def _int(v):
    try: return int(float(v))
    except (TypeError, ValueError): return None

def _year(v):
    import re as _re
    m = _re.match(r"^(-?\d{3,4})-", v or "")
    return m.group(1) if m else None

# ---------------------------------------------------------------- 路線の表示色
# 一般に流通しているラインカラーに寄せた「本アプリの表示色」。公式色とは限らない。
LINE_COLOR = {
    "山手線": "#9ACD32", "中央線": "#F15A22", "中央本線": "#F15A22",
    "中央線快速": "#F15A22", "中央・総武緩行線": "#FFD400", "総武本線": "#FFD400",
    "京浜東北線": "#00B2E5", "埼京線": "#00AC9B", "湘南新宿ライン": "#E21F26",
    "東海道本線": "#F68B1E", "横須賀線": "#0067C0", "常磐線": "#00A7DB",
    "京葉線": "#C9252F", "武蔵野線": "#F15A22", "南武線": "#FFD400",
    "東京メトロ銀座線": "#FF9500", "東京メトロ丸ノ内線": "#F62E36",
    "東京メトロ日比谷線": "#B5B5AC", "東京メトロ東西線": "#009BBF",
    "東京メトロ千代田線": "#00BB85", "東京メトロ有楽町線": "#C1A470",
    "東京メトロ半蔵門線": "#8F76D6", "東京メトロ南北線": "#00AC9B",
    "東京メトロ副都心線": "#9C5E31",
    "都営地下鉄浅草線": "#EE7B1A", "都営地下鉄三田線": "#0079C2",
    "都営地下鉄新宿線": "#6CBB5A", "都営地下鉄大江戸線": "#B6007A",
    "東急東横線": "#DA0442", "東急目黒線": "#009CD2", "東急田園都市線": "#20A288",
    "東急大井町線": "#F49600", "東急池上線": "#EE86A8", "東急多摩川線": "#A4343A",
    "東急世田谷線": "#FCC800",
    "京王線": "#DD0077", "京王井の頭線": "#1478C8", "京王新線": "#DD0077",
    "小田急小田原線": "#0071BC", "小田急多摩線": "#0071BC",
    "西武池袋線": "#0071BC", "西武新宿線": "#F0851E", "西武有楽町線": "#00A7DB",
    "東武東上本線": "#0F55A6", "東武伊勢崎線": "#0F55A6", "東武亀戸線": "#0F55A6",
    "東武大師線": "#0F55A6",
    "京成本線": "#004097", "京成押上線": "#004097", "京成金町線": "#004097",
    "京急本線": "#00BFFF", "京急空港線": "#00BFFF",
    "つくばエクスプレス": "#00A6E9", "東京臨海高速鉄道りんかい線": "#00609B",
    "ゆりかもめ東京臨海新交通臨海線": "#0075C2", "ゆりかもめ": "#0075C2",
    "日暮里・舎人ライナー": "#D9006C", "東京モノレール羽田空港線": "#0072BC",
    "都電荒川線": "#EA5504", "北総線": "#0068B7",
}
DROP_LINE = {"東京の地下鉄", "東京地下鉄", "都営地下鉄", "東日本旅客鉄道", "日本の鉄道"}

def color_for(name):
    if name in LINE_COLOR: return LINE_COLOR[name]
    h = 0
    for ch in name: h = (h * 31 + ord(ch)) % 360
    return "hsl(%d,42%%,45%%)" % h

# ---------------------------------------------------------------- 読み込み
OPERATOR_PREFIX = [
    "JR東日本", "JR東海", "JR", "東日本旅客鉄道", "東海旅客鉄道",
    "東京地下鉄", "東京メトロ", "東京都交通局", "都営地下鉄", "都営",
    "東急電鉄", "東京急行電鉄", "東急", "京王電鉄", "京王", "小田急電鉄", "小田急",
    "西武鉄道", "西武", "東武鉄道", "東武", "京成電鉄", "京成",
    "京浜急行電鉄", "京急", "相模鉄道", "相鉄", "横浜市交通局", "横浜市営地下鉄",
    "首都圏新都市鉄道", "東京臨海高速鉄道", "東京モノレール", "ゆりかもめ",
    "北総鉄道", "埼玉高速鉄道", "多摩都市モノレール", "東葉高速鉄道",
    "日暮里・舎人ライナー", "東京臨海新交通", "東京都電車", "都電", "埼玉新都市交通",
]
LINE_SUFFIX_IN_LABEL = ["京王線", "京王新線", "小田原線", "本線", "空港線"]

def clean_name(label):
    """Wikidata のラベルから事業者名・路線名を落として駅名だけにする"""
    t = re.sub(r"[（(].*?[)）]", "", label).strip()
    t = re.sub(r"^[\s\u3000・･\-–—:：/｜|]+", "", t)      # 先頭の記号を落とす
    t = re.sub(r"(駅|停留場|停留所)$", "", t)
    # 空白区切りなら最後の要素を採用（例: 「京王電鉄 京王線新宿」→「京王線新宿」）
    parts = re.split(r"[\s\u3000]+", t)
    if len(parts) > 1: t = parts[-1]
    changed = True
    while changed:
        changed = False
        t = re.sub(r"^[\s\u3000・･\-–—:：/｜|]+", "", t)
        for p in sorted(OPERATOR_PREFIX + LINE_SUFFIX_IN_LABEL, key=len, reverse=True):
            if t.startswith(p) and len(t) > len(p) + 1:
                t = t[len(p):]; changed = True; break
    return re.sub(r"^[\s\u3000・･]+", "", t).strip()

base = load("st_base")
stations = {}
for r in base:
    q = qid(val(r, "s"))
    name = clean_name(val(r, "label", ""))
    if not name: continue
    stations[q] = {
        "q": q, "name": name,
        "kana": re.sub(r"えき$", "", (val(r, "kana", "") or "")),
        "lat": round(float(val(r, "lat")), 6), "lng": round(float(val(r, "lon")), 6),
        "pf": _int(val(r, "platforms")),
        "opened": _year(val(r, "opened", "")),
        "lines": [], "pax": None, "paxYear": None,
    }

# 乗降人員（最新年を採用）
for r in load("st_pax2"):
    q = qid(val(r, "s"))
    if q not in stations: continue
    try: v = int(float(val(r, "v")))
    except: continue
    y = (val(r, "t", "") or "")[:4]
    s = stations[q]
    if s["pax"] is None or (y and (s["paxYear"] or "") < y):
        s["pax"], s["paxYear"] = v, y or None

# 乗り入れ路線
for r in load("st_lines"):
    q = qid(val(r, "s")); ln = val(r, "lineLabel", "")
    if q not in stations or not ln or ln in DROP_LINE or ln.startswith("Q"): continue
    if ln not in stations[q]["lines"]: stations[q]["lines"].append(ln)

# 隣接（＝路線の辺）
edges, lineset = {}, collections.Counter()
for r in load("st_adj"):
    a, b = qid(val(r, "s")), qid(val(r, "adj"))
    if a not in stations or b not in stations or a == b: continue
    ln = val(r, "lineLabel", "") or ""
    if ln.startswith("Q") or ln in DROP_LINE: ln = ""
    k = (a, b, ln) if a < b else (b, a, ln)
    edges[k] = ln
    if ln: lineset[ln] += 1
    if ln and ln not in stations[a]["lines"]: stations[a]["lines"].append(ln)
    if ln and ln not in stations[b]["lines"]: stations[b]["lines"].append(ln)

# ------------------------------------------------- 西武池袋線（bbox外区間）を補完
# True にすると所沢〜吾野まで含めるが、地図の余白が大きくなるため既定は False
INCLUDE_SEIBU_TAIL = False
import json as _j
try:
    if not INCLUDE_SEIBU_TAIL: raise RuntimeError("bbox外区間はスキップ（INCLUDE_SEIBU_TAIL=False）")
    _si = io.open("data/lines/SI.js", encoding="utf-8").read()
    _si = _j.loads(_si[_si.index("(")+1:_si.rindex(")")])
    _geo = io.open("data/geo.js", encoding="utf-8").read()
    _geo = _j.loads(_geo[_geo.index("RG.GEO =")+8:_geo.index(";\nRG.GEO_SOURCE")])
    seq = [x["name"] for x in _si["stations"]]
    known = {s["name"] for s in stations.values()}
    for nm in seq:
        if nm in known or nm not in _geo: continue
        q = "SI_" + nm
        stations[q] = {"q": q, "name": nm, "kana": "", "lat": _geo[nm][0], "lng": _geo[nm][1],
                       "pf": None, "opened": None, "lines": ["西武池袋線"], "pax": None, "paxYear": None}
        known.add(nm)
    # 連続する駅を辺で結ぶ（既存の辺があれば触らない）
    name2q = {}
    for st in stations.values(): name2q.setdefault(st["name"], st["q"])
    for a, b in zip(seq, seq[1:]):
        if a in name2q and b in name2q:
            qa, qb = name2q[a], name2q[b]
            k = (qa, qb, "西武池袋線") if qa < qb else (qb, qa, "西武池袋線")
            if k not in edges: edges[k] = "西武池袋線"
except Exception as e:
    print("SI補完スキップ:", e)

# ---------------------------------------------------------------- 駅のクラスタ統合
# 同じ駅名かつ600m以内の Wikidata 項目を 1 つの表示ノードにまとめる
def hav(a, b):
    R = 6371.0; r = math.radians
    dla, dlo = r(b[0] - a[0]), r(b[1] - a[1])
    x = math.sin(dla/2)**2 + math.cos(r(a[0]))*math.cos(r(b[0]))*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(x))

byname = collections.defaultdict(list)
for s in stations.values(): byname[s["name"]].append(s)

q2c, clusters = {}, {}
for name, arr in byname.items():
    groups = []
    for s in arr:
        placed = False
        for g in groups:
            if any(hav((s["lat"], s["lng"]), (t["lat"], t["lng"])) <= 0.6 for t in g):
                g.append(s); placed = True; break
        if not placed: groups.append([s])
    for gi, g in enumerate(groups):
        cid = re.sub(r"[^0-9A-Za-z\u3040-\u30ff\u4e00-\u9fff]", "", name) + ("" if gi == 0 else "_%d" % gi)
        base_id = cid; k = 1
        while cid in clusters: cid = base_id + "#%d" % k; k += 1
        lines_all, pax_sum, pax_max, pfs, ops, yrs = [], 0, 0, 0, [], []
        for s in g:
            q2c[s["q"]] = cid
            for L in s["lines"]:
                if L not in lines_all and not L.endswith("路線網") and L not in DROP_LINE:
                    lines_all.append(L)
            if s["pax"]: pax_sum += s["pax"]; pax_max = max(pax_max, s["pax"]); yrs.append(s["paxYear"])
            if s["pf"]: pfs += s["pf"]
            if s["opened"]: ops.append(s["opened"])
        clusters[cid] = {
            "id": cid, "n": name,
            "k": next((s["kana"] for s in g if s["kana"]), ""),
            "la": round(sum(s["lat"] for s in g) / len(g), 6),
            "lo": round(sum(s["lng"] for s in g) / len(g), 6),
            "ls": lines_all, "pf": pfs or None,
            "op": min(ops) if ops else None,
            "px": pax_sum or None, "pxOps": len([1 for s in g if s["pax"]]),
            "py": max([y for y in yrs if y], default=None),
            "qs": [s["q"] for s in g],
        }

# 辺をクラスタ単位に変換
cedges = {}
for key, ln in edges.items():
    a, b = key[0], key[1]
    ca, cb = q2c.get(a), q2c.get(b)
    if not ca or not cb or ca == cb: continue
    k = (ca, cb, ln) if ca < cb else (cb, ca, ln)
    cedges[k] = ln

# 廃駅（Wikidata P576 = 廃止年 / 廃駅クラス）を除外
CLOSED = set()
try:
    for r in load("closed"):
        CLOSED.add(clean_name(val(r, "xLabel", "")))
    CLOSED.discard("")
    print("廃駅リスト %d 件" % len(CLOSED))
except Exception as e:
    print("廃駅リストなし:", e)

# ------------------------------------------------- 路線の切れ目を補修
# Wikidata の隣接(P197)には抜けがある（例: 丸ノ内線 国会議事堂前〜霞ケ関）。
# 同じ路線が複数の連結成分に割れている場合、成分どうしの最も近い端点を
# 2.5km 以内に限って結び直す。補修した辺は repaired に記録する。
def repair_line_gaps(cedges, clusters, max_km=2.6):
    bl = collections.defaultdict(list)
    for key, ln in cedges.items():
        if ln: bl[ln].append((key[0], key[1]))
    added = []
    for ln, es in bl.items():
        adj = collections.defaultdict(set)
        for a, b in es: adj[a].add(b); adj[b].add(a)
        # 連結成分
        seen, comps = set(), []
        for n0 in list(adj):
            if n0 in seen: continue
            stack, comp = [n0], []
            seen.add(n0)
            while stack:
                u = stack.pop(); comp.append(u)
                for v in adj[u]:
                    if v not in seen: seen.add(v); stack.append(v)
            comps.append(comp)
        if len(comps) < 2: continue
        # 端点（次数1）どうしを近い順につなぐ
        guard = 0
        while len(comps) > 1 and guard < 12:
            guard += 1
            best = None
            for i in range(len(comps)):
                for j in range(i + 1, len(comps)):
                    ends_i = [x for x in comps[i] if len(adj[x]) <= 1]
                    ends_j = [x for x in comps[j] if len(adj[x]) <= 1]
                    for a in ends_i:
                        if ln not in clusters[a]["ls"]: continue
                        for b in ends_j:
                            if ln not in clusters[b]["ls"]: continue
                            ca, cb = clusters[a], clusters[b]
                            d = hav((ca["la"], ca["lo"]), (cb["la"], cb["lo"]))
                            if best is None or d < best[0]: best = (d, a, b, i, j)
            if not best or best[0] > max_km: break
            d, a, b, i, j = best
            k = (a, b, ln) if a < b else (b, a, ln)
            if k not in cedges:
                cedges[k] = ln
                added.append((ln, clusters[a]["n"], clusters[b]["n"], round(d, 2)))
            adj[a].add(b); adj[b].add(a)
            comps[i] = comps[i] + comps[j]; comps.pop(j)
    return added

# 信号場・貨物駅・孤立ノード（廃駅など）を除外
NOISE = re.compile(r"信号場|貨物|分岐部|操車場")
deg = collections.Counter()
for key in cedges: deg[key[0]] += 1; deg[key[1]] += 1
drop = {cid for cid, c in clusters.items()
        if NOISE.search(c["n"]) or deg[cid] == 0 or c["n"] in CLOSED}
for cid in drop: clusters.pop(cid, None)
cedges = {k: v for k, v in cedges.items() if k[0] not in drop and k[1] not in drop}
print("除外 %d ノード（信号場・貨物・孤立・廃駅）" % len(drop))

# 除外のあとで路線の切れ目を補修する（除外によって新たに切れる場合があるため）
repaired = repair_line_gaps(cedges, clusters)
print("路線の切れ目を %d 箇所 補修" % len(repaired))
for r in repaired: print("   %s: %s — %s (%.2fkm)" % r)

# ---------------------------------------------------------------- 出力
lineset2 = collections.Counter(ln for ln in cedges.values() if ln)
lines = [{"name": ln, "color": color_for(ln), "edges": c} for ln, c in lineset2.most_common()]

st_out = []
for c in sorted(clusters.values(), key=lambda x: -(x["px"] or 0)):
    o = {"id": c["id"], "n": c["n"], "la": c["la"], "lo": c["lo"], "ls": c["ls"]}
    for key in ("k", "pf", "op", "px", "py"):
        if c[key]: o[key] = c[key]
    if c["pxOps"] > 1: o["pxOps"] = c["pxOps"]
    st_out.append(o)

ed_out = [[k[0], k[1], ln] for k, ln in sorted(cedges.items())]

js = io.open("data/network.js", "w", encoding="utf-8")
js.write("""/* 東京23区とその周辺の鉄道ネットワーク（自動生成: tools/build_network.py）
   出典: Wikidata (https://www.wikidata.org) — ライセンス CC0 1.0（パブリックドメイン）
   取得日: 2026-08-30 / 範囲: 経度139.54-139.94, 緯度35.49-35.85（＋西武池袋線の区外区間）
   項目: id=駅ID n=駅名 k=かな la/lo=緯度経度 ls=乗り入れ路線
         pf=ホーム数の合計 op=開業年 px=1日平均乗降人員 py=年次 pxOps=集計した事業者数
   ⚠ Wikidata はだれでも編集できるデータです。数値は各社公式資料で必ず検証してください。
   ⚠ px は「Wikidata に登録のある事業者ぶんの合計」であり、その駅の総数とは限りません。
   ラインカラーは本アプリの表示色であり、公式ラインカラーとは限りません。 */
""")
js.write("RG.NET = {\n")
js.write(' source: { name:"Wikidata", url:"https://www.wikidata.org", license:"CC0 1.0", fetched:"2026-08-30" },\n')
js.write(" lines: %s,\n" % json.dumps(lines, ensure_ascii=False))
js.write(" stations: %s,\n" % json.dumps(st_out, ensure_ascii=False))
js.write(" edges: %s\n" % json.dumps(ed_out, ensure_ascii=False))
js.write("};\n")
js.close()

print("表示駅 %d / 路線 %d / 辺 %d" % (len(st_out), len(lines), len(ed_out)))
print("乗降人員あり %d 駅 / ホーム数あり %d 駅 / 開業年あり %d 駅"
      % (sum(1 for s in st_out if "px" in s), sum(1 for s in st_out if "pf" in s),
         sum(1 for s in st_out if "op" in s)))
print("上位:", ", ".join("%s(%s)" % (s["n"], format(s["px"], ",")) for s in st_out[:8] if "px" in s))
print("サイズ", os.path.getsize("data/network.js"), "bytes")
