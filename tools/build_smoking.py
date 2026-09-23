# -*- coding: utf-8 -*-
"""
喫煙できる場所のデータを作る。

■ 分類（実際に困るところで分ける）
  public  公共の屋外喫煙所      … 誰でも入れる。無料。区や事業者が設置
  paid    有料・施設内の喫煙室  … 入場料や利用料がいるもの
  eat     飲食店で喫煙できる    … 席で吸える／喫煙室あり
  sep     分煙（喫煙室あり）    … 席では吸えないが専用室がある
  elec    加熱式のみ            … 紙巻きは不可、加熱式たばこのみ可

■ 大事なこと
  受動喫煙防止条例（東京都）と改正健康増進法により、店の扱いは
  «客席面積» や «開業時期» で変わり、しかも変更されやすい。
  OSM の情報は更新が遅れることがあるため、画面には必ず
  「現地の表示に従ってください」と出す。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
raw = json.load(open("/tmp/poi/smoke.json", encoding="utf-8"))

EAT = {"cafe", "restaurant", "fast_food", "pub", "bar", "biergarten", "nightclub"}
out = []
for r in raw:
    am, sm = r.get("am"), r.get("sm")
    el = (r.get("el") or "").lower()
    he = (r.get("he") or "").lower()
    kind = None
    if am == "smoking_area":
        # 有料かどうか
        kind = "paid" if (r.get("fee") in ("yes", "y")) else "public"
    elif am in EAT:
        if sm in ("separated", "isolated"): kind = "sep"
        elif sm in ("yes", "dedicated"): kind = "eat"
        elif sm == "outside": kind = "public"
    elif sm in ("yes", "dedicated", "separated", "isolated", "outside"):
        kind = "sep" if sm in ("separated", "isolated") else "public"
    if el == "yes" and (sm in (None, "no")): kind = "elec"
    if he == "yes" and (sm in (None, "no")): kind = "elec"
    if not kind: continue
    o = {"n": (r.get("n") or "")[:32], "la": r["la"], "lo": r["lo"], "k": kind}
    if am: o["am"] = am
    if sm: o["sm"] = sm
    if el: o["el"] = el
    if he: o["he"] = he
    if r.get("cov"): o["cov"] = r["cov"]
    if r.get("op"): o["op"] = r["op"][:48]
    if r.get("op2"): o["by"] = r["op2"][:24]
    if r.get("fee"): o["fee"] = r["fee"]
    if r.get("web"): o["web"] = r["web"][:120]
    out.append(o)

KIND = {
 "public": {"e": "🚬", "label": "公共の屋外喫煙所", "c": "#2E7D32",
            "d": "だれでも使える屋外の喫煙所。無料のことがほとんどです"},
 "paid":   {"e": "🏢", "label": "有料の喫煙室", "c": "#6D4C41",
            "d": "利用料がいる喫煙室。屋内で天気を気にせず吸えます"},
 "eat":    {"e": "🍺", "label": "席で吸える飲食店", "c": "#C62828",
            "d": "客席で吸えると登録されている店。時間帯で変わることがあります"},
 "sep":    {"e": "🚪", "label": "分煙（喫煙室あり）", "c": "#EF6C00",
            "d": "客席は禁煙。専用の喫煙室があります"},
 "elec":   {"e": "💨", "label": "加熱式のみ", "c": "#1565C0",
            "d": "紙巻きは不可。加熱式たばこだけ吸えます"},
}
io.open("data/smoking.js", "w", encoding="utf-8").write(
"""/* 喫煙できる場所（自動生成: tools/build_smoking.py）
   n=名前 la/lo=座標 k=種類 am=施設の種類 sm=OSMのsmokingタグ
   el=加熱式(electronic) he=加熱式たばこ cov=屋根 op=営業時間 by=運営者 fee=料金 web=公式

   ■ 大事なこと
     受動喫煙防止条例と改正健康増進法により、店ごとの扱いは «客席面積» や
     «開業時期» で変わり、しかも変更されやすいものです。
     OpenStreetMap の情報は更新が遅れることがあります。
     必ず現地の表示と店員さんの案内に従ってください。

   出典: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.SMOKE = %s;\nRG.SMOKE_KIND = %s;\n"
      % (json.dumps(out, ensure_ascii=False, separators=(",", ":")),
         json.dumps(KIND, ensure_ascii=False)))
print("喫煙スポット %d 件 / %d bytes" % (len(out), os.path.getsize("data/smoking.js")))
print(dict(collections.Counter(o["k"] for o in out)))
