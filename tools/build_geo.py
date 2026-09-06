# -*- coding: utf-8 -*-
"""
都道府県・市区町村の境界（下敷きの地図）を用意する。
  入力: スマートニュース メディア研究所「市区町村・選挙区 地形データ」（TopoJSON）
        https://github.com/smartnews-smri/japan-topography
        元データ: 国土交通省 国土数値情報（行政区域データ）N03 — 表示時にクレジットを出す
  出力: data/geo/pref.json      … 47都道府県（0.1%簡素化・約6千点）  起動後すぐ読む
        data/geo/muni.json      … 全国1,897市区町村（0.1%簡素化・約2.3万点） 端末が暇なときに読む
        data/geo/muni/NN.json   … 都道府県ごとの詳しい市区町村（1%簡素化） 寄ったときにその県だけ読む
  使い方: python3 tools/build_geo.py <topojsonを置いたフォルダ>
"""
import json, os, sys, io
src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/geo"
dst = os.path.join(os.path.dirname(__file__), "..", "data", "geo")
os.makedirs(os.path.join(dst, "muni"), exist_ok=True)

PREF = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
        "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
        "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
        "熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
CODE = {n: "%02d" % (i + 1) for i, n in enumerate(PREF)}

def slim(topo, kind):
    """properties を小さなキーに置き換える。arcs/transform はそのまま"""
    key = list(topo["objects"].keys())[0]
    obj = topo["objects"][key]
    out_geoms = []
    for g in obj["geometries"]:
        p = g.get("properties") or {}
        if kind == "pref":
            props = {"n": p.get("N03_001"), "c": CODE.get(p.get("N03_001"), "")}
        else:
            name = "".join(x for x in [p.get("N03_003"), p.get("N03_004")] if x)
            props = {"n": name, "c": p.get("N03_007") or "", "pf": (p.get("N03_007") or "")[:2]}
        out_geoms.append({"type": g["type"], "arcs": g["arcs"], "properties": props})
    return {"type": "Topology", "transform": topo["transform"], "arcs": topo["arcs"],
            "objects": {"g": {"type": "GeometryCollection", "geometries": out_geoms}}}

def dump(o, path):
    s = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    io.open(path, "w", encoding="utf-8").write(s)
    return len(s.encode("utf-8"))

pref = json.load(io.open(os.path.join(src, "pref_s0001.json"), encoding="utf-8"))
n = dump(slim(pref, "pref"), os.path.join(dst, "pref.json")); print("pref.json", n)
muni = json.load(io.open(os.path.join(src, "muni_s0001.json"), encoding="utf-8"))
n = dump(slim(muni, "muni"), os.path.join(dst, "muni.json")); print("muni.json", n)
tot = 0
for i in range(1, 48):
    f = os.path.join(src, "muni", "%02d.json" % i)
    if not os.path.exists(f): continue
    t = json.load(io.open(f, encoding="utf-8"))
    tot += dump(slim(t, "muni"), os.path.join(dst, "muni", "%02d.json" % i))
print("muni/NN.json total", tot)
