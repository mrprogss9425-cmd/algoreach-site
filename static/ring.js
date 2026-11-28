/* Slot #1074 (W-12): the signal ring. A torus of points drawn on a 2D canvas: every point stands for a source or an
   event the engine reads. It reads your presence: the ring tilts toward the pointer, breathes with the scroll, and
   settles when you dwell. It is grounded: a soft contact shadow sits under it and a key light falls from the top left,
   so it rests on the surface instead of floating. No WebGL, no library. Reduced motion or a low-power device gets one
   still frame; without JavaScript the page keeps its SVG constellation. Colours come from the page's own tokens.
   #1103: points are binned by depth and drawn as one fill per (depth bin, colour, light) group instead of a sort and a
   fill per point; the shadow gradients are cached; a slow device holds frames. Lighthouse's /home/ blocking time. */
(function () {
  'use strict';
  var canvases = document.querySelectorAll('canvas[data-ring]');
  if (!canvases.length || !window.requestAnimationFrame) return;
  var doc = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  var still = reduce || !doc.classList.contains('motion-ok');

  function color(name, fallback) {
    var v = getComputedStyle(doc.body || doc).getPropertyValue(name).trim();
    return v || fallback;
  }
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [205, 176, 124];
  }

  canvases.forEach(function (canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var phone = window.innerWidth < 700;
    var N = still ? 1400 : (phone ? 640 : lowPower ? 700 : 2600);   /* #1103: fewer points on a phone */
    var champagne = hexToRgb(color('--champagne', '#CDB07C')), platinum = hexToRgb(color('--platinum', '#BFC3C9'));
    var dpr = Math.min(window.devicePixelRatio || 1, 3);   /* #1088: crisp on 4K / high-DPI */
    var w = 0, h = 0, cx = 0, cy = 0, R = 0, r = 0;
    var pts = [];
    var tiltX = 0, tiltY = 0, targetX = 0, targetY = 0, spin = 0, breath = 0, dwell = 0, last = 0, seen = false;
    var BINS = 10, groups = [], ema = 0, hold = 0, gkey = -1, gFloor = null, gCore = null, gPool = null;   /* #1103 */
    for (var gi = 0; gi < BINS * 6; gi++) groups.push([]);

    function layout() {
      var rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width)); h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2; cy = h * 0.5; R = Math.min(w * 0.8, h) * 0.38; r = R * 0.42;
    }
    function seed() {
      pts = [];
      var g = 2.399963229728653;  /* golden angle: even cover of the surface */
      for (var i = 0; i < N; i++) {
        var u = i * g, v = i * 0.7137 + Math.sin(i * 0.013) * 1.7;
        pts.push({ u: u, v: v, s: 0.6 + 0.9 * ((i * 7919) % 97) / 97, spark: i % 23 === 0, jitter: (i % 13) / 13 });
      }
    }
    /* torus point -> screen. ax/ay are the tilt angles; the ring sits slightly top-down so its underside faces the shadow */
    function project(p, t, ax, ay) {
      var rr = r * (0.72 + 0.28 * Math.sin(p.v * 2.0 + t * 0.6 + p.jitter));
      var x = (R + rr * Math.cos(p.v)) * Math.cos(p.u + spin), y = (R + rr * Math.cos(p.v)) * Math.sin(p.u + spin), z = rr * Math.sin(p.v);
      /* tilt: rotate around x then y */
      var y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax);
      var x2 = x * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
      var scale = 1 + z2 / (R * 4.5);
      return { x: cx + x2 * scale, y: cy + y1 * 0.78 * scale, z: z2, nx: Math.cos(p.v), lit: (-(x2) * 0.6 - y1 * 0.8 + z2 * 0.3) / (R + r) };
    }
    function shadow(ax, sy) {
      sy = Math.round(sy / 2) * 2;                                             /* #1103: gradients are rebuilt only when the ground line moves */
      if (gkey !== sy) {
        gkey = sy;
        /* the floor: a faint lighter sheet at ground level, so the shadow has a surface to fall on */
        gFloor = ctx.createRadialGradient(cx, sy, 0, cx, sy, R * 2.4);
        gFloor.addColorStop(0, 'rgba(255,255,255,0.055)'); gFloor.addColorStop(0.6, 'rgba(255,255,255,0.02)'); gFloor.addColorStop(1, 'rgba(255,255,255,0)');
        /* contact shadow: a tight dark core under the ring and a wider soft halo; it squashes as the ring tilts up */
        gCore = ctx.createRadialGradient(cx, sy, 0, cx, sy, R * 1.25);
        gCore.addColorStop(0, 'rgba(0,0,0,0.78)'); gCore.addColorStop(0.4, 'rgba(0,0,0,0.42)'); gCore.addColorStop(1, 'rgba(0,0,0,0)');
        /* a faint light pool on the surface behind the ring (the key light bleeding onto the ground) */
        gPool = ctx.createRadialGradient(cx - R * 0.3, sy - 6, 0, cx - R * 0.3, sy - 6, R * 1.6);
        gPool.addColorStop(0, 'rgba(' + champagne.join(',') + ',0.06)'); gPool.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.save(); ctx.translate(cx, sy); ctx.scale(1, 0.22); ctx.translate(-cx, -sy);
      ctx.fillStyle = gFloor; ctx.beginPath(); ctx.arc(cx, sy, R * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      var k = 1 - Math.min(0.5, Math.abs(ax)) * 0.6;
      ctx.save(); ctx.translate(cx, sy); ctx.scale(1, 0.16 * k); ctx.translate(-cx, -sy);
      ctx.fillStyle = gCore; ctx.beginPath(); ctx.arc(cx, sy, R * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(cx, sy); ctx.scale(1, 0.12); ctx.translate(-cx, -sy);
      ctx.fillStyle = gPool; ctx.beginPath(); ctx.arc(cx - R * 0.3, sy - 6, R * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      var ax = -0.95 + tiltY * 0.35 + Math.sin(breath) * 0.03;   /* resting tilt: we look at the ring from above */
      var ay = tiltX * 0.45;
      var out = new Array(pts.length), low = 0;
      for (var i = 0; i < pts.length; i++) { out[i] = project(pts[i], t, ax, ay); if (out[i].y > low) low = out[i].y; }
      shadow(ax, low + 6);                                     /* the shadow touches the ring's lowest point: grounded, not floating */
      /* #1103: far bins first so near bins paint over them; one fill per (depth bin, colour, light) group, no sort */
      for (var g0 = 0; g0 < groups.length; g0++) groups[g0].length = 0;
      for (var j = 0; j < out.length; j++) {
        var qj = out[j], depthj = Math.max(0, Math.min(0.999, (qj.z / (R + r) + 1) / 2));
        var litj = Math.max(0, Math.min(0.999, 0.35 + qj.lit * 0.9));
        groups[Math.floor(depthj * BINS) * 6 + (pts[j].spark ? 3 : 0) + Math.floor(litj * 3)].push(j);
      }
      for (var g = 0; g < groups.length; g++) {
        var lst = groups[g]; if (!lst.length) continue;
        var bin = Math.floor(g / 6), spark = (g % 6) >= 3, litb = g % 3;
        var depth = (bin + 0.5) / BINS, c = spark ? platinum : champagne;
        var a = Math.min(1, 0.26 + depth * 0.5 + ((litb + 0.5) / 3) * 0.3);
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
        ctx.beginPath();
        for (var li = 0; li < lst.length; li++) {
          var q = out[lst[li]], p = pts[lst[li]], size = p.s * (0.9 + depth * 1.5) * (spark ? 1.5 : 1);
          ctx.rect(q.x - size / 2, q.y - size / 2, size, size);
        }
        ctx.fill();
      }
    }
    function frame(now) {
      if (hold > 0) { hold--; if (seen) requestAnimationFrame(frame); return; }   /* #1103: a slow device skips frames instead of stalling */
      var dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
      /* dwell: the longer the pointer rests, the calmer the ring */
      dwell = Math.min(1, dwell + dt * 0.25);
      tiltX += (targetX - tiltX) * 0.06; tiltY += (targetY - tiltY) * 0.06;
      var calm = 0.35 + 0.65 * (1 - dwell);
      spin += dt * 0.12 * calm; breath += dt * 0.9 * calm;
      draw(now / 1000);
      var cost = performance.now() - now;                        /* #1103: adapt - hold frames when a frame runs long */
      ema = ema ? ema * 0.85 + cost * 0.15 : cost;
      hold = ema > 20 ? 2 : ema > 10 ? 1 : 0;
      if (seen) requestAnimationFrame(frame);
    }
    layout(); seed();
    if (still) { draw(0); return; }
    window.addEventListener('resize', function () { layout(); draw(last / 1000); });
    window.addEventListener('pointermove', function (e) {
      var rect = canvas.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
      targetY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
      dwell = 0;
    }, { passive: true });
    window.addEventListener('scroll', function () {
      /* the scroll breathes the ring: progress through the first viewport opens it, then it settles */
      var p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
      targetY = Math.max(-1, Math.min(1, targetY + 0)); breath += 0.02; spin += p * 0.004; dwell = Math.min(dwell, 0.6);
    }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { var was = seen; seen = e.isIntersecting; if (seen && !was) { last = performance.now(); requestAnimationFrame(frame); } });
      }, { threshold: 0.05 }).observe(canvas);
    } else { seen = true; requestAnimationFrame(frame); }
  });
})();
