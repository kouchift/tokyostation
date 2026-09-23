# -*- coding: utf-8 -*-
"""
東京23区のランドマーク TOP100 を data/landmarks.js に生成する。

■ 注目度スコアについて（重要）
 旅行サイト（TripAdvisor 等）のレビュースコアは利用規約と著作権の関係で取得できません。
 代わりに **Wikipedia の言語版数（Wikidata の sitelinks）** を「世界的な注目度」の
 代理指標として採用しています。世界中で何か国語の記事が書かれているかを表す客観値で、
 誰でも再現・検証できます。旅行者の満足度ではない点に注意してください。

 出典: Wikidata (https://www.wikidata.org) — CC0 1.0
 画像: Wikimedia Commons（ファイルごとにライセンスが異なる）
"""
import json, io, os, re, math, collections, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
raw = json.load(open("/tmp/poi/landmarks_raw.json", encoding="utf-8"))

items = {}
for r in raw:
    q = r["x"]["value"].rsplit("/", 1)[-1]
    e = items.setdefault(q, {"q": q, "n": r.get("xLabel", {}).get("value", ""),
                             "la": float(r["lat"]["value"]), "lo": float(r["lon"]["value"]),
                             "sl": int(r["sl"]["value"]), "cls": set(),
                             "img": r.get("img", {}).get("value")})
    c = r.get("clsLabel", {}).get("value")
    if c: e["cls"].add(c)
    if r.get("img") and not e["img"]: e["img"] = r["img"]["value"]

# 行き先にならないもの／現存しないものを除外
EXCLUDE = re.compile(
 "駅$|乗換駅|鉄道駅|高架駅|分岐駅|終着駅|地下駅|地下鉄・|停留場|信号場|"
 "特別区|日本の市|日本の区|都道府県|メガシティ|メトロポリス|世界都市|首都|金融センター|"
 "町丁|10万都市|人口1位|^都$|^区$|衛星都市|政令指定都市|地方公共団体|"
 "会社|企業|出版社|レーベル|銀行|保険|商社|放送局|新聞社|通信社|レストランチェーン|"
 "オリンピック競技|Olympic|選手権|事件|条約|国家|幕府|政府機関|行政機関|省庁|政党|"
 "人間|架空|漫画|アニメ|テレビ番組|映画$|楽曲|アルバム|書籍|雑誌|"
 "道路|高速道路|国道|インターチェンジ|鉄道路線|空港$|飛行場|"
 "大学$|国立大学|私立大学|学校法人|中学校|高等学校|小学校|専門学校|"
 "現存しない|破壊・解体|かつての|廃止された")
KEEP = re.compile(
 "神社|寺|仏教|東照宮|大社|神宮|勅祭社|稲荷|八幡|天満宮|教会|大聖堂|"
 "城|遺跡|史跡|記念碑|モニュメント|古墳|門$|橋|"
 "公園|庭園|植物園|緑地|動物園|水族館|"
 "博物館|美術館|科学館|記念館|資料館|文学館|"
 "タワー|超高層|展望|電波塔|塔$|ランドマーク|"
 "遊園地|テーマ|スタジアム|競技場|アリーナ|ドーム|ホール|劇場|会場|温泉|"
 "商店街|市場|卸売|繁華街|ショッピング|百貨店|複合施設|文化施設|観光|名所|"
 "島|人工島|埋立地|リゾート|広場|通り$|滝|山$|水路|運河|"
 "建築物|建造物|重要文化財|国宝")

