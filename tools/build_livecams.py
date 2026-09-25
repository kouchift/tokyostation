# -*- coding: utf-8 -*-
"""
公開ライブカメラ（YouTube）の収集・検証・マージ（v105）— PC で回す道具

data/cams_jp.js（RG.CAMS_JP）を «配信者本人が公開している公開風景のライブ» で増やす／保つためのツール。
架空の ID は作らない。すべて YouTube の oEmbed（キー不要）で «実在» を確認してから入れる。

収録の線引き（build_livecams はこれを守る前提で使う）:
  ○ 配信者本人が YouTube で公開している、公道・観光地・港・山・河川・空港・鉄道・動物園などの «公開風景»
  × パスワード放置の晒しカメラ・他社カメラの無断中継、他人の私的空間（住居内など）、盗撮的なもの、アダルト

使い方（Windows なら py、mac/linux は python3）:
  1) 手持ちのリストをまとめて検証して追加（一番よく使う）
       py tools/build_livecams.py --from-list mylist.tsv
     mylist.tsv は 1 行 1 カメラ、タブ区切り:
       名称<TAB>緯度<TAB>経度<TAB>種類<TAB>都道府県<TAB>配信元<TAB>YouTubeのURLかID[<TAB>メモ]
     例:
       石垣港ライブ	24.34	124.16	港	沖縄県	石垣市観光協会	https://youtu.be/xxxxxxxxxxx
     --go を付けるまでは «下見»（検証結果を表示するだけ・ファイルは書き換えない）。
       py tools/build_livecams.py --from-list mylist.tsv --go

  2) いまの cams_jp.js を再点検（配信が消えた ID を洗い出す）
       py tools/build_livecams.py --verify

  3) キーワードで «いま配信中» を探す（YouTube Data API の無料キーが要る。環境変数 YT_API_KEY）
       set YT_API_KEY=xxxx   （mac/linux は export）
       py tools/build_livecams.py --discover "ライブカメラ 港" --live
     見つかった候補（ID・題名・配信者）を表示するので、良いものを 1) の TSV に足す。

注意: 24h 配信は再起動で «動画ID» が変わることがある。安定させたいものは、その配信の «チャンネルID»（UCxxxx）を
      ch 欄に入れておくと、サイト側が embed/live_stream?channel= で «いま配信中» を指す（tools/build_livecams は
      --from-list の 8 列目に UCxxxx を書ければ ch として保存する）。
"""
import os, sys, io, json, re, time, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMS = os.path.join(ROOT, "data", "cams_jp.js")
UA = "Mozilla/5.0 (tsg-livecams)"

def yid(u):
    """URL でも ID でも受け取り、11 桁の動画IDを返す（取り出せなければ None）"""
    u = (u or "").strip()
    if re.fullmatch(r"[\w-]{11}", u):
        return u
    m = re.search(r"(?:v=|youtu\.be/|/live/|/embed/)([\w-]{11})", u)
    return m.group(1) if m else None

def oembed(video_id):
    """oEmbed で実在確認。返り値 {title, author_name, author_url} か None"""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
        "https://www.youtube.com/watch?v=" + video_id, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return None if e.code in (401, 403, 404) else {"__err": e.code}
    except Exception:
        return {"__err": "net"}

def load_cams():
    txt = io.open(CAMS, encoding="utf-8").read()
    m = re.search(r"RG\.CAMS_JP\s*=\s*(\[.*\])\s*;", txt, re.S)
    head = txt[:m.start()]
    arr = json.loads(m.group(1))
    return head, arr, txt

def write_cams(head, arr):
    out = head + "RG.CAMS_JP = " + json.dumps(arr, ensure_ascii=False, separators=(",", ":")) + ";\n"
    io.open(CAMS, "w", encoding="utf-8").write(out)

