# -*- coding: utf-8 -*-
"""
見どころ・チェーン店・学校・市区町村を «全国» に広げる。

  出典: Wikidata (CC0)／© OpenStreetMap contributors (ODbL 1.0)
"""
import json, io, os, re, collections

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# ================= ① 見どころ =================
s = io.open("data/kanto_lm.js", encoding="utf-8").read()
i = s.index("RG.KANTO_LM = ") + len("RG.KANTO_LM = ")
LM = json.loads(s[i:s.rindex(";")])
known = set(o["n"] for o in LM)
T = {"テーマパーク":("🎡","#E4007F"),"城":("🏯","#7B4A12"),"神社":("⛩️","#C62828"),
     "寺":("🛕","#6D4C41"),"博物館":("🏛️","#5E35B1"),"公園":("🌳","#2E7D32"),
     "競技場":("🏟️","#0277BD"),"美術館":("🎨","#8E24AA"),"海水浴場":("🏖️","#039BE5"),
     "温泉":("♨️","#D84315"),"道の駅":("🛣️","#00897B"),"空港":("✈️","#455A64")}
add = 0
for r in json.load(open("/tmp/poi/jp_lm.json", encoding="utf-8")).values():
    if r["n"] in known: continue
    e, c = T.get(r.get("t"), ("📍", "#F0851E"))
    o = {"n": r["n"], "la": r["la"], "lo": r["lo"], "t": r.get("t",""), "e": e, "c": c}
    if r.get("sl"): o["sl"] = r["sl"]
    LM.append(o); known.add(r["n"]); add += 1
io.open("data/kanto_lm.js", "w", encoding="utf-8").write(
"""/* 見どころ（日本全国。自動生成: tools/build_jp_all.py）
   n=名前 la/lo=座標 t=種類 e=絵文字 c=色 sl=Wikipediaの言語版の数（有名さの目安）
   出典: Wikidata (CC0)
*/
""" + "RG.KANTO_LM = %s;\n" % json.dumps(LM, ensure_ascii=False, separators=(",",":")))
print("見どころ: ＋%d → %d件" % (add, len(LM)))
print("  ", dict(collections.Counter(o["t"] for o in LM)))

# ================= ② チェーン店・学校 =================
CE = json.load(open("/tmp/poi/jp_chain_edu.json", encoding="utf-8"))

txt = io.open("data/chains2.js", encoding="utf-8").read()
ib = txt.index("RG.CHAIN_BRANDS = ") + len("RG.CHAIN_BRANDS = ")
BR = json.loads(txt[ib:txt.index(";\n", ib)])
ir = txt.index("RG.CHAIN_ROWS = ") + len("RG.CHAIN_ROWS = ")
ROWS = json.loads(txt[ir:txt.rindex(";")])
pats = [(re.compile(re.escape(b["n"])), b["i"]) for b in BR]
EXTRA = {"セブン-イレブン":"セブン|7-Eleven","ファミリーマート":"ファミマ|FamilyMart",
         "ローソン":"LAWSON","マクドナルド":"McDonald","スターバックス":"Starbucks",
         "ケンタッキー":"KFC","ミニストップ":"MINISTOP","ドトール":"DOUTOR",
         "タリーズコーヒー":"TULLY","ユニクロ":"UNIQLO","ABCマート":"ABC-MART"}
for b in BR:
    if b["n"] in EXTRA: pats.append((re.compile(EXTRA[b["n"]]), b["i"]))
have = set((r[1], r[2]) for r in ROWS)
ac = 0
for r in CE:
    nm = r.get("brand") or r.get("n") or ""
    if not nm or r.get("amenity") in ("university","college","school"): continue
    hit = None
    for rx, idx in pats:
        if rx.search(nm): hit = idx; break
    if hit is None or (r["la"], r["lo"]) in have: continue
    have.add((r["la"], r["lo"]))
    ROWS.append([hit, r["la"], r["lo"], (r.get("n") or "")[:26]]); ac += 1
cnt = collections.Counter(x[0] for x in ROWS)
for b in BR: b["k"] = cnt.get(b["i"], 0)
io.open("data/chains2.js","w",encoding="utf-8").write(
    txt[:txt.index("RG.CHAIN_BRANDS = ")] +
    "RG.CHAIN_BRANDS = " + json.dumps(BR, ensure_ascii=False, separators=(",",":")) + ";\n" +
    "RG.CHAIN_ROWS = " + json.dumps(ROWS, ensure_ascii=False, separators=(",",":")) + ";\n")
print("チェーン店: ＋%d → %d店" % (ac, len(ROWS)))

