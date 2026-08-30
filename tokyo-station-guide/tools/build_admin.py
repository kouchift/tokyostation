# -*- coding: utf-8 -*-
"""
行政区域ポリゴン（国土数値情報 N03）を、地図に描ける軽さまで単純化して
data/admin.js に書き出す。

レベル1: 都道府県（東京都の外周）
レベル2: 市区町村（23区＋多摩地域の市町村）
レベル3: 政令市の行政区に相当するもの（東京23区は自治体なのでレベル2扱い。
         レベル3は「大字・町丁目」を将来入れる枠として用意し、今回は空）

出典: 国土数値情報 行政区域データ（国土交通省）
      https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
      利用規約: https://nlftp.mlit.go.jp/ksj/other/agreement.html （出典明示で利用可）
"""
import json, io, os, math, zipfile, collections, sys
sys.setrecursionlimit(50000)

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

# 23区＋主要な多摩地域だけを対象にする（島しょ部は座標が遠く地図が壊れるため）
BOX = (35.45, 139.40, 35.95, 139.95)     # south, west, north, east

def rdp(pts, eps):
    """Ramer–Douglas–Peucker で頂点を間引く"""
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    n2 = dx*dx + dy*dy
    imax, dmax = 0, -1.0
    for i in range(1, len(pts)-1):
        p = pts[i]
        if n2 == 0:
            d = math.hypot(p[0]-a[0], p[1]-a[1])
        else:
            t = max(0.0, min(1.0, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / n2))
            d = math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy))
        if d > dmax: imax, dmax = i, d
    if dmax <= eps: return [a, b]
    return rdp(pts[:imax+1], eps)[:-1] + rdp(pts[imax:], eps)

def rings_of(geom):
    t = geom["type"]; c = geom["coordinates"]
    if t == "Polygon": return [c[0]]
    if t == "MultiPolygon": return [p[0] for p in c]
    return []

def inbox(ring):
    for x, y in ring:
        if BOX[1] <= x <= BOX[3] and BOX[0] <= y <= BOX[2]: return True
    return False

EPS = 0.00035          # 約 35m。ズームしても破綻せず、容量も抑えられる値
MIN_PTS = 6

zf = zipfile.ZipFile("/tmp/poi/n03.zip")
name = [n for n in zf.namelist() if n.endswith(".geojson")][0]
gj = json.loads(zf.read(name).decode("utf-8"))
print("フィーチャ", len(gj["features"]))

muni = collections.OrderedDict()
for f in gj["features"]:
    pr = f["properties"]
    city = pr.get("N03_004") or ""          # 市区町村名
    ward = pr.get("N03_005") or ""          # 政令市の行政区
    if not city: continue
    key = city + (("/" + ward) if ward else "")
    for ring in rings_of(f["geometry"]):
        if not inbox(ring): continue
        s = rdp([[round(x, 5), round(y, 5)] for x, y in ring], EPS)
        if len(s) < MIN_PTS: continue
        muni.setdefault(key, {"n": city, "w": ward, "rings": []})["rings"].append(s)

print("市区町村", len(muni))

def flat(rs):
    """[[x,y],...] を [x,y,x,y,...] にして小数を丸める（容量削減）"""
    out = []
    for r in rs:
        out.append([c for p in r for c in (round(p[0], 5), round(p[1], 5))])
    return out

L2 = []
for k, v in muni.items():
    L2.append({"n": v["n"] + (v["w"] or ""), "c": v["n"], "r": flat(v["rings"])})

# レベル1（都の外周）は、レベル2の外側の線をそのまま太く描くことで代用せず、
# 島しょを除いた本土部分の外周として、すべてのリングをそのまま持たせる
L1 = [{"n": "東京都", "r": flat([r for v in muni.values() for r in v["rings"]])}]

pts2 = sum(len(r)//2 for m in L2 for r in m["r"])
io.open("data/admin.js", "w", encoding="utf-8").write(
"""/* 行政区域ポリゴン（自動生成: tools/build_admin.py）
   L1 = 都道府県 / L2 = 市区町村 / L3 = さらに細かい行政区分（今回は空。将来の拡張枠）
   r は [x,y,x,y,...] の平坦配列（経度,緯度）。容量を抑えるため小数5桁に丸め、
   Ramer-Douglas-Peucker 法で約35m相当まで頂点を間引いています。

   出典: 国土数値情報（行政区域データ）国土交通省
         https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
         出典を明示すれば利用できます（https://nlftp.mlit.go.jp/ksj/other/agreement.html）
*/
""" + "RG.ADMIN = { L1: %s, L2: %s, L3: [] };\n"
      % (json.dumps(L1, ensure_ascii=False, separators=(",", ":")),
         json.dumps(L2, ensure_ascii=False, separators=(",", ":"))))
print("L2 %d 自治体 / 頂点 %d / %d bytes" % (len(L2), pts2, os.path.getsize("data/admin.js")))
print("例:", [m["n"] for m in L2[:12]])
