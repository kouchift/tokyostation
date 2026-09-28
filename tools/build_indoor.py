# -*- coding: utf-8 -*-
"""v150: 東京駅まわりの «構内図» のデータを作る（国土交通省「東京駅周辺屋内地図オープンデータ（令和2年度更新版）」）
出典: 国土交通省 高精度測位社会プロジェクト（政府標準利用規約）
  https://www.geospatial.jp/ckan/dataset/mlit-indoor-tokyo-r2 の Shapefile を加工して作成

作るもの（画面が読む）:
  data/indoor/tokyo.js      … 階の一覧・行き先（改札・出口・連絡口・ビル・地下街）・歩行者の通路網（ノードとリンク）
  data/indoor/tokyo_<階>.js … 階ごとの図形（階の輪郭・通路・店・トイレ・階段など）と設備（トイレ・エレベーター）
座標は «東京駅のあたりを原点にした m»（0.5 m 単位の整数）。緯度経度への戻しかたは tokyo.js の o（原点）と k（1 度あたりの m）

使い方: pip install pyshp --break-system-packages ; python tools/build_indoor.py
  （Shapefile は一時フォルダへ取りにいく。2.6MB。リポジトリには入れない）
"""
import os, io, sys, json, math, zipfile, tempfile, urllib.request, collections, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://www.geospatial.jp/ckan/dataset/eb79c194-3f26-4c41-9b48-6664f4684ebc/resource/d441c885-6a15-476b-836d-cddd9a5fa006/download/shapefile.zip"
try:
    import shapefile
except ImportError:
    sys.exit("pyshp が要ります: pip install pyshp")

CACHE = os.path.join(tempfile.gettempdir(), "tsg_indoor_tokyo.zip")
if not os.path.exists(CACHE):
    print("取りにいきます:", URL)
    urllib.request.urlretrieve(URL, CACHE)
Z = zipfile.ZipFile(CACHE)
FILES = {}
for i in Z.infolist():
    n = i.filename if i.flag_bits & 0x800 else i.filename.encode("cp437").decode("cp932")
    FILES[n] = i

def reader(base):
    """base: zip 内の «…/名前»（拡張子なし）"""
    parts = {}
    for ext in ("shp", "shx", "dbf"):
        k = base + "." + ext
        if k in FILES: parts[ext] = io.BytesIO(Z.read(FILES[k]))
    for enc in ("utf-8", "cp932"):
        try:
            for v in parts.values(): v.seek(0)
            r = shapefile.Reader(shp=parts.get("shp"), shx=parts.get("shx"), dbf=parts.get("dbf"), encoding=enc)
            f = [x[0] for x in r.fields[1:]]
            recs = [dict(zip(f, rec)) for rec in r.records()]
            return r.shapes(), recs
        except Exception:
            continue
    for v in parts.values(): v.seek(0)
    r = shapefile.Reader(shp=parts.get("shp"), shx=parts.get("shx"), dbf=parts.get("dbf"), encoding="utf-8", encodingErrors="replace")
    f = [x[0] for x in r.fields[1:]]
    return r.shapes(), [dict(zip(f, rec)) for rec in r.records()]

# 原点と縮尺（東京駅のあたり）
LA0, LO0 = 35.6785, 139.7640
KX = 111320 * math.cos(math.radians(LA0)); KY = 110574
Q = 2                                                     # 0.5 m 単位
def xy(lo, la): return [int(round((lo - LO0) * KX * Q)), int(round((LA0 - la) * KY * Q))]

def dp(pts, tol):
    """Douglas-Peucker（整数座標のまま）。閉じた輪（最初と最後が同じ点）は、いちばん遠い点で 2 つに分けてから"""
    if len(pts) < 3: return pts
    if pts[0] == pts[-1]:
        m = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        if m == 0: return pts[:1]
        return _dp(pts[:m + 1], tol) + _dp(pts[m:], tol)[1:]
    return _dp(pts, tol)
