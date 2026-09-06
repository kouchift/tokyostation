#!/usr/bin/env python3
"""assets/qr.js の出力を Python の qrcode ライブラリと突き合わせる（型番1〜10・レベルM・自動マスク）。
使い方: python tools/qr_check.py   （node が必要）"""
import json, subprocess, os, sys
import qrcode
from qrcode.constants import ERROR_CORRECT_M
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tests = ["https://kouchift.github.io/tokyostation/?tip=1", "tonbo7", "paypay://", "https://kouchift.github.io/tokyostation/?tip=1&app=kyash&amt=3000&from=qr-desktop-2026-09-06",
         "東京ステーションガイド 投げ銭 tonbo7 ありがとうございます", "A" * 150, "https://example.com/" + "x" * 190]
js = ("var window={}; window.RG={}; var RG=window.RG;" + open(os.path.join(ROOT, "assets/qr.js"), encoding="utf-8").read() +
      "; var out=[]; for (const t of %s){ const m=RG.qrMatrix(t); out.push(m? {v:m.version, mask:m.mask, rows:m.map(r=>r.join(''))} : null);} console.log(JSON.stringify(out));" % json.dumps(tests))
res = json.loads(subprocess.check_output(["node", "-e", js]).decode())
ok = True
for t, r in zip(tests, res):
    if r is None: print("SKIP (too long)", t[:30]); continue
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_M, mask_pattern=r["mask"], border=0)
    from qrcode.util import QRData, MODE_8BIT_BYTE; q.add_data(QRData(t.encode("utf-8"), mode=MODE_8BIT_BYTE)); q.make(fit=True)
    py = ["".join("1" if x else "0" for x in row) for row in q.modules]
    same = (py == r["rows"]) and (q.version == r["v"])
    ok &= same
    print(("OK " if same else "NG "), "v%d mask%d" % (r["v"], r["mask"]), "py v%d" % q.version, t[:40])
print("ALL OK" if ok else "MISMATCH"); sys.exit(0 if ok else 1)
