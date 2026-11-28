/* Slot #1084 (Website Studio, cinematic scroll V2 - slice A/B): the living intelligence constellation in the intro's
   first viewport. A sphere of nodes placed by a Fibonacci lattice in real 3D, projected with perspective onto a 2D
   canvas: depth sets size, brightness and line weight. The sphere turns slowly about a tilted axis, every node drifts
   on its own small orbit, the whole breathes (radius and light), and signal pulses travel along chosen edges toward the
   core at the centre. Fully formed on the first frame. As the visitor scrolls the first scene away, the network
   contracts toward its core, dims and fades into the sky behind it; scrolling back restores it (the frame is a pure
   function of time and scroll; #1100 eases the scroll input over a few frames, so a wheel notch never jumps the
   network). Reduced motion, no motion-ok or a canvas failure: the page keeps the still SVG sphere
   that the server renders next to the canvas. No WebGL, no library; colours come from the page's own tokens.
   #1101: one stroke per depth bucket and one fill per brightness bucket instead of one call per edge and node, and an
   adaptive frame hold (a slow device draws every second or third frame), so a frame stays short on a phone. #1104: the
   first 40 frames draw at half rate and the animation starts when the browser is idle, for Lighthouse's blocking-time window.
   #1106: the first frame waits for the browser's own layout (a synchronous one forced a full layout inside the script), and
   a device whose frames cost over ~9 ms stops the loop and redraws on scroll, pointer and resize only.
   #1117 (deploy 45071922561: introduction TBT 2610 ms on a slow runner, 155 of 200 on a fast one): the #1106 sensor read
   the frame's JavaScript time alone, while on a machine without a GPU the canvas is rastered on the main thread at the
   frame's commit (trace: FunctionCall 20 ms, Commit 55 ms per frame at 10x CPU), so the loop never left. Now (a) the
   script task does nothing but the feature checks: geometry, the first layout read, the first frame and the loop all
   start from one idle callback; (b) the Long Tasks API (Chromium) - or the gap between frames where it is missing -
   watches the loop's first four seconds: two long frames, or one of 100 ms+, and the loop leaves for still mode, raster
   included; (c) one frame three times the budget leaves at once instead of after ten; (d) the warm-up draws every third
   frame; (e) the neighbour search uses integer cell indices and insertion instead of string keys and sorts. */
