# -*- coding: utf-8 -*-
"""
«話題の場所» の自動更新（v114・GitHub Actions で毎朝 5 時）→ data/auto/buzz_auto.js

■ 何をするか
  Google トレンド（日本・急上昇ワード）の RSS と、ワードごとに付いているニュース記事、
  Google ニュースの検索（«SNSで話題» など・ここ 3 日）の記事の見出しを読み、
  サイトが持っている «場所の名前»（絶景・温泉・城・一之宮・主な神社・23区ランドマーク・主要駅）が出てくるものだけを拾う。
  X の投稿を探すには有料の API が要るので、ここでは «検索で急上昇 ＋ ニュース記事» を根拠にする（SNS の投稿ではない）。
■ 誤って拾わないために
  ・急上昇ワードそのものが場所の名前 → 採用
  ・ニュースの見出しに名前が出るだけ → 3 文字以上の名前だけ。駅は «〇〇駅» と書かれているときだけ（人の名字と同じ駅名が多い）
■ 残し方
  前の分と合わせ、21 日より古いものは落とす。見出しはニュースの見出し（引用・リンク）で、本文は転載しない
■ v134: 土地ごとの «話題のストック»（各都道府県・東京は 23 区ごと＋多摩・島しょ、それぞれ 50 件）→ data/auto/buzz_stock/<コード>.js
  ・動くたびに全 70 か所の «〇〇県 話題» などのニュース検索を回す（1 回 7 分ほど）。BUZZ_AREAS_PER_RUN で 1 回の数を減らし順番に回すこともできる
  ・熱さ heat = インパクト + 1.5×log2(1+何度も話題になった回数)。鮮度は «最後に話題になった日» から半減（ふつう 3 日・激アツは 45 日）
  ・1 か所 50 件のうち 20 件までは «ここ 7 日の新しい話題» の枠。残りは熱い順 → 激アツはすぐには落ちない
  ・50 件から外れた分は data/auto/buzz_archive.js へ（場所を追ったときに «過去の話題» として見られる）
  python tools/auto_buzz.py
"""
import math
import json, os, re, sys, io, time, hashlib, datetime, urllib.request, urllib.parse, xml.etree.ElementTree as ET
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "auto", "buzz_auto.js")
ARC = os.path.join(ROOT, "data", "auto", "buzz_archive.js")   # v126: 21 日を過ぎて落ちた分を残す（場所で追うときの «過去の話題»）
ARC_MAX = 6000
RSS = "https://trends.google.com/trending/rss?geo=JP"
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/)"
KEEP_DAYS = 21
STOCK_DIR = os.path.join(ROOT, "data", "auto", "buzz_stock")
STOCK_MAX, FRESH_SLOTS, FRESH_WIN = 50, 20, 7          # 1 か所 50 件・うち «ここ 7 日» の枠 20 件
AREAS_PER_RUN = int(os.environ.get("BUZZ_AREAS_PER_RUN") or 99)   # 1 回に回る土地の数（ふだんは全部。3 時間ごとに動かすなら 9 などに）
AUTO_MAX = 400                                          # buzz_auto.js（地図・レール用の «いま»）は熱い順にここまで
PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split()
TAMA = "東京都（多摩・島しょ）"
NEWSQ = ["「SNSで話題」", "話題 行列 観光", "新スポット オープン 話題", "インスタ映え スポット"]   # Google ニュースの検索（ここ 3 日）
NS = {"ht": "https://trends.google.com/trending/rss"}
STOP = set("日本 東京 中央 本町 北口 南口 東口 西口 大学 公園 駅前 市役所 新町 本郷 中町 元町 栄町 旭町 若松 平和 青葉 桜 緑 泉 港 寿 宮 京".split())


def js_data(path, var):
    """data/*.js の «RG.XXX = [...];» を読む"""
    s = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    if not m:
        return []
    dec = json.JSONDecoder()
    return dec.raw_decode(s[m.end():])[0]


