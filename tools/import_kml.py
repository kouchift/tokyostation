#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KML（Google マイマップの書き出しなど）→ data/levechi.js  «レベチなレストラン»（v87）

使い方:
  python3 tools/import_kml.py レストラン.kml                 # data/levechi.js を作る（上書き）
  python3 tools/import_kml.py a.kml b.kmz --title "レベチ"   # 複数可・KMZ（zip）可
  python3 tools/import_kml.py a.kml --dry                    # 中身を数えるだけ

読むもの:
  Placemark の name / description（HTML は文字に）/ Point の coordinates / ExtendedData の Data・SchemaData /
  Folder の name（= レイヤ名 → タグ）/ styleUrl の色（あれば）。LineString・Polygon は無視（レストランは点だけ）。
出すもの（RG.LEVECHI の 1 件）:
  { n: 店名, la, lo, ad: 住所, d: 説明（最大 300 字）, url: 公式や参考リンク, tags: [レイヤ名, …], ex: {ExtendedData の残り}, star: 4.0〜5.0 }
  star は説明に「★★★★」や「4.5」などがあれば拾い、無ければ 4.6（«レベチ» は全部が高評価の前提）
"""
import sys, re, io, json, os, zipfile, html, datetime
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "levechi.js")

def strip_html(s):
    if not s: return ""
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t　]+", " ", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()

def local(tag):
    return tag.split("}", 1)[1] if "}" in tag else tag

def read_kml(path):
    if path.lower().endswith(".kmz"):
        with zipfile.ZipFile(path) as z:
            name = [n for n in z.namelist() if n.lower().endswith(".kml")][0]
            return z.read(name).decode("utf-8", "replace")
    return io.open(path, encoding="utf-8", errors="replace").read()

STAR_RE = re.compile(r"(★{1,5})|([1-5](?:\.\d)?)\s*(?:点|/5|／5|つ星|star)", re.I)
URL_RE = re.compile(r"https?://[^\s<>\"']+")
ADDR_KEYS = ("住所", "所在地", "address", "Address", "addr")

def walk(node, folders, out, styles):
    for ch in list(node):
        t = local(ch.tag)
        if t == "Folder" or t == "Document":
            nm = ""
            for c in ch:
                if local(c.tag) == "name": nm = (c.text or "").strip(); break
            walk(ch, folders + ([nm] if nm and t == "Folder" else []), out, styles)
        elif t == "Style":
            sid = ch.get("id") or ""
            col = None
            for c in ch.iter():
                if local(c.tag) == "color" and c.text: col = c.text.strip()
            if sid: styles[sid] = col
        elif t == "Placemark":
            rec = parse_placemark(ch, folders)
            if rec: out.append(rec)

def parse_placemark(pm, folders):
    name = desc = style = ""
    coords = None; ex = {}
    for c in pm:
        t = local(c.tag)
        if t == "name": name = (c.text or "").strip()
        elif t == "description": desc = c.text or ""
        elif t == "styleUrl": style = (c.text or "").strip().lstrip("#")
        elif t == "Point":
            for cc in c.iter():
                if local(cc.tag) == "coordinates" and cc.text: coords = cc.text.strip()
        elif t == "ExtendedData":
            for d in c.iter():
                lt = local(d.tag)
                if lt == "Data":
                    k = d.get("name") or ""; v = ""
                    for vv in d:
                        if local(vv.tag) == "value": v = vv.text or ""
                    if k: ex[k] = strip_html(v)
                elif lt == "SimpleData":
                    k = d.get("name") or ""
                    if k: ex[k] = strip_html(d.text or "")
    if not coords or not name: return None
    # 説明が «<b>項目:</b> 値<br>» の並び（Google マイマップにスプレッドシートから入れたときの形）なら、項目ごとに拾う
    lk = {}
    for k, v in re.findall(r"<b>\s*([^<:：]+?)\s*[:：]\s*</b>\s*(.*?)(?=<br\s*/?>|</p>|</div>|$)", desc or "", flags=re.S):
        k = k.strip()
        ma = re.search(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', v, flags=re.S)
        if ma and ma.group(1).startswith("http"): lk[k] = ma.group(1)          # 値がリンクなら、その URL も持つ（カタログの頁など）
        v = strip_html(v)
        v = re.sub(r"(\d{1,2}:\d{2})\s*[>＞]?\s*(\d{1,2}:\d{2})", r"\1～\2", v)   # «11:3014:00» «17:00>19:00» → «11:30～14:00»
        if k and v and k not in ex: ex[k] = v
    parts = coords.split(",")
    try: lo, la = float(parts[0]), float(parts[1])
    except Exception: return None
    if not (20 <= la <= 46 and 122 <= lo <= 154): return None      # 日本の外は捨てる（ゴミ座標よけ）
    text = strip_html(desc)
    if len(ex) >= 3 and re.search(r"<b>[^<]*[:：]\s*</b>", desc or ""): text = ""      # 項目に分けたので、本文の丸写しは要らない
    ad = ""
    for k in ADDR_KEYS:
        if ex.get(k): ad = ex.pop(k); break
    url = ""
    for k in ("公式サイト", "公式", "URL", "url", "サイト", "website", "Website", "web", "リンク"):
        if ex.get(k) and URL_RE.search(ex[k]): url = URL_RE.search(ex.pop(k)).group(0).rstrip(").,、。"); break
    if not url:
        m = URL_RE.search(desc or "") or URL_RE.search(" ".join(ex.values()))
        if m: url = m.group(0).rstrip(").,、。")
    for k in list(ex.keys()):                       # 値が URL だけの項目（カタログの頁など）は url2 に寄せる
        if k != "url" and URL_RE.fullmatch(ex[k].strip() if isinstance(ex[k], str) else ""): ex[k] = ex[k].strip()
    star = 4.6
    ms = STAR_RE.search(text) or STAR_RE.search(" ".join(ex.values()))
    if ms:
        if ms.group(1): star = float(len(ms.group(1)))
        elif ms.group(2): star = float(ms.group(2))
    star = max(4.0, min(5.0, star))
    text = URL_RE.sub("", text)
    # URL を抜いたあとに残る «参考:» だけの行・★だけの行・«4.7点» だけの行は消す（星は star に入っている）
    text = "\n".join(l for l in (x.strip() for x in text.split("\n"))
                     if l and not re.match(r"^(参考|URL|リンク|link|HP|公式)?\s*[:：]?$", l, re.I)
                     and not re.match(r"^★+$", l) and not re.match(r"^[1-5](\.\d)?\s*(点|/5|／5|つ星)$", l))
    if len(text) > 300: text = text[:299] + "…"
    ex = {k: v for k, v in ex.items() if v and k not in ("gx_media_links",)}
    lk = {k: u for k, u in lk.items() if k in ex}
    tags = [f for f in folders if f][:3]
    for k in ("エリア", "ジャンル", "カテゴリ", "種類"):
        if ex.get(k) and len(ex[k]) <= 20: tags.append(ex[k])
    rec = { "n": name[:60], "la": round(la, 6), "lo": round(lo, 6), "ad": ad[:80], "d": text, "url": url, "tags": tags[:3], "ex": ex, "star": star, "style": style }
    if lk: rec["lk"] = lk
    return rec

def main():
    argv = sys.argv[1:]
    dry = "--dry" in argv
    title = "レベチなレストラン"
    if "--title" in argv: i = argv.index("--title"); title = argv[i + 1]; del argv[i:i + 2]
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__); sys.exit(1)
    recs, styles, docnames = [], {}, []
    for p in args:
        xml = read_kml(p)
        root = ET.fromstring(xml)
        for c in root.iter():
            if local(c.tag) == "Document":
                for cc in c:
                    if local(cc.tag) == "name" and cc.text: docnames.append(cc.text.strip())
                break
        walk(root, [], recs, styles)
    # 同じ店（名前が同じ・100m 以内）はひとつに
    seen, out = [], []
    for r in recs:
        dup = None
        for s in seen:
            if s["n"] == r["n"] and abs(s["la"] - r["la"]) < 0.001 and abs(s["lo"] - r["lo"]) < 0.001: dup = s; break
        if not dup: seen.append(r); out.append(r); continue
        # 同じ店が 2 回（ランチ／ディナーのプラン違いなど）→ 1 つにまとめ、違う値は「／」でつなぐ
        for k, v in r["ex"].items():
            if not v: continue
            if not dup["ex"].get(k): dup["ex"][k] = v
            elif v not in dup["ex"][k]: dup["ex"][k] = dup["ex"][k] + "／" + v
        if r["d"] and r["d"] not in dup["d"]: dup["d"] = (dup["d"] + "\n" + r["d"]).strip()
        if not dup["url"]: dup["url"] = r["url"]
        if r.get("lk"): dup.setdefault("lk", {}).update({k: u for k, u in r["lk"].items() if k not in dup.get("lk", {})})
        for t in r["tags"]:
            if t not in dup["tags"] and len(dup["tags"]) < 3: dup["tags"].append(t)
    for r in out:
        r.pop("style", None)
    print("placemarks:", len(recs), "unique:", len(out), "with url:", sum(1 for r in out if r["url"]), "with address:", sum(1 for r in out if r["ad"]))
    if dry:
        for r in out[:10]: print(" -", r["n"], r["la"], r["lo"], r["tags"], (r["d"] or "")[:40])
        return
    body = "/* «レベチなレストラン»（v87）— 本人が別途つくった KML（Google マイマップ）を tools/import_kml.py で変換したもの。\n   評価は本人の主観。営業時間・休業は各店の公式で確認。 */\n"
    body += "RG.LEVECHI_META = " + json.dumps({ "title": title, "n": len(out), "built": datetime.date.today().isoformat(), "src": [os.path.basename(a) for a in args], "doc": docnames }, ensure_ascii=False) + ";\n"
    body += "RG.LEVECHI = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    io.open(OUT, "w", encoding="utf-8").write(body)
    print("wrote", OUT, len(body) // 1024, "KB")

if __name__ == "__main__":
    main()
