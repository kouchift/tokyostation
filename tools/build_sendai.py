# -*- coding: utf-8 -*-
"""
仙台エリアを «東京23区と同じ厚み» にする。

  チェーン店・学校・喫煙・防犯カメラ・おとな向け・くらしの施設を、
  それぞれの入れ物へ足す。升目に入れるものは升目へ。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, re, math, collections, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
S = json.load(open("/tmp/poi/sendai_all.json", encoding="utf-8"))

def load_js(path, var):
    s = io.open(path, encoding="utf-8").read()
    i = s.index(var + " = ") + len(var + " = ")
    return s, i, json.loads(s[i:s.index(";\n", i)])

def save_js(path, s, i, obj):
    io.open(path, "w", encoding="utf-8").write(
        s[:i] + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) +
        ";\n" + s[s.index("\n", s.index(";\n", i)) + 1:])

# ---------- ① チェーン店 ----------
s, i, BR = load_js("data/chains2.js", "RG.CHAIN_BRANDS")
txt = io.open("data/chains2.js", encoding="utf-8").read()
j = txt.index("RG.CHAIN_ROWS = ") + len("RG.CHAIN_ROWS = ")
ROWS = json.loads(txt[j:txt.rindex(";")])
# ブランド名 → 番号（build_chains2.py と同じ照合のしかた）
import importlib.util
pats = []
for b in BR:
    pats.append((re.compile(re.escape(b["n"]).replace("\\-", "-")), b["i"]))
EXTRA = {"セブン-イレブン": "セブン|7-Eleven", "ファミリーマート": "ファミマ|FamilyMart",
         "ローソン": "LAWSON", "マクドナルド": "McDonald", "スターバックス": "Starbucks"}
for b in BR:
    if b["n"] in EXTRA: pats.append((re.compile(EXTRA[b["n"]]), b["i"]))
have = set((r[1], r[2]) for r in ROWS)
add = 0
for r in S.get("chain", []):
    nm = r.get("brand") or r.get("n") or ""
    if not nm: continue
    hit = None
    for rx, idx in pats:
        if rx.search(nm): hit = idx; break
    if hit is None: continue
    if (r["la"], r["lo"]) in have: continue
    ROWS.append([hit, r["la"], r["lo"], (r.get("n") or "")[:26]]); add += 1
cnt = collections.Counter(x[0] for x in ROWS)
for b in BR: b["k"] = cnt.get(b["i"], 0)
txt2 = txt[:txt.index("RG.CHAIN_BRANDS = ")] + \
    "RG.CHAIN_BRANDS = " + json.dumps(BR, ensure_ascii=False, separators=(",", ":")) + ";\n" + \
    "RG.CHAIN_ROWS = " + json.dumps(ROWS, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open("data/chains2.js", "w", encoding="utf-8").write(txt2)
print("チェーン店: ＋%d → %d店" % (add, len(ROWS)))

# ---------- ② 学校 ----------
s2 = io.open("data/edu.js", encoding="utf-8").read()
iu = s2.index("RG.UNIV = ") + len("RG.UNIV = ")
UNIV = json.loads(s2[iu:s2.index(";\n", iu)])
ih = s2.index("RG.HIGH = ") + len("RG.HIGH = ")
HIGH = json.loads(s2[ih:s2.index(";\n", ih)])
uhave = set((round(u["la"], 4), round(u["lo"], 4)) for u in UNIV)
hhave = set((round(h["la"], 4), round(h["lo"], 4)) for h in HIGH)
HS = re.compile("高等学校|高校|中等教育学校")
au = ah = 0
for r in S.get("edu", []):
    nm = r.get("n") or ""
    if not nm: continue
    key = (round(r["la"], 4), round(r["lo"], 4))
    am = r.get("amenity")
    if am in ("university", "college") or "大学" in nm:
        if key in uhave: continue
        base = (re.match(r"(.+?大学)", nm) or [None, nm])[1] if "大学" in nm else nm
        UNIV.append({"n": nm[:40], "b": base[:32], "la": r["la"], "lo": r["lo"], "f": "unknown",
                     **({"web": r["website"][:110]} if r.get("website") else {})})
        uhave.add(key); au += 1
    elif HS.search(nm):
        if key in hhave: continue
        f = "public" if re.search("県立|市立|区立|町立", nm) else "private"
        HIGH.append({"n": re.sub(r"^私立", "", nm)[:32], "la": r["la"], "lo": r["lo"], "f": f})
        hhave.add(key); ah += 1
io.open("data/edu.js", "w", encoding="utf-8").write(
    s2[:iu] + json.dumps(UNIV, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    "RG.HIGH = " + json.dumps(HIGH, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    s2[s2.index("RG.EDU_FOUND"):])
print("大学: ＋%d → %d ／ 高校: ＋%d → %d" % (au, len(UNIV), ah, len(HIGH)))

# ---------- ③ 喫煙・防犯カメラ・おとな向け ----------
s3 = io.open("data/smoking.js", encoding="utf-8").read()
isk = s3.index("RG.SMOKE = ") + len("RG.SMOKE = ")
SM = json.loads(s3[isk:s3.index(";\n", isk)])
shave = set((round(x["la"], 5), round(x["lo"], 5)) for x in SM)
asm = 0
for r in S.get("smoke", []):
    k = (round(r["la"], 5), round(r["lo"], 5))
    if k in shave: continue
    sm = r.get("smoking"); am = r.get("amenity")
    kind = "public" if am == "smoking_area" else ("sep" if sm in ("separated", "isolated") else "eat")
    SM.append({"n": (r.get("n") or "")[:32], "la": r["la"], "lo": r["lo"], "k": kind,
               **({"sm": sm} if sm else {}), **({"am": am} if am else {})})
    shave.add(k); asm += 1
io.open("data/smoking.js", "w", encoding="utf-8").write(
    s3[:isk] + json.dumps(SM, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    s3[s3.index("RG.SMOKE_KIND"):])
print("喫煙: ＋%d → %d" % (asm, len(SM)))

s4 = io.open("data/camadult.js", encoding="utf-8").read()
ic = s4.index("RG.CAMSPOT = ") + len("RG.CAMSPOT = ")
CAM = json.loads(s4[ic:s4.index(";\n", ic)])
ia = s4.index("RG.ADULT = ") + len("RG.ADULT = ")
AD = json.loads(s4[ia:s4.index(";\n", ia)])
chave = set((round(x["la"], 5), round(x["lo"], 5)) for x in CAM)
ahave = set((round(x["la"], 5), round(x["lo"], 5)) for x in AD)
ac = aa = 0
for r in S.get("cam", []):
    k = (round(r["la"], 5), round(r["lo"], 5))
    if k in chave: continue
    CAM.append({"n": (r.get("n") or ""), "la": r["la"], "lo": r["lo"], "k": "spot",
                **({"z": r["surveillance_zone"]} if r.get("surveillance_zone") else {})})
    chave.add(k); ac += 1
for r in S.get("adult", []):
    k = (round(r["la"], 5), round(r["lo"], 5))
    if k in ahave: continue
    kind = "erotic" if (r.get("shop") in ("erotic", "sex")) else "love_hotel"
    AD.append({"n": (r.get("n") or ("アダルトショップ" if kind == "erotic" else "ラブホテル"))[:32],
               "la": r["la"], "lo": r["lo"], "k": kind})
    ahave.add(k); aa += 1
io.open("data/camadult.js", "w", encoding="utf-8").write(
    s4[:ic] + json.dumps(CAM, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    "RG.ADULT = " + json.dumps(AD, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    s4[s4.index("RG.ADULT_KIND"):])
print("防犯カメラ: ＋%d → %d ／ おとな向け: ＋%d → %d" % (ac, len(CAM), aa, len(AD)))

# ---------- ④ くらしの施設は升目へ ----------
CELL = 0.02
MAP2 = {"library": "library", "community_centre": "civic", "townhall": "civic",
        "park": "park", "sports_centre": "sport", "swimming_pool": "sport",
        "bicycle_rental": "cycle"}
rows = []
for r in S.get("life2", []):
    g = MAP2.get(r.get("amenity")) or MAP2.get(r.get("leisure"))
    if not g: continue
    rows.append({"g": g, "n": (r.get("n") or "")[:28], "la": r["la"], "lo": r["lo"],
                 **({"open": r["opening_hours"]} if r.get("opening_hours") else {})})
old = []
for f in os.listdir("data/tiles"):
    if f.startswith("t_"): old += json.load(open("data/tiles/" + f, encoding="utf-8"))
allrows = old + rows
seen, uniq = set(), []
for r in allrows:
    k = (r["g"], round(r["la"], 4), round(r["lo"], 4))
    if k in seen: continue
    seen.add(k); uniq.append(r)
tiles = collections.defaultdict(list)
for r in uniq:
    tiles[(int(math.floor(r["lo"] / CELL)), int(math.floor(r["la"] / CELL)))].append(r)
for f in os.listdir("data/tiles"):
    if f.startswith("t_") or f == "index.json": os.remove("data/tiles/" + f)
idx = {}
for (x, y), lst in sorted(tiles.items()):
    if len(lst) > 600: lst = sorted(lst, key=lambda r: (0 if r.get("n") else 1))[:600]
    io.open("data/tiles/t_%d_%d.json" % (x, y), "w", encoding="utf-8").write(
        json.dumps(lst, ensure_ascii=False, separators=(",", ":")))
    idx["%d_%d" % (x, y)] = len(lst)
io.open("data/tiles/index.json", "w", encoding="utf-8").write(json.dumps({
    "cell": CELL, "count": sum(idx.values()), "area": "関東〜東北〜新潟", "tiles": idx,
    "note": "0.02度ごとの升目。県にまたがって見ていても、見えている升目がすべて読まれます。"},
    ensure_ascii=False))
print("升目: ＋%d件 → %d枚 / %d件" % (len(rows), len(idx), sum(idx.values())))
