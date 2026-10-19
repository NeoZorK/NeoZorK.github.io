/* NeoZorK Research: theme toggle and client-side filters (atlas, experiments, projects). No network, no trackers. */
(function () {
  var root = document.documentElement;
  try { var t = localStorage.getItem('nz-theme'); if (t) root.setAttribute('data-theme', t); } catch (e) {}
  var btn = document.getElementById('theme');
  if (btn) btn.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && !matchMedia('(prefers-color-scheme: light)').matches);
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('nz-theme', next); } catch (e) {}
  });

  /* filters: .filters[data-list][data-attr] contains buttons carrying data-f / data-v / data-x; items live in [data-items=list] */
  var state = {};
  function apply(list) {
    var box = document.querySelector('[data-items="' + list + '"]');
    if (!box) return;
    var st = state[list] || {}, q = (st.q || '').toLowerCase(), shown = 0, total = 0;
    box.querySelectorAll(':scope > *').forEach(function (el) {
      total++;
      var ok = true;
      Object.keys(st).forEach(function (a) {
        if (a === 'q' || st[a] === 'all') return;
        if (el.getAttribute('data-' + a) !== st[a]) ok = false;
      });
      if (q && (el.getAttribute('data-text') || el.textContent).toLowerCase().indexOf(q) < 0) ok = false;
      el.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    var c = document.getElementById(list + '-count');
    if (c) c.textContent = shown + ' of ' + total + ' shown';
  }
  document.querySelectorAll('.filters[data-list]').forEach(function (grp) {
    var list = grp.getAttribute('data-list'), attr = grp.getAttribute('data-attr');
    grp.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        grp.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        var v = b.getAttribute('data-f') || b.getAttribute('data-v') || b.getAttribute('data-x');
        (state[list] = state[list] || {})[attr] = v;
        apply(list);
      });
    });
  });
  document.querySelectorAll('input[data-search]').forEach(function (inp) {
    var list = inp.getAttribute('data-search');
    inp.addEventListener('input', function () { (state[list] = state[list] || {}).q = inp.value; apply(list); });
  });
  ['atlas', 'exps', 'projects'].forEach(apply);
})();

/* tiles open a dialog; the seal letters show their meaning */
(function () {
  var dlg = document.getElementById('dlg'), body = document.getElementById('dlgbody');
  function open(t) {
    var f = t.querySelector('.full'); if (!f || !dlg || !dlg.showModal) return;
    body.innerHTML = f.innerHTML; dlg.showModal();
  }
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('.tile'); if (t) open(t); else if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tile')) { e.preventDefault(); open(e.target); } });
  var raw = document.getElementById('seal-data'), info = document.getElementById('seal-info');
  if (raw && info) {
    var D = JSON.parse(raw.textContent);
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function show(i) { var d = D[i]; info.innerHTML = '<p class="num">Letter ' + (i + 1) + ' of 7</p><h3>' + esc(d.l) + ' · ' + esc(d.slogan) + '</h3><p><b>' + esc(d.pillar) + '</b> · ' + esc(d.project) + '</p><p class="muted">' + esc(d.skills) + '</p>'; }
    Array.prototype.forEach.call(document.querySelectorAll('.seal .lt'), function (g) {
      var i = +g.getAttribute('data-i');
      ['mouseenter', 'focus', 'click'].forEach(function (ev) { g.addEventListener(ev, function () { show(i); }); });
    });
  }
})();
