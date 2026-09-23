#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全上場企業の «売上高（5期）・従業員数» を、金融庁 EDINET API から取って data/corp_fin.js を作る。

■ なぜ別ツールか
  EDINET API v2 は無料だが «APIキー» が要る（EDINET のサイトで利用登録 → 数分で発行）。
  公開サイトにキーは置けないので、手元の PC で実行して出来た data/corp_fin.js だけを上げる。

■ 使いかた（Windows / Mac / Linux 共通）
  1) https://api.edinet-fsa.go.jp/ で利用登録し、Subscription Key を取る
  2) 環境変数にセット:  set EDINET_KEY=xxxxxxxx   （Mac/Linux: export EDINET_KEY=xxxxxxxx）
  3) python tools/fetch_edinet_fin.py            … 直近 400 日の有価証券報告書を集める（3,700社 → 1〜2時間、途中再開可）
     python tools/fetch_edinet_fin.py --days 60  … 試しに短い期間だけ
  4) data/corp_fin.js ができる → アップローダーで反映。会社カードとバブルが自動で使う。

■ 取るもの（有価証券報告書 «主要な経営指標等の推移»、連結を優先）
  売上高: jpcrp_cor:NetSalesSummaryOfBusinessResults ほか業種別の要素（下の REV_KEYS）… 当期＋前4期 = 5期
  従業員数: jpcrp_cor:NumberOfEmployees（当期時点）
  営業利益・当期純利益も取れる範囲で入れる（カードの将来拡張用）

■ 出典表示
  金融庁 EDINET（https://disclosure2.edinet-fsa.go.jp/）— 各社の有価証券報告書。
