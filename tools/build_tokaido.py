#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五街道の宿場と道筋（data/tokaido.js）を Wikipedia 日本語版 + Wikidata から作る。

■ 出典
  Wikipedia 日本語版（CC BY-SA 4.0）: 一覧記事「東海道五十三次」「中山道六十九次」「甲州街道」「日光街道」「奥州街道」の
    宿場の表（番号付き）から 順番・記事名・（表にあれば）座標 を取る。宿場・街道の記事の冒頭（extracts exintro）を要約に、
    記事の代表画像（pageimages）を写真に使う。
  Wikidata（CC0 1.0）: 記事 → QID（pageprops）、座標 P625（表に座標が無いとき）。
  それでも座標が無いときは Wikipedia の記事の座標（prop=coordinates。主座標が無ければ副座標）。
  記事そのものが無い宿場（赤リンク。奥州街道の白河以北に多い）は、表の「現在の自治体」の市区町村の代表点
  （Wikidata P625）を仮の座標にして src="muni"、mu=自治体名、nowp=1 を付ける。
  API の呼び方（間隔・再試行・キャッシュ）は tools/build_views.py のものを使う（/tmp/views_cache）。

■ 収録
  東海道      日本橋 → 品川宿 (1) … 大津宿 (53) → 三条大橋           53 宿 + 両端
  中山道      日本橋 → 板橋宿 (1) … 大津宿 (69) → 三条大橋           69 宿 + 両端（草津・大津は東海道と共用）
  甲州街道    日本橋 → 内藤新宿 (1) … 上諏訪宿 (44) → 下諏訪宿        44 宿 + 両端（下諏訪宿で中山道に合流）
  日光街道    日本橋 → 千住宿 (1) … 鉢石宿 (21) → 神橋（日光）        21 宿 + 両端
  奥州街道    日本橋 → 千住宿 (1) … 宇都宮宿 (17) … 白河宿 (27)       27 宿 + 起点（千住〜宇都宮は日光街道と共用。五街道としての奥州街道は白河まで）
  奥州街道（白河以北）  白河宿 (27) → 根田宿 (28) … 三厩宿 (112)      仙台道・松前道と呼ばれた続き。ext=1 を付ける（五街道ではない）
  東海道の 54〜57（伏見・淀・枚方・守口 = 京街道）は入れない。

■ 出力（data/tokaido.js）
  RG.KAIDO = [ {n:"東海道", c:"#B71C1C", km:490, d:"街道の記事の冒頭", wp:"東海道",
                 stops:[{no:0,n:"日本橋",la,lo,wp:"日本橋 (東京都中央区の橋)",d:"…",img:"…"}, {no:1,n:"品川宿",…}, …]}, … ]
    no   = 宿場の番号（0 = 起点、最後 = 終点。一覧記事の番号そのまま）
    n    = 表示名（表のリンク文字。記事名の「(中山道)」などの括弧は外す）   wp = 記事名   q = Wikidata QID
    la/lo = 座標（表の座標 > Wikidata P625 > 記事の座標 > 自治体の代表点。src に "table"/"wd"/"wp"/"muni"）
    mu   = src="muni" のときの自治体名   nowp = 1 なら Wikipedia に記事が無い宿場（d・img も無い）
    d    = 記事の冒頭 1〜2 文   img = Commons のファイル名（記事の代表画像。無いものは省略）
    km   = 宿場を順に直線で結んだ長さの目安（道筋そのものの長さではない）   ext = 1 なら五街道の続き（白河以北）
  道筋の線は stops を順に結ぶだけ（描画側で線にする）。同じ記事に複数の宿場が入るもの（布田五宿・高井戸宿）は同じ座標になる。

