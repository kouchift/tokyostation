# -*- coding: utf-8 -*-
"""v150〜v151: 駅の «構内図・通路の案内» のデータを作る（複数の地区）

地区の種類
  map … 構内図（階ごとの通路・部屋・設備の図形）＋ 歩行者の通路網。改札・出口・連絡口などを行き先に
  nw  … 歩行者の通路網だけ（多くは駅まわりの歩道・横断歩道・地下通路）。図形は通路の線で描く。行き先は駅と «図を押す»

出典（地区ごと。credits.html・画面にも書く）
  国土交通省「東京駅周辺屋内地図オープンデータ（令和2年度更新版）」「新宿駅周辺屋内地図オープンデータ（令和2年度更新版）」
    … G空間情報センター・政府標準利用規約。出典: 国土交通省 高精度測位社会プロジェクト
  国土交通省「歩行空間ネットワークデータ（○○）」「構内地図データ（都営地下鉄大江戸線 ○○駅）」
    … 歩行空間ナビ・データプラットフォーム（ほこナビDP）・公共データ利用規約（第1.0版）
  出口の番号の一部: © OpenStreetMap contributors（ODbL）（railway=subway_entrance の ref）

作るもの（画面が読む）
  assets/indoor_areas.js            … 地区の一覧（名前・範囲・関係する駅・大きさ）。まとめ（app.extra.js）に入る
  data/indoor/<地区>.js             … 階・行き先・通路網・トイレ/EV
  data/indoor/<地区>_<階>.js        … 階ごとの図形（開いた階だけ読む）
座標は «地区の中心を原点にした m»（0.5 m 単位の整数）

使い方: pip install pyshp --break-system-packages ; python tools/build_indoor.py [地区id …]（なしで全部）
  元データは一時フォルダ（tsg_indoor_src）へ取りにいく。リポジトリには入れない
"""
import os, io, sys, json, math, zipfile, tempfile, urllib.request, urllib.parse, collections, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(tempfile.gettempdir(), "tsg_indoor_src"); os.makedirs(TMP, exist_ok=True)
try:
    import shapefile
except ImportError:
    shapefile = None
HOKO = "https://ckan.hokonavi.go.jp/api/3/action/package_show?id="
OVERPASS_ALL = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]
SRC_MLIT = "国土交通省 高精度測位社会プロジェクト「{t}」（G空間情報センター・政府標準利用規約）を加工して作成"
SRC_HOKO = "国土交通省「{t}」（歩行空間ナビ・データプラットフォーム・公共データ利用規約 第1.0版）を加工して作成"

# ---------------------------------------------------------------- 地区の一覧
OEDO = [("tochomae", "station_oedo_tochomae", "都庁前"), ("shinjuku-nishiguchi", "station_oedo_shinjukunishiguchi", "新宿西口"),
        ("oedo-shinjuku", "station_oedo_shinjuku", "新宿"), ("yoyogi", "mlit_station_oedo_yoyogi", "代々木"),
        ("kokuritsu-kyogijo", "station_oedo_kokuritsu-kyogijo", "国立競技場"), ("aoyama-itchome", "oedo_aoyama-itchome", "青山一丁目"),
        ("roppongi", "mlit_station_oedo_roppongi", "六本木"), ("azabu-juban", "mlit_station_oedo_azabu-juban", "麻布十番"),
        ("akabanebashi", "station_oedo_akanabebashi", "赤羽橋"), ("daimon", "station_oedo_daimon", "大門"),
        ("higashi-shinjuku", "mlit_station_oedo_higashi-shinjuku", "東新宿"), ("ueno-okachimachi", "mlit_station_oedo_ueno-okachimachi", "上野御徒町")]
