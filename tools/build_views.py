# -*- coding: utf-8 -*-
"""
全国の絶景スポット（data/views_jp.js）を作る。

■ ねらい
  東京では見られない景色（滝・渚・棚田・峡谷・岬・湖・夜景・名勝 …）を
  全国 47 都道府県から、写真つきで 1,500〜3,000 か所集める。

■ 出典（すべて商用レビューサイトを使わない）
  1. 国指定の名勝・特別名勝 …… Wikidata の「文化財指定 (P1435)」
       特別名勝 = Q94987823 / 名勝 = Q11414752
  2. 「百選」などの一覧記事（日本語版 Wikipedia）
       日本の滝百選・日本の渚百選・日本の白砂青松100選・日本の棚田百選・日本百景・
       新日本旅行地100選・日本の夕陽百選・日本三大夜景・日本新三大夜景・日本夜景遺産・
       森林浴の森100選・日本の秘境100選・名水百選（座標のあるものだけ）・日本の道100選・
       快水浴場百選・新日本三景・日本三景・日本百名山
       一覧記事の wikitext から [[リンク]] を拾い、pageprops で Wikidata の QID に解決する。
  3. Wikidata の分類（P31/P279*）で 日本 (P17=Q17) にあり座標 (P625) をもつもの
       展望台・展望塔・滝・峡谷・渓谷・岬・湖・崖・砂丘・湿原・高原
       （日本語版 Wikipedia の記事があるもの = 一定の知名度があるもの だけ）
  座標・写真 (P18)・説明・公式サイト (P856) は Wikidata。写真がないときは
  日本語版 Wikipedia の pageimages（記事の代表画像）を使う。

■ 都道府県・市区町村
  data/geo/pref.json, data/geo/muni.json（国土数値情報 → TopoJSON）で点の内外判定。
  海岸線の簡略化で外に出た点は、5 km 以内でいちばん近い市区町村に寄せる。
  それでも決まらないものは Wikidata の P131（所在する行政区）をたどる。

■ 出力（data/views_jp.js）
  RG.VIEWS_JP = [ {n,la,lo,pf,mu,k,tags,img,wp,d,q,web,s}, ... ]
  RG.MUNI_WEB = { "都道府県 市区町村": "公式サイト", ... }

  s（見どころの目安）
    5.0 特別名勝 / 日本三景 / 日本三大夜景・日本新三大夜景
    4.5 名勝、または 2 つ以上の百選に入っている
    4.0 百選 1 つに入っている
    3.5 分類だけ（Wikipedia の記事はある）
  k（種類）
    滝 渚 夜景 展望 峡谷 岬 湖 棚田 庭園 名勝 海岸 湿原 高原 山 その他

使い方:  python3 tools/build_views.py        （API 応答は /tmp/views_cache に保存。再実行は速い）
         python3 tools/build_views.py --fresh（キャッシュを捨てて取り直す）
"""
import json, os, re, sys, time, math, hashlib, datetime, collections
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CACHE = "/tmp/views_cache"
os.makedirs(CACHE, exist_ok=True)
FRESH = "--fresh" in sys.argv

UA = {"User-Agent": "tokyostation-views/1.0 (scenic viewpoints dataset; contact via repository)"}
S = requests.Session()
S.headers.update(UA)

SPARQL = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
JA_API = "https://ja.wikipedia.org/w/api.php"


# ---------------------------------------------------------------- HTTP（礼儀正しく：間隔・再試行・キャッシュ）
_last = [0.0]