s2 = io.open("data/edu.js", encoding="utf-8").read()
iu = s2.index("RG.UNIV = ") + len("RG.UNIV = ")
UNIV = json.loads(s2[iu:s2.index(";\n", iu)])
ih = s2.index("RG.HIGH = ") + len("RG.HIGH = ")
HIGH = json.loads(s2[ih:s2.index(";\n", ih)])
uh = set((round(u["la"],4), round(u["lo"],4)) for u in UNIV)
hh = set((round(h["la"],4), round(h["lo"],4)) for h in HIGH)
HS = re.compile("高等学校|高校|中等教育学校")
au = ah = 0
for r in CE:
    nm = r.get("n") or ""
    if not nm: continue
    k = (round(r["la"],4), round(r["lo"],4))
    am = r.get("amenity")
    if am in ("university","college") or "大学" in nm:
        if k in uh: continue
        base = (re.match(r"(.+?大学)", nm) or [None, nm])[1] if "大学" in nm else nm
        UNIV.append({"n": nm[:40], "b": base[:32], "la": r["la"], "lo": r["lo"], "f": "unknown",
                     **({"web": r["website"][:110]} if r.get("website") else {})})
        uh.add(k); au += 1
    elif HS.search(nm):
        if k in hh: continue
        f = "public" if re.search("県立|府立|道立|都立|市立|区立|町立|村立", nm) else "private"
        HIGH.append({"n": re.sub(r"^私立","",nm)[:32], "la": r["la"], "lo": r["lo"], "f": f})
        hh.add(k); ah += 1
io.open("data/edu.js","w",encoding="utf-8").write(
    s2[:iu] + json.dumps(UNIV, ensure_ascii=False, separators=(",",":")) + ";\n" +
    "RG.HIGH = " + json.dumps(HIGH, ensure_ascii=False, separators=(",",":")) + ";\n" +
    s2[s2.index("RG.EDU_FOUND"):])
print("大学: ＋%d → %d ／ 高校: ＋%d → %d" % (au, len(UNIV), ah, len(HIGH)))

# ================= ③ 市区町村 =================
AD = json.load(open("/tmp/poi/jp_admin.json", encoding="utf-8"))
seen, muni = set(), []
for r in AD:
    k = (r["n"], round(r["la"],3))
    if k in seen: continue
    seen.add(k)
    o = {"n": r["n"], "la": r["la"], "lo": r["lo"], "lv": r.get("lv", 8)}
    if r.get("pop"):
        try: o["pop"] = int(re.sub(r"[^0-9]", "", r["pop"]) or 0)
        except Exception: pass
    muni.append(o)
muni.sort(key=lambda o: -(o.get("pop") or 0))
io.open("data/jp_admin.js","w",encoding="utf-8").write(
"""/* 全国の市区町村（自動生成: tools/build_jp_all.py）
   n=名前 la/lo=だいたいの中心 lv=行政の段（7=郡・支庁 8=市区町村）pop=人口

   面（かたち）ではなく «名前と中心» だけを持っています。
   全国1,800余りの «面» を持つと数十MBになるためです。
   地図には «地名» として出し、押すとその街へ寄ります。

   出典: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.JP_ADMIN = %s;\n" % json.dumps(muni, ensure_ascii=False, separators=(",",":")))
print("市区町村: %d件 / %.0f KB" % (len(muni), os.path.getsize("data/jp_admin.js")/1024))
print("  人口の多い順:", [o["n"] for o in muni[:8]])

# ================= ④ 上場企業（全国） =================
s3 = io.open("data/corp.js", encoding="utf-8").read()
ic = s3.index("RG.CORP = ") + len("RG.CORP = ")
CORP = json.loads(s3[ic:s3.index(";\n", ic)])
ch = set(c.get("n") for c in CORP)
acp = 0
for r in json.load(open("/tmp/poi/jp_corp.json", encoding="utf-8")):
    if r["n"] in ch: continue
    o = {"n": r["n"], "la": r["la"], "lo": r["lo"], "src": "wd"}
    if r.get("sl"): o["sl"] = r["sl"]
    CORP.append(o); ch.add(r["n"]); acp += 1
io.open("data/corp.js", "w", encoding="utf-8").write(
    s3[:ic] + json.dumps(CORP, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    s3[s3.index("\n", s3.index(";\n", ic)) + 1:])
print("上場企業: ＋%d → %d社" % (acp, len(CORP)))

# ================= ⑤ 有名な建物（全国） =================
s4 = io.open("data/bldg3d.js", encoding="utf-8").read()
ibl = s4.index("RG.BLDG3D = ") + len("RG.BLDG3D = ")
BL = json.loads(s4[ibl:s4.index(";\n", ibl)])
bh = set(b.get("n") for b in BL)
SHAPE = {"塔": "tower", "展望塔": "tower", "ビル": "tall", "建造物": "tall"}
ab = 0
for r in json.load(open("/tmp/poi/jp_bldg.json", encoding="utf-8")):
    if r["n"] in bh: continue
    h = r.get("h") or 0
    if h < 40 and (r.get("sl") or 0) < 4: continue      # 小さすぎるものは出さない
    o = {"n": r["n"], "la": r["la"], "lo": r["lo"],
         "h": h or 50, "sh": SHAPE.get(r.get("t"), "tall"),
         "e": "🗼" if r.get("t") in ("塔", "展望塔") else "🏢",
         "sl": r.get("sl") or 0, "jp": 1}
    BL.append(o); bh.add(r["n"]); ab += 1
io.open("data/bldg3d.js", "w", encoding="utf-8").write(
    s4[:ibl] + json.dumps(BL, ensure_ascii=False, separators=(",", ":")) + ";\n" +
    s4[s4.index("\n", s4.index(";\n", ibl)) + 1:])
print("3D建物: ＋%d → %d件" % (ab, len(BL)))