使い方:  python3 tools/build_tokaido.py [--fresh]
"""
import datetime
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_views import titles_to_qids, _get, JA_API, WD_API, wikitext, page_images  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'data', 'tokaido.js')

ROADS = [
    # (表示名, 一覧記事, 色, 起点, 終点, 使う番号の範囲, ext)
    ('東海道', '東海道五十三次', '#B71C1C', ('日本橋', '日本橋 (東京都中央区の橋)'), ('三条大橋', '三条大橋'), (1, 53), 0),
    ('中山道', '中山道六十九次', '#1565C0', ('日本橋', '日本橋 (東京都中央区の橋)'), ('三条大橋', '三条大橋'), (1, 69), 0),
    ('甲州街道', '甲州街道', '#6A1B9A', ('日本橋', '日本橋 (東京都中央区の橋)'), ('下諏訪宿', '下諏訪宿'), (1, 44), 0),
    ('日光街道', '日光街道', '#2E7D32', ('日本橋', '日本橋 (東京都中央区の橋)'), ('神橋', '神橋'), (1, 21), 0),
    ('奥州街道', '奥州街道', '#EF6C00', ('日本橋', '日本橋 (東京都中央区の橋)'), None, (1, 27), 0),
    ('奥州街道（白河以北）', '奥州街道', '#F9A825', None, None, (27, 112), 1),
]
ROAD_ARTICLE = {'東海道': '東海道', '中山道': '中山道', '甲州街道': '甲州街道', '日光街道': '日光街道',
                '奥州街道': '奥州街道', '奥州街道（白河以北）': '奥州街道'}
# 街道の要約 d に使う記事（「東海道」の記事は五畿七道の東海道の話から始まるので一覧記事の冒頭を使う）
ROAD_DIGEST = {'東海道': '東海道五十三次'}

ROW = re.compile(r'^\|\s*(?:(?:rowspan|colspan)="?\d+"?\s*\|\s*)*(\d+)\.\s*\[\[([^\]|]+)(?:\|([^\]]*))?\]\]')
COORD = re.compile(r'\{\{ウィキ座標\|(\d+)\|(\d+)\|([\d.]+)\|([NS])\|(\d+)\|(\d+)\|([\d.]+)\|([EW])')
PAREN = re.compile(r'\s*[（(][^（）()]*[）)]\s*$')


LINK = re.compile(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]')
MUNI = re.compile(r'(市|区|町|村)$')
NOT_MUNI = re.compile(r'(郡|国|県|府|都|道|街道|城|城下|宿|関所|往還)$')


def table_rows(article):
    """一覧記事の番号付きの行 → [(番号, 記事名, 表示名, (la,lo) or None, 現在の自治体の記事名), ...]
    自治体は「現在の自治体」の列のリンク（市区町村）。rowspan で省かれている行は前の行のものを引き継ぐ"""
    wt = wikitext(article)
    rows = []
    cur = None
    muni = None
    for line in wt.split('\n'):
        m = ROW.match(line)
        if m:
            title = m.group(2).strip().replace('_', ' ')
            disp = (m.group(3) or '').strip() or PAREN.sub('', title)
            cur = [int(m.group(1)), title, disp, None, muni]
            rows.append(cur)
        if line.startswith('|-') or line.startswith('|}') or line.startswith('{|'):
            continue
        if cur is None:
            continue
        for lm in LINK.finditer(line if not m else line[m.end():]):
            t = lm.group(1).strip()
            base = PAREN.sub('', t)
            if MUNI.search(base) and not NOT_MUNI.search(base):
                # 区は市より細かいので優先。同じ行ブロックでは後に出る（市 → 区 の順）
                if cur[4] is None or cur[4] == muni or base.endswith('区'):
                    cur[4] = t
                    muni = t
        c = COORD.search(line)
        if c and cur[3] is None:
            la = int(c.group(1)) + int(c.group(2)) / 60 + float(c.group(3)) / 3600
            lo = int(c.group(5)) + int(c.group(6)) / 60 + float(c.group(7)) / 3600
            if c.group(4) == 'S':
                la = -la
            if c.group(8) == 'W':
                lo = -lo
            cur[3] = (round(la, 5), round(lo, 5))
    return rows


def wp_coords_any(titles):
    """記事の座標（主座標が無ければ副座標）→ {title: (la, lo)}"""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {'action': 'query', 'prop': 'coordinates', 'coprimary': 'all', 'colimit': 'max',
                          'redirects': 1, 'titles': '|'.join(chunk), 'format': 'json', 'formatversion': 2})
        q = r.get('query', {})
        alias = {}
        for kind in ('normalized', 'redirects'):
            for x in q.get(kind, []):
                alias[x['from']] = x['to']
        got = {}
        for p in q.get('pages', []):
            co = [c for c in (p.get('coordinates') or []) if c.get('globe', 'earth') == 'earth']
            co.sort(key=lambda c: not c.get('primary'))
            if co:
                got[p['title']] = (round(co[0]['lat'], 5), round(co[0]['lon'], 5))
        for t in chunk:
            tt = t
            for _ in range(3):
                tt = alias.get(tt, tt)
            if tt in got:
                out[t] = got[tt]
    return out


def wd_coords(qids):
    """Wikidata P625 → {qid: (la, lo)}"""
    out = {}
    qids = sorted(set(q for q in qids if q))
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        r = _get(WD_API, {'action': 'wbgetentities', 'ids': '|'.join(chunk), 'props': 'claims',
                          'format': 'json'}, min_gap=1.5)
        for k, e in r.get('entities', {}).items():
            for c in e.get('claims', {}).get('P625', []):
                if c.get('rank') == 'deprecated':
                    continue
                dv = c.get('mainsnak', {}).get('datavalue')
                if dv and dv['value'].get('globe', '').endswith('Q2'):
                    out[k] = (round(dv['value']['latitude'], 5), round(dv['value']['longitude'], 5))
                    break
    return out


def extracts(titles, sentences=2):
    """記事の冒頭（exintro, プレーンテキスト）→ {title: text}"""
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {'action': 'query', 'prop': 'extracts', 'exintro': 1, 'explaintext': 1,
                          'exsentences': sentences, 'exlimit': 20, 'redirects': 1,
                          'titles': '|'.join(chunk), 'format': 'json', 'formatversion': 2})
        q = r.get('query', {})
        alias = {}
        for kind in ('normalized', 'redirects'):
            for x in q.get(kind, []):
                alias[x['from']] = x['to']
        got = {}
        for p in q.get('pages', []):
            t = (p.get('extract') or '').strip()
            if t:
                got[p['title']] = re.sub(r'\s+', ' ', t)
        for t in chunk:
            tt = t
            for _ in range(3):
                tt = alias.get(tt, tt)
            if tt in got:
                out[t] = got[tt]
    return out


def main():
    t0 = datetime.datetime.now()
    tables = {}
    for _, article, *_rest in ROADS:
        if article not in tables:
            tables[article] = table_rows(article)
            print('%s: %d numbered rows, %d with coordinates in table' % (
                article, len(tables[article]), sum(1 for r in tables[article] if r[3])))

    # 全宿場の記事名を集めて まとめて引く
    all_titles = set()
    munis = set()
    for name, article, color, start, end, (lo_no, hi_no), ext in ROADS:
        for no, title, disp, co, mu in tables[article]:
            if lo_no <= no <= hi_no:
                all_titles.add(title)
                if mu:
                    munis.add(mu)
        for ep in (start, end):
            if ep:
                all_titles.add(ep[1])
    all_titles |= set(ROAD_ARTICLE.values()) | set(ROAD_DIGEST.values())
    all_titles = sorted(all_titles)
    munis = sorted(munis)
    print('titles: %d, municipalities: %d' % (len(all_titles), len(munis)))
    qids = titles_to_qids(all_titles + munis)
    print('  QIDs: %d' % len(qids))
    wd = wd_coords(qids.values())
    print('  Wikidata coordinates: %d' % len(wd))
    wp_co = wp_coords_any(all_titles + munis)
    print('  Wikipedia coordinates: %d' % len(wp_co))
    ex = extracts(all_titles)
    print('  extracts: %d' % len(ex))
    imgs = page_images(all_titles)
    print('  images: %d' % len(imgs))

    def coords_of(title):
        q = qids.get(title)
        if q in wd:
            return wd[q]
        return wp_co.get(title)

    def stop(no, title, disp, co, mu):
        o = {'no': no, 'n': disp, 'wp': title}
        q = qids.get(title)
        if q:
            o['q'] = q
        if co:
            o['la'], o['lo'], o['src'] = co[0], co[1], 'table'
        elif q in wd:
            o['la'], o['lo'], o['src'] = wd[q][0], wd[q][1], 'wd'
        elif title in wp_co:
            o['la'], o['lo'], o['src'] = wp_co[title][0], wp_co[title][1], 'wp'
        elif mu and coords_of(mu):
            o['la'], o['lo'], o['src'] = coords_of(mu)[0], coords_of(mu)[1], 'muni'   # 記事が無い宿場: 自治体の代表点
            o['mu'] = PAREN.sub('', mu)
        if title not in qids and 'd' not in o and not (title in ex):
            o['nowp'] = 1                         # 記事が無い（赤リンク）
        if title in ex:
            o['d'] = ex[title]
        if title in imgs:
            o['img'] = imgs[title]
        return o

    def km(a, b):
        dx = (b['lo'] - a['lo']) * math.cos(math.radians((a['la'] + b['la']) / 2)) * 111.32
        dy = (b['la'] - a['la']) * 110.95
        return math.hypot(dx, dy)

    kaido = []
    for name, article, color, start, end, (lo_no, hi_no), ext in ROADS:
        rows = [r for r in tables[article] if lo_no <= r[0] <= hi_no]
        stops = []
        if start:
            stops.append(stop(0, start[1], start[0], None, None))
        for no, title, disp, co, mu in rows:
            stops.append(stop(no, title, disp, co, mu))
        if end:
            stops.append(stop(rows[-1][0] + 1, end[1], end[0], None, None))
        missing = [s['n'] for s in stops if 'la' not in s]
        road = {'n': name, 'c': color, 'wp': ROAD_ARTICLE[name]}
        if ext:
            road['ext'] = 1
        located = [s for s in stops if 'la' in s]
        road['km'] = int(round(sum(km(located[i], located[i + 1]) for i in range(len(located) - 1))))
        da = ROAD_DIGEST.get(name, ROAD_ARTICLE[name])
        if da in ex:
            road['d'] = ex[da]
        road['stops'] = stops
        kaido.append(road)
        src = {}
        for s in stops:
            src[s.get('src', 'none')] = src.get(s.get('src', 'none'), 0) + 1
        print('%s: %d stops (no %d..%d), coords %s, digests %d, images %d, ~%d km%s' % (
            name, len(stops), stops[0]['no'], stops[-1]['no'], src, sum(1 for s in stops if 'd' in s),
            sum(1 for s in stops if 'img' in s), road['km'], '' if not missing else ', NO COORDS: %s' % missing))

    today = datetime.date.today().isoformat()
    head = ('/* 五街道の宿場と道筋。tools/build_tokaido.py で生成（%s）。'
            '出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)（一覧記事の宿場の表、各記事の冒頭と代表画像）\n'
            '   KAIDO n=街道名 c=色 wp=街道の記事名 d=記事の冒頭 km=宿場を直線で結んだ長さの目安 ext=1 は五街道の続き（奥州街道 白河以北）\n'
            '   stops no=宿場の番号(0=起点、最後=終点) n=表示名 wp=記事名 q=Wikidata la/lo=座標 '
            'src=座標の出どころ(table=一覧記事の表/wd=Wikidata P625/wp=記事の座標/muni=自治体の代表点) mu=その自治体名 '
            'nowp=1 記事の無い宿場 d=記事の冒頭 img=Commons のファイル名\n'
            '   道筋の線は stops を順に結ぶ。同じ記事に複数の宿場が入るもの（布田五宿・高井戸宿）は同じ座標 */\n') % today
    body = head + 'RG.KAIDO = ' + json.dumps(kaido, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(body)
    print('wrote %s  %.0f KB  roads %d  stops %d  (%s)' % (
        OUT, os.path.getsize(OUT) / 1024, len(kaido), sum(len(r['stops']) for r in kaido),
        str(datetime.datetime.now() - t0).split('.')[0]))


if __name__ == '__main__':
    main()