"""
import os, sys, json, time, io, zipfile, csv, datetime, re, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "corp_fin.js")
CACHE = os.path.join(ROOT, ".cache_edinet"); os.makedirs(CACHE, exist_ok=True)
KEY = os.environ.get("EDINET_KEY", "")
API = "https://api.edinet-fsa.go.jp/api/v2"
DAYS = 400
if "--days" in sys.argv: DAYS = int(sys.argv[sys.argv.index("--days") + 1])
if not KEY: sys.exit("環境変数 EDINET_KEY に API キーを入れてください（ファイル冒頭の使いかた参照）")

REV_KEYS = ["NetSalesSummaryOfBusinessResults", "RevenueIFRSSummaryOfBusinessResults", "RevenuesUSGAAPSummaryOfBusinessResults",
            "OperatingRevenue1SummaryOfBusinessResults", "OperatingRevenue2SummaryOfBusinessResults", "OrdinaryIncomeBNKSummaryOfBusinessResults",
            "OrdinaryIncomeINSSummaryOfBusinessResults", "OperatingRevenueSECSummaryOfBusinessResults", "NetSalesOfCompletedConstructionContractsCNSSummaryOfBusinessResults",
            "GrossOperatingRevenueSummaryOfBusinessResults", "BusinessRevenueSummaryOfBusinessResults", "NetSalesAndOperatingRevenue2SummaryOfBusinessResults",
            "OperatingRevenueSummaryOfBusinessResults", "SalesSummaryOfBusinessResults"]
OP_KEYS = ["OperatingIncomeSummaryOfBusinessResults", "OperatingIncomeLossSummaryOfBusinessResults", "OrdinaryIncomeLossSummaryOfBusinessResults"]
NI_KEYS = ["ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults", "NetIncomeLossSummaryOfBusinessResults", "ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults"]
EMP_KEYS = ["NumberOfEmployees"]

def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "tokyostation-edinet/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read() if binary else json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))

def list_day(d):
    f = os.path.join(CACHE, "list_%s.json" % d)
    if os.path.exists(f): return json.load(open(f, encoding="utf-8"))
    j = get(API + "/documents.json?date=%s&type=2&Subscription-Key=%s" % (d, KEY))
    json.dump(j, open(f, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(0.4)
    return j

def fetch_csv(docid):
    f = os.path.join(CACHE, docid + ".zip")
    if not os.path.exists(f):
        b = get(API + "/documents/%s?type=5&Subscription-Key=%s" % (docid, KEY), binary=True)
        open(f, "wb").write(b); time.sleep(0.4)
    try:
        z = zipfile.ZipFile(f)
    except zipfile.BadZipFile:
        return None
    rows = []
    for n in z.namelist():
        if not n.lower().endswith(".csv") or "/jpcrp" not in n and not os.path.basename(n).startswith("jpcrp"): continue
        raw = z.read(n)
        txt = raw.decode("utf-16", errors="ignore") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8", errors="ignore")
        rd = csv.reader(io.StringIO(txt), delimiter="\t")
        for r in rd:
            if len(r) >= 9: rows.append(r)
    return rows

def pick(rows, keys, ctx_re, prefer_cons=True):
    """rows: [要素ID, 項目名, コンテキストID, 相対年度, 連結・個別, 期間・時点, ユニットID, 単位, 値]"""
    for k in keys:
        cand = [r for r in rows if r[0].endswith(":" + k) and re.match(ctx_re, r[2]) and re.match(r"^-?\d", (r[8] or "").replace(",", ""))]
        if not cand: continue
        cons = [r for r in cand if "連結" in r[4]]
        use = cons if (prefer_cons and cons) else cand
        return use
    return []

def year_of(ctx, period_end):
    m = re.match(r"(Current|Prior(\d))Year", ctx)
    if not m: return None
    back = int(m.group(2)) if m.group(2) else 0
    return period_end.year - back

def main():
    fin = {}
    if os.path.exists(OUT):   # 再開できるように、前回の結果を読む
        m = re.search(r"RG\.CORP_FIN = (\{.*\});", open(OUT, encoding="utf-8").read(), re.S)
        if m: fin = json.loads(m.group(1))
    today = datetime.date.today()
    seen = set()
    for i in range(DAYS):
        d = (today - datetime.timedelta(days=i)).isoformat()
        try: j = list_day(d)
        except Exception as e:
            print("skip", d, e); continue
        for r in j.get("results", []):
            if r.get("docTypeCode") != "120" or not r.get("secCode") or r.get("csvFlag") != "1": continue
            code = str(r["secCode"])[:4]
            if code in seen or code in fin: continue          # 最新（日付の新しい順に見ている）だけ
            seen.add(code)
            try:
                rows = fetch_csv(r["docID"])
            except Exception as e:
                print("fail", code, r["docID"], e); continue
            if not rows: continue
            pe = datetime.date.fromisoformat(r["periodEnd"]) if r.get("periodEnd") else datetime.date.fromisoformat(d)
            def series(keys):
                out = {}
                for row in pick(rows, keys, r"^(Current|Prior[1-4])YearDuration"):
                    y = year_of(row[2], pe)
                    if y and y not in out: out[y] = int(float(row[8].replace(",", "")))
                return sorted([[y, v] for y, v in out.items()])
            rev, op, ni = series(REV_KEYS), series(OP_KEYS), series(NI_KEYS)
            emp = None
            e = pick(rows, EMP_KEYS, r"^CurrentYearInstant")
            if e: emp = [pe.year, int(float(e[0][8].replace(",", "")))]
            fin[code] = {"pe": pe.isoformat(), "doc": r["docID"], "n": r.get("filerName")}
            if rev: fin[code]["rev"] = rev
            if op: fin[code]["op"] = op
            if ni: fin[code]["ni"] = ni
            if emp: fin[code]["emp"] = emp
            print(d, code, r.get("filerName"), "rev", len(rev), "emp", emp)
        if i % 10 == 9: save(fin)
    save(fin)

def save(fin):
    hdr = ("/* 上場企業の売上高（5期）・従業員数（自動生成: tools/fetch_edinet_fin.py）\n"
           "   出典: 金融庁 EDINET の有価証券報告書「主要な経営指標等の推移」。連結を優先。単位は円・人。\n"
           "   キー=証券コード4桁。pe=決算期末 doc=書類ID rev=[[年,売上高],…] op=営業利益 ni=親会社株主帰属利益 emp=[年,従業員数]\n"
           "   作成日: %s */\n" % datetime.date.today().isoformat())
    open(OUT, "w", encoding="utf-8").write(hdr + "RG.CORP_FIN = " + json.dumps(fin, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("saved", OUT, len(fin), "社")

if __name__ == "__main__":
    main()
