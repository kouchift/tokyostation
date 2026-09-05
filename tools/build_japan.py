# -*- coding: utf-8 -*-
"""
地図を «日本全国» に広げる。

■ 駅
  Wikidata（CC0）から 11,067件（沖縄〜北海道）。

■ 区間（駅と駅のつながり）
  Wikidata の «隣の駅»（P197）から 63,315件。
  そのうち路線名が付いているものが 29,491件。
  路線名の無いものは、両側の駅に共通する路線がひとつだけのときに限り採用。

■ 気をつけたこと
  ・もとの区間は消さない
  ・地図にある駅どうしだけをつなぐ（駅を勝手に増やさない）
  ・事業者名がくっついた駅名（「JR東日本東京」など）は落とす
  ・同じ名前の駅が全国にあるので、離れていれば別の駅として番号を付ける

  出典: Wikidata (CC0)
"""
import json, io, os, subprocess, collections, unicodedata, math

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
NET = json.loads(subprocess.run(["node", "-e",
    'global.RG={};eval(require("fs").readFileSync("data/network.js","utf8"));'
    'process.stdout.write(JSON.stringify(RG.NET))'],
    capture_output=True, text=True, check=True).stdout)
print("いま: %d駅 / %d路線 / %d区間" % (len(NET["stations"]), len(NET["lines"]), len(NET["edges"])))

st = {t["n"]: t for t in NET["stations"]}
jp = json.load(open("/tmp/poi/jp_stations.json", encoding="utf-8"))
wd = json.load(open("/tmp/poi/jp_edges.json", encoding="utf-8"))
def kana(n): return unicodedata.normalize("NFKC", n or "").strip()

# --- 事業者名つきの重複を落とす ---
OPS = ("JR東日本", "JR西日本", "JR東海", "JR九州", "JR四国", "JR北海道", "JR貨物", "JR",
       "東日本旅客鉄道", "西日本旅客鉄道", "東海旅客鉄道", "九州旅客鉄道",
       "東京地下鉄", "東京メトロ", "都営地下鉄", "大阪市高速電気軌道", "Osaka Metro",
       "名古屋市営地下鉄", "札幌市営地下鉄", "福岡市地下鉄", "京都市営地下鉄",
       "神戸市営地下鉄", "横浜市営地下鉄", "仙台市地下鉄",
       "近畿日本鉄道", "近鉄", "阪急電鉄", "阪急", "阪神電気鉄道", "阪神",
       "南海電気鉄道", "南海", "京阪電気鉄道", "京阪", "名古屋鉄道", "名鉄",
       "西日本鉄道", "西鉄", "東武鉄道", "西武鉄道", "小田急電鉄", "京王電鉄",
       "京成電鉄", "京浜急行電鉄", "東急電鉄", "相模鉄道")
plain = set(s["n"] for s in jp if not any(s["n"].startswith(o) for o in OPS))
def strip_op(n):
    for o in sorted(OPS, key=len, reverse=True):
        if n.startswith(o):
            r = n[len(o):].lstrip("・-–— ")
            if r: return r
    return n
cleaned, dropped = [], 0
for s in jp:
    b = strip_op(s["n"])
    if b != s["n"] and (b in plain or b in st): dropped += 1; continue
    s["n"] = b
    cleaned.append(s)
jp = cleaned
print("事業者名つきの重複を落とした: %d件" % dropped)

# --- 駅を足す。同じ名前でも遠ければ別の駅（番号を付ける）---
def far(a, b):
    return (a["la"] - b["la"]) ** 2 + (a["lo"] - b["lo"]) ** 2 > 0.01   # およそ10km
added = 0
alias = {}          # Wikidata の名前 → 地図での id
for s in jp:
    n = kana(s["n"])
    if not n: continue
    if n in st:
        if far(st[n], s):
            n2 = n + "_" + str(2)
            k = 2
            while n2 in st and far(st[n2], s): k += 1; n2 = n + "_" + str(k)
            if n2 not in st:
                st[n2] = {"id": n2, "n": n, "la": round(s["la"], 6), "lo": round(s["lo"], 6),
                          "ls": s.get("ls") or [], "k": "", "jp": 1}
                added += 1
            alias[n] = alias.get(n, n)
        continue
    st[n] = {"id": n, "n": n, "la": round(s["la"], 6), "lo": round(s["lo"], 6),
             "ls": s.get("ls") or [], "k": "", "jp": 1}
    added += 1
