# -*- coding: utf-8 -*-
"""
東証プライム上場企業の «本社の場所» と «業種» を data/corp.js に作る。

■ 元データ
  ・銘柄コード／33業種／17業種／市場区分  … 日本取引所グループ（JPX）が公表する
       「東証上場銘柄一覧（data_j.xls）」。事実データで、出典明示で利用できる。
  ・本社の座標／法人番号／従業員数／売上高／公式サイト … Wikidata (CC0 1.0)

■ つなぎ方
  会社名で突き合わせる。JPX の銘柄名は全角カナ・記号が混ざるので正規化する。
  法人番号は国税庁の «法人番号公表サイト» への直リンクに使う。

■ 将来の拡張について
  株価や決算の «数値そのもの» は持たない。無料で使えて商用条件のはっきりした
  API が見つからないため、外部サイトへのリンクで見てもらう設計にした。
  リンク先は data/corp.js の CORP_LINKS を差し替えれば増やせる。
"""
import json, io, os, re, unicodedata, math, collections
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

def norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = s.replace("株式会社", "").replace("(株)", "").replace("ホールディングス", "HD")
    s = re.sub(r"[\s・,，.。／/（）()「」【】]", "", s)
    return s.upper()

# ---------------------------------------------------------------- JPX
df = pd.read_excel("/tmp/poi/data_j.xls")
df = df[df["市場・商品区分"].astype(str).str.startswith("プライム")]
print("プライム上場:", len(df), "銘柄")

jpx, bycode = {}, {}
for _, r in df.iterrows():
    rec = {
        "code": str(r["コード"]).strip(),
        "name": str(r["銘柄名"]).strip(),
        "i33": str(r["33業種区分"]).strip(),
        "i17": str(r["17業種区分"]).strip(),
        "size": str(r["規模区分"]).strip(),
    }
    jpx[norm(r["銘柄名"])] = rec
    bycode[str(r["コード"]).strip()] = rec

# ---------------------------------------------------------------- 本社の場所
# Wikidata だけでは18社しか座標が取れなかったので、OpenStreetMap の
# office=company / headquarters も使って突き合わせる。
corp = []
try:
    corp += json.load(open("/tmp/poi/corp2.json", encoding="utf-8"))     # Wikidata（証券コードつき）
except Exception: pass
try:
    for o in json.load(open("/tmp/poi/osm_office.json", encoding="utf-8")):
        corp.append({"n": o.get("nj") or o.get("n"), "la": o["la"], "lo": o["lo"],
                     "web": o.get("web"), "src": "osm"})
except Exception: pass
try:
    corp += json.load(open("/tmp/poi/corp.json", encoding="utf-8"))      # Wikidata（法人番号つき）
except Exception: pass
print("本社の候補:", len(corp))

hit, miss = [], 0
for c in corp:
    # 証券コードがあれば、それが最も確実
    j = None
    if c.get("tick"):
        j = bycode.get(str(c["tick"]).strip())
    if not j:
        key = norm(c["n"])
        j = jpx.get(key)
        if not j:
            # 「◯◯HD」「東京◯◯」などのゆれを少し吸収し、
            # 「◯◯ 東京オフィス」のような後ろの語も落とす
            key2 = re.sub(r"(東京|本社|本店|オフィス|支社|営業所|ビル|センター|東日本|西日本).*$", "", key)
            for k2 in (key2, key2 + "HD", key2 + "ホールディングス", key2 + "グループ"):
                if len(k2) >= 3 and k2 in jpx: j = jpx[k2]; break
    if not j:
        miss += 1
        continue
    o = {"n": j["name"], "c": j["code"],
         "la": round(c["la"], 5), "lo": round(c["lo"], 5),
         "i33": j["i33"], "i17": j["i17"], "sz": j["size"]}
    if c.get("cn"): o["cn"] = c["cn"]
    if c.get("web"): o["web"] = c["web"]
    if c.get("emp"):
        try: o["emp"] = int(float(c["emp"]))
        except Exception: pass
    if c.get("rev"):
        try: o["rev"] = int(float(c["rev"]))
        except Exception: pass
    if c.get("inc"): o["y"] = str(c["inc"])[:4]
    hit.append(o)

