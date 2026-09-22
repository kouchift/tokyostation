#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""みんなの声の受け皿（Google フォーム）の «事前入力した URL» から、data/support.js に貼る設定を作る（v88）

  python3 tools/memo_form_setup.py memo "https://docs.google.com/forms/d/e/XXXX/viewform?usp=pp_url&entry.111=st&entry.222=name&..."
  python3 tools/memo_form_setup.py like "https://docs.google.com/forms/d/e/YYYY/viewform?usp=pp_url&entry.333=id&entry.444=vid&..."
  python3 tools/memo_form_setup.py view "https://docs.google.com/forms/d/e/ZZZZ/viewform?usp=pp_url&entry.555=name&..."

手順（tools/setup_memo_backend.gs を使わずに手で作るとき）
  1. Google フォームを新規作成し、記述式（短文）の質問をキーの名前で作る
       memo: st name nick text vid t quiet step xfer night toilet elev kind pref la lo（16 個。全部「必須」にしない）
       like: id vid t name        view: name vid t
  2. 右上「⋮」→「事前入力した URL を取得」→ 各質問に «その質問のキー名そのもの» を入力（st の欄に st、name の欄に name …）→「リンクを取得」
  3. そのリンクをこのツールに渡すと、entry.xxxx とキーの対応を読み取って JSON を出す → data/support.js に貼る
  4. 回答スプレッドシートを「ファイル → 共有 → ウェブに公開 → CSV」→ URL を memoCsv / likeCsv / viewCsv に
"""
import sys, json, urllib.parse

KEYS = {
    "memo": ["st", "name", "nick", "text", "vid", "t", "quiet", "step", "xfer", "night", "toilet", "elev", "kind", "pref", "la", "lo"],
    "like": ["id", "vid", "t", "name"],
    "view": ["name", "vid", "t"],
}

def main():
    if len(sys.argv) < 3 or sys.argv[1] not in KEYS:
        print(__doc__); sys.exit(1)
    kind, url = sys.argv[1], sys.argv[2]
    u = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
    action = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path.replace("/viewform", "/formResponse"), "", ""))
    fields = {}
    for k, v in q:
        if k.startswith("entry.") and v.strip() in KEYS[kind]:
            fields[v.strip()] = k
    missing = [k for k in KEYS[kind] if k not in fields]
    out = {kind + "Form": {"action": action, "fields": {k: fields.get(k, "") for k in KEYS[kind]}}}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if missing:
        print("※ 対応が取れなかった項目:", ", ".join(missing), "（事前入力でその質問にキー名を入れ忘れていませんか）", file=sys.stderr)
    else:
        print("※ 全項目 OK。data/support.js の " + kind + "Form を置き換えてください。", file=sys.stderr)

if __name__ == "__main__":
    main()