def gazetteer():
    G = []                                                     # (名前, 緯度, 経度, 都道府県, 種類)
    for path, var, kind in (("data/views_jp.js", "VIEWS_JP", "絶景"), ("data/onsen_jp.js", "ONSEN_JP", "温泉"), ("data/castles.js", "CASTLES", "城"),
                            ("data/ichinomiya.js", "ICHINOMIYA", "一之宮")):
        for r in js_data(path, var):
            if r.get("n") and r.get("la") is not None and r.get("pf"):
                G.append((r["n"], r["la"], r["lo"], r["pf"], kind))
    for r in js_data("data/landmarks.js", "LANDMARKS_TOP"):
        G.append((r["n"], r["la"], r["lo"], "東京都", "ランドマーク"))
    ref = [(g[1], g[2], g[3]) for g in G]

    def pf_of(la, lo):                                          # いちばん近い «都道府県の分かっている点» の都道府県
        return min(ref, key=lambda r: (r[0] - la) ** 2 + ((r[1] - lo) * 0.8) ** 2)[2]
    for path, var in (("data/shrines_jp.js", "SHRINE_MAJOR"), ("data/shrines_jp.js", "TEMPLE_MAJOR")):
        for r in js_data(path, var):
            if r.get("n"):
                G.append((r["n"], r["la"], r["lo"], pf_of(r["la"], r["lo"]), "社寺"))
    net = json.load(open(os.path.join(ROOT, "data", "net.json"), encoding="utf-8"))
    seen = set()
    for s in net["stations"]:
        if len(s) > 8 and isinstance(s[8], (int, float)) and s[8] >= 30000 and s[1] not in seen:
            seen.add(s[1]); G.append((s[1], s[2], s[3], pf_of(s[2], s[3]), "駅"))
    return [g for g in G if len(g[0]) >= 2 and g[0] not in STOP]


def imp_of(traffic):
    n = int(re.sub(r"[^0-9]", "", traffic or "0") or 0)
    return 3 if n >= 50000 else 2 if n >= 5000 else 1              # 自動のものは «殿堂»（4 以上）に残さない


def main():
    G = gazetteer()
    G.sort(key=lambda g: -len(g[0]))                            # 長い名前から（«新宿御苑» を «新宿» より先に）
    req = urllib.request.Request(RSS, headers={"User-Agent": UA})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=60).read())
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    new = []
    for it in root.iter("item"):
        kw = (it.findtext("title") or "").strip()
        traffic = it.findtext("ht:approx_traffic", default="", namespaces=NS)
        news = [(n.findtext("ht:news_item_title", default="", namespaces=NS), n.findtext("ht:news_item_url", default="", namespaces=NS),
                 n.findtext("ht:news_item_source", default="", namespaces=NS)) for n in it.findall("ht:news_item", NS)]
        hit = None
        for g in G:
            name = g[0]
            if kw == name or kw == name + "駅" or (len(name) >= 3 and name in kw):
                hit = g; break
        if not hit:
            for g in G:
                name = g[0]
                pat = name + "駅" if g[4] == "駅" else name
                if (len(name) >= 3 or g[4] == "駅") and any(pat in (t or "") for t, _, _ in news):
                    hit = g; break
        if not hit or not news:
            continue
        t0, u0, s0 = next(((t, u, s) for t, u, s in news if hit[0] in (t or "")), news[0])
        if not u0:
            continue
        new.append({"id": "gt" + hashlib.sha1(u0.encode("utf-8")).hexdigest()[:10], "d": today, "pf": hit[3], "n": (t0 or kw)[:80],
                    "pl": "news", "url": u0, "by": s0, "la": round(hit[1], 5), "lo": round(hit[2], 5), "imp": imp_of(traffic),
                    "at": hit[0], "ev": "Google で急上昇（«%s»・検索 %s 回以上）" % (kw, traffic.replace("+", "")),
                    "src": "https://trends.google.com/trending?geo=JP"})
        print("＋", hit[0], "(" + hit[4] + ")", "←", kw, "|", (t0 or "")[:50])
    # Google ニュースの検索（見出しに場所の名前が出てくるもの）
    for q in NEWSQ:
        u = "https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:3d") + "&hl=ja&gl=JP&ceid=JP:ja"
        try:
            rr = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read())
        except Exception as e:
            print("ニュースを読めませんでした:", q, e); continue
        for it in rr.iter("item"):
            title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
            src = (it.findtext("source") or "").strip()
            head = re.sub(r"\s+-\s+[^-]+$", "", title)                    # «見出し - 媒体名» の媒体名を外す
            hit = None
            for g in G:
                name = g[0]
                pat = name + "駅" if g[4] == "駅" else name
                if (len(name) >= 3 or g[4] == "駅") and pat in head:
                    hit = g; break
            if not hit or not link:
                continue
            new.append({"id": "gn" + hashlib.sha1(link.encode("utf-8")).hexdigest()[:10], "d": today, "pf": hit[3], "n": head[:80],
                        "pl": "news", "url": link, "by": src, "la": round(hit[1], 5), "lo": round(hit[2], 5), "imp": 1,
                        "at": hit[0], "ev": "ニュースで話題（Google ニュース «%s»）" % q, "src": "https://news.google.com/"})
            print("＋", hit[0], "(" + hit[4] + ")", "←", head[:60])
        time.sleep(2)
    new = cluster(new)
    new += area_news(G)
    stock(new, today)


