# -*- coding: utf-8 -*-
"""
川・海・海流（data/water.js）を作る。

■ 出力（data/water.js）
  RG.RIVERS   = [ {n,sys,len,area,pf,wp,q,la,lo,pt,src,img,d,grade,pts,ps}, ... ]
      n=幹川名  sys=水系名（幹川名と違うときだけ）  len=流路延長 km  area=流域面積 km²
      pf=流域の都道府県（上流側から）  wp=日本語版 Wikipedia の記事名  q=Wikidata ID
      la/lo=河口の座標（pt:"src" が付いていれば水源の座標しか無かったもの）
      src=[la,lo] 源流の座標（Wikidata の P625「水源」限定 / P885 水源地の座標 / 記事の水源リンク先の座標）
      img=Wikimedia Commons のファイル名  d=記事の冒頭（4文）  grade=1 一級水系の幹川 / 2 二級河川
      pts=[[la,lo],...] 地図に描く折れ線（源流 → 河口の向き、小数3桁、60点以下）
      ps=pts の出どころ  "ne"=Natural Earth 10m rivers  "commons"=Wikimedia Commons Data:（CC0 の地図データ）
                          "wd"=Wikidata の支流の合流点（河口座標）を源流→河口の順に並べた概略線（形は目安）
  RG.SEAS     = [ {n,k,la,lo,wp,q,d,img,big}, ... ]
      k=海/湾/海峡/水道/灘/内海  la/lo=ラベルを置く点  big=1 は遠いズームでも出す大きな海
  RG.CURRENTS = [ {n,warm,pts,spd,d,wp,img,q}, ... ]
      pts は上流（流れの始まり）→ 下流の順。座標は地理の一般知識から手で描いた概略線（小数2桁）

■ 出典
  一級水系の一覧・延長・流域面積・都道府県 …… Wikipedia 日本語版「一級水系」（CC BY-SA 4.0）
  二級河川（grade 2） ………………………………… Wikipedia 日本語版「二級水系」の都道府県ごとの主要 3 水系と、
                                                 「日本の川一覧」で二級河川と明記された川（CC BY-SA 4.0）
  座標・水源・支流・写真の指定・分類 ………… Wikidata（CC0 1.0）
  記事の冒頭（d） ……………………………………… Wikipedia 日本語版（CC BY-SA 4.0）
  川の折れ線 …………………………………………… Natural Earth 10m rivers（パブリックドメイン）、
                                                 Wikimedia Commons Data:Japan/Geography/*.map（CC0 1.0）
  海のラベル点の突き合わせ ………………………… Natural Earth 10m geography marine polys（パブリックドメイン）
  写真 …………………………………………………… Wikimedia Commons（ファイルごとのライセンスに従う）
  OpenStreetMap は使っていません。

使い方:  python3 tools/build_water.py          （API 応答は /tmp/views_cache に保存。再実行は速い）
         python3 tools/build_water.py --fresh  （キャッシュを捨てて取り直す）
"""
import json, os, re, sys, math, collections, unicodedata, datetime
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_views import (sparql, qid_of, decode_topo, locate, list_titles, titles_to_qids, page_images,
                         page_coords, wikitext, _get, JA_API, ROOT, CACHE, S, FRESH)

OUT = os.path.join(ROOT, "data/water.js")
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
NE_FILES = {"rivers": "ne_10m_rivers_lake_centerlines.geojson", "marine": "ne_10m_geography_marine_polys.geojson"}
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
BBOX = (24.0, 46.0, 122.0, 150.0)          # lat0, lat1, lon0, lon1
MAX_PTS = 60
GRADE2_LIMIT_KB = 250                     # 二級河川を足して これを超えるなら 二級は載せない

RIVER_MOUTH, RIVER_SOURCE = "Q1233637", "Q7376362"      # P518（部分）の値: 河口 / 水源


def log(*a):
    print(*a, file=sys.stderr)


def parse_point(c):
    m = re.match(r"Point\(([-\d.eE+]+) ([-\d.eE+]+)\)", c or "")
    return (float(m.group(2)), float(m.group(1))) if m else None


def in_bbox(la, lo):
    return BBOX[0] <= la <= BBOX[1] and BBOX[2] <= lo <= BBOX[3]


def km(a, b):
    """2 点間の距離 km（正距円筒近似）"""
    ky = 111.0
    kx = 111.0 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * ky, (a[1] - b[1]) * kx)


def title_of(art):
    from urllib.parse import unquote
    return unquote(art.rsplit("/", 1)[-1]).replace("_", " ")


def commons_name(url):
    from urllib.parse import unquote
    return unquote(url.rsplit("/", 1)[-1]).replace("_", " ")


def extracts(titles, sentences=4):
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2}, min_gap=0.5)
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for p in q.get("pages", []):
            if p.get("extract"):
                got[p["title"]] = re.sub(r"\s+", " ", p["extract"]).strip()
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
    return out


def strip_paren(name):
    return re.sub(r"\s*[（(].*?[)）]\s*$", "", name).strip()


def norm_ascii(s):
    """Tenryū → tenryu, Ō → o"""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z]", "", s.lower())


# ---------------------------------------------------------------- Natural Earth（パブリックドメイン）
def natural_earth(kind):
    """GeoJSON を /tmp/views_cache に置いて返す。取れなければ None"""
    fn = NE_FILES[kind]
    cf = os.path.join(CACHE, fn)
    if FRESH or not os.path.exists(cf) or os.path.getsize(cf) < 1000:
        try:
            r = S.get(NE_BASE + fn, timeout=300)
            r.raise_for_status()
            with open(cf, "wb") as f:
                f.write(r.content)
        except requests.RequestException as e:
            log(f"    Natural Earth {fn} を取得できませんでした: {e}")
            return None
    try:
        return json.load(open(cf, encoding="utf-8"))
    except ValueError as e:
        log(f"    Natural Earth {fn} を読めませんでした: {e}")
        return None


def geom_lines(g):
    if g["type"] == "LineString":
        return [g["coordinates"]]
    if g["type"] == "MultiLineString":
        return g["coordinates"]
    return []


def geom_points(g):
    if g["type"] == "Polygon":
        return [p for ring in g["coordinates"] for p in ring]
    if g["type"] == "MultiPolygon":
        return [p for poly in g["coordinates"] for ring in poly for p in ring]
    return []


# ---------------------------------------------------------------- 折れ線の道具
def merge_lines(parts):
    """複数の線分（[[lo,la],...] または [(la,lo),...] に統一してから）を端点の近さでつなぐ"""
    parts = [list(p) for p in parts if len(p) >= 2]
    if not parts:
        return []
    chain = parts.pop(0)
    while parts:
        best = None
        for i, p in enumerate(parts):
            for rev_chain in (False, True):
                for rev_part in (False, True):
                    a = chain[0] if rev_chain else chain[-1]
                    b = p[-1] if rev_part else p[0]
                    d = km(a, b)
                    if best is None or d < best[0]:
                        best = (d, i, rev_chain, rev_part)
        d, i, rev_chain, rev_part = best
        p = parts.pop(i)
        if rev_part:
            p = p[::-1]
        if rev_chain:
            chain = chain[::-1]
        chain = chain + p
    return chain