NW = [("ikebukuro", "nwd_ikebukuro", "池袋駅周辺（歩道）"), ("tokyo-nw", "nwd_tokyo", "東京駅周辺（歩道）"), ("shinjuku-nw", "nwd_shinjuku", "新宿駅周辺（歩道）"),
      ("shibuya-sendagaya", "nwd_shibuya_sendagaya_shinjuku", "渋谷・千駄ヶ谷・新宿（歩道）"), ("shibuya-south", "nwd_shibuya_south", "渋谷区南部（歩道）"),
      ("sendagaya", "nwd_sendagaya_station", "千駄ヶ谷駅周辺（歩道）"), ("national-stadium", "nwd_national_stadium", "国立競技場周辺（歩道）"),
      ("ueno", "nwd_ueno_station", "上野駅周辺（歩道）"), ("akabane", "nwd_akabane_station", "赤羽駅周辺（歩道）"), ("daimon-nw", "nwd_daimon_station", "大門駅周辺（歩道）"),
      ("chiyoda-chuo", "nwd_chiyoda_chuo", "皇居外苑・千代田区・中央区（歩道）"), ("shin-kiba", "nwd_shin-kiba_station", "新木場駅周辺（歩道）"),
      ("kokusai-tenjijo", "nwd_kokusai-tenjijo_station", "国際展示場周辺（歩道）"), ("ariake-tennis", "nwd_ariake_tennis", "有明テニスの森周辺（歩道）"),
      ("tokyo-teleport", "nwd_tokyo-teleport_staion", "東京テレポート駅周辺（歩道）"), ("odaiba-kaihin-koen", "nwd_odaiba-kaihin-koen_station", "お台場海浜公園周辺（歩道）"),
      ("fuchu", "nwd_fuchu", "府中市（歩道）")]
AREAS = [{"id": "tokyo", "k": "map", "src": "mlit", "n": "東京駅まわり（構内・地下通路）", "t": "東京駅周辺屋内地図オープンデータ（令和2年度更新版）", "upd": "2021-03",
          "url": "https://www.geospatial.jp/ckan/dataset/eb79c194-3f26-4c41-9b48-6664f4684ebc/resource/d441c885-6a15-476b-836d-cddd9a5fa006/download/shapefile.zip", "page": "https://www.geospatial.jp/ckan/dataset/mlit-indoor-tokyo-r2"},
         {"id": "shinjuku", "k": "map", "src": "mlit", "n": "新宿駅まわり（構内・地下街）", "t": "新宿駅周辺屋内地図オープンデータ（令和2年度更新版）", "upd": "2021-03",
          "url": "https://www.geospatial.jp/ckan/dataset/ecabe2e2-21a9-4a72-8dee-0b34e2c34fb6/resource/f78d039e-7bb6-4b6a-9f5f-2b5a39e309d6/download/shapefile.zip", "page": "https://www.geospatial.jp/ckan/dataset/mlit-indoor-shinjuku-r2"}]
AREAS += [{"id": i, "k": "map", "src": "hokomap", "n": "大江戸線 " + n + "駅（構内）", "st1": n, "pkg": p} for i, p, n in OEDO]
AREAS += [{"id": i, "k": "nw", "src": "hokonw", "n": n, "pkg": p} for i, p, n in NW]

# ---------------------------------------------------------------- 道具
def fetch(url, name):
    p = os.path.join(TMP, name)
    if not os.path.exists(p):
        print("  取りにいきます:", url[:100]); urllib.request.urlretrieve(url, p); time.sleep(0.5)
    return p
def pkg(pid):
    p = os.path.join(TMP, "pkg_" + pid + ".json")
    if not os.path.exists(p): urllib.request.urlretrieve(HOKO + pid, p); time.sleep(0.3)
    return json.load(open(p, encoding="utf-8"))["result"]
Q = 2
class Proj:
    def __init__(s, la0, lo0): s.la0, s.lo0 = la0, lo0; s.kx = 111320 * math.cos(math.radians(la0)); s.ky = 110574
    def __call__(s, lo, la): return [int(round((lo - s.lo0) * s.kx * Q)), int(round((s.la0 - la) * s.ky * Q))]
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
def dp(pts, tol):
    """Douglas-Peucker。閉じた輪は、いちばん遠い点で 2 つに分けてから（そのままだと両端が同じ点で全部消える）"""
    if len(pts) < 3: return pts
    if pts[0] == pts[-1]:
        m = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        if m == 0: return pts[:1]
        return _dp(pts[:m + 1], tol) + _dp(pts[m:], tol)[1:]
    return _dp(pts, tol)
def enc(pts):
    o = []; px = py = 0
    for x, y in pts: o += [x - px, y - py]; px, py = x, y
    return o
def fmt(v): return str(int(v)) if float(v) == int(v) else str(v)
def lv(o):
    o = float(o)
    if o >= 1: return fmt(o) + "F"
    if o == 0: return "GL"
    return "B" + fmt(-o)
