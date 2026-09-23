# -*- coding: utf-8 -*-
"""
企業データセット v2 を作る: data/corp.js (上場企業 + 大企業〈非上場・有報提出〉) と
data/corp_gone.js (消滅した企業; Wikidata)。

■ 入力（あらかじめ /tmp に置く）
  /tmp/data_j.xlsx            JPX 東証上場銘柄一覧 (2026-08-31)
        https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx
  /tmp/EdinetcodeDlInfo.csv   金融庁 EDINET コードリスト (cp932, 1行目はタイトル行)
        https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip
  /tmp/latest.csv             Geolonia 住所データ (町丁目レベル代表点; CC BY 4.0)
        https://github.com/geolonia/japanese-addresses  (api/ja.json ではなく latest.csv)
  Wikidata (CC0)              SPARQL https://query.wikidata.org/sparql  (P3225 = 法人番号で突合)

■ つなぎ方
  JPX コード(4桁) = EDINET 証券コード[:4]。所在地(EDINET)は都道府県名を省くことが多いので
  Geolonia の市区町村名→町丁目名で前方一致させて座標にする（gp=1 町丁目, gp=2 市区町村代表点）。
  Wikidata は EDINET の法人番号 (P3225) で引く。

■ 使い方
  python3 tools/build_corp2.py            # 全部
  python3 tools/build_corp2.py --no-wd    # Wikidata を引かない（キャッシュがあれば使う）
  Wikidata の応答は /tmp/corp2_cache/ に JSON で保存し、再実行時はそれを使う。
"""
import os, re, io, sys, json, time, math, collections, unicodedata, urllib.parse
from decimal import Decimal
import pandas as pd
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = "/tmp/corp2_cache"   # Wikidata 応答のキャッシュ（再実行を速くする）
os.makedirs(CACHE, exist_ok=True)
BUILT = "2026-09-06"
JPX_DATE = "2026-08-31"
NO_WD = "--no-wd" in sys.argv

JPX_XLSX = "/tmp/data_j.xlsx"
EDINET_CSV = "/tmp/EdinetcodeDlInfo.csv"
GEOLONIA_CSV = "/tmp/latest.csv"
SPARQL = "https://query.wikidata.org/sparql"
HDR = {"User-Agent": "tokyostation-corp/1.0 (static-site data build; github tokyostation)",
       "Accept": "application/sparql-results+json"}

def nfkc(s):
    return unicodedata.normalize("NFKC", str(s if s is not None else "")).strip()

def log(*a):
    print(*a, file=sys.stderr, flush=True)

# ============================================================ 1. JPX
MK = {"プライム": "P", "スタンダード": "S", "グロース": "G"}
jpx = pd.read_excel(JPX_XLSX, dtype=str)
rows_jpx = []
for _, r in jpx.iterrows():
    seg = str(r["市場・商品区分"])
    mk = None
    for k, v in MK.items():
        if seg.startswith(k) and ("内国株式" in seg or "外国株式" in seg):
            mk = v
    if not mk:
        continue
    def nz(x):
        x = nfkc(x)
        return None if x in ("", "-", "nan") else x
    rows_jpx.append({
        "c": nfkc(r["コード"]), "n": nfkc(r["銘柄名"]), "mk": mk,
        "i33": nz(r["33業種区分"]), "i17": nz(r["17業種区分"]), "sz": nz(r["規模区分"]),
    })
log("JPX 対象銘柄:", len(rows_jpx), collections.Counter(x["mk"] for x in rows_jpx))

# ============================================================ 2. EDINET
ed = pd.read_csv(EDINET_CSV, encoding="cp932", skiprows=1, dtype=str).fillna("")
def cap_int(x):
    x = nfkc(x).replace(",", "")
    try:
        return int(float(x))
    except Exception:
        return None
