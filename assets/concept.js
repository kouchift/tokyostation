/* =========================================================================
   コンセプト反映（v174）: UI 刷新コンセプト «tokyostation-uikonseputo» の
   しかけをトップページへ移したもの。
   ・地図の上の粒子（#tsg-gl）: WebGPU の Compute Shader、未対応では Canvas 2D。
     起動は «ページが出そろって端末が暇になってから»（アプリの起動と競合しない）。
     タブが裏に回ったら止める。動きを減らす設定では 1 枚だけ描いて止める。
   ・静的区画 «エリアガイド»（.tsg-show）: エリアのタブ・数字の数え上げ・
     駅舎ステージの HTML-in-Canvas レンズ。未対応の環境では通常のカード表示。
   どれも失敗しても本体（路線図アプリ）に影響しないよう、全体を守ってある。
   ========================================================================= */
(function () {
  'use strict';
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function onIdle(fn) {
    if ('requestIdleCallback' in window) { requestIdleCallback(fn, { timeout: 2500 }); }
    else { setTimeout(fn, 1200); }
  }
  function tech(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }

  /* ================= 地図の上の粒子 ================= */
  function initParticles() {
    var canvas = document.getElementById('tsg-gl');
    if (!canvas) return;
    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var mouse = { x: .5, y: .5, active: 0 };
    var running = true;
    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX / Math.max(1, window.innerWidth);
      mouse.y = 1 - (e.clientY / Math.max(1, window.innerHeight));
      mouse.active = 1;
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { running = !document.hidden; });

    function fitCanvas(c) {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.floor((c.clientWidth || 0) * dpr), h = Math.floor((c.clientHeight || 0) * dpr);
      if (w < 2 || h < 2) return null;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      return { w: w, h: h };
    }

    /* ---------- WebGPU ---------- */
    var WGSL = [
      'struct U { t: f32, aspect: f32, mx: f32, my: f32, mActive: f32, dark: f32, w: f32, h: f32 };',
      '@group(0) @binding(0) var<uniform> u: U;',
      '@group(0) @binding(1) var<storage, read> seed: array<vec4f>;',
      '@group(0) @binding(2) var<storage, read_write> pos: array<vec2f>;',
      '@group(0) @binding(3) var<storage, read_write> vel: array<vec2f>;',
      '@compute @workgroup_size(64)',
      'fn cs(@builtin(global_invocation_id) id: vec3u) {',
      '  let i = id.x;',
      '  if (i >= arrayLength(&pos)) { return; }',
      '  let s = seed[i];',
      '  var p = pos[i];',
      '  var v = vel[i];',
      '  let a = sin(p.y * 3.1 + u.t * 0.35 + s.x * 6.2831) * 1.25 + cos(p.x * 2.3 - u.t * 0.22 + s.y * 3.1415) * 1.25;',
      '  let dir = vec2f(cos(a), sin(a));',
      '  let target = dir * 0.0016 + vec2f(0.0011 * (0.4 + s.y), 0.0);',
      '  v = mix(v, target, 0.055);',
      '  let m = vec2f(u.mx, u.my);',
      '  let d = p - m;',
      '  let dist = length(d) + 0.0001;',
      '  let infl = smoothstep(0.30, 0.0, dist) * u.mActive;',
      '  v += (d / dist) * infl * 0.0024;',
      '  p += v;',
      '  if (p.x > 1.02) { p.x = -0.02; }',
      '  if (p.x < -0.02) { p.x = 1.02; }',
      '  if (p.y > 1.02) { p.y = -0.02; }',
      '  if (p.y < -0.02) { p.y = 1.02; }',
      '  pos[i] = p;',
      '  vel[i] = v;',
      '}',
      'struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) sv: vec4f };',
      '@group(0) @binding(1) var<storage, read> seedR: array<vec4f>;',
      '@group(0) @binding(2) var<storage, read> posR: array<vec2f>;',
      '@vertex',
      'fn vs(@builtin(instance_index) i: u32, @builtin(vertex_index) vi: u32) -> VSOut {',
      '  var corners = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));',
      '  let s = seedR[i];',
      '  let size = 0.0021 + s.z * 0.0044;',
      '  let center = posR[i] * 2.0 - vec2f(1.0, 1.0);',
      '  var out: VSOut;',
      '  out.pos = vec4f(center + corners[vi] * vec2f(size, size * u.aspect), 0.0, 1.0);',
      '  out.uv = corners[vi];',
      '  out.sv = s;',
      '  return out;',
      '}',
      '@fragment',
      'fn fs(in: VSOut) -> @location(0) vec4f {',
      '  let d = length(in.uv);',
      '  let a = smoothstep(1.0, 0.12, d);',
      '  var col = mix(vec3f(0.85, 0.33, 0.10), vec3f(0.05, 0.35, 0.75), in.sv.w);',
      '  return vec4f(col, a * 0.6);',
      '}'
    ].join('\n');
    var gpu = null;
    function initWebGPU() {
      if (!('gpu' in navigator)) return Promise.resolve(false);
      return (async function () {
        var adapter, device;
        try {
          adapter = await navigator.gpu.requestAdapter();
          if (!adapter) return false;
          device = await adapter.requestDevice();
        } catch (e) { return false; }
        var ctx = canvas.getContext('webgpu');
        if (!ctx) return false;
        var format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device: device, format: format, alphaMode: 'premultiplied' });
        /* 地図の上に出す «添え物» なので、コンセプト単体の半分以下に抑える */
        var N = coarse ? 4000 : 12000;
        var seedArr = new Float32Array(N * 4);
        var posArr = new Float32Array(N * 2);
        for (var i = 0; i < N; i++) {
          seedArr[i * 4] = Math.random(); seedArr[i * 4 + 1] = Math.random();
          seedArr[i * 4 + 2] = Math.random(); seedArr[i * 4 + 3] = Math.random();
          posArr[i * 2] = Math.random(); posArr[i * 2 + 1] = Math.random();
        }
        function storageBuf(data) {
          var b = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
          device.queue.writeBuffer(b, 0, data);
          return b;
        }
        var seedBuf = storageBuf(seedArr);
        var posBuf = storageBuf(posArr);
        var velBuf = device.createBuffer({ size: N * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        var uniformBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        var module = device.createShaderModule({ code: WGSL });
        var computePipeline = await device.createComputePipeline({ layout: 'auto', compute: { module: module, entryPoint: 'cs' } });
        var renderPipeline = await device.createRenderPipeline({
          layout: 'auto',
          vertex: { module: module, entryPoint: 'vs' },
          fragment: { module: module, entryPoint: 'fs', targets: [{ format: format, blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          } }] },
          primitive: { topology: 'triangle-strip' }
        });
        var bindCompute = device.createBindGroup({
          layout: computePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformBuf } },
            { binding: 1, resource: { buffer: seedBuf } },
            { binding: 2, resource: { buffer: posBuf } },
            { binding: 3, resource: { buffer: velBuf } }
          ]
        });
        var bindRender = device.createBindGroup({
          layout: renderPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformBuf } },
            { binding: 1, resource: { buffer: seedBuf } },
            { binding: 2, resource: { buffer: posBuf } }
          ]
        });
        gpu = { device: device, ctx: ctx, N: N, uniformBuf: uniformBuf,
                computePipeline: computePipeline, bindCompute: bindCompute,
                renderPipeline: renderPipeline, bindRender: bindRender };
        tech('cx-tech-engine', 'WebGPU — Compute Shader によるパーティクル（最大12,000粒・Canvas 2D へ自動で切替）');
        startGPULoop();
        return true;
      })().catch(function () { return false; });
    }
    var gpuStart = null;
    function gpuFrame(ts) {
      if (!gpu || !running) return;
      if (!gpuStart) gpuStart = ts;
      var size = fitCanvas(canvas);
      if (!size) return;
      var u = new Float32Array([
        (ts - gpuStart) / 1000, size.w / size.h,
        mouse.x, mouse.y, mouse.active,
        0, size.w, size.h
      ]);
      gpu.device.queue.writeBuffer(gpu.uniformBuf, 0, u);
      var enc = gpu.device.createCommandEncoder();
      var cp = enc.beginComputePass();
      cp.setPipeline(gpu.computePipeline);
      cp.setBindGroup(0, gpu.bindCompute);
      cp.dispatchWorkgroups(Math.ceil(gpu.N / 64));
      cp.end();
      var view = gpu.ctx.getCurrentTexture().createView();
      var rp = enc.beginRenderPass({ colorAttachments: [{ view: view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
      rp.setPipeline(gpu.renderPipeline);
      rp.setBindGroup(0, gpu.bindRender);
      rp.draw(4, gpu.N);
      rp.end();
      gpu.device.queue.submit([enc.finish()]);
    }
    function startGPULoop() {
      if (reduced) { requestAnimationFrame(gpuFrame); return; }
      (function loop(ts) { gpuFrame(ts); requestAnimationFrame(loop); })(0);
    }

    /* ---------- Canvas 2D フォールバック ---------- */
    function init2D() {
      var ctx2 = canvas.getContext('2d');
      if (!ctx2) return;
      tech('cx-tech-engine', 'Canvas 2D — Flow Field（WebGPU 未対応環境向けフォールバック）');
      var N = coarse ? 150 : 300;
      var ps = [];
      for (var i = 0; i < N; i++) {
        ps.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, s: Math.random(), hue: Math.random(), sz: .8 + Math.random() * 2.1 });
      }
      function frame() {
        var size = fitCanvas(canvas);
        if (!size) { if (!reduced) requestAnimationFrame(frame); return; }
        var w = size.w, h = size.h;
        var t = performance.now() / 1000;
        ctx2.clearRect(0, 0, w, h);
        for (var i = 0; i < ps.length; i++) {
          var p = ps[i];
          var a = Math.sin(p.y * 3.1 + t * .35 + p.s * 6.283) * 1.25 + Math.cos(p.x * 2.3 - t * .22) * 1.25;
          var tx = Math.cos(a) * .0016 + .0011 * (.4 + p.s), ty = Math.sin(a) * .0016;
          p.vx += (tx - p.vx) * .055; p.vy += (ty - p.vy) * .055;
          var dx = p.x - mouse.x, dy = p.y - (1 - mouse.y);
          var d2 = dx * dx + dy * dy;
          if (d2 < .09 && d2 > 1e-6) { var d = Math.sqrt(d2); var f = (0.3 - d) * .008; p.vx += dx / d * f; p.vy += dy / d * f; }
          p.x += p.vx; p.y += p.vy;
          if (p.x > 1.02) p.x = -.02; if (p.x < -0.02) p.x = 1.02;
          if (p.y > 1.02) p.y = -.02; if (p.y < -0.02) p.y = 1.02;
          ctx2.beginPath();
          ctx2.arc(p.x * w, (1 - p.y) * h, p.sz * Math.min(window.devicePixelRatio || 1, 1.5), 0, 6.2832);
          ctx2.fillStyle = p.hue < .62 ? 'rgba(216,84,26,.5)' : 'rgba(13,89,191,.45)';
          ctx2.fill();
        }
        if (!reduced && running) requestAnimationFrame(frame);
        else if (!reduced) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    initWebGPU().then(function (ok) { if (!ok) init2D(); }).catch(function () { init2D(); });
  }

  /* ================= エリアガイド区画 ================= */
  function initShowcase() {
    var show = document.querySelector('.tsg-show');
    if (!show) return;

    /* マーキー: つなぎ目のない繰り返し */
    var track = document.getElementById('cx-marquee-track');
    if (track) track.innerHTML += track.innerHTML;

    /* 数字の数え上げ */
    function countUp(el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (reduced || isNaN(target)) { el.textContent = target; return; }
      var t0 = null, dur = 1100;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    var stats = show.querySelector('.cx-stats');
    var counted = false;
    if (stats) {
      if ('IntersectionObserver' in window) {
        var io2 = new IntersectionObserver(function (en) {
          if (en[0].isIntersecting && !counted) {
            counted = true;
            var ns = show.querySelectorAll('[data-count]');
            for (var i = 0; i < ns.length; i++) countUp(ns[i]);
            io2.disconnect();
          }
        }, { threshold: .3 });
        io2.observe(stats);
      } else {
        var ns2 = show.querySelectorAll('[data-count]');
        for (var j = 0; j < ns2.length; j++) countUp(ns2[j]);
      }
    }

    /* エリアのタブ */
    var tabs = Array.prototype.slice.call(show.querySelectorAll('.cx-tab'));
    function selectArea(name, focus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-area') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById('cx-panel-' + t.getAttribute('data-area'));
        if (panel) panel.hidden = !on;
        if (on && focus) t.focus();
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectArea(t.getAttribute('data-area'), false); });
      t.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        if (j !== null) { e.preventDefault(); selectArea(tabs[j].getAttribute('data-area'), true); }
      });
    });
    var gotos = show.querySelectorAll('[data-goto-area]');
    Array.prototype.forEach.call(gotos, function (btn) {
      btn.addEventListener('click', function () {
        selectArea(btn.getAttribute('data-goto-area'), false);
        var areas = document.getElementById('cx-areas');
        if (areas) areas.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      });
    });

    var tm = document.getElementById('cx-tech-motion');
    if (tm) tm.textContent = reduced ? 'prefers-reduced-motion により静止表示' : '有効（粒子の流れ・マーキー・レンズの常時アニメーション）';
  }

  /* ================= 駅舎ステージのレンズ ================= */
  function initLens() {
    var stage = document.getElementById('cx-stage');
    var canvas = document.getElementById('cx-lens');
    var hint = document.getElementById('cx-lens-hint');
    if (!stage || !canvas || !hint) return;
    var supported = !!(window.CanvasRenderingContext2D && ('drawElementImage' in CanvasRenderingContext2D.prototype));
    if (!supported) {
      canvas.remove();
      var fb = document.getElementById('cx-lens-fallback');
      if (fb) fb.hidden = false;
      hint.innerHTML = 'HTML-IN-CANVAS <b class="off">FALLBACK</b> — このブラウザでは通常カード表示';
      tech('cx-tech-hic', '未対応のため通常の DOM カード表示にフォールバック');
      return;
    }
    /* 既定ではフォールバックのカードが見えている（JS が無い・クローラ向け）。
       レンズが使えるときだけ、ここで隠してキャンバスに任せる */
    var fb0 = document.getElementById('cx-lens-fallback');
    if (fb0) fb0.hidden = true;
    hint.innerHTML = 'HTML-IN-CANVAS <b>ACTIVE</b> — DOM カードをキャンバス内でレンズ変形中';
    tech('cx-tech-hic', '有効 — 案内カードを drawElementImage で描画しレンズ変形');

    var card = canvas.querySelector('.cx-lens-card');
    var ctx = canvas.getContext('2d');
    var target = { x: .70, y: .42 }, lensPos = { x: .70, y: .42 };
    var inView = false, failed = false;

    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = (e.clientY - r.top) / r.height;
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { target.x = .70; target.y = .42; }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; }, { threshold: .05 }).observe(stage);
    } else { inView = true; }

    function drawFrame(ts) {
      if (failed) return;
      var r = stage.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var W = Math.max(2, Math.floor(r.width * dpr)), H = Math.max(2, Math.floor(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!inView) { if (!reduced) requestAnimationFrame(drawFrame); return; }

      if (reduced || !ts) { lensPos.x = target.x; lensPos.y = target.y; }
      else {
        lensPos.x += (target.x - lensPos.x) * .08;
        lensPos.y += (target.y - lensPos.y) * .08;
      }
      var t = (ts || 0) / 1000;
      var cx = (lensPos.x + Math.sin(t * .4) * .012) * W;
      var cy = (lensPos.y + Math.cos(t * .3) * .012) * H;
      var R = Math.min(W, H) * .34;
      var cw = card.offsetWidth * dpr, ch = card.offsetHeight * dpr;
      if (cw < 4 || ch < 4) { if (!reduced) requestAnimationFrame(drawFrame); return; }

      try {
        var step = Math.max(3, Math.round(5 * dpr));
        for (var y = 0; y < ch; y += step) {
          var sliceH = Math.min(step, ch - y);
          var dyC = (y + sliceH / 2) - ch / 2;
          var rel = dyC / R;
          if (rel < -1 || rel > 1) continue;
          var s = 1 + .5 * (1 - rel * rel);
          ctx.save();
          ctx.translate(cx, cy + dyC);
          ctx.scale(s, 1 + (s - 1) * .35);
          ctx.drawElementImage(card, 0, y / dpr, cw / dpr, sliceH / dpr, -cw / 2, -sliceH / 2, cw, sliceH);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,176,58,.85)';
        ctx.lineWidth = Math.max(1.2, 1.6 * dpr);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, R * .985, 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = Math.max(2, 3.2 * dpr);
        ctx.stroke();
      } catch (err) {
        failed = true;
        canvas.remove();
        var fb2 = document.getElementById('cx-lens-fallback');
        if (fb2) fb2.hidden = false;
        hint.innerHTML = 'HTML-IN-CANVAS <b class="off">FALLBACK</b> — 描画に失敗したため通常カード表示';
        tech('cx-tech-hic', '描画エラーのためフォールバック表示');
        return;
      }
      if (!reduced) requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
    if (reduced) {
      window.addEventListener('resize', function () { drawFrame(0); });
      stage.addEventListener('pointermove', function () { drawFrame(0); });
    }
  }

  /* ================= 起動（本体の邪魔をしない） ================= */
  function boot() {
    try { initShowcase(); } catch (e) {}
    try { initLens(); } catch (e) {}
    onIdle(function () { try { initParticles(); } catch (e) {} });
  }
  if (document.readyState === 'complete') { onIdle(boot); }
  else { window.addEventListener('load', function () { onIdle(boot); }); }
})();
