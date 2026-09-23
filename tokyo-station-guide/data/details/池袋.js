/* 池袋駅（西武池袋線 SI01／JR山手線 JY13）— サンプル */
RG.registerDetail("池袋", {
 status: "sample",
 station: { ward: "東京都豊島区", structure: "地上・地下の複合駅", stopType: "西武池袋線の起点" },
 cars: 10,
 dirLeft: "（頭端式ホーム・行き止まり）",
 dirRight: "所沢・飯能方面（下り）",
 boarding: [
  { car: 10, type: "gate",     pos: "後", label: "西武池袋線の改札（行き止まり側）" },
  { car: 9,  type: "transfer", pos: "後", label: "JR山手線への乗換が近い" },
  { car: 6,  type: "elevator", pos: "中", label: "エレベーター" },
  { car: 2,  type: "stair",    pos: "前", label: "先頭寄りの階段（比較的すいている）" }
 ],
 congestion: { "平日 7-9時": 4, "平日 10-16時": 3, "平日 17-20時": 4, "休日 昼": 4 },
 congestionSource: "サンプル値（実測して差し替える）",
 town: {
  heroCss: "background-image:linear-gradient(135deg,#333333 0%,#0071BC 45%,#9ACD32 100%)",
  heroCaption: "西武・東武・JR・地下鉄が交わるターミナル",
  headline: "中村橋から山手線に乗り換える玄関口",
  lead: "西武池袋線の起点。ここでJR山手線や東京メトロ各線に乗り換えると、東京のほぼどこへでも行ける。",
  spots: [{ emoji: "🌏", name: "（未調査）駅周辺の見どころ", genre: "—", note: "調べて記入。" }],
  food: [{ emoji: "🍥", name: "（未調査）駅ナカ・駅前の店", genre: "—", note: "調べて記入。" }],
  views: []
 },
 sources: ["各鉄道会社の公式サイトで要確認"]
});
