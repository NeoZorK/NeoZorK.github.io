/* NeoZorK Research - Live Lab. Everything runs in the visitor's browser.
   LIVE panels call public, CORS-enabled APIs (GitHub, PyPI, USGS) directly from the browser; nothing is sent to the site owner.
   Every panel is labelled LIVE, SNAPSHOT or ILLUSTRATION so that it is clear what is real data and what is a model. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function ago(iso) { var d = (Date.now() - new Date(iso)) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : Math.round(d) + ' days ago'; }

  /* ---------- tabs ---------- */
  var tabs = $$('[data-tab]'), panels = $$('.panel');
  function show(id) {
    if (!$('#p-' + id)) id = 'claimbound';
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === id)); });
    panels.forEach(function (p) { p.hidden = p.id !== 'p-' + id; });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (!inited[id] && init[id]) { inited[id] = true; init[id](); }
  }
  var inited = {}, init = {};
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.getAttribute('data-tab')); }); });

  /* ---------- helpers ---------- */
  function getJSON(url) {
    var key = 'nzlab:' + url;
    try { var c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < 6e5) return Promise.resolve(c.d); } catch (e) {}
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    return fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} return d; });
  }
  function fail(box, e) { box.innerHTML = '<p class="muted">Live data unavailable right now (' + esc(e.message || e) + '). Rate limits and offline mode cause this; reload later.</p>'; }
  function spark(vals, labels, w, h, cls) {
    var mx = Math.max.apply(null, vals.concat([1])), bw = w / vals.length, s = '';
    vals.forEach(function (v, i) {
      var bh = v / mx * (h - 16);
      s += '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (h - 14 - bh).toFixed(1) + '" width="' + Math.max(bw - 2, 1).toFixed(1) + '" height="' + Math.max(bh, v ? 1.5 : 0.6).toFixed(1) + '" rx="2" class="' + (cls || 'sb') + '"><title>' + esc(labels[i]) + ': ' + v + '</title></rect>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img">' + s + '<line x1="0" y1="' + (h - 13) + '" x2="' + w + '" y2="' + (h - 13) + '" class="ax"/></svg>';
  }
  function weekKey(d) { var t = new Date(d); t.setUTCHours(0, 0, 0, 0); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); }
  function sha256(str) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve('(WebCrypto unavailable in this context)');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function phi(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

  /* ---------- live repo + package block (ClaimBound, Monte-Neo) ---------- */
  function repoBlock(box, repo, pkg, firstLabel) {
    box.innerHTML = '<p class="muted">Loading from GitHub and PyPI…</p>';
    Promise.all([
      getJSON('https://api.github.com/repos/' + repo).catch(function () { return null; }),
      getJSON('https://api.github.com/repos/' + repo + '/commits?per_page=100').catch(function () { return null; }),
      getJSON('https://pypi.org/pypi/' + pkg + '/json').catch(function () { return null; })
    ]).then(function (r) {
      var gh = r[0], cm = r[1], py = r[2], out = '';
      if (!gh && !py) return fail(box, 'GitHub and PyPI both unreachable');
      out += '<div class="kv">';
      if (py) out += '<div><b>' + esc(py.info.version) + '</b><span>latest release on PyPI</span></div><div><b>' + Object.keys(py.releases).length + '</b><span>releases published</span></div>';
      if (gh) out += '<div><b>' + fmt(gh.stargazers_count) + '</b><span>GitHub stars</span></div><div><b>' + ago(gh.pushed_at) + '</b><span>last push</span></div>';
      out += '</div>';
      if (cm && cm.length) {
        var by = {};
        cm.forEach(function (c) { var k = weekKey(c.commit.author.date); by[k] = (by[k] || 0) + 1; });
        var keys = Object.keys(by).sort();
        out += '<h4>Commit rhythm (last ' + cm.length + ' commits, per week)</h4>' + spark(keys.map(function (k) { return by[k]; }), keys, 420, 90);
      }
      if (py) {
        var rel = [];
        Object.keys(py.releases).forEach(function (v) { var f = py.releases[v][0]; if (f) rel.push([v, f.upload_time_iso_8601 || f.upload_time]); });
        rel.sort(function (a, b) { return a[1] < b[1] ? -1 : 1; });
        out += '<h4>Release timeline (PyPI)</h4><div class="rel">' + rel.slice(-14).map(function (x) { return '<span class="chip" title="' + esc(x[1].slice(0, 10)) + '">' + esc(x[0]) + '</span>'; }).join('') + '</div>';
        out += '<p class="fine muted">' + esc(py.info.summary || '') + ' · Python ' + esc(py.info.requires_python || '') + ' · ' + esc((py.info.license_expression || py.info.license || '').split('\n')[0].slice(0, 40)) + '</p>';
      }
      box.innerHTML = out + '<p class="fine muted">Source: GitHub REST API and PyPI JSON API, fetched by your browser now. ' + esc(firstLabel || '') + '</p>';
    });
  }

  /* ---------- 1. ClaimBound ---------- */
  init.claimbound = function () {
    repoBlock($('#cb-live'), 'ClaimBound/claimbound-evidence', 'claimbound-evidence', '');
    var f = { claim: $('#cb-claim'), proto: $('#cb-proto'), src: $('#cb-src'), thr: $('#cb-thr'), st: $('#cb-st') };
    var frozen = null, card = $('#cb-card');
    function canon() { return JSON.stringify({ claim: f.claim.value.trim(), protocol: f.proto.value.trim(), source: f.src.value.trim(), threshold: f.thr.value.trim() }); }
    function render() {
      sha256(canon()).then(function (h) {
        var drift = frozen && frozen !== h, status = drift ? 'drift' : f.st.value;
        card.innerHTML = '<div class="cardline"><span class="badge st-' + status + '">' + esc(status) + '</span><code>sha256 ' + esc(h.slice(0, 16)) + '…</code></div>' +
          '<p><b>Claim</b> ' + esc(f.claim.value || '—') + '</p><p><b>Protocol</b> ' + esc(f.proto.value || '—') + '</p><p><b>Source boundary</b> ' + esc(f.src.value || '—') + '</p><p><b>Threshold</b> ' + esc(f.thr.value || '—') + '</p>' +
          '<p class="fine muted">' + (frozen ? (drift ? 'The frozen hash was ' + frozen.slice(0, 16) + '… The inputs changed after freezing: this card is now DRIFT and the old result no longer applies.' : 'Frozen. Edit any field to see the drift status appear.') : 'Not frozen yet. Press “Freeze” to commit this protocol to a hash.') + '</p>' +
          '<p class="fine muted"><b>Claim boundary:</b> a ' + esc(f.st.value) + ' status means this one narrow claim under this frozen protocol, nothing wider.</p>';
      });
    }
    $$('input,textarea,select', $('#cb-form')).forEach(function (e) { e.addEventListener('input', render); });
    $('#cb-freeze').addEventListener('click', function () { sha256(canon()).then(function (h) { frozen = h; render(); }); });
    $('#cb-reset').addEventListener('click', function () { frozen = null; render(); });
    render();
  };

  /* ---------- 2. Monte-Neo ---------- */
  init.monteneo = function () {
    repoBlock($('#mn-live'), 'NeoZorK/Monte-Neo', 'monte-neo', 'First commit 23 January 2026.');
    var nN = $('#mn-n'), nD = $('#mn-d'), nSeed = $('#mn-seed'), out = $('#mn-out');
    function sim(N, D, seed) {
      var r = rng(seed), sh = [], best = -1e9, bi = 0, bestRets = null;
      for (var i = 0; i < N; i++) {
        var s = 0, s2 = 0, rets = new Float32Array(D);
        for (var d = 0; d < D; d++) { var x = gauss(r) * 0.01; rets[d] = x; s += x; s2 += x * x; }
        var m = s / D, sd = Math.sqrt(Math.max(s2 / D - m * m, 1e-12)), sr = m / sd * Math.sqrt(252);
        sh.push(sr); if (sr > best) { best = sr; bi = i; bestRets = rets; }
      }
      return { sh: sh, best: best, rets: bestRets };
    }
    function run() {
      var N = Math.round(Math.pow(10, +nN.value)), D = +nD.value, seed = +nSeed.value || 1;
      $('#mn-nv').textContent = fmt(N); $('#mn-dv').textContent = fmt(D) + ' days (' + (D / 252).toFixed(1) + ' y)';
      var r = sim(N, D, seed), sorted = r.sh.slice().sort(function (a, b) { return a - b; }), med = sorted[Math.floor(N / 2)];
      var se = Math.sqrt(252 / D), z = r.best / se, p1 = 1 - phi(z), pAny = 1 - Math.pow(1 - p1, N);
      var lo = -3, hi = 3, bins = 30, hist = new Array(bins).fill(0);
      r.sh.forEach(function (v) { var k = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / (hi - lo) * bins))); hist[k]++; });
      var mx = Math.max.apply(null, hist), hs = '';
      hist.forEach(function (c, i) { var x = i * 400 / bins, h = c / mx * 110; hs += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (130 - h).toFixed(1) + '" width="' + (400 / bins - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" class="' + (lo + (i + .5) * (hi - lo) / bins >= r.best - .1 ? 'sb hot' : 'sb') + '"/>'; });
      hs += '<line x1="200" y1="8" x2="200" y2="130" class="ax"/><text x="200" y="146" class="tx" text-anchor="middle">true Sharpe = 0 for every variant</text><text x="0" y="146" class="tx">-3</text><text x="400" y="146" class="tx" text-anchor="end">+3</text>';
      var eq = [], c = 0, mn = 0, mxe = 0; for (var d = 0; d < D; d++) { c += r.rets[d]; eq.push(c); mn = Math.min(mn, c); mxe = Math.max(mxe, c); }
      var pts = eq.map(function (v, i) { return (i / (D - 1) * 400).toFixed(1) + ',' + (130 - (v - mn) / ((mxe - mn) || 1) * 120).toFixed(1); }).join(' ');
      out.innerHTML = '<div class="kv"><div><b>' + r.best.toFixed(2) + '</b><span>headline Sharpe of the best of ' + fmt(N) + ' variants</span></div><div><b>' + med.toFixed(2) + '</b><span>median variant</span></div><div><b>' + (pAny > .995 ? '>99%' : fmt(pAny * 100, pAny < .1 ? 1 : 0) + '%') + '</b><span>chance that luck alone produces a best this good</span></div><div><b>0.00</b><span>true Sharpe of every variant</span></div></div>' +
        '<div class="two"><div><h4>Sharpe of all ' + fmt(N) + ' variants</h4><svg viewBox="0 0 400 150" class="chart">' + hs + '</svg></div><div><h4>The winning equity curve (pure noise)</h4><svg viewBox="0 0 400 150" class="chart"><polyline points="' + pts + '" class="ln"/></svg></div></div>';
    }
    [nN, nD, nSeed].forEach(function (e) { e.addEventListener('input', run); });
    $('#mn-many').addEventListener('click', function () {
      var N = Math.round(Math.pow(10, +nN.value)), D = +nD.value, b = [], above = 0;
      for (var k = 0; k < 100; k++) { var r = sim(N, D, 1000 + k); b.push(r.best); if (r.best > 1) above++; }
      var avg = b.reduce(function (a, c) { return a + c; }, 0) / b.length;
      $('#mn-many-out').textContent = '100 independent worlds with ' + fmt(N) + ' variants each: average best Sharpe ' + avg.toFixed(2) + '; best Sharpe above 1.0 in ' + above + ' of 100 worlds. Every variant has no edge.';
    });
    run();
  };

  /* ---------- 3. QWC ---------- */
  init.qwc = function () {
    var raw = $('#qwc-data'); if (!raw) return;
    var Q = JSON.parse(raw.textContent), W = 560, H = 560, cx = W / 2, cy = H / 2, R = 215;
    var col = { held: '#34d399', boundary: '#22d3ee', win: '#5eead4', parity: '#93aebb', refuted: '#fb7185', void: '#f5b942', untested: '#3b82ff', corrected: '#a78bfa' };
    var fams = Q.families, n = Q.laws.length, i = 0, svg = '', fx = {};
    fams.forEach(function (f) { fx[f.id] = []; });
    Q.laws.forEach(function (l) { fx[l.family].push(l); });
    var gap = 0.12, a = -Math.PI / 2;
    fams.forEach(function (f, fi) {
      var list = fx[f.id], span = (2 * Math.PI - gap * fams.length) * list.length / n, a0 = a;
      svg += '<path d="M' + (cx + (R - 28) * Math.cos(a0)) + ' ' + (cy + (R - 28) * Math.sin(a0)) + ' A' + (R - 28) + ' ' + (R - 28) + ' 0 ' + (span > Math.PI ? 1 : 0) + ' 1 ' + (cx + (R - 28) * Math.cos(a0 + span)) + ' ' + (cy + (R - 28) * Math.sin(a0 + span)) + '" class="arc f' + fi + '"/>';
      var am = a0 + span / 2;
      svg += '<text x="' + (cx + (R + 42) * Math.cos(am)) + '" y="' + (cy + (R + 42) * Math.sin(am)) + '" text-anchor="middle" class="tx big">' + esc(f.title) + '</text>';
      list.forEach(function (l, k) {
        var t = a0 + span * (k + .5) / list.length, x = cx + R * Math.cos(t), y = cy + R * Math.sin(t), ix = cx + 80 * Math.cos(t), iy = cy + 80 * Math.sin(t);
        svg += '<line x1="' + ix + '" y1="' + iy + '" x2="' + x + '" y2="' + y + '" class="spoke"/><circle cx="' + x + '" cy="' + y + '" r="13" fill="' + (col[l.verdict] || '#888') + '" class="dot" data-id="' + esc(l.id) + '" data-v="' + l.verdict + '" tabindex="0"><title>' + esc(l.id + ' ' + l.name) + '</title></circle>';
      });
      a += span + gap;
    });
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="74" class="hub"/><text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" class="tx hubt">QWC</text><text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="tx">' + n + ' laws</text>';
    $('#qwc-map').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart map" role="img" aria-label="Law map">' + svg + '</svg>';
    var info = $('#qwc-info'), byId = {}; Q.laws.forEach(function (l) { byId[l.id] = l; });
    function pick(id) { var l = byId[id]; info.innerHTML = '<p class="num">' + esc(l.id) + '</p><h4>' + esc(l.name) + '</h4><span class="badge a-' + l.verdict + '">' + esc(Q.verdicts[l.verdict]) + '</span><p><i>' + esc(l.measure) + '</i></p><p>' + esc(l.result) + '</p>'; }
    $$('#qwc-map .dot').forEach(function (d) { d.addEventListener('mouseenter', function () { pick(d.getAttribute('data-id')); }); d.addEventListener('focus', function () { pick(d.getAttribute('data-id')); }); d.addEventListener('click', function () { pick(d.getAttribute('data-id')); }); });
    var leg = $('#qwc-leg');
    Object.keys(Q.verdicts).forEach(function (v) {
      if (!Q.laws.some(function (l) { return l.verdict === v; })) return;
      var b = document.createElement('button'); b.className = 'lg'; b.setAttribute('aria-pressed', 'true'); b.innerHTML = '<i style="background:' + col[v] + '"></i>' + esc(Q.verdicts[v]) + ' (' + Q.laws.filter(function (l) { return l.verdict === v; }).length + ')';
      b.addEventListener('click', function () { var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); $$('#qwc-map .dot[data-v="' + v + '"]').forEach(function (d) { d.style.opacity = on ? 1 : .12; }); });
      leg.appendChild(b);
    });
    pick(Q.laws[0].id);
    /* experiments strip */
    var xc = { PASS: '#34d399', FAIL: '#fb7185', VOID: '#f5b942', WITHDRAWN: '#fb7185' }, xs = '';
    Q.experiments.forEach(function (e, k) { xs += '<g class="xd" data-k="' + k + '" tabindex="0"><circle cx="' + (22 + k * 31) + '" cy="30" r="11" fill="' + (xc[e.verdict] || '#22d3ee') + '"/><text x="' + (22 + k * 31) + '" y="34" text-anchor="middle" class="tx dk">' + esc(e.id.replace(/^e/, '')) + '</text></g>'; });
    $('#qwc-exp').innerHTML = '<svg viewBox="0 0 ' + (Q.experiments.length * 31 + 14) + ' 60" class="chart">' + xs + '</svg><div id="qwc-exp-info" class="expinfo muted">Hover an experiment.</div>';
    function xp(k) { var e = Q.experiments[k]; $('#qwc-exp-info').innerHTML = '<b>' + esc(e.id) + ' · ' + esc(e.title) + '</b> <span class="badge ' + (e.verdict === 'PASS' ? 'v-pass' : e.verdict === 'VOID' ? 'v-void' : e.verdict === 'FAIL' || e.verdict === 'WITHDRAWN' ? 'v-fail' : 'v-mixed') + '">' + esc(e.verdict) + '</span><br>' + esc(e.note); }
    $$('#qwc-exp .xd').forEach(function (g) { g.addEventListener('mouseenter', function () { xp(+g.getAttribute('data-k')); }); g.addEventListener('focus', function () { xp(+g.getAttribute('data-k')); }); g.addEventListener('click', function () { xp(+g.getAttribute('data-k')); }); });
    /* threshold transfer toggle */
    var sets = { a: { t: 'All 237 pairs from 23 independent public sources', bars: [['QWC-based threshold', 34.2], ['Range check', 19.8], ['CUSUM', 3.8], ['BOCPD', 0.4]], note: 'Share of source-to-target pairs on which an unmodified alarm threshold stays usable.' },
      b: { t: 'Frozen test e1: benchmark families', bars: [['QWC-based threshold', 47.5], ['Range check', 15]], note: 'Usable share, McNemar p = 0.0044. Single operator; a blind third replication was inconclusive.' } };
    function tt(k) {
      var s = sets[k], h = '';
      s.bars.forEach(function (b, i) { h += '<div class="bar-row"><span>' + esc(b[0]) + '</span><i style="width:' + Math.max(b[1] / 50 * 100, 1) + '%"' + (i ? ' class="dim"' : '') + '></i><span>' + b[1] + '%</span></div>'; });
      $('#qwc-tt').innerHTML = '<h4>' + esc(s.t) + '</h4><div class="bars">' + h + '</div><p class="fine muted">' + esc(s.note) + '</p>';
      $$('#qwc-ttb button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-k') === k)); });
    }
    $$('#qwc-ttb button').forEach(function (b) { b.addEventListener('click', function () { tt(b.getAttribute('data-k')); }); });
    tt('a');
  };

  /* ---------- 4. NeoArc: cache -> symbolic -> model -> verifier ---------- */
  init.neoarc = function () {
    var cache = {}, stats = { hit: 0, sym: 0, model: 0, rej: 0 };
    function tokenize(s) { var m = s.match(/\d+\.?\d*|[()+\-*\/^]|[^\s]/g) || [], bad = m.some(function (t) { return !/^(\d+\.?\d*|[()+\-*\/^])$/.test(t); }); return bad ? null : m; }
    function evalRD(tok) { /* recursive descent */
      var p = 0;
      function peek() { return tok[p]; }
      function prim() { var t = tok[p++]; if (t === '(') { var v = add(); if (tok[p++] !== ')') throw 0; return v; } if (t === '-') return -pw(); if (/^\d/.test(t || '')) return parseFloat(t); throw 0; }
      function pw() { var b = prim(); if (peek() === '^') { p++; return Math.pow(b, pw()); } return b; }
      function mul() { var v = pw(); while (peek() === '*' || peek() === '/') { var o = tok[p++], r = pw(); v = o === '*' ? v * r : v / r; } return v; }
      function add() { var v = mul(); while (peek() === '+' || peek() === '-') { var o = tok[p++], r = mul(); v = o === '+' ? v + r : v - r; } return v; }
      var res = add(); if (p !== tok.length) throw 0; return res;
    }
    function evalRPN(tok) { /* independent verifier: shunting-yard */
      var prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4, 'u': 3 }, right = { '^': 1, 'u': 1 }, out = [], ops = [], prev = null;
      tok.forEach(function (t) {
        if (/^\d/.test(t)) out.push(parseFloat(t));
        else if (t === '(') ops.push(t);
        else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); ops.pop(); }
        else { var o = t; if (t === '-' && (prev === null || prev === '(' || /^[+\-*\/^]$/.test(prev))) o = 'u';
          while (ops.length) { var top = ops[ops.length - 1]; if (top === '(') break; if (prec[top] > prec[o] || (prec[top] === prec[o] && !right[o])) out.push(ops.pop()); else break; } ops.push(o); }
        prev = t;
      });
      while (ops.length) out.push(ops.pop());
      var st = [];
      out.forEach(function (t) { if (typeof t === 'number') st.push(t); else if (t === 'u') st.push(-st.pop()); else { var b = st.pop(), a = st.pop(); st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : t === '/' ? a / b : Math.pow(a, b)); } });
      return st[0];
    }
    var log = $('#na-log');
    function add(line, cls) { var d = document.createElement('div'); d.className = 'step ' + (cls || ''); d.innerHTML = line; log.insertBefore(d, log.firstChild); while (log.children.length > 12) log.removeChild(log.lastChild); $('#na-stats').textContent = 'cache hits ' + stats.hit + ' · symbolic ' + stats.sym + ' · model needed ' + stats.model + ' · rejected by verifier ' + stats.rej; }
    function ask() {
      var q = $('#na-q').value.trim(); if (!q) return; var key = q.replace(/\s+/g, ''), t0 = performance.now(), faulty = $('#na-bad').checked;
      if (cache[key] !== undefined && !faulty) { stats.hit++; add('<b>Tier 1 · cache</b> hit for <code>' + esc(q) + '</code> = <b>' + esc(cache[key]) + '</b> <span class="muted">(' + ((performance.now() - t0) * 1000).toFixed(0) + ' µs)</span> <span class="badge v-pass">verified earlier</span>', 'ok'); return; }
      var tok = tokenize(key), val = null;
      if (tok) { try { val = evalRD(tok); } catch (e) { val = null; } }
      if (val === null || !isFinite(val)) { stats.model++; add('<b>Tier 3 · model</b> would be asked for <code>' + esc(q) + '</code>. No model runs in this static page, so nothing is answered. Whatever a model returned would still have to pass the verifier.', 'warn'); return; }
      var proposed = val, src = 'Tier 2 · symbolic';
      if (faulty) { proposed = val * (1 + (Math.random() > .5 ? .01 : -.01)) + (Math.random() > .5 ? 1 : -1); src = 'Tier 3 · faulty model'; }
      var chk = evalRPN(tok), ok = Math.abs(chk - proposed) <= 1e-9 * Math.max(1, Math.abs(chk));
      if (ok) { stats.sym++; cache[key] = String(+proposed.toPrecision(12)); add('<b>' + src + '</b> → <b>' + esc(cache[key]) + '</b> <span class="muted">(' + (performance.now() - t0).toFixed(2) + ' ms)</span> · independent verifier agrees <span class="badge v-pass">verified, cached</span>', 'ok'); }
      else { stats.rej++; add('<b>' + src + '</b> proposed <b>' + esc(+proposed.toPrecision(8)) + '</b>, verifier computed <b>' + esc(+chk.toPrecision(8)) + '</b> <span class="badge v-fail">rejected, not cached</span>', 'bad'); }
    }
    $('#na-go').addEventListener('click', ask);
    $('#na-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });
    $$('#na-ex button').forEach(function (b) { b.addEventListener('click', function () { $('#na-q').value = b.textContent; ask(); }); });
    add('Ready. Ask for an arithmetic expression; repeat it to see the cache; tick the box to let a faulty model answer.', '');
  };

  /* ---------- 5. Neo-Planet: live events -> chain -> Monte Carlo ---------- */
  init.neoplanet = function () {
    var box = $('#np-live'), events = [], sel = $('#np-ev');
    box.innerHTML = '<p class="muted">Loading the USGS significant-earthquake feed…</p>';
    getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson').then(function (g) {
      events = g.features.map(function (f) { return { id: f.id, t: f.properties.time, kind: 'seismic', mag: f.properties.mag, place: f.properties.place, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }; }).filter(function (e) { return e.mag != null; });
      events.sort(function (a, b) { return b.t - a.t; });
      var s = '<svg viewBox="0 0 360 180" class="chart worldmap" role="img" aria-label="Earthquakes of the last seven days">';
      for (var lo = -180; lo <= 180; lo += 30) s += '<line x1="' + (lo + 180) + '" y1="0" x2="' + (lo + 180) + '" y2="180" class="gr"/>';
      for (var la = -90; la <= 90; la += 30) s += '<line x1="0" y1="' + (90 - la) + '" x2="360" y2="' + (90 - la) + '" class="gr"/>';
      events.forEach(function (e) { s += '<circle cx="' + (e.lon + 180).toFixed(1) + '" cy="' + (90 - e.lat).toFixed(1) + '" r="' + (Math.max(e.mag - 3.6, .8) * 1.5).toFixed(1) + '" class="ev" data-id="' + esc(e.id) + '"><title>M' + e.mag + ' ' + esc(e.place) + '</title></circle>'; });
      box.innerHTML = '<div class="kv"><div><b>' + events.length + '</b><span>events M4.5+ in the last 7 days</span></div><div><b>' + Math.max.apply(null, events.map(function (e) { return e.mag; })).toFixed(1) + '</b><span>largest magnitude</span></div></div>' + s + '</svg><p class="fine muted">Step 1-2 of the pipeline: collect from a free public source and normalise into one event schema (id, time, kind, magnitude, place, coordinates). Source: USGS Earthquake Hazards Program, fetched by your browser now. No basemap is drawn.</p>';
      sel.innerHTML = events.slice().sort(function (a, b) { return b.mag - a.mag; }).slice(0, 15).map(function (e) { return '<option value="' + esc(e.id) + '">M' + e.mag + ' · ' + esc(e.place) + '</option>'; }).join('');
      run();
    }).catch(function (e) { fail(box, e); });
    function run() {
      var e = events.filter(function (x) { return x.id === sel.value; })[0]; if (!e) return;
      var beta = +$('#np-beta').value, half = +$('#np-half').value, sig = +$('#np-sig').value, unc = +$('#np-unc').value;
      $('#np-bv').textContent = beta.toFixed(2) + '% per magnitude above 4.5'; $('#np-hv').textContent = half + ' days'; $('#np-sv').textContent = sig.toFixed(2) + '% a day'; $('#np-uv').textContent = unc.toFixed(2);
      var P = 3000, T = 20;
      var r2 = rng(7), res = [];
      for (var p2 = 0; p2 < P; p2++) { var w = 0, size2 = -beta * (e.mag - 4.5) * Math.exp(unc * gauss(r2) - unc * unc / 2), row2 = []; for (var t2 = 1; t2 <= T; t2++) { w += sig * gauss(r2); row2.push(w + size2 * Math.exp(-Math.LN2 * (t2 - 1) / half)); } res.push(row2); }
      var q = [.05, .25, .5, .75, .95], bands = q.map(function () { return []; }), lo = 1e9, hi = -1e9;
      for (var d = 0; d < T; d++) { var col = res.map(function (x) { return x[d]; }).sort(function (a, b) { return a - b; }); q.forEach(function (qq, k) { var v = col[Math.floor(qq * (P - 1))]; bands[k].push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }); }
      var X = function (i) { return 30 + i / (T - 1) * 360; }, Y = function (v) { return 10 + (hi - v) / ((hi - lo) || 1) * 130; };
      function poly(a, b) { var s = ''; a.forEach(function (v, i) { s += X(i) + ',' + Y(v) + ' '; }); for (var i = b.length - 1; i >= 0; i--) s += X(i) + ',' + Y(b[i]) + ' '; return s; }
      var svg = '<svg viewBox="0 0 410 160" class="chart"><polygon points="' + poly(bands[0], bands[4]) + '" class="fan a"/><polygon points="' + poly(bands[1], bands[3]) + '" class="fan b"/><polyline points="' + bands[2].map(function (v, i) { return X(i) + ',' + Y(v); }).join(' ') + '" class="ln"/><line x1="30" y1="' + Y(0) + '" x2="390" y2="' + Y(0) + '" class="ax"/><text x="26" y="' + (Y(0) + 4) + '" text-anchor="end" class="tx">0</text><text x="30" y="156" class="tx">day 1</text><text x="390" y="156" text-anchor="end" class="tx">day ' + T + '</text><text x="26" y="' + (Y(hi) + 4) + '" text-anchor="end" class="tx">' + hi.toFixed(1) + '</text><text x="26" y="' + (Y(lo) + 4) + '" text-anchor="end" class="tx">' + lo.toFixed(1) + '</text></svg>';
      $('#np-out').innerHTML = '<p class="muted"><b>Step 3-4:</b> event <b>M' + e.mag + ', ' + esc(e.place) + '</b> → (your assumption) sector exposure → ' + P.toLocaleString('en-US') + ' Monte Carlo paths of a hypothetical index over ' + T + ' days (% change; shaded: 25-75% and 5-95% bands).</p>' + svg;
    }
    $$('#p-neoplanet input, #p-neoplanet select').forEach(function (x) { x.addEventListener('input', run); });
  };

  /* ---------- 6. Canonis: content-addressed claims ---------- */
  init.canonis = function () {
    var claims = [], snaps = [], prop = [], seq = 0;
    var seed = [
      ['Threshold transfer: an unmodified QWC-based threshold stays usable on 34.2% of 237 source-target pairs, against 19.8% for a range check.', 'supports', 'Registry record T1, single operator'],
      ['A published density normalisation integrates to 0.215, 1.132 and 1.954 instead of 1.', 'contradicts', 'Frozen numerical check']
    ];
    function node(kind, text, rel, evtext) { return sha256(kind + '\n' + text).then(function (h) { return { id: h.slice(0, 12), kind: kind, text: text, rel: rel, ev: evtext }; }); }
    function draw() {
      var W = Math.max(claims.length * 190 + 20, 400), s = '';
      claims.forEach(function (c, i) {
        var x = 100 + i * 190;
        s += '<g><rect x="' + (x - 80) + '" y="14" width="160" height="46" rx="8" class="nd claim"/><text x="' + x + '" y="34" text-anchor="middle" class="tx">claim ' + c.id + '</text><text x="' + x + '" y="50" text-anchor="middle" class="tx dim">' + esc(c.text.slice(0, 22)) + (c.text.length > 22 ? '…' : '') + '</text></g>';
        if (c.ev) { s += '<line x1="' + x + '" y1="60" x2="' + x + '" y2="110" class="edge ' + c.rel + '"/><text x="' + (x + 6) + '" y="88" class="tx dim">' + c.rel + '</text><rect x="' + (x - 80) + '" y="110" width="160" height="40" rx="8" class="nd ev ' + c.rel + '"/><text x="' + x + '" y="134" text-anchor="middle" class="tx">' + esc(c.ev.slice(0, 24)) + '</text>'; }
      });
      $('#cn-graph').innerHTML = '<svg viewBox="0 0 ' + W + ' 166" class="chart">' + s + '</svg>';
      var sn = snaps.map(function (s) { return '<li><code>' + s.root.slice(0, 16) + '…</code> <span class="muted">v' + s.v + ' · ' + s.n + ' claims · parent ' + (s.parent ? s.parent.slice(0, 8) + '…' : 'none') + '</span></li>'; }).join('');
      $('#cn-snaps').innerHTML = sn ? '<ul class="oq">' + sn + '</ul>' : '<p class="muted">No snapshots yet.</p>';
      $('#cn-prop').innerHTML = prop.map(function (p, i) { return '<li>' + esc(p) + ' <button class="lg" data-i="' + i + '">AI: commit</button></li>'; }).join('') || '<li class="muted">Queue empty.</li>';
      $$('#cn-prop button').forEach(function (b) { b.addEventListener('click', function () { $('#cn-msg').textContent = 'Refused: agents may propose, but only a human or a validator can commit. The proposal stays in the queue.'; }); });
    }
    function addClaim(text, rel, evtext) { return node('claim', text, rel, evtext).then(function (n) { if (!claims.some(function (c) { return c.id === n.id; })) claims.push(n); draw(); }); }
    $('#cn-add').addEventListener('click', function () { var t = $('#cn-text').value.trim(); if (!t) return; addClaim(t, $('#cn-rel').value, $('#cn-ev').value.trim()).then(function () { $('#cn-text').value = ''; $('#cn-ev').value = ''; $('#cn-msg').textContent = 'Added as a content-addressed object. The same text always gets the same id.'; }); });
    $('#cn-snap').addEventListener('click', function () { var ids = claims.map(function (c) { return c.id; }).sort().join(','); sha256(ids + '|' + (snaps.length ? snaps[snaps.length - 1].root : '')).then(function (h) { snaps.push({ root: h, v: ++seq, n: claims.length, parent: snaps.length ? snaps[snaps.length - 1].root : null }); draw(); $('#cn-msg').textContent = 'Snapshot v' + seq + ' sealed: its root hash covers every claim id and the previous snapshot. Changing an old claim would change every later root.'; }); });
    $('#cn-ai').addEventListener('click', function () { prop.push('Proposed claim #' + (prop.length + 1) + ': “volatility clustering persists in all tested series”'); draw(); });
    seed.reduce(function (p, s) { return p.then(function () { return addClaim(s[0], s[1], s[2]); }); }, Promise.resolve());
  };

  show((location.hash || '#claimbound').slice(1));
})();