# 同じ会社が二重に入らないように
seen, out = set(), []
for o in hit:
    if o["c"] in seen: continue
    seen.add(o["c"]); out.append(o)
out.sort(key=lambda x: x["c"])

# 法人番号・従業員数・売上高を、会社名でもう一度 Wikidata から引く
try:
    det = json.load(open("/tmp/poi/corp_detail.json", encoding="utf-8"))
    for o in out:
        e = det.get(o["n"])
        if not e: continue
        if e.get("cn") and not o.get("cn"): o["cn"] = e["cn"]
        if e.get("web") and not o.get("web"): o["web"] = e["web"]
        if e.get("emp") and not o.get("emp"):
            try: o["emp"] = int(float(e["emp"]))
            except Exception: pass
        if e.get("rev") and not o.get("rev"):
            try: o["rev"] = int(float(e["rev"]))
            except Exception: pass
        if e.get("inc") and not o.get("y"): o["y"] = str(e["inc"])[:4]
    print("補完後: 法人番号 %d / 従業員 %d / 売上 %d"
          % (sum(1 for o in out if o.get("cn")), sum(1 for o in out if o.get("emp")),
             sum(1 for o in out if o.get("rev"))))
except Exception as e:
    print("補完データなし:", e)

by17 = collections.Counter(o["i17"] for o in out)
by33 = collections.Counter(o["i33"] for o in out)
# 17業種 → その下にぶら下がる33業種、という木を作る
tree = collections.defaultdict(set)
for o in out: tree[o["i17"]].add(o["i33"])
TREE = {k: sorted(v) for k, v in sorted(tree.items())}

# 業種ごとの絵文字（見た目のため。分類そのものは JPX の定義どおり）
EMOJI = {
 "食品": "🍚", "エネルギー資源": "⛽", "建設・資材": "🏗️", "素材・化学": "⚗️",
 "医薬品": "💊", "自動車・輸送機": "🚗", "鉄鋼・非鉄": "🔩", "機械": "⚙️",
 "電機・精密": "🔌", "情報通信・サービスその他": "💻", "電力・ガス": "💡",
 "運輸・物流": "🚚", "商社・卸売": "📦", "小売": "🏬", "銀行": "🏦",
 "金融（除く銀行）": "💹", "不動産": "🏢",
}
io.open("data/corp.js", "w", encoding="utf-8").write(
"""/* 東証プライム上場企業の本社（自動生成: tools/build_corp.py）
   n=銘柄名 c=証券コード cn=法人番号 la/lo=本社の座標
   i33=33業種区分 i17=17業種区分 sz=規模区分 web=公式サイト emp=従業員数 rev=売上高 y=設立年

   ■ 出典
     業種区分・銘柄コード: 日本取引所グループ「東証上場銘柄一覧」
     本社座標・法人番号・従業員数・売上高: Wikidata (CC0 1.0)
     法人番号は国税庁「法人番号公表サイト」で確認できます。

   ■ 注意
     ・Wikidata に本社の座標が登録されている会社だけが載ります（全プライム銘柄ではありません）。
     ・従業員数・売上高は登録時点の値で、最新とは限りません。必ず公式のIR資料でご確認ください。
     ・株価や決算の数値そのものは持っていません。外部サイトへのリンクで見る設計です。
*/
""" + "RG.CORP = %s;\nRG.CORP_TREE = %s;\nRG.CORP_EMOJI = %s;\n"
      % (json.dumps(out, ensure_ascii=False, separators=(",", ":")),
         json.dumps(TREE, ensure_ascii=False),
         json.dumps(EMOJI, ensure_ascii=False)))

print("採用 %d 社 / 突き合わせ失敗 %d / %d bytes" % (len(out), miss, os.path.getsize("data/corp.js")))
print("17業種:", dict(by17.most_common()))
print("\n17業種 → 33業種 の木（一部）:")
for k in list(TREE)[:5]:
    print("  %s → %s" % (k, "、".join(TREE[k])))
print("\n売上高あり %d / 従業員あり %d / 公式サイトあり %d"
      % (sum(1 for o in out if o.get("rev")), sum(1 for o in out if o.get("emp")),
         sum(1 for o in out if o.get("web"))))
for o in out[:8]:
    print("   %s %-16s %s %s" % (o["c"], o["n"][:16], o["i17"], o["i33"]))