def thin(pts, n=MAX_PTS):
    """点を n 個以下に間引く（両端は残す）"""
    if len(pts) <= n:
        return pts
    step = (len(pts) - 1) / (n - 1)
    idx = sorted(set(int(round(i * step)) for i in range(n)))
    if idx[-1] != len(pts) - 1:
        idx.append(len(pts) - 1)
    return [pts[i] for i in idx]


def orient(pts, mouth):
    """河口に近い側を終点にする"""
    if mouth and pts and km(pts[0], mouth) < km(pts[-1], mouth):
        return pts[::-1]
    return pts


def round_pts(pts, nd=3):
    out = []
    for la, lo in pts:
        p = [round(la, nd), round(lo, nd)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def path_order(start, end, cands):
    """start → cands… → end を短い順路で並べる（最近傍 + 2-opt）。support の点の配列を返す"""
    rest = list(cands)
    path = [start]
    while rest:
        cur = path[-1]
        j = min(range(len(rest)), key=lambda i: km(cur, rest[i]))
        path.append(rest.pop(j))
    path.append(end)
    # 2-opt（両端固定）
    improved = True
    n = len(path)
    while improved and n > 4:
        improved = False
        for i in range(1, n - 2):
            for j in range(i + 1, n - 1):
                a, b, c, d = path[i - 1], path[i], path[j], path[j + 1]
                if km(a, c) + km(b, d) + 1e-9 < km(a, b) + km(c, d):
                    path[i:j + 1] = path[i:j + 1][::-1]
                    improved = True
    return path


def drop_detours(path, limit_km=12.0):
    """途中の点で、前後の点から大きく寄り道させる点（支流の中流の座標など）を落とす"""
    path = list(path)
    changed = True
    while changed and len(path) > 2:
        changed = False
        worst = None
        for i in range(1, len(path) - 1):
            a, p, b = path[i - 1], path[i], path[i + 1]
            det = km(a, p) + km(p, b) - km(a, b)
            if det > limit_km and (worst is None or det > worst[0]):
                worst = (det, i)
        if worst:
            del path[worst[1]]
            changed = True
    return path


# ---------------------------------------------------------------- 1. 一級水系（Wikipedia の表）
CELL_ATTR = re.compile(r'^\s*[^|\[\]]*?(?:style|rowspan|colspan|align)[^|]*\|(.*)$', re.S)


def clean_text(s):
    s = re.sub(r"<br\s*/?>", "、", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    return s.replace("'''", "").strip()


def num(s):
    s = clean_text(s).replace(",", "").replace("，", "")
    m = re.search(r"[\d.]+", s)
    return float(m.group(0)) if m else None


def parse_ikkyu():
    wt = wikitext("一級水系")
    rows = []
    for sec in re.split(r"\n===\s*", wt)[1:]:
        head, _, body = sec.partition("\n")
        region = head.replace("=", "").strip()
        if "管轄" not in region:
            continue
        for tbl in re.findall(r"\{\|.*?\n\|\}", body, re.S):
            cur_pf, span = [], 0
            for raw in re.split(r"\n\|-[^\n]*", tbl)[1:]:
                lines = [l.strip() for l in raw.split("\n") if l.strip() and l.strip() != "|}"]
                if not lines or not lines[0].startswith("!"):
                    continue
                head_cell = lines[0][1:]
                cells = []
                for l in lines[1:]:
                    if l.startswith("|"):
                        l = l[1:]
                    cells += l.split("||")
                if len(cells) < 3:
                    continue
                # 名前
                m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", head_cell)
                if not m:
                    continue
                target = m.group(1).strip()
                disp = (m.group(2) or strip_paren(target)).strip()
                before = clean_text(head_cell[:m.start()]).strip("（）() 、")
                sysname = before if before else disp
                # 都道府県（rowspan を引き継ぐ）
                third = cells[2]
                mm = CELL_ATTR.match(third)
                if mm or re.search(r"[都道府県]", clean_text(third)):
                    content = mm.group(1) if mm else third
                    rs = re.search(r"rowspan\s*=\s*\"?(\d+)", third)
                    span = (int(rs.group(1)) - 1) if rs else 0
                    cur_pf = [p.strip() for p in re.split(r"[、,，]", clean_text(content)) if p.strip()]
                else:
                    span = max(0, span - 1)
                rows.append({"n": disp, "sys": sysname, "wp0": target, "len": num(cells[0]), "area": num(cells[1]),
                             "pf": list(cur_pf), "region": region.replace("管轄", "")})
    return rows


# ---------------------------------------------------------------- 2. 二級河川の候補
def parse_nikyu_main():
    """「二級水系」の表「主な二級河川を本川（本流）とする水系一覧」: 都道府県ごとの主要 3 水系"""
    wt = wikitext("二級水系")
    out = []
    for tbl in re.findall(r"\{\|.*?\n\|\}", wt, re.S):
        if "主要水系名" not in tbl:
            continue
        for raw in re.split(r"\n\|-[^\n]*", tbl)[1:]:
            pm = re.search(r"!\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", raw)
            if not pm or not re.search(r"[都道府県]$", pm.group(1)):
                continue
            pref = pm.group(1)
            for m in re.finditer(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]水系", raw):
                target = m.group(1).strip()
                name = (m.group(2) or strip_paren(target)).strip()
                name = re.sub(r"[（(].*?[)）]", "", name).strip()
                if "一覧" in target or not re.search(r"川$", name):
                    continue
                out.append({"n": name, "wp0": target, "pf": [pref], "tier": 1})
    return out


def parse_nikyu_list():
    """「日本の川一覧」で「二級河川」と明記された最上位の川（都道府県により書き方がまちまち）"""
    wt = wikitext("日本の川一覧")
    pref = None
    out = []
    for line in wt.split("\n"):
        h = re.match(r"^===\s*(.+?)\s*===", line)
        if h:
            pref = h.group(1).strip()
            continue
        if not line.startswith("*") or line.startswith("**") or "二級" not in line:
            continue
        m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", line)
        if not m:
            continue
        target = m.group(1).strip()
        name = (m.group(2) or strip_paren(target)).strip()
        if not re.search(r"川$", name) or target in ("二級河川", "二級水系"):
            continue
        out.append({"n": name, "wp0": target, "pf": [pref] if pref else [], "tier": 2})
    return out


def parse_nikyu():
    out = parse_nikyu_main()
    seen = {r["wp0"] for r in out}
    for r in parse_nikyu_list():
        if r["wp0"] not in seen:
            seen.add(r["wp0"])
            out.append(r)
    return out


# ---------------------------------------------------------------- 3. 川の Wikidata
def fetch_rivers_wd(qids):
    """河川の座標（限定子つき）・水源・河口・延長・流域面積・写真・記事名"""
    info = {q: {"co": [], "src": [], "len": None, "area": None, "img": None, "wp": None, "mouth": None} for q in qids}
    for i in range(0, len(qids), 60):
        vals = " ".join("wd:" + q for q in qids[i:i + 60])
        rows = sparql(f"""
SELECT ?r ?co ?part ?len ?area ?img ?art ?srcco ?mouthLabel WHERE {{
  VALUES ?r {{ {vals} }}
  OPTIONAL {{ ?r p:P625 ?st . ?st ps:P625 ?co . OPTIONAL {{ ?st pq:P518 ?part }} }}
  OPTIONAL {{ ?r wdt:P2043 ?len }}
  OPTIONAL {{ ?r wdt:P2053 ?area }}
  OPTIONAL {{ ?r wdt:P18 ?img }}
  OPTIONAL {{ ?art schema:about ?r ; schema:isPartOf <https://ja.wikipedia.org/> }}
  OPTIONAL {{ ?r wdt:P885 ?src . ?src wdt:P625 ?srcco }}
  OPTIONAL {{ ?r wdt:P403 ?mouth }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja,en". }}
}}""")
        for r in rows:
            q = qid_of(r["r"]["value"])
            o = info[q]
            if "co" in r:
                pt = parse_point(r["co"]["value"])
                part = qid_of(r["part"]["value"]) if "part" in r else None
                if pt and (pt, part) not in o["co"]:
                    o["co"].append((pt, part))
            if "srcco" in r:
                pt = parse_point(r["srcco"]["value"])
                if pt and pt not in o["src"]:
                    o["src"].append(pt)
            if "len" in r and o["len"] is None:
                try:
                    o["len"] = float(r["len"]["value"])
                except ValueError:
                    pass
            if "area" in r and o["area"] is None:
                try:
                    o["area"] = float(r["area"]["value"])
                except ValueError:
                    pass
            if "img" in r and not o["img"]:
                o["img"] = commons_name(r["img"]["value"])
            if "art" in r and not o["wp"]:
                o["wp"] = title_of(r["art"]["value"])
            if "mouthLabel" in r and not o["mouth"]:
                o["mouth"] = r["mouthLabel"]["value"]
    return info


def fetch_tributary_points(qids):
    """支流（P974 / 逆向きの P403）の座標。河口限定のもの、限定子なしで座標が 1 つだけのものを合流点とみなす"""
    trib = collections.defaultdict(lambda: collections.defaultdict(list))   # river → tributary → [(pt, part)]
    for i in range(0, len(qids), 40):
        vals = " ".join("wd:" + q for q in qids[i:i + 40])
        rows = sparql(f"""
SELECT ?r ?t ?co ?part WHERE {{
  VALUES ?r {{ {vals} }}
  {{ ?r wdt:P974 ?t }} UNION {{ ?t wdt:P403 ?r }}
  ?t p:P625 ?st . ?st ps:P625 ?co . OPTIONAL {{ ?st pq:P518 ?part }}
}}""")
        for r in rows:
            pt = parse_point(r["co"]["value"])
            if not pt:
                continue
            part = qid_of(r["part"]["value"]) if "part" in r else None
            trib[qid_of(r["r"]["value"])][qid_of(r["t"]["value"])].append((pt, part))
    out = {}
    for rq, ts in trib.items():
        pts = [p for p in (confluence_points(lst) for lst in ts.values()) if p]
        out[rq] = pts
    return out


def article_tributary_titles(title, own):
    """記事の「支流」「支川」の節にあるリンク先（〜川）。Wikidata の P974 が少ない川の補い"""
    try:
        wt = wikitext(title)
    except Exception as e:
        log(f"    wikitext {title}: {e}")
        return []
    out = []
    lines = wt.split("\n")
    level = None
    for line in lines:
        h = re.match(r"^(=+)\s*(.+?)\s*=+\s*$", line)
        if h:
            if level is not None and len(h.group(1)) <= level:
                level = None
            if re.search(r"支流|支川", h.group(2)) and not re.search(r"ダム|橋|発電", h.group(2)):
                level = len(h.group(1))
            continue
        if level is None:
            continue
        # 入れ子の箇条書き（支流の支流）は本川に合流しないので読まない
        if re.match(r"^\s*(\*\*|##|\*#|#\*|:)", line):
            continue
        for m in re.finditer(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", line):
            t = m.group(1).strip()
            if t == own or not re.search(r"川(\s*\(.+\))?$", t) or re.search(r"水系|一覧|放水路|運河|用水", t):
                continue
            out.append(t)
    return list(dict.fromkeys(out))


def coords_with_parts(qids):
    """QID → [(pt, part)]（P625 と P518 限定子）"""
    out = collections.defaultdict(list)
    qids = list(dict.fromkeys(qids))
    for i in range(0, len(qids), 150):
        vals = " ".join("wd:" + q for q in qids[i:i + 150])
        rows = sparql(f"""
SELECT ?i ?co ?part WHERE {{
  VALUES ?i {{ {vals} }}
  ?i p:P625 ?st . ?st ps:P625 ?co . OPTIONAL {{ ?st pq:P518 ?part }}
}}""")
        for r in rows:
            pt = parse_point(r["co"]["value"])
            if pt:
                out[qid_of(r["i"]["value"])].append((pt, qid_of(r["part"]["value"]) if "part" in r else None))
    return out


def confluence_points(lst):
    """支流 1 本ぶんの座標列 → 合流点とみなす点（河口限定のもの / 限定子なしで 1 つだけのもの）"""
    mouths = [p for p, part in lst if part == RIVER_MOUTH]
    if mouths:
        return mouths[0]
    if len(lst) == 1 and lst[0][1] is None:
        return lst[0][0]
    return None


ADMIN_NAME = re.compile(r"県$|府$|都$|^北海道$|市$|町$|村$|郡$|区$")


def infobox_source_links(titles):
    """記事の {{Infobox 河川}} の 水源 に書かれた山や湖（リンク先。リンクが無ければ先頭の語）"""
    out = {}
    for t in titles:
        try:
            wt = wikitext(t)
        except Exception as e:
            log(f"    wikitext {t}: {e}")
            continue
        m = re.search(r"\|\s*水源\s*=\s*(.+)", wt)
        if not m:
            continue
        val = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<[^>]+>", "", m.group(1))
        links = [l for l in re.findall(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", val) if not ADMIN_NAME.search(l)]
        if links:
            out[t] = links[0]
            continue
        plain = re.split(r"[（(・、,／/\s]", clean_text(val).strip())[0]
        if plain and re.search(r"[山岳嶺峰峠湖沼池原]$", plain) and not ADMIN_NAME.search(plain):
            out[t] = plain
    return out


def choose_mouth_and_source(o, wp_pt=None):
    """(河口 (la,lo) or None, 水源 (la,lo) or None, pt フラグ)"""
    cos = o["co"]
    src = None
    for pt, part in cos:
        if part == RIVER_SOURCE:
            src = pt
            break
    if not src and o["src"]:
        src = o["src"][0]
    mouth = None
    for pt, part in cos:
        if part == RIVER_MOUTH:
            mouth = pt
            break
    if not mouth:
        others = [pt for pt, part in cos if part != RIVER_SOURCE]
        if len(others) >= 2 and src:
            mouth = max(others, key=lambda p: km(p, src))
        elif len(others) >= 1:
            mouth = others[0]
            if src and km(mouth, src) < 3.0 and len(others) == 1:
                return None, src, "src"
    if not mouth and wp_pt:
        mouth = wp_pt
    if not mouth and src:
        return None, src, "src"
    return mouth, src, None


# ---------------------------------------------------------------- 川の折れ線（Natural Earth / Commons / Wikidata）
ROMAJI = {  # 幹川名 → ローマ字（Natural Earth・Commons の英語名との突き合わせ用。川 は付けない）
    "天塩川": "teshio", "渚滑川": "shokotsu", "湧別川": "yubetsu", "常呂川": "tokoro", "網走川": "abashiri",
    "留萌川": "rumoi", "石狩川": "ishikari", "尻別川": "shiribetsu", "後志利別川": "shiribeshitoshibetsu",
    "鵡川": "mu", "沙流川": "saru", "釧路川": "kushiro", "十勝川": "tokachi",
    "岩木川": "iwaki", "高瀬川": "takase", "馬淵川": "mabechi", "北上川": "kitakami", "鳴瀬川": "naruse",
    "名取川": "natori", "阿武隈川": "abukuma", "米代川": "yoneshiro", "雄物川": "omono", "子吉川": "koyoshi",
    "最上川": "mogami", "赤川": "aka",
    "久慈川": "kuji", "那珂川": "naka", "利根川": "tone", "荒川": "ara", "多摩川": "tama", "鶴見川": "tsurumi",
    "相模川": "sagami", "富士川": "fuji",
    "阿賀野川": "agano", "信濃川": "shinano", "関川": "seki", "姫川": "hime", "黒部川": "kurobe",
    "常願寺川": "joganji", "神通川": "jinzu", "庄川": "sho", "小矢部川": "oyabe", "手取川": "tedori", "梯川": "kakehashi",
    "狩野川": "kano", "安倍川": "abe", "大井川": "oi", "菊川": "kiku", "天竜川": "tenryu", "豊川": "toyo",
    "矢作川": "yahagi", "庄内川": "shonai", "木曽川": "kiso", "鈴鹿川": "suzuka", "雲出川": "kumozu",
    "櫛田川": "kushida", "宮川": "miya",
    "九頭竜川": "kuzuryu", "北川": "kita", "由良川": "yura", "淀川": "yodo", "大和川": "yamato", "円山川": "maruyama",
    "加古川": "kako", "揖保川": "ibo", "紀の川": "kino", "熊野川": "kumano",
    "千代川": "sendai", "天神川": "tenjin", "日野川": "hino", "斐伊川": "hii", "江の川": "gono", "高津川": "takatsu",
    "吉井川": "yoshii", "旭川": "asahi", "高梁川": "takahashi", "芦田川": "ashida", "太田川": "ota", "小瀬川": "ose",
    "佐波川": "saba",
    "吉野川": "yoshino", "那賀川": "naka", "土器川": "doki", "重信川": "shigenobu", "肱川": "hiji", "物部川": "monobe",
    "仁淀川": "niyodo", "四万十川": "shimanto",
    "遠賀川": "onga", "山国川": "yamakuni", "筑後川": "chikugo", "矢部川": "yabe", "松浦川": "matsuura",
    "六角川": "rokkaku", "嘉瀬川": "kase", "本明川": "honmyo", "菊池川": "kikuchi", "白川": "shira", "緑川": "midori",
    "球磨川": "kuma", "大分川": "oita", "大野川": "ono", "番匠川": "banjo", "五ヶ瀬川": "gokase", "小丸川": "omaru",
    "大淀川": "oyodo", "川内川": "sendai", "肝属川": "kimotsuki",
}
ROMAJI_ALIAS = {"ara": ["arakawa"], "tone": ["tonegawa"], "shinano": ["shinanogawa", "chikuma"], "kino": ["kinokawa"],
                "gono": ["gonokawa", "go"], "kuma": ["kumagawa"], "yoshino": ["yoshinogawa"]}


def ne_river_lines(ne, rivers, mouth_of):
    """Natural Earth の川の線を名前で突き合わせる。日本の範囲にある線だけ"""
    if not ne:
        return {}
    by_name = collections.defaultdict(list)
    for f in ne["features"]:
        pr = f["properties"]
        if pr.get("featurecla") not in ("River", "Lake Centerline"):
            continue
        lines = [[(p[1], p[0]) for p in line] for line in geom_lines(f["geometry"])]
        lines = [l for l in lines if any(in_bbox(la, lo) and lo >= 127.0 for la, lo in l)]
        if not lines:
            continue
        for key in {pr.get("name"), pr.get("name_en"), pr.get("name_alt")}:
            if key:
                by_name[norm_ascii(re.sub(r"\s*river$", "", key, flags=re.I))].extend(lines)
    out = {}
    for rv in rivers:
        rj = ROMAJI.get(rv["n"])
        if not rj:
            continue
        keys = [rj] + ROMAJI_ALIAS.get(rj, [])
        lines = []
        for k in keys:
            lines += by_name.get(k, [])
        if not lines:
            continue
        mouth = mouth_of.get(rv["q"])
        # 同名の別の川を避ける：河口が分かっていれば 60 km 以内に端点がある線だけ
        if mouth:
            lines = [l for l in lines if min(km(l[0], mouth), km(l[-1], mouth)) < 60.0 or any(km(p, mouth) < 25.0 for p in l)]
        if not lines:
            continue
        out[rv["q"]] = orient(merge_lines(lines), mouth)
    return out


def commons_river_lines(rivers, mouth_of):
    """Wikimedia Commons の Data:Japan/Geography/<Name> River waterway.map（CC0）"""
    titles = []
    cont = {}
    while True:
        r = _get(COMMONS_API, {"action": "query", "list": "allpages", "apnamespace": 486, "apprefix": "Japan/Geography/",
                               "aplimit": 500, "format": "json", **cont}, min_gap=1.5)
        titles += [x["title"] for x in r.get("query", {}).get("allpages", [])]
        if "continue" in r:
            cont = r["continue"]
        else:
            break
    by_key = {}
    for t in titles:
        m = re.match(r"Data:Japan/Geography/(.+?) River waterway\.map$", t)
        if m:
            by_key[norm_ascii(m.group(1))] = t
    out = {}
    for rv in rivers:
        rj = ROMAJI.get(rv["n"])
        if not rj:
            continue
        t = None
        for k in [rj] + ROMAJI_ALIAS.get(rj, []):
            t = by_key.get(k)
            if t:
                break
        if not t:
            continue
        r = _get(COMMONS_API, {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                               "titles": t, "format": "json", "formatversion": 2}, min_gap=1.5)
        try:
            d = json.loads(r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"])
        except (KeyError, IndexError, ValueError) as e:
            log(f"    Commons {t}: 読めません {e}")
            continue
        if not str(d.get("license", "")).upper().startswith("CC0"):
            log(f"    Commons {t}: ライセンスが CC0 でないので使いません ({d.get('license')})")
            continue
        g = d.get("data") or {}
        feats = g.get("features", [g]) if g.get("type") == "FeatureCollection" else [g]
        lines = []
        for f in feats:
            geom = f.get("geometry", f)
            lines += [[(p[1], p[0]) for p in line] for line in geom_lines(geom)]
        mouth = mouth_of.get(rv["q"])
        if mouth and not any(km(p, mouth) < 40.0 for l in lines for p in l):
            log(f"    Commons {t}: {rv['n']} の河口から遠いので使いません")
            continue
        if lines:
            out[rv["q"]] = (orient(merge_lines(lines), mouth), t)
    return out


def wd_river_line(src, mouth, cands, length_km):
    """支流の合流点から概略線を作る。信頼できる形にならなければ None"""
    if not mouth:
        return None
    pts = []
    for p in cands:
        if km(p, mouth) > max(60.0, (length_km or 100.0) * 1.1):
            continue
        if any(km(p, q) < 1.0 for q in pts) or km(p, mouth) < 1.0:
            continue
        if src and km(p, src) < 1.0:
            continue
        pts.append(p)
    if len(pts) < (2 if src else 3):
        return None
    start = src or max(pts, key=lambda p: km(p, mouth))
    if not src:
        pts = [p for p in pts if p != start]
    limit = max(6.0, min(12.0, 0.1 * (length_km or 100.0)))
    # 並べる → 寄り道の点を落とす → 残った点でもう一度並べる（外れ点が並び順を乱すのを防ぐ）
    for _ in range(6):
        path = path_order(start, mouth, pts)
        kept = drop_detours(path, limit_km=limit)
        if len(kept) == len(path):
            break
        pts = kept[1:-1]
    if len(path) < 4:
        return None
    return path


# ---------------------------------------------------------------- 4. 海・湾・海峡
SEA_CLASSES = [("Q39594", "湾"), ("Q37901", "海峡"), ("Q11566792", "灘"), ("Q1210950", "水道"), ("Q204894", "海"),
               ("Q2578218", "内海"), ("Q491713", "湾"), ("Q11285599", "海"), ("Q165", "海"), ("Q9430", "海")]
BIG_SEAS = {  # 遠いズームでも出す。ラベル点は日本を中心にした地図向けに手で置く
    "Q98": ("太平洋", 31.0, 143.0), "Q27092": ("日本海", 39.5, 134.5), "Q41602": ("オホーツク海", 45.5, 145.5),
    "Q45341": ("東シナ海", 29.0, 126.5), "Q159183": ("フィリピン海", 25.0, 134.5), "Q231312": ("瀬戸内海", None, None),
}
SEA_NAME_NOISE = re.compile(r"(湖|ビーチ|港|海岸|浜|海水浴場)$")
SEA_NEAR_KM = 150.0                       # 日本の陸地からこの距離までの海域を載せる
HISTORIC_SEAS = {"香取海", "江戸湾"}


def kind_of_sea(name, cls_kind):
    for suf, k in (("海峡", "海峡"), ("水道", "水道"), ("瀬戸", "海峡"), ("灘", "灘"), ("内海", "内海"), ("湾", "湾"), ("海", "海"),
                   ("入江", "湾"), ("入り江", "湾")):
        if name.endswith(suf):
            return k
    if name.endswith("浦") or name.endswith("門"):
        return "海峡" if cls_kind in ("海峡", "水道") else "湾"
    return cls_kind


def fetch_seas():
    items = {}
    for cq, kind in SEA_CLASSES:
        rows = sparql(f"""
SELECT DISTINCT ?i ?iLabel ?co ?art ?img ?c WHERE {{
  ?i wdt:P31 wd:{cq} .
  ?i wdt:P625 ?co .
  ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> .
  OPTIONAL {{ ?i wdt:P18 ?img }}
  OPTIONAL {{ ?i wdt:P17 ?c }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja". }}
}}""")
        n = 0
        for r in rows:
            pt = parse_point(r["co"]["value"])
            if not pt or not in_bbox(*pt):
                continue
            q = qid_of(r["i"]["value"])
            o = items.setdefault(q, {"q": q, "n": r["iLabel"]["value"], "la": pt[0], "lo": pt[1], "wp": title_of(r["art"]["value"]),
                                     "kinds": [], "countries": set(), "img": None})
            if kind not in o["kinds"]:
                o["kinds"].append(kind)
            if "c" in r:
                o["countries"].add(qid_of(r["c"]["value"]))
            if "img" in r and not o["img"]:
                o["img"] = commons_name(r["img"]["value"])
            n += 1
        log(f"    {kind} {cq}: {len(rows)} 件 → 範囲内 {n}")
    # 大きな海は座標が範囲外でも入れる
    vals = " ".join("wd:" + q for q in BIG_SEAS)
    rows = sparql(f"""
SELECT ?i ?iLabel ?co ?art ?img WHERE {{
  VALUES ?i {{ {vals} }}
  OPTIONAL {{ ?i wdt:P625 ?co }} OPTIONAL {{ ?i wdt:P18 ?img }}
  OPTIONAL {{ ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja". }}
}}""")
    for r in rows:
        q = qid_of(r["i"]["value"])
        name, la, lo = BIG_SEAS[q]
        pt = parse_point(r["co"]["value"]) if "co" in r else None
        o = items.setdefault(q, {"q": q, "n": name, "la": None, "lo": None, "wp": title_of(r["art"]["value"]) if "art" in r else name,
                                 "kinds": ["海"], "countries": set(), "img": None})
        if la is not None:
            o["la"], o["lo"] = la, lo
        elif pt and in_bbox(*pt) and o["la"] is None:
            o["la"], o["lo"] = pt
        if "img" in r and not o["img"]:
            o["img"] = commons_name(r["img"]["value"])
        o["big"] = 1
    return items


def ne_marine(ne):
    """Natural Earth の海域ポリゴンのうち、日本の範囲に頂点があるもの → wikidataid ごとの範囲内ラベル点"""
    out = {}
    if not ne:
        return out
    for f in ne["features"]:
        pr = f["properties"]
        pts = [(p[1], p[0]) for p in geom_points(f["geometry"])]
        inside = [p for p in pts if in_bbox(*p)]
        if not inside:
            continue
        la = sum(p[0] for p in inside) / len(inside)
        lo = sum(p[1] for p in inside) / len(inside)
        out[pr.get("wikidataid") or pr.get("name")] = {"name": pr.get("name"), "name_ja": pr.get("name_ja"),
                                                       "la": round(la, 2), "lo": round(lo, 2), "featurecla": pr.get("featurecla")}
    return out


# ---------------------------------------------------------------- 5. 海流（手描きの概略線）
# pts は地理の一般知識から手で描いた概略線（流れの始まり → 終わり）。spd は各記事（日本語版 Wikipedia）の記述を
# 短くまとめたもの。記事に流速の記述が無いものは一般的な値に「程度」を付けてある。
CURRENTS = [
    {"n": "黒潮", "warm": True, "wp": "黒潮",
     "pts": [[18.5, 122.6], [20.5, 122.2], [22.5, 122.3], [24.3, 122.6], [25.5, 124.3], [26.8, 125.8], [28.0, 127.3],
             [29.2, 128.6], [29.9, 129.6], [30.4, 131.4], [31.8, 132.4], [32.6, 133.8], [33.2, 135.4], [33.6, 136.9],
             [34.0, 138.3], [33.8, 139.7], [34.6, 140.6], [35.2, 141.6], [35.5, 143.0]],
     "spd": "最大 4ノット（約7.4 km/h）"},
    {"n": "黒潮続流", "warm": True, "wp": "黒潮続流", "dkey": "続流",
     "pts": [[35.5, 143.0], [35.0, 144.3], [35.6, 145.8], [35.9, 147.2], [35.3, 148.6], [35.8, 150.0]],
     "spd": "1〜2ノット程度"},
    {"n": "親潮", "warm": False, "wp": "親潮",
     "pts": [[47.5, 153.0], [46.0, 150.5], [44.5, 147.5], [43.2, 146.2], [42.3, 144.8], [41.6, 143.3], [40.6, 142.6],
             [39.6, 142.4], [38.5, 142.4], [37.2, 142.3]],
     "spd": "速いときでも 1ノット（約0.5 m/s）程度"},
    {"n": "対馬海流", "warm": True, "wp": "対馬海流",
     "pts": [[33.8, 128.9], [34.5, 130.4], [35.4, 132.3], [36.1, 134.2], [36.9, 135.9], [37.7, 137.2], [38.6, 139.1],
             [39.7, 139.6], [40.7, 139.8], [41.6, 139.8], [42.6, 139.6], [43.6, 140.6], [44.5, 141.1], [45.3, 141.45]],
     "spd": "0.5〜1ノット程度"},
    {"n": "津軽暖流", "warm": True, "wp": "津軽暖流",
     "pts": [[41.33, 140.05], [41.45, 140.6], [41.62, 140.95], [41.62, 141.3], [41.5, 141.6], [41.1, 141.7], [40.6, 141.9],
             [40.2, 142.0]],
     "spd": "1〜3ノット（夏に強い）"},
    {"n": "宗谷暖流", "warm": True, "wp": "宗谷暖流",
     "pts": [[45.3, 141.45], [45.6, 142.1], [45.3, 142.6], [44.9, 143.4], [44.5, 144.2], [44.2, 145.0], [44.45, 145.45]],
     "spd": "春・秋 1.5ノット、夏は 3ノット"},
    {"n": "リマン海流", "warm": False, "wp": "リマン海流",
     "pts": [[48.0, 140.3], [46.8, 139.2], [45.6, 137.8], [44.4, 136.4], [43.4, 135.1], [42.7, 133.6], [42.2, 132.0],
             [41.4, 130.6], [40.4, 129.9]],
     "spd": "0.3ノット程度"},
    {"n": "北赤道海流", "warm": True, "wp": "北赤道海流",
     "pts": [[13.0, 150.0], [13.3, 145.0], [13.6, 140.0], [14.0, 135.0], [14.5, 130.0], [15.5, 126.0], [17.5, 123.0]],
     "spd": "0.3〜0.5ノット程度"},
]


def resolve_titles(titles):
    """記事名 → リダイレクト先の記事名"""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "titles": "|".join(chunk), "redirects": 1, "format": "json", "formatversion": 2})
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        exists = {p["title"] for p in q.get("pages", []) if not p.get("missing")}
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in exists:
                out[t] = tt
    return out


def knot_sentences(title):
    """記事本文の「〜ノット」を含む文（確認用ログ）"""
    try:
        wt = wikitext(title)
    except Exception:
        return []
    wt = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", wt, flags=re.S)
    wt = re.sub(r"\[\[([^\]|]+\|)?", "", wt).replace("]]", "")
    return [m.group(1).strip()[:80] for m in re.finditer(r"([^。\n]*\d[^。\n]*ノット[^。\n]*)", wt)]


# ---------------------------------------------------------------- main
def compact(o):
    """値の無いキーを省く（False は残す: CURRENTS の warm）"""
    return {k: v for k, v in o.items() if v is not None and v != "" and v != [] and v != {}}


def dumps(v):
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def main():
    log("■ 1. 一級水系（Wikipedia の表）")
    rivers = parse_ikkyu()
    log(f"    {len(rivers)} 水系: " + ", ".join(collections.Counter(r['region'] for r in rivers).keys()))
    if len(rivers) != 109:
        log(f"    !! 109 件のはずが {len(rivers)} 件。表の書式が変わったかもしれません")

    log("■ 2. 二級河川の候補（二級水系・日本の川一覧）")
    nikyu = parse_nikyu()
    log(f"    {len(nikyu)} 件")

    log("■ 3. QID")
    q_of = titles_to_qids([r["wp0"] for r in rivers] + [r["wp0"] for r in nikyu])
    for r in rivers + nikyu:
        r["q"] = q_of.get(r["wp0"])
    miss = [r["n"] for r in rivers if not r["q"]]
    if miss:
        log(f"    QID が見つからない一級: {miss}")
    nikyu = [r for r in nikyu if r["q"] and r["q"] not in {x["q"] for x in rivers}]
    seen = set()
    nikyu = [r for r in nikyu if not (r["q"] in seen or seen.add(r["q"]))]

    log("■ 4. Wikidata（座標・水源・写真）")
    qids = [r["q"] for r in rivers if r["q"]] + [r["q"] for r in nikyu]
    info = fetch_rivers_wd(qids)

    log("■ 5. 支流の合流点（Wikidata）")
    trib = fetch_tributary_points([r["q"] for r in rivers if r["q"]])
    log(f"    合流点のある川 {sum(1 for v in trib.values() if v)} / {len(rivers)}")

    # 水源が Wikidata に無いもの → 記事の水源リンク
    need_src = [r for r in rivers if r["q"] and not any(part == RIVER_SOURCE for _, part in info[r["q"]]["co"]) and not info[r["q"]]["src"]]
    log(f"■ 6. 記事の水源リンク {len(need_src)} 件")
    src_links = infobox_source_links([info[r["q"]]["wp"] or r["wp0"] for r in need_src])
    src_q = titles_to_qids(list(src_links.values()))
    src_pts = {}
    if src_q:
        vals = " ".join("wd:" + q for q in set(src_q.values()))
        for row in sparql(f"SELECT ?i ?co WHERE {{ VALUES ?i {{ {vals} }} ?i wdt:P625 ?co }}"):
            src_pts.setdefault(qid_of(row["i"]["value"]), parse_point(row["co"]["value"]))
    # Wikidata に座標が無い水源は記事の座標（{{ウィキ座標}}）
    src_wp_co = page_coords([t for t in src_links.values() if not src_pts.get(src_q.get(t))]) if src_links else {}
    got = 0
    for r in need_src:
        t = info[r["q"]]["wp"] or r["wp0"]
        link = src_links.get(t)
        if not link:
            continue
        pt = src_pts.get(src_q.get(link)) or src_wp_co.get(link)
        if pt:
            info[r["q"]]["src"].append(pt)
            got += 1
    log(f"    {got} 件で水源の座標が見つかった")

    # 座標が無いものは記事の座標
    no_co = [info[q]["wp"] for q in qids if not info[q]["co"] and info[q]["wp"]]
    wp_co = page_coords(no_co) if no_co else {}

    log("■ 7. 河口・水源の決定")
    mouth_of, src_of, flag_of = {}, {}, {}
    for r in rivers + nikyu:
        if not r["q"]:
            continue
        o = info[r["q"]]
        mouth, src, flag = choose_mouth_and_source(o, wp_co.get(o["wp"]))
        # 水源が河口から遠すぎる／近すぎるときは同名の別の山などを拾っている → 捨てる
        if mouth and src:
            d = km(mouth, src)
            length = r.get("len") or o["len"] or 100.0
            if d > length * 1.3 + 15.0 or d < 2.0:
                log(f"    {r['n']}: 水源が河口から {d:.0f} km（延長 {length:.0f} km）なので水源を捨てる")
                src = None
        mouth_of[r["q"]], src_of[r["q"]], flag_of[r["q"]] = mouth, src, flag
    log(f"    一級: 河口あり {sum(1 for r in rivers if mouth_of.get(r['q']))} 水源あり {sum(1 for r in rivers if src_of.get(r['q']))}")

    log("■ 8. 折れ線（Natural Earth → Commons → Wikidata の合流点）")
    ne_rivers = natural_earth("rivers")
    ne_lines = ne_river_lines(ne_rivers, rivers, mouth_of)
    log(f"    Natural Earth: {len(ne_lines)} 本 " + ", ".join(r["n"] for r in rivers if r["q"] in ne_lines))
    cm_lines = commons_river_lines(rivers, mouth_of)
    log(f"    Commons: {len(cm_lines)} 本 " + ", ".join(r["n"] for r in rivers if r["q"] in cm_lines))
    # Wikidata の支流が少ない川は、記事の「支流」の節のリンク先を足す
    need = [r for r in rivers if r["q"] and r["q"] not in ne_lines and r["q"] not in cm_lines and len(trib.get(r["q"], [])) < 12]
    log(f"    記事の支流の節を読む: {len(need)} 川")
    art_titles = {}
    for r in need:
        wp = info[r["q"]]["wp"] or r["wp0"]
        art_titles[r["q"]] = article_tributary_titles(wp, wp)
    t_q = titles_to_qids([t for ts in art_titles.values() for t in ts])
    t_co = coords_with_parts(list(t_q.values()))
    added = collections.Counter()
    for q, ts in art_titles.items():
        have = trib.setdefault(q, [])
        for t in ts:
            tq = t_q.get(t)
            if not tq or tq == q or tq not in t_co:
                continue
            p = confluence_points(t_co[tq])
            if p and not any(km(p, x) < 0.5 for x in have):
                have.append(p)
                added[q] += 1
    log(f"    記事から足した合流点: {sum(added.values())} 点 / {len(added)} 川")
    pts_of, ps_of = {}, {}
    for r in rivers:
        q = r["q"]
        if not q:
            continue
        if q in ne_lines:
            pts_of[q], ps_of[q] = ne_lines[q], "ne"
        elif q in cm_lines:
            pts_of[q], ps_of[q] = cm_lines[q][0], "commons"
        else:
            line = wd_river_line(src_of.get(q), mouth_of.get(q), trib.get(q, []), r["len"])
            if line:
                pts_of[q], ps_of[q] = line, "wd"
    log(f"    Wikidata 概略線: {sum(1 for v in ps_of.values() if v == 'wd')} 本")
    # Natural Earth / Commons の線と Wikidata 概略線の食い違いの目安（両方あるもの）
    for r in rivers:
        q = r["q"]
        if q in ne_lines or q in cm_lines:
            ref = ne_lines.get(q) or cm_lines[q][0]
            line = wd_river_line(src_of.get(q), mouth_of.get(q), trib.get(q, []), r["len"])
            if line:
                dmax = max(min(km(p, x) for x in ref) for p in line[1:-1])
                log(f"    参考 {r['n']}: Wikidata 概略線 {len(line)} 点 / 線からの最大距離 {dmax:.1f} km")

    log("■ 9. 記事の冒頭・写真")
    all_r = [r for r in rivers + nikyu if r["q"]]
    ex_r = extracts([info[r["q"]]["wp"] or r["wp0"] for r in rivers], 4)
    ex_r2 = extracts([info[r["q"]]["wp"] or r["wp0"] for r in nikyu], 2)
    noimg = [info[r["q"]]["wp"] for r in all_r if not info[r["q"]]["img"] and info[r["q"]]["wp"]]
    pimg = page_images(noimg) if noimg else {}

    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))

    def build_river(r, grade):
        q = r["q"]
        o = info[q]
        wp = o["wp"] or r["wp0"]
        mouth, src, flag = mouth_of.get(q), src_of.get(q), flag_of.get(q)
        la, lo = (mouth or src or (None, None))
        pf = r.get("pf") or []
        if not pf and la is not None:
            props, _ = locate(prefs, lo, la, near_km=8.0)
            if props:
                pf = [props.get("n")]
        img = o["img"] or pimg.get(wp)
        if img and img.lower().startswith("file:"):
            img = img[5:]
        d = (ex_r if grade == 1 else ex_r2).get(wp)
        out = {"n": r["n"], "sys": r.get("sys") if r.get("sys") and r.get("sys") != r["n"] else None,
               "len": r.get("len") if r.get("len") is not None else (round(o["len"]) if o["len"] else None),
               "area": r.get("area") if r.get("area") is not None else (round(o["area"]) if o["area"] else None),
               "pf": pf, "wp": wp, "q": q,
               "la": round(la, 4) if la is not None else None, "lo": round(lo, 4) if lo is not None else None,
               "pt": flag, "src": [round(src[0], 4), round(src[1], 4)] if src and not flag else None,
               "img": img.replace("_", " ") if img else None, "d": d, "grade": grade}
        if q in pts_of:
            out["pts"] = round_pts(thin(pts_of[q]))
            out["ps"] = ps_of[q]
        for k in ("len", "area"):
            if isinstance(out[k], float) and out[k].is_integer():
                out[k] = int(out[k])
        return compact(out)

    out_rivers = [build_river(r, 1) for r in rivers if r["q"]]
    out_rivers2 = [x for x in (build_river(r, 2) for r in nikyu) if "la" in x]

    log("■ 10. 海・湾・海峡（Wikidata）")
    seas = fetch_seas()
    ne_m = ne_marine(natural_earth("marine"))
    log(f"    Natural Earth の海域（範囲内）: {len(ne_m)} 件")
    for key, m in ne_m.items():
        if key in seas or not m.get("name_ja"):
            continue
        if not str(key).startswith("Q"):
            continue
        seas[key] = {"q": key, "n": m["name_ja"], "la": m["la"], "lo": m["lo"], "wp": None, "kinds": ["海"], "countries": set(),
                     "img": None, "ne": 1}
    out_seas = []
    drop = collections.Counter()
    dropped_far = []
    for q, o in seas.items():
        name = strip_paren(o["n"])
        if o["la"] is None:
            drop["座標なし"] += 1
            continue
        if not in_bbox(o["la"], o["lo"]):
            drop["範囲外"] += 1
            continue
        if SEA_NAME_NOISE.search(name) or name in HISTORIC_SEAS or re.match(r"^Q\d+$", name):
            drop["名前ノイズ・歴史的名称"] += 1
            continue
        big = o.get("big")
        # 日本の陸地（都道府県ポリゴン）から 150 km 以内にあるものだけ。大きな海は例外
        if not big:
            props, _ = locate(prefs, o["lo"], o["la"], near_km=SEA_NEAR_KM)
            if not props:
                drop["日本から遠い"] += 1
                dropped_far.append(name)
                continue
        k = kind_of_sea(name, o["kinds"][0])
        out_seas.append({"n": name, "k": k, "la": round(o["la"], 3), "lo": round(o["lo"], 3), "wp": o["wp"], "q": q,
                         "img": o["img"], "big": 1 if big else None})
    # 同名・近接（20 km）の重複をまとめる
    dedup = []
    for s in sorted(out_seas, key=lambda s: (0 if s["big"] else 1, s["n"])):
        if any(t["n"] == s["n"] and km((t["la"], t["lo"]), (s["la"], s["lo"])) < 20.0 for t in dedup):
            drop["重複"] += 1
            continue
        dedup.append(s)
    out_seas = dedup
    if dropped_far:
        log("    日本から遠いので除外: " + "、".join(dropped_far))
    ex_s = extracts([s["wp"] for s in out_seas if s["wp"]], 3)
    noimg = [s["wp"] for s in out_seas if not s["img"] and s["wp"]]
    pimg_s = page_images(noimg) if noimg else {}
    for s in out_seas:
        s["d"] = ex_s.get(s["wp"]) if s["wp"] else None
        if not s["img"] and s["wp"]:
            s["img"] = pimg_s.get(s["wp"])
        if s["img"]:
            s["img"] = s["img"].replace("_", " ")
            if s["img"].lower().startswith("file:"):
                s["img"] = s["img"][5:]
    out_seas = [compact(s) for s in out_seas]
    out_seas.sort(key=lambda s: (0 if s.get("big") else 1, -s["la"]))
    log(f"    {len(out_seas)} 件 / 除外 {dict(drop)}")

    log("■ 11. 海流")
    resolved = resolve_titles([c["wp"] for c in CURRENTS])          # 黒潮続流 → 黒潮、宗谷暖流 → 宗谷海流 など
    cq = titles_to_qids([c["wp"] for c in CURRENTS])
    cimg = {}
    if cq:
        vals = " ".join("wd:" + q for q in set(cq.values()))
        for row in sparql(f"SELECT ?i ?img WHERE {{ VALUES ?i {{ {vals} }} ?i wdt:P18 ?img }}"):
            cimg.setdefault(qid_of(row["i"]["value"]), commons_name(row["img"]["value"]))
    ex_c = extracts([c["wp"] for c in CURRENTS], 4)
    ex_c8 = extracts([c["wp"] for c in CURRENTS if c.get("dkey")], 10)
    pimg_c = page_images([c["wp"] for c in CURRENTS if not cimg.get(cq.get(c["wp"]))])
    out_cur = []
    for c in CURRENTS:
        q = cq.get(c["wp"])
        wp = resolved.get(c["wp"])
        img = cimg.get(q) or pimg_c.get(c["wp"])
        d = ex_c.get(c["wp"])
        if c.get("dkey") and wp != c["wp"]:
            # 記事が別の記事へのリダイレクト → その記事の冒頭から、この海流に触れている文だけ
            sents = [x for x in re.split(r"(?<=。)", ex_c8.get(c["wp"], "")) if c["dkey"] in x]
            d = "".join(sents).strip() or d
        log(f"    {c['n']}: wp={wp} spd={c['spd']!r} 記事のノット記述={knot_sentences(c['wp'])[:2]}")
        out_cur.append(compact({"n": c["n"], "warm": c["warm"], "pts": c["pts"], "spd": c["spd"], "d": d,
                                "wp": wp, "img": img.replace("_", " ") if img else None, "q": q}))

    # ---------------------------------------------------------------- 書き出し
    today = datetime.date.today().isoformat()
    header = f"""/* 川・海・海流（自動生成: tools/build_water.py）取得日: {today}
   RIVERS   n=幹川名 sys=水系名(幹川名と違うときだけ) len=流路延長km area=流域面積km² pf=流域の都道府県(上流側から)
            wp=日本語版Wikipediaの記事名 q=Wikidata la/lo=河口の座標(pt:"src"なら水源の座標しか無い) src=[la,lo]源流
            img=Commonsのファイル名 d=記事の冒頭 grade=1 一級水系の幹川 / 2 二級河川
            pts=[[la,lo],...] 源流→河口の折れ線(小数3桁・60点以下) ps=pts の出どころ
               "ne"=Natural Earth 10m rivers(パブリックドメイン) "commons"=Commons Data:Japan/Geography/*.map(CC0)
               "wd"=Wikidataの支流の合流点(河口座標)を源流→河口の順に並べた概略線。形は目安で、蛇行は再現しない
   SEAS     n=名前 k=海/湾/海峡/水道/灘/内海 la/lo=ラベルを置く点 big=1 は遠いズームでも出す大きな海(ラベル点は手置き)
   CURRENTS n=名前 warm=暖流か pts=流れの始まり→終わりの順の概略線(地理の一般知識から手で描いたもの。小数2桁) spd=流速の目安
   値のないキーは省いてあります。
   出典: Wikipedia 日本語版「一級水系」「二級水系」「日本の川一覧」・各記事の冒頭(CC BY-SA 4.0) / Wikidata(CC0 1.0)
         Natural Earth(パブリックドメイン) / Wikimedia Commons Data:(CC0 1.0) / 写真は Wikimedia Commons(ファイルごとのライセンス)
         OpenStreetMap は使っていません。 */
"""

    tiers = {r["q"]: r.get("tier", 1) for r in nikyu}

    def render(max_tier):
        rv = out_rivers + [r for r in out_rivers2 if tiers.get(r["q"], 1) <= max_tier]
        return rv, (header + "RG.RIVERS = " + dumps(rv) + ";\n" + "RG.SEAS = " + dumps(out_seas) + ";\n"
                    + "RG.CURRENTS = " + dumps(out_cur) + ";\n")

    # 二級河川は「二級水系」の主要 3 水系（tier 1）→「日本の川一覧」の明記分（tier 2）の順に、上限に収まるだけ載せる
    for max_tier in (2, 1, 0):
        rv, js = render(max_tier)
        size_kb = len(js.encode("utf-8")) / 1024
        if size_kb <= GRADE2_LIMIT_KB or max_tier == 0:
            break
        log(f"    二級河川 tier≤{max_tier} を足すと {size_kb:.0f} KB > {GRADE2_LIMIT_KB} KB なので減らします")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)

    # ---------------------------------------------------------------- まとめ
    g2 = [r for r in rv if r["grade"] == 2]
    print()
    print(f"=== data/water.js  {os.path.getsize(OUT) / 1024:.0f} KB ===")
    print(f"RIVERS {len(rv)} 件（一級 {len(out_rivers)} / 二級 {len(g2)}: 「二級水系」主要 {sum(1 for r in g2 if tiers.get(r['q']) == 1)} + "
          f"「日本の川一覧」明記 {sum(1 for r in g2 if tiers.get(r['q']) == 2)}）")
    print(f"  二級: 河口座標 {sum(1 for r in g2 if 'la' in r and not r.get('pt'))} / 写真 {sum(1 for r in g2 if r.get('img'))} / 冒頭 {sum(1 for r in g2 if r.get('d'))}")
    print(f"  河口座標 {sum(1 for r in out_rivers if 'la' in r and not r.get('pt'))} / 水源のみ {sum(1 for r in out_rivers if r.get('pt'))} / "
          f"源流 src {sum(1 for r in out_rivers if r.get('src'))} / 写真 {sum(1 for r in out_rivers if r.get('img'))} / 冒頭 {sum(1 for r in out_rivers if r.get('d'))}")
    ps = collections.Counter(r.get("ps") for r in out_rivers if r.get("pts"))
    print(f"  折れ線 pts {sum(ps.values())} 本: " + ", ".join(f"{k} {v}" for k, v in ps.items()))
    print("  Natural Earth と一致:", ", ".join(r["n"] for r in out_rivers if r.get("ps") == "ne") or "なし")
    print("  Commons と一致:", ", ".join(r["n"] for r in out_rivers if r.get("ps") == "commons") or "なし")
    print("  折れ線なし:", ", ".join(r["n"] for r in out_rivers if not r.get("pts")) or "なし")
    print(f"SEAS {len(out_seas)} 件: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(s['k'] for s in out_seas).most_common())
          + f" / big {sum(1 for s in out_seas if s.get('big'))} / 写真 {sum(1 for s in out_seas if s.get('img'))} / 冒頭 {sum(1 for s in out_seas if s.get('d'))}")
    print(f"CURRENTS {len(out_cur)} 本: " + ", ".join(f"{c['n']}({len(c['pts'])}点)" for c in out_cur))


if __name__ == "__main__":
    main()
