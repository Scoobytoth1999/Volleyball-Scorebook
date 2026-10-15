/* ---------- Scorebook core: game model, rules presets, replay, PDF ---------- */
var SB = (function () {
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  /* Rule presets. Every value stays editable on the game screen. */
  var PRESETS = {
    youth:   { format: 'all',   setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: false },
    hs:      { format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: true },
    varsity: { format: 'bestof', setsTotal: 5, points: [25, 25, 25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: true },
    club:    { format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 12, libero: true },
    college: { format: 'bestof', setsTotal: 5, points: [25, 25, 25, 25, 15], winBy: 2, timeouts: 2, subLimit: 15, libero: true },
    rec:     { format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 12, libero: false }
  };
  var LEVELS = [
    { group: 'Elementary and middle school', items: ['4th grade', '5th grade', '6th grade', '7th grade', '8th grade'], preset: 'youth' },
    { group: 'High school', items: ['Freshman', 'JV'], preset: 'hs' },
    { group: 'High school varsity', items: ['Varsity'], preset: 'varsity' },
    { group: 'Club', items: ['Club 12U', 'Club 13U', 'Club 14U', 'Club 15U', 'Club 16U', 'Club 17U', 'Club 18U'], preset: 'club' },
    { group: 'College', items: ['NCAA D1', 'NCAA D2', 'NCAA D3', 'NAIA', 'Junior college'], preset: 'college' },
    { group: 'Adult', items: ['Adult rec'], preset: 'rec' },
    { group: 'Other', items: ['Other'], preset: null }
  ];
  function presetFor(level) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].items.indexOf(level) >= 0) return LEVELS[i].preset;
    return null;
  }
  function applyPreset(settings, level) {
    var p = PRESETS[presetFor(level)];
    if (!p) return settings;
    var s = JSON.parse(JSON.stringify(p));
    return s;
  }
  function pointsFor(n) { var a = []; for (var i = 0; i < n; i++) a.push(i === n - 1 ? 15 : 25); return a; }

  var COLORS = [
    { id: 'navy', name: 'Navy', hex: '#1f3a6e' },
    { id: 'royal', name: 'Royal blue', hex: '#1f5fc4' },
    { id: 'red', name: 'Red', hex: '#c62828' },
    { id: 'maroon', name: 'Maroon', hex: '#7a1f2b' },
    { id: 'orange', name: 'Orange', hex: '#d9601a' },
    { id: 'gold', name: 'Gold', hex: '#e0a91b', light: true, text: '#8a6200' },
    { id: 'green', name: 'Green', hex: '#2e7d32' },
    { id: 'purple', name: 'Purple', hex: '#5e35b1' },
    { id: 'black', name: 'Black', hex: '#1c1c1e' },
    { id: 'gray', name: 'Gray', hex: '#6b7280' }
  ];
  function color(id) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === id) return COLORS[i]; return COLORS[1]; }

  function levelLabel(g) { return g.info.level === 'Other' ? (g.info.levelOther || '') : (g.info.level || ''); }
  function other(t) { return t === 'A' ? 'B' : 'A'; }
  function teamName(g, t) { return t === 'A' ? (g.info.home || 'Home') : (g.info.away || 'Away'); }
  function rotFwd(c) { return c.slice(1).concat(c[0]); }      // new pos1 = old pos2
  function rotBack(c) { return [c[5]].concat(c.slice(0, 5)); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function newGame(carry) {
    var level = (carry && carry.level) || '7th grade';
    var g = {
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(), updatedAt: Date.now(),
      info: { home: '', away: '', date: todayISO(), site: '', level: level, scorer: '', referee: '', colorA: 'royal', colorB: 'orange' },
      settings: applyPreset(null, level) || JSON.parse(JSON.stringify(PRESETS.youth)),
      sets: [], status: 'live'
    };
    if (carry) {
      ['date', 'site', 'scorer', 'referee'].forEach(function (k) { if (carry[k]) g.info[k] = carry[k]; });
      if (carry.settings) g.settings = JSON.parse(JSON.stringify(carry.settings));
    }
    return g;
  }

  function newSet(g) {
    var prev = g.sets[g.sets.length - 1];
    return {
      lineup: { A: ['', '', '', '', '', ''], B: ['', '', '', '', '', ''] },
      libero: { A: '', B: '' },
      firstServe: prev ? other(prev.firstServe) : 'A',
      left: prev ? other(prev.left) : 'A',
      events: [], started: false, start: null
    };
  }

  /* Rebuild the full state of a set from its lineup + event log. */
  function replay(g, si) {
    var set = g.sets[si];
    var S = g.settings;
    var target = S.points[si] || 25;
    var T = {};
    ['A', 'B'].forEach(function (t) {
      T[t] = {
        slots: set.lineup[t].map(function (n) { return { players: [n], current: n }; }),
        // court[p] = slot index at position p+1. Receiving team starts with server I in right front (pos 2).
        court: t === set.firstServe ? [0, 1, 2, 3, 4, 5] : [5, 0, 1, 2, 3, 4],
        subs: [], subCount: 0, timeouts: [], turns: [],
        lib: { num: (S.libero && set.libero[t]) || '', slot: null },
        barred: {}
      };
    });
    var score = { A: 0, B: 0 };
    var serving = set.firstServe;
    var done = false, winner = null, lastTs = null;
    var notes = [], log = [];
    function openTurn(t) { T[t].turns.push({ slot: T[t].court[0], end: null }); }
    function closeTurn(t) {
      var tr = T[t].turns[T[t].turns.length - 1];
      if (tr && tr.end === null) tr.end = score[t];
    }
    function libAuto(t) {
      var L = T[t].lib;
      if (L.slot !== null && T[t].court.indexOf(L.slot) === 3) L.slot = null; // rotated to front row
    }
    function sc(t) { return score[t] + '-' + score[other(t)]; }
    function servingNow() {
      var tm = T[serving], si = tm.court[0];
      return { team: serving, slot: si, num: tm.lib.slot === si ? tm.lib.num : tm.slots[si].current };
    }
    if (set.started) openTurn(serving);

    set.events.forEach(function (ev, idx) {
      var entry = { idx: idx, ev: ev, ignored: done };
      if (done) { log.push(entry); return; }
      var t = ev.team, o = other(t);
      lastTs = ev.ts || lastTs;
      if (ev.t === 'pt') {
        entry.server = servingNow();
        score[t]++;
        var sideout = serving !== t;
        entry.sideout = sideout;
        if (sideout) closeTurn(serving);
        var ended = score[t] >= target && score[t] - score[o] >= S.winBy;
        if (sideout) {
          serving = t;
          T[t].court = rotFwd(T[t].court);
          libAuto(t);
          if (!ended) openTurn(t);
        }
        if (ended) {
          done = true; winner = t; entry.setPoint = true;
          if (!sideout) { closeTurn(t); T[t].turns[T[t].turns.length - 1].final = true; }
        }
      } else if (ev.t === 'to') {
        T[t].timeouts.push([score[t], score[o]]);
      } else if (ev.t === 'sub') {
        var k = -1;
        T[t].slots.forEach(function (s, i) { if (s.current === ev.out) k = i; });
        if (k < 0) { entry.ignored = true; log.push(entry); return; }
        var slot = T[t].slots[k];
        slot.current = ev.inn;
        if (slot.players.indexOf(ev.inn) < 0) slot.players.push(ev.inn);
        T[t].subs.push({ slot: k, out: ev.out, inn: ev.inn, at: [score[t], score[o]], injury: !!ev.injury });
        entry.slot = k;
        if (ev.injury) {
          T[t].barred[ev.out] = true;
          if (T[t].subCount < S.subLimit) T[t].subCount++;
          notes.push('Injury sub, ' + teamName(g, t) + ': #' + ev.inn + ' for #' + ev.out + ' at ' + sc(t) + ' (#' + ev.out + ' may not re-enter this set)');
        } else {
          T[t].subCount++;
        }
      } else if (ev.t === 'rot') {
        T[t].court = ev.dir > 0 ? rotFwd(T[t].court) : rotBack(T[t].court);
        if (serving === t) {
          var tr = T[t].turns[T[t].turns.length - 1];
          if (tr && tr.end === null) tr.slot = T[t].court[0];
        }
        libAuto(t);
        notes.push('Rotation corrected, ' + teamName(g, t) + ', at ' + sc(t));
      } else if (ev.t === 'lib') {
        if (ev.action === 'in') { entry.replaced = T[t].slots[ev.slot] ? T[t].slots[ev.slot].current : ''; T[t].lib.slot = ev.slot; }
        else T[t].lib.slot = null;
      }
      entry.score = { A: score.A, B: score.B };
      log.push(entry);
    });
    return { T: T, score: score, serving: serving, done: done, winner: winner, target: target, notes: notes, log: log, endTs: done ? lastTs : null };
  }

  function onCourt(R, t, p) {
    var tm = R.T[t], si = tm.court[p];
    if (tm.lib.slot === si) return { num: tm.lib.num, libero: true, slot: si };
    return { num: tm.slots[si].current, libero: false, slot: si };
  }

  function checkSub(g, si, t, out, inn, injury) {
    var R = replay(g, si), tm = R.T[t], S = g.settings;
    inn = String(inn || '').trim();
    if (!out) return { ok: false, error: 'Tap the player coming out.' };
    if (!inn) return { ok: false, error: 'Enter the number of the player going in.' };
    if (tm.lib.num && out === tm.lib.num && tm.lib.slot !== null) return { ok: false, error: 'The libero has to come out with the Libero button first.' };
    if (tm.lib.num && inn === tm.lib.num) return { ok: false, error: 'Use the Libero button to bring the libero in.' };
    var k = -1;
    tm.slots.forEach(function (s, i) { if (s.current === out) k = i; });
    if (k < 0) return { ok: false, error: '#' + out + ' is not on the court.' };
    if (tm.slots.some(function (s) { return s.current === inn; })) return { ok: false, error: '#' + inn + ' is already on the court.' };
    if (tm.barred[inn]) return { ok: false, error: '#' + inn + ' left with an injury and may not re-enter this set.' };
    var otherSpot = -1;
    tm.slots.forEach(function (s, i) { if (i !== k && s.players.indexOf(inn) >= 0) otherSpot = i; });
    if (otherSpot >= 0 && !injury) {
      return { ok: false, needsInjury: true, error: '#' + inn + ' already played serve spot ' + ROMAN[otherSpot] + ' this set. Only an injury sub can put them in spot ' + ROMAN[k] + '.' };
    }
    if (!injury && tm.subCount >= S.subLimit) {
      return { ok: false, needsInjury: true, error: 'All ' + S.subLimit + ' subs are used. Only an injury sub is allowed now.' };
    }
    return { ok: true };
  }

  /* Match status: set wins and whether the match is decided */
  function setResult(g, i) {
    if (!g.sets[i] || !g.sets[i].started) return null;
    var R = replay(g, i);
    return { a: R.score.A, b: R.score.B, done: R.done, winner: R.winner };
  }
  function matchStatus(g) {
    var wins = { A: 0, B: 0 }, played = 0;
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var r = setResult(g, i);
      if (r && r.done) { wins[r.winner]++; played++; }
    }
    var need = Math.floor(g.settings.setsTotal / 2) + 1;
    var decided = g.settings.format === 'bestof' ? (wins.A >= need || wins.B >= need) : played >= g.settings.setsTotal;
    var winner = null;
    if (decided) winner = wins.A === wins.B ? 'tie' : (wins.A > wins.B ? 'A' : 'B');
    return { wins: wins, played: played, decided: decided, winner: winner };
  }
  function formatLabel(S) {
    return S.format === 'bestof' ? 'Best of ' + S.setsTotal : 'All ' + S.setsTotal + ' sets played';
  }

  /* ---------------- PDF ---------------- */
  function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) + '/' + p[0] : iso;
  }
  function blankSet() {
    return { lineup: { A: ['', '', '', '', '', ''], B: ['', '', '', '', '', ''] }, libero: { A: '', B: '' }, firstServe: null, left: 'A', events: [], started: false };
  }

  function drawTeam(doc, g, si, set, R, t, x, y, w) {
    doc.setFillColor(232, 236, 242); doc.rect(x, y, w, 22, 'F');
    doc.setDrawColor(40); doc.setLineWidth(0.8); doc.rect(x, y, w, 22);
    doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(teamName(g, t) + (t === 'A' ? '  (Home)' : '  (Away)'), x + 6, y + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    var tag = set.firstServe === t ? 'Served first' : (set.firstServe ? 'Received first' : 'Serve:  [  ] first');
    doc.text(tag, x + w - 92, y + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(set.started ? String(R.score[t]) : '', x + w - 8, y + 16, { align: 'right' });
    y += 28;

    var cw = [30, 34, 108], boxesX = x + cw[0] + cw[1] + cw[2], boxesW = w - (cw[0] + cw[1] + cw[2]);
    var nBox = 8;
    var turnsBy = [[], [], [], [], [], []];
    if (set.started) R.T[t].turns.forEach(function (tr) { if (tr.end !== null) turnsBy[tr.slot].push(tr); });
    turnsBy.forEach(function (l) { if (l.length > nBox) nBox = l.length; });
    var bw = boxesW / nBox;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setLineWidth(0.5);
    var hh = 14;
    doc.rect(x, y, w, hh);
    doc.text('Serve', x + 4, y + 9.5);
    doc.text('Start #', x + cw[0] + 4, y + 9.5);
    doc.text('Subs in  (# @ score)', x + cw[0] + cw[1] + 4, y + 9.5);
    doc.text('Score at end of each service turn', boxesX + 4, y + 9.5);
    y += hh;
    var rh = 28;
    for (var k = 0; k < 6; k++) {
      var ry = y + k * rh;
      doc.setLineWidth(0.5); doc.rect(x, ry, w, rh);
      doc.line(x + cw[0], ry, x + cw[0], ry + rh);
      doc.line(x + cw[0] + cw[1], ry, x + cw[0] + cw[1], ry + rh);
      doc.line(boxesX, ry, boxesX, ry + rh);
      doc.setLineWidth(0.25);
      for (var b = 1; b < nBox; b++) doc.line(boxesX + b * bw, ry, boxesX + b * bw, ry + rh);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(ROMAN[k], x + cw[0] / 2, ry + 17.5, { align: 'center' });
      doc.setFontSize(12);
      doc.text(String(set.lineup[t][k] || ''), x + cw[0] + cw[1] / 2, ry + 18, { align: 'center' });
      if (set.started) {
        var subs = R.T[t].subs.filter(function (s) { return s.slot === k; }).map(function (s) {
          return '#' + s.inn + ' @' + s.at[0] + '-' + s.at[1] + (s.injury ? ' INJ' : '');
        });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        var lines = [];
        for (var q = 0; q < subs.length; q += 2) lines.push(subs.slice(q, q + 2).join('   '));
        lines.slice(0, 2).forEach(function (ln, li) { doc.text(ln, x + cw[0] + cw[1] + 3, ry + 11 + li * 9); });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        turnsBy[k].forEach(function (tr, j) {
          var cx = boxesX + j * bw + bw / 2, cy = ry + rh / 2;
          doc.text(String(tr.end), cx, cy + 3.5, { align: 'center' });
          if (tr.final) { doc.setLineWidth(0.8); doc.circle(cx, cy, Math.min(bw, rh) / 2 - 2); }
        });
      }
    }
    y += 6 * rh + 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text('Running score', x, y + 2);
    y += 6;
    var pts = set.started ? R.score[t] : 0;
    var per = 15, total = Math.max((g.settings.points[si] || 25) > 15 ? 30 : 15, Math.ceil((pts + 1) / per) * per);
    var cwid = w / per, chh = 18;
    doc.setLineWidth(0.4);
    for (var i = 1; i <= total; i++) {
      var col = (i - 1) % per, row = Math.floor((i - 1) / per);
      var bx = x + col * cwid, by = y + row * chh;
      doc.rect(bx, by, cwid, chh);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
      doc.text(String(i), bx + cwid / 2, by + 12.5, { align: 'center' });
      doc.setTextColor(20);
      if (i <= pts) { doc.setLineWidth(1); doc.line(bx + 3, by + chh - 3, bx + cwid - 3, by + 3); doc.setLineWidth(0.4); }
      if (R.done && i === pts) { doc.setLineWidth(1); doc.circle(bx + cwid / 2, by + chh / 2, chh / 2 - 1); doc.setLineWidth(0.4); }
    }
    y += Math.ceil(total / per) * chh + 12;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    var tos = [];
    for (var n = 0; n < g.settings.timeouts; n++) {
      var tv = set.started ? R.T[t].timeouts[n] : null;
      tos.push((n + 1) + ')  ' + (tv ? tv[0] + '-' + tv[1] : '____'));
    }
    doc.text('Timeouts:   ' + tos.join('      '), x, y);
    doc.text('Subs used:  ' + (set.started ? R.T[t].subCount : '___') + ' of ' + g.settings.subLimit, x + w * 0.62, y);
    y += 13;
    if (g.settings.libero) {
      doc.text('Libero:  ' + (set.libero[t] ? '#' + set.libero[t] : '____'), x, y);
      y += 13;
    }
    return y;
  }

  function matchLine(g) {
    var parts = [];
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var r = setResult(g, i);
      parts.push('Set ' + (i + 1) + ': ' + (r ? r.a + '-' + r.b + (r.done ? '' : ' (in progress)') : '-'));
    }
    return parts.join('    ');
  }

  function drawPage(doc, g, si, lastPage) {
    var W = 792, H = 612, M = 28;
    var set = g.sets[si] || blankSet();
    var R = set.started ? replay(g, si) : { T: {}, score: { A: 0, B: 0 }, done: false, notes: [] };
    var ms = matchStatus(g);
    doc.setTextColor(20); doc.setDrawColor(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('VOLLEYBALL SCORESHEET', M, M + 12);
    doc.setFontSize(13);
    doc.text('SET ' + (si + 1) + ' of ' + g.settings.setsTotal, W - M, M + 12, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    var meta = [teamName(g, 'A') + ' (Home) vs ' + teamName(g, 'B') + ' (Away)', levelLabel(g), fmtDate(g.info.date), g.info.site].filter(Boolean).join('     |     ');
    doc.text(meta, M, M + 28);
    doc.text(matchLine(g) + '     |     Sets won: ' + teamName(g, 'A') + ' ' + ms.wins.A + ', ' + teamName(g, 'B') + ' ' + ms.wins.B, M, M + 41);
    doc.setLineWidth(1); doc.line(M, M + 48, W - M, M + 48);
    doc.setFontSize(8); doc.setTextColor(70);
    doc.text(formatLabel(g.settings) + '.  Set to ' + (g.settings.points[si] || 25) + ', win by ' + g.settings.winBy + '.  Left of table: ' + teamName(g, set.left), W - M, M + 28, { align: 'right' });
    doc.setTextColor(20);

    var gap = 20, cw = (W - 2 * M - gap) / 2, y0 = M + 58;
    var order = [set.left || 'A', other(set.left || 'A')];
    var y1 = drawTeam(doc, g, si, set, R, order[0], M, y0, cw);
    var y2 = drawTeam(doc, g, si, set, R, order[1], M + cw + gap, y0, cw);
    var y = Math.max(y1, y2) + 4;

    doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 13;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    var res = set.started ? (R.done ? 'Winner: ' + teamName(g, R.winner) + '  ' + R.score[R.winner] + '-' + R.score[other(R.winner)] : 'Set in progress: ' + teamName(g, 'A') + ' ' + R.score.A + ', ' + teamName(g, 'B') + ' ' + R.score.B) : 'Winner: ______________________   Score: ______';
    doc.text(res, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text('Start: ' + (set.start ? fmtTime(set.start) : '______') + '     End: ' + (R.endTs ? fmtTime(R.endTs) : '______'), W - M, y, { align: 'right' });
    y += 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Notes', M, y);
    doc.setFont('helvetica', 'normal');
    var notes = (R.notes || []).slice();
    var limitY = lastPage ? H - M - 34 : H - M;
    var ny = y;
    notes.forEach(function (n) {
      doc.splitTextToSize('- ' + n, W - 2 * M - 40).forEach(function (ln) { if (ny <= limitY) { doc.text(ln, M + 34, ny); ny += 10; } });
    });
    if (!notes.length) { doc.setTextColor(120); doc.text('None', M + 34, y); doc.setTextColor(20); }

    if (lastPage) {
      var sy = H - M - 6;
      doc.setFontSize(9); doc.setLineWidth(0.5);
      var mw = ms.decided ? (ms.winner === 'tie' ? 'Tie' : teamName(g, ms.winner)) : '';
      var fields = [['Scorer', g.info.scorer], ['Referee', g.info.referee], ['Match winner', mw]];
      var fw = (W - 2 * M) / 3;
      fields.forEach(function (f, i) {
        var fx = M + i * fw;
        doc.setFont('helvetica', 'bold'); doc.text(f[0] + ':', fx, sy);
        var lw = doc.getTextWidth(f[0] + ':') + 6;
        doc.setFont('helvetica', 'normal'); doc.text(f[1] || '', fx + lw + 2, sy - 3);
        doc.line(fx + lw, sy + 1, fx + fw - 16, sy + 1);
      });
    }
  }

  function makePDF(jsPDF, g) {
    var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    var ms = matchStatus(g);
    var pages = [];
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var played = g.sets[i] && g.sets[i].started;
      if (!played && g.settings.format === 'bestof' && ms.decided) continue; // match over, set not needed
      pages.push(i);
    }
    pages.forEach(function (si, n) {
      if (n > 0) doc.addPage('letter', 'landscape');
      drawPage(doc, g, si, n === pages.length - 1);
    });
    return doc;
  }
  function pdfName(g) {
    var s = (teamName(g, 'A') + ' vs ' + teamName(g, 'B') + ' ' + (g.info.date || '')).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
    return (s || 'scoresheet') + '.pdf';
  }

  return {
    levelLabel: levelLabel, ROMAN: ROMAN, LEVELS: LEVELS, PRESETS: PRESETS, COLORS: COLORS, color: color, presetFor: presetFor, applyPreset: applyPreset, pointsFor: pointsFor,
    other: other, teamName: teamName, newGame: newGame, newSet: newSet, replay: replay, onCourt: onCourt, checkSub: checkSub,
    setResult: setResult, matchStatus: matchStatus, formatLabel: formatLabel, makePDF: makePDF, pdfName: pdfName, fmtDate: fmtDate, fmtTime: fmtTime
  };
})();
if (typeof module !== 'undefined') module.exports = SB;
