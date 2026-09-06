# -*- coding: utf-8 -*-
"""
郵便番号の下敷きデータを作る（v67〜）
  入力: 日本郵便 郵便番号データ utf_ken_all.csv（https://www.post.japanpost.jp/zipcode/download.html）
        Geolonia 住所データ latest.csv（https://github.com/geolonia/japanese-addresses, CC BY 4.0
        — 元は国土交通省 位置参照情報）
  出力: data/zip/t/<lat>_<lon>.json  … 0.2度の升目ごとに [lat, lon, "1760021", "練馬区貫井"] の一覧
                                       地図に寄ったとき、見えている升目だけ読む → カーソル位置の郵便番号を出す
        data/zip/i/<上3桁>.json       … 郵便番号 → 代表座標。検索窓に郵便番号が入ったときだけ読む
  使い方: python3 tools/build_zip.py /tmp/utf_ken_all.csv /tmp/latest.csv
"""
import csv, io, json, os, re, sys, collections
ken, geo = sys.argv[1], sys.argv[2]
dst = os.path.join(os.path.dirname(__file__), "..", "data", "zip")
os.makedirs(os.path.join(dst, "t"), exist_ok=True); os.makedirs(os.path.join(dst, "i"), exist_ok=True)

KANJI = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}
def kan2int(s):
    if not s: return None
    if s.isdigit(): return int(s)
    z = "０１２３４５６７８９"
    if all(c in z for c in s): return int("".join(str(z.index(c)) for c in s))
    if s in KANJI: return KANJI[s]
    if "十" in s:
        a, b = s.split("十", 1); return (KANJI.get(a, 1) if a else 1) * 10 + (KANJI.get(b, 0) if b else 0)
    return None
def norm(s):
    return (s or "").replace("ケ", "ヶ").replace("ノ", "の").replace("之", "の").replace("　", "").strip()

# ---- 日本郵便: (市区町村コード, 町域ベース名) → [(zip, 丁目の集合 or None)]
K = collections.defaultdict(list); DEFAULT = {}
buf = ""   # 括弧が複数行にまたがる行をつなぐ
for row in csv.reader(io.open(ken, encoding="utf-8")):
    code, z, town = row[0], row[2], row[8]
    if buf: town = buf + town
    if town.count("（") > town.count("）"): buf = town; continue
    buf = ""
    if town.startswith("以下に掲載がない場合"): DEFAULT[code] = z; continue
    m = re.match(r"^(.*?)（(.*)）$", town)
    base, inner = (m.group(1), m.group(2)) if m else (town, "")
    chome = None
    if inner:
        mm = re.findall(r"([０-９一二三四五六七八九十]+)(?:〜([０-９一二三四五六七八九十]+))?丁目", inner)
        if mm:
            chome = set()
            for a, b in mm:
                ia, ib = kan2int(a), kan2int(b) if b else None
                if ia is None: continue
                for i in range(ia, (ib or ia) + 1): chome.add(i)
        elif re.search(r"番地|以下|以外|その他|地階|階", inner):
            pass
    K[(code, norm(base))].append((z, chome))

# ---- Geolonia: 町丁目の代表点に郵便番号を付ける
tiles = collections.defaultdict(list); idx = collections.defaultdict(dict); n = 0; hit = 0; approx = 0
for row in csv.DictReader(io.open(geo, encoding="utf-8")):
    try: la, lo = float(row["緯度"]), float(row["経度"])
    except Exception: continue
    code, city, name = row["市区町村コード"], row["市区町村名"], row["大字町丁目名"]
    m = re.match(r"^(.*?)([０-９一二三四五六七八九十]+)丁目$", name)
    base, ch = (m.group(1), kan2int(m.group(2))) if m else (name, None)
    cands = K.get((code, norm(base))) or K.get((code, norm(name))) or []
    z = None; ap = 0
    if cands:
        if ch is not None:
            for zz, cs in cands:
                if cs and ch in cs: z = zz; break
        if z is None:
            for zz, cs in cands:
                if cs is None: z = zz; break
        if z is None: z = cands[0][0]
    if z is None:
        # «字» を落として再挑戦（例: 大字○○ → ○○）
        b2 = re.sub(r"^(大字|字)", "", base)
        cands = K.get((code, norm(b2))) or []
        if cands: z = cands[0][0]
    if z is None:
        z = DEFAULT.get(code); ap = 1
        if z is None: continue
    n += 1; hit += (0 if ap else 1); approx += ap
    tk = "%d_%d" % (int(la * 5), int(lo * 5))
    tiles[tk].append([round(la, 5), round(lo, 5), z, city + name] + ([1] if ap else []))
    d = idx[z[:3]]
    if z not in d: d[z] = [round(la, 4), round(lo, 4), city + base]

tot = 0
for tk, rows in tiles.items():
    s = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    io.open(os.path.join(dst, "t", tk + ".json"), "w", encoding="utf-8").write(s); tot += len(s.encode("utf-8"))
tot2 = 0
for p3, d in idx.items():
    s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
    io.open(os.path.join(dst, "i", p3 + ".json"), "w", encoding="utf-8").write(s); tot2 += len(s.encode("utf-8"))
print("points", n, "exact", hit, "approx(市区町村の代表番号)", approx, "tiles", len(tiles), "bytes", tot, "index files", len(idx), "bytes", tot2)
