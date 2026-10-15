/* ---------- Scorebook UI ---------- */
(function () {
  var KEY = 'vbScorebook.v1';
  var db = { games: {} };
  var ui = { view: 'home', gameId: null, modal: null, edit: false };
  var lastTap = 0;

  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw) || db; } catch (e) { }
    if (!db.games) db.games = {};
  }
  function save() {
    var g = game(); if (g) g.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Could not autosave on this device. Use Backup file from the saved games list.'); }
  }
  function game() { return ui.gameId ? db.games[ui.gameId] : null; }
  function curSetIdx(g) { return g.sets.length - 1; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tn(g, t) { return SB.teamName(g, t); }
  var O = SB.other;

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- wake lock ---------- */
  var wl = null;
  function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wl) navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () { });
      if (!on && wl) { wl.release(); wl = null; }
    } catch (e) { }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ui.view === 'live') keepAwake(true); });

  /* ---------- court tiles (side view from scorer's table) ---------- */
  // left team: net on its right. rows top->bottom = far sideline -> table side
  var LEFT_LAYOUT = [[4, 3], [5, 2], [0, 1]];   // [back, front] position indexes (0 = pos 1)
  var RIGHT_LAYOUT = [[1, 0], [2, 5], [3, 4]];  // [front, back]
  function courtTiles(g, R, t, side, opts) {
    opts = opts || {};
    var layout = side === 'left' ? LEFT_LAYOUT : RIGHT_LAYOUT;
    var h = '<div class="court team-' + t + ' ' + side + (opts.big ? ' big' : '') + '">';
    layout.forEach(function (row) {
      row.forEach(function (p) {
        var c = SB.onCourt(R, t, p);
        var serving = R.serving === t && p === 0 && !R.done;
        var cls = 'tile' + (serving ? ' serving' : '') + (c.libero ? ' lib' : '');
        var sel = opts.select && opts.select.indexOf(p) >= 0;
        if (opts.picked === c.num && !c.libero) cls += ' picked';
        var tag = sel ? 'button' : 'div';
        var attrs = sel ? ' data-act="' + opts.act + '" data-pos="' + p + '" data-num="' + esc(c.num) + '"' : '';
        if (opts.select && !sel) cls += ' dim';
        h += '<' + tag + ' class="' + cls + '"' + attrs + '><span class="num">' + esc(c.num || '–') + (c.libero ? '<small>L</small>' : '') + '</span>' +
          '<span class="pos">' + (serving ? 'serving' : 'pos ' + (p + 1)) + '</span></' + tag + '>';
      });
    });
    return h + '</div>';
  }

  /* ---------- views ---------- */
  function vHome() {
    var list = Object.keys(db.games).map(function (k) { return db.games[k]; }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    var h = '<div class="page"><header class="pagehead"><div><h1>Scorebook</h1><p class="sub">Official volleyball game book. Runs offline and saves games on this device.</p></div>' +
      '<button class="btn primary big" data-act="new">New game</button></header>';
    h += '<section><h2>Saved games</h2>';
    if (!list.length) {
      h += '<div class="empty"><p><strong>No games yet.</strong> Start a new game and it will appear here. Every tap saves automatically, so you can close the page and pick up where you left off.</p></div>';
    } else {
      h += '<ul class="games">';
      list.forEach(function (g) {
        var parts = [];
        for (var i = 0; i < g.settings.setsTotal; i++) { var r = SB.setResult(g, i); if (r) parts.push(r.a + '–' + r.b); }
        var status = g.status === 'done' ? '<span class="chip chip-ok">Final</span>' : '<span class="chip chip-live">In progress</span>';
        h += '<li class="gamerow"><div class="ginfo"><div class="gtitle">' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + ' ' + status + '</div>' +
          '<div class="gmeta">' + esc([SB.fmtDate(g.info.date), g.info.level, g.info.site].filter(Boolean).join(' · ')) + (parts.length ? ' · Sets ' + parts.join(', ') : '') + '</div></div>' +
          '<div class="gact"><button class="btn" data-act="open" data-id="' + g.id + '">Open</button>' +
          '<button class="btn" data-act="pdf" data-id="' + g.id + '">Save PDF</button>' +
          '<button class="btn" data-act="print" data-id="' + g.id + '">Print</button>' +
          '<button class="btn" data-act="backup" data-id="' + g.id + '">Backup file</button>' +
          '<button class="btn danger" data-act="askdel" data-id="' + g.id + '">Delete</button></div></li>';
      });
      h += '</ul>';
    }
    h += '</section><section class="restore"><h2>Restore a backup</h2><p class="sub">Backup files let you move a game to another device or keep a copy if this browser\'s data gets cleared.</p>' +
      '<label class="btn file">Choose backup file<input type="file" id="importFile" accept=".json,application/json"></label></section>';
    h += '<section class="restore"><h2>Blank scoresheet</h2><p class="sub">A printable 3-page sheet with nothing filled in, for a paper backup.</p><button class="btn" data-act="blankpdf">Save blank PDF</button></section></div>';
    return h;
  }

  function vSetup() {
    var g = ui.edit ? game() : (ui.draft || SB.newGame());
    ui.draft = ui.edit ? null : g;
    var I = g.info, S = g.settings;
    function f(id, label, val, type, ph) { return '<label class="field"><span>' + label + '</span><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"></label>'; }
    var h = '<div class="page narrow"><header class="pagehead"><div><h1>' + (ui.edit ? 'Game info' : 'New game') + '</h1><p class="sub">Team names and officials print at the top of every page.</p></div></header>';
    h += '<form id="setupForm" class="card form">';
    h += '<div class="grid2">' + f('f-home', 'Home team', I.home, 'text', 'Cranbrook') + f('f-away', 'Away team', I.away, 'text', 'Visiting school') + '</div>';
    h += '<div class="grid3">' + f('f-date', 'Date', I.date, 'date') + f('f-level', 'Level', I.level, 'text', '7th grade') + f('f-site', 'Site', I.site, 'text', 'Gym') + '</div>';
    h += '<div class="grid2">' + f('f-scorer', 'Scorer', I.scorer, 'text', 'Your name') + f('f-ref', 'Referee', I.referee, 'text', '') + '</div>';
    h += '<h3>Rules</h3><div class="grid3">' +
      f('f-p1', 'Set 1 to', S.points[0], 'number') + f('f-p2', 'Set 2 to', S.points[1], 'number') + f('f-p3', 'Set 3 to', S.points[2], 'number') + '</div>';
    h += '<div class="grid3">' + f('f-winby', 'Win by', S.winBy, 'number') + f('f-to', 'Timeouts per set', S.timeouts, 'number') + f('f-subs', 'Subs per set', S.subLimit, 'number') + '</div>';
    h += '<label class="check"><input type="checkbox" id="f-lib"' + (S.libero ? ' checked' : '') + '> Use a libero this game</label>';
    h += '<p class="hint">All three sets are played. Rally scoring, no point cap.</p>';
    h += '<div class="actions"><button type="button" class="btn" data-act="' + (ui.edit ? 'back-live' : 'home') + '">Cancel</button><button type="submit" class="btn primary">' + (ui.edit ? 'Save' : 'Enter set 1 lineups') + '</button></div>';
    h += '</form></div>';
    return h;
  }

  function vLineup() {
    var g = game(), si = curSetIdx(g), set = g.sets[si];
    var h = '<div class="page narrow"><header class="pagehead"><div><h1>Set ' + (si + 1) + ' lineups</h1><p class="sub">Enter jersey numbers in serve order. Spot I serves first. Set to ' + g.settings.points[si] + '.</p></div><button class="btn" data-act="menu">Menu</button></header>';
    h += '<form id="lineupForm" class="card form"><div class="lineups">';
    ['A', 'B'].forEach(function (t) {
      h += '<fieldset class="lineup team-' + t + '"><legend>' + esc(tn(g, t)) + '</legend><div class="slots">';
      for (var k = 0; k < 6; k++) {
        h += '<label class="slot"><span>' + SB.ROMAN[k] + '</span><input id="ln-' + t + '-' + k + '" inputmode="numeric" maxlength="3" value="' + esc(set.lineup[t][k]) + '"></label>';
      }
      h += '</div>';
      if (g.settings.libero) h += '<label class="slot lib"><span>Libero</span><input id="lib-' + t + '" inputmode="numeric" maxlength="3" value="' + esc(set.libero[t]) + '" placeholder="none"></label>';
      h += '</fieldset>';
    });
    h += '</div>';
    h += '<div class="seg-row"><span>Serves first</span><div class="seg">' +
      ['A', 'B'].map(function (t) { return '<button type="button" class="' + (set.firstServe === t ? 'on' : '') + '" data-act="firstserve" data-team="' + t + '">' + esc(tn(g, t)) + '</button>'; }).join('') + '</div></div>';
    h += '<div class="seg-row"><span>On the left, seen from the table</span><div class="seg">' +
      ['A', 'B'].map(function (t) { return '<button type="button" class="' + (set.left === t ? 'on' : '') + '" data-act="leftside" data-team="' + t + '">' + esc(tn(g, t)) + '</button>'; }).join('') + '</div></div>';
    h += '<p class="err" id="lineupErr" hidden></p>';
    h += '<div class="actions">' + (si > 0 ? '<button type="button" class="btn" data-act="back-prevset">Back to set ' + si + '</button>' : '<button type="button" class="btn" data-act="home">Saved games</button>') +
      '<button type="submit" class="btn primary">Check lineups</button></div></form></div>';
    return h;
  }

  function lastAction(g, si, R) {
    var ev = g.sets[si].events[g.sets[si].events.length - 1];
    if (!ev) return 'Set ' + (si + 1) + ' started. ' + tn(g, g.sets[si].firstServe) + ' serves first.';
    var who = tn(g, ev.team);
    switch (ev.t) {
      case 'pt': return 'Last: point ' + who + ' (' + R.score.A + '–' + R.score.B + ')';
      case 'to': return 'Last: timeout ' + who;
      case 'sub': return 'Last: ' + who + ' sub, #' + ev.inn + ' in for #' + ev.out + (ev.injury ? ' (injury)' : '');
      case 'rot': return 'Last: rotation corrected for ' + who;
      case 'lib': return 'Last: libero ' + ev.action + ' for ' + who;
    }
    return '';
  }

  function teamPanel(g, R, t, side) {
    var tm = R.T[t], S = g.settings, serving = R.serving === t && !R.done;
    var h = '<section class="team team-' + t + ' ' + side + (serving ? ' is-serving' : '') + '">';
    h += '<div class="thead"><span class="tname">' + esc(tn(g, t)) + '</span><span class="sbadge">' + (serving ? 'Serving' : 'Receiving') + '</span></div>';
    h += '<div class="score" aria-live="polite">' + R.score[t] + '</div>';
    h += courtTiles(g, R, t, side);
    h += '<button class="point" data-act="point" data-team="' + t + '"' + (R.done ? ' disabled' : '') + '>Point ' + esc(tn(g, t)) + '</button>';
    h += '<div class="minor">';
    h += '<button class="btn" data-act="to" data-team="' + t + '">Timeout <b>' + tm.timeouts.length + '/' + S.timeouts + '</b></button>';
    h += '<button class="btn" data-act="sub" data-team="' + t + '">Sub <b>' + tm.subCount + '/' + S.subLimit + '</b></button>';
    if (S.libero && tm.lib.num) h += '<button class="btn" data-act="libero" data-team="' + t + '">Libero ' + (tm.lib.slot !== null ? 'out' : 'in') + '</button>';
    h += '</div></section>';
    return h;
  }

  function vLive() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], R = SB.replay(g, si);
    var L = set.left, Rt = O(L);
    var chips = '';
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var r = SB.setResult(g, i);
      chips += '<span class="setchip' + (i === si ? ' cur' : '') + '">S' + (i + 1) + ' ' + (r ? r.a + '–' + r.b : '—') + '</span>';
    }
    var h = '<div class="live">';
    h += '<header class="livebar"><div class="lb-left"><strong>Set ' + (si + 1) + ' of ' + g.settings.setsTotal + '</strong><span class="to-target">to ' + R.target + '</span></div><div class="chips">' + chips + '</div><button class="btn" data-act="menu">Menu</button></header>';
    h += '<main class="floor">' + teamPanel(g, R, L, 'left') + '<div class="net" aria-hidden="true"></div>' + teamPanel(g, R, Rt, 'right');
    if (R.done) {
      var last = si === g.settings.setsTotal - 1;
      h += '<div class="setover"><div class="card"><h2>Set ' + (si + 1) + ' goes to ' + esc(tn(g, R.winner)) + '</h2><p class="bigscore">' + R.score[R.winner] + '–' + R.score[O(R.winner)] + '</p>' +
        '<div class="actions"><button class="btn" data-act="undo">Undo last point</button><button class="btn primary" data-act="' + (last ? 'finish' : 'nextset') + '">' + (last ? 'Finish game' : 'Set ' + (si + 2) + ' lineups') + '</button></div></div></div>';
    }
    h += '</main>';
    h += '<footer class="livefoot"><span class="lastact">' + esc(lastAction(g, si, R)) + '</span><div class="fixes">' +
      '<button class="btn" data-act="check">Lineup check</button>' +
      '<button class="btn" data-act="flip">Flip last point</button>' +
      '<button class="btn strong" data-act="undo">Undo</button></div></footer>';
    h += '</div>';
    return h;
  }

  function vSummary() {
    var g = game();
    var ml = SB.matchLine(g);
    var h = '<div class="page narrow"><header class="pagehead"><div><h1>' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + '</h1><p class="sub">' + esc([SB.fmtDate(g.info.date), g.info.level, g.info.site].filter(Boolean).join(' · ')) + '</p></div></header>';
    h += '<div class="card"><table class="results"><thead><tr><th></th>';
    for (var i = 0; i < g.settings.setsTotal; i++) h += '<th>Set ' + (i + 1) + '</th>';
    h += '<th>Sets won</th></tr></thead><tbody>';
    ['A', 'B'].forEach(function (t) {
      h += '<tr><th>' + esc(tn(g, t)) + '</th>';
      for (var i = 0; i < g.settings.setsTotal; i++) {
        var r = SB.setResult(g, i);
        var v = r ? (t === 'A' ? r.a : r.b) : '—';
        var won = r && r.done && r.winner === t;
        h += '<td class="' + (won ? 'won' : '') + '">' + v + '</td>';
      }
      h += '<td><b>' + ml.wins[t] + '</b></td></tr>';
    });
    h += '</tbody></table><div class="actions"><button class="btn" data-act="reopen">Back to scoring</button><button class="btn" data-act="print">Print</button><button class="btn primary" data-act="pdf">Save PDF</button></div></div>';
    h += '<p class="hint">This game is saved on this device. Find it later under Saved games.</p><div class="actions left"><button class="btn" data-act="home">Saved games</button></div></div>';
    return h;
  }

  /* ---------- modals ---------- */
  function mWrap(inner, cls) { return '<div class="scrim" data-act="scrim"><div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + inner + '</div></div>'; }

  function mSub() {
    var g = game(), si = curSetIdx(g), R = SB.replay(g, si), m = ui.modal, t = m.team;
    var side = g.sets[si].left === t ? 'left' : 'right';
    var tm = R.T[t];
    var h = '<h2>Substitution · ' + esc(tn(g, t)) + '</h2><p class="sub">Subs used ' + tm.subCount + ' of ' + g.settings.subLimit + ' · score ' + R.score[t] + '–' + R.score[O(t)] + '</p>';
    h += '<div class="subgrid"><div><div class="lbl">Player out (tap)</div>' + courtTiles(g, R, t, side, { select: [0, 1, 2, 3, 4, 5], act: 'subout', picked: m.out }) + '</div>';
    h += '<div><label class="field"><span>Player in</span><input id="subIn" inputmode="numeric" maxlength="3" value="' + esc(m.inn || '') + '" autocomplete="off"></label>';
    h += '<label class="check' + (m.needsInjury ? ' flag' : '') + '"><input type="checkbox" id="subInj"' + (m.injury ? ' checked' : '') + '> Injury sub (exceptional)</label>';
    h += '<p class="hint">Use for an injured or ill player when no legal sub is available. The injured player can\'t come back this set. Counts toward the ' + g.settings.subLimit + ' unless they\'re used up.</p></div></div>';
    h += '<p class="err" id="subErr"' + (m.error ? '' : ' hidden') + '>' + esc(m.error || '') + '</p>';
    h += '<div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="dosub">Make sub</button></div>';
    return mWrap(h);
  }

  function mLibero() {
    var g = game(), si = curSetIdx(g), R = SB.replay(g, si), t = ui.modal.team, tm = R.T[t];
    var side = g.sets[si].left === t ? 'left' : 'right';
    var h = '<h2>Libero #' + esc(tm.lib.num) + ' · ' + esc(tn(g, t)) + '</h2>';
    if (tm.lib.slot === null) {
      h += '<p class="sub">Tap the back-row player the libero replaces. Libero swaps don\'t count as subs.</p>' + courtTiles(g, R, t, side, { select: [0, 4, 5], act: 'libin' });
    } else {
      h += '<p class="sub">#' + esc(tm.slots[tm.lib.slot].current) + ' comes back on for the libero. The app also does this automatically when the libero rotates to the front row.</p>' +
        '<div class="actions left"><button class="btn primary" data-act="libout">Libero out</button></div>';
    }
    h += '<div class="actions"><button class="btn" data-act="close">Close</button></div>';
    return mWrap(h);
  }

  function mCheck() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], R = SB.replay(g, si), pre = ui.modal.pre;
    var L = set.left, Rt = O(L);
    function orderList(t) {
      return R.T[t].slots.map(function (s, i) { return SB.ROMAN[i] + ' #' + esc(s.current); }).join(' · ');
    }
    function teamCol(t, side) {
      return '<div class="ccol"><div class="chead team-' + t + '"><strong>' + esc(tn(g, t)) + '</strong> <span>' + (R.serving === t ? 'serving' : 'receiving') + '</span></div>' +
        courtTiles(g, R, t, side, { big: true }) +
        '<div class="corder">Serve order: ' + orderList(t) + '</div>' +
        '<div class="rotfix"><span>Fix rotation</span><button class="btn small" data-act="rot" data-team="' + t + '" data-dir="-1" aria-label="Rotate back one">↺ Back one</button><button class="btn small" data-act="rot" data-team="' + t + '" data-dir="1" aria-label="Rotate forward one">↻ Forward one</button></div></div>';
    }
    var h = '<div class="checkhead"><h2>Lineup check' + (pre ? ' · Set ' + (si + 1) : ' · ' + R.score.A + '–' + R.score.B) + '</h2><button class="btn" data-act="swap">⇄ Swap sides</button></div>';
    h += '<div class="farline">far sideline</div>';
    h += '<div class="checkcourt">' + teamCol(L, 'left') + '<div class="net tall" aria-hidden="true"><span>net</span></div>' + teamCol(Rt, 'right') + '</div>';
    h += '<div class="tableline">Scorer\'s table · near sideline</div>';
    if (pre) h += '<p class="hint center">Compare with the floor and the lineup cards. Fix numbers on the lineup screen if anything is off.</p>';
    h += '<div class="actions">' + (pre ? '<button class="btn" data-act="close">Edit lineups</button><button class="btn primary" data-act="startset">Start set ' + (si + 1) + '</button>' : '<button class="btn primary" data-act="close">Done</button>') + '</div>';
    return mWrap(h, 'wide');
  }

  function mMenu() {
    var g = game();
    var h = '<h2>Menu</h2><div class="menulist">' +
      '<button class="btn" data-act="pdf">Save PDF</button>' +
      '<button class="btn" data-act="print">Print</button>' +
      '<button class="btn" data-act="editinfo">Game info and rules</button>' +
      '<button class="btn" data-act="home">Saved games</button></div>' +
      '<p class="hint">' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + ' is saved after every tap.</p>' +
      '<div class="actions"><button class="btn primary" data-act="close">Back</button></div>';
    return mWrap(h);
  }

  function mConfirmDel() {
    var g = db.games[ui.modal.id];
    var h = '<h2>Delete this game?</h2><p class="sub">' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + ', ' + esc(SB.fmtDate(g.info.date)) + '. This can\'t be undone. Save a PDF or backup file first if you need a copy.</p>' +
      '<div class="actions"><button class="btn" data-act="close">Keep it</button><button class="btn danger solid" data-act="dodel" data-id="' + g.id + '">Delete game</button></div>';
    return mWrap(h);
  }

  /* ---------- render ---------- */
  function render() {
    var app = document.getElementById('app');
    var v = ui.view, h = '';
    if (v === 'home') h = vHome();
    else if (v === 'setup') h = vSetup();
    else if (v === 'lineup') h = vLineup();
    else if (v === 'live') h = vLive();
    else if (v === 'summary') h = vSummary();
    if (ui.modal) {
      var k = ui.modal.kind;
      h += k === 'sub' ? mSub() : k === 'libero' ? mLibero() : k === 'check' ? mCheck() : k === 'menu' ? mMenu() : k === 'del' ? mConfirmDel() : '';
    }
    app.innerHTML = h;
    document.body.classList.toggle('is-live', v === 'live');
    keepAwake(v === 'live');
    if (ui.modal && ui.modal.kind === 'sub' && ui.modal.out && !ui.modal.inn) { var i = document.getElementById('subIn'); if (i) i.focus(); }
  }

  function openGame(id) {
    ui.gameId = id; ui.modal = null;
    var g = game();
    if (g.status === 'done') ui.view = 'summary';
    else if (!g.sets.length) { g.sets.push(SB.newSet(g)); ui.view = 'lineup'; }
    else ui.view = g.sets[curSetIdx(g)].started ? 'live' : 'lineup';
    render();
  }

  /* ---------- actions ---------- */
  function addEvent(ev) {
    var g = game(), si = curSetIdx(g);
    ev.ts = Date.now();
    g.sets[si].events.push(ev);
    save();
  }

  function doPDF(g, mode) {
    if (!window.jspdf) { toast('The PDF tool did not load.'); return; }
    var doc = SB.makePDF(window.jspdf.jsPDF, g);
    var name = SB.pdfName(g);
    if (mode === 'print') {
      var url = doc.output('bloburl');
      var w = window.open(url, '_blank');
      if (!w) { doc.save(name); toast('Pop-up blocked, so the PDF was saved instead. Open it and print from there.'); }
      else toast('PDF opened in a new tab. Print from there.');
    } else {
      doc.save(name);
    }
  }

  function readSetupForm() {
    var g = ui.edit ? game() : ui.draft;
    function v(id) { return document.getElementById(id).value.trim(); }
    function n(id, d) { var x = parseInt(v(id), 10); return isNaN(x) || x < 1 ? d : x; }
    g.info.home = v('f-home'); g.info.away = v('f-away'); g.info.date = v('f-date');
    g.info.level = v('f-level'); g.info.site = v('f-site'); g.info.scorer = v('f-scorer'); g.info.referee = v('f-ref');
    g.settings.points = [n('f-p1', 25), n('f-p2', 25), n('f-p3', 25)];
    g.settings.winBy = n('f-winby', 2); g.settings.timeouts = n('f-to', 2); g.settings.subLimit = n('f-subs', 18);
    g.settings.libero = document.getElementById('f-lib').checked;
    return g;
  }

  function readLineup(g, set) {
    ['A', 'B'].forEach(function (t) {
      for (var k = 0; k < 6; k++) set.lineup[t][k] = document.getElementById('ln-' + t + '-' + k).value.trim().replace(/^0+(?=\d)/, '');
      var li = document.getElementById('lib-' + t);
      if (li) set.libero[t] = li.value.trim().replace(/^0+(?=\d)/, '');
    });
  }
  function lineupError(g, set) {
    var msg = null;
    ['A', 'B'].forEach(function (t) {
      if (msg) return;
      var nums = set.lineup[t];
      if (nums.some(function (x) { return !x; })) { msg = 'Fill in all six numbers for ' + tn(g, t) + '.'; return; }
      var seen = {};
      nums.forEach(function (x) { if (seen[x] && !msg) msg = tn(g, t) + ' has #' + x + ' in two spots.'; seen[x] = 1; });
      if (!msg && g.settings.libero && set.libero[t] && seen[set.libero[t]]) msg = tn(g, t) + '\'s libero #' + set.libero[t] + ' is also in the starting six.';
    });
    return msg;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'scrim') { if (e.target === el && ui.modal && ui.modal.kind !== 'check') { ui.modal = null; render(); } return; }
    var g = game(), si = g ? curSetIdx(g) : -1, team = el.getAttribute('data-team');

    switch (act) {
      case 'new': ui.edit = false; ui.draft = null; ui.view = 'setup'; render(); break;
      case 'home': ui.modal = null; ui.view = 'home'; ui.gameId = null; render(); break;
      case 'open': openGame(el.getAttribute('data-id')); break;
      case 'pdf': doPDF(db.games[el.getAttribute('data-id')] || g, 'save'); break;
      case 'print': doPDF(db.games[el.getAttribute('data-id')] || g, 'print'); break;
      case 'blankpdf': var bg = SB.newGame(); bg.info.date = ''; bg.info.level = ''; doPDF(bg, 'save'); break;
      case 'backup':
        var bgm = db.games[el.getAttribute('data-id')];
        var blob = new Blob([JSON.stringify(bgm, null, 1)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = SB.pdfName(bgm).replace(/\.pdf$/, '') + '.scorebook.json';
        document.body.appendChild(a); a.click(); a.remove();
        break;
      case 'askdel': ui.modal = { kind: 'del', id: el.getAttribute('data-id') }; render(); break;
      case 'dodel': delete db.games[el.getAttribute('data-id')]; ui.modal = null; save(); render(); toast('Game deleted'); break;
      case 'close': ui.modal = null; render(); break;
      case 'menu': ui.modal = { kind: 'menu' }; render(); break;
      case 'editinfo': ui.modal = null; ui.edit = true; ui.view = 'setup'; render(); break;
      case 'back-live': ui.edit = false; openGame(ui.gameId); break;

      case 'firstserve': readLineup(g, g.sets[si]); g.sets[si].firstServe = team; save(); render(); break;
      case 'leftside': readLineup(g, g.sets[si]); g.sets[si].left = team; save(); render(); break;
      case 'back-prevset':
        if (!g.sets[si].events.length) { g.sets.pop(); save(); ui.view = 'live'; render(); }
        break;
      case 'startset':
        g.sets[si].started = true; g.sets[si].start = Date.now(); save();
        ui.modal = null; ui.view = 'live'; render(); break;

      case 'point':
        var now = Date.now();
        if (now - lastTap < 350) return;   // ignore accidental double taps
        lastTap = now;
        if (SB.replay(g, si).done) return;
        addEvent({ t: 'pt', team: team }); render(); break;
      case 'undo':
        var evs = g.sets[si].events;
        if (!evs.length) { toast('Nothing to undo in this set'); break; }
        evs.pop(); save(); render(); toast('Undone'); break;
      case 'flip':
        var es = g.sets[si].events, idx = -1;
        for (var i = es.length - 1; i >= 0; i--) if (es[i].t === 'pt') { idx = i; break; }
        if (idx < 0) { toast('No points to flip yet'); break; }
        es[idx].team = O(es[idx].team); save(); render();
        toast('Last point moved to ' + tn(g, es[idx].team));
        break;
      case 'to':
        var R = SB.replay(g, si);
        if (R.done) return;
        if (R.T[team].timeouts.length >= g.settings.timeouts) { toast(tn(g, team) + ' has used all ' + g.settings.timeouts + ' timeouts'); break; }
        addEvent({ t: 'to', team: team }); render(); toast('Timeout ' + tn(g, team) + ' at ' + R.score[team] + '–' + R.score[O(team)]); break;
      case 'sub': ui.modal = { kind: 'sub', team: team }; render(); break;
      case 'subout':
        ui.modal.inn = (document.getElementById('subIn') || {}).value || ui.modal.inn;
        ui.modal.injury = (document.getElementById('subInj') || {}).checked;
        ui.modal.out = el.getAttribute('data-num'); ui.modal.error = null; ui.modal.needsInjury = false; render(); break;
      case 'dosub':
        var m = ui.modal;
        m.inn = document.getElementById('subIn').value.trim().replace(/^0+(?=\d)/, '');
        m.injury = document.getElementById('subInj').checked;
        var chk = SB.checkSub(g, si, m.team, m.out, m.inn, m.injury);
        if (!chk.ok) { m.error = chk.error; m.needsInjury = !!chk.needsInjury; render(); break; }
        addEvent({ t: 'sub', team: m.team, out: m.out, inn: m.inn, injury: !!m.injury });
        ui.modal = null; render(); toast('#' + m.inn + ' in for #' + m.out); break;
      case 'libero': ui.modal = { kind: 'libero', team: team }; render(); break;
      case 'libin':
        var R2 = SB.replay(g, si), tmL = R2.T[ui.modal.team];
        addEvent({ t: 'lib', team: ui.modal.team, action: 'in', slot: tmL.court[Number(el.getAttribute('data-pos'))] });
        ui.modal = null; render(); break;
      case 'libout': addEvent({ t: 'lib', team: ui.modal.team, action: 'out' }); ui.modal = null; render(); break;
      case 'check': ui.modal = { kind: 'check', pre: false }; render(); break;
      case 'swap': g.sets[si].left = O(g.sets[si].left); save(); render(); break;
      case 'rot':
        if (!g.sets[si].started) { toast('Fix the order on the lineup screen before the set starts.'); break; }
        addEvent({ t: 'rot', team: team, dir: Number(el.getAttribute('data-dir')) }); render(); toast('Rotation corrected for ' + tn(g, team) + '. Noted on the scoresheet.'); break;
      case 'nextset': g.sets.push(SB.newSet(g)); save(); ui.view = 'lineup'; render(); break;
      case 'finish': g.status = 'done'; save(); ui.view = 'summary'; render(); break;
      case 'reopen': g.status = 'live'; save(); ui.view = 'live'; render(); break;
    }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'setupForm') {
      var g = readSetupForm();
      if (ui.edit) { ui.edit = false; save(); openGame(g.id); toast('Game info saved'); return; }
      db.games[g.id] = g; ui.draft = null; ui.gameId = g.id;
      g.sets.push(SB.newSet(g)); save(); ui.view = 'lineup'; render();
    } else if (e.target.id === 'lineupForm') {
      var gm = game(), set = gm.sets[curSetIdx(gm)];
      readLineup(gm, set);
      var err = lineupError(gm, set);
      save();
      if (err) { var el = document.getElementById('lineupErr'); el.textContent = err; el.hidden = false; return; }
      ui.modal = { kind: 'check', pre: true }; render();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id !== 'importFile') return;
    var file = e.target.files[0]; if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var g = JSON.parse(rd.result);
        if (!g || !g.info || !g.sets || !g.settings) throw new Error('bad');
        if (db.games[g.id]) g.id = g.id + '-r' + Date.now().toString(36);
        g.updatedAt = Date.now();
        db.games[g.id] = g; save(); render(); toast('Restored ' + tn(g, 'A') + ' vs ' + tn(g, 'B'));
      } catch (err) { toast('That file isn\'t a scorebook backup.'); }
    };
    rd.readAsText(file);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && ui.modal && ui.modal.kind === 'sub' && e.target.id === 'subIn') { e.preventDefault(); document.querySelector('[data-act="dosub"]').click(); }
    if (e.key === 'Escape' && ui.modal && ui.modal.kind !== 'check') { ui.modal = null; render(); }
  });

  load();
  render();
})();