(function () {
  'use strict';
  var canvas = document.querySelector('canvas[data-constellation]');
  if (!canvas || !window.requestAnimationFrame) return;
  var doc = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !doc.classList.contains('motion-ok')) return;             /* the still SVG stays */
  var ctx = null;                                                           /* #1117: the context is made in init(), off the script task */
  var wrap = canvas.parentNode, scene = canvas.closest('[data-scene]') || wrap, still = wrap.querySelector('[data-constellation-still]');
  var lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  var phone = false, N = 0, K = 0;                                        /* nodes, neighbours per node (#1104: 300 on a phone); set in init(): innerWidth forces a layout (#1117) */

  function cssColor(name, fallback) { var v = getComputedStyle(doc.body || doc).getPropertyValue(name).trim(); return v || fallback; }
  function rgb(h) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [216, 210, 198]; }
  var platinum, silver, champagne;                                          /* #1209: read in init() - getComputedStyle at evaluation forced a whole-document style recalc in this script's task (CI: a 223 ms long task) */
  function tone(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }

  /* ── geometry: a Fibonacci sphere, seeded so every visit sees the same network (#1117: built from the idle callback) ── */
  var seed = 1084; function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  var nodes = [], edges = [], spokes = [], golden = Math.PI * (3 - Math.sqrt(5));
  function build() {
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
      var shell = 0.86 + rand() * 0.2;                                    /* a little thickness: not every node on one skin */
      nodes.push({ x: Math.cos(th) * rad * shell, y: y * shell, z: Math.sin(th) * rad * shell,
        size: 0.7 + rand() * 1.7, bright: 0.35 + rand() * 0.65, ph: rand() * Math.PI * 2, orb: 0.006 + rand() * 0.014, hot: rand() < 0.07 });
    }
    /* K nearest neighbours in 3D through a coarse grid: O(N·k), not O(N²). #1117: integer cell indices, insertion instead of sorts */
    var G = 8, cells = new Array(G * G * G), cx3 = new Array(N), cy3 = new Array(N), cz3 = new Array(N);
    function axis(v) { return Math.min(G - 1, Math.floor((v + 1.1) / 2.2 * G)); }
    for (var c0 = 0; c0 < N; c0++) {
      var n0 = nodes[c0]; cx3[c0] = axis(n0.x); cy3[c0] = axis(n0.y); cz3[c0] = axis(n0.z);
      var ci = (cx3[c0] * G + cy3[c0]) * G + cz3[c0]; (cells[ci] || (cells[ci] = [])).push(c0);
    }
    var bd = new Array(K), bn = new Array(K);
    for (var a = 0; a < N; a++) {
      var na = nodes[a], cnt = 0;
      for (var gx = -1; gx <= 1; gx++) { var ux = cx3[a] + gx; if (ux < 0 || ux >= G) continue;
        for (var gy = -1; gy <= 1; gy++) { var uy = cy3[a] + gy; if (uy < 0 || uy >= G) continue;
          for (var gz = -1; gz <= 1; gz++) { var uz = cz3[a] + gz; if (uz < 0 || uz >= G) continue;
            var bucket = cells[(ux * G + uy) * G + uz]; if (!bucket) continue;
            for (var bi = 0; bi < bucket.length; bi++) {
              var b = bucket[bi]; if (b === a) continue;
              var dx = na.x - nodes[b].x, dy = na.y - nodes[b].y, dz = na.z - nodes[b].z, d = dx * dx + dy * dy + dz * dz;
              if (cnt < K) cnt++; else if (d >= bd[K - 1]) continue;
              var at = cnt - 1;                                           /* insertion: K is 2 or 3 */
              while (at > 0 && bd[at - 1] > d) { bd[at] = bd[at - 1]; bn[at] = bn[at - 1]; at--; }
              bd[at] = d; bn[at] = b;
            } } } }
      for (var k = 0; k < cnt; k++) if (a < bn[k]) edges.push([a, bn[k]]);
    }
    for (var s = 0; s < N; s++) if (nodes[s].hot) spokes.push({ n: s, t: rand(), speed: 0.0009 + rand() * 0.0012 });   /* hot nodes send pulses to the core */
  }

  /* ── state ── */
  var dpr = Math.min(window.devicePixelRatio || 1, 3)   /* #1088: crisp on 4K / high-DPI */, w = 0, h = 0, cx = 0, cy = 0, R = 0;
  var tiltX = 0, tiltY = 0, targetX = 0, targetY = 0, rot = 0, last = 0, progress = -1, visible = true;
  var running = false, ema = 0, hold = 0, warm = 40, stillMode = false;   /* #1106: stillMode = redraw on scroll / pointer / resize only */
  var stillAt = 24;                                                          /* ms per frame: ~9 raw is a 50 ms task at a phone's 4x; a desktop may spend a 40 fps budget (set in init) */   /* #1101: measured frame cost; frames to skip. #1104: the first 40 frames draw at half rate while the JIT warms */
  var started = 0, longs = 0, lastDrawn = 0, holdWas = 0, WATCH = 4000, lto = null;   /* #1117: long frames (raster included) during the loop's first seconds */
  function goStill() { stillMode = true; running = false; canvas.setAttribute('data-live', 'still'); if (lto) { lto.disconnect(); lto = null; } }
  function longFrame(ms) { longs++; if (running && (longs >= 2 || ms >= 100)) goStill(); }   /* two long frames, or one of 100 ms+ */
  function watch(now) {                                                   /* the Long Tasks API where it exists (Chromium); the gap between frames elsewhere */
    started = now; longs = 0;
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0) {
      try { lto = new PerformanceObserver(function (l) { var es = l.getEntries(); for (var i = 0; i < es.length; i++) if (es[i].startTime >= started) longFrame(es[i].duration); }); lto.observe({ type: 'longtask' }); } catch (e) { lto = null; }
    }
  }
  var edgeBuckets = [[], [], [], [], [], []], nodeBuckets = [];
  for (var nb = 0; nb < 16; nb++) nodeBuckets.push([]);
  function layout() {
    var rect = wrap.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width)); h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2; cy = h * (phone ? 0.46 : 0.5); R = Math.min(w * 0.6, h) * (phone ? 0.44 : 0.47);
  }
  function scrollProgress() {                                              /* 0 while the scene fills the viewport, 1 when it has scrolled away */
    var r = scene.getBoundingClientRect(), vh = window.innerHeight || 800, travel = Math.max(1, r.height - vh);
    return Math.min(1, Math.max(0, -r.top / travel));
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* ── one frame ── */
  var proj = [];
  function frame(now) {
    if (hold > 0) { hold--; if (running) requestAnimationFrame(frame); return; }   /* #1101: a slow device skips frames instead of stalling */
    if (running && started) {                                               /* #1117: the loop's first seconds, where every long frame counts */
      if (now - started > WATCH) { started = 0; if (lto) { lto.disconnect(); lto = null; } }
      else if (!lto && lastDrawn) { var gap = now - lastDrawn - (holdWas + 1) * 16.7; if (gap > 50 && gap < 2000) longFrame(gap + 50); }   /* the previous frame overran its slots (a hidden tab is not a frame) */
    }
    lastDrawn = now;
    if (!last) last = now;
    var dt = Math.min(100, now - last); last = now;
    var want = scrollProgress();                                           /* #1100: ease toward the real scroll position (time constant ~110 ms) */
    progress = (progress < 0) ? want : progress + (want - progress) * (1 - Math.exp(-dt / 110));
    if (Math.abs(want - progress) < 0.0005) progress = want;
    if (progress >= 0.999) { if (visible) { ctx.clearRect(0, 0, w, h); visible = false; } if (running) requestAnimationFrame(frame); return; }
    visible = true;
    var p = ease(progress), fade = 1 - p, contract = 1 - 0.62 * p;        /* the network converges on its core and dims */
    rot += dt * 0.000045;                                                    /* one turn in about six minutes */
    tiltX += (targetX - tiltX) * 0.04; tiltY += (targetY - tiltY) * 0.04;
    var breath = 1 + 0.025 * Math.sin(now * 0.00042), light = 0.82 + 0.18 * Math.sin(now * 0.00042 + 1.2);
    var ax = 0.42 + tiltY * 0.25, cosA = Math.cos(ax), sinA = Math.sin(ax), cr = Math.cos(rot + tiltX * 0.3), sr = Math.sin(rot + tiltX * 0.3);
    var radius = R * breath * contract, focal = 2.6;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < N; i++) {                                           /* rotate about Y (spin) then X (tilt); perspective project */
      var n = nodes[i], o = Math.sin(now * n.orb * 0.1 + n.ph) * 0.02;    /* the node's own small orbit */
      var x = n.x + o, y = n.y - o * 0.6, z = n.z + o;
      var x1 = x * cr - z * sr, z1 = x * sr + z * cr;
      var y2 = y * cosA - z1 * sinA, z2 = y * sinA + z1 * cosA;
      var sc = focal / (focal - z2 * contract);                              /* nearer = larger */
      proj[i] = { x: cx + x1 * radius * sc, y: cy + y2 * radius * sc, d: (z2 + 1) / 2, s: sc };
    }
    /* edges: finer and fainter at the back; one stroke per depth bucket (#1101) */
    ctx.lineWidth = 0.7;
    for (var eb = 0; eb < 6; eb++) edgeBuckets[eb].length = 0;
    for (var e = 0; e < edges.length; e++) { var A0 = proj[edges[e][0]], B0 = proj[edges[e][1]]; edgeBuckets[Math.max(0, Math.min(5, Math.floor((A0.d + B0.d) * 3)))].push(e); }   /* #1105: d can dip just below 0 (shell + orbit), clamp */
    for (var eb2 = 0; eb2 < 6; eb2++) {
      var lst = edgeBuckets[eb2]; if (!lst.length) continue;
      ctx.strokeStyle = tone(silver, (0.07 + ((eb2 + 0.5) / 6) * 0.3) * fade * light);
      ctx.beginPath();
      for (var li = 0; li < lst.length; li++) { var A = proj[edges[lst[li]][0]], B = proj[edges[lst[li]][1]]; ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); }
      ctx.stroke();
    }
    /* pulses toward the core */
    for (var q = 0; q < spokes.length; q++) {
      var sp = spokes[q]; sp.t += dt * sp.speed; if (sp.t > 1) sp.t -= 1;
      var P = proj[sp.n], px = P.x + (cx - P.x) * sp.t, py = P.y + (cy - P.y) * sp.t, al = Math.sin(sp.t * Math.PI) * 0.9 * fade;
      ctx.strokeStyle = tone(champagne, al * 0.35); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = tone(champagne, al); ctx.beginPath(); ctx.arc(px, py, 1.6 + 1.2 * P.s, 0, 6.2832); ctx.fill();
    }
    /* nodes: one fill per brightness bucket and colour (#1101); hot halos drawn singly (few) */
    for (var nb0 = 0; nb0 < 16; nb0++) nodeBuckets[nb0].length = 0;
    for (var j = 0; j < N; j++) {
      var Q0 = proj[j], nd0 = nodes[j];
      var alpha0 = Math.min(1, (0.22 + Q0.d * 0.95) * nd0.bright * 1.25) * fade * light;
      nodeBuckets[(nd0.hot ? 8 : 0) + Math.max(0, Math.min(7, Math.floor(alpha0 * 8)))].push(j);
    }
    for (var nb1 = 0; nb1 < 16; nb1++) {
      var nl = nodeBuckets[nb1]; if (!nl.length) continue;
      ctx.fillStyle = tone(nb1 >= 8 ? champagne : platinum, ((nb1 % 8) + 0.5) / 8);
      ctx.beginPath();
      for (var ni = 0; ni < nl.length; ni++) { var Q = proj[nl[ni]], nd = nodes[nl[ni]], rr = (nd.size * (0.55 + Q.d * 0.9)) * Q.s * (phone ? 0.9 : 1); ctx.moveTo(Q.x + rr, Q.y); ctx.arc(Q.x, Q.y, rr, 0, 6.2832); }
      ctx.fill();
    }
    for (var hj = 0; hj < spokes.length; hj++) {
      var H = proj[spokes[hj].n], hn = nodes[spokes[hj].n];
      if (H.d > 0.5) { var hr = (hn.size * (0.55 + H.d * 0.9)) * H.s * 3, ha = Math.min(1, (0.22 + H.d * 0.95) * hn.bright * 1.25) * fade * light * 0.25;
        ctx.fillStyle = tone(champagne, ha); ctx.beginPath(); ctx.arc(H.x, H.y, hr, 0, 6.2832); ctx.fill(); }
    }
    /* the core: a soft light the pulses arrive at */
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.28);
    g.addColorStop(0, tone(platinum, 0.55 * light * (0.6 + 0.4 * p))); g.addColorStop(0.35, tone(silver, 0.18 * light)); g.addColorStop(1, tone(silver, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, radius * 0.28, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    var cost = performance.now() - now;                                        /* #1101: adapt - hold frames when a frame runs long */
    ema = ema ? ema * 0.85 + cost * 0.15 : cost;
    hold = ema > 20 ? 2 : ema > 10 ? 1 : 0;
    if (warm > 0) { warm--; if (hold < 2) hold = 2; }                       /* #1104: a lower rate until the first frames have settled (#1117: every third frame, was every second) */
    holdWas = hold;
    if (!stillMode && ((warm < 30 && ema > stillAt) || cost > stillAt * 3)) goStill();   /* #1106: a frame over the budget would be a long task: stop the loop, redraw on input. #1117: one frame three times over leaves at once */
    if (running) requestAnimationFrame(frame);
  }
  var queued = false;
  function redraw() { if (!stillMode || queued) return; queued = true; requestAnimationFrame(function (t) { queued = false; hold = 0; frame(t); }); }   /* #1106: one frame per input while still */

  function onPointer(e) { var t = e.touches ? e.touches[0] : e; if (!t || !w) return; targetX = (t.clientX / w - 0.5) * 2; targetY = (t.clientY / h - 0.5) * 2; }
  function onLeave() { targetX = 0; targetY = 0; }
  function init() {                                                        /* #1117: everything waits for an idle moment; the script task forced no layout and built nothing */
    phone = window.innerWidth < 700;                                       /* the one layout-forcing read, inside the idle callback */
    platinum = rgb(cssColor('--platinum', '#E6E6EA')); silver = rgb(cssColor('--silver', '#4B6BFF')); champagne = rgb(cssColor('--champagne', '#FF7A1A'));
    N = phone ? 300 : (lowPower ? 620 : 900); K = phone ? 2 : 3; proj = new Array(N);
    if (phone || lowPower) { dpr = Math.min(dpr, 1.25); stillAt = 9; }    /* #1105: a phone fills a quarter of the pixels; the fill rate was the frame cost */
    ctx = canvas.getContext('2d');
    if (!ctx) return;                                                      /* the still SVG stays */
    build();
    window.addEventListener('resize', function () { layout(); redraw(); });
    wrap.addEventListener('pointermove', function (e) { onPointer(e); redraw(); }, { passive: true });
    wrap.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', redraw, { passive: true });   /* #1106: the contraction still follows the scroll in still mode */
    requestAnimationFrame(function (t) {                                   /* inside the browser's own frame: one layout read (#1106), the still swapped for the first frame, then the loop */
      layout();
      if (still) still.setAttribute('hidden', '');
      canvas.setAttribute('data-live', '1');
      running = true; watch(t); frame(t); last = 0;
    });
  }
  /* #1209 (deploy 45999739446: introduction TBT 1503 ms, perf 73 on the CI runner): the long-task watch is asynchronous, so a
     runner without a GPU still drew two or three 150-370 ms frames before the loop left - inside the load window that
     blocking time is counted in. The live network now starts on the visitor's first sign of presence (pointer, touch,
     wheel, key, scroll) (#1213: no timed fallback). Until then the still SVG sphere the
     server renders is what shows - the same picture, not moving yet. Nothing else changes: the same watch, the same still mode. */
  var begun = false, EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll'];
  function begin() {
    if (begun) return; begun = true;
    for (var ev = 0; ev < EVENTS.length; ev++) window.removeEventListener(EVENTS[ev], begin, true);
    if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 1200 }); else setTimeout(init, 400);
  }
  for (var ev0 = 0; ev0 < EVENTS.length; ev0++) window.addEventListener(EVENTS[ev0], begin, { capture: true, passive: true });
  /* #1213 (deploy 46029775909: introduction TBT 4238 ms): the "5 s after load" fallback fired inside a slow runner's still-open
     trace and its long frames kept the trace open - a cascade. The live network now starts on the visitor's first input only;
     a visitor who never moves sees the still sphere, which is the same picture. */
})();