CAT = [
 ("shrine", "⛩️", "神社・寺院",     re.compile("神社|寺|仏教|東照宮|大社|神宮|勅祭社|稲荷|八幡|天満宮|教会|大聖堂")),
 ("museum", "🖼️", "博物館・美術館", re.compile("博物館|美術館|科学館|記念館|資料館|文学館|水族館|動物園")),
 ("park",   "🌳", "公園・庭園",     re.compile("公園|庭園|植物園|緑地")),
 ("tower",  "🗼", "タワー・高層",   re.compile("タワー|超高層|展望|電波塔|塔$|ランドマーク")),
 ("hist",   "🏯", "史跡・城・橋",   re.compile("城|遺跡|史跡|記念碑|モニュメント|古墳|門$|橋")),
 ("fun",    "🎡", "遊び・スポーツ", re.compile("遊園地|テーマ|スタジアム|競技場|アリーナ|ドーム|ホール|劇場|会場|リゾート")),
 ("town",   "🏬", "街・ショッピング", re.compile("商店街|市場|卸売|繁華街|ショッピング|百貨店|複合施設|通り$|広場|地区")),
]
def cat(cls):
    j = " ".join(cls)
    for cid, em, lab, rx in CAT:
        if rx.search(j): return cid, em, lab
    return "spot", "📍", "その他の名所"

cands = []
for e in items.values():
    j = " ".join(e["cls"])
    if not e["n"] or e["n"].startswith("Q"): continue
    if not e["cls"]: continue
    if EXCLUDE.search(j) or EXCLUDE.search(e["n"]): continue
    if not KEEP.search(j): continue
    cid, em, lab = cat(e["cls"])
    cands.append({"q": e["q"], "n": e["n"], "la": round(e["la"], 6), "lo": round(e["lo"], 6),
                  "sl": e["sl"], "c": cid, "e": em, "cl": lab, "img": e["img"],
                  "t": sorted(e["cls"])[:2]})
cands.sort(key=lambda x: -x["sl"])

def dist_km(a, b):
    return math.hypot((a["la"] - b["la"]) * 111.0, (a["lo"] - b["lo"]) * 91.0)

out = []
for c in cands:
    if any(dist_km(c, u) < 0.10 for u in out): continue   # 同じ場所の重複を間引く
    out.append(c)
    if len(out) >= 100: break

def thumb(u, w=240):
    if not u: return None
    return urllib.parse.unquote(u.rsplit("/", 1)[-1])

recs = []
for i, c in enumerate(out):
    recs.append({"id": "lm" + str(i + 1), "n": c["n"], "la": c["la"], "lo": c["lo"],
                 "e": c["e"], "c": c["c"], "cl": c["cl"], "sl": c["sl"],
                 "rank": i + 1, "img": thumb(c["img"]), "t": "・".join(c["t"]),
                 "wp": "https://ja.wikipedia.org/wiki/" + urllib.parse.quote(c["n"])})

cats = []
for cid, em, lab, _ in CAT + [("spot", "📍", "その他の名所", None)]:
    n = sum(1 for r in recs if r["c"] == cid)
    if n: cats.append({"id": cid, "e": em, "label": lab, "n": n})

io.open("data/landmarks.js", "w", encoding="utf-8").write(
"""/* 東京23区ランドマーク TOP100（自動生成: tools/build_landmarks.py）

   ■ 順位の付け方
   旅行サイトのレビュースコアは利用規約・著作権の関係で取得できないため、
   「Wikipedia の言語版数（Wikidata sitelinks）」を世界的な注目度の代理指標にしています。
   世界で何か国語の記事が書かれているかという客観値で、誰でも再現・検証できます。
   旅行者の満足度そのものではない点に注意してください。

   出典: Wikidata (CC0 1.0) / 画像: Wikimedia Commons（ファイルごとにライセンスが異なる）
   sl = 言語版数, rank = 順位, c = 分類ID, cl = 分類名
*/
""" + "RG.LANDMARK_CATS = %s;\nRG.LANDMARKS_TOP = %s;\n"
      % (json.dumps(cats, ensure_ascii=False),
         json.dumps(recs, ensure_ascii=False, separators=(",", ":"))))

print("TOP", len(recs), "件 /", collections.Counter(r["cl"] for r in recs))
print("画像あり", sum(1 for r in recs if r["img"]))
for r in recs[:20]: print("  %2d %s %-22s sl=%d" % (r["rank"], r["e"], r["n"], r["sl"]))
print("...")
for r in recs[-8:]: print("  %2d %s %-22s sl=%d" % (r["rank"], r["e"], r["n"], r["sl"]))