DIR8 = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"]
def dir8(dx, dy): return DIR8[int(round((math.degrees(math.atan2(dx, -dy)) % 360) / 45)) % 8]   # dy は下向き
SPK = {"B029": "w", "B001": "s", "B007": "t", "B008": "t", "B009": "t", "B010": "t", "B011": "t", "B014": "t", "B021": "st", "B022": "ev", "B023": "es",
       "B024": "es", "B025": "sl", "B005": "tk", "B006": "if", "B004": "wr", "B016": "t", "B017": "if", "B003": "pb", "B015": "sm", "B028": "pf"}
FAC = {"F001": "t", "F002": "t", "F003": "t", "F005": "tm", "F008": "tm", "F012": "ev", "F035": "ev"}
RT = {"1": 0, "4": 1, "5": 2, "6": 3, "7": 4, "2": 5}                # 0 通路 1 EV 2 エスカレーター 3 階段 4 スロープ 5 動く歩道
def link_row(r, a, b, new=True):
    """[起点, 終点, 距離×10, 種別, 向き, 印]。印 = 段差（0: 2cm 以下 / 1: 2〜5cm / 2: 5cm 超・大きさ不明の «2cm 超» も 2）＋ 急な坂（8% 超）なら +4
       lev_diff・vtcl_slope のコードは仕様の版で違う: 国交省の屋内地図（2018 年の仕様）は 1: 2cm 以下 / 2: 2cm 超、
       ほこナビ（2024 年の仕様）は 1: 0cm / 2: 2cm 以下 / 3: 2〜5cm / 4: 5〜10cm / 5: 10cm 超"""
    d = str(r.get("direction") or "1"); dirn = 1 if d == "2" else -1 if d == "3" else 0
    lvd, vs = str(r.get("lev_diff")), str(r.get("vtcl_slope"))
    if new: step = 1 if lvd == "3" else 2 if lvd in ("4", "5") else 0; steep = vs in ("5", "6", "7", "8")
    else: step = 2 if lvd == "2" else 0; steep = vs in ("2", "3")
    step += 4 if steep else 0
    if str(r.get("route_type")) in ("4", "5", "6"): step = 0          # エレベーター・エスカレーター・階段そのものの段・坂は数えない（«階段» として別に扱う）
    try: dist = float(r.get("distance") or 0)
    except ValueError: dist = 0
    return [a, b, int(round(dist * 10)), RT.get(str(r.get("route_type")), 0), dirn, step]
def lstyle(r):
    """通路の線の見た目（nw 地区）: w 歩道 x 横断歩道 u 地下通路 i 建物の中 b 歩道橋 st 階段 ev エレベーター es エスカレーター"""
    rt, ty = str(r.get("rt_struct")), str(r.get("route_type"))
    if ty == "6": return "st"
    if ty == "4": return "ev"
    if ty == "5": return "es"
    return {"3": "x", "4": "x", "5": "u", "6": "b", "7": "i"}.get(rt, "w")

STATIONS = None
def stations_in(bb):
    global STATIONS
    if STATIONS is None:
        d = json.load(open(os.path.join(ROOT, "data", "net.json"), encoding="utf-8"))
        STATIONS = {}
        for s in d["stations"]:
            n, la, lo = s[1], s[2], s[3]
            if n and la and lo: STATIONS.setdefault(n, (la, lo))
    return [(n, la, lo) for n, (la, lo) in STATIONS.items() if bb[0] <= la <= bb[2] and bb[1] <= lo <= bb[3]]

def osm_entrances(bb):
    p = os.path.join(TMP, "osm_ent_%.4f_%.4f_%.4f_%.4f.json" % tuple(bb))
    if not os.path.exists(p):
        q = '[out:json][timeout:60];node["railway"="subway_entrance"](%f,%f,%f,%f);out;' % tuple(bb)
        err = None
        for k in range(6):                                           # 混んでいると 504 が返る。間をあけて別の窓口へ
            url = OVERPASS_ALL[k % len(OVERPASS_ALL)]
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "tokyostation-guide"})
                body = urllib.request.urlopen(req, timeout=90).read(); json.loads(body); open(p, "wb").write(body); err = None; time.sleep(1); break
            except Exception as e:
                err = e; time.sleep(5 + 5 * k)
        if err: print("  （OSM の出口番号は取れませんでした:", err, "）"); return []
    out = []
    for e in json.load(open(p, encoding="utf-8")).get("elements", []):
        t = e.get("tags", {}); ref = (t.get("ref") or "").strip()
        if ref and len(ref) <= 6: out.append((ref, e["lat"], e["lon"]))
    return out