ed_by_code = {}
for _, r in ed.iterrows():
    sc = nfkc(r["証券コード"])
    if len(sc) >= 4 and r["提出者種別"].startswith("内国法人") :
        k = sc[:4]
        # 上場行を優先。同一コードが複数あれば先勝ち
        if k not in ed_by_code or (r["上場区分"] == "上場" and ed_by_code[k]["上場区分"] != "上場"):
            ed_by_code[k] = r

def ed_fields(r):
    d = {"ad": str(r["所在地"]).strip() or None,
         "cn": nfkc(r["提出者法人番号"]) or None,
         "ed": nfkc(r["ＥＤＩＮＥＴコード"]) or None,
         "cap": cap_int(r["資本金"]),
         "fy": nfkc(r["決算日"]) or None,
         "en": nfkc(r["提出者名（英字）"]) or None}
    if d["cn"] and not re.fullmatch(r"\d{13}", d["cn"]):
        d["cn"] = None
    return d

recs = []
matched = 0
for j in rows_jpx:
    r = ed_by_code.get(j["c"])
    rec = dict(j)
    if r is not None:
        matched += 1
        rec.update(ed_fields(r))
    recs.append(rec)
log("JPX×EDINET 突合:", matched, "/", len(rows_jpx))

# 非上場・大企業 (有報提出) : 内国法人・組合, 資本金 >= 1000 百万円, 上位 1000 社
listed_codes = set(j["c"] for j in rows_jpx)
unl = []
for _, r in ed.iterrows():
    if r["上場区分"] != "非上場" or r["提出者種別"] != "内国法人・組合":
        continue
    sc = nfkc(r["証券コード"])
    if sc and sc[:4] in listed_codes:
        continue
    cap = cap_int(r["資本金"])
    if cap is None or cap < 1000:
        continue
    name = nfkc(r["提出者名"])
    name = re.sub(r"株式会社|\(株\)|㈱", "", name).replace("　", " ").strip()
    d = {"n": name, "c": None, "mk": "N", "i33": nfkc(r["提出者業種"]) or None, "i17": None, "sz": None}
    d.update(ed_fields(r))
    unl.append(d)
unl.sort(key=lambda x: -(x["cap"] or 0))
unl = unl[:1000]
log("非上場・大企業:", len(unl), "資本金下限(百万円):", unl[-1]["cap"] if unl else None)
recs += unl