def _get(url, params, min_gap=0.25, tries=7):
    key = hashlib.sha1((url + json.dumps(params, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
    cf = os.path.join(CACHE, key + ".json")
    if not FRESH and os.path.exists(cf):
        return json.load(open(cf, encoding="utf-8"))
    for i in range(tries):
        gap = time.time() - _last[0]
        if gap < min_gap:
            time.sleep(min_gap - gap)
        try:
            r = S.get(url, params=params, timeout=180)
            _last[0] = time.time()
            if r.status_code == 429 or r.status_code >= 500:
                wait = r.headers.get("Retry-After")
                wait = float(wait) if wait and wait.replace(".", "").isdigit() else 3.0 * (i + 1)
                print(f"    HTTP {r.status_code} → {min(wait, 60):.0f}s 待つ", file=sys.stderr)
                time.sleep(min(wait, 60))
                continue
            r.raise_for_status()
            data = r.json()
            json.dump(data, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
            return data
        except (requests.RequestException, ValueError) as e:
            print(f"    再試行 {i + 1}: {e}", file=sys.stderr)
            time.sleep(3.0 * (i + 1))
    raise RuntimeError("取得できませんでした: " + url + " " + str(params)[:200])


def sparql(q):
    return _get(SPARQL, {"query": q, "format": "json"}, min_gap=1.0)["results"]["bindings"]


def qid_of(uri):
    return uri.rsplit("/", 1)[-1]


# ---------------------------------------------------------------- 1. 名勝・特別名勝
DESIG = {"Q94987823": "特別名勝", "Q11414752": "名勝"}

# ---------------------------------------------------------------- 3. 分類（P31/P279*）
CLASSES = [
    ("Q177305", "展望台"), ("Q1440300", "展望台"),
    ("Q34038", "滝"),
    ("Q150784", "峡谷"), ("Q2042028", "峡谷"), ("Q39816", "峡谷(valley)"),
    ("Q185113", "岬"),
    ("Q23397", "湖"),
    ("Q107679", "海岸(cliff)"),
    ("Q25391", "砂丘"),
    ("Q170321", "湿原"),
    ("Q75520", "高原"), ("Q11668898", "高原"),
]

# ---------------------------------------------------------------- 2. 百選など
LISTS = [
    "日本の滝百選", "日本の渚百選", "日本の白砂青松100選", "日本の棚田百選", "日本百景",
    "新日本旅行地100選", "日本の夕陽百選", "日本夜景遺産", "森林浴の森100選",
    "日本の秘境100選", "名水百選", "平成の名水百選", "日本の道100選", "快水浴場百選",
    "日本百名山",
]
# 短い記事は本文リンクのノイズが多いので、構成地点を直接書く
FIXED_LISTS = {
    "日本三景": ["松島", "天橋立", "厳島"],
    "新日本三景": ["大沼 (七飯町)", "三保の松原", "耶馬渓"],
    "日本三大夜景": ["函館山", "摩耶山", "稲佐山"],
    "日本新三大夜景": ["皿倉山", "若草山", "笛吹川フルーツ公園", "藻岩山", "稲佐山"],
}
TOP_LISTS = {"日本三景", "日本三大夜景", "日本新三大夜景"}      # s=5.0 になる一覧
NIGHT_LISTS = {"日本三大夜景", "日本新三大夜景", "日本夜景遺産"}

# 一覧記事に混ざる「場所ではないもの」「広すぎるもの」を落とす（P31 の日本語ラベルで判定）
NOISE_CLASS = re.compile(
    "(^|の)(市|町|村|区|郡|都道府県|都|道|府|県|支庁|振興局|特別区|政令指定都市|中核市|施行時特例市|自治体|市町村|国)$|"
    "行政区画|地方公共団体|廃止|かつて存在|特例市|都市$|人間|人物|企業|会社|団体|組織|省庁|行政機関|政府機関|"
    "鉄道駅|路線|道路|国道|県道|高速道路|バス停|トンネル|中継局|放送局|美術館|博物館|調節池|"
    "山地|山脈|山系|半島|平野|盆地|諸島|列島|海峡|水系|水道$|湾$|海$|地域$|地方$|旧国|令制国|"
    "一覧記事|一覧$|曖昧さ回避|^年$|大学|学校|空港|港湾|^港$|ダム$|発電所"
)
MAIN_ISLANDS = {"本州", "北海道", "九州", "四国", "沖縄本島", "日本列島"}
# 一覧記事から拾ったタグは、名前がその種類らしいときだけ残す（表の他の列のリンクを除くため）
TAG_NAME_RE = {
    "日本百名山": re.compile("山|岳|峰|嶺|平$|原$|富士"),
    "日本の滝百選": re.compile("滝|瀑|タキ|不動"),
    "日本の棚田百選": re.compile("棚田|千枚田|田"),
}
ADMIN_QIDS = {"Q494721", "Q1059478", "Q4174776", "Q137773", "Q5327704", "Q1749269", "Q1137833",
              "Q1145012", "Q1549591", "Q18663566",
              "Q1054813", "Q50337", "Q1122846", "Q5", "Q4022", "Q55488", "Q34442", "Q23442"}
# P31 のない項目は名前で判定
NAME_NOISE = re.compile("中継局|放送局|送信所|美術館|博物館|変電所|工業団地|市$")
# Q4022 河川 / Q23442 島 は一覧記事から来たものだけ通す（class で拾うことはない）
SOFT_QIDS = {"Q4022", "Q23442"}

PREF_RE = re.compile("(北海道|(?:京都|大阪)府|東京都|.{2,3}県)")


# ---------------------------------------------------------------- 都道府県・市区町村ポリゴン（TopoJSON）
def decode_topo(path):
    topo = json.load(open(path, encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts[1:] if out else pts)
        return out

    feats = []
    for g in topo["objects"]["g"]["geometries"]:
        if g["type"] == "Polygon":
            polys = [[ring(r) for r in g["arcs"]]]
        elif g["type"] == "MultiPolygon":
            polys = [[ring(r) for r in poly] for poly in g["arcs"]]
        else:
            continue
        rings = []
        for poly in polys:
            outer = poly[0]
            xs = [p[0] for p in outer]
            ys = [p[1] for p in outer]
            rings.append((min(xs), min(ys), max(xs), max(ys), outer, poly[1:]))
        feats.append((g["properties"], rings))
    return feats


def pip(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def locate(feats, lo, la, near_km=5.0):
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 <= lo <= x1 and y0 <= la <= y1 and pip(lo, la, outer):
                if not any(pip(lo, la, h) for h in holes):
                    return props, 0.0
    # 海岸の簡略化で外に出た点 → 近い外周頂点で判定
    best = (None, near_km)
    ky = 111.0
    kx = 111.0 * math.cos(math.radians(la))
    dd = near_km / 111.0
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 - dd <= lo <= x1 + dd and y0 - dd <= la <= y1 + dd:
                for px, py in outer:
                    d = math.hypot((px - lo) * kx, (py - la) * ky)
                    if d < best[1]:
                        best = (props, d)
    return best


# ---------------------------------------------------------------- Wikidata エンティティ
def wb_entities(qids, props="labels|descriptions|claims|sitelinks"):
    out = {}
    qids = sorted(set(q for q in qids if q))
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        r = _get(WD_API, {"action": "wbgetentities", "ids": "|".join(chunk), "props": props,
                          "languages": "ja|en", "sitefilter": "jawiki", "format": "json"}, min_gap=1.5)
        for k, e in r.get("entities", {}).items():
            if "missing" not in e:
                out[k] = e
        if (i // 50) % 10 == 0:
            print(f"    entities {min(i + 50, len(qids))}/{len(qids)}", file=sys.stderr)
    return out


def claim_vals(e, prop):
    vals = []
    for c in e.get("claims", {}).get(prop, []):
        if c.get("rank") == "deprecated":
            continue
        dv = c.get("mainsnak", {}).get("datavalue")
        if not dv:
            continue
        v = dv["value"]
        if dv["type"] == "wikibase-entityid":
            v = v["id"]
        vals.append((c.get("rank") == "preferred", v))
    vals.sort(key=lambda t: not t[0])
    return [v for _, v in vals]


def label(e, lang="ja"):
    return (e.get("labels", {}).get(lang) or {}).get("value")


# ---------------------------------------------------------------- 日本語版 Wikipedia
def wikitext(title):
    r = _get(JA_API, {"action": "parse", "page": title, "prop": "wikitext", "redirects": 1,
                      "format": "json", "formatversion": 2})
    return r.get("parse", {}).get("wikitext", "")


LINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]")
NS_RE = re.compile(r"^(ファイル|画像|File|Image|Category|カテゴリ|Template|テンプレート|Wikipedia|Help|ヘルプ|"
                   r"Special|特別|Portal|プロジェクト|Project|wikt|w|en|commons|s|q|b|n|v|d|m):", re.I)


def list_titles(title):
    """一覧記事の 箇条書き行・表の行 にあるリンク先だけを拾う（本文中のリンクはノイズになりやすい）"""
    wt = wikitext(title)
    titles = []
    for line in wt.split("\n"):
        s = line.strip()
        if not s or s[0] not in "*#|!{":
            continue
        for m in LINK_RE.finditer(s):
            t = m.group(1).strip()
            if not t or NS_RE.match(t) or t.startswith(":"):
                continue
            t = t[0].upper() + t[1:] if t[0].isascii() else t
            titles.append(t.replace("_", " "))
    seen = set()
    return [t for t in titles if not (t in seen or seen.add(t))]


def titles_to_qids(titles):
    """jawiki のページ名 → QID（リダイレクトを追う）"""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1,
                          "titles": "|".join(chunk), "format": "json", "formatversion": 2})
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        by_title = {}
        for p in q.get("pages", []):
            qid = (p.get("pageprops") or {}).get("wikibase_item")
            if qid:
                by_title[p["title"]] = qid
        for t in chunk:
            tt = t
            for _ in range(3):
                tt = alias.get(tt, tt)
            if tt in by_title:
                out[t] = by_title[tt]
    return out


def page_images(titles):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "pageimages", "piprop": "name", "pilicense": "any",
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2})
        for p in r.get("query", {}).get("pages", []):
            if p.get("pageimage"):
                out[p["title"]] = p["pageimage"]
    return out


def page_coords(titles):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "coordinates", "coprimary": "primary", "colimit": "max",
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2})
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for p in q.get("pages", []):
            co = p.get("coordinates") or []
            if co and (co[0].get("globe", "earth") == "earth"):
                got[p["title"]] = (co[0]["lat"], co[0]["lon"])
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
    return out


