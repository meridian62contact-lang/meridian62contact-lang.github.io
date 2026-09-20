/* Meridian62 — site behaviour (navigation, reveal-on-scroll, schedule, glossary search) */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* header background once scrolled */
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 24); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* mobile menu */
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    });
  }

  /* reveal on scroll */
  var targets = document.querySelectorAll('[data-reveal],[data-reveal-stagger]');
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(function (t) { t.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* schedule: mark the current and next release week */
  var M = window.M62 || {};
  function mondayOf(d) { var x = new Date(d); var day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  if (M.schedule && M.schedule.weeks) {
    var thisMon = iso(mondayOf(new Date()));
    var weeks = M.schedule.weeks.map(function (w) { return String(w.date).slice(0, 10); });
    var current = null, next = null;
    for (var i = 0; i < weeks.length; i++) {
      if (weeks[i] === thisMon) current = weeks[i];
      if (weeks[i] > thisMon && !next) next = weeks[i];
    }
    document.querySelectorAll('[data-week]').forEach(function (el) {
      var d = el.getAttribute('data-week');
      if (d === current) { el.classList.add('is-current'); var l = el.querySelector('[data-week-label]'); if (l) { l.textContent = 'This week'; l.classList.remove('hidden'); } }
      else if (d === next && !current) { el.classList.add('is-current'); var l2 = el.querySelector('[data-week-label]'); if (l2) { l2.textContent = 'Next release'; l2.classList.remove('hidden'); } }
      else if (d === next) { var l3 = el.querySelector('[data-week-label]'); if (l3) { l3.textContent = 'Next week'; l3.classList.remove('hidden'); } }
    });
    /* home strip: show current (or next) + the two following weeks */
    var strip = document.querySelector('[data-week-strip]');
    if (strip) {
      var start = current || next; var idx = weeks.indexOf(start);
      if (idx < 0) idx = 0;
      strip.querySelectorAll('[data-week]').forEach(function (el, k) { el.classList.toggle('hidden', k < idx || k > idx + 2); });
      strip.classList.add('is-ready');
    }
  }

  /* glossary search */
  var search = document.querySelector('[data-glossary-search]');
  if (search) {
    var terms = document.querySelectorAll('.term');
    var letters = document.querySelectorAll('.glossary-letter');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      terms.forEach(function (t) { t.classList.toggle('hidden', q !== '' && t.textContent.toLowerCase().indexOf(q) === -1); });
      letters.forEach(function (h) {
        var any = false, n = h.nextElementSibling;
        while (n && !n.classList.contains('glossary-letter')) { if (!n.classList.contains('hidden')) any = true; n = n.nextElementSibling; }
        h.classList.toggle('hidden', !any);
      });
    });
  }
})();