def norm(t):
    return re.sub(r"[\s\u3000「」『』【】（）()・、。！!？?:：\-－—|｜]", "", t or "")


def sim(a, b):
    """見出しの似かた（2 文字ずつの重なり）"""
    A = {a[i:i + 2] for i in range(len(a) - 1)}; B = {b[i:i + 2] for i in range(len(b) - 1)}
    return len(A & B) / max(1, len(A | B))


def cluster(items):
    """同じ回に同じ場所の話題が何本も来たら 1 件にまとめ、回数（m）を数える"""
    out = []
    for b in items:
        b.setdefault("m", 1); b.setdefault("ld", b["d"])
        if any(o["id"] == b["id"] for o in out):                  # 同じ記事（別の検索で重ねて来た）は数えない
            continue
        hit = next((o for o in out if o["at"] == b["at"] and sim(norm(o["n"]), norm(b["n"])) >= 0.45), None)
        if hit:
            hit["m"] += 1; hit["imp"] = max(hit["imp"], b["imp"])
        else:
            out.append(b)
    return out


def js_list(path, var):
    if not os.path.exists(path):
        return []
    s = open(path, encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    return json.JSONDecoder().raw_decode(s[m.end():])[0] if m else []


WARDS = None


def area_of(b):
    """話題の «土地»: 都道府県（東京は 23 区ごと＋多摩・島しょ）"""
    global WARDS
    if WARDS is None:
        WARDS = js_data("data/buzz.js", "WARD_CENTER")
    pf = b.get("pf") or ""
    if pf != "東京都":
        return pf if pf in PREFS else ""
    for w in WARDS:                                            # 見出しに区の名前が出ていればその区
        if w in (b.get("n") or ""):
            return w
    la, lo = b.get("la"), b.get("lo")
    if la is None:
        return TAMA
    w, d = min(((w, math.hypot(c[0] - la, (c[1] - lo) * 0.81)) for w, c in WARDS.items()), key=lambda x: x[1])
    return w if d < 0.045 and lo > 139.56 else TAMA           # 区の中心から約 5km 以内・多摩より東


def area_list():
    global WARDS
    if WARDS is None:
        WARDS = js_data("data/buzz.js", "WARD_CENTER")
    return [p for p in PREFS if p != "東京都"] + list(WARDS.keys()) + [TAMA]


def area_code(a):
    if a in PREFS:
        return "%02d" % (PREFS.index(a) + 1)
    if a == TAMA:
        return "13-tama"
    return "13-%02d" % (list(WARDS.keys()).index(a) + 1)


def area_news(G):
    """v134: 順番に 9 か所ずつ «〇〇 話題» のニュース検索（見出しにその土地の名前か、土地の中の場所の名前が出るものだけ）"""
    A = area_list()
    PC, WC = js_data("data/buzz.js", "PREF_CENTER"), WARDS
    slot = int(time.time() // (3 * 3600))
    n = max(1, math.ceil(len(A) / AREAS_PER_RUN))
    pick = A[(slot % n) * AREAS_PER_RUN:(slot % n + 1) * AREAS_PER_RUN]
    if not os.path.exists(os.path.join(STOCK_DIR, "index.js")) or os.environ.get("BUZZ_ALL"):   # はじめての回は全部の土地を回る
        pick = A
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    out = []
    for a in pick:
        name = "東京都 多摩" if a == TAMA else a
        places = [g for g in G if (g[3] == a) or (a in WC and g[3] == "東京都" and area_of({"pf": "東京都", "la": g[1], "lo": g[2], "n": ""}) == a)
                  or (a == TAMA and g[3] == "東京都" and area_of({"pf": "東京都", "la": g[1], "lo": g[2], "n": ""}) == TAMA)]
        got = 0
        for q in ('"%s" 話題' % name, '"%s" オープン OR 行列 OR 人気' % name):
            u = "https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:7d") + "&hl=ja&gl=JP&ceid=JP:ja"
            try:
                rr = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read())
            except Exception as e:
                print("ニュースを読めませんでした:", q, e); continue
            for it in rr.iter("item"):
                title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
                src = (it.findtext("source") or "").strip()
                head = re.sub(r"\s+-\s+[^-]+$", "", title)
                if not link or not head:
                    continue
                hit = next((g for g in places if len(g[0]) >= 3 and g[0] in head), None)
                key = a if a != TAMA else "多摩"
                if not hit and key not in head:
                    continue
                if not GOOD.search(head) or BAD.search(head):           # «話題» らしい見出しだけ（事件・事故・行政の記事は拾わない）
                    continue
                if a == "京都府" and re.search(r"東京都", head) and "京都府" not in head:
                    continue
                c = (hit[1], hit[2]) if hit else (WC.get(a) or PC.get(a) or PC.get("東京都"))
                out.append({"id": "ga" + hashlib.sha1(link.encode("utf-8")).hexdigest()[:10], "d": today, "pf": "東京都" if (a in WC or a == TAMA) else a,
                            "n": head[:80], "pl": "news", "url": link, "by": src, "la": round(c[0], 5), "lo": round(c[1], 5), "imp": 1,
                            "at": hit[0] if hit else key, "ev": "ニュースで話題（Google ニュース «%s»）" % q, "src": "https://news.google.com/", "w": a if (a in WC) else None})
                got += 1
                if got >= 30:
                    break
            time.sleep(2)
        print("・%s: %d 件" % (a, got))
    for b in out:
        if not b["w"]:
            del b["w"]
    return cluster(out)


