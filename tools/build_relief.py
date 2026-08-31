# -*- coding: utf-8 -*-
"""
標高データ（国土地理院 標高タイル）から
 ・粗い標高グリッド（3D表示・駅の高さに使う）
 ・陰影起伏の画像（2D/3Dの背景に敷く。1枚のPNGなので描画が軽い）
を作り、data/relief.js に書き出す。

出典: 国土地理院 標高タイル（DEM10B / DEM5A）
      https://maps.gsi.go.jp/development/ichiran.html
      国土地理院コンテンツ利用規約に基づき、出典明示で利用できます。
"""
import urllib.request, math, io, os, json, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
UA = {"User-Agent": "tokyo-station-guide/15 (school free-research project)"}

# 地図と同じ範囲
S, W, N, E = 35.505, 139.545, 35.845, 139.935
Z = 12                                  # 標高タイルのズーム（1タイル=256px ≒ 約38m/px）

def deg2tile(la, lo, z):
    n = 2 ** z
    x = (lo + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(math.radians(la)) + 1/math.cos(math.radians(la))) / math.pi) / 2.0 * n
    return x, y

def fetch_tile(z, x, y):
    for url in ("https://cyberjapandata.gsi.go.jp/xyz/dem_png/%d/%d/%d.png" % (z, x, y),
                "https://cyberjapandata.gsi.go.jp/xyz/dem/%d/%d/%d.txt" % (z, x, y)):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
            if url.endswith(".txt"):
                rows = []
                for line in b.decode("utf-8").strip().split("\n"):
                    rows.append([None if v == "e" else float(v) for v in line.split(",")])
                return rows
            else:
                from PIL import Image
                im = Image.open(io.BytesIO(b)).convert("RGB")
                w, h = im.size
                px = im.load()
                rows = []
                for j in range(h):
                    row = []
                    for i in range(w):
                        r, g, bb = px[i, j]
                        v = r * 65536 + g * 256 + bb
                        if v == 8388608: row.append(None)
                        elif v < 8388608: row.append(v * 0.01)
                        else: row.append((v - 16777216) * 0.01)
                    rows.append(row)
                return rows
        except Exception as e:
            last = e
    return None

x0, y0 = deg2tile(N, W, Z)
x1, y1 = deg2tile(S, E, Z)
tx0, tx1 = int(math.floor(x0)), int(math.floor(x1))
ty0, ty1 = int(math.floor(y0)), int(math.floor(y1))
print("タイル範囲 x %d-%d y %d-%d = %d枚" % (tx0, tx1, ty0, ty1, (tx1-tx0+1)*(ty1-ty0+1)))

TS = 256
Wpx = (tx1 - tx0 + 1) * TS
Hpx = (ty1 - ty0 + 1) * TS
big = [[None] * Wpx for _ in range(Hpx)]
got = 0
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        r = fetch_tile(Z, tx, ty)
        if r is None: print("  取得できず", tx, ty); continue
        got += 1
        ox, oy = (tx - tx0) * TS, (ty - ty0) * TS
        for j in range(min(TS, len(r))):
            row = r[j]
            for i in range(min(TS, len(row))):
                big[oy + j][ox + i] = row[i]
        time.sleep(0.15)
print("取得タイル", got)

# 対象範囲を切り出す
def px_of(la, lo):
    x, y = deg2tile(la, lo, Z)
    return int((x - tx0) * TS), int((y - ty0) * TS)
px0, py0 = px_of(N, W)
px1, py1 = px_of(S, E)
px0, px1 = max(0, px0), min(Wpx - 1, px1)
py0, py1 = max(0, py0), min(Hpx - 1, py1)
cw, ch = px1 - px0 + 1, py1 - py0 + 1
print("切り出し %dx%d px" % (cw, ch))

# ---- 粗いグリッド（3D と駅の高さ用）----
GW, GH = 96, 96
grid = []
for gy in range(GH):
    row = []
    for gx in range(GW):
        sx = px0 + int(gx * (cw - 1) / (GW - 1))
        sy = py0 + int(gy * (ch - 1) / (GH - 1))
        v = big[sy][sx]
        row.append(0.0 if v is None else round(v, 1))
    grid.append(row)
