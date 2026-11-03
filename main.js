/* Orbit — interactive dashboard demo. Plain JS, no dependencies. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var int = new Intl.NumberFormat('en-US');

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  /* ---------- Count-up ---------- */
  var counters = new WeakMap();
  function countUp(el, from, to, opts) {
    opts = opts || {};
    var fmt = opts.format || function (v) { return int.format(Math.round(v)); };
    var dur = reduced ? 0 : (opts.duration || 1400);
    var prev = counters.get(el); if (prev) cancelAnimationFrame(prev);
    if (!dur) { el.textContent = fmt(to); return; }
    var start = performance.now();
    function tick(now) {
      var t = clamp((now - start) / dur, 0, 1);
      el.textContent = fmt(from + (to - from) * easeOutExpo(t));
      if (t < 1) counters.set(el, requestAnimationFrame(tick)); else counters.delete(el);
    }
    counters.set(el, requestAnimationFrame(tick));
  }

  /* ---------- Toast ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------- Theme (View Transitions circular reveal) ---------- */
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('orbit-theme', t); } catch (e) {}
    $$('.theme-toggle').forEach(function (b) {
      b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }
  function toggleTheme(e) {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (!document.startViewTransition || reduced) {
      root.classList.add('theme-fade');
      applyTheme(next);
      setTimeout(function () { root.classList.remove('theme-fade'); }, 500);
      return;
    }
    var r = e.currentTarget.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(function () { applyTheme(next); });
    vt.ready.then(function () {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () {});
  }
  applyTheme(root.getAttribute('data-theme') || 'light');
  $$('.theme-toggle').forEach(function (b) { b.addEventListener('click', toggleTheme); });

  /* ---------- Views + sidebar shared pill ---------- */
  var titles = { overview: 'Overview', messages: 'Messages', rewards: 'Rewards' };
  var views = {};
  $$('.view').forEach(function (v) { views[v.dataset.name] = v; });
  var sideBtns = $$('.side-btn');
  var pill = $('.side-pill');
  var current = 'overview';
  var switchTimer = null;
  var started = false;
  var viewsWrap = $('.views');

  function movePill() {
    var btn = sideBtns.filter(function (b) { return b.dataset.view === current; })[0];
    if (!btn) return;
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.height = btn.offsetHeight + 'px';
    pill.style.transform = 'translate(' + btn.offsetLeft + 'px,' + btn.offsetTop + 'px)';
  }

  function enter(name) {
    var v = views[name];
    v.classList.remove('is-entering');
    void v.offsetWidth;
    v.classList.add('is-entering');
    if (onEnter[name]) onEnter[name]();
  }

  function showView(name, instant) {
    if (!views[name]) return;
    var prev = current;
    current = name;
    sideBtns.forEach(function (b) {
      var on = b.dataset.view === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    movePill();
    var tt = $('#top-title');
    tt.textContent = titles[name];
    tt.classList.remove('swap'); void tt.offsetWidth; tt.classList.add('swap');
    try { history.replaceState(null, '', name === 'overview' ? location.pathname + location.search : '#view=' + name); } catch (e) {}

    if (prev === name && !instant) return;
    clearTimeout(switchTimer);
    var finish = function () {
      Object.keys(views).forEach(function (k) {
        views[k].classList.remove('is-leaving');
        views[k].hidden = k !== name;
        views[k].classList.toggle('is-active', k === name);
      });
      if (started) enter(name);
    };
    var out = views[prev];
    if (instant || reduced || out.hidden) { finish(); return; }
    out.classList.add('is-leaving');
    switchTimer = setTimeout(finish, 240);
  }

  sideBtns.forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });
  $$('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.goto); });
  });
  window.addEventListener('resize', function () { movePill(); moveSegThumb(); });

  /* ---------- Overview: balance chart ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var END = 24836.52;
  var growth = { 7: 0.012, 30: 0.042, 90: 0.11 };
  function genData(n) {
    var rnd = mulberry32(n * 977);
    var vals = new Array(n);
    var startV = END / (1 + growth[n]);
    var drift = (END - startV) / (n - 1);
    vals[n - 1] = END;
    for (var i = n - 2; i >= 0; i--) {
      var noise = (rnd() - 0.5) * END * (n === 7 ? 0.006 : 0.012);
      var payday = (n - 1 - i) % 14 === 6 ? END * 0.025 : 0;
      vals[i] = vals[i + 1] - drift - noise - payday + (payday ? drift * 6 : 0);
    }
    var today = new Date(); today.setHours(12, 0, 0, 0);
    return vals.map(function (v, i) {
      var d = new Date(today); d.setDate(today.getDate() - (n - 1 - i));
      return { d: d, v: v };
    });
  }
  var range = 30;
  var data = genData(range);
  var chartEl = $('#chart'), svg = $('#chart-svg'), tip = $('#tip');
  var geo = null, hoverIdx = -1;
  var dShort = { month: 'short', day: 'numeric' };

  function smoothPath(pts) {
    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var t = 0.18;
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
      var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      d += 'C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
    }
    return d;
  }

  function renderChart(animate) {
    var W = chartEl.clientWidth, H = chartEl.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var padL = 46, padR = 14, padT = 12, padB = 26;
    var vs = data.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    var span = mx - mn || 1;
    mn -= span * 0.15; mx += span * 0.12;
    var step = (W - padL - padR) / (data.length - 1);
    var X = function (i) { return padL + i * step; };
    var Y = function (v) { return padT + (1 - (v - mn) / (mx - mn)) * (H - padT - padB); };
    var pts = data.map(function (p, i) { return [X(i), Y(p.v)]; });
    geo = { pts: pts, step: step, padL: padL, W: W, H: H, bottom: H - padB, top: padT };

    var defs = svgEl('defs', {});
    var lg = svgEl('linearGradient', { id: 'area-g', x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(svgEl('stop', { offset: 0, 'stop-color': '#ff5a1f', 'stop-opacity': 0.32 }));
    lg.appendChild(svgEl('stop', { offset: 0.7, 'stop-color': '#ff8a3d', 'stop-opacity': 0.06 }));
    lg.appendChild(svgEl('stop', { offset: 1, 'stop-color': '#ff8a3d', 'stop-opacity': 0 }));
    defs.appendChild(lg);
    svg.appendChild(defs);

    for (var g = 0; g < 4; g++) {
      var gv = mn + (mx - mn) * (g + 0.5) / 4;
      var gy = Y(gv);
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: padL, x2: W - padR, y1: gy, y2: gy }));
      var lbl = svgEl('text', { class: 'axis', x: 0, y: gy + 4 });
      lbl.textContent = '$' + (gv / 1000).toFixed(1) + 'k';
      svg.appendChild(lbl);
    }
    var ticks = 5;
    for (var k = 0; k < ticks; k++) {
      var idx = Math.round(k * (data.length - 1) / (ticks - 1));
      var tx = svgEl('text', { class: 'axis', x: X(idx), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' });
      tx.textContent = k === ticks - 1 ? 'Today' : data[idx].d.toLocaleDateString('en-US', dShort);
      svg.appendChild(tx);
    }

    var lineD = smoothPath(pts);
    var area = svgEl('path', { class: 'area', d: lineD + 'L' + X(data.length - 1) + ',' + geo.bottom + 'L' + padL + ',' + geo.bottom + 'Z', fill: 'url(#area-g)' });
    var line = svgEl('path', { class: 'line', d: lineD });
    svg.appendChild(area);
    svg.appendChild(line);
    var last = pts[pts.length - 1];
    svg.appendChild(svgEl('circle', { class: 'end-pulse', cx: last[0], cy: last[1], r: 4 }));
    svg.appendChild(svgEl('circle', { class: 'end-dot', cx: last[0], cy: last[1], r: 4 }));
    geo.xh = svgEl('line', { class: 'xh', x1: 0, x2: 0, y1: padT, y2: geo.bottom });
    geo.halo = svgEl('circle', { class: 'dot-halo', r: 12, cx: 0, cy: 0 });
    geo.dot = svgEl('circle', { class: 'dot', r: 5.5, cx: 0, cy: 0 });
    svg.appendChild(geo.xh); svg.appendChild(geo.halo); svg.appendChild(geo.dot);

    if (animate && !reduced) {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len + ' ' + len;
      line.style.strokeDashoffset = len;
      chartEl.classList.add('drawing');
      void line.getBoundingClientRect();
      requestAnimationFrame(function () {
        line.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.65,0,.35,1)';
        line.style.strokeDashoffset = 0;
        chartEl.classList.remove('drawing');
      });
    }
    if (hoverIdx >= 0) setHover(Math.min(hoverIdx, data.length - 1));
  }

  function setHover(i) {
    if (!geo) return;
    hoverIdx = i;
    var p = geo.pts[i];
    geo.xh.setAttribute('x1', p[0]); geo.xh.setAttribute('x2', p[0]);
    geo.dot.setAttribute('cx', p[0]); geo.dot.setAttribute('cy', p[1]);
    geo.halo.setAttribute('cx', p[0]); geo.halo.setAttribute('cy', p[1]);
    tip.firstChild.textContent = data[i].d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    tip.lastChild.textContent = money.format(data[i].v);
    chartEl.classList.add('hover');
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var tx = clamp(p[0] - tw / 2, 0, geo.W - tw);
    var ty = p[1] - th - 16;
    if (ty < -8) ty = p[1] + 16;
    tip.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
  }
  function clearHover() { hoverIdx = -1; chartEl.classList.remove('hover'); }

  chartEl.addEventListener('pointermove', function (e) {
    if (!geo) return;
    var r = svg.getBoundingClientRect();
    var px = (e.clientX - r.left) * (geo.W / r.width);
    setHover(clamp(Math.round((px - geo.padL) / geo.step), 0, data.length - 1));
  });
  chartEl.addEventListener('pointerleave', clearHover);
  chartEl.addEventListener('focus', function () { setHover(data.length - 1); });
  chartEl.addEventListener('blur', clearHover);
  chartEl.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var i = hoverIdx < 0 ? data.length - 1 : hoverIdx;
    setHover(clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, data.length - 1));
  });

  var segBtns = $$('.seg button');
  var segWrap = $('.seg');
  var segThumb = document.createElement('span');
  segThumb.className = 'seg-thumb';
  segWrap.insertBefore(segThumb, segWrap.firstChild);
  function moveSegThumb() {
    var on = $('.seg .is-on');
    if (!on || !on.offsetWidth) return;
    segThumb.style.width = on.offsetWidth + 'px';
    segThumb.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  segBtns.forEach(function (b) {
    b.setAttribute('aria-pressed', b.classList.contains('is-on'));
    b.addEventListener('click', function () {
      segBtns.forEach(function (o) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-pressed', o === b); });
      moveSegThumb();
      range = +b.dataset.range;
      data = genData(range);
      var labels = { 7: 'week', 30: '30 days', 90: '3 months' };
      chartEl.setAttribute('aria-label', 'Balance over the last ' + labels[range] + ', trending up. Use arrow keys to inspect values.');
      $('.chip-up').textContent = '▲ ' + (growth[range] * 100).toFixed(1) + '%';
      $('.delta .muted').textContent = range === 7 ? 'vs. last week' : range === 30 ? 'vs. last month' : 'vs. last quarter';
      clearHover();
      renderChart(true);
    });
  });

  var roPending = false;
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (roPending) return;
      roPending = true;
      requestAnimationFrame(function () { roPending = false; renderChart(false); });
    }).observe(chartEl);
  }

  /* ---------- Overview: donut ---------- */
  var spend = [
    { name: 'Groceries', p: 0.32, c: '#ff5a1f' },
    { name: 'Housing', p: 0.28, c: '#ffae42' },
    { name: 'Transport', p: 0.16, c: '#7b6cf6' },
    { name: 'Dining', p: 0.14, c: '#1fb57f' },
    { name: 'Other', p: 0.10, c: '#a39a90' }
  ];
  var SPEND_TOTAL = 3482;
  var C = 2 * Math.PI * 62;
  var segG = $('#donut-segs'), donut = $('.donut'), legend = $('#legend');
  var segEls = [];
  (function buildDonut() {
    var acc = 0;
    spend.forEach(function (s, i) {
      var len = Math.max(1, s.p * C - 22);
      var c = svgEl('circle', { class: 'seg-c', cx: 80, cy: 80, r: 62, stroke: s.c, 'stroke-dasharray': '0 ' + C, 'stroke-dashoffset': -(acc * C + 11) });
      c.dataset.len = len;
      c.style.transitionDelay = (i * 90) + 'ms';
      segG.appendChild(c);
      segEls.push(c);
      acc += s.p;
      var li = document.createElement('li');
      li.innerHTML = '<i style="background:' + s.c + '"></i>' + s.name + '<span>' + Math.round(s.p * 100) + '%</span>';
      legend.appendChild(li);
      var on = function () { focusSeg(i); }, off = function () { focusSeg(-1); };
      c.addEventListener('pointerenter', on); c.addEventListener('pointerleave', off);
      li.addEventListener('pointerenter', on); li.addEventListener('pointerleave', off);
    });
  })();
  function focusSeg(i) {
    donut.classList.toggle('focus', i >= 0);
    segEls.forEach(function (c, k) { c.classList.toggle('on', k === i); });
    if (i < 0) { $('#donut-cat').textContent = 'Top category'; $('#donut-val').textContent = 'Groceries'; return; }
    $('#donut-cat').textContent = spend[i].name;
    $('#donut-val').textContent = money.format(spend[i].p * SPEND_TOTAL).replace(/\.\d\d$/, '');
  }
  function animateDonut() {
    segEls.forEach(function (c) { c.style.transition = 'none'; c.setAttribute('stroke-dasharray', '0 ' + C); });
    void donut.getBoundingClientRect();
    requestAnimationFrame(function () {
      segEls.forEach(function (c) {
        c.style.transition = '';
        c.setAttribute('stroke-dasharray', c.dataset.len + ' ' + C);
      });
    });
  }

  /* ---------- Overview: transactions ---------- */
  var txs = [
    { n: 'Fernleaf Market', c: 'Groceries', t: 'Today, 9:14', a: -86.4, pts: 260, l: 'F', g: 'linear-gradient(135deg,#34c38f,#0f8a5c)', s: 'rgba(18,163,107,.6)' },
    { n: 'Kestrel Studio', c: 'Salary', t: 'Today, 7:00', a: 4200, l: 'K', g: 'linear-gradient(135deg,#8f8cff,#5146e0)', s: 'rgba(81,70,224,.6)' },
    { n: 'Tramline Transit', c: 'Transport', t: 'Yesterday', a: -2.9, pts: 9, l: 'T', g: 'linear-gradient(135deg,#ffb347,#f07b16)', s: 'rgba(240,123,22,.6)' },
    { n: 'Maya Chen', c: 'Transfer · Dinner split', t: 'Yesterday', a: 42.5, l: 'M', g: 'linear-gradient(135deg,#ff8ab3,#e0457b)', s: 'rgba(224,69,123,.6)' },
    { n: 'Cobble & Crumb', c: 'Dining', t: 'Mon, 8:42', a: -14.75, pts: 74, l: 'C', g: 'linear-gradient(135deg,#ff7a45,#d9400f)', s: 'rgba(217,64,15,.6)' },
    { n: 'Voltway Charging', c: 'Transport', t: 'Sun', a: -18.2, pts: 55, l: 'V', g: 'linear-gradient(135deg,#4fd1e8,#127fa8)', s: 'rgba(18,127,168,.6)' },
    { n: 'Papermoon Books', c: 'Shopping', t: 'Sat', a: -32, pts: 96, l: 'P', g: 'linear-gradient(135deg,#a39a90,#5f5750)', s: 'rgba(95,87,80,.6)' },
    { n: 'Halcyon Gym', c: 'Health', t: 'Fri', a: -49, pts: 147, l: 'H', g: 'linear-gradient(135deg,#3b3632,#151210)', s: 'rgba(0,0,0,.5)' }
  ];
  var txList = $('#tx-list'), txEmpty = $('#tx-empty'), txCount = $('#tx-count');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function renderTx(q, animate) {
    q = (q || '').trim().toLowerCase();
    var list = txs.filter(function (t) { return !q || (t.n + ' ' + t.c).toLowerCase().indexOf(q) > -1; });
    txList.innerHTML = list.map(function (t, i) {
      var pos = t.a > 0;
      return '<li class="tx' + (animate ? ' in' : '') + '" style="--i:' + i + '">' +
        '<span class="tx-ic" style="--c:' + t.g + ';--cs:' + t.s + '" aria-hidden="true">' + esc(t.l) + '</span>' +
        '<span class="tx-main"><b>' + esc(t.n) + '</b><small>' + esc(t.c) + ' · ' + esc(t.t) + '</small></span>' +
        '<span class="tx-amt' + (pos ? ' pos' : '') + '">' + (pos ? '+' : '−') + money.format(Math.abs(t.a)) +
        (t.pts ? '<small>+' + t.pts + ' pts</small>' : '') + '</span></li>';
    }).join('');
    txEmpty.hidden = list.length > 0;
    txCount.textContent = q ? list.length + ' of ' + txs.length : 'This week';
  }
  renderTx('', false);

  var search = $('#search');
  search.addEventListener('input', function () {
    if (current !== 'overview') showView('overview');
    renderTx(search.value, true);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); }
    if (e.key === 'Escape') closeNotif();
  });

  $('#today').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · You’re 8% under budget this month.';

  $$('.qa').forEach(function (b) { b.addEventListener('click', function () { toast(b.dataset.toast); }); });

  /* ---------- Notifications ---------- */
  var bell = $('#bell'), panel = $('#notif-panel');
  function closeNotif() { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); }
  bell.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = panel.hidden;
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) { bell.classList.add('seen'); bell.setAttribute('aria-label', 'Notifications'); }
  });
  document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) closeNotif(); });
  $('.avatar-btn').addEventListener('click', function () { toast('Signed in as Alex Moreau · Gold member'); });

  /* ---------- Messages ---------- */
  var convos = [
    { id: 'maya', name: 'Maya Chen', ini: 'MC', av: 'linear-gradient(135deg,#ff8ab3,#e0457b)', unread: 2, time: '9:41',
      msgs: [
        { t: 'Dinner last night was so good. Sending my half now!', time: '8:02' },
        { pay: 42.5, note: 'Dinner split · Osteria', time: '8:03' },
        { me: true, t: 'Got it, thank you! Same place next month?', time: '8:10' },
        { t: 'Absolutely. I’m adding it to our shared budget.', time: '9:41' }
      ],
      replies: ['Ha, perfect.', 'Deal — I’ll book a table for eight.', 'You’re the best budgeting buddy.'],
      intro: 'Also — want to put the leftover into the Lisbon trip vault?' },
    { id: 'support', name: 'Orbit Support', ini: 'OS', av: 'linear-gradient(135deg,#ffb347,#ff5a1f)', unread: 0, time: 'Mon',
      msgs: [
        { t: 'Hi Alex! Your Gold tier upgrade is live. You now earn 2× points on groceries.', time: 'Mon' },
        { me: true, t: 'Amazing, thanks for the heads up.', time: 'Mon' }
      ],
      replies: ['Happy to help! Anything else I can do?', 'I’ve noted that on your account.'] },
    { id: 'jonah', name: 'Jonah Reyes', ini: 'JR', av: 'linear-gradient(135deg,#4fd1e8,#127fa8)', unread: 0, time: 'Sun',
      msgs: [
        { me: true, t: 'Requested $18.00 for the climbing gym pass.', time: 'Sun' },
        { t: 'Paying tonight, promise.', time: 'Sun' }
      ],
      replies: ['On it!', 'Sent. We’re square now.'] },
    { id: 'priya', name: 'Priya Nair', ini: 'PN', av: 'linear-gradient(135deg,#8f8cff,#5146e0)', unread: 0, time: 'Fri',
      msgs: [
        { t: 'Did you see the 5× coffee boost?', time: 'Fri' },
        { me: true, t: 'Already redeemed it, my morning flat white is basically free.', time: 'Fri' }
      ],
      replies: ['Ha, smart move.', 'Okay I’m redeeming it too.'] }
  ];
  var activeConvo = convos[0];
  var convoList = $('#convo-list'), thread = $('#thread');
  var messagesSeen = false;

  function lastText(c) {
    var m = c.msgs[c.msgs.length - 1];
    return m.pay ? 'Payment · ' + money.format(m.pay) : (m.me ? 'You: ' : '') + m.t;
  }
  function renderConvos() {
    convoList.innerHTML = convos.map(function (c) {
      return '<li><button type="button" class="convo' + (c === activeConvo ? ' is-on' : '') + '" data-id="' + c.id + '"' + (c === activeConvo ? ' aria-current="true"' : '') + '>' +
        '<span class="avatar" style="--av:' + c.av + ';--av-ring:transparent" aria-hidden="true">' + c.ini + '</span>' +
        '<span class="convo-txt"><b>' + esc(c.name) + '</b><small>' + esc(lastText(c)) + '</small></span>' +
        '<span class="convo-meta"><time>' + c.time + '</time>' + (c.unread ? '<span class="unread" aria-label="' + c.unread + ' unread">' + c.unread + '</span>' : '') + '</span>' +
        '</button></li>';
    }).join('');
    var anyUnread = convos.some(function (c) { return c.unread; });
    var dot = $('.side-dot'); if (dot) dot.hidden = !anyUnread;
  }
  function bubbleHTML(m) {
    if (m.pay) {
      return '<div class="pay-bubble"><span class="pay-ic" aria-hidden="true">$</span><div><b>' + money.format(m.pay) + '</b><small>' + esc(m.note) + '</small></div></div><time>' + m.time + '</time>';
    }
    return esc(m.t) + '<time>' + m.time + '</time>';
  }
  function addBubble(m, animate) {
    var d = document.createElement('div');
    d.className = 'bubble' + (m.me ? ' me' : '') + (animate ? ' new' : '');
    d.innerHTML = bubbleHTML(m);
    thread.appendChild(d);
    thread.scrollTop = thread.scrollHeight;
    return d;
  }
  function renderThread() {
    thread.innerHTML = '<span class="day">Today</span>';
    activeConvo.msgs.forEach(function (m) { addBubble(m, false); });
    var av = $('#th-avatar');
    av.textContent = activeConvo.ini;
    av.style.setProperty('--av', activeConvo.av);
    av.style.setProperty('--av-ring', 'transparent');
    $('#th-name').textContent = activeConvo.name;
  }
  function selectConvo(id) {
    activeConvo = convos.filter(function (c) { return c.id === id; })[0] || convos[0];
    activeConvo.unread = 0;
    renderConvos();
    renderThread();
  }
  convoList.addEventListener('click', function (e) {
    var b = e.target.closest('.convo');
    if (b) selectConvo(b.dataset.id);
  });

  function nowTime() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  var replyIdx = {};
  function replyFrom(c, text, delay) {
    setTimeout(function () {
      var typing = null;
      if (c === activeConvo && current === 'messages') {
        typing = document.createElement('div');
        typing.className = 'bubble new';
        typing.setAttribute('aria-label', c.name + ' is typing');
        typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        typing.style.padding = '0';
        thread.appendChild(typing);
        thread.scrollTop = thread.scrollHeight;
      }
      setTimeout(function () {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        var m = { t: text, time: nowTime() };
        c.msgs.push(m);
        if (c === activeConvo) addBubble(m, true); else c.unread++;
        renderConvos();
      }, reduced ? 300 : 1500);
    }, delay);
  }
  $('#composer').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('#msg-input');
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    var c = activeConvo;
    var m = { me: true, t: text, time: nowTime() };
    c.msgs.push(m);
    addBubble(m, true);
    input.value = '';
    renderConvos();
    var send = $('.send');
    send.classList.remove('fly'); void send.offsetWidth; send.classList.add('fly');
    var i = replyIdx[c.id] || 0;
    replyIdx[c.id] = i + 1;
    replyFrom(c, c.replies[i % c.replies.length], 700);
  });
  selectConvo('maya');

  /* ---------- Rewards ---------- */
  var points = 48250;
  var pointsEl = $('#points');
  var offers = [
    { id: 'cafe', title: 'Café boost', desc: '5× points at coffee shops for the next 30 days.', cost: 2500, art: artCafe() },
    { id: 'lounge', title: 'Lounge day pass', desc: 'One airport lounge visit, any terminal we partner with.', cost: 18000, art: artLounge() },
    { id: 'trees', title: 'Plant 10 trees', desc: 'Turn points into a reforestation donation, tracked to the plot.', cost: 5000, art: artTrees() }
  ];
  function artCafe() {
    return '<svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="oc-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2c2"/><stop offset="1" stop-color="#ffb07a"/></linearGradient>' +
      '<linearGradient id="oc-cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#ffeede"/><stop offset="1" stop-color="#f3c9a6"/></linearGradient>' +
      '<radialGradient id="oc-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6e6" stop-opacity=".9"/><stop offset="1" stop-color="#fff6e6" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="300" height="110" fill="url(#oc-bg)"/><circle cx="240" cy="20" r="70" fill="url(#oc-sun)"/>' +
      '<ellipse cx="150" cy="96" rx="62" ry="9" fill="#c4622a" opacity=".25"/>' +
      '<ellipse cx="150" cy="90" rx="56" ry="9" fill="#fff" /><ellipse cx="150" cy="89" rx="44" ry="5" fill="#f0d2b8"/>' +
      '<path d="M118 44h64l-6 40a8 8 0 0 1-8 7h-36a8 8 0 0 1-8-7z" fill="url(#oc-cup)"/>' +
      '<path d="M181 52c14-2 18 16 2 22" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>' +
      '<ellipse cx="150" cy="45" rx="32" ry="5" fill="#7a3a17"/><ellipse cx="146" cy="44" rx="10" ry="2" fill="#c47a45" opacity=".8"/>' +
      '<path class="steam s1" d="M140 34c-6-8 6-12 0-22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>' +
      '<path class="steam s2" d="M156 34c-6-8 6-12 0-22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>' +
      '<text x="18" y="30" font-family="Manrope,sans-serif" font-weight="800" font-size="20" fill="#c2410c">5×</text></svg>';
  }
  function artLounge() {
    return '<svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="ol-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a8f"/><stop offset=".6" stop-color="#b54a8a"/><stop offset="1" stop-color="#ff9a5a"/></linearGradient>' +
      '<radialGradient id="ol-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe6b0"/><stop offset=".5" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="ol-plane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e3dcf5"/></linearGradient></defs>' +
      '<rect width="300" height="110" fill="url(#ol-bg)"/><circle cx="70" cy="92" r="46" fill="url(#ol-sun)"/>' +
      '<g fill="#fff" opacity=".25"><ellipse cx="230" cy="86" rx="60" ry="10"/><ellipse cx="40" cy="100" rx="70" ry="9"/></g>' +
      '<g class="plane"><path d="M120 54l120-22c10-2 16 6 6 11l-110 24z" fill="url(#ol-plane)"/><path d="M180 42l-30-26h12l42 22z" fill="#efeaff"/><path d="M168 62l-16 26h10l26-29z" fill="#d9d1f2"/><path d="M128 52l-12-14h7l14 12z" fill="#efeaff"/>' +
      '<g fill="#7b6cf6"><circle cx="200" cy="42" r="1.6"/><circle cx="208" cy="40.5" r="1.6"/><circle cx="216" cy="39" r="1.6"/></g></g>' +
      '<g fill="#fff"><circle cx="40" cy="20" r="1"/><circle cx="96" cy="12" r="1.2"/><circle cx="270" cy="16" r="1"/><circle cx="150" cy="8" r=".8"/></g></svg>';
  }
  function artTrees() {
    return '<svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="ot-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9f7e6"/><stop offset="1" stop-color="#a6e8c6"/></linearGradient>' +
      '<linearGradient id="ot-h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fcf8e"/><stop offset="1" stop-color="#1c9a5f"/></linearGradient>' +
      '<linearGradient id="ot-h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bb673"/><stop offset="1" stop-color="#0d6e43"/></linearGradient>' +
      '<radialGradient id="ot-tree" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#7ee3a8"/><stop offset=".6" stop-color="#22a466"/><stop offset="1" stop-color="#0c6b41"/></radialGradient></defs>' +
      '<rect width="300" height="110" fill="url(#ot-bg)"/><circle cx="250" cy="28" r="14" fill="#fff6c9"/>' +
      '<path d="M0 80c60-30 120-30 180-6s90 10 120-6v42H0z" fill="url(#ot-h1)"/>' +
      '<g class="trees"><rect x="88" y="58" width="4" height="22" rx="2" fill="#6b3f1f"/><circle cx="90" cy="50" r="16" fill="url(#ot-tree)"/>' +
      '<rect x="138" y="48" width="5" height="30" rx="2" fill="#6b3f1f"/><circle cx="140" cy="38" r="21" fill="url(#ot-tree)"/>' +
      '<rect x="192" y="62" width="4" height="18" rx="2" fill="#6b3f1f"/><circle cx="194" cy="55" r="13" fill="url(#ot-tree)"/></g>' +
      '<path d="M0 96c80-18 160-18 300-4v18H0z" fill="url(#ot-h2)"/></svg>';
  }
  var offerGrid = $('#offer-grid');
  offerGrid.innerHTML = offers.map(function (o, i) {
    return '<article class="offer stag" style="--i:' + (i + 3) + '" data-id="' + o.id + '">' +
      '<div class="offer-art">' + o.art + '</div>' +
      '<h4>' + esc(o.title) + '</h4><p>' + esc(o.desc) + '</p>' +
      '<div class="offer-foot"><span class="cost"><svg aria-hidden="true"><use href="#i-star"/></svg>' + int.format(o.cost) + ' pts</span>' +
      '<button class="btn btn-primary btn-sm redeem" type="button" data-cost="' + o.cost + '" aria-label="Redeem ' + esc(o.title) + ' for ' + int.format(o.cost) + ' points">Redeem</button></div>' +
      '</article>';
  }).join('');

  // The entrance animation holds `transform`, so .stag is dropped once it ends to free the tilt.
  var canTilt = !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  $$('.offer').forEach(function (card) {
    card.addEventListener('animationend', function (e) { if (e.target === card) card.classList.remove('stag'); });
    if (!canTilt) return;
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      card.style.setProperty('--ry', ((px - 0.5) * 14).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-(py - 0.5) * 12).toFixed(2) + 'deg');
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', function () {
      card.classList.remove('tilting');
      card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
    });
  });

  function updatePointsValue() { $('#points-value').textContent = money.format(points / 100); }
  offerGrid.addEventListener('click', function (e) {
    var b = e.target.closest('.redeem');
    if (!b || b.classList.contains('done')) return;
    var cost = +b.dataset.cost;
    if (cost > points) {
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      toast('Not enough points yet — keep orbiting');
      return;
    }
    var from = points;
    points -= cost;
    countUp(pointsEl, from, points, { duration: 1000 });
    updatePointsValue();
    b.classList.add('done');
    b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Redeemed';
    b.setAttribute('aria-label', 'Redeemed');
    var r = b.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2);
    toast('Redeemed! ' + int.format(cost) + ' points well spent.');
  });

  /* ---------- Confetti (canvas) ---------- */
  var cv = $('#confetti'), ctx = cv.getContext('2d');
  var parts = [], running = false, dpr = 1;
  var colors = ['#ff5a1f', '#ff8a3d', '#ffb347', '#ffd9a8', '#ffffff', '#7b6cf6', '#1fb57f'];
  function sizeCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr);
    cv.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', function () { if (running) sizeCanvas(); });
  function confetti(x, y) {
    if (!running) sizeCanvas();
    var n = reduced ? 36 : 170;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      var sp = (reduced ? 4 : 7) + Math.random() * 9;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
        tilt: Math.random() * Math.PI, vt: 0.08 + Math.random() * 0.12,
        c: colors[(Math.random() * colors.length) | 0], circle: Math.random() < 0.25, life: 0
      });
    }
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  function frame() {
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += 0.3; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx + Math.sin(p.tilt) * 0.6; p.y += p.vy;
      p.rot += p.vr; p.tilt += p.vt; p.life++;
      if (p.y > innerHeight + 30 || p.life > 260) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = p.life > 200 ? (260 - p.life) / 60 : 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.tilt));
      ctx.fillStyle = p.c;
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, cv.width, cv.height); }
  }

  /* ---------- Per-view entrance hooks ---------- */
  var RING_C = 2 * Math.PI * 50, TIER = 0.78;
  var onEnter = {
    overview: function () {
      var bal = $('#balance');
      countUp(bal, 0, +bal.dataset.to, { format: function (v) { return money.format(v); }, duration: 1600 });
      renderTx(search.value, true);
      moveSegThumb();
      renderChart(true);
      animateDonut();
    },
    messages: function () {
      thread.scrollTop = thread.scrollHeight;
      if (!messagesSeen) {
        messagesSeen = true;
        var maya = convos[0];
        replyFrom(maya, maya.intro, 900);
      }
    },
    rewards: function () {
      countUp(pointsEl, 0, points, { duration: 1800 });
      var ring = $('#ring-fill');
      ring.style.transition = 'none';
      ring.style.strokeDasharray = '0 ' + RING_C;
      void ring.getBoundingClientRect();
      requestAnimationFrame(function () {
        ring.style.transition = '';
        ring.style.strokeDasharray = (RING_C * TIER) + ' ' + RING_C;
      });
      countUp($('#ring-pct'), 0, TIER * 100, { duration: 1600, format: function (v) { return Math.round(v) + '%'; } });
      $$('.offer').forEach(function (c) { c.classList.add('stag'); });
    }
  };

  /* ---------- Boot ---------- */
  var m = /#view=(\w+)/.exec(location.hash);
  if (m && views[m[1]]) showView(m[1], true);
  movePill();
  moveSegThumb();
  viewsWrap.classList.add('awaiting');

  function start() {
    if (started) return;
    started = true;
    viewsWrap.classList.remove('awaiting');
    enter(current);
  }
  var app = $('#app');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('offscreen', !en.isIntersecting);
        if (en.target === app && en.isIntersecting) start();
      });
    }, { threshold: 0.08 });
    io.observe(app);
    io.observe($('.intro'));
  } else {
    start();
  }
})();
