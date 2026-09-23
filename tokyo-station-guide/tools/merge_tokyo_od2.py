# -*- coding: utf-8 -*-
"""
2回目に取り込んだ東京都オープンデータを data/*.js にまとめる。
出典はすべて 東京都オープンデータカタログサイト（CC BY 4.0）。
"""
import json, io, os, math, re, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
D = json.load(open("/tmp/poi/tokyo_od2.json", encoding="utf-8"))

# ---------------------------------------------------------- 駅の座標
net = io.open("data/network.js", encoding="utf-8").read()
i0 = net.index(" stations: ") + len(" stations: ")
STS = json.loads(net[i0:net.index("\n", i0)].rstrip(","))
CELL = 0.01
grid = collections.defaultdict(list)
for s in STS: grid[(int(s["la"]/CELL), int(s["lo"]/CELL))].append(s)
def hav_m(a, b):
    R = 6371000.0; r = math.radians
    dla, dlo = r(b[0]-a[0]), r(b[1]-a[1])
    x = math.sin(dla/2)**2 + math.cos(r(a[0]))*math.cos(r(b[0]))*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(x))
def near_st(la, lo):
    best = None; ci, cj = int(la/CELL), int(lo/CELL)
    for i in range(ci-2, ci+3):
        for j in range(cj-2, cj+3):
            for s in grid.get((i, j), ()):
                d = hav_m((la, lo), (s["la"], s["lo"]))
                if best is None or d < best[1]: best = (s["n"], d)
    return best

def prep(rows, cap):
    out = []
    for r in rows:
        ns = near_st(r["la"], r["lo"])
        r2 = dict(r); r2["st"] = ns[0] if ns else None; r2["sd"] = int(ns[1]) if ns else 9999
        out.append(r2)
    out.sort(key=lambda x: x["sd"])
    return out[:cap]

shelter = prep(D.get("shelter2", []), 1600)
camera  = prep(D.get("camera", []), 200)
for r in shelter + camera:
    for k in ("ad", "n"): 
        if r.get(k): r[k] = r[k][:34]

# ---------------------------------------------------------- 地価公示 令和8年
LAND = D.get("land2", [])
by_ward, by_sta = collections.defaultdict(list), collections.defaultdict(list)
for r in LAND:
    if not r.get("y"): continue
    if r.get("c"): by_ward[r["c"]].append(r["y"])
    if r.get("st"): by_sta[r["st"]].append(r["y"])
