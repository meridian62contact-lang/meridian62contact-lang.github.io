/* =====================================================================
   MINE-TO-MODEL MAP — behaviour (map drawing, filters, drawer, tabs, desk lenses)
   Data lives in m2m-data.js; desk lenses in _data/mine_to_model.yml.
   ===================================================================== */
(function () {
  'use strict';
  var root = document.getElementById('m2m');
  if (!root || typeof C === 'undefined') return;

  var byId = {}; C.forEach(function (c) { byId[c.id] = c; });
  var $ = function (s) { return root.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
  var sup = function (arr) { return arr && arr.length ? ' <sup class="s"><a href="#sources" data-src>' + arr.join(',') + '</a></sup>' : ''; };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var layerColor = function (L) { return 'var(--c' + L + ')'; };
  var styleColor = function (s) { return 'var(--s' + s + ')'; };

  /* ---------- desks: lenses from _data/mine_to_model.yml + tickers each desk covers ---------- */
  var M = window.M62 || { sectors: [] };
  var sectorBySlug = {}; (M.sectors || []).forEach(function (s) { sectorBySlug[s.slug] = s; });
  var LENSES = (window.M2M_DESKS || []).filter(function (d) { return sectorBySlug[d.slug]; }).map(function (d) {
    var s = sectorBySlug[d.slug];
    return { slug: d.slug, number: s.number, name: s.name, url: s.url, focus: d.focus, blurb: d.blurb,
      ids: (d.companies || []).filter(function (id) { return byId[id]; }) };
  });
  var lensBySlug = {}; LENSES.forEach(function (l) { lensBySlug[l.slug] = l; });
  // Star a company when a desk lists its ticker (e.g. "SIE.DE" matches "SIE · Xetra").
  var coveredBy = {};
  var baseTk = function (t) { return String(t || '').toUpperCase().split(/[\s.·/]/)[0]; };
  (M.sectors || []).forEach(function (s) {
    (s.equities || []).forEach(function (e) {
      var t = baseTk(e.ticker); if (!t) return;
      C.forEach(function (c) { if (baseTk(c.tk) === t) (coveredBy[c.id] = coveredBy[c.id] || []).push(s); });
    });
  });

  /* ---------- filters ---------- */
  var F = { region: 'all', style: 'all', demand: 'all', desk: 'all', q: '' };
  function chips(sel, key, opts) {
    var el = $(sel); if (!el) return;
    [['all', 'All']].concat(opts).forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'm2m-chip'; b.dataset.v = o[0];
      if (o[2]) { b.innerHTML = '<b>' + esc(o[2]) + '</b>' + esc(o[1]); } else { b.textContent = o[1]; }
      b.setAttribute('aria-pressed', o[0] === F[key] ? 'true' : 'false');
      b.addEventListener('click', function () { setFilter(key, o[0]); });
      el.appendChild(b);
    });
  }
  function setFilter(key, v) {
    F[key] = v;
    root.querySelectorAll('[data-filter="' + key + '"] .m2m-chip').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false'); });
    if (key === 'desk') renderLens();
    applyFilters();
  }
  function matches(c) {
    if (F.region !== 'all' && c.r !== F.region) return false;
    if (F.style !== 'all' && c.st !== F.style) return false;
    if (F.demand !== 'all' && c.d !== F.demand) return false;
    if (F.desk !== 'all' && lensBySlug[F.desk] && lensBySlug[F.desk].ids.indexOf(c.id) === -1) return false;
    if (F.q && !(c.name.toLowerCase().indexOf(F.q) > -1 || c.tk.toLowerCase().indexOf(F.q) > -1)) return false;
    return true;
  }
  function renderLens() {
    var box = $('#m2m-lens'), l = lensBySlug[F.desk];
    if (!l) { box.hidden = true; box.innerHTML = ''; return; }
    var covered = C.filter(function (c) { return (coveredBy[c.id] || []).some(function (s) { return s.slug === l.slug; }); }).map(function (c) { return c.name; });
    box.innerHTML = '<div><h3><small>' + esc(l.number) + ' · ' + esc(l.name) + ' desk lens</small>' + esc(l.focus) + '</h3><p>' + esc(l.blurb) + '</p>' +
      '<p class="small" style="margin-top:.6rem">' + l.ids.length + ' companies in focus' + (covered.length ? ' · <span style="color:var(--gold)">★</span> desk equities on the map: ' + esc(covered.join(', ')) : '') + '</p></div>' +
      '<a class="arrow-link" href="' + esc(l.url) + '">Open the desk</a>';
    box.hidden = false;
  }

  /* ---------- map ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  var colW = 196, nodeW = 172, nodeH = 48, gapY = 12, top = 56, left = 14;
  var pos = {}, svg = $('#m2m-svg'), W = 0, H = 0, zoom = 1;
  var edgeEls = [], nodeEls = {};
  function mk(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function layout() {
    var cols = {}, maxRows = 0;
    C.forEach(function (c) { (cols[c.L] = cols[c.L] || []).push(c); });
    LAYERS.forEach(function (l) { maxRows = Math.max(maxRows, (cols[l.id] || []).length); });
    H = top + maxRows * (nodeH + gapY) + 24;
    W = left + LAYERS.length * colW;
    LAYERS.forEach(function (l, i) {
      var list = cols[l.id] || [], colH = list.length * (nodeH + gapY) - gapY, y0 = top + ((H - top - 24) - colH) / 2;
      list.forEach(function (c, j) { pos[c.id] = { x: left + i * colW, y: y0 + j * (nodeH + gapY) }; });
    });
  }
  function edgePath(a, b) {
    var A = pos[a], B = pos[b], ay = A.y + nodeH / 2, by = B.y + nodeH / 2, x1, x2, dx;
    if (B.x > A.x) { x1 = A.x + nodeW; x2 = B.x; dx = (x2 - x1) * 0.5; return 'M' + x1 + ',' + ay + ' C' + (x1 + dx) + ',' + ay + ' ' + (x2 - dx) + ',' + by + ' ' + x2 + ',' + by; }
    if (B.x < A.x) { x1 = A.x; x2 = B.x + nodeW; dx = Math.max(60, (x1 - x2) * 0.35); return 'M' + x1 + ',' + ay + ' C' + (x1 - dx) + ',' + (ay - 40) + ' ' + (x2 + dx) + ',' + (by - 40) + ' ' + x2 + ',' + by; }
    var x = A.x + nodeW; return 'M' + x + ',' + ay + ' C' + (x + 50) + ',' + ay + ' ' + (x + 50) + ',' + by + ' ' + x + ',' + by;
  }
  function draw() {
    layout();
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    LAYERS.forEach(function (l, i) {
      var x = left + i * colW;
      mk('rect', { x: x, y: 14, width: nodeW, height: 2, fill: layerColor(l.id) }, svg);
      mk('text', { x: x, y: 36, 'class': 'colnum' }, svg).textContent = pad(l.id);
      mk('text', { x: x + 24, y: 35, 'class': 'colhead' }, svg).textContent = l.short;
    });
    var gE = mk('g', {}, svg), gN = mk('g', {}, svg);
    E.forEach(function (e) {
      var p = mk('path', { d: edgePath(e[0], e[1]), 'class': 'm2m-edge ' + e[2] }, gE);
      p.dataset.a = e[0]; p.dataset.b = e[1]; edgeEls.push(p);
    });
    C.forEach(function (c) {
      var x = pos[c.id].x, y = pos[c.id].y;
      var g = mk('g', { 'class': 'm2m-node', transform: 'translate(' + x + ',' + y + ')', tabindex: '0', role: 'button', 'aria-label': c.name + ', ' + LAYERS[c.L - 1].name }, gN);
      mk('rect', { 'class': 'box', width: nodeW, height: nodeH, rx: 3 }, g);
      mk('rect', { width: 3, height: nodeH, fill: layerColor(c.L) }, g);
      mk('text', { 'class': 'nm', x: 13, y: 19 }, g).textContent = c.name.length > 21 ? c.name.slice(0, 20) + '…' : c.name;
      mk('text', { 'class': 'tk', x: 13, y: 35 }, g).textContent = c.tk.length > 17 ? c.tk.slice(0, 16) + '…' : c.tk;
      if (coveredBy[c.id]) mk('text', { 'class': 'star', x: nodeW - 8, y: 16, 'text-anchor': 'end' }, g).textContent = '★';
      mk('rect', { x: nodeW - 44, y: 26, width: 18, height: 14, rx: 2, fill: styleColor(c.st), opacity: 0.18 }, g);
      mk('text', { 'class': 'badge', x: nodeW - 35, y: 36.5, 'text-anchor': 'middle', fill: styleColor(c.st), style: 'fill:' + styleColor(c.st) }, g).textContent = c.st;
      mk('rect', { x: nodeW - 24, y: 26, width: 20, height: 14, rx: 2, fill: 'var(--m2m-edge)', opacity: 0.3 }, g);
      mk('text', { 'class': 'badge', x: nodeW - 14, y: 36.5, 'text-anchor': 'middle' }, g).textContent = c.d;
      g.addEventListener('click', function (ev) { ev.stopPropagation(); select(c.id); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(c.id); } });
      mk('title', {}, g).textContent = c.name + ' — ' + STYLES[c.st].label + ', ' + DEMAND[c.d].label + (coveredBy[c.id] ? ' · covered by a Meridian62 desk' : '');
      nodeEls[c.id] = g;
    });
    svg.addEventListener('click', function () { select(null); });
    applyZoom();
  }
  function applyZoom() { svg.setAttribute('width', Math.round(W * zoom)); svg.setAttribute('height', Math.round(H * zoom)); }
  function fitWidth() { return ($('#m2m-scroller').clientWidth - 4) / W; }
  var fitted = false;
  function fit() { if (!$('#m2m-scroller').clientWidth) return; fitted = true; zoom = Math.min(1, Math.max(0.74, fitWidth())); applyZoom(); }
  $('#m2m-zin').addEventListener('click', function () { zoom = Math.min(1.6, zoom + 0.15); applyZoom(); });
  $('#m2m-zout').addEventListener('click', function () { zoom = Math.max(0.4, zoom - 0.15); applyZoom(); });
  $('#m2m-zfit').addEventListener('click', function () { zoom = Math.max(0.4, fitWidth()); applyZoom(); });

  var selected = null;
  function select(id) {
    selected = id;
    var conn = {};
    edgeEls.forEach(function (p) {
      var on = !!(id && (p.dataset.a === id || p.dataset.b === id));
      p.classList.toggle('on', on);
      p.classList.toggle('in', on && p.dataset.b === id);
      p.classList.toggle('dim', !!(id && !on));
      if (on) { conn[p.dataset.a] = 1; conn[p.dataset.b] = 1; }
    });
    C.forEach(function (c) {
      var g = nodeEls[c.id];
      g.classList.toggle('sel', c.id === id);
      g.classList.toggle('hl', !!(id && conn[c.id] && c.id !== id));
    });
    applyFilters();
    if (id) openDrawer(id); else closeDrawer();
  }
  function filtering() { return F.region !== 'all' || F.style !== 'all' || F.demand !== 'all' || F.desk !== 'all' || F.q; }
  function applyFilters() {
    var f = filtering();
    C.forEach(function (c) {
      var g = nodeEls[c.id]; if (!g) return;
      var dim = f && !matches(c);
      if (selected && !f) {
        dim = !(c.id === selected || E.some(function (e) { return (e[0] === selected && e[1] === c.id) || (e[1] === selected && e[0] === c.id); }));
      }
      g.classList.toggle('dim', !!dim);
    });
    // with a lens or filter on, fade lines that do not join two visible companies
    if (f && !selected) edgeEls.forEach(function (p) { p.classList.toggle('dim', !(matches(byId[p.dataset.a]) && matches(byId[p.dataset.b]))); });
    else if (!selected) edgeEls.forEach(function (p) { p.classList.remove('dim'); });
    renderCompanies();
  }

  /* ---------- drawer ---------- */
  var drawer = document.getElementById('m2m-drawer');
  function rel(id) {
    var s = [], cu = [], fin = [];
    E.forEach(function (e) {
      var a = e[0], b = e[1], t = e[2];
      if (t === 'm' || t === 'p') { if (a === id) fin.push([b, t === 'm' ? 'invests in' : 'partner']); if (b === id) fin.push([a, t === 'm' ? 'funded by' : 'partner']); return; }
      if (b === id) s.push(a); if (a === id) cu.push(b);
    });
    return { sup: s, cus: cu, fin: fin };
  }
  function linkBtns(list) {
    if (!list.length) return '<span class="m2m-v" style="color:var(--muted)">None shown</span>';
    return '<div class="m2m-links">' + list.map(function (x) {
      var id = Array.isArray(x) ? x[0] : x, lab = Array.isArray(x) ? x[1] : '';
      return '<button type="button" data-go="' + id + '">' + esc(byId[id].name) + (lab ? ' · ' + lab : '') + '</button>';
    }).join('') + '</div>';
  }
  var lastFocus = null;
  function openDrawer(id) {
    var c = byId[id], r = rel(id), cov = coveredBy[id] || [];
    var lenses = LENSES.filter(function (l) { return l.ids.indexOf(id) > -1; });
    drawer.innerHTML =
      '<button class="m2m-handle" type="button" data-expand aria-expanded="false">Tap to expand</button>' +
      '<button class="m2m-close" type="button" data-close>Close ✕</button>' +
      '<span class="m2m-kicker" style="color:' + layerColor(c.L) + '">' + pad(c.L) + ' · ' + esc(LAYERS[c.L - 1].name) + '</span>' +
      '<h2 id="m2m-dtitle">' + esc(c.name) + '</h2>' +
      '<div class="m2m-sub">' + esc(c.tk) + ' · ' + esc(REGIONS[c.r]) + '</div>' +
      '<div class="m2m-pills"><span class="m2m-pill" style="color:' + styleColor(c.st) + '" title="' + esc(STYLES[c.st].desc) + '">' + esc(STYLES[c.st].label) + '</span>' +
      '<span class="m2m-pill" style="color:var(--ink-2)" title="' + esc(DEMAND[c.d].desc) + '">' + esc(DEMAND[c.d].label) + '</span></div>' +
      (cov.length ? '<div class="m2m-covered"><span style="color:var(--gold)">★</span> Covered by Meridian62: ' + cov.map(function (s) { return '<a href="' + esc(s.url) + '">' + esc(s.number) + ' ' + esc(s.name) + ' desk</a>'; }).join(', ') + '. Read the desk\'s weekly notes for the latest.</div>' : '') +
      '<div class="m2m-dl">' +
      '<div><div class="m2m-k">Role in the chain</div><div class="m2m-v">' + esc(c.role) + sup(c.src && !c.rev ? c.src : null) + '</div></div>' +
      '<div><div class="m2m-k">How it makes money</div><div class="m2m-v">' + esc(c.rev) + sup(c.src) + '</div></div>' +
      '<div><div class="m2m-k">Demand &amp; contract coverage</div><div class="m2m-v">' + esc(c.dem) + sup(c.src2) + '</div><div class="m2m-note" style="margin-top:.5rem">' + esc(DEMAND[c.d].label) + ': ' + esc(DEMAND[c.d].desc) + '</div></div>' +
      '<div><div class="m2m-k">Cash-flow risks</div><div class="m2m-v">' + esc(c.risk) + sup(c.srcR) + '</div></div>' +
      '<div><div class="m2m-k">Style</div><div class="m2m-v">' + esc(STYLES[c.st].label) + ': ' + esc(STYLES[c.st].desc) + '</div></div>' +
      '<div><div class="m2m-k">Where it operates</div><div class="m2m-v">' + esc(c.geo) + '</div></div>' +
      '<div><div class="m2m-k">Geopolitical exposure</div><div class="m2m-v">' + esc(c.gp) + sup(c.srcG) + '</div></div>' +
      (c.note ? '<div class="m2m-note">' + esc(c.note) + '</div>' : '') +
      '<div><div class="m2m-k">Supplied by</div>' + linkBtns(r.sup) + '</div>' +
      '<div><div class="m2m-k">Sells to</div>' + linkBtns(r.cus) + '</div>' +
      (r.fin.length ? '<div><div class="m2m-k">Financial links &amp; partnerships</div>' + linkBtns(r.fin) + '</div>' : '') +
      (lenses.length ? '<div><div class="m2m-k">Relevant to these desks</div><div class="m2m-links">' + lenses.map(function (l) { return '<button type="button" data-lens="' + l.slug + '">' + esc(l.number) + ' ' + esc(l.name) + '</button>'; }).join('') + '</div></div>' : '') +
      '</div>';
    if (drawer.hidden) lastFocus = document.activeElement;
    drawer.classList.remove('is-full');
    drawer.hidden = false;
    keepMapInPlace(function () { root.classList.add('m2m--panel'); });
    if (currentView() === 'map') requestAnimationFrame(function () { reveal(id); });
    drawer.setAttribute('aria-labelledby', 'm2m-dtitle');
    drawer.scrollTop = 0;
    drawer.querySelector('[data-close]').focus({ preventScroll: true });
  }
  // opening/closing the panel narrows/widens the page, so filters re-wrap; keep the map where the reader left it
  function keepMapInPlace(change) {
    var box = $('.m2m-mapbox'), visible = currentView() === 'map' && box && box.offsetParent;
    var before = visible ? box.getBoundingClientRect().top : 0;
    change();
    if (visible) window.scrollBy(0, box.getBoundingClientRect().top - before);
  }
  // bring the selected company into the part of the screen the reader can actually see:
  // between the site header and the bottom of the window (or the top of the sheet on phones)
  var phone = window.matchMedia('(max-width:640px)');
  function reveal(id) {
    var sc = $('#m2m-scroller'), p = pos[id]; if (!sc || !p) return;
    var cx = (p.x + nodeW / 2) * zoom, cy = (p.y + nodeH / 2) * zoom;
    var left = Math.max(0, cx - sc.clientWidth / 2);
    var topIn = sc.scrollHeight > sc.clientHeight ? Math.max(0, cy - sc.clientHeight / 2) : 0;
    sc.scrollTo({ left: left, top: topIn, behavior: 'smooth' });
    var header = document.querySelector('.site-header');
    var visTop = header ? header.getBoundingClientRect().bottom : 0;
    var visBottom = phone.matches ? drawer.getBoundingClientRect().top : window.innerHeight;
    var nodeY = sc.getBoundingClientRect().top + cy - topIn;
    var margin = nodeH * zoom;
    if (phone.matches || nodeY < visTop + margin || nodeY > visBottom - margin) {
      window.scrollBy({ top: nodeY - (visTop + visBottom) / 2, behavior: 'smooth' });
    }
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    keepMapInPlace(function () { root.classList.remove('m2m--panel'); });
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  drawer.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) { if (ev.target.closest('[data-src]')) { ev.preventDefault(); go('sources'); } return; }
    if (t.hasAttribute('data-expand')) {
      var full = drawer.classList.toggle('is-full');
      t.setAttribute('aria-expanded', full ? 'true' : 'false');
      t.textContent = full ? 'Tap to shrink' : 'Tap to expand';
    }
    else if (t.hasAttribute('data-close')) { select(null); closeDrawer(); }
    else if (t.dataset.go) { if (currentView() === 'map') select(t.dataset.go); else openDrawer(t.dataset.go); }
    else if (t.dataset.lens) { select(null); closeDrawer(); setFilter('desk', t.dataset.lens); go('map'); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !drawer.hidden) { select(null); closeDrawer(); } });

  /* ---------- companies view ---------- */
  function renderCompanies() {
    var host = $('#m2m-v-companies');
    var parts = ['<div class="m2m-prose"><h2>All ' + C.length + ' companies by layer</h2><p>The filters and desk lens above apply here too. Open any card for its full profile and connections. <span style="color:var(--gold)">★</span> marks a company a Meridian62 desk covers.</p></div>'];
    var shown = 0;
    LAYERS.forEach(function (l) {
      var list = C.filter(function (c) { return c.L === l.id && matches(c); });
      if (!list.length) return;
      shown += list.length;
      parts.push('<div class="m2m-layerhead"><span class="sw" style="background:' + layerColor(l.id) + '"></span><h3>' + pad(l.id) + ' · ' + esc(l.name) + '</h3></div>');
      parts.push('<div class="m2m-grid">' + list.map(function (c) {
        return '<article class="m2m-card">' +
          '<h3><span>' + esc(c.name) + (coveredBy[c.id] ? '<span class="star" title="Covered by a Meridian62 desk">★</span>' : '') + '</span><span class="tk">' + esc(c.tk) + '</span></h3>' +
          '<div class="m2m-pills" style="margin:0"><span class="m2m-pill" style="color:' + styleColor(c.st) + '">' + esc(STYLES[c.st].label) + '</span><span class="m2m-pill" style="color:var(--ink-2)">' + esc(DEMAND[c.d].label) + '</span><span class="m2m-pill" style="color:var(--muted)">' + esc(REGIONS[c.r]) + '</span></div>' +
          '<div><div class="m2m-k">How it makes money</div><p>' + esc(c.rev) + sup(c.src) + '</p></div>' +
          '<div><div class="m2m-k">Demand</div><p>' + esc(c.dem) + sup(c.src2) + '</p></div>' +
          '<div><div class="m2m-k">Risks</div><p>' + esc(c.risk) + sup(c.srcR) + '</p></div>' +
          '<div><button class="m2m-chip" type="button" data-open="' + c.id + '">Full profile &amp; links</button></div></article>';
      }).join('') + '</div>');
    });
    if (!shown) parts.push('<p class="empty">No company matches these filters.</p>');
    host.innerHTML = parts.join('');
  }
  $('#m2m-v-companies').addEventListener('click', function (ev) { var b = ev.target.closest('[data-open]'); if (b) openDrawer(b.dataset.open); });

  /* ---------- follow the money: contract ladder ---------- */
  var LADDER = [
    ['Long-term contracted', 'Pays even if usage falls', 'Industrial-gas on-site contracts (Linde, Air Liquide, Air Products), nuclear PPAs (Constellation), data-centre leases (Digital Realty, Equinix, developers), committed compute (CoreWeave, Nebius, Oracle), MP Materials\' government price floor.', 'Ask who the counterparty is: a gas contract with TSMC is far safer than a compute contract with a loss-making AI lab.'],
    ['Recurring', 'Repeats while the product is used', 'EDA software (Synopsys, Cadence), Arm royalties, cloud consumption and subscriptions (Microsoft, Alphabet, Amazon, Alibaba), service businesses at ASML, GE Vernova and Siemens Energy.', 'Sticky, but consumption-based cloud revenue can slow quickly if customers cut usage.'],
    ['Order backlog', 'Firm orders delivered over 1–3 years', 'ASML, Siemens, Schneider, Eaton, ABB, Prysmian, GE Vernova, Siemens Energy, Hitachi, Vertiv, Trane, Johnson Controls, Broadcom, Dell.', 'Backlog can be pushed out and, rarely, cancelled; it protects revenue for a year or two, not a decade.'],
    ['Short-cycle orders', 'A few quarters of visibility', 'Nvidia, AMD, Marvell, TSMC (reserved but not take-or-pay), SK hynix HBM, Intel, servers (Foxconn, Supermicro), networking (Arista, Corning), tool makers (Applied Materials, Lam, Tokyo Electron, KLA), wafers.', 'Most exposed to a sudden pause in hyperscaler capex, even though today\'s demand exceeds supply.'],
    ['Spot / market price', 'Revenue = volume × price', 'Copper, silver and PGM miners (Freeport, Fresnillo, Valterra), commodity memory (Samsung, Micron).', 'Most cyclical: prices can fall sharply when supply catches up, whatever the long-run AI story.']
  ];
  $('#m2m-ladder').innerHTML = LADDER.map(function (r, i) {
    return '<div class="m2m-rung"><div class="h"><span class="rank">' + (i + 1) + '</span>' + esc(r[0]) + '<small>' + esc(r[1]) + '</small></div><div><p>' + esc(r[2]) + '</p><p>' + esc(r[3]) + '</p></div></div>';
  }).join('');

  /* ---------- geopolitics ---------- */
  var FLASH = [
    { t: 'Taiwan Strait', s: [24, 25], body: 'Taiwan has over 90% of the world\'s leading-edge chip manufacturing. Chinese military patrols, live-fire drills and coast-guard incursions around Taiwan and Kinmen continued through 2026. TSMC\'s second Arizona fab is due to start volume production in Q3 2027, but the most advanced nodes remain in Taiwan.', who: 'TSMC, ASE, Foxconn, Delta, and every chip designer that depends on them (Nvidia, AMD, Broadcom, Marvell), plus the clouds and labs downstream.' },
    { t: 'China\'s mineral levers', s: [14, 15, 16], body: 'China produces about 98% of primary gallium and 77% of refined germanium and dominates rare-earth processing. Suspended export restrictions were due to lapse on 10 Nov 2026 (rare earths package) and 27 Nov 2026 (US-specific gallium/germanium/antimony ban), with no extension published as of 9 Nov; both sides say the wider truce runs to 10 Jan 2027. Beijing cut rare-earth and gallium supply to Japan to near zero in 2026.', who: 'Shin-Etsu (magnets), Delta (GaN power chips), Corning (germanium fibre), cooling and motor makers. Beneficiaries: MP Materials, Lynas.' },
    { t: 'US chip export controls and China\'s response', s: [12, 13], body: 'The US allowed H200 sales to approved Chinese buyers with a 25% cut for the US government (Dec 2025), then moved to case-by-case review (Jan 2026). Beijing has restricted purchases and required state-funded data centres to use domestic chips. Nvidia\'s outlook assumes no China data-centre compute revenue. China\'s consultation on restricting AI-technology exports closes on 15 Nov 2026, and APEC meets in Shenzhen on 18–19 Nov.', who: 'Nvidia, AMD, tool makers (ASML, Applied Materials, Lam, Tokyo Electron, KLA), EDA (Synopsys, Cadence). Beneficiaries: Huawei, SMIC, Alibaba\'s own chips.' },
    { t: 'The Netherlands and ASML', s: [3], body: 'China was 23% of ASML\'s Q3 2026 system sales, up from 14% in Q2, as Chinese memory makers stockpiled DUV tools. Dutch and US licences already bar EUV sales to China; any further tightening falls directly on ASML\'s order book.', who: 'ASML, and indirectly Zeiss and ASML\'s supply base in Europe and the US.' },
    { t: 'Nvidia leadership shock', s: [10, 11], body: 'On 12 Nov 2026 Jensen Huang resigned as Nvidia\'s CEO and left the board; CFO Colette Kress became interim CEO and Harvey C. Jones became board chair. Nvidia said it was investigating whether Huang was the target of a foreign intelligence effort and that it had no reason to believe secrets were compromised; China called media allegations unsubstantiated, and US lawmakers have called for investigations. Shares fell more than 4% that day. Q3 FY2027 results are due on 17 Nov.', who: 'Nvidia directly; indirectly every company whose orders depend on Nvidia\'s roadmap, and US–China chip negotiations.' },
    { t: 'Korea and memory', s: [5, 6], body: 'Korean firms (Samsung, SK hynix) make most of the world\'s DRAM and HBM, and both run fabs in China that need US equipment licences. HBM was reported sold out across all suppliers through 2026, which gives memory makers pricing power but concentrates risk in a few Korean sites.', who: 'Samsung, SK hynix, Micron; Nvidia and AMD as buyers.' },
    { t: 'Power and permitting', s: [2], body: 'Electricity is now the binding constraint on data-centre growth. Gas turbines, transformers and switchgear have multi-year lead times, nuclear plants are being restarted under 20-year contracts, and Siemens warned on its Q4 call that permitting could cause \'hesitation in order intake\'.', who: 'GE Vernova, Siemens Energy, Hitachi, Siemens, Schneider, Eaton, Constellation, data-centre developers.' },
    { t: 'Resource nationalism in metals', s: [26], body: 'Copper traded above $14,000/t in July 2026. Supply depends on Indonesia (Grasberg, with export and smelting rules), Chile and Peru, while PGMs depend on South Africa\'s power grid and Russia, and silver on Mexican mining law.', who: 'Freeport-McMoRan, Valterra Platinum, Fresnillo; downstream cable makers (Prysmian) and electrical-equipment makers.' },
    { t: 'Specialty gases', s: [], body: 'Fabs need helium (from the US, Qatar, Algeria and Russia) and neon (Ukraine was a major source before 2022, which caused a price spike). Gas companies hedge this with multiple sources and long-term contracts, but a Gulf shipping disruption or sanctions can tighten supply quickly.', who: 'Linde, Air Liquide, Air Products, and every fab.' },
    { t: 'Gulf AI campuses', s: [], body: 'OpenAI and US cloud companies are building AI capacity in the UAE and Saudi Arabia, funded partly by Gulf sovereign money. Each project needs US export licences for advanced chips, which links AI build-out to US foreign policy.', who: 'OpenAI, Microsoft, Oracle, Nvidia, AMD; Air Products (Saudi Arabia).' }
  ];
  $('#m2m-flash').innerHTML = FLASH.map(function (f) {
    return '<article class="m2m-card m2m-flash"><h3>' + esc(f.t) + '</h3><p>' + esc(f.body) + sup(f.s) + '</p><p class="who"><strong>Exposed:</strong> ' + esc(f.who) + '</p></article>';
  }).join('');

  /* ---------- growth vs value ---------- */
  $('#m2m-stylegrid').innerHTML = Object.keys(STYLES).map(function (k) {
    var v = STYLES[k], list = C.filter(function (c) { return c.st === k; }).map(function (c) { return c.name; });
    return '<article class="m2m-card"><h3><span style="color:' + styleColor(k) + '">' + esc(v.label) + '</span><span class="tk">' + list.length + '</span></h3><p>' + esc(v.desc) + '</p><p style="color:var(--muted);font-size:.86rem">' + esc(list.join(', ')) + '</p></article>';
  }).join('');

  /* ---------- sources ---------- */
  $('#m2m-srclist').innerHTML = Object.keys(SOURCES).map(function (n) {
    var t = SOURCES[n][0], u = SOURCES[n][1];
    return '<li value="' + n + '">' + esc(t) + ' — <a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a></li>';
  }).join('');

  /* ---------- tabs (hash routing, no page jump) ---------- */
  var VIEWS = ['map', 'companies', 'money', 'geopolitics', 'styles', 'sources'];
  function currentView() { var h = location.hash.replace('#', ''); return VIEWS.indexOf(h) > -1 ? h : 'map'; }
  function route() {
    var v = currentView();
    VIEWS.forEach(function (x) { $('#m2m-v-' + x).hidden = x !== v; });
    root.querySelectorAll('.m2m-tabs a').forEach(function (a) { a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'); });
    var showControls = v === 'map' || v === 'companies';
    $('#m2m-controls').hidden = !showControls;
    if (!showControls) { $('#m2m-lens').hidden = true; closeDrawer(); } else { renderLens(); }
    if (v === 'map' && !fitted) requestAnimationFrame(fit);
  }
  function go(v) {
    if (history.replaceState) history.replaceState(null, '', '#' + v); else location.hash = v;
    route();
    var tabs = $('.m2m-tabs');
    if (tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  root.addEventListener('click', function (ev) {
    var a = ev.target.closest('a[href^="#"]'); if (!a) return;
    var v = a.getAttribute('href').slice(1);
    if (VIEWS.indexOf(v) > -1) { ev.preventDefault(); go(v); }
  });
  window.addEventListener('hashchange', route);

  /* ---------- start ---------- */
  chips('[data-filter="desk"]', 'desk', LENSES.map(function (l) { return [l.slug, l.name, l.number]; }));
  chips('[data-filter="region"]', 'region', Object.keys(REGIONS).map(function (k) { return [k, REGIONS[k]]; }));
  chips('[data-filter="style"]', 'style', Object.keys(STYLES).map(function (k) { return [k, STYLES[k].label]; }));
  chips('[data-filter="demand"]', 'demand', Object.keys(DEMAND).map(function (k) { return [k, DEMAND[k].label]; }));
  if (!LENSES.length) { var dr = $('[data-filter="desk"]'); if (dr) dr.hidden = true; }
  $('#m2m-q').addEventListener('input', function (ev) { F.q = ev.target.value.trim().toLowerCase(); applyFilters(); });

  draw();
  var params = new URLSearchParams(location.search);
  if (params.get('desk') && lensBySlug[params.get('desk')]) setFilter('desk', params.get('desk')); else applyFilters();
  if (params.get('company') && byId[params.get('company')]) select(params.get('company'));
  route();
  requestAnimationFrame(fit);
})();
