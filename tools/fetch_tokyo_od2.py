# -*- coding: utf-8 -*-
"""
指定された東京都オープンデータを取り込む（すべて CC BY 4.0・出典明示で利用）。

 1. 東京都防災マップ 避難所／避難場所（東京都総務局）
 2. 都立の一時滞在施設（東京都総務局）
 3. 河川監視カメラ位置情報（東京都建設局）
 4. 海面ライブカメラ位置情報（東京都港湾局）
 5. 浸水予想区域図 浸水深・地盤高（東京都建設局）… ハザード
 6. 地価公示（東京都財務局）／基準地価格
 7. 都営バス停（公共交通オープンデータセンター / 東京都交通局）

出力: /tmp/poi/tokyo_od2.json
"""
import urllib.request, urllib.parse, json, csv, io, re, os, time, zipfile

UA = {"User-Agent": "tokyo-station-guide/18 (school free-research project)"}
OUT = "/tmp/poi/tokyo_od2.json"
BOX = (35.45, 139.40, 35.98, 140.00)

def get(u, t=90):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()

def dec(b):
    for e in ("utf-8-sig", "cp932", "utf-8", "euc_jp"):
        try: return b.decode(e)
        except Exception: pass
    return b.decode("utf-8", "replace")

def rows_of(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return list(csv.reader(io.StringIO(text, newline="")))

LAT = re.compile(r"緯度|latitude|^lat$", re.I)
LON = re.compile(r"経度|longitude|^lon$|^lng$", re.I)
def pick(h, rx):
    for i, c in enumerate(h):
        if c and rx.search(c.strip()): return i
    return None
def pick_any(h, words):
    for i, c in enumerate(h):
        if c and any(w in c for w in words): return i
    return None

def parse_geo_csv(url, name_words, extra=None):
    """緯度経度つき CSV を読んで [{n,la,lo,...}] にする"""
    try: rows = rows_of(dec(get(url)))
    except Exception as e:
        print("   NG", str(e)[:60]); return []
    hi = None
    for k in range(min(6, len(rows))):
        if pick(rows[k], LAT) is not None and pick(rows[k], LON) is not None: hi = k; break
    if hi is None: return []
    h = [c.strip() for c in rows[hi]]
    la, lo = pick(h, LAT), pick(h, LON)
    ni = pick_any(h, name_words)
    if ni is None:
        # 列名が空のCSVがあるので、緯度列の直前を名前とみなす
        for k in range(la - 1, -1, -1):
            if k >= 0: ni = k; break
    ai = pick_any(h, ["所在地", "住所", "地名地番"])
    out = []
    for r in rows[hi+1:]:
        if len(r) <= max(la, lo): continue
        try: y, x = float(r[la]), float(r[lo])
        except Exception: continue
        if not (BOX[0] < y < BOX[2] and BOX[1] < x < BOX[3]): continue
        rec = {"n": (r[ni].strip()[:40] if ni is not None and len(r) > ni else ""),
               "la": round(y, 6), "lo": round(x, 6),
               "ad": (r[ai].strip()[:40] if ai is not None and len(r) > ai else "")}
        for key, words in (extra or {}).items():
            i2 = pick_any(h, words)
            if i2 is not None and len(r) > i2:
                v = r[i2].strip()
                if v: rec[key] = v[:200] if key == "url" else v[:40]
        out.append(rec)
    return out

D = {}

print("■ 避難所・避難場所（東京都総務局）")
D["shelter2"] = []
for u, kind in [("https://www.opendata.metro.tokyo.lg.jp/soumu/130001_evacuation_center.csv", "避難所"),
                ("https://www.opendata.metro.tokyo.lg.jp/soumu/130001_evacuation_area.csv", "避難場所")]:
    rs = parse_geo_csv(u, ["名称", "施設名"],
                       {"cap": ["収容", "定員"], "kind2": ["種別", "区分"]})
    for r in rs: r["kind"] = kind
    D["shelter2"] += rs
    print("   %s %d 件" % (kind, len(rs)))

print("■ 監視カメラ（建設局・港湾局）")
cam = []
for u, kind in [("https://www.opendata.metro.tokyo.lg.jp/kensetsu/R4/130001_river-monitoring-cameras.csv", "河川監視"),
                ("https://www.opendata.metro.tokyo.lg.jp/kouwan/130001_sea-camera.csv", "海面ライブ")]:
    rs = parse_geo_csv(u, ["観測所名", "カメラ名", "名称", "地点名", "港名"],
                       {"url": ["URL", "url", "リンク"], "river": ["河川名", "水系"]})
    for r in rs: r["kind"] = kind
    cam += rs
    print("   %s %d 件" % (kind, len(rs)))
D["camera"] = cam

print("■ 浸水予想区域（建設局）")
haz = []
for u, riv in [("https://www.opendata.metro.tokyo.lg.jp/kensetsu/R3/shinsui_kandagawa.csv", "神田川流域"),
               ("https://www.opendata.metro.tokyo.lg.jp/kensetsu/R3/shinsui_sumidagawa.csv", "隅田川・新河岸川流域"),
               ("https://www.opendata.metro.tokyo.lg.jp/kensetsu/R3/shinsui_syakujiigawa.csv", "石神井川・白子川流域")]:
    try: rows = rows_of(dec(get(u, 180)))
    except Exception as e:
        print("   NG", riv, str(e)[:50]); continue
    hi = None
    for k in range(min(6, len(rows))):
        if pick(rows[k], LAT) is not None and pick(rows[k], LON) is not None: hi = k; break
    if hi is None:
        print("   列不明", riv, rows[0][:8] if rows else ""); continue
    h = [c.strip() for c in rows[hi]]
    la, lo = pick(h, LAT), pick(h, LON)
    di = pick_any(h, ["浸水深"]); gi = pick_any(h, ["地盤高", "標高"])
    n = 0
    for r in rows[hi+1:]:
        if len(r) <= max(la, lo): continue
        try:
            y, x = float(r[la]), float(r[lo])
            d = float(r[di]) if di is not None and len(r) > di and r[di] not in ("", "-") else None
        except Exception: continue
        if d is None or d <= 0: continue
        if not (BOX[0] < y < BOX[2] and BOX[1] < x < BOX[3]): continue
        haz.append({"la": round(y, 5), "lo": round(x, 5), "d": round(d, 2), "r": riv})
        n += 1
    print("   %s %d 点" % (riv, n))
D["flood"] = haz

print("■ 地価公示 令和8年（東京都財務局）")
# このCSVには緯度経度が無いかわりに「区市町村名」と「主要交通施設（最寄り駅）」がある。
# 駅名で紐づけられるので、駅ごと・区ごとの地価として使う。
land = []
try:
    rows = rows_of(dec(get("https://www.zaimu.metro.tokyo.lg.jp/documents/d/zaimu/12_R8kouji_chiten_opendata")))
    h = None; hi = 0
    for k in range(min(6, len(rows))):
        if any("当年価格" in (c or "") for c in rows[k]): h = [c.strip() for c in rows[k]]; hi = k; break
    if h:
        ci = pick_any(h, ["区市町村名"]); pi = pick_any(h, ["当年価格"])
        si = pick_any(h, ["主要交通施設"]); di = pick_any(h, ["交通施設までの道路距離"])
        ui = pick_any(h, ["利用の現況"]); ri = pick_any(h, ["対前年変動率"])
        for r in rows[hi+1:]:
            if len(r) <= max(ci or 0, pi or 0): continue
            try: v = int(re.sub(r"[^\d]", "", r[pi] or "0") or 0)
            except Exception: continue
            if not v: continue
            land.append({"c": r[ci].strip(), "y": v,
                         "st": (r[si].strip() if si is not None and len(r) > si else ""),
                         "m": (re.sub(r"[^\d]", "", r[di]) if di is not None and len(r) > di else ""),
                         "u": (r[ui].strip()[:12] if ui is not None and len(r) > ui else ""),
                         "r": (r[ri].strip() if ri is not None and len(r) > ri else "")})
except Exception as e:
    print("   NG", str(e)[:70])
print("   %d 地点" % len(land))
D["land2"] = land

print("■ 都営バス停（公共交通オープンデータセンター）")
# ckan.odpt.org は API キーが必要で、匿名アクセスでは HTML が返る。取得できない場合は空にする。
bus = []
try:
    j = json.loads(get("https://ckan.odpt.org/api/3/action/package_show?id=b_busstop-toei", 60))["result"]
    for r in j.get("resources", []):
        u = r.get("url") or ""
        if not u: continue
        try: b = get(u, 120)
        except Exception: continue
        try:
            data = json.loads(dec(b))
        except Exception:
            continue
        arr = data if isinstance(data, list) else data.get("features") or []
        for it in arr:
            la = it.get("geo:lat") or it.get("lat")
            lo = it.get("geo:long") or it.get("long") or it.get("lon")
            nm = it.get("dc:title") or it.get("title") or it.get("odpt:busstopPoleName") or ""
            if la is None or lo is None: continue
            try: y, x = float(la), float(lo)
            except Exception: continue
            if not (BOX[0] < y < BOX[2] and BOX[1] < x < BOX[3]): continue
            bus.append({"n": str(nm)[:30], "la": round(y, 5), "lo": round(x, 5)})
        if bus: break
except Exception as e:
    print("   NG", str(e)[:70])
print("   %d 件" % len(bus))
D["busstop"] = bus

json.dump(D, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("\n保存:", {k: len(v) for k, v in D.items()})
