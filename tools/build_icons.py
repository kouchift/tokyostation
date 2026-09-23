#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v101: Figma Make の icons-sheet（80 ジャンル × ui 24px / map 16px）から SVG スプライトを作る。

入力: design/figma-make-v101/icons_cells.json
      （Figma の「SVGとしてコピー」を 10×8 のマス目に分解したもの。マス k = 行 r*10 + 列 c。
        各マスの UI アイコンは (26+120c, 98+100r) から 24px、地図用は (74+120c, 102+100r) から 16px）
出力: assets/icons.svg  … <symbol id="g-{id}" viewBox="0 0 24 24"> と <symbol id="g-{id}-map" viewBox="0 0 16 16">
      design/figma-make-v101/icons-preview.html … 目視確認用

線は currentColor（塗りはジャンル色の丸だけに使う、という設計どおり）。色の丸・白い丸はスプライトに含めない。
"""
import json, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "figma-make-v101", "icons_cells.json")
OUT = os.path.join(ROOT, "assets", "icons.svg")
PREVIEW = os.path.join(ROOT, "design", "figma-make-v101", "icons-preview.html")

# マスの並び（Figma Make が実際に描いた icons-sheet の順。サイトのジャンル id との対応は assets/icons.js の ALIAS と SPEC.md）
ORDER = ("levechi bunkazai history mountain castle river zoo koshin airport shukuba "
         "yt near_special view_jp onsen_jp buzz ichinomiya shrine_major temple_major worship leisure "
         "park museum library shopping civic toilet aed shelter camera event "
         "baby wifi cycle_park sento onsen_sento view_spot share_cycle hospital pharmacy drugstore "
         "convenience supermarket discount police company garden ramen gyudon family_rest yakiniku "
         "chinese curry sushi pizza burger cafe izakaya bakery hotel atm "
         "bank post parking gas ev coin_laundry gym school university clinic "
         "beauty theater sports church taxi bus rental_car station ferry landmark").split()
assert len(ORDER) == 80 and len(set(ORDER)) == 80

NUM = r"-?\d*\.?\d+(?:e-?\d+)?"

def fmt(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def translate(d, dx, dy):
    """絶対座標の M/L/H/V/C/Z だけを扱う（Figma の出力はこれだけ）"""
    out = []
    for cmd, args in re.findall(r"([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)", d):
        nums = [float(x) for x in re.findall(NUM, args)]
        if cmd in "Zz":
            out.append("Z"); continue
        if cmd == "H":
            out.append("H" + " ".join(fmt(x + dx) for x in nums)); continue
        if cmd == "V":
            out.append("V" + " ".join(fmt(y + dy) for y in nums)); continue
        if cmd in "MLC":
            pts = []
            for i in range(0, len(nums), 2):
                pts.append(fmt(nums[i] + dx) + " " + fmt(nums[i + 1] + dy))
            out.append(cmd + " ".join(pts)); continue
        raise SystemExit("unsupported path command: " + cmd)
    return "".join(out)

def build():
    cells = json.load(open(SRC, encoding="utf-8"))
    assert len(cells) == 80, len(cells)
    syms, colors = [], {}
    for k, cell in enumerate(cells):
        r, c = divmod(k, 10)
        gid = ORDER[k]
        ui, mp = [], []
        for p in cell:
            if p["o"]:                                   # ジャンル色の丸（0.15 / 0.12）→ 色だけ記録
                colors.setdefault(gid, p["f"]); continue
            if p["f"] == "white" and p["s"] == "#E0E0E0":  # 地図マーカーの白い丸
                continue
            cx = p["x"] + p["W"] / 2
            (ui if cx < 60 + 120 * c else mp).append(p)
        def sym(paths, sid, box, ox, oy, sw):
            parts = []
            for p in paths:
                d = translate(p["d"], -ox, -oy)
                if p["f"] == "black" and not p["s"]:
                    parts.append('<path d="%s" fill="currentColor" stroke="none"/>' % d)
                else:
                    extra = ""
                    if p["w"] and abs(float(p["w"]) - sw) > 0.01: extra += ' stroke-width="%s"' % p["w"]
                    if p["lj"] != "round": extra += ' stroke-linejoin="miter"'
                    if p["lc"] != "round": extra += ' stroke-linecap="butt"'
                    parts.append('<path d="%s"%s/>' % (d, extra))
            return ('<symbol id="%s" viewBox="0 0 %d %d"><g fill="none" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</g></symbol>'
                    % (sid, box, box, fmt(sw), "".join(parts)))
        if not ui and not mp:
            raise SystemExit("cell %d (%s): no icon paths" % (k, gid))
        # 片方が無いマス（Figma Make が描き落としたもの）は、もう片方を viewBox ごと流用する（線の太さは見た目が揃うように換算）
        if ui:
            syms.append(sym(ui, "g-" + gid, 24, 26 + 120 * c, 98 + 100 * r, 1.75))
        else:
            sys.stderr.write("note: %s has no ui icon -> map icon reused\n" % gid)
            syms.append(sym(mp, "g-" + gid, 16, 74 + 120 * c, 102 + 100 * r, 1.25 * 24 / 16 * (16 / 24)))
        if mp:
            syms.append(sym(mp, "g-" + gid + "-map", 16, 74 + 120 * c, 102 + 100 * r, 1.25))
        else:
            sys.stderr.write("note: %s has no map icon -> ui icon reused\n" % gid)
            syms.append(sym(ui, "g-" + gid + "-map", 24, 26 + 120 * c, 98 + 100 * r, 1.25 * 24 / 16))
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'
           '<!-- v101 東京ステーションガイド ジャンルアイコン（Figma Make icons-sheet 由来・tools/build_icons.py 生成）-->'
           + "".join(syms) + "</svg>\n")
    open(OUT, "w", encoding="utf-8").write(svg)
    # 目視確認ページ
    rows = []
    for gid in ORDER:
        rows.append('<div class="c" style="--pc:%s"><i><svg><use href="#g-%s"/></svg></i><b><svg><use href="#g-%s-map"/></svg></b><span>%s</span></div>' % (colors.get(gid, "#888"), gid, gid, gid))
    html = ('<!doctype html><meta charset="utf-8"><title>icons preview v101</title><style>'
            'body{font:12px system-ui;background:#F7F9FF;color:#00224A;padding:16px}'
            '.g{display:grid;grid-template-columns:repeat(10,1fr);gap:8px}'
            '.c{display:flex;align-items:center;gap:6px;background:#fff;border-radius:10px;padding:6px}'
            '.c i{width:32px;height:32px;border-radius:50%;background:color-mix(in srgb,var(--pc) 15%,#fff);display:grid;place-items:center}'
            '.c i svg{width:24px;height:24px;color:#111}'
            '.c b{width:28px;height:28px;border-radius:50%;background:#fff;border:1px solid #E0E0E0;display:grid;place-items:center;position:relative}'
            '.c b::before{content:"";position:absolute;inset:3px;border-radius:50%;background:color-mix(in srgb,var(--pc) 12%,#fff)}'
            '.c b svg{width:16px;height:16px;color:#111;position:relative}'
            '.c span{font-size:9px;color:#626264}'
            '</style>' + svg + '<div class="g">' + "".join(rows) + '</div>')
    open(PREVIEW, "w", encoding="utf-8").write(html)
    json.dump(colors, open(os.path.join(ROOT, "design", "figma-make-v101", "figma-colors.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(syms), "symbols")

if __name__ == "__main__":
    build()