# ============================================================ 3. Geolonia ジオコーディング
KANJI = {"〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
def kanji2int(s):
    if s.isdigit():
        return int(s)
    if "十" in s:
        a, b = s.split("十", 1)
        return (KANJI.get(a, 1) if a else 1) * 10 + (KANJI.get(b, 0) if b else 0)
    if "百" in s:
        return None
    n = 0
    for ch in s:
        if ch not in KANJI:
            return None
        n = n * 10 + KANJI[ch]
    return n

# 「N丁目」「N丁」(堺市)「N条」(札幌市) の漢数字を算用数字にそろえる（住所側・Geolonia 側とも同じ関数を通す）
NUM_RE = re.compile(r"([一二三四五六七八九十〇]+)(丁目|丁(?![目字])|条|番町)")
CHOME_RE = re.compile(r"^(.*?)([0-9]+)丁目?")
def tnorm(s):
    s = nfkc(s)
    s = re.sub(r"[\s　]", "", s)
    s = s.replace("ヶ", "ケ").replace("ヵ", "カ").replace("之", "の").replace("ノ", "の")
    s = re.sub(r"[ー－‐−―–—]", "-", s)
    s = NUM_RE.sub(lambda m: str(kanji2int(m.group(1)) if kanji2int(m.group(1)) is not None else m.group(1)) + m.group(2), s)
    return s

def split_town(name):
    """Geolonia 町丁目名 → (base, chome or None)"""
    n = tnorm(name)
    m = CHOME_RE.match(n)
    if m:
        c = kanji2int(m.group(2))
        return m.group(1), c
    return n, None

log("Geolonia 読み込み...")
geo = pd.read_csv(GEOLONIA_CSV, dtype=str, usecols=["都道府県名", "市区町村名", "大字町丁目名", "緯度", "経度"])
geo = geo.dropna(subset=["緯度", "経度"])
# city index
city_towns = collections.defaultdict(list)          # (pref, city) -> [(lat, lon)]
town_pts = collections.defaultdict(lambda: collections.defaultdict(list))   # (pref,city) -> key -> [(lat,lon)]
ku_towns = collections.defaultdict(set)   # 東京23区の町名 -> {(pref, 区)}  区名なし住所の救済用
for pref, city, town, la, lo in geo.itertuples(index=False):
    try:
        la = float(la); lo = float(lo)
    except Exception:
        continue
    pc = (pref, city)
    city_towns[pc].append((la, lo))
    base, ch = split_town(town if isinstance(town, str) else "")
    if not base:
        continue
    variants = {base}
    for b in list(variants):
        if b.startswith("大字"):
            variants.add(b[2:])
        if b.startswith("字"):
            variants.add(b[1:])
    for b in list(variants):
        if "ケ" in b: variants.add(b.replace("ケ", "が"))
        if "が" in b: variants.add(b.replace("が", "ケ"))
    mm = re.match(r"^(.+?市)(.+区)$", city)
    for key in ((pc, (pref, "*" + mm.group(1))) if mm else (pc,)):
        tp = town_pts[key]
        for b in variants:
            tp[b].append((la, lo))
            if ch is not None:
                tp[(b, ch)].append((la, lo))
    if pref == "東京都" and city.endswith("区"):
        for b in variants:
            ku_towns[b].add(pc)

def mean(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
city_cent = {pc: mean(v) for pc, v in city_towns.items()}
town_cent = {pc: {k: mean(v) for k, v in d.items()} for pc, d in town_pts.items()}

# 市区町村名のキー: 正式名 / 郡を除いた町村名 / 政令市の「市」だけ
city_index = collections.defaultdict(set)   # key -> {(pref, city)}
for pref, city in city_towns:
    c = tnorm(city)
    city_index[c].add((pref, city))
    m = re.match(r"^(.+?郡)(.+)$", c)
    if m:
        city_index[m.group(2)].add((pref, city))
    m = re.match(r"^(.+?市)(.+区)$", c)
    if m:
        city_index[m.group(1)].add((pref, "*" + m.group(1)))   # 政令市全体
# 政令市全体の代表点
seirei = collections.defaultdict(list)
for (pref, city), pts in city_towns.items():
    m = re.match(r"^(.+?市)(.+区)$", city)
    if m:
        seirei[(pref, "*" + m.group(1))] += pts
for k, v in seirei.items():
    city_cent[k] = mean(v)
    city_towns[k] = v
PREF_RE = re.compile(r"^(東京都|北海道|京都府|大阪府|[^\s]{2,3}県)")
MAXCITY = max(len(k) for k in city_index)

def geocode(addr):
    """→ (la, lo, gp, pref) or None"""
    a = tnorm(addr)
    if not a:
        return None
    pref = None
    m = PREF_RE.match(a)
    if m and m.group(1) in set(p for p, _ in city_towns):
        pref = m.group(1); a = a[m.end():]
    cands, rest = None, None
    for L in range(min(len(a), MAXCITY), 1, -1):
        k = a[:L]
        if k in city_index:
            cands = list(city_index[k]); rest = a[L:]; break
    if not cands:
        if pref in (None, "東京都"):
            a2 = a[2:] if a.startswith("大字") else a
            for L in range(min(len(a2), 12), 1, -1):
                b = a2[:L]
                if b in ku_towns and len(ku_towns[b]) == 1:
                    pc = next(iter(ku_towns[b]))
                    cands, rest = [pc], a2
                    break
        if not cands:
            return None
    if pref:
        c2 = [c for c in cands if c[0] == pref]
        if c2:
            cands = c2
    # (a) 町丁目一致
    for pc in cands:
        tc = town_cent.get(pc)
        if not tc:
            continue
        r = rest
        if r.startswith("大字"):
            r2 = r[2:]
        else:
            r2 = r
        for cand in (r, r2):
            hit = None
            for L in range(min(len(cand), 12), 0, -1):
                b = cand[:L]
                if b in tc:
                    hit = b; tail = cand[L:]; break
            if hit is None:
                continue
            m2 = re.match(r"^([0-9一二三四五六七八九十]+)(丁目|-|番|号|$)", tail)
            if m2:
                ch = kanji2int(m2.group(1))
                if ch is not None and (hit, ch) in tc:
                    la, lo = tc[(hit, ch)]
                    return (la, lo, 1, pc[0])
            la, lo = tc[hit]
            return (la, lo, 1, pc[0])
    # (b) 市区町村代表点。曖昧なら 東京都 → 町丁目数が多い方
    cands.sort(key=lambda pc: (pc[0] != "東京都", -len(city_towns[pc])))
    pc = cands[0]
    la, lo = city_cent[pc]
    return (la, lo, 2, pc[0])

gp_count = collections.Counter()
kept = []
for r in recs:
    g = geocode(r.get("ad") or "") if r.get("ad") else None
    if not g:
        gp_count[0] += 1
        r["gp"] = 0
        continue
    r["la"], r["lo"], r["gp"], r["pf"] = round(g[0], 5), round(g[1], 5), g[2], g[3]
    gp_count[g[2]] += 1
    kept.append(r)
log("ジオコーディング:", dict(gp_count), "住所あり:", sum(1 for r in recs if r.get("ad")))
# 失敗例を少し表示
fails = [r["ad"] for r in recs if r.get("ad") and r["gp"] == 0]
log("失敗例:", fails[:25])

# ============================================================ 4. Wikidata
def sparql(q, tries=6):
    delay = 2
    for i in range(tries):
        try:
            rr = requests.get(SPARQL, params={"query": q, "format": "json"}, headers=HDR, timeout=120)
        except Exception as e:
            log("  sparql error:", repr(e)[:120]); time.sleep(delay); delay *= 2; continue
        if rr.status_code == 200:
            try:
                return rr.json()["results"]["bindings"]
            except Exception as e:   # プロキシで応答が途中で切れることがある → やり直し
                log("  sparql broken json, retry", repr(e)[:80]); time.sleep(delay); delay *= 2; continue
        if rr.status_code in (429, 500, 502, 503, 504):
            ra = rr.headers.get("Retry-After")
            w = int(ra) if ra and ra.isdigit() else delay
            log("  sparql", rr.status_code, "retry in", w); time.sleep(w); delay *= 2; continue
        log("  sparql", rr.status_code, rr.text[:200])
        return None
    return None

def cached(name, fn):
    p = os.path.join(CACHE, name + ".json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    if NO_WD:
        return None
    v = fn()
    if v is not None:
        json.dump(v, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    return v

def year_of(v):
    m = re.match(r"^([+-]?\d{1,5})-", v or "")
    return int(m.group(1)) if m else None

def batches(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

Q_BASIC = """
SELECT ?item ?cn ?label ?desc (SAMPLE(?inc) AS ?inc) (SAMPLE(?web) AS ?web) (SAMPLE(?logo) AS ?logo)
       (SAMPLE(?dis) AS ?dis) (SAMPLE(?wp) AS ?wp) (GROUP_CONCAT(DISTINCT ?ind; separator=",") AS ?inds) WHERE {
  VALUES ?cn { %s }
  ?item wdt:P3225 ?cn.
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)="ja") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)="ja") }
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P856 ?web }
  OPTIONAL { ?item wdt:P154 ?logo }
  OPTIONAL { ?item wdt:P576 ?dis }
  OPTIONAL { ?wpurl schema:about ?item; schema:isPartOf <https://ja.wikipedia.org/>; schema:name ?wp }
  OPTIONAL { ?item wdt:P452 ?ind }
} GROUP BY ?item ?cn ?label ?desc
"""
Q_STMT = """
SELECT ?item ?kind ?v ?unit ?t WHERE {
  VALUES ?item { %s }
  { ?item p:P1128 ?st. ?st ps:P1128 ?v. BIND("e" AS ?kind) }
  UNION
  { ?item p:P2139 ?st. ?st ps:P2139 ?v. BIND("r" AS ?kind)
    OPTIONAL { ?st psv:P2139 ?vn. ?vn wikibase:quantityUnit ?unit } }
  OPTIONAL { ?st pq:P585 ?t }
}
"""
Q_LABEL = """
SELECT ?x ?xLabel WHERE { VALUES ?x { %s } SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". } }
"""

def fetch_wd(cns):
    out = {}
    cns = sorted(set(cns))
    for bi, b in enumerate(batches(cns, 150)):
        rows = sparql(Q_BASIC % " ".join('"%s"' % c for c in b))
        if rows is None:
            log("  basic batch", bi, "failed"); continue
        for r in rows:
            g = lambda k: r[k]["value"] if k in r else None
            cn = g("cn")
            d = out.setdefault(cn, {"item": g("item").rsplit("/", 1)[1]})
            if g("label"): d["label"] = g("label")
            if g("desc"): d["d"] = g("desc")
            if g("inc") and year_of(g("inc")): d["y"] = year_of(g("inc"))
            if g("dis") and year_of(g("dis")): d["yd"] = year_of(g("dis"))
            if g("web") and "web" not in d: d["web"] = g("web")
            if g("logo") and "logo" not in d:
                d["logo"] = urllib.parse.unquote(g("logo").rsplit("/", 1)[1]).replace("_", " ")
            if g("wp"): d["wp"] = g("wp")
            if g("inds"):
                d["ind_q"] = sorted(set(d.get("ind_q", []) + [x.rsplit("/", 1)[1] for x in g("inds").split(",") if x]))
        log("  basic batch", bi, "items so far", len(out)); time.sleep(1)
    items = sorted(set(v["item"] for v in out.values()))
    by_item = {v["item"]: v for v in out.values()}
    for bi, b in enumerate(batches(items, 250)):
        rows = sparql(Q_STMT % " ".join("wd:" + q for q in b))
        if rows is None:
            log("  stmt batch", bi, "failed"); continue
        for r in rows:
            q = r["item"]["value"].rsplit("/", 1)[1]
            d = by_item.get(q)
            if not d:
                continue
            try:
                v = Decimal(r["v"]["value"])
            except Exception:
                continue
            t = year_of(r["t"]["value"]) if "t" in r else None
            if r["kind"]["value"] == "e":
                d.setdefault("emp_all", []).append([t, int(v)])
            else:
                unit = r["unit"]["value"].rsplit("/", 1)[1] if "unit" in r else None
                if unit in (None, "Q8146", "Q199") and t:
                    d.setdefault("rev_all", []).append([t, int(v)])
        log("  stmt batch", bi); time.sleep(1)
    # industry labels
    inds = sorted(set(q for v in out.values() for q in v.get("ind_q", [])))
    labels = {}
    for bi, b in enumerate(batches(inds, 300)):
        rows = sparql(Q_LABEL % " ".join("wd:" + q for q in b)) or []
        for r in rows:
            labels[r["x"]["value"].rsplit("/", 1)[1]] = r["xLabel"]["value"]
        time.sleep(1)
    for v in out.values():
        if v.get("ind_q"):
            v["ind"] = [labels[q] for q in v["ind_q"] if q in labels and not re.fullmatch(r"Q\d+", labels[q])][:2]
    return out

all_cn = [r["cn"] for r in kept if r.get("cn")]
wd = cached("wd_corp", lambda: fetch_wd(all_cn)) or {}
log("Wikidata 一致:", len(wd), "/", len(all_cn))

for r in kept:
    w = wd.get(r.get("cn") or "")
    if not w:
        continue
    for k in ("y", "web", "logo", "wp", "d", "yd"):
        if w.get(k):
            r[k] = w[k]
    if w.get("ind"):
        r["ind"] = w["ind"]
    if w.get("emp_all"):
        e = sorted(w["emp_all"], key=lambda x: (x[0] is None, x[0] or 0))
        best = e[-1]
        r["emp"] = [best[0], best[1]] if best[0] else [None, best[1]]
    if w.get("rev_all"):
        by_year = {}
        for t, v in sorted(w["rev_all"]):
            by_year[t] = v
        r["rev"] = [[t, by_year[t]] for t in sorted(by_year)]

# 非上場の行には EDINET に残った消滅済み法人（吸収合併など）が混ざる → Wikidata の解散日 (P576) があれば外す。
# 上場中の会社の P576 は社名変更・持株会社化などのノイズなので yd は出さない。
dropped_gone = [r["n"] for r in kept if r["mk"] == "N" and r.get("yd")]
kept = [r for r in kept if not (r["mk"] == "N" and r.get("yd"))]
for r in kept:
    r.pop("yd", None)
log("非上場のうち解散済みとして除外:", len(dropped_gone), dropped_gone[:12])

# ============================================================ 5. 消滅企業 (Wikidata)
Q_GONE = """
SELECT ?item ?wp ?dis (SAMPLE(?co) AS ?co) WHERE {
  ?item wdt:P17 wd:Q17; wdt:P576 ?dis.
  FILTER(%s)
  ?item wdt:P31/wdt:P279* wd:Q4830453.
  ?wpurl schema:about ?item; schema:isPartOf <https://ja.wikipedia.org/>; schema:name ?wp.
  OPTIONAL { ?item wdt:P625 ?co1 }
  OPTIONAL { ?item p:P159 ?hqs. ?hqs pq:P625 ?co3 }
  OPTIONAL { ?item wdt:P159 ?hq. ?hq wdt:P625 ?co2 }
  OPTIONAL { ?item wdt:P131 ?adm. ?adm wdt:P625 ?co4 }
  BIND(COALESCE(?co1, ?co3, ?co2, ?co4) AS ?co)
  FILTER(BOUND(?co))
} GROUP BY ?item ?wp ?dis LIMIT 3000
"""
Q_GONE_DET = """
SELECT ?item ?label ?desc (SAMPLE(?inc) AS ?inc) (SAMPLE(?ind) AS ?ind) WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)="ja") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)="ja") }
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P452 ?ind }
} GROUP BY ?item ?label ?desc
"""
def fetch_gone():
    # 応答が大きいと途中で切れるので解散年で分割して取る
    rows = []
    for cond in ("YEAR(?dis) < 1990", "YEAR(?dis) >= 1990 && YEAR(?dis) < 2003",
                 "YEAR(?dis) >= 2003 && YEAR(?dis) < 2012", "YEAR(?dis) >= 2012"):
        part = sparql(Q_GONE % cond)
        if part is None:
            log("  gone part failed:", cond); continue
        log("  gone part", cond, len(part)); rows += part; time.sleep(1)
    if not rows:
        return None
    items = {}
    for r in rows:
        q = r["item"]["value"].rsplit("/", 1)[1]
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["co"]["value"])
        if not m or q in items:
            continue
        items[q] = {"wp": r["wp"]["value"], "yd": year_of(r["dis"]["value"]),
                    "lo": float(m.group(1)), "la": float(m.group(2))}
    time.sleep(1)
    ind_q = {}
    for bi, b in enumerate(batches(sorted(items), 300)):
        det = sparql(Q_GONE_DET % " ".join("wd:" + q for q in b)) or []
        for r in det:
            q = r["item"]["value"].rsplit("/", 1)[1]
            d = items.get(q)
            if not d:
                continue
            if "label" in r: d["n"] = r["label"]["value"]
            if "desc" in r: d["d"] = r["desc"]["value"]
            if "inc" in r: d["y"] = year_of(r["inc"]["value"])
            if "ind" in r: d["ind_q"] = r["ind"]["value"].rsplit("/", 1)[1]
        time.sleep(1)
    inds = sorted(set(d["ind_q"] for d in items.values() if d.get("ind_q")))
    labels = {}
    for b in batches(inds, 300):
        for r in sparql(Q_LABEL % " ".join("wd:" + q for q in b)) or []:
            labels[r["x"]["value"].rsplit("/", 1)[1]] = r["xLabel"]["value"]
        time.sleep(1)
    for d in items.values():
        if d.get("ind_q") and d["ind_q"] in labels and not re.fullmatch(r"Q\d+", labels[d["ind_q"]]):
            d["ind"] = labels[d["ind_q"]]
    return items

gone_raw = cached("wd_gone", fetch_gone) or {}
gone = []
for q, d in gone_raw.items():
    # 日本国内の座標だけ（P131 由来の粗い点も含む）
    if not (20 <= d["la"] <= 46 and 122 <= d["lo"] <= 154):
        continue
    g = {"n": d.get("n") or d["wp"], "la": round(d["la"], 5), "lo": round(d["lo"], 5),
         "y": d.get("y"), "yd": d.get("yd"), "d": d.get("d"), "wp": d["wp"], "ind": d.get("ind"), "q": q}
    gone.append({k: v for k, v in g.items() if v is not None})
gone.sort(key=lambda g: (g.get("yd") or 0, g["n"]))
log("消滅企業:", len(gone))

# ============================================================ 6. 出力
KEYS = ["n", "c", "mk", "i33", "i17", "sz", "la", "lo", "gp", "pf", "ad", "cn", "ed", "cap", "fy", "en",
        "y", "emp", "rev", "web", "logo", "wp", "d", "ind"]
out = []
for r in kept:
    o = {}
    for k in KEYS:
        v = r.get(k)
        if v is None or v == "" or v == []:
            continue
        o[k] = v
    out.append(o)
out.sort(key=lambda o: ({"P": 0, "S": 1, "G": 2, "N": 3}[o["mk"]], o.get("c") or "9999", o["n"]))

def dumps(x):
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))

# 既存 corp.js の 17業種ツリー/絵文字 (assets/corp.js, app.js が参照) を作り直す
tree = collections.defaultdict(set)
for o in out:
    if o.get("i17") and o.get("i33"):
        tree[o["i17"]].add(o["i33"])
tree = {k: sorted(v) for k, v in sorted(tree.items())}
EMOJI = {"食品": "🍚", "エネルギー資源": "⛽", "建設・資材": "🏗️", "素材・化学": "⚗️", "医薬品": "💊",
         "自動車・輸送機": "🚗", "鉄鋼・非鉄": "🔩", "機械": "⚙️", "電機・精密": "🔌",
         "情報通信・サービスその他": "💻", "電力・ガス": "💡", "運輸・物流": "🚚", "商社・卸売": "📦",
         "小売": "🏬", "銀行": "🏦", "金融（除く銀行）": "💹", "不動産": "🏢"}

header = """/* 企業データ v2（自動生成: tools/build_corp2.py, 作成日 %s）
   東証上場企業（プライム/スタンダード/グロース）と、非上場でも有価証券報告書を出している大企業
   （資本金 10 億円以上の上位 1,000 社）の本社所在地・業種・基本情報。

   ■ フィールド
     n=名称（JPX 銘柄名。非上場は EDINET 提出者名から「株式会社」を除いたもの）
     c=証券コード(4桁)  mk=市場 P:プライム S:スタンダード G:グロース N:非上場(有報提出)
     i33=33業種区分 i17=17業種区分 sz=TOPIX 規模区分（JPX）
     la/lo=本社の座標  gp=座標の精度 1:町丁目の代表点 2:市区町村の代表点  pf=都道府県
     ad=所在地（EDINET のまま） cn=法人番号 ed=EDINET コード cap=資本金(百万円) fy=決算日 en=英文名
     以下は Wikidata にあるときだけ:
     y=設立年 emp=[年,従業員数] rev=[[年,売上高(円)],...] web=公式サイト
     logo=ロゴ画像のファイル名(Wikimedia Commons) wp=日本語版 Wikipedia の記事名 d=説明 ind=業種

   ■ 出典
     ・日本取引所グループ「東証上場銘柄一覧」(%s 時点) … 銘柄名・コード・市場・業種・規模
     ・金融庁 EDINET コードリスト … 所在地・法人番号・EDINET コード・資本金・決算日・英文名
     ・Geolonia 住所データ (CC BY 4.0) … 所在地→座標（町丁目の代表点。精度は gp を参照）
     ・Wikidata (CC0 1.0) … 設立年・従業員数・売上高・公式サイト・ロゴ・Wikipedia 記事名・説明

   ■ 注意
     ・座標は町丁目（または市区町村）の代表点であり、建物の位置ではありません。
     ・従業員数・売上高は Wikidata に登録された時点の値で最新とは限りません。IR 資料でご確認ください。
     ・ロゴは各社の商標です。識別のために Wikimedia Commons 上の画像を表示しているだけで、
       権利は各社に帰属します。
*/
""" % (BUILT, JPX_DATE)

with open(os.path.join(ROOT, "data", "corp.js"), "w", encoding="utf-8") as f:
    f.write(header)
    f.write('RG.CORP_BUILT = "%s";\n' % BUILT)
    f.write("RG.CORP = " + dumps(out) + ";\n")
    f.write("RG.CORP_TREE = " + dumps(tree) + ";\n")
    f.write("RG.CORP_EMOJI = " + dumps(EMOJI) + ";\n")

gone_header = """/* 消滅した日本の企業（自動生成: tools/build_corp2.py, 作成日 %s）
   Wikidata (CC0 1.0) から「企業 (Q4830453) のサブクラスで 国=日本、解散日 (P576) と座標があり、
   日本語版 Wikipedia の記事があるもの」を取り出したもの（最大 3,000 件）。
   n=名称 la/lo=座標（本社 P625、なければ本社所在地の項目や所在自治体 P131 の座標 → 粗いことがある）
   y=設立年 yd=解散年 d=説明 wp=日本語版 Wikipedia の記事名 ind=業種 q=Wikidata ID
*/
""" % BUILT
with open(os.path.join(ROOT, "data", "corp_gone.js"), "w", encoding="utf-8") as f:
    f.write(gone_header)
    f.write("RG.CORP_GONE = " + dumps(gone) + ";\n")

# ============================================================ 7. サマリ
sz = os.path.getsize(os.path.join(ROOT, "data", "corp.js"))
print("=== summary ===")
print("rows:", len(out), "bytes:", sz)
print("by mk:", dict(collections.Counter(o["mk"] for o in out)))
print("geocode gp:", dict(gp_count), " (gp0 = dropped)", "hit rate: %.1f%%" % (100.0 * (gp_count[1] + gp_count[2]) / max(1, sum(gp_count.values()))))
print("dropped as dissolved (N):", len(dropped_gone))
print("gp by mk:", {mk: dict(collections.Counter(o["gp"] for o in out if o["mk"] == mk)) for mk in "PSGN"})
for k in ("y", "emp", "rev", "web", "logo", "wp", "d", "ind"):
    print("wikidata %-5s" % k, sum(1 for o in out if k in o))
print("gone:", len(gone), "bytes:", os.path.getsize(os.path.join(ROOT, "data", "corp_gone.js")))
