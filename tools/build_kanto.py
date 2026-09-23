# -*- coding: utf-8 -*-
"""
地図の範囲を «東京23区» から «関東1都6県» に広げる。

■ なぜ広げるのか
  ディズニーランドは千葉、通勤は埼玉・神奈川からという人も多い。
  «東京» と名乗っていても、実際の行動範囲は都県をまたいでいる。

■ 作りかた
  駅と座標  … Wikidata（CC0）から関東1都6県ぶん
  駅の並び  … OpenStreetMap の順路（ODbL）から。ここから «区間» を作る
  もとの23区のデータ（669駅）はそのまま残し、足りないぶんを足す。

■ 大事にしたこと
  ・もとの23区の区間は消さない（これまで動いていたものを壊さない）
  ・駅を勝手に増やさない（Wikidata にある駅だけ）
  ・同じ駅名が県をまたいで重なる場合は、23区のものを優先する
"""
import json, io, os, re, subprocess, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

NET = json.loads(subprocess.run(
    ["node", "-e", 'global.RG={};eval(require("fs").readFileSync("data/network.js","utf8"));'
                   'process.stdout.write(JSON.stringify(RG.NET))'],
    capture_output=True, text=True, check=True).stdout)
old_st = {t["n"]: t for t in NET["stations"]}
old_ln = {l["name"]: l for l in NET["lines"]}
print("いまの地図: %d駅 / %d路線 / %d区間" % (len(old_st), len(old_ln), len(NET["edges"])))

kanto = json.load(open("/tmp/poi/kanto_stations.json", encoding="utf-8"))
seq = json.load(open("/tmp/poi/kanto_seq.json", encoding="utf-8"))

# --- 事業者名がくっついた駅名を掃除する -------------------------------
# Wikidata には「JR東日本東京」「東急電鉄・東京メトロ渋谷」のように、
# 事業者名が前に付いた項目がある。同じ駅が二重に出てしまうので落とす。
OPS = ("JR東日本", "JR東海", "JR西日本", "JR貨物", "JR", "東日本旅客鉄道",
       "東京地下鉄", "東京メトロ", "都営地下鉄", "東京都交通局", "東急電鉄", "東急",
       "京王電鉄", "京王", "小田急電鉄", "小田急", "西武鉄道", "西武", "東武鉄道", "東武",
       "京成電鉄", "京成", "京浜急行電鉄", "京急", "相模鉄道", "相鉄",
       "横浜市営地下鉄", "埼玉高速鉄道", "首都圏新都市鉄道", "つくばエクスプレス",
       "東京臨海高速鉄道", "新京成電鉄", "北総鉄道", "多摩都市モノレール")
plain = set()
for s2 in kanto:
    n = s2["n"]
    if not any(n.startswith(o) for o in OPS): plain.add(n)
def strip_op(n):
    for o in sorted(OPS, key=len, reverse=True):
        if n.startswith(o):
            rest = n[len(o):].lstrip("・-–— ")
            if rest: return rest
    return n
cleaned, dropped = [], 0
for s2 in kanto:
    n = s2["n"]
    base = strip_op(n)
    # 事業者名を外した名前が、ほかにそのまま存在するなら、こちらは捨てる
    if base != n and (base in plain or base in old_st): dropped += 1; continue
    s2["n"] = base
    cleaned.append(s2)
kanto = cleaned
print("事業者名つきの重複を落とした: %d件" % dropped)

# --- 駅を足す ---------------------------------------------------------
def kana(n): return unicodedata.normalize("NFKC", n)
added = 0
for s in kanto:
    n = kana(s["n"])
    if n in old_st: continue
    old_st[n] = {"id": n, "n": n, "la": round(s["la"], 6), "lo": round(s["lo"], 6),
                 "ls": s.get("ls") or [], "k": "", "kanto": 1,
                 **({"op": s["op"]} if s.get("op") else {})}
    added += 1
print("駅: %d → %d（＋%d）" % (len(NET["stations"]), len(old_st), added))

# --- 路線名の突き合わせ ------------------------------------------------
def clean(n):
    n = re.sub(r"\s*\([^)]*\)\s*", "", n)
    n = re.sub(r"\s*（[^）]*）\s*", "", n)
    n = re.sub(r"^(JR東日本|JR|東京地下鉄|東京メトロ|都営地下鉄|東京都交通局|東急電鉄|東急|"
               r"京王電鉄|小田急電鉄|西武鉄道|東武鉄道|京成電鉄|京浜急行電鉄|京急|相模鉄道|"
               r"相鉄|首都圏新都市鉄道|東京臨海高速鉄道|横浜市営地下鉄|埼玉高速鉄道|"
               r"新京成電鉄|北総鉄道|流鉄|銚子電気鉄道|上信電鉄|わたらせ渓谷鐵道)", "", n)
    return unicodedata.normalize("NFKC", re.sub(r"[\s・,，.。／/（）()「」【】〈〉]", "", n))