class Area:
    def __init__(s, cfg, la0, lo0):
        s.cfg = cfg; s.P = Proj(la0, lo0); s.geo = collections.defaultdict(lambda: {"fl": [], "sp": [], "ln": [], "lb": []})
        s.places = []; s.nodes = []; s.links = []; s.fc = []; s.flname = {}
    def node(s, lo, la, o): s.nodes.append(s.P(lo, la) + [int(round(float(o) * 2))]); return len(s.nodes) - 1
    def bbox(s):
        xs = [n[0] for n in s.nodes]; ys = [n[1] for n in s.nodes]
        f = lambda x, y: (s.P.la0 - y / Q / s.P.ky, s.P.lo0 + x / Q / s.P.kx)
        a = f(min(xs), max(ys)); b = f(max(xs), min(ys))
        return [round(a[0], 5), round(a[1], 5), round(b[0], 5), round(b[1], 5)]

# ---------------------------------------------------------------- 国交省の屋内地図（Shapefile・東京/新宿）
AREA_T = {"1.JR東京駅": "JR東京駅", "2.地下鉄_公共通路": "地下鉄・地下通路", "7.イーヨ": "iiyo!!（東京ビル）", "15.オーテモリ": "OOTEMORI（大手町）", "16.other": "その他"}
SUB = {"ChiyodaHibiya": "千代田線 日比谷駅", "ChiyodaNiju": "千代田線 二重橋前駅", "ChiyodaOtemati": "千代田線 大手町駅", "GinzaGinza": "銀座線 銀座駅",
       "Hanzo": "半蔵門線 大手町駅", "HibiyaGinza": "日比谷線 銀座駅", "HibiyaHibiya": "日比谷線 日比谷駅", "HibiyaHigagin": "日比谷線 東銀座駅",
       "MaruGinza": "丸ノ内線 銀座駅", "MaruOtemati": "丸ノ内線 大手町駅", "MaruTokyo": "丸ノ内線 東京駅", "MitaHibiya": "三田線 日比谷駅",
       "MitaOtemati": "三田線 大手町駅", "Tozai": "東西線 大手町駅", "YurakuTika": "有楽町線 有楽町駅（地下通路）", "Yurakucho": "有楽町線 有楽町駅"}
