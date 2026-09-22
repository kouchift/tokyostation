/* =========================================================================
   スポットの «絞り込み» の土台（v90）— v99 のコンビニ 3 社（7／F／L）などをここに載せる
   ・RG.PoiFilters.register({ id, label, multi, values:[{k,label}], test(p, state) })
   ・状態は RG.settings.poiFilters[id] に保存（localStorage は既存の RG.saveSettings）
   ・地図の描画（poiLOD）は RG.poiFilterPass(p) を 1 回呼ぶだけ（O(n)・DOM は作り直さない）
   ・ブランドの正規化は RG.brandKey(p) の 1 か所に集約（id → 名前の順で判定。判定できないものは "other"）
   ========================================================================= */
(function (RG) {
"use strict";
var FILTERS = [], BYID = {};
function state(id) {
  var S = RG.settings || (RG.settings = {});
  S.poiFilters = S.poiFilters || {};
  return S.poiFilters[id];
}
RG.PoiFilters = {
  register: function (f) { if (BYID[f.id]) return BYID[f.id]; BYID[f.id] = f; FILTERS.push(f); return f; },
  list: function () { return FILTERS.slice(); },
  get: function (id) { return BYID[id] || null; },
  state: function (id) { var f = BYID[id]; if (!f) return null; var s = state(id); return s == null ? (f.initial ? f.initial() : null) : s; },
  set: function (id, value) {
    var S = RG.settings || (RG.settings = {}); S.poiFilters = S.poiFilters || {}; S.poiFilters[id] = value;
    if (RG.saveSettings) RG.saveSettings();
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    document.dispatchEvent(new CustomEvent("rg:poifilter", { detail: { id: id, value: value } }));
  }
};
/* 描画側から: 1 つでも «出さない» と言う絞り込みがあれば false */
RG.poiFilterPass = function (p) {
  for (var i = 0; i < FILTERS.length; i++) {
    var f = FILTERS[i];
    if (f.applies && !f.applies(p)) continue;
    if (!f.test(p, RG.PoiFilters.state(f.id))) return false;
  }
  return true;
};

/* ---- ブランドの正規化（コンビニ）。既存データ: チェーン店 POI は p.brand（seven / lawson / famima …）、名前は p.n ---- */
var BRAND_ID = { seven: "seven_eleven", seven_eleven: "seven_eleven", "7eleven": "seven_eleven", lawson: "lawson", famima: "familymart", familymart: "familymart", family: "familymart" };
var BRAND_RE = [
  [/セブン|7-?Eleven|7-?ELEVEN|セブンイレブン/i, "seven_eleven"],
  [/ファミリーマート|FamilyMart|ファミマ/i, "familymart"],
  [/ローソン|LAWSON/i, "lawson"]
];
RG.brandKey = function (p) {
  if (!p) return "other";
  if (p.brandKey) return p.brandKey;
  var k = null;
  if (p.brand && BRAND_ID[String(p.brand).toLowerCase()]) k = BRAND_ID[String(p.brand).toLowerCase()];
  if (!k) { var n = p.n || ""; for (var i = 0; i < BRAND_RE.length; i++) if (BRAND_RE[i][0].test(n)) { k = BRAND_RE[i][1]; break; } }
  p.brandKey = k || "other";
  return p.brandKey;
};
RG.BRANDS = [
  { k: "seven_eleven", label: "セブン-イレブン", mark: "7", c: "#EA5514" },
  { k: "familymart", label: "ファミリーマート", mark: "F", c: "#00A040" },
  { k: "lawson", label: "ローソン", mark: "L", c: "#0068B7" }
];
})(window.RG);