flat = [v for r in grid for v in r]
print("標高 min %.1f max %.1f 平均 %.1f" % (min(flat), max(flat), sum(flat)/len(flat)))

# ---- 陰影起伏＋段彩の画像（PNG 1枚）----
from PIL import Image
IW, IH = 512, 512
img = Image.new("RGB", (IW, IH))
ip = img.load()

def sample(fx, fy):
    sx = px0 + int(fx * (cw - 1)); sy = py0 + int(fy * (ch - 1))
    v = big[sy][sx]
    return 0.0 if v is None else v

# 段彩の色（低い＝青緑、高い＝黄土）
def tint(h):
    stops = [(0, (214, 232, 238)), (5, (198, 224, 209)), (15, (214, 231, 197)),
             (25, (233, 231, 190)), (40, (231, 216, 176)), (60, (223, 199, 160)),
             (90, (212, 183, 148))]
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i+1]
        if h <= b[0]:
            t = 0 if b[0] == a[0] else (h - a[0]) / (b[0] - a[0])
            return tuple(int(a[1][k] + (b[1][k] - a[1][k]) * t) for k in range(3))
    return stops[-1][1]

ZF = 3.0    # 陰影の強調
for j in range(IH):
    fy = j / (IH - 1)
    for i in range(IW):
        fx = i / (IW - 1)
        h = sample(fx, fy)
        # 近傍差分で傾斜を出す
        d = 1.0 / IW
        hx = sample(min(1, fx + d), fy) - sample(max(0, fx - d), fy)
        hy = sample(fx, min(1, fy + d)) - sample(fx, max(0, fy - d))
        # 北西から光を当てる
        nx, ny, nz = -hx * ZF, -hy * ZF, 20.0
        L = math.sqrt(nx*nx + ny*ny + nz*nz) or 1
        sh = max(0.0, min(1.0, (nx * -0.55 + ny * -0.55 + nz * 0.63) / L * 1.35))
        r, g, b = tint(h)
        k = 0.55 + 0.45 * sh
        ip[i, j] = (int(r * k), int(g * k), int(b * k))
# JPEG のほうが同じ見た目で 1/6 以下になる（地形はグラデーションが主なため）
img.save("assets/relief.jpg", quality=72, optimize=True, progressive=True)
print("assets/relief.jpg", os.path.getsize("assets/relief.jpg"), "bytes")

# 駅ごとの標高も出しておく（3D で駅を持ち上げるため）
net = io.open("data/network.js", encoding="utf-8").read()
i0 = net.index(" stations: ") + len(" stations: ")
STS = json.loads(net[i0:net.index("\n", i0)].rstrip(","))
st_el = {}
for st in STS:
    fx = (st["lo"] - W) / (E - W); fy = (N - st["la"]) / (N - S)
    if 0 <= fx <= 1 and 0 <= fy <= 1:
        st_el[st["id"]] = round(sample(fx, fy), 1)
print("駅の標高", len(st_el), "件 min %.1f max %.1f" % (min(st_el.values()), max(st_el.values())))

io.open("data/relief.js", "w", encoding="utf-8").write(
"""/* 標高データ（自動生成: tools/build_relief.py）
   grid   : %d x %d の標高（m）。南西→北東ではなく「北西を起点に東→南」の並び。
   bbox   : [south, west, north, east]
   画像 assets/relief.jpg は同じ範囲の陰影起伏＋段彩（512x512）。
   2D では地形の背景に、3D では傾けて敷きます。1枚の画像なので描画は軽いです。

   出典: 国土地理院 標高タイル（https://maps.gsi.go.jp/development/ichiran.html）
         国土地理院コンテンツ利用規約に基づき、出典を明示して利用しています。
*/
""" % (GW, GH) + "RG.RELIEF = %s;\n" % json.dumps(
    {"w": GW, "h": GH, "bbox": [S, W, N, E],
     "min": round(min(flat), 1), "max": round(max(flat), 1),
     "g": [round(v, 1) for v in flat], "st": st_el}, ensure_ascii=False, separators=(",", ":")))
print("data/relief.js", os.path.getsize("data/relief.js"), "bytes")
