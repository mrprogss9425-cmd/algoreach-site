/* Slot #1085 (cinematic scroll V2, slices C-F): the shared scroll-animation system. A chapter is a tall section with a
   sticky stage; its progress (0 when the stage first fills the viewport, 1 when the section has scrolled away) is the
   only input. Every panel [data-fly] inside it owns a window [a,b] of that progress and a direction: it enters during
   the first part of its window, holds, and leaves during the last part, so the next panel enters before the previous
   one has gone. Everything is a pure function of the scroll position, so scrolling back plays it backwards; nothing
   hijacks the wheel. Only transforms and opacity change (GPU-composited); layout is read once per frame per chapter.
   Reduced motion, no motion-ok or no JavaScript: the stylesheet lays the panels out as a plain column.
   Slot #1086 (V2.1): a chapter with [data-hold] keeps its panels once they have entered, and each panel may name a settle
   offset [data-fly-end="x%,y%,scale"] so the screens converge into one composition; a panel with [data-zoom="x%,y%,scale"]
   magnifies that region of its capture during the middle of its hold, with a note [data-zoom-note] fading in beside it.
   Slot #1100 (owner 22 Nov: "more frames per scroll", "scroll rate ... reassessed"): the scroll position is no longer
   applied raw. Each chapter keeps a smoothed progress that follows the real one with a short time constant, and a
   requestAnimationFrame loop runs while anything is still settling, so one wheel notch becomes a dozen in-between
   frames instead of one jump. Panels enter over 32 % of their window and leave over the last 28 %, the stage is taller
   per panel (intro.css), and a thin rail [data-rail] under the stage shows how far through the chapter the reader is.
   On load the smoothed value snaps to the real one, so a refresh mid-page shows the right frame at once.
   Slot #1173 (measure first, 25 Nov): the first placement was one 434 ms task at 4x CPU on a phone, three forced layouts
   inside it. The chapters are content-visibility: auto (#1117), and the phone room under the copy was measured in every
   chapter, so reading it laid out each off-screen chapter. Where the browser has size containers the room is now CSS
   (100cqh, intro.css) and nothing is measured; elsewhere, and for the converge stage, inner boxes are read only for a
   chapter near the viewport. A frame reads every position before it sets any style.
   #1177 (25 Nov, measured): the three sky layers drifted on a CSS scroll timeline (intro.css drift1-3). On a desktop
   without GPU compositing that held scrolling near 22 fps (52 with the sky still); the same drift set here as a plain
   transform, in this frame's write phase, runs near 50. Same layers, same distances, same browsers; the stylesheet
   drift stays as the fallback when this script does not take over (html.sky-js absent). */
