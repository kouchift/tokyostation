/* =========================================================================
   訪問メモ（事後の記録）と Markdown 書き出し
   ・予定（未来）→ 行ってきた → 訪問メモ（確定した事実の備忘録）
   ・Obsidian を主に想定した Markdown を出力（YAMLフロントマター／内部リンク／チェックボックス）
   ========================================================================= */
(function (RG) {
"use strict";
/* カレンダーの «その日のカード» から、日付だけの訪問メモを作る */
RG.addLogFromDay = function (s, him) {
  var P = RG.Plan;
  P.logs = P.logs || [];
  var d = new Date(s + "T00:00:00");
  var note = [];
  if (him && him.a && him.a.length) note.push("記念日: " + him.a[0]);
  if (him && him.e && him.e.length) note.push("できごと: " + him.e[0]);
  var rk = RG.rokuOf ? RG.rokuOf(d) : null;
  P.logs.unshift({
    date: s, title: (d.getMonth() + 1) + "月" + d.getDate() + "日の記録",
    rating: 0, yen: 0, one: rk ? "六曜: " + rk : "", memo: note.join(" / "),
    diary: "", items: [], fromDay: 1
  });
  P.tab = "log";
  RG.savePlan();
  if (RG.openPlan) RG.openPlan();
  RG.tripStatus("📝 " + (d.getMonth() + 1) + "月" + d.getDate() + "日 を訪問メモに追加しました。", "ok", 3200);
};
var $ = RG.$, el = RG.el, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function yen(v) { return "¥" + Math.round(v).toLocaleString("ja-JP"); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

/* ------------------------------------------------ 予定 → 訪問メモ */
RG.planToLog = function () {
  var P = RG.Plan, t = RG.planTotals();
  if (!P.items.length) { RG.tripStatus("予定が空です。先に行き先を入れてください。", "warn"); return null; }
  var log = {
    id: "log" + Date.now(),
    date: today(),
    title: ((RG.planWhere ? RG.planWhere() : "") || "おでかけ")
             .replace(/[\\/:*?"<>|]/g, "").trim(),
    adults: P.adults, kids: P.kids,
    items: JSON.parse(JSON.stringify(P.items)).map(function (it) {
      it.done = true; it.actual = null; it.comment = ""; return it; }),
    planned: t.sum, actual: null, rating: 0, review: "", memo: P.memo || "",
    createdAt: Date.now()
  };
  P.logs.unshift(log);
  RG.savePlan();
  RG.tripStatus("📝 訪問メモに保存しました。実際にかかった金額や感想を書き足せます。", "ok", 4000);
  return log;
};

/* ------------------------------------------------ Markdown 生成 */
function mdEscape(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|"); }
RG.logToMarkdown = function (g) {
  var L = [], sumA = 0, hasA = false;
  g.items.forEach(function (it) { if (it.actual != null) { sumA += it.actual; hasA = true; } });
  var tags = ["おでかけ", "東京"];
  g.items.forEach(function (it) { if (it.k === "spot" && it.genre) tags.push(it.genre.replace(/[・\/\s]/g, "")); });
  tags = tags.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 8);

  L.push("---");
  L.push("date: " + g.date);
  L.push("title: " + JSON.stringify(g.title));
  L.push("tags: [" + tags.join(", ") + "]");
  L.push("people: 大人" + g.adults + " 子ども" + g.kids);
  L.push("budget_planned: " + Math.round(g.planned));
  if (hasA) L.push("budget_actual: " + Math.round(sumA));
  if (g.rating) L.push("rating: " + g.rating);
  L.push("source: 東京ステーションガイド");
  var vs = g.items.filter(function (it) { return it.k === "spot"; })
                  .map(function (it) { return it.label + ":" + (RG.visitCount(it.label) + (g.exported ? 0 : 1)); });
  if (vs.length) L.push("visits: [" + vs.join(", ") + "]");
  L.push("---");
  L.push("");
  L.push("# " + g.date + " " + g.title);
  L.push("");
  L.push("> 大人 " + g.adults + " 人・子ども " + g.kids + " 人／予算 " + yen(g.planned) +
         (hasA ? " → **実際 " + yen(sumA) + "**" : ""));
  if (g.rating) L.push("> 満足度 " + "★".repeat(g.rating) + "☆".repeat(5 - g.rating));
  L.push("");
  L.push("## 行程");
  L.push("");
  g.items.forEach(function (it) {
    var box = it.done ? "[x]" : "[ ]";
    if (it.k === "route") {
      L.push("- " + box + " **" + mdEscape(it.label) + "** " + (it.emoji || "") +
             " " + mdEscape(it.mode) + " 約" + it.min + "分 ・ " + yen(it.yen) +
             (it.actual != null ? " → 実際 " + yen(it.actual) : ""));
      if (it.lines && it.lines.length) L.push("\t- 利用: " + it.lines.join(" → "));
      (it.detail || []).forEach(function (d) { L.push("\t- " + mdEscape(d)); });
    } else {
      L.push("- " + box + " **[[" + mdEscape(it.label) + "]]** " + (it.emoji || "") +
             " " + mdEscape(it.genre || "") + (it.star ? " ☆" + it.star.toFixed(1) : "") +
             " ・ 1人 " + (it.yenPer ? yen(it.yenPer) : "—") +
             (it.actual != null ? " → 実際 " + yen(it.actual) : ""));
      if (it.desc) L.push("\t- " + mdEscape(it.desc));
      if (it.ad) L.push("\t- 所在地: " + mdEscape(it.ad));
      if (it.near) L.push("\t- 最寄り: [[" + it.near + "駅]] から徒歩約" + it.nearMin + "分");
      if (it.la != null) L.push("\t- [地図](https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(it.la + "," + it.lo) + ")");
    }
    if (it.comment) L.push("\t- 💬 " + mdEscape(it.comment));
  });
  L.push("");
  if (g.review) { L.push("## 感想"); L.push(""); L.push(g.review); L.push(""); }
  if (g.diary) { L.push("## 日記"); L.push(""); L.push(g.diary); L.push(""); }
  if (g.memo) { L.push("## 事前メモ"); L.push(""); L.push(g.memo); L.push(""); }
  L.push("## リンク");
  L.push("");
  var gr = RG.gmapRoute && RG.gmapRoute();
  if (gr) L.push("- [Google マップで全行程](" + gr + ")");
  var r1 = g.items.filter(function (x) { return x.k === "route"; })[0];
  var f = r1 ? String(r1.from || "").replace(/駅$/, "") : "";
  var t2 = r1 ? String(r1.to || "").replace(/駅$/, "") : "";
  (RG.transitLinks(f, t2) || []).forEach(function (x) { L.push("- [" + x.n + "](" + x.u + ")"); });
  L.push("");
  L.push("---");
  L.push("*このメモは「東京ステーションガイド」から書き出しました。金額と時間はモデルによる概算を含みます。*");
  return L.join("\n");
};

/* ------------------------------------------------ 訪問済みの管理
   Obsidian へ書き出した（＝記録を確定させた）タイミングで訪問回数を数える。
   あとで「訪問済みは地図から消す」といった使い方ができるようにするため。 */
RG.visitCount = function (name) {
  var v = RG.Plan.visits || {};
  return (v[name] && v[name].c) || 0;
};
RG.markVisited = function (g) {
  var P = RG.Plan;
  P.visits = P.visits || {};
  var added = 0;
  (g.items || []).forEach(function (it) {
    var keys = [];
    if (it.k === "spot") keys.push(it.label);
    else { if (it.to) keys.push(String(it.to).replace(/駅$/, "")); }
    keys.forEach(function (k) {
      if (!k) return;
      var e = P.visits[k] || { c: 0, last: null };
      e.c += 1; e.last = g.date;
      P.visits[k] = e; added++;
    });
  });
  g.exported = true; g.exportedAt = Date.now();
  RG.savePlan();
  if (added) RG.tripStatus("✅ " + added + " か所を訪問済みにしました（合計 " +
    Object.keys(P.visits).length + " か所）", "ok", 3600);
  if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
};

/* ------------------------------------------------ 書き出し手段 */
RG.exportMd = function (g) {
  var md = RG.logToMarkdown(g);
  var name = g.date + " " + g.title.replace(/[\\/:*?"<>|]/g, "");
  return { md: md, name: name,
    obsidian: "obsidian://new?" + (RG.Plan.vault ? "vault=" + encodeURIComponent(RG.Plan.vault) + "&" : "") +
              "name=" + encodeURIComponent(name) + "&content=" + encodeURIComponent(md) };
};
function download(name, text) {
  var b = new Blob([text], { type: "text/markdown;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name + ".md";
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
RG.downloadMd = download;

/* ------------------------------------------------ 訪問メモの画面 */
RG.renderLogs = function () {
  var P = RG.Plan;
  if (!P.logs.length) {
    return '<p class="set__d">まだありません。<br>「📋 予定」タブで行き先を入れて、' +
           "<b>✅ 行ってきた</b> を押すと、ここに事後の記録として残ります。</p>";
  }
  return P.logs.map(function (g, gi) {
    var sumA = 0, hasA = false;
    g.items.forEach(function (it) { if (it.actual != null) { sumA += it.actual; hasA = true; } });
    return '<details class="lg"' + (gi === 0 ? " open" : "") + '>' +
      '<summary><span class="lg__d">' + esc(g.date) + "</span>" +
      '<span class="lg__t">' + esc(g.title) + "</span>" +
      '<span class="lg__y">' + (hasA ? yen(sumA) : yen(g.planned)) + "</span>" +
      '<span class="lg__r">' + (g.rating ? "★".repeat(g.rating) : "☆") + "</span></summary>" +
      '<div class="lg__b">' +
        '<div class="lg__row"><label>日付 <input type="date" data-lf="date" data-i="' + gi + '" value="' + esc(g.date) + '"></label>' +
        '<label>満足度 <select data-lf="rating" data-i="' + gi + '">' +
          [0,1,2,3,4,5].map(function (v) { return '<option value="' + v + '"' + (v === g.rating ? " selected" : "") + ">" +
            (v ? "★".repeat(v) : "未評価") + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="lg__items">' + g.items.map(function (it, ii) {
          return '<div class="lg__it"><span>' + (it.emoji || "・") + " " + esc(it.label) + "</span>" +
            '<input type="number" min="0" step="10" placeholder="実費" data-la="' + gi + "_" + ii +
            '" value="' + (it.actual == null ? "" : it.actual) + '">' +
            '<input type="text" placeholder="ひとこと" data-lc="' + gi + "_" + ii +
            '" value="' + esc(it.comment || "") + '"></div>'; }).join("") + "</div>" +
        '<textarea class="lg__rev" data-lf="review" data-i="' + gi + '" placeholder="感想（また行きたい？ 次はどうする？）">' +
          esc(g.review) + "</textarea>" +
        '<textarea class="lg__rev" data-lf="diary" data-i="' + gi + '" placeholder="日記（リンクに載らない、自分だけの所感メモ。Obsidianにそのまま入ります）">' +
          esc(g.diary || "") + "</textarea>" +
        (g.exported ? '<p class="lg__done">✅ 書き出しずみ（訪問回数に反映されています）</p>' : "") +
        '<div class="lg__acts">' +
          '<button class="lg__b1" type="button" data-obs="' + gi + '">🟣 Obsidian へ送る</button>' +
          '<button class="set__b2" type="button" data-mdc="' + gi + '">📋 Markdownをコピー</button>' +
          '<button class="set__b2" type="button" data-mdd="' + gi + '">💾 .md を保存</button>' +
          '<button class="set__b2" type="button" data-mdp="' + gi + '">👀 中身を見る</button>' +
          '<button class="set__b2" type="button" data-ldel="' + gi + '">🗑️ 削除</button>' +
        "</div>" +
        '<pre class="lg__prev" data-prev="' + gi + '" hidden></pre>' +
      "</div></details>";
  }).join("") +
  '<div class="lg__vault"><label>Obsidian の Vault 名 ' +
    '<input id="lg-vault" type="text" placeholder="（空でもOK。既定のVaultが開きます）" value="' +
    esc(P.vault || "") + '"></label>' +
    '<p class="set__d">「Obsidian へ送る」は <code>obsidian://new</code> で新規ノートを作ります。' +
    "本文が長いと開けないことがあるので、そのときは「.md を保存」か「コピー」をお使いください。</p></div>";
};

RG.bindLogs = function (m, redraw) {
  var P = RG.Plan;
  $$("[data-lf]", m).forEach(function (i) {
    i.addEventListener("change", function () {
      var g = P.logs[+i.dataset.i];
      g[i.dataset.lf] = (i.dataset.lf === "rating") ? +i.value : i.value;
      RG.savePlan(); if (i.dataset.lf === "rating" || i.dataset.lf === "date") redraw();
    });
  });
  $$("[data-la]", m).forEach(function (i) {
    i.addEventListener("change", function () {
      var a = i.dataset.la.split("_");
      P.logs[+a[0]].items[+a[1]].actual = i.value === "" ? null : Math.max(0, +i.value);
      RG.savePlan();
    });
  });
  $$("[data-lc]", m).forEach(function (i) {
    i.addEventListener("input", function () {
      var a = i.dataset.lc.split("_");
      P.logs[+a[0]].items[+a[1]].comment = i.value; RG.savePlan();
    });
  });
  var v = $("#lg-vault", m);
  if (v) v.addEventListener("change", function () { P.vault = this.value.trim(); RG.savePlan(); });
  $$("[data-obs]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var g0 = P.logs[+b.dataset.obs];
      var e = RG.exportMd(g0);
      RG.markVisited(g0);
      if (e.obsidian.length > 7000) {
        RG.tripStatus("本文が長すぎてObsidianに直接渡せません。「.md を保存」を使ってください。", "warn", 5000);
        return;
      }
      location.href = e.obsidian;
    });
  });
  $$("[data-mdc]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var g0 = P.logs[+b.dataset.mdc]; var e = RG.exportMd(g0); RG.markVisited(g0);
      (navigator.clipboard ? navigator.clipboard.writeText(e.md) : Promise.reject())
        .then(function () { RG.tripStatus("📋 Markdownをコピーしました", "ok", 2400); })
        .catch(function () { RG.tripStatus("コピーできません。「中身を見る」から選んでコピーしてください。", "warn"); });
    });
  });
  $$("[data-mdd]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var g0 = P.logs[+b.dataset.mdd]; var e = RG.exportMd(g0); RG.markVisited(g0);
      RG.downloadMd(e.name, e.md);
    });
  });
  $$("[data-mdp]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var pv = m.querySelector('[data-prev="' + b.dataset.mdp + '"]');
      pv.hidden = !pv.hidden;
      if (!pv.hidden) pv.textContent = RG.exportMd(P.logs[+b.dataset.mdp]).md;
      b.textContent = pv.hidden ? "👀 中身を見る" : "👀 閉じる";
    });
  });
  $$("[data-ldel]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      P.logs.splice(+b.dataset.ldel, 1); RG.savePlan(); redraw();
    });
  });
};

})(window.RG);
