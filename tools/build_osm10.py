# -*- coding: utf-8 -*-
"""
OpenStreetMap から «出かける計画に効く» 10ジャンルを取り込む。

■ 選んだ基準
  iD エディタのプリセット（よく使われるタグ）を手がかりに、
  「その日の行動が変わるかどうか」で10個に絞った。
  たとえば «駐車場» は数が多すぎて役に立ちにくいので入れず、
  «コインロッカー» や «給水スポット» のように «知っていると助かる» ものを選んだ。

■ 数が多いものは間引く
  1ジャンルあたり最大900件。格子に分けて、格子ごとに1〜数件だけ残す。
  地図の見やすさと読み込みの軽さを保つため。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
src = {}
for f in ("osm10a.json", "osm10b.json"):
    try: src.update(json.load(open("/tmp/poi/" + f, encoding="utf-8")))
    except Exception as e: print("読めません:", f, e)

# id: 絵文字 名前 色 グループ 上限 説明
DEF = [
 ("hosp",   "🏥", "病院・診療所",   "#E53935", "help",  700,
  "急なけがや体調不良のときに。救急対応の有無も分かるものは出します"),
 ("pharm",  "💊", "薬局",           "#43A047", "help",  700,
  "処方せんを受けられる薬局。夜遅くまで開いている店もあります"),
 ("atm",    "🏧", "ATM・銀行",      "#1E88E5", "money", 700,
  "現金が要るときに。コンビニATMとは別に、銀行の窓口もふくみます"),
 ("post",   "📮", "郵便局",         "#D81B60", "money", 600,
  "ゆうちょATM・荷物の発送・切手。土日に開いている局もあります"),
 ("cycle",  "🚲", "シェアサイクル",  "#00897B", "move",  900,
  "自転車を借りて返せる場所。乗り捨てできるので «あと少し» の移動に便利"),
 ("locker", "🧳", "コインロッカー",  "#6D4C41", "move",  200,
  "荷物を預けて身軽に歩けます。駅の外にもあります"),
 ("water",  "⛲", "水飲み場",       "#039BE5", "help",  600,
  "無料で水が飲める場所。夏の水分補給に"),
 ("view",   "🔭", "展望スポット",    "#8E24AA", "fun",   200,
  "見晴らしのよい場所。無料のところも多くあります"),
 ("dog",    "🐕", "ドッグラン",      "#F4511E", "fun",   100,
  "犬を放して遊ばせられる場所"),
 ("sport",  "🏊", "スポーツ施設",    "#3949AB", "fun",   700,
  "プール・体育館・トレーニング室・競技場"),
]

def thin(rows, cap):
    """格子に分けて、混みすぎているところを間引く"""
    if len(rows) <= cap: return rows
    cell = 0.004
    g = collections.defaultdict(list)
    for r in rows: g[(int(r["la"] / cell), int(r["lo"] / cell))].append(r)
    out, per = [], 1
    while True:
        out = []
        for k in sorted(g):
            # 名前のあるものを優先して残す
            v = sorted(g[k], key=lambda x: (0 if x.get("name") else 1))
            out += v[:per]
        if len(out) > cap or per >= 6: break
        per += 1
    return out[:cap]

data, meta = {}, {}
for gid, e, label, c, grp, cap, desc in DEF:
    rows = src.get(gid) or []
    kept = thin(rows, cap)
    out = []
    for r in kept:
        o = {"la": r["la"], "lo": r["lo"]}
        if r.get("name"): o["n"] = r["name"][:30]
        for k in ("open", "oper", "amen", "leis", "spor", "fee", "emer", "phon", "webs", "capa", "desc"):
            if r.get(k): o[k] = r[k][:40]
        out.append(o)
    data[gid] = out
    meta[gid] = {"e": e, "label": label, "c": c, "grp": grp, "desc": desc, "all": len(rows)}
    print("%-8s %5d 件 → %4d 件（%s）" % (gid, len(rows), len(out), label))

io.open("data/osm10.js", "w", encoding="utf-8").write(
"""/* 出かける計画に効く10ジャンル（自動生成: tools/build_osm10.py）
   la/lo=座標 n=名前 open=営業時間 oper=運営 fee=料金 emer=救急 phon=電話 webs=公式
   capa=台数 spor=種目 desc=説明

   数の多いジャンルは、格子ごとに間引いて最大900件にしています。
   （全部出すと地図が埋まり、読み込みも重くなるため）
   meta の all は間引く前の件数です。

   出典: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.OSM10 = %s;\nRG.OSM10_META = %s;\n"
      % (json.dumps(data, ensure_ascii=False, separators=(",", ":")),
         json.dumps(meta, ensure_ascii=False)))
print("合計 %d 件 / %d bytes" % (sum(len(v) for v in data.values()),
                                 os.path.getsize("data/osm10.js")))