(function () {
  'use strict';
  var doc = document.documentElement;
  if (!doc.classList.contains('motion-ok') || !window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var chapters = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  if (!chapters.length) return;
  var CQ = !!(window.CSS && CSS.supports && CSS.supports('container-type', 'size'));   /* #1173: the room is CSS where it can be */
  var VW = window.innerWidth, VH = window.innerHeight || 800;            /* #1173: read once per frame, in the read phase; first read before fly-on changes the page */
  doc.classList.add('fly-on');
  var SKY = [], skyP = -1, SY = 0, SR = 1;                                 /* #1177: the sky drift, driven from this frame loop (see frame) */
  if (window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()')) {   /* the same browsers the stylesheet drift reached */
    SKY = [['l1', 0, -6], ['l2', -2, -12], ['l3', 2, -20]].map(function (a) { return { el: document.querySelector('.intro__sky .' + a[0]), dx: a[1], dy: a[2] }; })
      .filter(function (s) { return s.el; });                               /* x, y in % of the layer at the bottom of the page = intro.css drift1-3 */
    if (SKY.length) doc.classList.add('sky-js');                            /* the stylesheet's scroll-timeline drift stands down */
  }
  var narrow = function () { return VW < 900; };
  var ENTER = 0.32, LEAVE = 0.28, TAU = 110;                                /* #1100: entry share, exit share, smoothing time constant (ms) */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }   /* cubic in-out: gentler at both ends than the old quadratic */
  function window_(el, fallback) { var w = ((narrow() && el.getAttribute('data-window-narrow')) || el.getAttribute('data-window') || fallback).split(','); return [parseFloat(w[0]) || 0, parseFloat(w[1]) || 1]; }   /* #1118: a note may name a narrower window for phones */
  function triple(el, name) { var v = el.getAttribute(name); if (!v) return null; var p = v.split(',').map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 1]; }

  var items = chapters.map(function (ch) {
    var panels = Array.prototype.slice.call(ch.querySelectorAll('[data-fly]')).map(function (el, i, all) {
      var n = all.length, a = i / n, b = (i + 1) / n + (i + 1 < n ? 0.12 : 0);     /* overlap: the next one enters before this leaves */
      return { el: el, w: window_(el, a.toFixed(3) + ',' + Math.min(1, b).toFixed(3)), dir: el.getAttribute('data-fly') || (i % 2 ? 'left' : 'right'), state: '',
        end: triple(el, 'data-fly-end'), zoom: triple(el, 'data-zoom'), hold: ch.hasAttribute('data-hold') };
    });
    var notes = Array.prototype.slice.call(ch.querySelectorAll('[data-fly-text]')).map(function (el) { return { el: el, w: window_(el, '0,1'), state: '', hold: ch.hasAttribute('data-hold') }; });
    return { el: ch, panels: panels, notes: notes, rail: ch.querySelector('[data-rail]'), p: -1, target: 0, last: -1 };
  });

  var near = false;
  function progress(el) {
    var r = el.getBoundingClientRect(), vh = VH, travel = Math.max(1, r.height - vh);
    near = r.top < vh * 1.5 && r.bottom > -vh * 0.5;                        /* #1173: rendered (content-visibility) - inner boxes may be read */
    if (r.bottom < -vh || r.top > vh * 2) return r.top > 0 ? 0 : 1;        /* far away: no work */
    return clamp(-r.top / travel);
  }
  function setState(o, s) { if (o.state !== s) { o.state = s; o.el.setAttribute('data-state', s); } }
  function place(p, el, w, dir, isPanel, pn) {
    var a = w[0], b = w[1], local = (p - a) / Math.max(0.001, b - a), st = el.style;
    var hold = !!(pn && pn.hold), end = pn && pn.end, zoom = pn && pn.zoom;
    if (hold && local >= 1) local = 0.5;                                     /* a held panel stays where it settled */
    if (local <= 0 || local >= 1) {                                         /* outside its window: parked */
      st.setProperty('--op', '0'); st.setProperty('--sc', '0.96'); st.setProperty('--tx', '0px'); st.setProperty('--ty', '0px'); st.setProperty('--rot', '0deg');
      return local <= 0 ? 'before' : 'after';
    }
    var enter = ease(clamp(local / ENTER)), leave = hold ? 0 : ease(clamp((local - (1 - LEAVE)) / LEAVE)), vert = narrow() || dir === 'up' || dir === 'deep';
    var sign = dir === 'left' ? -1 : 1, dist = isPanel ? (vert ? 80 : 190) : 26;
    var tx = vert ? 0 : sign * dist * (1 - enter) - sign * dist * 0.45 * leave;
    var ty = vert ? dist * (1 - enter) - dist * 0.5 * leave : 12 * (1 - enter) - 20 * leave;
    var rot = isPanel && !vert ? (-sign * 13 * (1 - enter) + sign * 6 * leave) : 0;
    var sc = isPanel ? (dir === 'deep' ? 0.74 + 0.26 * enter : 0.91 + 0.09 * enter) * (1 - 0.06 * leave) : 1;
    var op = Math.min(enter, 1 - leave);
    if (end) {                                                               /* converge: settle at an offset inside the stage */
      var box = pn.box || { width: 0, height: 0 }, ex = box.width * end[0] / 100, ey = box.height * end[1] / 100;   /* #1173: measured in the read phase */
      if (narrow()) { ex *= 0.9; ey *= 0.55; }                               /* #1118: the composition pulls in on a phone's portrait stage */
      tx = tx * (1 - enter) + ex * enter; ty = ty * (1 - enter) + ey * enter; sc = sc * (1 - enter) + end[2] * enter;
    }
    if (zoom && isPanel) {                                                   /* zoom into one region during the middle of the hold */
      var z = hold ? 0 : ease(clamp((local - 0.4) / 0.22)) * (1 - ease(clamp((local - 0.66) / 0.08)));
      st.setProperty('--zs', (1 + (zoom[2] - 1) * z).toFixed(3)); st.setProperty('--zx', zoom[0] + '%'); st.setProperty('--zy', zoom[1] + '%'); st.setProperty('--zn', z.toFixed(3));
    }
    st.setProperty('--tx', tx.toFixed(1) + 'px'); st.setProperty('--ty', ty.toFixed(1) + 'px'); st.setProperty('--rot', rot.toFixed(2) + 'deg');
    st.setProperty('--sc', sc.toFixed(3)); st.setProperty('--op', op.toFixed(3));
    return leave > 0 ? 'leaving' : enter < 1 ? 'entering' : 'settled';
  }
  function measure(it) {                                                    /* #1173: the read phase for one chapter - no writes here */
    it.target = progress(it.el);
    it.phNew = 0;
    if (!near) return;                                                      /* #1173: never lay out an off-screen chapter to read inside it */
    if (!CQ && narrow() && !it.ph && it.panels.length) {                    /* #1118: the room under the copy, measured once (again after a resize); #1173: only without size containers */
      var pb = it.panels[0].el.parentNode.getBoundingClientRect().height;
      if (pb > 0) it.phNew = pb;
    }
    for (var i = 0; i < it.panels.length; i++) { var pn = it.panels[i]; if (pn.end) pn.box = pn.el.parentNode.getBoundingClientRect(); }
  }
  function draw(it, p) {
    it.el.style.setProperty('--p', p.toFixed(4));
    if (it.rail) it.rail.style.setProperty('--p', p.toFixed(4));
    for (var i = 0; i < it.panels.length; i++) { var pn = it.panels[i]; setState(pn, place(p, pn.el, pn.w, pn.dir, true, pn)); }
    for (var j = 0; j < it.notes.length; j++) { var nt = it.notes[j]; setState(nt, place(p, nt.el, nt.w, 'up', false, nt)); }
  }

  /* #1100: the loop. Targets are read from the scroll position; each chapter's shown progress eases toward its target
     with time constant TAU, frame after frame, until every chapter has settled; the loop then sleeps until the next
     scroll or resize. A chapter far from the viewport snaps (no work for what cannot be seen). */
  var running = false, lastT = 0;
  function frame(now) {
    var dt = lastT ? Math.min(64, now - lastT) : 16; lastT = now;
    var k = 1 - Math.exp(-dt / TAU), busy = false, c, it;
    VW = window.innerWidth; VH = window.innerHeight || 800;
    for (c = 0; c < items.length; c++) measure(items[c]);                   /* #1173: read every chapter first ... */
    if (SKY.length) { SY = window.pageYOffset || 0; SR = Math.max(1, doc.scrollHeight - doc.clientHeight); }   /* #1177: read phase */
    for (c = 0; c < items.length; c++) {                                    /* ... then write */
      it = items[c]; var t = it.target;
      if (it.phNew) { it.ph = it.phNew; it.el.style.setProperty('--ph', Math.round(it.phNew) + 'px'); it.again = true; busy = true; }   /* the room changed: draw again next frame with fresh boxes */
      if (it.p < 0 || t === 0 || t === 1 && it.p > 0.995) it.p = t;        /* first frame, or out of view: snap */
      else it.p += (t - it.p) * k;
      if (Math.abs(t - it.p) < 0.0004) it.p = t; else busy = true;
      if (it.p !== it.last) { it.last = it.p; draw(it, it.p); }
      if (it.again) { it.again = false; it.last = -1; }
    }
    if (SKY.length) {                                                       /* #1177: the sky follows the scroll exactly, as the timeline did */
      var sp = Math.round(clamp(SY / SR) * 10000) / 10000;
      if (sp !== skyP) { skyP = sp; for (c = 0; c < SKY.length; c++) SKY[c].el.style.transform = 'translate(' + (-50 + SKY[c].dx * sp).toFixed(3) + '%, ' + (SKY[c].dy * sp).toFixed(3) + '%)'; }
    }
    if (busy) requestAnimationFrame(frame); else { running = false; lastT = 0; }
  }
  function wake() { if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', function () { items.forEach(function (it) { it.last = -1; it.p = -1; it.ph = 0; }); wake(); });
  if (window.requestIdleCallback) requestIdleCallback(wake, { timeout: 800 }); else setTimeout(wake, 200);   /* #1104: the first placement waits for an idle moment */
})();
