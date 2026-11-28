/* Slot #1066: public site behaviour. No dependencies, no network except the beta form post. */
(function () {
  'use strict';
  var root = document.documentElement;

  /* theme: system by default; a tap cycles system -> dark -> light; stored in this browser only */
  var toggle = document.querySelector('[data-theme-toggle]');
  function current() { return root.getAttribute('data-theme') || 'system'; }
  function paint() {
    if (!toggle) return;
    var t = current();
    var next = t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system';
    var nameOf = { system: 'follows your system', dark: 'dark', light: 'light' };
    toggle.setAttribute('aria-label', 'Theme: ' + nameOf[t] + '. Switch to ' + (next === 'system' ? 'system' : next));   /* #1077 */
    toggle.title = 'Switch to ' + (next === 'system' ? 'system theme' : next + ' theme');
    toggle.querySelector('span:last-child').textContent = t === 'system' ? 'Theme' : (t === 'dark' ? 'Dark' : 'Light');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = current() === 'system' ? 'dark' : current() === 'dark' ? 'light' : 'system';
      if (next === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
      try { if (next === 'system') localStorage.removeItem('ar-theme'); else localStorage.setItem('ar-theme', next); } catch (e) {}
      paint();
    });
    paint();
  }

  /* phone menu */
  var navToggle = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      document.body.classList.toggle('nav-open', !open);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        navToggle.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); navToggle.focus();
      }
    });
    /* #1218: a tap outside the open panel (on the dim scrim) closes it; the toggle reads "Close" while open */
    var navLabel = navToggle.querySelector('.nav-toggle__label');
    var syncLabel = function () { if (navLabel) navLabel.textContent = navToggle.getAttribute('aria-expanded') === 'true' ? 'Close' : 'Menu'; };
    navToggle.addEventListener('click', syncLabel);
    document.addEventListener('click', function (e) {
      if (navToggle.getAttribute('aria-expanded') !== 'true') return;
      if (nav.contains(e.target) || navToggle.contains(e.target)) return;
      navToggle.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); syncLabel();
    });
  }

  /* #1068 intro: reveals and scene dots. Static without JS; still under reduced motion. */
  var scenes = document.querySelectorAll('[data-scene]');
  if (scenes.length && 'IntersectionObserver' in window) {
    var reveals = document.querySelectorAll('.reveal, [data-observe]');
    function svgAnim(el, on) {                                     /* #1101: SVG animations (the map's and graph's pulses) tick only while their figure is on screen */
      el.querySelectorAll('svg').forEach(function (s) { try { if (on) s.unpauseAnimations(); else s.pauseAnimations(); } catch (err) {} });
    }
    var io = new IntersectionObserver(function (es) {           /* #1071: panes appear and vanish again as they pass */
      es.forEach(function (e) { e.target.classList.toggle('is-in', e.isIntersecting); svgAnim(e.target, e.isIntersecting); });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
    /* #1117: no synchronous first pass any more. It read every reveal's rectangle inside the script task and forced the
       whole page's first layout there (a 200 ms task at 4x CPU; 4 s at 10x); inside a section the browser skips
       (intro.css content-visibility) the read forced that section too. The observer's initial delivery, one frame after
       the first paint, marks what is on screen and pauses the SVG pulses off it; the arrival's reveals animate by themselves. */
    var dots = document.querySelectorAll('[data-dot]');
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.getAttribute('data-scene');
        dots.forEach(function (d) { if (d.getAttribute('data-dot') === id) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      });
    }, { threshold: 0.5 });
    scenes.forEach(function (s) { so.observe(s); });
  }
  /* #1100: the introduction opens on every visit and every refresh (owner 22 Nov); nothing is remembered about it */

  /* #1118 (owner 23 Nov, phone view): the intro's strip frosts once the page has scrolled (legible over the chapters) and
     its measured height feeds --strip-h, so a chapter's copy starts below it. Measured inside the browser's own frame
     (#1117: never a layout read in the script task) and again on resize. */
  var strip = document.querySelector('.intro__strip');
  if (strip) {
    var frosted = null;
    var frost = function () { var f = (window.scrollY || window.pageYOffset || 0) > 24; if (f !== frosted) { frosted = f; strip.classList.toggle('is-scrolled', f); } };
    var measure = function () { root.style.setProperty('--strip-h', Math.round(strip.getBoundingClientRect().height) + 'px'); frost(); };
    window.addEventListener('scroll', frost, { passive: true });
    window.addEventListener('resize', function () { requestAnimationFrame(measure); });
    if (window.requestAnimationFrame) requestAnimationFrame(measure); else measure();
  }

  /* #1171 tabs: [data-tabs] holds [role=tab] buttons and [data-panel] panels; a tap shows one panel (data-hidden on the rest),
     arrows move between tabs; a clip in a hidden panel is paused. Without JS every panel stays visible (no data-hidden styling). */
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var tabs = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(box.querySelectorAll('[data-panel]'));
    if (!tabs.length || !panels.length) return;
    function show(id, focus) {
      tabs.forEach(function (t) { var on = t.getAttribute('data-tab') === id; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      panels.forEach(function (p) {
        var on = p.getAttribute('data-panel') === id;
        if (on) p.removeAttribute('data-hidden'); else p.setAttribute('data-hidden', '');
        if (!on) p.querySelectorAll('video').forEach(function (v) { if (!v.paused) v.pause(); });
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t.getAttribute('data-tab'), false); });
      t.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (j < 0) return; e.preventDefault(); j = (j + tabs.length) % tabs.length; show(tabs[j].getAttribute('data-tab'), true);
      });
    });
  });

  /* #1100 tutorials: a silent clip plays while it is on screen and pauses when it leaves; nothing downloads until then.
     Reduced motion, no IntersectionObserver or a failed play(): the clip waits for its own controls. */
  var clips = document.querySelectorAll('video[data-tutorial]');
  if (clips.length && 'IntersectionObserver' in window && root.classList.contains('motion-ok')) {
    var vo = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: [0, 0.6] });
    clips.forEach(function (v) { vo.observe(v); });
  }

  /* #1071 terminal coming-soon: real counters from the engine's pulse; static export falls back to the build snapshot */
  document.querySelectorAll('[data-pulse]').forEach(function (pulse) {
  if (window.fetch) {
    var src = pulse.getAttribute('data-pulse-src'), fb = pulse.getAttribute('data-pulse-fallback');
    var asof = pulse.querySelector('[data-pulse-asof]');
    function fill(d, stale) {
      pulse.querySelectorAll('[data-pulse-field]').forEach(function (el) {
        var path = el.getAttribute('data-pulse-field').split('.'), v = d;
        for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
        el.textContent = (v == null || v === '') ? '—' : String(v);
      });
      if (asof) asof.textContent = d.available ? ('Engine counters as of ' + (d.as_of_utc || '').replace('T', ' ').replace('Z', ' UTC') + '.') : ('Counters unavailable: ' + ((d.reasons || []).join('; ') || 'no record yet') + '.');
      pulse.classList.toggle('is-stale', !!stale);
    }
    var get = function (u) { return fetch(u, { credentials: 'omit', headers: { 'Accept': 'application/json' } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    (src ? get(src).then(function (d) { fill(d, false); }) : Promise.reject(new Error('no source')))
      .catch(function () { return get(fb).then(function (d) { fill(d, true); }); })
      .catch(function () { if (asof) asof.textContent = 'Live counters are not reachable from here; the terminal shows them inside.'; });
  }
  });

  /* #1072 join: code from the link, live code check, one-time sign-up. The plain form still posts without JS. */
  var join = document.getElementById('join-form');
  if (join) {
    var codeEl = join.elements.code, codeMsg = join.querySelector('[data-code-status]'), jstatus = join.querySelector('[data-status]');
    var jdone = document.getElementById('join-done');
    try { var q = new URLSearchParams(location.search).get('code'); if (q && !codeEl.value) codeEl.value = q.trim(); } catch (e) {}
    function jsay(msg, bad) { if (jstatus) { jstatus.textContent = msg; jstatus.classList.toggle('is-bad', !!bad); } }
    function checkCode() {
      var c = (codeEl.value || '').trim();
      if (!/^arinv_[0-9a-f]{32}$/.test(c) || !window.fetch) return;
      fetch(join.getAttribute('data-check') + '/' + encodeURIComponent(c) + '/status', { credentials: 'omit', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.valid && d.kind === 'reset') {                                   /* #1080: a reset link - the account is fixed */
            codeMsg.textContent = 'Password reset for account ' + d.reset_for + ', until ' + (d.expires_utc || '').slice(0, 10) + '. Choose a new password below.'; codeMsg.classList.remove('is-bad');
            var nm = join.querySelector('[data-name]'); if (nm) { nm.value = d.reset_for; nm.readOnly = true; nm.setAttribute('aria-describedby', 'join-reset-note'); }
            var sb = join.querySelector('[data-submit]'); if (sb) sb.textContent = 'Set new password';
          } else if (d.valid) { codeMsg.textContent = 'Valid invitation for ' + (d.email_hint || 'you') + ' (' + d.role + '), until ' + (d.expires_utc || '').slice(0, 10) + '.'; codeMsg.classList.remove('is-bad'); }
          else { codeMsg.textContent = 'This code is ' + (d.reason || 'not valid') + '. Ask for a new invitation.'; codeMsg.classList.add('is-bad'); }
        }).catch(function () {});
    }
    if (codeEl.value) checkCode();
    codeEl.addEventListener('change', checkCode);
    join.addEventListener('submit', function (e) {
      e.preventDefault();
      if (join.elements.password.value !== join.elements.password2.value) { jsay('The two passwords differ.', true); join.elements.password2.focus(); return; }
      if (!join.checkValidity()) { var f = join.querySelector(':invalid'); if (f) f.focus(); jsay('Please complete the required fields.', true); return; }
      var btn = join.querySelector('button[type=submit]'); btn.disabled = true; jsay(join.querySelector('[data-name]') && join.querySelector('[data-name]').readOnly ? 'Setting your password…' : 'Creating your account…');   /* #1080 */
      fetch(join.getAttribute('data-api'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ code: codeEl.value.trim(), name: join.elements.name.value.trim(), password: join.elements.password.value, terms: true }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }, function () { return { ok: r.ok, status: r.status, body: {} }; }); })
        .then(function (res) {
          if (res.ok && res.body && (res.body.created || res.body.reset)) {
            join.hidden = true; jdone.hidden = false; jdone.querySelector('[data-done-name]').textContent = res.body.name; jdone.querySelector('[data-done-role]').textContent = res.body.role;
            if (res.body.reset) { jdone.querySelector('[data-done-h]').textContent = 'Your password is set.'; jdone.querySelector('[data-done-made]').hidden = true; var dr = jdone.querySelector('[data-done-reset]'); dr.hidden = false; jdone.querySelector('[data-done-name2]').textContent = res.body.name; }   /* #1080 */
            jdone.focus(); return;
          }
          var err = (res.body && res.body.error) || {};
          jsay(err.message || 'The account could not be created. Please try again.', true);
          if (err.detail && err.detail.field && join.elements[err.detail.field]) join.elements[err.detail.field].focus();
          btn.disabled = false;
        }).catch(function () { jsay('No connection. Please try again.', true); btn.disabled = false; });
    });
  }

  /* beta form: posts JSON; the plain <form> still works without JS (the API accepts form posts too) */
  var form = document.getElementById('beta-form');
  if (!form) return;
  var status = form.querySelector('[data-status]');
  var done = document.getElementById('beta-done');
  function say(msg, bad) { if (status) { status.textContent = msg; status.classList.toggle('is-bad', !!bad); } }
  function mark(field, bad) {
    var el = form.elements[field];
    if (!el) return;
    var node = el.length && !el.tagName ? el[0] : el;
    node.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad) node.focus();
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var body = {};
    fd.forEach(function (v, k) { body[k] = v; });
    body.consent = !!form.elements.consent.checked;
    ['name', 'email', 'org', 'role', 'markets', 'note', 'consent'].forEach(function (k) { mark(k, false); });
    if (!form.checkValidity()) {
      var first = form.querySelector(':invalid');
      if (first) { first.setAttribute('aria-invalid', 'true'); first.focus(); }
      say('Please complete the required fields.', true);
      return;
    }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; say('Sending…');
    fetch(form.getAttribute('data-api'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body), credentials: 'omit'
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }, function () { return { ok: r.ok, status: r.status, body: {} }; });
    }).then(function (res) {
      if (res.ok && res.body && res.body.received) {
        form.hidden = true; done.hidden = false; done.focus(); return;
      }
      var err = (res.body && res.body.error) || {};
      if (res.status === 429) say('Too many requests from this connection. Please try again in an hour.', true);
      else if (res.status === 404) say('The request service is switched off at the moment. Please try again later.', true);
      else if (err.detail && err.detail.field) { mark(err.detail.field, true); say(err.message || 'Please check the highlighted field.', true); }
      else say(err.message || 'The request could not be sent. Please try again.', true);
      btn.disabled = false;
    }).catch(function () {
      say('The request could not be sent (no connection). Please try again.', true);
      btn.disabled = false;
    });
  });
})();
