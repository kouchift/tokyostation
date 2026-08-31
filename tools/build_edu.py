# -*- coding: utf-8 -*-
"""
高校と大学のデータを作る。

■ 偏差値について（大事な話）
  偏差値は、予備校各社（河合塾・駿台・ベネッセなど）が独自に調べてまとめたものです。
  各社の利用規約で複製・転載が禁じられており、その数字の並び自体が
  «編集著作物» にあたる可能性があります。**このアプリには同梱しません。**

  そのかわり、自分で調べた数字を入れられる枠を用意しました。
    data/user_hensachi.js  に  RG.HENSACHI = { "◯◯高校": 65, ... }  と書けば、
    その値で «いちばん難しいところを基準にした相対評価» の色がつきます。
  入れていないときは、色はつかず「未入力」と出ます。

■ 学費について
  国立大学は国が標準額を定めています（授業料 年535,800円／入学料 282,000円）。
  公立・私立は大学ごと・学部ごとに違い、まとまった公開データがありません。
  そのため、国立は標準額を出し、それ以外は «公式サイトでご確認ください» とします。

  出典: © OpenStreetMap contributors（ODbL）／Wikidata (CC0)／Wikipedia (CC BY-SA 4.0)
        国立大学の標準額は文部科学省令（国立大学等の授業料その他の費用に関する省令）
"""
import json, io, os, re, unicodedata, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
osm = json.load(open("/tmp/poi/edu.json", encoding="utf-8"))
wd = json.load(open("/tmp/poi/uni_wd.json", encoding="utf-8"))
U, EX, FAC = wd["uni"], wd["ex"], wd["fac"]

def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"[\s・,，.。／/（）()「」【】]", "", s)

# ---- 設置区分を推定 -------------------------------------------------
def founder(name, ot, op, wtype):
    j = (wtype or "") + " " + (op or "") + " " + name
    if re.search("国立|National", j) or name.startswith("東京大学") or "国立大学法人" in j:
        return "national"
    if re.search("都立|府立|県立|市立|区立|公立|Metropolitan|Prefectural", j): return "public"
    if ot == "private" or re.search("私立|学校法人|Private", j): return "private"
    return "unknown"

FOUND = {"national": {"label": "国立", "c": "#1565C0"},
         "public":   {"label": "公立", "c": "#2E7D32"},
         "private":  {"label": "私立", "c": "#C62828"},
         "unknown":  {"label": "区分不明", "c": "#757575"}}

# 文系／理系のふりわけ（学部の名前から）
BUN = re.compile("文|法|経済|経営|商|社会|外国語|国際|教育|人間|心理|政治|政経|観光|"
                 "福祉|neuro|芸術|音楽|美術|デザイン|体育|スポーツ|神道|仏教|コミュニケーション")
RI  = re.compile("理|工|農|医|薬|歯|獣医|看護|情報|建築|環境|生命|保健|データ|科学技術")
def side(f):
    if RI.search(f) and not BUN.search(f): return "ri"
    if BUN.search(f) and not RI.search(f): return "bun"
    if RI.search(f): return "ri"
    return "bun"

# ---- 大学：OSM の位置 × Wikidata/Wikipedia の中身 --------------------
wdn = {norm(k): k for k in U}
def base_name(n):
    """«◯◯大学△△キャンパス» から «◯◯大学» を取り出す"""
    m = re.match(r"(.+?大学(?:院)?)", n)
    return m.group(1) if m else n

unis = []
for o in osm["uni"]:
    n = o["n"]
    if not re.search("大学|カレッジ|College|University", n): continue
    if re.search("大学院大学", n): pass
    bn = base_name(n)
    key = wdn.get(norm(bn))
    w = U.get(key) if key else None
    f = founder(bn, o.get("ot"), o.get("op"), (w or {}).get("type"))
    rec = {"n": n[:40], "b": bn[:32], "la": o["la"], "lo": o["lo"], "f": f}
    if o.get("web"): rec["web"] = o["web"][:110]
    if w:
        if w.get("web") and "web" not in rec: rec["web"] = w["web"][:110]
        if w.get("stu"):
            try: rec["stu"] = int(float(w["stu"]))
            except Exception: pass
        if w.get("inc"): rec["y"] = str(w["inc"])[:4]
        if w.get("sl"):
            try: rec["sl"] = int(w["sl"])
            except Exception: pass
    e = EX.get(key)
    if e: rec["x"] = e["x"]; rec["t"] = e["t"]
    fs = FAC.get(key)
    if fs:
        rec["fac"] = [{"n": x[:16], "s": side(x)} for x in fs]
    unis.append(rec)

