# -*- coding: utf-8 -*-
"""data/*.js（RG.XXX = [...];）を読み、座標→都道府県を判定する共通部品。"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県",
         "埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県",
         "岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
         "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
         "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]


def load_rg(fname, var):
    """data/<fname> から RG.<var> = <JSON>; を取り出す"""
    s = open(os.path.join(DATA, fname), encoding="utf-8").read()
    m = re.search(r"RG\.%s\s*=\s*" % re.escape(var), s)
    if not m:
        raise KeyError(var)
    dec = json.JSONDecoder()
    val, _ = dec.raw_decode(s, m.end())
    return val


class PrefLocator:
    """data/geo/pref.json（TopoJSON）で点→都道府県。境界外の点は最寄りの代表点で補う。"""
    def __init__(self):
        t = json.load(open(os.path.join(DATA, "geo", "pref.json"), encoding="utf-8"))
        sx, sy = t["transform"]["scale"]; tx, ty = t["transform"]["translate"]
        arcs = []
        for a in t["arcs"]:
            x = y = 0; pts = []
            for dx, dy in a:
                x += dx; y += dy
                pts.append((x * sx + tx, y * sy + ty))
            arcs.append(pts)

        def ring(idx):
            out = []
            for i in idx:
                p = arcs[i] if i >= 0 else arcs[~i][::-1]
                out.extend(p if not out else p[1:])
            return out

        self.polys = []   # (name, bbox, [rings])
        for g in t["objects"]["g"]["geometries"]:
            name = PREFS[int(g["properties"]["c"]) - 1]
            polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
            for poly in polys:
                rings = [ring(r) for r in poly]
                xs = [p[0] for p in rings[0]]; ys = [p[1] for p in rings[0]]
                self.polys.append((name, (min(xs), min(ys), max(xs), max(ys)), rings))

    @staticmethod
    def _inside(x, y, r):
        c = False; j = len(r) - 1
        for i in range(len(r)):
            xi, yi = r[i]; xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
                c = not c
            j = i
        return c

    def pref(self, la, lo):
        if la is None or lo is None:
            return None
        for name, (x0, y0, x1, y1), rings in self.polys:
            if x0 <= lo <= x1 and y0 <= la <= y1 and self._inside(lo, la, rings[0]) \
               and not any(self._inside(lo, la, h) for h in rings[1:]):
                return name
        # 海岸線ぎりぎり等：bbox 中心が最も近いものを返す（粗い）
        best = min(self.polys, key=lambda p: ((p[1][0]+p[1][2])/2-lo)**2 + ((p[1][1]+p[1][3])/2-la)**2)
        return best[0] + "?"