def _dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1
        mi, md = -1, tol
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L
            if d > md: mi, md = i, d
        if mi >= 0: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]

def enc(pts):
    """[x0,y0,dx1,dy1,…]（差分で短く）"""
    o = []; px = py = 0
    for i, (x, y) in enumerate(pts):
        o += [x - px, y - py]; px, py = x, y
    return o

def rings(shape):
    pts = shape.points; parts = list(shape.parts) + [len(pts)]
    for i in range(len(parts) - 1):
        yield [xy(p[0], p[1]) for p in pts[parts[i]:parts[i + 1]]]

def lv(o):
    """階の表示名（ordinal → «1F» «B1» など）"""
    o = float(o)
    if o >= 1: return str(int(o)) + "F"
    if o == 0: return "GL"
    return "B" + str(int(-o))

AREA = {  # フォルダ → 表示名
    "1.JR東京駅": "JR東京駅", "2.地下鉄_公共通路": "地下鉄・地下通路", "3.丸ビル": "丸ビル", "4.新丸ビル": "新丸ビル", "5.TOKIA": "TOKIA",
    "6.丸の内ブリックスクエア": "丸の内ブリックスクエア", "7.イーヨ": "iiyo!!（東京ビル）", "8.三菱UFJ信託銀行本店ビル": "三菱UFJ信託銀行本店ビル",
    "9.丸の内オアゾ": "丸の内オアゾ", "10.三菱商事ビル": "三菱商事ビル", "11.KITTE": "KITTE", "12.東京交通会館": "東京交通会館",
    "13.有楽町イトシア": "有楽町イトシア", "14.有楽町マリオン": "有楽町マリオン", "15.オーテモリ": "OOTEMORI（大手町）",
    "16.東京国際フォーラム": "東京国際フォーラム", "17.鉄鋼ビルディング": "鉄鋼ビルディング"}
SUB = {  # 地下鉄のファイル名の頭 → 駅
    "ChiyodaHibiya": "千代田線 日比谷駅", "ChiyodaNiju": "千代田線 二重橋前駅", "ChiyodaOtemati": "千代田線 大手町駅", "GinzaGinza": "銀座線 銀座駅",
    "Hanzo": "半蔵門線 大手町駅", "HibiyaGinza": "日比谷線 銀座駅", "HibiyaHibiya": "日比谷線 日比谷駅", "HibiyaHigagin": "日比谷線 東銀座駅",
    "MaruGinza": "丸ノ内線 銀座駅", "MaruOtemati": "丸ノ内線 大手町駅", "MaruTokyo": "丸ノ内線 東京駅", "MitaHibiya": "三田線 日比谷駅",
    "MitaOtemati": "三田線 大手町駅", "Tozai": "東西線 大手町駅", "YurakuTika": "有楽町線 有楽町駅（地下通路）", "Yurakucho": "有楽町線 有楽町駅"}
# 画面で色を変える «空間» の種類（それ以外は «その他の部屋»）
SPK = {"B029": "w", "B001": "s", "B007": "t", "B008": "t", "B010": "t", "B011": "t", "B014": "t", "B021": "st", "B022": "ev", "B023": "es",
       "B025": "sl", "B005": "tk", "B006": "if", "B004": "wr", "B016": "t", "B017": "if", "B003": "pb", "B015": "sm"}
FAC = {"F001": "t", "F002": "t", "F005": "tm", "F008": "tm", "F012": "ev", "F035": "ev"}   # 図に出す設備（階段・エスカレーターは «範囲» の色で分かる）

