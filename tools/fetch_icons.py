#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""アイコン字体（Material Symbols Outlined）のサブセットを Google Fonts から取り直して assets/fonts/msymbols.woff2 に置く（v87）

  python3 tools/fetch_icons.py            # ICONS の一覧で作り直す
  python3 tools/fetch_icons.py --list     # いま画面で使っている ligature 名を assets/*.js / index.html から拾って表示（ICONS の更新用）

なぜ同梱するか: アイコンは Google Fonts の CSS → woff2 の 2 段で届くので、社内プロキシや圏外・中国などで届かないと
«search» «close» のような文字がそのまま見えてしまう。同梱なら Service Worker にも入り、2 回目以降は通信なし。
ライセンス: Material Symbols は Apache License 2.0（Google）。同梱・再配布可。
"""
import sys, re, os, io, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "fonts", "msymbols.woff2")
ICONS = ("ac_unit,add,arrow_back,bookmark,calendar_month,chat_bubble,check_circle,chevron_right,close,cloud,contactless,"
         "directions_subway,directions_walk,download,event,explore,favorite,foggy,forum,groups,info,layers,list,"
         "local_fire_department,luggage,map,markunread_mailbox,mic,my_location,navigation,near_me,nightlight,"
         "partly_cloudy_day,person,place,rainy,remove,route,schedule,search,settings,share,star,storefront,thunderstorm,"
         "timer,tips_and_updates,train,tune,warning,wb_sunny,zoom_out_map")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def used_icons():
    names = set()
    for dp, _, fs in os.walk(os.path.join(ROOT, "assets")):
        for f in fs:
            if f.endswith(".js") and "bundle" not in f:
                names |= set(re.findall(r'class="ms[^"]*">([a-z_]+)<', io.open(os.path.join(dp, f), encoding="utf-8").read()))
    names |= set(re.findall(r'class="ms[^"]*">([a-z_]+)<', io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()))
    return sorted(names)

def main():
    if "--list" in sys.argv:
        u = used_icons(); cur = set(ICONS.split(","))
        print("used:", ",".join(u)); print("missing in ICONS:", sorted(set(u) - cur)); return
    names = ",".join(sorted(set(ICONS.split(","))))
    css_url = ("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
               "&icon_names=" + names + "&display=block")
    req = urllib.request.Request(css_url, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    m = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)\s*format\('woff2'\)", css)
    if not m: print("woff2 の URL が見つかりません:\n" + css[:400]); sys.exit(1)
    data = urllib.request.urlopen(urllib.request.Request(m.group(1), headers={"User-Agent": UA}), timeout=60).read()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "wb").write(data)
    print("wrote", OUT, len(data) // 1024, "KB;", len(names.split(",")), "icons")
    print("※ app.css の @font-face の ?v= と sw.js の CORE を新しい版に合わせてください")

if __name__ == "__main__":
    main()