want = {clean(k): k for k in old_ln}
# 駅の «所属路線» にしか出てこない路線も、名前として受け入れる
for s in kanto:
    for l in (s.get("ls") or []):
        if clean(l) not in want: want[clean(l)] = l

new_edges = list(NET["edges"])
seen = set(tuple(sorted(e[:2])) + (e[2],) for e in new_edges)
report, made = [], 0
for osm_name, sts in seq.items():
    key = clean(osm_name)
    ln = want.get(key)
    if not ln:
        # 名前がぴったり合わないものは、OSM の名前をそのまま新しい路線として使う。
        # «似ているから同じ» と決めつけると、別の路線に駅が混ざってしまう。
        ln = re.sub(r"\s*\([^)]*\)\s*", "", osm_name).strip()
        if not ln: continue
    names = [kana(x) for x in sts]
    names = [n for n in names if n in old_st]
    if len(names) < 2: continue
    before = len(set(x for e in NET["edges"] if e[2] == ln for x in e[:2]))
    if before and len(names) < before: continue        # 減るなら見送り
    n2 = 0
    for i in range(len(names) - 1):
        k = tuple(sorted([names[i], names[i + 1]])) + (ln,)
        if k in seen: continue
        seen.add(k); new_edges.append([names[i], names[i + 1], ln]); n2 += 1
    if n2: report.append((ln, before, len(names), n2)); made += n2

print("区間: %d → %d（＋%d）" % (len(NET["edges"]), len(new_edges), made))

# --- 路線の一覧と色 ---------------------------------------------------
COL = ["#E60012", "#0068B7", "#00A040", "#F39800", "#8E24AA", "#00A0B0", "#D81B60",
       "#5E35B1", "#43A047", "#EF6C00", "#1E88E5", "#6D4C41", "#00838F", "#C0CA33"]
cnt = collections.Counter(e[2] for e in new_edges)
lines = []
for i, (nm, k) in enumerate(sorted(cnt.items(), key=lambda kv: -kv[1])):
    o = old_ln.get(nm)
    lines.append({"name": nm, "color": (o or {}).get("color") or COL[i % len(COL)],
                  "edges": k, **({"kanto": 1} if not o else {})})

# --- 駅の所属路線を作り直す -------------------------------------------
ls = collections.defaultdict(set)
for e in new_edges: ls[e[0]].add(e[2]); ls[e[1]].add(e[2])
sts = []
for n, t in old_st.items():
    got = sorted(ls.get(n, []))
    if got: t["ls"] = got
    if not t.get("ls"): continue            # どの路線にもつながらない駅は出さない
    sts.append(t)

# --- 表示のじゅんばん（並び順）を決める -------------------------------
# 地図を広く見ているときは «大事な駅» だけを出す。
# その «大事さ» は、駅の並び順そのもの（アプリが上から順に番号を振る）。
#   ① もとの23区の駅（乗降人員の多い順）を、そのままの順で先頭に
#   ② 新しく増えた駅は «乗り入れ路線の多さ» の順に、そのうしろへ
orig = [t["n"] for t in NET["stations"]]
pos = {n: i for i, n in enumerate(orig)}
was = [t for t in sts if t["n"] in pos]
was.sort(key=lambda t: pos[t["n"]])
new = [t for t in sts if t["n"] not in pos]
new.sort(key=lambda t: (-len(t.get("ls") or []), t["n"]))
sts = was + new
print("表示順: もとの %d駅（そのまま）＋ 新しい %d駅（乗り入れの多い順）" % (len(was), len(new)))
print("  新しい駅の先頭:", " ".join(t["n"] for t in new[:10]))

NET["stations"] = sts
NET["lines"] = lines
NET["edges"] = new_edges
NET["area"] = "関東1都6県"
src = io.open("data/network.js", encoding="utf-8").read()
head = src[:src.index("RG.NET = ")]
io.open("data/network.js", "w", encoding="utf-8").write(
    head + "RG.NET = " + json.dumps(NET, ensure_ascii=False, separators=(",", ":")) + ";\n")

print("\nできあがり: %d駅 / %d路線 / %d区間 / %.0f KB"
      % (len(sts), len(lines), len(new_edges), os.path.getsize("data/network.js") / 1024))
print("\n区間が増えた路線（上位15）:")
for ln, b, a, n in sorted(report, key=lambda r: -r[3])[:15]:
    print("  %-26s %3d駅 → 区間＋%d" % (ln, a, n))
