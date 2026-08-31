# -*- coding: utf-8 -*-
"""
カレンダー用のデータを作る。

■ 六曜（data/koyomi.js の ROKU）
  旧暦の «月＋日» を6で割った余りで決まる。
  先勝 → 友引 → 先負 → 仏滅 → 大安 → 赤口 の順に毎日進み、
  旧暦の月が変わるとリセットされる。旧暦の元日は必ず «先勝» になる（検証ずみ）。
  旧暦への変換は lunardate を使い、日付ごとに1文字（0〜5）で持たせて軽くする。

■ 今日は何の日（data/koyomi.js の HIMEKURI）
  Wikipedia 日本語版の「◯月◯日」の記事から、
  「できごと」と「記念日・年中行事」を抜き出す。
  文章は CC BY-SA 4.0 なので、画面に出典と記事へのリンクを必ず出す。
"""
import json, io, os, re, time, urllib.request, urllib.parse
from datetime import date, timedelta
from lunardate import LunarDate

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
UA = {"User-Agent": "tokyo-station-guide/31 (school free-research project)"}

# ---------------------------------------------------------------- 六曜
ROKU = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"]
START = date(2024, 1, 1)
END = date(2032, 12, 31)
buf = []
d = START
while d <= END:
    l = LunarDate.from_solar_date(d.year, d.month, d.day)
    buf.append(str((l.month + l.day) % 6))
    d += timedelta(days=1)
roku = "".join(buf)
print("六曜 %d 日ぶん（%s 〜 %s）" % (len(roku), START, END))

# ---------------------------------------------------------------- 祝日
# 内閣府の祝日CSVを取る（無ければ空でも動く）
HOL = {}
try:
    u = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv"
    raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
    for enc in ("cp932", "utf-8"):
        try: txt = raw.decode(enc); break
        except Exception: txt = ""
    for line in txt.splitlines()[1:]:
        p = line.split(",")
        if len(p) < 2: continue
        try:
            y, m, dd = [int(x) for x in p[0].split("/")]
            HOL["%04d%02d%02d" % (y, m, dd)] = p[1].strip()
        except Exception: pass
    print("祝日 %d 件（出典: 内閣府）" % len(HOL))
except Exception as e:
    print("祝日の取得に失敗:", e)

# ---------------------------------------------------------------- 今日は何の日
API = "https://ja.wikipedia.org/w/api.php"
def wikitext(titles):
    out = {}
    for k in range(0, len(titles), 12):
        ch = titles[k:k + 12]
        p = {"action": "query", "format": "json", "formatversion": "2",
             "prop": "revisions", "rvprop": "content", "rvslots": "main",
             "titles": "|".join(ch)}
        for a in range(4):
            try:
                u = API + "?" + urllib.parse.urlencode(p)
                d2 = json.loads(urllib.request.urlopen(
                    urllib.request.Request(u, headers=UA), timeout=90).read())
                for pg in d2.get("query", {}).get("pages", []):
                    if pg.get("missing"): continue
                    c = pg["revisions"][0]["slots"]["main"]["content"]
                    out[pg["title"]] = c
                break
            except Exception:
                time.sleep(8)
        time.sleep(0.6)
        if (k // 12) % 5 == 0: print("   ", k, "/", len(titles))
    return out

def clean(s):
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"</?[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"\s+", " ", s).strip(" -*：:、")
    return s

def section(text, names):
    for nm in names:
        m = re.search(r"^==+\s*" + re.escape(nm) + r"\s*==+\s*$", text, flags=re.M)
        if not m: continue
        rest = text[m.end():]
        e = re.search(r"^==[^=]", rest, flags=re.M)
        return rest[:e.start()] if e else rest
    return ""

titles = []
for m in range(1, 13):
    dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    for dd in range(1, dim + 1):
        titles.append("%d月%d日" % (m, dd))
print("Wikipedia の日付記事:", len(titles), "本")
pages = wikitext(titles)
print("取得:", len(pages))

HIME = {}
for t, c in pages.items():
    m = re.match(r"(\d+)月(\d+)日", t)
    if not m: continue
    key = "%02d%02d" % (int(m.group(1)), int(m.group(2)))
    ev, an = [], []
    for line in section(c, ["できごと", "出来事"]).splitlines():
        if not line.startswith("*"): continue
        s = clean(line)
        if len(s) < 8 or len(s) > 110: continue
        ev.append(s)
    for line in section(c, ["記念日・年中行事", "記念日", "年中行事"]).splitlines():
        if not line.startswith("*"): continue
        s = clean(line)
        if len(s) < 5 or len(s) > 110: continue
        an.append(s)
    o = {}
    if ev: o["e"] = ev[-6:]          # 新しいできごとを優先
    if an: o["a"] = an[:5]
    if o: HIME[key] = o

io.open("data/koyomi.js", "w", encoding="utf-8").write(
"""/* こよみのデータ（自動生成: tools/build_koyomi.py）

   ROKU      六曜。%s から1日ずつ、0〜5 の数字が1文字ずつ並んでいる。
             0=大安 1=赤口 2=先勝 3=友引 4=先負 5=仏滅
             旧暦の «月＋日» を6で割った余り。旧暦の元日は必ず先勝になる。
   ROKU_FROM  ROKU の1文字目が表す日
   HOLIDAY   祝日（出典: 内閣府「国民の祝日について」）
   HIMEKURI  「今日は何の日」。e=できごと a=記念日・年中行事
             出典: Wikipedia 日本語版「◯月◯日」（CC BY-SA 4.0）
             ※ 文章は要約・整形しています。正確な記述は元記事をご覧ください。
*/
""" % START + "RG.ROKU_NAMES = %s;\nRG.ROKU_FROM = \"%s\";\nRG.ROKU = \"%s\";\nRG.HOLIDAY = %s;\nRG.HIMEKURI = %s;\n"
      % (json.dumps(ROKU, ensure_ascii=False), START.strftime("%Y-%m-%d"), roku,
         json.dumps(HOL, ensure_ascii=False, separators=(",", ":")),
         json.dumps(HIME, ensure_ascii=False, separators=(",", ":"))))

print("できごと %d 日ぶん / 記念日 %d 日ぶん / %d bytes"
      % (sum(1 for v in HIME.values() if v.get("e")),
         sum(1 for v in HIME.values() if v.get("a")),
         os.path.getsize("data/koyomi.js")))
for k in ["0831", "0101", "0505"]:
    v = HIME.get(k, {})
    print("  %s できごと:%s" % (k, (v.get("e") or ["-"])[0][:56]))