def desig_pre(e, c):
    return bool(c["desig"]) or any(d in DESIG for d in claim_vals(e, "P1435"))


# ---------------------------------------------------------------- 種類の判定
def kind_of(name, tags, classes, desig):
    j = name
    if any(t in NIGHT_LISTS for t in tags):
        return "夜景"
    if "日本の滝百選" in tags or "滝" in classes or re.search("滝|瀑|タキ", j):
        return "滝"
    if "日本の棚田百選" in tags or re.search("棚田|千枚田", j):
        return "棚田"
    if "展望台" in classes or re.search("展望|スカイ|見晴", j):
        return "展望"
    if "岬" in classes or re.search("岬|崎$|鼻$|埼$", j):
        return "岬"
    if "峡谷" in classes or "峡谷(valley)" in classes or re.search("峡|渓谷|渓$|谷$|廊下", j):
        return "峡谷"
    if "湿原" in classes or re.search("湿原|湿地|泥炭", j):
        return "湿原"
    if "砂丘" in classes or re.search("砂丘", j):
        return "海岸"
    if "湖" in classes or re.search("湖|沼$|沼群|池$|潟$|ダム湖", j) and not re.search("庭園|公園", j):
        return "湖"
    if "高原" in classes or re.search("高原|草原|台地|湿原|平$", j):
        return "高原"
    if "日本の渚百選" in tags or "快水浴場百選" in tags or "日本の白砂青松100選" in tags \
            or re.search("浜$|浜海岸|海水浴場|渚|ビーチ|砂浜|松原|白浜", j):
        return "渚"
    if "海岸(cliff)" in classes or re.search("海岸|海食|断崖|奇岩|礁|岩$|洞門|海中|入り江|海蝕|絶壁", j):
        return "海岸"
    if re.search("庭園|御苑|楽園$|園$|苑$|庭$", j) and desig:
        return "庭園"
    if "日本百名山" in tags or re.search("山$|岳$|峰$|富士$|山 \\(", j):
        return "山"
    if desig:
        return "名勝"
    return "その他"


