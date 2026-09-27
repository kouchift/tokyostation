/* =========================================================================
   v147: 地図の隅の出典（右下）
   ・OpenStreetMap の表示の決まり（Attribution Guidelines）: 最初は見えていること。畳んでよいのは «×を押した・地図を触った・5 秒たった» とき。
     畳んだあとも ⓘ から見られること → 最初の 5 秒（または地図を触るまで）だけ全部出し、あとは ⓘ だけにする
   ・地形（国土地理院の標高タイルを加工した画像）を出している間は、畳んでも «地形©国土地理院» を残す（basemap.js が .rl を付ける）
   ・出典の全部は credits.html にまとめてある
   ========================================================================= */
(function () {
  var a = document.getElementById("attrib"); if (!a) return;
  var b = a.querySelector(".attrib__i"), t = null;
  function set(open) { a.classList.toggle("open", open); if (b) b.setAttribute("aria-expanded", open ? "true" : "false"); }
  function fold() { clearTimeout(t); set(false); off(); }
  var wrap = a.parentNode;
  function onMap(e) { if (!a.contains(e.target)) fold(); }
  function off() { if (wrap) { wrap.removeEventListener("pointerdown", onMap, true); wrap.removeEventListener("wheel", onMap, true); } }
  if (wrap) { wrap.addEventListener("pointerdown", onMap, true); wrap.addEventListener("wheel", onMap, { capture: true, passive: true }); }
  t = setTimeout(fold, 5000);
  if (b) b.addEventListener("click", function (e) { e.stopPropagation(); clearTimeout(t); set(!a.classList.contains("open")); });
})();