GOOD = re.compile(r"話題|人気|行列|オープン|開業|新店|初出店|SNS|バズ|映え|絶景|限定|復活|注目|反響|祭|フェス|イベント|見頃|開花|紅葉|グルメ|スポット|名店|ランキング|行ってみた|おでかけ|観光|聖地|新名所|リニューアル|撮影")
BAD = re.compile(r"事故|死亡|死去|逮捕|容疑|被害|豪雨|地震|火災|殺|詐欺|議会|知事|市長|選挙|予算|訃報|不祥事|違反|裁判|判決|感染|休校|停電|警報|倒産")


def heat(b):
    return (b.get("imp") or 1) + 1.5 * math.log2(1 + (b.get("m") or 1))


def score(b, today):
    last = (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(b.get("ld") or b["d"])).days
    h = heat(b)
    return h * 0.5 ** (max(0, last) / (45.0 if h >= 4 else 3.0))


def stock(new, today):
    """v134: 土地ごと 50 件のストックを作り直す。buzz_auto.js（いま）と buzz_archive.js（外れた分）も書く"""
    os.makedirs(STOCK_DIR, exist_ok=True)
    idx = js_list(os.path.join(STOCK_DIR, "index.js"), "BUZZ_STOCK_INDEX")
    old = {}
    for a in area_list():
        old[a] = js_list(os.path.join(STOCK_DIR, area_code(a) + ".js"), "BUZZ_STOCK_ONE")
    if not idx:                                                    # はじめて: いまある自動収集と過去の分をたねにする
        for b in js_list(OUT, "BUZZ_AUTO") + js_list(ARC, "BUZZ_ARCHIVE"):
            a = area_of(b)
            if a:
                b.setdefault("m", 1); b.setdefault("ld", b["d"]); old[a].append(b)
    for b in new:
        a = area_of(b)
        if not a:
            continue
        L = old[a]
        hit = next((o for o in L if o["id"] == b["id"] or (o.get("at") == b.get("at") and sim(norm(o["n"]), norm(b["n"])) >= 0.45)), None)
        if hit:                                                    # また話題になった → 回数を足し、最後に話題になった日を今日に
            if b["id"] != hit["id"]:                                # 別の記事でも同じ話題 → 回数を足す（同じ記事の再掲は数えない）
                hit["m"] = (hit.get("m") or 1) + (b.get("m") or 1)
            hit["ld"] = today; hit["imp"] = max(hit.get("imp") or 1, b.get("imp") or 1)
        else:
            L.append(b)
    dropped, index, now_all = [], {}, []
    for a in area_list():
        seen, L = set(), []
        for b in old[a]:
            if b["id"] in seen:
                continue
            seen.add(b["id"]); b["h"] = round(heat(b), 2); b["sc"] = round(score(b, today), 3); L.append(b)
        fresh = sorted([b for b in L if (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(b["d"])).days <= FRESH_WIN],
                       key=lambda b: -b["sc"])[:FRESH_SLOTS]
        rest = sorted([b for b in L if b not in fresh], key=lambda b: -b["sc"])
        keep = fresh + rest[:STOCK_MAX - len(fresh)]
        dropped += [b for b in L if b not in keep]
        keep.sort(key=lambda b: -b["sc"])
        if a in WARDS or a == TAMA:                                # 東京の土地は区（多摩・島しょ）を書いておく（画面の «土地» と合わせる）
            for x in keep:
                x["w"] = a
        now_all += keep
        code = area_code(a)
        index[a] = {"f": code, "n": len(keep), "hot": sum(1 for b in keep if b["h"] >= 4), "new": sum(1 for b in keep if b.get("ld") == today)}
        open(os.path.join(STOCK_DIR, code + ".js"), "w", encoding="utf-8").write(
            "/* «話題のストック» %s（tools/auto_buzz.py・自動更新）最終更新 %s。熱い順・最大 %d 件。見出しはニュースの見出し（引用）*/\n"
            "RG.BUZZ_STOCK = RG.BUZZ_STOCK || {};\nRG.BUZZ_STOCK_ONE = %s;\nRG.BUZZ_STOCK[%s] = RG.BUZZ_STOCK_ONE;\n"
            % (a, today, STOCK_MAX, json.dumps(keep, ensure_ascii=False, separators=(",", ":")), json.dumps(a, ensure_ascii=False)))
    open(os.path.join(STOCK_DIR, "index.js"), "w", encoding="utf-8").write(
        "/* «話題のストック» の目次（土地 → ファイル・件数・激アツの数・今日の新着）最終更新 %s */\nRG.BUZZ_STOCK_INDEX = %s;\n"
        % (today, json.dumps(index, ensure_ascii=False, separators=(",", ":"))))
    archive(dropped)
    lim = (datetime.date.fromisoformat(today) - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    cur = sorted([b for b in now_all if (b.get("ld") or b["d"]) >= lim], key=lambda b: -b["sc"])[:AUTO_MAX]
    cur.sort(key=lambda b: b["d"], reverse=True)
    js = ("/* «話題の場所» の自動更新（tools/auto_buzz.py・GitHub Actions で自動）最終更新 %s\n"
          "   Google トレンドの急上昇ワード（日本）と、土地ごとのニュース検索のうち、ここ %d 日に話題になったもの（熱い順に %d 件まで）。SNS の投稿ではない\n"
          "   見出しはニュースの見出し（引用）・url は記事。土地ごと 50 件のストックは data/auto/buzz_stock/ */\n"
          "RG.BUZZ_AUTO = %s;\n") % (today, KEEP_DAYS, AUTO_MAX, json.dumps(cur, ensure_ascii=False, separators=(",", ":")))
    open(OUT, "w", encoding="utf-8").write(js)
    print("→ ストック %d か所・合計 %d 件（激アツ %d）／ buzz_auto.js %d 件" % (len(index), len(now_all), sum(v["hot"] for v in index.values()), len(cur)))


def archive(dropped):
    """v126: 落ちた分を data/auto/buzz_archive.js に足す（id と見出しで重複をまとめ、新しい順に ARC_MAX 件まで）"""
    arc = []
    if os.path.exists(ARC):
        s = open(ARC, encoding="utf-8").read()
        m = re.search(r"RG\.BUZZ_ARCHIVE\s*=\s*", s)
        if m:
            arc = json.JSONDecoder().raw_decode(s[m.end():])[0]
    ids, heads, out = set(), set(), []
    for b in dropped + arc:
        if b["id"] in ids or b["n"] in heads:
            continue
        ids.add(b["id"]); heads.add(b["n"]); out.append(b)
    out.sort(key=lambda b: b["d"], reverse=True)
    out = out[:ARC_MAX]
    js = ("/* «話題の場所» の過去の分（tools/auto_buzz.py）。毎朝の自動収集で 21 日を過ぎたものをここに残す\n"
          "   場所を追ったとき（駅・スポットのカードの «この場所の話題»）だけ読み込む。見出しはニュースの見出し（引用）・url は記事 */\n"
          "RG.BUZZ_ARCHIVE = %s;\n") % json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    open(ARC, "w", encoding="utf-8").write(js)
    if dropped:
        print("→ data/auto/buzz_archive.js ＋%d 件・合計 %d 件" % (len(dropped), len(out)))


if __name__ == "__main__":
    main()