def area_title(folder): return AREA_T.get(folder, re.sub(r"^\d+\.", "", folder).replace("_", "・"))
def build_mlit(cfg):
    if not shapefile: sys.exit("pyshp が要ります: pip install pyshp")
    Z = zipfile.ZipFile(fetch(cfg["url"], cfg["id"] + "_shp.zip")); FILES = {}
    for i in Z.infolist(): FILES[i.filename if i.flag_bits & 0x800 else i.filename.encode("cp437").decode("cp932")] = i
    def reader(base):
        parts = {e: io.BytesIO(Z.read(FILES[base + "." + e])) for e in ("shp", "shx", "dbf") if base + "." + e in FILES}
        for encd, err in (("utf-8", "strict"), ("cp932", "strict"), ("utf-8", "replace")):
            try:
                for v in parts.values(): v.seek(0)
                r = shapefile.Reader(shp=parts.get("shp"), shx=parts.get("shx"), dbf=parts.get("dbf"), encoding=encd, encodingErrors=err)
                f = [x[0] for x in r.fields[1:]]; return r.shapes(), [dict(zip(f, rec)) for rec in r.records()]
            except Exception: continue
        return [], []
    nbase = [k[:-4] for k in FILES if re.search(r"/nw/.*_node\.shp$", k, re.I)][0]
    lbase = [k[:-4] for k in FILES if re.search(r"/nw/.*_link\.shp$", k, re.I)][0]
    _, NR = reader(nbase)
    A = Area(cfg, sum(r["lat"] for r in NR) / len(NR), sum(r["lon"] for r in NR) / len(NR)); P = A.P
    def rings(sh):
        idx = list(sh.parts) + [len(sh.points)]
        return [[P(q[0], q[1]) for q in sh.points[idx[i]:idx[i + 1]]] for i in range(len(idx) - 1)]
    cen = lambda pts: [sum(q[0] for q in pts) // len(pts), sum(q[1] for q in pts) // len(pts)]
    bases = sorted(set(k[:-4] for k in FILES if k.endswith(".shp") and "/nw/" not in k))
    for base in bases:
        parts = base.split("/")
        if len(parts) < 4: continue
        folder, fn = parts[1], parts[3]; kind = fn.rsplit("_", 1)[-1]
        if "TWSI" in fn: continue
        ctx = SUB.get(fn.split("_")[0]) if (folder.startswith("2.") and cfg["id"] == "tokyo") else area_title(folder)
        shapes, recs = reader(base)
        fbase = base.rsplit("_", 1)[0] + "_Floor"
        fo = {r["id"]: float(r.get("ordinal") or 0) for r in (reader(fbase)[1] if fbase + ".shp" in FILES else [])}
        ordOf = lambda r: fo.get(r.get("floor_id"), 0.0)
        if kind == "Floor":
            for s, r in zip(shapes, recs):
                o = float(r.get("ordinal") or 0)
                for g in rings(s):
                    g = dp(g, 1.0)
                    if len(g) >= 3: A.geo[o]["fl"].append(enc(g))
        elif kind == "Space":
            for s, r in zip(shapes, recs):
                if str(r.get("nonpublic")) == "1": continue
                k = "x" if str(r.get("restricted")) == "1" else SPK.get(r.get("category"), "o")
                for g in rings(s):
                    g = dp(g, 0.8)
                    if len(g) >= 3: A.geo[ordOf(r)]["sp"].append([k] + enc(g))
        elif kind == "Facility":
            for s, r in zip(shapes, recs):
                if not s.points: continue
                o = ordOf(r); c = r.get("category"); n = (r.get("name") or "").strip(); p = P(*s.points[0][:2])
                if c in FAC: A.fc.append([FAC[c], int(round(o * 2))] + p)
                if not n or n in ("(段差解消用)", "段差解消機", "リフト入口", "不明") or re.search(r"階段$", n): continue
                if re.match(r"^[A-Z]?\d+[a-z]?$", n): A.places.append({"n": "出口 " + n, "c": ctx, "k": "exit", "o": o, "p": p})
                else: A.places.append({"n": n, "c": ctx, "k": "link" if re.search(r"連絡|方面|側|駅|線|口|ビル|通路|入口", n) else "exit", "o": o, "p": p})
        elif kind == "Opening":
            for s, r in zip(shapes, recs):
                n = (r.get("name") or "").strip()
                if not n or n in ("リフト入口", "不明") or not s.points: continue
                A.places.append({"n": n, "c": ctx, "k": "gate" if re.search(r"改札|口", n) else "door", "o": ordOf(r), "p": cen([P(*q[:2]) for q in s.points])})
        elif kind == "Segment":
            for s, r in zip(shapes, recs):
                n = (r.get("name") or "").strip()
                if not n or re.match(r"^[A-Za-z]", n) or not s.points: continue
                p = cen([P(*q[:2]) for q in s.points]); A.places.append({"n": n, "c": ctx, "k": "mall", "o": ordOf(r), "p": p}); A.geo[ordOf(r)]["lb"].append([n] + p)
    # ビル・施設の名前（そのフォルダのいちばん低い階の輪郭の中心）
    for folder in sorted(set(b.split("/")[1] for b in bases if len(b.split("/")) >= 4)):
        if (cfg["id"] == "tokyo" and folder.startswith(("1.", "2."))) or folder == "16.other": continue
        best = None
        for base in bases:
            if base.split("/")[1] == folder and base.endswith("_Floor"):
                shapes, recs = reader(base)
                for s, r in zip(shapes, recs):
                    if not s.points: continue
                    o = float(r.get("ordinal") or 0); c = cen([P(*q[:2]) for q in s.points])
                    if best is None or o < best[0]: best = (o, c)
        if best:
            nm = area_title(folder); A.places.append({"n": nm, "c": "施設", "k": "bldg", "o": best[0], "p": best[1]}); A.geo[best[0]]["lb"].append([nm] + best[1])
    nid = {}
    for r in NR: nid[r["node_id"]] = A.node(r["lon"], r["lat"], r["ordinal"])
    _, LR = reader(lbase)
    for r in LR:
        a, b = nid.get(r["start_id"]), nid.get(r["end_id"])
        if a is not None and b is not None: A.links.append(link_row(r, a, b, False))
    return A

# ---------------------------------------------------------------- ほこナビ: 大江戸線の構内地図＋通路網（GeoJSON）
def geojson_from_zip(z):
    return {os.path.basename(i.filename): json.loads(z.read(i).decode("utf-8-sig")) for i in z.infolist() if i.filename.lower().endswith(".geojson")}
def poly_rings(P, geom):
    if geom["type"] == "Polygon": cs = geom["coordinates"]
    elif geom["type"] == "MultiPolygon": cs = [r for pg in geom["coordinates"] for r in pg]
    else: cs = []
    return [[P(q[0], q[1]) for q in r] for r in cs]
def build_hokomap(cfg):
    R = pkg(cfg["pkg"]); cfg["t"] = R["title"].replace("歩行空間ネットワークデータ", "歩行空間ネットワークデータ・構内地図データ"); cfg["page"] = "https://ckan.hokonavi.go.jp/dataset/" + R["name"]
    cfg["upd"] = "2026-09"
    nwz = [x for x in R["resources"] if "歩行空間" in (x.get("name") or "") and "GeoJSON" in (x.get("name") or "")][0]
    mpz = [x for x in R["resources"] if "構内地図" in (x.get("name") or "") and "GeoJSON" in (x.get("name") or "")][0]
    NWJ = geojson_from_zip(zipfile.ZipFile(fetch(nwz["url"], cfg["id"] + "_nw.zip"))); MPJ = geojson_from_zip(zipfile.ZipFile(fetch(mpz["url"], cfg["id"] + "_map.zip")))
    N = NWJ["node.geojson"]["features"]; L = NWJ["link.geojson"]["features"]
    A = Area(cfg, sum(f["properties"]["lat"] for f in N) / len(N), sum(f["properties"]["lon"] for f in N) / len(N)); P = A.P
    fo = {}; flname = {}
    for fn, gj in MPJ.items():
        if "Floor" in fn[:-8].split("_"):
            for f in gj["features"]:
                pr = f["properties"]; fo[pr["id"]] = float(pr["ordinal"]); flname[float(pr["ordinal"])] = pr.get("name") or ""
    gates, exits = [], []
    for fn, gj in MPJ.items():
        toks = fn[:-8].split("_"); kind = next((t for t in ("Floor", "Space", "Facility", "Fixture", "Opening") if t in toks), "")   # «駅_Floor_B1» も «駅_B1_Floor» もある
        for f in gj["features"]:
            pr = f["properties"]; g = f["geometry"]
            if not g: continue
            o = float(pr.get("ordinal")) if kind == "Floor" else fo.get(pr.get("floor_id"), 0.0)
            if kind == "Floor":
                for r in poly_rings(P, g):
                    r = dp(r, 1.0)
                    if len(r) >= 3: A.geo[o]["fl"].append(enc(r))
            elif kind == "Space":
                if str(pr.get("nonpublic")) == "1": continue
                k = "x" if str(pr.get("restricted")) == "1" else SPK.get(pr.get("category"), "o")
                for r in poly_rings(P, g):
                    r = dp(r, 0.8)
                    if len(r) >= 3: A.geo[o]["sp"].append([k] + enc(r))
            elif kind == "Facility" and g["type"] == "Point":
                c = pr.get("category"); p = P(*g["coordinates"][:2])
                if c in FAC: A.fc.append([FAC[c], int(round(o * 2))] + p)
                if c == "F106": gates.append((o, p))
                if c == "F108": exits.append((o, p, g["coordinates"]))
    nid = {}
    for f in N:
        pr = f["properties"]; nid[pr["node_id"]] = A.node(pr["lon"], pr["lat"], pr["floor"])
    for f in L:
        pr = f["properties"]; a, b = nid.get(pr["start_id"]), nid.get(pr["end_id"])
        if a is not None and b is not None: A.links.append(link_row(pr, a, b))
    st = cfg["st1"]; ctx = "大江戸線 " + st + "駅"
    cx = sum(n[0] for n in A.nodes) / len(A.nodes); cy = sum(n[1] for n in A.nodes) / len(A.nodes)
    fname = lambda o: flname.get(o) or lv(o)
    cnt = collections.Counter()
    for o, p in gates:
        lab = "改札（" + fname(o) + "・" + dir8(p[0] - cx, p[1] - cy) + "寄り）"; cnt[lab] += 1
        A.places.append({"n": lab + ("" if cnt[lab] == 1 else " " + str(cnt[lab])), "c": ctx, "k": "gate", "o": o, "p": p})
    bb = A.bbox(); ent = osm_entrances([bb[0] - 0.002, bb[1] - 0.002, bb[2] + 0.002, bb[3] + 0.002])
    cnt = collections.Counter()
    for o, p, ll in exits:
        best = None; bd = 30
        for ref, la, lo in ent:
            d = math.hypot((lo - ll[0]) * P.kx, (la - ll[1]) * P.ky)
            if d < bd: best, bd = ref, d
        lab = ("出口 " + best) if best else "出口（" + fname(o) + "・" + dir8(p[0] - cx, p[1] - cy) + "側）"
        cnt[lab] += 1; A.places.append({"n": lab + ("" if cnt[lab] == 1 else " " + str(cnt[lab])), "c": ctx, "k": "exit", "o": o, "p": p})
    deep = min(n[2] for n in A.nodes); dn = [n for n in A.nodes if n[2] == deep]
    c = [sum(n[0] for n in dn) // len(dn), sum(n[1] for n in dn) // len(dn)]
    A.places.append({"n": "ホームのある階（" + fname(deep / 2) + "）", "c": ctx, "k": "plat", "o": deep / 2, "p": c})
    A.flname = flname
    return A

# ---------------------------------------------------------------- ほこナビ: 通路網だけ（GeoJSON）
def build_hokonw(cfg):
    R = pkg(cfg["pkg"]); cfg["t"] = R["title"]; cfg["page"] = "https://ckan.hokonavi.go.jp/dataset/" + R["name"]
    m = re.search(r"最終更新日[:：]\s*(\d{4})/(\d{1,2})", R.get("notes") or ""); cfg["upd"] = (m.group(1) + "-" + m.group(2).zfill(2)) if m else (R.get("metadata_modified") or "")[:7]
    res = {os.path.basename(x["url"]): x["url"] for x in R["resources"]}
    nj = json.load(open(fetch(res["node.geojson"], cfg["id"] + "_node.geojson"), encoding="utf-8-sig"))["features"]
    lj = json.load(open(fetch(res["link.geojson"], cfg["id"] + "_link.geojson"), encoding="utf-8-sig"))["features"]
    ll = [f["geometry"]["coordinates"] for f in nj if f.get("geometry")]
    A = Area(cfg, sum(c[1] for c in ll) / len(ll), sum(c[0] for c in ll) / len(ll)); P = A.P
    nid = {}
    for f in nj:
        pr = f["properties"]; g = f.get("geometry")
        if not g: continue
        try: o = float(pr.get("floor") or 0)
        except ValueError: o = 0
        nid[pr["node_id"]] = A.node(g["coordinates"][0], g["coordinates"][1], o)
    for f in lj:
        pr = f["properties"]; a, b = nid.get(pr["start_id"]), nid.get(pr["end_id"])
        if a is None or b is None: continue
        A.links.append(link_row(pr, a, b))
        g = f.get("geometry")
        if not g: continue
        cs = g["coordinates"] if g["type"] == "LineString" else [q for part in g["coordinates"] for q in part]
        pts = dp([P(q[0], q[1]) for q in cs], 1.2)
        A.geo[max(A.nodes[a][2], A.nodes[b][2]) / 2]["ln"].append([lstyle(pr)] + enc(pts))
    xs = A.nodes[::2]
    for n, la, lo in stations_in(A.bbox()):
        x, y = P(lo, la)
        if not any((q[0] - x) ** 2 + (q[1] - y) ** 2 < (200 * Q) ** 2 for q in xs): continue   # 通路網から 200 m より遠い駅は行き先にしない
        A.places.append({"n": n if re.search(r"(駅|停留場|停留所)$", n) else n + "駅", "c": "駅の代表点", "k": "st", "o": 0.0, "p": P(lo, la)})
    return A

# ---------------------------------------------------------------- 書き出し
ORDER = {"gate": 0, "exit": 1, "plat": 2, "st": 3, "link": 4, "mall": 5, "bldg": 6, "door": 7}
def dedupe(places):
    out = []
    for p in places:
        if any(q["n"] == p["n"] and q["c"] == p["c"] and q["o"] == p["o"] and math.hypot(q["p"][0] - p["p"][0], q["p"][1] - p["p"][1]) < 120 for q in out): continue
        out.append(p)
    return sorted(out, key=lambda p: (ORDER[p["k"]], p["c"], p["n"]))
def write_area(A):
    cfg = A.cfg; aid = cfg["id"]
    if cfg["k"] == "map": FL = sorted(o for o in A.geo if A.geo[o]["fl"] or A.geo[o]["sp"])
    else:
        c = collections.Counter(n[2] / 2 for n in A.nodes)
        FL = sorted(f for f in set(float(round(o)) for o in c) if sum(v for k, v in c.items() if round(k) == f) >= 3) or [0.0]
        for o in list(A.geo):                                            # 線は近い階へまとめる
            t = min(FL, key=lambda f: (abs(f - o), -f))
            if t != o: A.geo[t]["ln"] += A.geo[o]["ln"]; del A.geo[o]
    names = {o: lv(o) for o in FL}
    src = (SRC_MLIT if cfg["src"] == "mlit" else SRC_HOKO).format(t=cfg["t"])
    places = dedupe(A.places)
    meta = {"id": aid, "k": cfg["k"], "n": cfg["n"], "o": [A.P.la0, A.P.lo0], "kk": [A.P.kx * Q, A.P.ky * Q], "q": Q,
            "fl": [[o, names[o], A.flname.get(o, "")] for o in FL], "pl": [[p["n"], p["c"], p["k"], p["o"]] + p["p"] for p in places],
            "nd": [v for n in A.nodes for v in n], "lk": [v for l in A.links for v in l], "fc": A.fc, "src": src, "upd": cfg.get("upd", "")}
    os.makedirs(os.path.join(ROOT, "data", "indoor"), exist_ok=True)
    def w(name, obj, var):
        s = "/* 構内図・通路の案内（tools/build_indoor.py が作る。直さない）。出典: " + src + " */\n" + var + " = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
        open(os.path.join(ROOT, "data", "indoor", name), "w", encoding="utf-8").write(s); return len(s.encode("utf-8"))
    size = w(aid + ".js", meta, "RG.INDOOR = RG.INDOOR || {}; RG.INDOOR[" + json.dumps(aid) + "]")
    for o in FL:
        g = A.geo[o]
        size += w(aid + "_" + names[o] + ".js", {"o": o, "fl": g["fl"], "sp": g["sp"], "ln": g["ln"], "lb": g["lb"]}, "RG.INDOORF = RG.INDOORF || {}; RG.INDOORF[" + json.dumps(aid + "/" + names[o]) + "]")
    bb = A.bbox()
    def near_net(la, lo, lim=200):                                   # 駅の代表点から 200 m 以内に通路網がある駅だけ（範囲の四角に入るだけの駅は外す）
        x, y = A.P(lo, la)
        return any((nd[0] - x) ** 2 + (nd[1] - y) ** 2 < (lim * Q) ** 2 for nd in A.nodes[::3])
    sts = [cfg["st1"]] if cfg.get("st1") else sorted(set(n for n, la, lo in stations_in(bb) if near_net(la, lo)))
    print("%-20s %-4s 階 %-30s 行き先 %4d  ノード %6d リンク %6d  %5d KB" % (aid, cfg["k"], ",".join(names[o] for o in FL), len(places), len(A.nodes), len(A.links), size // 1024))
    return {"id": aid, "n": cfg["n"], "k": cfg["k"], "bb": bb, "st": sts, "kb": size // 1024, "upd": cfg.get("upd", ""), "t": cfg["t"], "page": cfg.get("page", "")}

def main():
    want = set(sys.argv[1:])
    idx_p = os.path.join(ROOT, "assets", "indoor_areas.js")
    old = {}
    if os.path.exists(idx_p):
        m = re.search(r"RG\.INDOOR_AREAS = (\[.*\]);", open(idx_p, encoding="utf-8").read(), re.S)
        if m: old = {a["id"]: a for a in json.loads(m.group(1))}
    out = []
    for cfg in AREAS:
        if want and cfg["id"] not in want:
            if cfg["id"] in old: out.append(old[cfg["id"]])
            continue
        A = {"mlit": build_mlit, "hokomap": build_hokomap, "hokonw": build_hokonw}[cfg["src"]](cfg)
        out.append(write_area(A))
    s = ("/* v151: 構内図・通路の案内のある地区（tools/build_indoor.py が作る。直さない）\n"
         "   id / n 名前 / k map=構内図・nw=通路網だけ / bb 範囲 [南,西,北,東] / st 関係する駅 / kb 大きさ / upd データの更新 / t 元データの名前 / page 元データのページ */\n"
         "RG.INDOOR_AREAS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    open(idx_p, "w", encoding="utf-8").write(s)
    print("地区", len(out))

if __name__ == "__main__":
    main()
