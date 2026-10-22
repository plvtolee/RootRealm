/* RootRealm landing page — interactions.
   Content is fully readable without this file; it only adds behaviour. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- Auth CTAs ---------------- */
  var cfg = window.ROOTREALM_CONFIG || { authUrl: '/login' };
  var toast = $('#toast');
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 4200);
  }
  $$('[data-auth]').forEach(function (a) {
    if (cfg.authUrl) {
      a.setAttribute('href', cfg.authUrl);
    } else {
      a.setAttribute('href', '#get-started');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        showToast('GitHub sign-in is not connected in this build yet.');
      });
    }
  });

  /* ---------------- Navigation ---------------- */
  var nav = $('.nav');
  var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var toggle = $('.nav__toggle');
  var menu = $('#mobile-menu');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  }
  toggle.addEventListener('click', function () { setMenu(menu.hidden); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); }
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 860 && !menu.hidden) setMenu(false); });

  // Active section highlight
  var links = $$('.nav__links a');
  if ('IntersectionObserver' in window) {
    var secObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) { l.classList.toggle('is-active', l.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['product', 'progression', 'features'].forEach(function (id) { var el = document.getElementById(id); if (el) secObs.observe(el); });
  }

  /* ---------------- Scroll reveals ---------------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revObs.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { revObs.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------------- Activity → Evidence → Progression ---------------- */
  var EVENTS = {
    pr: {
      record: [
        ['source', '"github"'], ['type', '"pull_request.merged"'], ['repo', '"you/project"'],
        ['ref', '"#482"'], ['signals', '{ files: 9, reviewed: true }'], ['rule_set', '"v1"']
      ],
      xp: 120, rule: 'pr.merged', attrs: [['Builder', '+80'], ['Collaborator', '+40']]
    },
    commit: {
      record: [
        ['source', '"github"'], ['type', '"push.commits"'], ['repo', '"you/project"'],
        ['ref', '"main@3f9c2a1"'], ['signals', '{ commits: 4 }'], ['rule_set', '"v1"']
      ],
      xp: 40, rule: 'push.commits', attrs: [['Builder', '+40']]
    },
    review: {
      record: [
        ['source', '"github"'], ['type', '"review.submitted"'], ['repo', '"team/api"'],
        ['ref', '"#97"'], ['signals', '{ state: "changes_requested", comments: 6 }'], ['rule_set', '"v1"']
      ],
      xp: 45, rule: 'review.submitted', attrs: [['Collaborator', '+30'], ['Scholar', '+15']]
    },
    issue: {
      record: [
        ['source', '"github"'], ['type', '"issue.closed"'], ['repo', '"you/project"'],
        ['ref', '"#311"'], ['signals', '{ label: "bug", linked_pr: true }'], ['rule_set', '"v1"']
      ],
      xp: 30, rule: 'issue.closed', attrs: [['Debugger', '+20'], ['Maintainer', '+10']]
    }
  };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtVal(v) {
    if (v.charAt(0) === '"') return '<span class="s">' + esc(v) + '</span>';
    return '<span class="n">' + esc(v) + '</span>';
  }
  var flow = $('#flow');
  var rec = $('#flow-record');
  var recWrap = rec.parentNode;
  function renderEvent(key, animate) {
    var ev = EVENTS[key];
    var html = '{\n' + ev.record.map(function (p, i) {
      return '  <span class="k">' + p[0] + '</span>: ' + fmtVal(p[1]) + (i < ev.record.length - 1 ? ',' : '');
    }).join('\n') + '\n}';
    var apply = function () {
      rec.innerHTML = html;
      $('#flow-xp').textContent = '+' + ev.xp;
      $('#flow-rule').textContent = ev.rule;
      $('#flow-attrs').innerHTML = ev.attrs.map(function (a) {
        return '<li><span>' + a[0] + '</span><span>' + a[1] + ' XP</span></li>';
      }).join('');
      recWrap.classList.remove('is-swap');
    };
    if (animate && !reduceMotion.matches) {
      recWrap.classList.add('is-swap');
      flow.classList.remove('is-pulse'); void flow.offsetWidth; flow.classList.add('is-pulse');
      setTimeout(apply, 160);
    } else { apply(); }
  }
  var evBtns = $$('.flow__events button');
  function selectEvent(btn, focus) {
    evBtns.forEach(function (b) { var on = b === btn; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    renderEvent(btn.dataset.event, true);
  }
  evBtns.forEach(function (b, i) {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener('click', function () { selectEvent(b); });
    b.addEventListener('keydown', function (e) { rovingKeys(e, evBtns, i, selectEvent); });
  });
  renderEvent('pr', false);

  function rovingKeys(e, list, i, fn) {
    var n = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % list.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    if (n !== null) { e.preventDefault(); fn(list[n], true); }
  }

  /* ---------------- Skill tree ---------------- */
  // Structure shared by every attribute: root → 2 branches → 4 specialisations → capstone
  // (capstone requires one specialisation from each branch). Illustrative content.
  var POS_H = {
    r:  [64, 170],
    a:  [222, 92],  b:  [222, 248],
    a1: [384, 50],  a2: [384, 134], b1: [384, 206], b2: [384, 290],
    c:  [566, 170]
  };
  // Vertical layout for narrow screens (root at bottom, capstone at top)
  var POS_V = {
    r:  [170, 540],
    a:  [90, 420],  b:  [250, 420],
    a1: [40, 290],  a2: [130, 290], b1: [210, 290], b2: [300, 290],
    c:  [170, 150]
  };
  var narrowMQ = window.matchMedia('(max-width: 640px)');
  var POS = narrowMQ.matches ? POS_V : POS_H;
  var EDGES = [['r', 'a'], ['r', 'b'], ['a', 'a1'], ['a', 'a2'], ['b', 'b1'], ['b', 'b2'], ['a2', 'c'], ['b1', 'c']];
  var PARENTS = { r: [], a: ['r'], b: ['r'], a1: ['a'], a2: ['a'], b1: ['b'], b2: ['b'], c: ['a2', 'b1'] };

  var TREES = {
    builder: { on: ['r', 'a', 'a2', 'b'], n: {
      r: ['First Commit', 'Push a tracked commit to a connected repository.'],
      a: ['Shipping', 'Merge pull requests you authored.'],
      b: ['Iteration', 'Push follow-up commits to open pull requests.'],
      a1: ['Feature Work', 'Merge pull requests that add new files or modules.'],
      a2: ['Steady Output', 'Merge work across several separate weeks.'],
      b1: ['Refactor', 'Merge changes that remove more lines than they add.'],
      b2: ['Prototyper', 'Open draft pull requests that later merge.'],
      c: ['Master Builder', 'Capstone. Requires Steady Output and Refactor.']
    }},
    debugger: { on: ['r', 'b', 'b1'], n: {
      r: ['First Fix', 'Close an issue labelled as a bug.'],
      a: ['Reproduction', 'Close bug issues linked to a pull request.'],
      b: ['Root Cause', 'Merge fixes referencing the issue they resolve.'],
      a1: ['Regression Guard', 'Merge fixes that include test changes.'],
      a2: ['Triage', 'Label and close issues in maintained repositories.'],
      b1: ['Hotfix', 'Merge fixes to a default branch shortly after report.'],
      b2: ['Trace', 'Comment with investigation on open bug issues.'],
      c: ['Exterminator', 'Capstone. Requires Triage and Hotfix.']
    }},
    scholar: { on: ['r', 'a'], n: {
      r: ['Reader', 'Leave a review comment on a pull request.'],
      a: ['Documentation', 'Merge changes to documentation files.'],
      b: ['Explainer', 'Answer questions in issue discussions.'],
      a1: ['Guides', 'Merge new documentation pages.'],
      a2: ['Clarity', 'Improve READMEs across repositories.'],
      b1: ['Mentor', 'Review pull requests from first-time contributors.'],
      b2: ['Research', 'Open design or proposal issues.'],
      c: ['Archivist', 'Capstone. Requires Clarity and Mentor.']
    }},
    collaborator: { on: ['r', 'a', 'a1', 'a2', 'b'], n: {
      r: ['First Review', 'Submit a pull request review.'],
      a: ['Reviewer', 'Submit reviews across multiple pull requests.'],
      b: ['Co-author', 'Land commits with co-authors.'],
      a1: ['Thorough', 'Submit reviews with inline comments.'],
      a2: ['Unblocker', 'Approve pull requests that then merge.'],
      b1: ['Pairing', 'Contribute to pull requests opened by others.'],
      b2: ['Cross-team', 'Contribute to repositories outside your own.'],
      c: ['Guild Anchor', 'Capstone. Requires Unblocker and Pairing.']
    }},
    maintainer: { on: ['r'], n: {
      r: ['Caretaker', 'Merge a pull request into a repository you maintain.'],
      a: ['Releases', 'Publish tagged releases.'],
      b: ['Backlog', 'Close stale or resolved issues.'],
      a1: ['Changelog', 'Publish releases with notes.'],
      a2: ['Dependency Care', 'Merge dependency update pull requests.'],
      b1: ['Gatekeeper', 'Review and merge external contributions.'],
      b2: ['Labeller', 'Maintain issue labels and milestones.'],
      c: ['Steward', 'Capstone. Requires Dependency Care and Gatekeeper.']
    }},
    architect: { on: [], n: {
      r: ['Blueprint', 'Open a design or RFC issue.'],
      a: ['Structure', 'Merge changes that introduce new modules.'],
      b: ['Interfaces', 'Merge changes to shared APIs or schemas.'],
      a1: ['Boundaries', 'Split large modules into smaller ones.'],
      a2: ['Systems', 'Merge work spanning multiple top-level directories.'],
      b1: ['Contracts', 'Merge versioned API or schema changes.'],
      b2: ['Migration', 'Land multi-step migrations across pull requests.'],
      c: ['Realm Architect', 'Capstone. Requires Systems and Contracts.']
    }}
  };

  var SVGNS = 'http://www.w3.org/2000/svg';
  var svg = $('#tree-svg');
  function el(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function stateOf(id, on) {
    if (on.indexOf(id) > -1) return 'on';
    var p = PARENTS[id];
    if (p.every(function (x) { return on.indexOf(x) > -1; })) return 'av';
    return 'off';
  }
  var currentAttr = 'builder';
  var selected = 'r';

  function drawTree(attr) {
    var t = TREES[attr];
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var vert = POS === POS_V;
    svg.setAttribute('viewBox', vert ? '0 90 340 490' : '0 0 640 340');
    // Tier guides
    ['TIER 0', 'TIER 1', 'TIER 2', 'CAPSTONE'].forEach(function (lbl, i) {
      var tx;
      if (vert) {
        var y = [540, 420, 290, 150][i];
        svg.appendChild(el('line', { x1: 0, y1: y, x2: 340, y2: y, 'class': 't-tierline' }));
        tx = el('text', { x: 0, y: y - 30, 'class': 't-tier' });
      } else {
        var x = [64, 222, 384, 566][i];
        svg.appendChild(el('line', { x1: x, y1: 18, x2: x, y2: 326, 'class': 't-tierline' }));
        tx = el('text', { x: x, y: 10, 'text-anchor': 'middle', 'class': 't-tier' });
      }
      tx.textContent = lbl; svg.appendChild(tx);
    });

    EDGES.forEach(function (e) {
      var p = POS[e[0]], q = POS[e[1]], d;
      if (vert) {
        var my = (p[1] + q[1]) / 2;
        d = 'M' + p[0] + ' ' + (p[1] - 11) + ' V' + my + ' H' + q[0] + ' V' + (q[1] + (e[1] === 'c' ? 44 : 46));
      } else {
        var mx = (p[0] + q[0]) / 2;
        d = 'M' + (p[0] + 11) + ' ' + p[1] + ' H' + mx + ' V' + q[1] + ' H' + (q[0] - 11);
      }
      var s1 = stateOf(e[0], t.on), s2 = stateOf(e[1], t.on);
      var cls = 't-edge' + (s1 === 'on' && s2 === 'on' ? ' on' : (s1 === 'on' && s2 === 'av' ? ' av' : ''));
      svg.appendChild(el('path', { d: d, 'class': cls }));
    });

    Object.keys(POS).forEach(function (id) {
      var p = POS[id], st = stateOf(id, t.on), cap = id === 'c';
      var name = t.n[id][0];
      var g = el('g', {
        'class': 't-node ' + st + (cap ? ' cap' : '') + (id === selected ? ' sel' : ''),
        tabindex: '0', role: 'button', 'data-id': id,
        'aria-label': name + ', ' + ({ on: 'unlocked', av: 'available', off: 'locked' })[st],
        'aria-pressed': String(id === selected)
      });
      g.appendChild(el('rect', { x: p[0] - 34, y: p[1] - 20, width: 68, height: 56, 'class': 'hit' }));
      var size = cap ? 22 : 18;
      var sq = el('rect', { x: p[0] - size / 2, y: p[1] - size / 2, width: size, height: size, 'class': 'sq' });
      if (cap) sq.setAttribute('transform', 'rotate(45 ' + p[0] + ' ' + p[1] + ')');
      g.appendChild(sq);
      var r = size / 2 + 6;
      var ring = el('rect', { x: p[0] - r, y: p[1] - r, width: r * 2, height: r * 2, 'class': 'ring' });
      if (cap) ring.setAttribute('transform', 'rotate(45 ' + p[0] + ' ' + p[1] + ')');
      g.appendChild(ring);
      var tx = el('text', { x: p[0], y: p[1] + (cap ? 34 : 28), 'text-anchor': 'middle' });
      var words = name.split(' ');
      if (vert && words.length > 1 && !cap) {
        words.forEach(function (w, wi) {
          var ts = el('tspan', { x: p[0], dy: wi ? '1.2em' : '0' });
          ts.textContent = w; tx.appendChild(ts);
        });
      } else { tx.textContent = name; }
      g.appendChild(tx);
      g.addEventListener('click', function () { selectNode(id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(id); }
      });
      svg.appendChild(g);
    });
    showDetail(attr, selected);
  }

  function showDetail(attr, id) {
    var t = TREES[attr], st = stateOf(id, t.on);
    var stEl = $('#node-state');
    stEl.textContent = ({ on: 'Unlocked', av: 'Available', off: 'Locked' })[st];
    stEl.classList.toggle('is-on', st === 'on');
    $('#node-name').textContent = t.n[id][0];
    $('#node-desc').textContent = t.n[id][1];
    var req = PARENTS[id].map(function (x) { return t.n[x][0]; });
    $('#node-req').textContent = 'Requires ' + (req.length ? req.join(' + ') : '—');
  }

  function selectNode(id) {
    selected = id;
    $$('.t-node', svg).forEach(function (g) {
      var on = g.getAttribute('data-id') === id;
      g.classList.toggle('sel', on);
      g.setAttribute('aria-pressed', String(on));
    });
    showDetail(currentAttr, id);
  }

  var tabs = $$('.attr-tabs button');
  function selectAttr(btn, focus) {
    tabs.forEach(function (b) { var on = b === btn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    var attr = btn.dataset.attr;
    if (attr === currentAttr) return;
    currentAttr = attr;
    selected = TREES[attr].on.length ? TREES[attr].on[TREES[attr].on.length - 1] : 'r';
    $('#tree-attr').textContent = attr;
    if (reduceMotion.matches) { drawTree(attr); return; }
    svg.classList.add('is-swap');
    setTimeout(function () { drawTree(attr); requestAnimationFrame(function () { svg.classList.remove('is-swap'); }); }, 180);
  }
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { selectAttr(b); });
    b.addEventListener('keydown', function (e) { rovingKeys(e, tabs, i, selectAttr); });
  });
  drawTree('builder');
  var onMQ = function () { POS = narrowMQ.matches ? POS_V : POS_H; drawTree(currentAttr); };
  if (narrowMQ.addEventListener) narrowMQ.addEventListener('change', onMQ); else narrowMQ.addListener(onMQ);

  /* ---------------- Avatar frames ---------------- */
  var frameBtns = $$('.frames__list button');
  var NAMES = { plain: 'Plain', bracket: 'Bracket', notch: 'Notch', circuit: 'Circuit' };
  function selectFrame(btn, focus) {
    var f = btn.dataset.frame;
    frameBtns.forEach(function (b) { var on = b === btn; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    ['#cos-avatar', '#hero-avatar'].forEach(function (sel) {
      var use = $(sel + ' .avatar__frame use');
      use.setAttribute('href', '#frame-' + f);
    });
    $('#frame-name').textContent = 'Frame · ' + NAMES[f];
  }
  frameBtns.forEach(function (b, i) {
    b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
    b.addEventListener('click', function () { selectFrame(b); });
    b.addEventListener('keydown', function (e) { rovingKeys(e, frameBtns, i, selectFrame); });
  });
})();