def med(v):
    v = sorted(v); n = len(v)
    return v[n//2] if n % 2 else (v[n//2-1] + v[n//2]) // 2
ward_land = {k: med(v) for k, v in by_ward.items() if len(v) >= 3}
sta_land = {k: {"m": med(v), "n": len(v)} for k, v in by_sta.items() if len(v) >= 1}
print("地価: %d 区 / %d 駅名" % (len(ward_land), len(sta_land)))

io.open("data/tokyo_od2.js", "w", encoding="utf-8").write(
"""/* 東京都オープンデータ 第2弾（自動生成: tools/merge_tokyo_od2.py）

   shelter : 東京都防災マップ 避難所・避難場所（東京都総務局）
   camera  : 河川監視カメラ（建設局）・海面ライブカメラ（港湾局）
   land    : 地価公示 令和8年（東京都財務局）を 区ごと／最寄り駅ごとの中央値にしたもの

   出典: 東京都オープンデータカタログサイト（https://portal.data.metro.tokyo.lg.jp/）
         ライセンス クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）
   ※ 地価は「その駅を最寄りとする標準地の中央値」であり、駅前の価格そのものではありません。
*/
""" + "RG.OD2 = %s;\n" % json.dumps(
    {"shelter": shelter, "camera": camera,
     "landWard": ward_land, "landSta": sta_land, "landN": len(LAND)},
    ensure_ascii=False, separators=(",", ":")))
print("data/tokyo_od2.js", os.path.getsize("data/tokyo_od2.js"), "bytes")

# ---------------------------------------------------------- イベント
EV = json.load(open("/tmp/poi/events.json", encoding="utf-8"))
BIG = re.compile("まつり|祭|花火|フェス|フェア|マラソン|駅伝|博|万博|大会|"
                 "コンサート|ライブ|音楽祭|映画祭|イルミネーション|マルシェ|市$|"
                 "オープン|開館|記念|周年|パレード|展$|美術展|特別展")
MID = re.compile("教室|講座|体験|ワークショップ|上映|コンサート|見学|見学会|ツアー|相談")
SMALL = re.compile("休館|中止|延期|募集|受付|申込|定例|説明会|健診|健康診断")

def scale_of(e):
    """規模の推定スコア（0〜100）。公表値ではなく本アプリの推定。"""
    s = 30
    try:
        d0 = datetime.date.fromisoformat(e["s"]); d1 = datetime.date.fromisoformat(e["e"])
        days = (d1 - d0).days + 1
    except Exception: days = 1
    if days >= 30: s += 28
    elif days >= 8: s += 20
    elif days >= 3: s += 12
    elif days == 2: s += 5
    t = e["n"] + " " + (e.get("d") or "")
    if BIG.search(t): s += 26
    if MID.search(t): s += 6
    if SMALL.search(t): s -= 22
    dl = len(e.get("d") or "")
    if dl > 100: s += 10
    elif dl > 40: s += 5
    if e.get("u"): s += 4
    if "東京都" in (e.get("org") or ""): s += 8       # 都主催は広域向けが多い
    if e.get("la"): s += 4
    return max(0, min(100, s))

today = datetime.date.today()
out = []
for e in EV["events"]:
    try: end = datetime.date.fromisoformat(e["e"])
    except Exception: continue
    if end < today: continue                       # 過去は捨てる
    e2 = dict(e); e2["sc"] = scale_of(e)
    # 何か月先か
    st = datetime.date.fromisoformat(e["s"])
    e2["ma"] = max(0, (st.year - today.year) * 12 + (st.month - today.month))
    out.append(e2)
out.sort(key=lambda x: (x["s"], -x["sc"]))
print("イベント 未来分 %d 件" % len(out))
mm = collections.Counter(x["ma"] for x in out)
print("  何か月先:", sorted(mm.items()))

io.open("data/events.js", "w", encoding="utf-8").write(
"""/* イベント（自動生成: tools/merge_tokyo_od2.py）
   n=名前 s=開始日 e=終了日 p=場所 ad=所在地 d=説明 u=URL f=料金
   la/lo=座標（あるものだけ） org=公開している団体
   sc=規模の推定スコア(0-100) ma=今月から何か月先か

   ■ 表示のきまり（先の月ほど大きなものだけ残す）
     0か月（今月）  … スコア 0 以上（ぜんぶ）
     1か月先        … スコア 40 以上
     2か月先        … スコア 55 以上
     3か月先        … スコア 65 以上
     4か月以上先    … スコア 75 以上
   遠い予定ほど「大きな催しだけ」が残るので、先の予定が細かい行事で埋まりません。

   ■ スコアについて（正直に）
     公開データに「規模」の欄がないため、会期の長さ・名前のことば・説明文の長さ・
     公式ページの有無・主催が都か区か、から本アプリが機械的に推定した値です。
     主催者が公表した規模ではありません。

   出典: 東京都オープンデータカタログサイト（CC BY 4.0）
         %s
   ※ 更新のタイミングは団体ごとに違います。行く前に主催者の公式情報をご確認ください。
*/
""" % "・".join(EV["orgs"]) + "RG.EVENTS = %s;\nRG.EVENT_GATE = [0,40,55,65,75];\n"
      % json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print("data/events.js", os.path.getsize("data/events.js"), "bytes")
for x in out[:8]:
    print("  %s sc=%2d %+dか月 %s" % (x["s"], x["sc"], x["ma"], x["n"][:34]))