def score(tags, desig):
    if "特別名勝" in desig or any(t in TOP_LISTS for t in tags):
        return 5.0
    if desig or len(tags) >= 2:
        return 4.5
    if tags:
        return 4.0
    return 3.5


# ---------------------------------------------------------------- main
def main():
    print("■ ポリゴン読み込み", file=sys.stderr)
    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
    munis = decode_topo(os.path.join(ROOT, "data/geo/muni.json"))
    pref_by_code = {p["c"]: p["n"] for p, _ in prefs}
    pref_names = set(pref_by_code.values())

    cand = collections.defaultdict(lambda: {"tags": set(), "classes": set(), "desig": set(), "src": set()})

    print("■ 1. 名勝・特別名勝（Wikidata）", file=sys.stderr)
    rows = sparql("""
      SELECT DISTINCT ?i ?d WHERE {
        VALUES ?d { wd:Q94987823 wd:Q11414752 }
        { ?i wdt:P1435 ?d } UNION { ?i wdt:P31 ?d }
        ?i wdt:P625 ?co .
      }""")
    for r in rows:
        q = qid_of(r["i"]["value"])
        cand[q]["desig"].add(DESIG[qid_of(r["d"]["value"])])
        cand[q]["src"].add("名勝")
    print(f"    {len(rows)} 件", file=sys.stderr)

    print("■ 3. 分類（Wikidata, 日本, 座標あり, jawiki 記事あり）", file=sys.stderr)
    for cq, cname in CLASSES:
        rows = sparql(f"""
          SELECT DISTINCT ?i WHERE {{
            ?i wdt:P31/wdt:P279* wd:{cq} ; wdt:P17 wd:Q17 ; wdt:P625 ?co .
            ?a schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> .
          }}""")
        for r in rows:
            q = qid_of(r["i"]["value"])
            cand[q]["classes"].add(cname)
            cand[q]["src"].add("class")
        print(f"    {cname} {cq}: {len(rows)} 件", file=sys.stderr)

    print("■ 2. 百選などの一覧記事（jawiki）", file=sys.stderr)
    list_stats = {}
    unparsed = []
    for lt in LISTS:
        try:
            titles = list_titles(lt)
        except Exception as e:
            print(f"    {lt}: 解析できず {e}", file=sys.stderr)
            unparsed.append(lt)
            continue
        if not titles:
            unparsed.append(lt)
            print(f"    {lt}: リンクなし", file=sys.stderr)
            continue
        m = titles_to_qids(titles)
        for t, q in m.items():
            cand[q]["tags"].add(lt)
            cand[q]["src"].add("list")
        list_stats[lt] = [len(titles), len(m), 0]
        print(f"    {lt}: リンク {len(titles)} → QID {len(m)}", file=sys.stderr)
    for lt, titles in FIXED_LISTS.items():
        m = titles_to_qids(titles)
        for t, q in m.items():
            cand[q]["tags"].add(lt)
            cand[q]["src"].add("list")
        list_stats[lt] = [len(titles), len(m), 0]
        print(f"    {lt}: {len(titles)} → QID {len(m)}", file=sys.stderr)

    # 「平成の名水百選」は「名水百選」にまとめる
    for q, c in cand.items():
        if "平成の名水百選" in c["tags"]:
            c["tags"].discard("平成の名水百選")
            c["tags"].add("名水百選")

    print(f"■ エンティティ取得 {len(cand)} 件", file=sys.stderr)
    ents = wb_entities(list(cand))

    # P31 のラベル（ノイズ判定用）と P131 の連鎖（都道府県フォールバック用）
    p31s = set()
    for e in ents.values():
        p31s.update(claim_vals(e, "P31"))
    print(f"■ P31 ラベル {len(p31s)} 件", file=sys.stderr)
    p31_ents = wb_entities(list(p31s), props="labels")
    p31_label = {q: (label(e) or label(e, "en") or "") for q, e in p31_ents.items()}

    # 一覧記事から来て Wikidata に座標がないもの → jawiki の座標（{{ウィキ座標}}）
    need_co = []
    for q, c in cand.items():
        e = ents.get(q)
        if e and c["tags"] and not claim_vals(e, "P625"):
            t = (e.get("sitelinks", {}).get("jawiki") or {}).get("title")
            if t:
                need_co.append(t)
    print(f"■ jawiki 座標補完 {len(need_co)} 件", file=sys.stderr)
    ja_coords = page_coords(need_co)
    print(f"    {len(ja_coords)} 件で座標が見つかった", file=sys.stderr)

    print("■ 整形", file=sys.stderr)
    spots = {}
    drop = collections.Counter()
    need_p131 = {}
    for q, c in cand.items():
        e = ents.get(q)
        if not e:
            drop["entity なし"] += 1
            continue
        cls = claim_vals(e, "P31")
        cls_labels = [p31_label.get(x, "") for x in cls]
        hard = [x for x in cls if x in ADMIN_QIDS and not (x in SOFT_QIDS and c["tags"])]
        if hard or any(NOISE_CLASS.search(l) for l in cls_labels if l):
            # ただし 名勝指定があるものは通す（庭園・公園は市の一部でも指定される）
            if not c["desig"]:
                drop["ノイズ分類 " + (cls_labels[0] if cls_labels else "?")] += 1
                continue
        coords = claim_vals(e, "P625")
        if coords:
            co = coords[0]
            la, lo = float(co["latitude"]), float(co["longitude"])
        else:
            wpt = (e.get("sitelinks", {}).get("jawiki") or {}).get("title")
            if not (c["tags"] and wpt and wpt in ja_coords):
                drop["座標なし"] += 1
                continue
            la, lo = ja_coords[wpt]
        if not (20.0 <= la <= 46.0 and 122.0 <= lo <= 154.0):
            drop["日本の外"] += 1
            continue
        p17 = claim_vals(e, "P17")
        if p17 and "Q17" not in p17:
            drop["P17 が日本でない"] += 1
            continue
        wp = (e.get("sitelinks", {}).get("jawiki") or {}).get("title")
        if not wp and not c["tags"] and not c["desig"]:
            drop["jawiki なし（分類のみ）"] += 1
            continue
        name = label(e) or wp or label(e, "en")
        if not name:
            drop["名前なし"] += 1
            continue
        name = re.sub(r" \(.+\)$", "", name)
        if name in MAIN_ISLANDS or (NAME_NOISE.search(name) and not desig_pre(e, c)):
            drop["主要な島・名前ノイズ"] += 1
            continue
        for t, rx in TAG_NAME_RE.items():
            if t in c["tags"] and not rx.search(name) and not (t == "日本の滝百選" and "滝" in c["classes"]):
                c["tags"].discard(t)
        if not c["tags"] and not c["desig"] and not c["classes"]:
            drop["一覧の別列リンク"] += 1
            continue
        desc = (e.get("descriptions", {}).get("ja") or {}).get("value") or ""
        img = (claim_vals(e, "P18") or [None])[0]
        web = (claim_vals(e, "P856") or [None])[0]
        desig = set(c["desig"])
        for d in claim_vals(e, "P1435"):
            if d in DESIG:
                desig.add(DESIG[d])
        if "特別名勝" in desig:
            desig.discard("名勝")
        tags = sorted(c["tags"]) + sorted(desig, reverse=True)
        # 市区町村
        props, dist = locate(munis, lo, la)
        pf = mu = None
        if props:
            pf = pref_by_code.get(props["pf"])
            mu = props["n"]
        else:
            pprops, _ = locate(prefs, lo, la, near_km=20.0)
            if pprops:
                pf = pprops["n"]
            p131 = claim_vals(e, "P131")
            if p131:
                need_p131[q] = p131
        spots[q] = {
            "n": name, "la": round(la, 5), "lo": round(lo, 5), "pf": pf, "mu": mu,
            "k": kind_of(name, tags, c["classes"], desig), "tags": tags,
            "img": img, "wp": wp, "d": desc, "q": q, "web": web, "s": score([t for t in tags if t not in DESIG.values()], desig),
        }
    print(f"    残り {len(spots)} 件 / 除外: {dict(drop.most_common(12))}", file=sys.stderr)

    # P131 フォールバック（ポリゴンで決まらなかったもの）
    if need_p131:
        print(f"■ P131 フォールバック {len(need_p131)} 件", file=sys.stderr)
        first = wb_entities([v[0] for v in need_p131.values()], props="labels|claims")
        second = wb_entities([x for e in first.values() for x in claim_vals(e, "P131")[:1]], props="labels|claims")
        for q, p in need_p131.items():
            e1 = first.get(p[0])
            if not e1:
                continue
            l1 = label(e1) or ""
            e2 = second.get((claim_vals(e1, "P131") or [None])[0])
            l2 = label(e2) if e2 else ""
            sp = spots[q]
            if l1 in pref_names:
                sp["pf"] = sp["pf"] or l1
            elif l2 in pref_names:
                sp["pf"] = sp["pf"] or l2
                sp["mu"] = sp["mu"] or l1
            elif l2 and l1:
                m = PREF_RE.search(l2)
                sp["pf"] = sp["pf"] or (m.group(1) if m else None)
                sp["mu"] = sp["mu"] or l1

    # 都道府県が決まらないものは落とす
    for q in [q for q, s in spots.items() if not s["pf"]]:
        drop["都道府県が不明"] += 1
        del spots[q]

    # 写真の補完（jawiki の代表画像）
    noimg = [s["wp"] for s in spots.values() if not s["img"] and s["wp"]]
    print(f"■ 写真補完 {len(noimg)} 件（jawiki pageimages）", file=sys.stderr)
    pi = page_images(noimg)
    for s in spots.values():
        if not s["img"] and s["wp"] and pi.get(s["wp"]):
            s["img"] = pi[s["wp"]]
    for s in spots.values():
        if s["img"]:
            s["img"] = s["img"].replace("_", " ")
            if s["img"].lower().startswith("file:"):
                s["img"] = s["img"][5:]

    # 名前 + 300 m で重複をまとめる
    print("■ 重複整理", file=sys.stderr)
    out = []
    by_key = {}
    merged = 0
    for s in sorted(spots.values(), key=lambda s: (-s["s"], s["q"])):
        nk = re.sub(r"[\s（）()・]", "", s["n"])
        cell = (round(s["la"] / 0.003), round(s["lo"] / 0.0035))
        hit = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                t = by_key.get((nk, cell[0] + dy, cell[1] + dx))
                if t:
                    hit = t
                    break
            if hit:
                break
        if hit:
            hit["tags"] = sorted(set(hit["tags"]) | set(s["tags"]))
            for k in ("img", "wp", "d", "web", "mu"):
                hit[k] = hit[k] or s[k]
            hit["s"] = max(hit["s"], s["s"])
            merged += 1
            continue
        by_key[(nk,) + cell] = s
        out.append(s)
    print(f"    {merged} 件をまとめた → {len(out)} 件", file=sys.stderr)

    # 市区町村の公式サイト（Wikidata P856）
    print("■ 市区町村の公式サイト（Wikidata）", file=sys.stderr)
    rows = sparql("""
      SELECT ?m ?mLabel ?web ?pLabel ?ppLabel WHERE {
        VALUES ?cls { wd:Q494721 wd:Q1059478 wd:Q4174776 wd:Q137773 wd:Q5327704 wd:Q1749269 wd:Q1137833 }
        ?m wdt:P31 ?cls ; wdt:P17 wd:Q17 ; wdt:P856 ?web .
        FILTER NOT EXISTS { ?m wdt:P576 ?end }
        OPTIONAL { ?m wdt:P131 ?p . OPTIONAL { ?p wdt:P131 ?pp } }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
      }""")
    muni_web_all = {}
    for r in rows:
        name = r["mLabel"]["value"]
        p = r.get("pLabel", {}).get("value", "")
        pp = r.get("ppLabel", {}).get("value", "")
        web = r["web"]["value"]
        keys = set()
        if p in pref_names:
            keys.add(f"{p} {name}")
        elif pp in pref_names:
            keys.add(f"{pp} {name}")
            keys.add(f"{pp} {p}{name}")          # 政令市の区: 「札幌市中央区」
            keys.add(f"{pp} {p.replace('郡', '')}{name}")
        for k in keys:
            muni_web_all.setdefault(k, web)
    muni_web = {}
    for s in out:
        if not s["mu"]:
            continue
        k = f"{s['pf']} {s['mu']}"
        w = muni_web_all.get(k)
        if not w and "市" in s["mu"] and s["mu"].endswith("区"):
            w = muni_web_all.get(f"{s['pf']} {s['mu'].split('市')[0]}市")
        if w:
            muni_web[k] = w

    # 出力
    today = datetime.date.today().isoformat()
    for s in out:
        for k in ("img", "wp", "web"):
            if not s[k]:
                del s[k]
        if not s["d"]:
            del s["d"]
        if not s["mu"]:
            s["mu"] = ""
    out.sort(key=lambda s: (s["pf"], s["mu"], -s["s"], s["n"]))
    header = f"""/* 全国の絶景スポット（自動生成: tools/build_views.py）取得日: {today}
   n=名前 la/lo=座標 pf=都道府県 mu=市区町村 k=種類 tags=入っている百選・指定
   img=Wikimedia Commons のファイル名（File: なし。表示するときは Commons のファイルページへリンクして出典と
       ライセンスを示すこと。写真はそれぞれ個別のライセンス） wp=日本語版 Wikipedia の記事名
   d=ひとこと（Wikidata の説明） q=Wikidata の ID web=公式サイト（あれば） s=見どころの目安
   値のないキー（img / wp / d / web）は省いてあります。

   s  5.0 = 特別名勝・日本三景・日本三大夜景・日本新三大夜景
      4.5 = 名勝、または 2 つ以上の百選に入っている
      4.0 = 百選 1 つに入っている
      3.5 = Wikidata の分類だけ（日本語版 Wikipedia の記事はある）
   k  滝 渚 夜景 展望 峡谷 岬 湖 棚田 庭園 名勝 海岸 湿原 高原 山 その他

   出典: Wikidata（CC0 1.0）… 座標・名前・説明・分類・文化財指定・公式サイト・写真の指定 (P18)
         Wikipedia 日本語版（CC BY-SA 4.0）… 百選などの一覧記事、記事名、代表画像の選定
         Wikimedia Commons … 写真（各ファイルのライセンスに従う。本サイトはファイルページへのリンクで出典表示）
         国土数値情報（国土交通省）… 都道府県・市区町村の判定（data/geo）
   商用レビューサイトのデータは使っていません。
   MUNI_WEB … スポットのある市区町村の公式サイト（Wikidata P856）。キーは「都道府県 市区町村」 */
"""
    js = header + "RG.VIEWS_JP = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.MUNI_WEB = " + json.dumps(muni_web, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + ";\n"
    path = os.path.join(ROOT, "data/views_jp.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(js)

    # ---------------------------------------------------------------- まとめ
    kc = collections.Counter(s["k"] for s in out)
    pc = collections.Counter(s["pf"] for s in out)
    imgc = sum(1 for s in out if s.get("img"))
    lc = collections.Counter(t for s in out for t in s["tags"])
    print()
    print(f"=== data/views_jp.js  {len(out)} 件  {os.path.getsize(path) / 1024:.0f} KB ===")
    print("種類:", ", ".join(f"{k} {v}" for k, v in kc.most_common()))
    print(f"写真あり: {imgc} / {len(out)} = {100.0 * imgc / len(out):.1f}%")
    print(f"市区町村あり: {sum(1 for s in out if s['mu'])} / {len(out)}   公式サイト(MUNI_WEB): {len(muni_web)} 市区町村")
    print(f"都道府県: {len(pc)} / 47  最少 {min(pc.values())} 最多 {max(pc.values())}")
    print("  " + ", ".join(f"{p} {n}" for p, n in sorted(pc.items(), key=lambda t: -t[1])))
    few = [p for p in pref_names if pc.get(p, 0) < 10]
    print("  10 件未満:", ", ".join(f"{p} {pc.get(p, 0)}" for p in few) or "なし")
    print("一覧ごとの件数（採用数 / QID 解決数 / リンク数）:")
    for lt in LISTS + list(FIXED_LISTS):
        if lt == "平成の名水百選":
            continue
        st = list_stats.get(lt)
        print(f"  {lt}: {lc.get(lt, 0)} / {st[1] if st else '-'} / {st[0] if st else '-'}")
    print(f"  名勝: {lc.get('名勝', 0)}  特別名勝: {lc.get('特別名勝', 0)}")
    print("スコア:", dict(sorted(collections.Counter(s["s"] for s in out).items())))
    print("除外の内訳:", dict(drop.most_common(15)))
    if unparsed:
        print("解析できなかった一覧:", ", ".join(unparsed))


if __name__ == "__main__":
    main()