# 同じ大学の別キャンパスをまとめる
camp = collections.defaultdict(list)
for i, u in enumerate(unis): camp[u["b"]].append(i)
for b, idx in camp.items():
    if len(idx) < 2: continue
    for i in idx:
        unis[i]["cmp"] = [j for j in idx if j != i][:8]

# ---- 高校 -----------------------------------------------------------
def hs_founder(n, ot, op):
    if re.search("都立|府立|県立|市立|区立|町立|村立", n): return "public"
    if re.search("国立|附属|付属", n) and re.search("大学|教育大", n): return "national"
    if ot == "private" or n.startswith("私立"): return "private"
    return "private" if re.search("学園|学院|高等学校$", n) else "unknown"

hss = []
for o in osm["hs"]:
    n = re.sub(r"^私立", "", o["n"])
    hss.append({"n": n[:32], "la": o["la"], "lo": o["lo"],
                "f": hs_founder(o["n"], o.get("ot"), o.get("op")),
                **({"web": o["web"][:110]} if o.get("web") else {})})

io.open("data/edu.js", "w", encoding="utf-8").write(
"""/* 高校と大学（自動生成: tools/build_edu.py）
   UNIV  n=名前 b=大学名（キャンパス名を除く） la/lo=座標 f=設置区分
         stu=学生数 y=創立年 sl=Wikipedia言語版数 web=公式 x=概要 t=記事名
         fac=学部（s="bun"文系 / "ri"理系） cmp=同じ大学の別キャンパスの番号
   HIGH  n=名前 la/lo=座標 f=設置区分 web=公式

   ■ 偏差値は入っていません
     予備校各社が調べた数字で、複製・転載が禁じられているためです。
     data/user_hensachi.js に自分で調べた値を書くと、色がつきます。

   出典: © OpenStreetMap contributors（ODbL）／Wikidata (CC0)／
         Wikipedia 日本語版 (CC BY-SA 4.0)
*/
""" + "RG.UNIV = %s;\nRG.HIGH = %s;\nRG.EDU_FOUND = %s;\n"
      % (json.dumps(unis, ensure_ascii=False, separators=(",", ":")),
         json.dumps(hss, ensure_ascii=False, separators=(",", ":")),
         json.dumps(FOUND, ensure_ascii=False)))

if not os.path.exists("data/user_hensachi.js"):
    io.open("data/user_hensachi.js", "w", encoding="utf-8").write(
"""/* 自分で調べた偏差値を書く場所
   ここに数字を入れると、地図の色と «相対評価» がつきます。
   入れなければ色はつかず「未入力」と出ます。

   ■ なぜ最初から入っていないのか
     偏差値は予備校各社（河合塾・駿台・ベネッセなど）が独自に調べたもので、
     各社の利用規約で複製・転載が禁じられています。
     数字の並び自体が «編集著作物» にあたる可能性もあるため、同梱していません。
     自分で調べた値を、自分のために使ってください。

   書きかた（学校の名前は地図に出ている名前と同じにしてください）
     RG.HENSACHI = {
       "東京大学": 72,
       "東京都立日比谷高等学校": 73
     };
*/
RG.HENSACHI = {};
""")
print("大学 %d 件（うち概要 %d／学部 %d／別キャンパスあり %d）"
      % (len(unis), sum(1 for u in unis if u.get("x")),
         sum(1 for u in unis if u.get("fac")), sum(1 for u in unis if u.get("cmp"))))
print("高校 %d 件" % len(hss))
print("設置区分（大学）:", dict(collections.Counter(u["f"] for u in unis)))
print("設置区分（高校）:", dict(collections.Counter(h["f"] for h in hss)))
print("%d bytes" % os.path.getsize("data/edu.js"))