print("駅: ＋%d → %d" % (added, len(st)))

# --- 区間 ---
edges = list(NET["edges"])
seen = set(tuple(sorted(e[:2])) + (e[2],) for e in edges)
pair = set(tuple(sorted(e[:2])) for e in edges)
by_name = collections.defaultdict(list)
for k, t in st.items(): by_name[t["n"]].append(t)

def pick(name, other=None):
    """同じ名前が複数あるとき、相手にいちばん近いものを選ぶ"""
    c = by_name.get(kana(name))
    if not c: return None
    if len(c) == 1 or other is None: return c[0]
    return min(c, key=lambda t: (t["la"] - other["la"]) ** 2 + (t["lo"] - other["lo"]) ** 2)

def add_edge(a, b, line):
    ta = pick(a); 
    if not ta: return False
    tb = pick(b, ta)
    if not tb or ta["id"] == tb["id"]: return False
    # 隣の駅どうしが 60km 以上離れていたら、別の同名駅を拾っている
    if (ta["la"] - tb["la"]) ** 2 + (ta["lo"] - tb["lo"]) ** 2 > 0.36: return False
    k = tuple(sorted([ta["id"], tb["id"]])) + (line,)
    if k in seen: return False
    seen.add(k); pair.add(tuple(sorted([ta["id"], tb["id"]])))
    edges.append([ta["id"], tb["id"], line]); return True

n1 = sum(1 for a, b, l in wd if l and add_edge(a, b, l))
print("路線名つき: ＋%d区間" % n1)
n2 = 0
for a, b, l in wd:
    if l: continue
    ta = pick(a)
    if not ta: continue
    tb = pick(b, ta)
    if not tb: continue
    if tuple(sorted([ta["id"], tb["id"]])) in pair: continue
    both = set(ta.get("ls") or []) & set(tb.get("ls") or [])
    if len(both) == 1 and add_edge(a, b, list(both)[0]): n2 += 1
print("路線がひとつに決まるもの: ＋%d区間" % n2)

# --- 路線・並び順 ---
COL = ["#E60012", "#0068B7", "#00A040", "#F39800", "#8E24AA", "#00A0B0", "#D81B60",
       "#5E35B1", "#43A047", "#EF6C00", "#1E88E5", "#6D4C41", "#00838F", "#C0CA33"]
old_ln = {l["name"]: l for l in NET["lines"]}
cnt = collections.Counter(e[2] for e in edges)
lines = [{"name": nm, "color": (old_ln.get(nm) or {}).get("color") or COL[i % len(COL)], "edges": k}
         for i, (nm, k) in enumerate(sorted(cnt.items(), key=lambda kv: -kv[1]))]
ls = collections.defaultdict(set)
for e in edges: ls[e[0]].add(e[2]); ls[e[1]].add(e[2])
sts = []
for k, t in st.items():
    g = sorted(ls.get(k, []))
    if g: t["ls"] = g
    if t.get("ls"): sts.append(t)
pos = {t["n"]: i for i, t in enumerate(NET["stations"])}
sts = sorted([t for t in sts if t["n"] in pos], key=lambda t: pos[t["n"]]) + \
      sorted([t for t in sts if t["n"] not in pos], key=lambda t: (-len(t.get("ls") or []), t["n"]))
NET["stations"] = sts; NET["lines"] = lines; NET["edges"] = edges
NET["area"] = "日本全国"
src = io.open("data/network.js", encoding="utf-8").read()
io.open("data/network.js", "w", encoding="utf-8").write(
    src[:src.index("RG.NET = ")] + "RG.NET = " +
    json.dumps(NET, ensure_ascii=False, separators=(",", ":")) + ";\n")
la = [t["la"] for t in sts]; lo = [t["lo"] for t in sts]
print("\nできあがり: %d駅 / %d路線 / %d区間 / %.1f MB"
      % (len(sts), len(lines), len(edges), os.path.getsize("data/network.js") / 1048576))
print("範囲: 緯度 %.2f〜%.2f ／ 経度 %.2f〜%.2f" % (min(la), max(la), min(lo), max(lo)))