geo = collections.defaultdict(lambda: {"fl": [], "sp": [], "fc": [], "lb": []})
places = []; ords = set()
bases = sorted(set(k[:-4] for k in FILES if k.endswith(".shp") and "/nw/" not in k))
for base in bases:
    parts = base.split("/")
    if len(parts) < 4: continue
    area, fl, fn = parts[1], parts[2], parts[3]
    kind = fn.rsplit("_", 1)[-1]
    if fn.endswith("TWSI_Line") or fn.endswith("TWSI_Point"): continue
    pre = fn.split("_")[0]
    ctx = SUB.get(pre) if area.startswith("2.") else AREA.get(area, area)
    shapes, recs = reader(base)
    fids = {}
    if kind == "Floor":
        for s, r in zip(shapes, recs):
            o = float(r.get("ordinal") or 0); ords.add(o)
            for g in rings(s):
                g = dp(g, 1.0)
                if len(g) >= 3: geo[o]["fl"].append(enc(g))
            if len(recs) and area not in ("2.地下鉄_公共通路",):
                pass
        continue
    # 階は floor_id から（同じフォルダの Floor で ordinal を引く）
    fshapes, frecs = reader(base.rsplit("_", 1)[0] + "_Floor") if (base.rsplit("_", 1)[0] + "_Floor.shp") in FILES else (None, [])
    fo = {r["id"]: float(r.get("ordinal") or 0) for r in frecs}
    def ordOf(r):
        return fo.get(r.get("floor_id"), {"B2": -2.0, "B1": -1.0, "0": 0.0, "1": 1.0}.get(fl, 0.0))
    if kind == "Space":
        for s, r in zip(shapes, recs):
            if str(r.get("nonpublic")) == "1": continue
            o = ordOf(r); k = SPK.get(r.get("category"), "o")
            if str(r.get("restricted")) == "1": k = "x"
            for g in rings(s):
                g = dp(g, 0.8)
                if len(g) >= 3: geo[o]["sp"].append([k] + enc(g))
    elif kind == "Facility":
        for s, r in zip(shapes, recs):
            o = ordOf(r); c = r.get("category"); n = (r.get("name") or "").strip()
            if not s.points: continue
            p = xy(*s.points[0][:2])
            if c in FAC: geo[o]["fc"].append([FAC[c]] + p)
            if n and n not in ("(段差解消用)", "段差解消機", "リフト入口"):
                if area.startswith("2.") and re.match(r"^[A-Z]?\d+[a-z]?$", n): places.append({"n": "出口 " + n, "c": ctx, "k": "exit", "o": o, "p": p})
                elif area.startswith("2.") and re.search(r"階段$", n): continue
                else: places.append({"n": n, "c": ctx, "k": "link" if re.search(r"連絡|方面|側|駅|線|口|ビル|通路|入口", n) else "exit", "o": o, "p": p})
    elif kind == "Opening":
        for s, r in zip(shapes, recs):
            n = (r.get("name") or "").strip()
            if not n or n in ("リフト入口",) or not s.points: continue
            o = ordOf(r); pts = [xy(*q[:2]) for q in s.points]
            p = [sum(q[0] for q in pts) // len(pts), sum(q[1] for q in pts) // len(pts)]
            places.append({"n": n, "c": ctx, "k": "gate" if re.search(r"改札|口", n) and area.startswith(("1.", "2.")) else "door", "o": o, "p": p})
    elif kind == "Segment":
        for s, r in zip(shapes, recs):
            n = (r.get("name") or "").strip()
            if not n or re.match(r"^[A-Za-z]", n): continue       # 英語の重複（GranAge など）は外す
            o = ordOf(r); pts = [xy(*q[:2]) for q in s.points]
            p = [sum(q[0] for q in pts) // len(pts), sum(q[1] for q in pts) // len(pts)]
            places.append({"n": n, "c": ctx, "k": "mall", "o": o, "p": p}); geo[o]["lb"].append([n] + p)

# ビルの名前（そのビルの «いちばん低い階» の輪郭の中心）
for area, nm in AREA.items():
    if area.startswith(("1.", "2.")): continue
    best = None
    for base in bases:
        if base.split("/")[1] == area and base.endswith("_Floor"):
            shapes, recs = reader(base)
            for s, r in zip(shapes, recs):
                o = float(r.get("ordinal") or 0); pts = [xy(*q[:2]) for q in s.points]
                if not pts: continue
                c = [sum(q[0] for q in pts) // len(pts), sum(q[1] for q in pts) // len(pts)]
                if best is None or o < best[0]: best = (o, c)
    if best:
        places.append({"n": nm, "c": "ビル", "k": "bldg", "o": best[0], "p": best[1]}); geo[best[0]]["lb"].append([nm] + best[1])

# 通路網
nbase = [k[:-4] for k in FILES if k.endswith("Tokyo_node.shp")][0]
lbase = [k[:-4] for k in FILES if k.endswith("Tokyo_Link.shp")][0]
_, NR = reader(nbase); LS, LR = reader(lbase)
nid = {}; nodes = []
for r in NR:
    nid[r["node_id"]] = len(nodes); nodes.append(xy(r["lon"], r["lat"]) + [int(round(float(r["ordinal"]) * 2))])
links = []
RT = {"1": 0, "4": 1, "5": 2, "6": 3, "7": 4, "2": 5}              # 0 通路 1 EV 2 エスカレーター 3 階段 4 スロープ 5 動く歩道
for r in LR:
    a, b = nid.get(r["start_id"]), nid.get(r["end_id"])
    if a is None or b is None: continue
    d = str(r.get("direction") or "1"); dirn = 1 if d == "2" else -1 if d == "3" else 0
    step = 1 if str(r.get("lev_diff")) == "2" else 0
    links.append([a, b, int(round(float(r["distance"]) * 10)), RT.get(str(r.get("route_type")), 0), dirn, step])

# 行き先の重複を消す（同じ名前・同じ階で 60 m 以内）
out = []
for p in places:
    if any(q["n"] == p["n"] and q["c"] == p["c"] and q["o"] == p["o"] and math.hypot(q["p"][0] - p["p"][0], q["p"][1] - p["p"][1]) < 120 for q in out): continue
    out.append(p)
places = sorted(out, key=lambda p: ({"gate": 0, "exit": 1, "link": 2, "mall": 3, "bldg": 4, "door": 5}[p["k"]], p["c"], p["n"]))

os.makedirs(os.path.join(ROOT, "data", "indoor"), exist_ok=True)
FL = sorted(o for o in geo if geo[o]["fl"] or geo[o]["sp"])
meta = {"o": [LA0, LO0], "k": [KX * Q, KY * Q], "q": Q, "fl": [[o, lv(o)] for o in FL], "pl": [[p["n"], p["c"], p["k"], p["o"]] + p["p"] for p in places],
        "nd": [v for n in nodes for v in n], "lk": [v for l in links for v in l],
        "fc": [[f[0], int(round(o * 2)), f[1], f[2]] for o in FL for f in geo[o]["fc"]],   # トイレ・エレベーター（«いちばん近いトイレ» を探すのに全部の階の分が要る）
        "src": "国土交通省「東京駅周辺屋内地図オープンデータ（令和2年度更新版）」（高精度測位社会プロジェクト・政府標準利用規約）を加工して作成"}
def w(name, obj, var):
    s = "/* 東京駅まわりの構内図（tools/build_indoor.py が作る。直さない）。出典: " + meta["src"] + " */\n" + var + " = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(ROOT, "data", "indoor", name), "w", encoding="utf-8").write(s); return len(s.encode("utf-8"))
tot = w("tokyo.js", meta, "RG.INDOOR")
for o in FL:
    g = geo[o]
    tot += w("tokyo_" + lv(o) + ".js", {"o": o, "fl": g["fl"], "sp": g["sp"], "lb": g["lb"]}, "RG.INDOORF = RG.INDOORF || {}; RG.INDOORF[" + json.dumps(lv(o)) + "]")
print("階:", [lv(o) for o in FL], " 行き先:", len(places), " 通路網:", len(nodes), "ノード", len(links), "リンク", " 合計", tot // 1024, "KB")