def cmd_verify():
    _, arr, _ = load_cams()
    dead, err, ok = [], [], 0
    for c in arr:
        vid = c.get("yt")
        if not vid:
            continue  # ch だけの項目は oEmbed 不可（チャンネルの現行ライブに追従）
        r = oembed(vid)
        if r is None:
            dead.append(c)
        elif r.get("__err"):
            err.append((c, r["__err"]))
        else:
            ok += 1
        time.sleep(0.15)
    print("生存 %d / 消えた %d / 確認できず %d" % (ok, len(dead), len(err)))
    for c in dead:
        print("  × 消えた:", c["n"], c.get("yt"), "（", c.get("by"), "）")
    for c, e in err:
        print("  ? 確認できず(%s):" % e, c["n"], c.get("yt"))
    if dead:
        print("\n消えたものは data/cams_jp.js から手で消すか、ch 欄に配信者のチャンネルID(UC…)を入れて追従させてください。")

def cmd_from_list(path, go):
    head, arr, _ = load_cams()
    have = set(c.get("yt") for c in arr if c.get("yt")) | set(c.get("ch") for c in arr if c.get("ch"))
    add, skip = [], []
    for ln in io.open(path, encoding="utf-8"):
        ln = ln.rstrip("\n")
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue
        f = ln.split("\t")
        if len(f) < 7:
            skip.append((ln, "列が足りません(7列以上)")); continue
        n, la, lo, k, p, by, link = [x.strip() for x in f[:7]]
        note = f[7].strip() if len(f) > 7 else ""
        ch = f[8].strip() if len(f) > 8 and f[8].strip().startswith("UC") else ""
        vid = yid(link)
        if not vid:
            skip.append((n, "YouTubeのURL/IDが読めません")); continue
        if vid in have or (ch and ch in have):
            skip.append((n, "すでに入っています")); continue
        r = oembed(vid)
        if not r or r.get("__err"):
            skip.append((n, "oEmbedで確認できず（配信停止か非公開？）")); continue
        try:
            la_f, lo_f = float(la), float(lo)
        except ValueError:
            skip.append((n, "緯度経度が数値ではありません")); continue
        e = {"n": n, "la": la_f, "lo": lo_f, "by": by or r.get("author_name", ""),
             "k": k or "街", "p": p, "yt": vid, "url": "https://www.youtube.com/watch?v=" + vid}
        if ch:
            e["ch"] = ch
        if note:
            e["nt"] = note
        add.append(e); have.add(vid)
        print("  ○", n, "／", r.get("title", "")[:40], "／", r.get("author_name", ""))
        time.sleep(0.15)
    print("\n追加できる %d 件 / 見送り %d 件" % (len(add), len(skip)))
    for s, why in skip:
        print("  － %s（%s）" % (s if isinstance(s, str) else s, why))
    if not add:
        return
    if not go:
        print("\n（下見です。追加するには --go を付けてください）"); return
    arr.extend(add)
    write_cams(head, arr)
    print("\n✓ data/cams_jp.js に %d 件を追加しました（合計 %d 件）。" % (len(add), len(arr)))
    print("  このあと: node tools/build_bundle.js は不要（cams_jp.js は data 直読み）。ブラウザで確認 → アップローダーで公開。")

def cmd_discover(query, live_only):
    key = os.environ.get("YT_API_KEY", "").strip()
    if not key:
        print("YT_API_KEY（YouTube Data API v3 の無料キー）を環境変数に入れてください。"); return
    params = {"part": "snippet", "type": "video", "maxResults": "25", "q": query, "key": key, "regionCode": "JP"}
    if live_only:
        params["eventType"] = "live"
    url = "https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=25) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print("検索できませんでした:", e); return
    print("候補（良いものを --from-list の TSV に。座標は自分で入れる）:")
    for it in data.get("items", []):
        s = it.get("snippet", {}); vid = it.get("id", {}).get("videoId", "")
        print("  %s\t%s\t%s" % (vid, s.get("channelTitle", ""), s.get("title", "")[:60]))

def main():
    a = sys.argv[1:]
    if "--verify" in a:
        cmd_verify(); return
    if "--from-list" in a:
        path = a[a.index("--from-list") + 1]
        cmd_from_list(path, "--go" in a); return
    if "--discover" in a:
        q = a[a.index("--discover") + 1]
        cmd_discover(q, "--live" in a); return
    print(__doc__)

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    main()
