# -*- coding: utf-8 -*-
"""
監視カメラ（映像が見られるもの／設置されているだけのもの）と、
おとな向けの施設のデータを作る。

■ カメラの2種類
  live  … 映像が公開されていて、その場で見られるもの（東京都のライブカメラ）
  spot  … 設置されていることだけが分かっているもの（OSM の man_made=surveillance）
          映像は公開されていない。防犯の «目» がどこにあるかを知るためのもの。

■ おとな向けの施設
  既定では地図に出さない。設定のいちばん奥にある切り替えを入れたときだけ出る。
  小学生やお年寄りも使うサイトなので、うっかり出ないようにしている。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
d = json.load(open("/tmp/poi/cam_adult.json", encoding="utf-8"))

ZONE = {"town": "まちなか", "traffic": "道路・交通", "parking": "駐車場",
        "entrance": "出入口", "street": "通り", "public": "公共の場所",
        "shop": "お店", "building": "建物", "atm": "ATM"}
cams = []
for c in d["cam"]:
    o = {"n": c.get("n") or "", "la": c["la"], "lo": c["lo"], "k": "spot"}
    z = c.get("surveillance_zone")
    if z: o["z"] = ZONE.get(z, z)
    if c.get("operator"): o["by"] = c["operator"]
    if c.get("contact_webcam"): o["url"] = c["contact_webcam"]; o["k"] = "live"
    if c.get("website") and o["k"] == "live": o["site"] = c["website"]
    cams.append(o)

KIND = {"love_hotel": {"e": "🏩", "label": "ラブホテル", "c": "#C2185B"},
        "erotic": {"e": "🔞", "label": "アダルトショップ", "c": "#6A1B9A"},
        "sex": {"e": "🔞", "label": "アダルトショップ", "c": "#6A1B9A"}}
adults = []
for a in d["adult"]:
    t = a.get("shop") or a.get("amenity") or a.get("tourism") or ""
    k = "love_hotel" if t == "love_hotel" else ("erotic" if t in ("erotic", "sex") else None)
    if not k: continue
    o = {"n": a.get("n") or KIND[k]["label"], "la": a["la"], "lo": a["lo"], "k": k}
    if a.get("opening_hours"): o["op"] = a["opening_hours"]
    if a.get("website"): o["web"] = a["website"]
    if a.get("brand"): o["br"] = a["brand"]
    adults.append(o)

io.open("data/camadult.js", "w", encoding="utf-8").write(
"""/* 監視カメラと、おとな向けの施設（自動生成: tools/build_cam_adult.py）

   CAMSPOT  監視カメラの設置場所。k="spot" は «あることだけ» 分かっているもので、
            映像は公開されていません。k="live" は映像が見られるものです。
            z=どこを写しているか by=設置者 url=映像
   ADULT    おとな向けの施設。k="love_hotel" / "erotic"
            既定では地図に出しません。設定のいちばん奥の切り替えを入れたときだけ出ます。

   出典: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.CAMSPOT = %s;\nRG.ADULT = %s;\nRG.ADULT_KIND = %s;\n"
      % (json.dumps(cams, ensure_ascii=False, separators=(",", ":")),
         json.dumps(adults, ensure_ascii=False, separators=(",", ":")),
         json.dumps(KIND, ensure_ascii=False)))
print("監視カメラ %d 件（うち映像あり %d）／おとな向け %d 件 / %d bytes"
      % (len(cams), sum(1 for c in cams if c["k"] == "live"), len(adults),
         os.path.getsize("data/camadult.js")))
print("写している場所:", dict(collections.Counter(c.get("z", "—") for c in cams).most_common(6)))
print("おとな向け:", dict(collections.Counter(a["k"] for a in adults)))
