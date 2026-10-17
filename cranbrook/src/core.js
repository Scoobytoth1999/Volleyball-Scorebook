/* ---------- Scorebook core: game model, rules presets, replay, PDF (v3) ---------- */
var SB = (function () {
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  /* Rule presets. Every value stays editable on the game screen. */
  var PRESETS = {
    youth:   { style: 'mhsaa', format: 'all',    setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: false },
    hs:      { style: 'mhsaa', format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: true },
    varsity: { style: 'mhsaa', format: 'bestof', setsTotal: 5, points: [25, 25, 25, 25, 15], winBy: 2, timeouts: 2, subLimit: 18, libero: true },
    club:    { style: 'aau',   format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 12, libero: true },
    college: { style: 'aau',   format: 'bestof', setsTotal: 5, points: [25, 25, 25, 25, 15], winBy: 2, timeouts: 2, subLimit: 15, libero: true },
    rec:     { style: 'aau',   format: 'bestof', setsTotal: 3, points: [25, 25, 15], winBy: 2, timeouts: 2, subLimit: 12, libero: false }
  };
  var STYLES = [{ id: 'mhsaa', name: 'MHSAA (school)' }, { id: 'aau', name: 'AAU (club)' }];
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
    return JSON.parse(JSON.stringify(p));
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
  function nameOf(g, t) { return g.blank ? '' : teamName(g, t); }
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
      info: { home: '', away: '', date: todayISO(), site: '', level: level, scorer: '', referee: '', referee2: '', colorA: 'royal', colorB: 'orange',
        gameNumber: '', competition: '', city: '', pool: '', matchNo: '', division: '', category: '' },
      settings: applyPreset(null, level) || JSON.parse(JSON.stringify(PRESETS.youth)),
      sets: [], status: 'live'
    };
    if (carry) {
      ['date', 'site', 'scorer', 'referee', 'referee2', 'competition', 'city', 'pool', 'division', 'category'].forEach(function (k) { if (carry[k]) g.info[k] = carry[k]; });
      if (carry.settings) g.settings = JSON.parse(JSON.stringify(carry.settings));
    }
    return g;
  }

  function newSet(g) {
    var prev = g.sets[g.sets.length - 1];
    return {
      lineup: { A: ['', '', '', '', '', ''], B: ['', '', '', '', '', ''] },
      libero: { A: '', B: '' },
      captain: { A: '', B: '' },
      firstServe: prev ? other(prev.firstServe) : 'A',
      left: prev ? other(prev.left) : 'B',   // home team (A) starts on the right, then teams switch ends each set
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
        // court[p] = slot index at position p+1. Receiving team starts one rotation back (server I in right front).
        court: t === set.firstServe ? [0, 1, 2, 3, 4, 5] : [5, 0, 1, 2, 3, 4],
        subs: [], subCount: 0, timeouts: [], turns: [],
        lib: { num: (S.libero && set.libero[t]) || '', slot: null },
        barred: {},
        marks: [[], [], [], [], [], []]       // MHSAA marks in each serve-order row
      };
    });
    var score = { A: 0, B: 0 };
    var serving = set.firstServe;
    var done = false, winner = null, lastTs = null;
    var notes = [], log = [], sanctions = [];
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
      var tm = T[serving], si = tm.court[0], lib = tm.lib.slot === si;
      return { team: serving, slot: si, num: lib ? tm.lib.num : tm.slots[si].current, libero: lib };
    }
    function mark(m) { T[serving].marks[T[serving].court[0]].push(m); }
    function award(t, entry, pen) {
      var o = other(t);
      entry.server = servingNow();
      score[t]++;
      var sideout = serving !== t;
      entry.sideout = sideout;
      var ended = score[t] >= target && score[t] - score[o] >= S.winBy;
      var m;
      if (sideout) {
        mark({ k: '--' });
        closeTurn(serving);
        serving = t;
        T[t].court = rotFwd(T[t].court);
        libAuto(t);
        m = { k: 'pt', n: score[t], boxed: true, pen: pen };
        mark(m);
        if (!ended) openTurn(t);
      } else {
        m = { k: 'pt', n: score[t], pen: pen, lib: entry.server.libero };
        mark(m);
      }
      if (ended) {
        done = true; winner = t; entry.setPoint = true; m.final = true;
        if (!sideout) { closeTurn(t); T[t].turns[T[t].turns.length - 1].final = true; }
      }
    }
    if (set.started) openTurn(serving);

    set.events.forEach(function (ev, idx) {
      var entry = { idx: idx, ev: ev, ignored: done };
      if (done) { log.push(entry); return; }
      var t = ev.team, o = other(t);
      lastTs = ev.ts || lastTs;
      if (ev.t === 'pt') {
        award(t, entry, false);
      } else if (ev.t === 'pen') {
        // penalty point awarded to ev.team
        sanctions.push({ team: o, kind: 'P', who: '', score: score.A + ':' + score.B, set: si + 1 });
        notes.push({ team: o, text: 'Penalty point to ' + teamName(g, t) + ' at ' + sc(t) });
        award(t, entry, true);
      } else if (ev.t === 'card') {
        // ev.team = team that received the card
        var red = ev.color === 'red';
        sanctions.push({ team: t, kind: red ? 'P' : 'W', who: ev.who || 'C', score: score.A + ':' + score.B, set: si + 1 });
        notes.push({ team: t, text: (red ? 'Red' : 'Yellow') + ' card, ' + teamName(g, t) + ' ' + (ev.who ? '#' + ev.who : 'coach/bench') + ' at ' + sc(t) + (red ? ', point to ' + teamName(g, o) : '') });
        if (red) award(o, entry, true);
      } else if (ev.t === 'rp') {
        mark({ k: 'R' });
      } else if (ev.t === 'to') {
        mark({ k: t === serving ? 'T' : 'Tx' });
        T[t].timeouts.push([score[t], score[o]]);
      } else if (ev.t === 'sub') {
        var k = -1;
        T[t].slots.forEach(function (s, i) { if (s.current === ev.out) k = i; });
        if (k < 0) { entry.ignored = true; log.push(entry); return; }
        var slot = T[t].slots[k];
        slot.current = ev.inn;
        if (slot.players.indexOf(ev.inn) < 0) slot.players.push(ev.inn);
        T[t].subs.push({ slot: k, out: ev.out, inn: ev.inn, at: [score[t], score[o]], injury: !!ev.injury });
        mark({ k: t === serving ? 'S' : 'Sx' });
        entry.slot = k;
        if (ev.injury) {
          T[t].barred[ev.out] = true;
          if (T[t].subCount < S.subLimit) T[t].subCount++;
          notes.push({ team: t, text: 'Injury sub: #' + ev.inn + ' for #' + ev.out + ' at ' + sc(t) + ' (#' + ev.out + ' may not re-enter this set)' });
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
        notes.push({ team: t, text: 'Rotation corrected at ' + sc(t) });
      } else if (ev.t === 'lib') {
        if (ev.action === 'in') { entry.replaced = T[t].slots[ev.slot] ? T[t].slots[ev.slot].current : ''; T[t].lib.slot = ev.slot; }
        else T[t].lib.slot = null;
      }
      entry.score = { A: score.A, B: score.B };
      log.push(entry);
    });
    (set.fixes || []).forEach(function (f) { notes.push({ team: f.team, text: 'Lineup corrected at ' + f.at }); });
    return { T: T, score: score, serving: serving, done: done, winner: winner, target: target, notes: notes, sanctions: sanctions, log: log, endTs: done ? lastTs : null };
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
  function formatLabel(S) { return S.format === 'bestof' ? 'Best of ' + S.setsTotal : 'All ' + S.setsTotal + ' sets played'; }

  /* ================= PDF helpers ================= */
  function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) + '/' + p[0] : iso;
  }
  function blankSet() {
    return { lineup: { A: ['', '', '', '', '', ''], B: ['', '', '', '', '', ''] }, libero: { A: '', B: '' }, captain: { A: '', B: '' }, firstServe: null, left: 'A', events: [], started: false };
  }
  function setData(g, si) {
    var set = g.sets[si] || blankSet();
    if (!set.captain) set.captain = { A: '', B: '' };
    return { set: set, R: set.started ? replay(g, si) : null };
  }
  function bold(doc, size) { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); }
  function norm(doc, size) { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); }
  /* label + value on an underline */
  function fld(doc, label, value, x, y, w) {
    bold(doc, 7.5); doc.text(label, x, y);
    var lw = doc.getTextWidth(label) + 4;
    norm(doc, 9); if (value) doc.text(String(value), x + lw, y - 1);
    doc.setLineWidth(0.5); doc.line(x + lw - 2, y + 2, x + w, y + 2);
  }
  function checkbox(doc, x, y, on, s) {
    s = s || 7; doc.setLineWidth(0.5); doc.rect(x, y, s, s);
    if (on) { doc.setLineWidth(0.9); doc.line(x + 1.2, y + 1.2, x + s - 1.2, y + s - 1.2); doc.line(x + s - 1.2, y + 1.2, x + 1.2, y + s - 1.2); }
  }
  function slash(doc, x, y, w, h) { doc.setLineWidth(0.9); doc.line(x + 2, y + h - 2, x + w - 2, y + 2); }
  function runningGrid(doc, x, y, cols, rows, cw, rh, pts, final, size) {
    // numbers 1..cols*rows down each column; slash scored, circle final
    doc.setLineWidth(0.35);
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
      var n = c * rows + r + 1, bx = x + c * cw, by = y + r * rh;
      doc.rect(bx, by, cw, rh);
      norm(doc, size || 6.5); doc.setTextColor(60);
      doc.text(String(n), bx + cw / 2, by + rh / 2 + 2.2, { align: 'center' });
      doc.setTextColor(20);
      if (n <= pts) slash(doc, bx, by, cw, rh);
      if (final && n === pts) { doc.setLineWidth(0.9); doc.circle(bx + cw / 2, by + rh / 2, Math.min(cw, rh) / 2 - 0.6); }
      doc.setLineWidth(0.35);
    }
  }
  function teamNotes(R, t) { return R ? R.notes.filter(function (n) { return n.team === t; }).map(function (n) { return n.text; }) : []; }

  /* ================= MHSAA style: one set per page ================= */
  function drawMHSAA(doc, g, si, isLast) {
    var W = 792, H = 612, M = 26;
    var d = setData(g, si), set = d.set, R = d.R;
    doc.setTextColor(20); doc.setDrawColor(30);
    bold(doc, 14); doc.text('VOLLEYBALL RALLY SCORING SCORESHEET', W / 2, M + 12, { align: 'center' });
    bold(doc, 11); doc.text('Set ' + (si + 1) + ' of ' + g.settings.setsTotal, W - M, M + 12, { align: 'right' });
    var y1 = M + 34;
    fld(doc, 'DATE:', g.blank ? '' : fmtDate(g.info.date), M, y1, 88);
    fld(doc, 'HOME:', nameOf(g, 'A'), M + 96, y1, 150);
    fld(doc, 'VISITOR:', nameOf(g, 'B'), M + 254, y1, 160);
    fld(doc, 'SITE:', g.info.site, M + 422, y1, 112);
    fld(doc, 'Start Time:', set.start ? fmtTime(set.start) : '', M + 542, y1, 96);
    fld(doc, 'End Time:', R && R.endTs ? fmtTime(R.endTs) : '', M + 646, y1, 94);
    var y2 = y1 + 18;
    fld(doc, 'GAME NUMBER:', g.info.gameNumber, M, y2, 230);
    fld(doc, 'LEVEL (Varsity, JV, Freshman):', levelLabel(g), M + 254, y2, 280);
    if (!g.blank) { norm(doc, 7.5); doc.setTextColor(80); doc.text('Set to ' + (g.settings.points[si] || 25) + ', win by ' + g.settings.winBy, W - M, y2, { align: 'right' }); doc.setTextColor(20); }

    var top = M + 66, bw = 340, cx = M + bw, cw = 60, rx = cx + cw;
    var order = [set.left || 'A', other(set.left || 'A')];
    // pre-compute columns so both blocks share a cell width
    var maxMarks = 16;
    if (R) ['A', 'B'].forEach(function (t) { R.T[t].marks.forEach(function (r) { if (r.length > maxMarks) maxMarks = r.length; }); });
    var bottom1 = drawMHSAABlock(doc, g, set, R, order[0], M, top, bw, maxMarks);
    drawMHSAABlock(doc, g, set, R, order[1], rx, top, bw, maxMarks);

    // center: first serve + running score
    doc.setLineWidth(1); doc.rect(cx, top, cw, bottom1 - top);
    norm(doc, 5.5); doc.text('First Serve', cx + cw / 2, top + 7, { align: 'center' }); doc.text('(check box)', cx + cw / 2, top + 13, { align: 'center' });
    checkbox(doc, cx + 9, top + 17, set.firstServe === order[0], 8);
    checkbox(doc, cx + cw - 17, top + 17, set.firstServe === order[1], 8);
    var gy = top + 38, rows = 15, rh = (bottom1 - gy) / rows, half = cw / 2;
    [order[0], order[1]].forEach(function (t, i) {
      var pts = R ? R.score[t] : 0;
      runningGrid(doc, cx + i * half, gy, 2, rows, half / 2, rh, Math.min(pts, 30), R && R.done && R.winner === t, 6);
    });
    doc.setLineWidth(1); doc.line(cx + half, gy, cx + half, bottom1); doc.line(cx, gy, cx + cw, gy);
    // final score
    bold(doc, 5.5); doc.text('FINAL SCORE', cx + cw / 2, bottom1 + 7, { align: 'center' });
    doc.setLineWidth(0.8); doc.rect(cx, bottom1 + 9, half, 14); doc.rect(cx + half, bottom1 + 9, half, 14);
    if (R) { bold(doc, 10); doc.text(String(R.score[order[0]]), cx + half / 2, bottom1 + 19.5, { align: 'center' }); doc.text(String(R.score[order[1]]), cx + half + half / 2, bottom1 + 19.5, { align: 'center' }); }

    // subs strips
    var sy = bottom1 + 14;
    [[order[0], M], [order[1], rx]].forEach(function (p) {
      var t = p[0], x = p[1], used = R ? R.T[t].subCount : 0;
      bold(doc, 7.5); doc.text('SUBS:', x + 2, sy);
      var n = g.settings.subLimit || 18, step = (bw - 40) / n;
      for (var i = 1; i <= n; i++) {
        var nx = x + 34 + (i - 1) * step;
        norm(doc, 7.5); doc.text(String(i), nx + step / 2, sy, { align: 'center' });
        if (i <= used) { doc.setLineWidth(0.8); doc.line(nx + 1, sy + 1.5, nx + step - 1, sy - 6); }
      }
    });

    // comments
    var cy = sy + 22;
    [[order[0], M], [order[1], rx]].forEach(function (p) {
      var t = p[0], x = p[1];
      bold(doc, 7.5); doc.text('COMMENTS:', x, cy);
      doc.setLineWidth(0.5); doc.line(x + 46, cy + 2, x + bw, cy + 2); doc.line(x, cy + 16, x + bw, cy + 16); doc.line(x, cy + 30, x + bw, cy + 30);
      norm(doc, 6.8);
      var lines = [];
      teamNotes(R, t).forEach(function (n) { lines = lines.concat(doc.splitTextToSize(n, bw - 50)); });
      lines.slice(0, 3).forEach(function (ln, i) { doc.text(ln, i === 0 ? x + 48 : x + 2, cy + i * 14); });
    });
    // signatures
    var ry = cy + 54;
    [['R1:', g.info.referee, M], ['R2:', g.info.referee2, rx]].forEach(function (p) {
      bold(doc, 7.5); doc.text(p[0], p[2], ry);
      norm(doc, 9); if (p[1]) doc.text(p[1], p[2] + 18, ry - 1);
      doc.setLineWidth(0.5); doc.line(p[2] + 16, ry + 2, p[2] + bw - 10, ry + 2);
      norm(doc, 5.5); doc.text('Print', p[2] + 90, ry + 8); doc.text('Signature', p[2] + 230, ry + 8);
    });
    var ky = ry + 24;
    bold(doc, 7.5); doc.text('SCOREKEEPER:', M, ky);
    norm(doc, 9); if (g.info.scorer) doc.text(g.info.scorer, M + 62, ky - 1);
    doc.setLineWidth(0.5); doc.line(M + 60, ky + 2, M + 280, ky + 2);
    norm(doc, 5.5); doc.text('Print', M + 120, ky + 8);

    // key
    var kb = ky + 14;
    doc.setLineWidth(1); doc.rect(M, kb, W - 2 * M, 34);
    bold(doc, 6.5); doc.text('KEY:', M + 4, kb + 14);
    var key1 = [['c = Playing Captain', 36], ['1 = Point', 150], ['-- = Loss of Rally', 230], ['P1 = Penalty Point', 330], ['R = Replay', 430], ['S = Substitution', 510], ['Sx = Opponent Substitution', 600]];
    var key2 = [['T = Time-Out', 36], ['Tx = Opponent Time-Out', 150], ['= Point Scored off Loss of Rally', 330], ['= Libero Point', 520]];
    key1.forEach(function (k) { doc.text(k[0], M + k[1], kb + 11); });
    key2.forEach(function (k) { doc.text(k[0], M + k[1], kb + 26); });
    doc.setLineWidth(0.6); doc.rect(M + 320, kb + 20, 7, 7);
    doc.triangle(M + 510, kb + 27, M + 517, kb + 27, M + 513.5, kb + 20, 'S');

    if (isLast && !g.blank) {
      var ms = matchStatus(g), parts = [];
      for (var i = 0; i < g.settings.setsTotal; i++) { var r = setResult(g, i); if (r) parts.push(r.a + '-' + r.b); }
      norm(doc, 8);
      var mw = ms.decided ? (ms.winner === 'tie' ? 'Match tied' : 'Match winner: ' + teamName(g, ms.winner) + ' ' + ms.wins[ms.winner] + '-' + ms.wins[other(ms.winner)]) : 'Match in progress';
      doc.text(mw + '   (' + teamName(g, 'A') + ' first: ' + parts.join(', ') + ')', M, H - 20);
    }
  }

  function drawMHSAABlock(doc, g, set, R, t, x, y, w, nCols) {
    var hA = 24, hB = 16, rh = 34;
    doc.setLineWidth(1); doc.rect(x, y, w, hA + hB + 6 * rh);
    // row A: timeouts + libero
    norm(doc, 6); doc.text('Time-Outs', x + 40, y + 7, { align: 'center' });
    doc.setLineWidth(0.5); doc.line(x, y + 9, x + 80, y + 9); doc.line(x + 80, y, x + 80, y + hA);
    for (var i = 0; i < 2; i++) {
      doc.rect(x + i * 40, y + 9, 40, hA - 9);
      var tv = R ? R.T[t].timeouts[i] : null;
      if (tv) { bold(doc, 8); doc.text(tv[0] + '-' + tv[1], x + i * 40 + 20, y + 20, { align: 'center' }); }
    }
    norm(doc, 7); doc.text('Libero #:', x + w - 60, y + 18);
    if (g.settings.libero && set.libero[t]) { bold(doc, 9); doc.text(set.libero[t], x + w - 28, y + 18); }
    doc.setLineWidth(0.5); doc.line(x + w - 30, y + 20, x + w - 6, y + 20);
    doc.line(x, y + hA, x + w, y + hA);
    // row B: headers
    var c1 = 24, c2 = 44, yb = y + hA;
    norm(doc, 5); doc.text('Serve', x + 2, yb + 6); doc.text('Order', x + 2, yb + 12);
    norm(doc, 6.5); doc.text('Player', x + c1 + 2, yb + 7); doc.text('No.', x + c1 + 2, yb + 14);
    doc.text('Team:', x + c1 + c2 + 4, yb + 11);
    bold(doc, 9); doc.text(nameOf(g, t), x + c1 + c2 + 28, yb + 11);
    doc.line(x + c1, yb, x + c1, y + hA + hB + 6 * rh); doc.line(x + c1 + c2, yb, x + c1 + c2, y + hA + hB + 6 * rh);
    doc.line(x, yb + hB, x + w, yb + hB);
    // rows
    var cx = x + c1 + c2, cwid = (w - c1 - c2) / nCols, yr = yb + hB;
    for (var k = 0; k < 6; k++) {
      var ry = yr + k * rh;
      doc.setLineWidth(0.5); if (k) doc.line(x, ry, x + w, ry);
      doc.setLineWidth(0.25); doc.setLineDashPattern([1, 1.5], 0);
      for (var c = 1; c < nCols; c++) doc.line(cx + c * cwid, ry, cx + c * cwid, ry + rh);
      doc.line(x + c1 + 2, ry + rh / 2, x + c1 + c2 - 2, ry + rh / 2);
      doc.setLineDashPattern([], 0);
      bold(doc, 12); doc.text(String(k + 1), x + c1 / 2, ry + rh / 2 + 4, { align: 'center' });
      var starter = set.lineup[t][k] || '';
      bold(doc, 11); doc.text(starter, x + c1 + 6, ry + 12);
      if (starter && set.captain && set.captain[t] === starter) { norm(doc, 7); doc.text('c', x + c1 + 7 + doc.getTextWidth(starter) * 11 / 7 + 1, ry + 9); }
      if (R) {
        var subs = R.T[t].subs.filter(function (s) { return s.slot === k; }).map(function (s) { return s.inn; });
        if (subs.length) { norm(doc, 7); doc.text(subs.join(', ').slice(0, 14), x + c1 + 3, ry + rh - 5); }
        R.T[t].marks[k].forEach(function (m, j) { drawMark(doc, m, cx + j * cwid, ry, cwid, rh); });
      }
    }
    return y + hA + hB + 6 * rh;
  }

  function drawMark(doc, m, x, y, w, h) {
    var mx = x + w / 2, my = y + h / 2;
    if (m.k === 'pt') {
      bold(doc, 9); doc.text(String(m.n), mx, my + 3, { align: 'center' });
      if (m.boxed) { doc.setLineWidth(0.7); doc.rect(x + 1.5, my - 6.5, w - 3, 12); }
      if (m.final) { doc.setLineWidth(0.9); doc.circle(mx, my, Math.min(w, h) / 2 - 0.5); }
      if (m.pen) { norm(doc, 5); doc.text('P', x + 1.5, y + 6); }
      if (m.lib) { doc.setLineWidth(0.5); doc.triangle(x + w - 7, y + 7, x + w - 1.5, y + 7, x + w - 4.25, y + 2.5, 'S'); }
    } else {
      bold(doc, m.k.length > 1 ? 7 : 8.5); doc.text(m.k, mx, my + 3, { align: 'center' });
    }
  }

  /* ================= AAU style: two sets per page ================= */
  function drawAAUHeader(doc, g) {
    var M = 24, I = g.info;
    doc.setLineWidth(1); doc.rect(M, M, 150, 62);
    bold(doc, 13); doc.text('OFFICIAL', M + 75, M + 28, { align: 'center' }); doc.text('SCORE SHEET', M + 75, M + 45, { align: 'center' });
    var fx = M + 156, fw = 396, rh = 12.4, hw = fw / 2;
    function cell(x, y, w, label, value) {
      doc.setLineWidth(0.5); doc.rect(x, y, w, rh);
      norm(doc, 6); doc.text(label, x + 2, y + 8.5);
      if (value) { var lw = doc.getTextWidth(label); norm(doc, 8); doc.text(String(value), x + lw + 8, y + 9); }
    }
    cell(fx, M, fw, 'Name of the Competition', I.competition);
    cell(fx, M + rh, fw, 'City, State', I.city);
    cell(fx, M + 2 * rh, hw, 'Hall', I.site); cell(fx + hw, M + 2 * rh, hw, 'Pool Phase', I.pool);
    cell(fx, M + 3 * rh, hw, 'Division', ''); cell(fx + hw, M + 3 * rh, hw, 'Match N°', I.matchNo);
    cell(fx, M + 4 * rh, hw, 'Category', ''); cell(fx + hw, M + 4 * rh, hw, 'Level', g.blank ? '' : levelLabel(g));
    norm(doc, 6);
    [['Men', 40], ['Women', 80], ['CoEd', 126]].forEach(function (p) { doc.text(p[0], fx + p[1], M + 3 * rh + 8.5); checkbox(doc, fx + p[1] + doc.getTextWidth(p[0]) + 2, M + 3 * rh + 3, I.division === p[0], 6); });
    [['Adult', 40], ['Junior', 80]].forEach(function (p) { doc.text(p[0], fx + p[1], M + 4 * rh + 8.5); checkbox(doc, fx + p[1] + doc.getTextWidth(p[0]) + 2, M + 4 * rh + 3, I.category === p[0], 6); });
  }

  function drawAAUSidebar(doc, g, sanctions, notes) {
    var x = 586, w = 182, y = 24, bottom = 588;
    var ms = matchStatus(g);
    function head(title, yy) { doc.setLineWidth(0.8); doc.rect(x, yy, w, 10); bold(doc, 6.5); doc.text(title, x + w / 2, yy + 7.3, { align: 'center' }); return yy + 10; }
    // match winner
    var yy = head('MATCH WINNER', y);
    norm(doc, 6); doc.text('TEAM', x + 3, yy + 7); doc.text('Sets  W   L', x + w - 3, yy + 7, { align: 'right' });
    ['A', 'B'].forEach(function (t, i) {
      var ry = yy + 9 + i * 11; doc.setLineWidth(0.4); doc.rect(x, ry, w, 11);
      norm(doc, 7.5); doc.text((i ? 'B  ' : 'A  ') + nameOf(g, t), x + 3, ry + 8);
      if (!g.blank) { bold(doc, 8); doc.text(String(ms.wins[t]), x + w - 22, ry + 8, { align: 'center' }); doc.text(String(ms.wins[other(t)]), x + w - 8, ry + 8, { align: 'center' }); }
      if (ms.decided && ms.winner === t) { norm(doc, 6); doc.text('WINNER', x + w - 60, ry + 8); }
    });
    yy += 9 + 22 + 4;
    // set results
    yy = head('SET RESULTS', yy);
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var r = setResult(g, i), ry = yy + i * 11;
      doc.setLineWidth(0.4); doc.rect(x, ry, w, 11);
      norm(doc, 7); doc.text('Set ' + (i + 1), x + 3, ry + 8);
      if (r && r.done) { var wt = r.winner; doc.text('Winning: ' + teamName(g, wt).slice(0, 16), x + 28, ry + 8); bold(doc, 7.5); doc.text((wt === 'A' ? r.a : r.b) + ' : ' + (wt === 'A' ? r.b : r.a), x + w - 4, ry + 8, { align: 'right' }); }
    }
    yy += g.settings.setsTotal * 11 + 4;
    // signatures
    yy = head('SIGNATURES', yy);
    ['Scorer', '1st Referee'].forEach(function (l, i) { var ry = yy + i * 13; doc.setLineWidth(0.4); doc.rect(x, ry, w, 13); norm(doc, 6.5); doc.text(l, x + 3, ry + 9); });
    yy += 26 + 4;
    // officials
    yy = head('OFFICIALS PRINTED NAMES', yy);
    [['1st', g.info.referee], ['2nd', g.info.referee2], ['Scorer', g.info.scorer]].forEach(function (p, i) {
      var ry = yy + i * 11; doc.setLineWidth(0.4); doc.rect(x, ry, w, 11); norm(doc, 6.5); doc.text(p[0], x + 3, ry + 8);
      if (p[1]) { norm(doc, 8); doc.text(p[1], x + 34, ry + 8.3); }
    });
    var ry2 = yy + 33; doc.rect(x, ry2, w, 11); norm(doc, 6.5); doc.text('Work Team', x + 3, ry2 + 8); doc.text('Region', x + w - 50, ry2 + 8);
    yy = ry2 + 15;
    // sanctions
    norm(doc, 5.5); doc.text('W=Warning P=Penalty E=Expulsion D=Disqualification', x, yy + 5); doc.text('#=Player C=Coach/bench', x + w, yy + 5, { align: 'right' });
    yy += 8;
    doc.setLineWidth(0.8); doc.rect(x, yy, w, 11); bold(doc, 6); doc.text('IMPROPER REQUEST', x + 3, yy + 7.5); doc.text('TEAM A  :  TEAM B', x + w - 3, yy + 7.5, { align: 'right' });
    yy += 13;
    var cols = [['W', 14], ['P', 14], ['E', 14], ['D', 14], ['TEAM', 30], ['SET', 22], ['SCORE', 0]];
    var cxs = [], cxx = x;
    cols.forEach(function (c) { cxs.push(cxx); cxx += c[1] || (x + w - cxx); });
    doc.setLineWidth(0.5); doc.rect(x, yy, w, 10);
    bold(doc, 5.5); cols.forEach(function (c, i) { doc.text(c[0], cxs[i] + 2, yy + 7); });
    yy += 10;
    var nRows = 7;
    for (var s = 0; s < nRows; s++) {
      var sy = yy + s * 11; doc.setLineWidth(0.35); doc.rect(x, sy, w, 11);
      cxs.slice(1).forEach(function (cx) { doc.line(cx, sy, cx, sy + 11); });
      var sn = sanctions[s];
      if (sn) {
        bold(doc, 7.5);
        var col = sn.kind === 'W' ? 0 : 1;
        doc.text(String(sn.who || 'C'), cxs[col] + 7, sy + 8, { align: 'center' });
        doc.text(sn.team, cxs[4] + 15, sy + 8, { align: 'center' });
        doc.text(String(sn.set), cxs[5] + 11, sy + 8, { align: 'center' });
        doc.text(sn.score, cxs[6] + (x + w - cxs[6]) / 2, sy + 8, { align: 'center' });
      }
    }
    yy += nRows * 11 + 4;
    // remarks
    yy = head('REMARKS', yy);
    doc.setLineWidth(0.5); doc.rect(x, yy, w, bottom - yy);
    norm(doc, 6.3);
    var ly = yy + 8;
    var lines = [];
    if (!g.blank) lines.push('Team A = ' + teamName(g, 'A') + ' (home), Team B = ' + teamName(g, 'B'));
    notes.forEach(function (n) { lines = lines.concat(doc.splitTextToSize(n, w - 6)); });
    lines.forEach(function (ln) { if (ly < bottom - 3) { doc.text(ln, x + 3, ly); ly += 8; } });
  }

  function drawAAUSet(doc, g, si, x, y, w) {
    var d = setData(g, si), set = d.set, R = d.R;
    var mid = 86, hw = (w - mid) / 2;
    var order = [set.left || 'A', other(set.left || 'A')];
    bold(doc, 9); doc.text('Set ' + (si + 1), x + w, y + 8, { align: 'right' });
    norm(doc, 6.5);
    if (!g.blank) doc.text('to ' + (g.settings.points[si] || 25), x + w - 30, y + 8, { align: 'right' });
    var top = y + 11;
    drawAAUHalf(doc, g, set, R, order[0], x, top, hw, 'Start', set.start ? fmtTime(set.start) : '');
    drawAAUHalf(doc, g, set, R, order[1], x + hw + mid, top, hw, 'End', R && R.endTs ? fmtTime(R.endTs) : '');
    // middle points
    var mx = x + hw, py = top + 13;
    doc.setLineWidth(0.8); doc.rect(mx, top, mid, 176);
    bold(doc, 7.5); doc.text('Points', mx + mid / 4, py + 8, { align: 'center' }); doc.text('Points', mx + mid * 3 / 4, py + 8, { align: 'center' });
    order.forEach(function (t, i) {
      var pts = R ? R.score[t] : 0;
      runningGrid(doc, mx + i * mid / 2 + 1, py + 11, 3, 12, (mid / 2 - 2) / 3, 9.6, Math.min(pts, 36), R && R.done && R.winner === t, 5.6);
    });
    var ty = py + 11 + 12 * 9.6 + 4;
    bold(doc, 6.5); doc.text('Time Outs', mx + mid / 4, ty + 5, { align: 'center' }); doc.text('Time Outs', mx + mid * 3 / 4, ty + 5, { align: 'center' });
    order.forEach(function (t, i) {
      for (var k = 0; k < 2; k++) {
        var bx = mx + i * mid / 2 + 3, by = ty + 8 + k * 11;
        doc.setLineWidth(0.4); doc.rect(bx, by, mid / 2 - 6, 10);
        var tv = R ? R.T[t].timeouts[k] : null;
        bold(doc, 7); doc.text(tv ? tv[0] + ' : ' + tv[1] : ':', bx + (mid / 2 - 6) / 2, by + 7.5, { align: 'center' });
      }
    });
  }

  function drawAAUHalf(doc, g, set, R, t, x, y, w, timeLabel, timeVal) {
    var lab = 11, cw = (w - lab) / 6;
    // header row
    doc.setLineWidth(0.6); doc.rect(x, y, w, 13);
    norm(doc, 5.8);
    var cap = set.captain && set.captain[t];
    doc.text('Captain', x + 2, y + 8.5); bold(doc, 8); doc.text(cap ? '#' + cap : '', x + 23, y + 9);
    norm(doc, 5.8); doc.text(timeLabel, x + 41, y + 8.5); norm(doc, 6.5); doc.text(timeVal, x + 52, y + 9);
    norm(doc, 5.8); doc.text('Team', x + 84, y + 8.5); bold(doc, 8); doc.text(nameOf(g, t).slice(0, 18), x + 99, y + 9);
    norm(doc, 5.8); doc.text('Libero#', x + w - 60, y + 8.5); bold(doc, 8); doc.text(g.settings.libero && set.libero[t] ? set.libero[t] : '', x + w - 38, y + 9);
    // A/B and S/R circles
    var cx0 = x + w - 20;
    [[t, 0], [set.firstServe === t ? 'S' : (set.firstServe ? 'R' : ''), 1]].forEach(function (p) {
      doc.setLineWidth(0.5); doc.circle(cx0 + p[1] * 10, y + 6.5, 4.3); bold(doc, 6.5); doc.text(p[0], cx0 + p[1] * 10, y + 8.8, { align: 'center' });
    });
    var yy = y + 13;
    // roman header
    doc.setLineWidth(0.5); doc.rect(x, yy, w, 11);
    for (var k = 0; k < 6; k++) { bold(doc, 7.5); doc.text(ROMAN[k], x + lab + k * cw + cw / 2, yy + 8, { align: 'center' }); }
    yy += 11;
    var gridTop = yy, orderH = 17, subH = 17, subRows = 4, rndH = 17, rndRows = 3;
    // order row
    doc.rect(x, yy, w, orderH);
    for (var k2 = 0; k2 < 6; k2++) {
      var n = set.lineup[t][k2] || '';
      bold(doc, 11); doc.text(n, x + lab + k2 * cw + cw / 2, yy + 12, { align: 'center' });
      if (n && cap === n) { doc.setLineWidth(0.6); doc.circle(x + lab + k2 * cw + cw / 2, yy + orderH / 2, 7.5); }
    }
    yy += orderH;
    // score at substitution
    var subsBy = [[], [], [], [], [], []];
    if (R) R.T[t].subs.forEach(function (s) { subsBy[s.slot].push(s); });
    for (var r = 0; r < subRows; r++) {
      doc.setLineWidth(0.35); doc.rect(x, yy + r * subH, w, subH);
      for (var k3 = 0; k3 < 6; k3++) {
        var bx = x + lab + k3 * cw, s = subsBy[k3][r];
        doc.setLineWidth(0.25); doc.line(bx + cw * 0.42, yy + r * subH + 2, bx + cw * 0.42, yy + (r + 1) * subH - 2);
        if (s) {
          bold(doc, 8); doc.text(s.inn + (s.injury ? '*' : ''), bx + cw * 0.21, yy + r * subH + 11.5, { align: 'center' });
          norm(doc, 7); doc.text(s.at[0] + ':' + s.at[1], bx + cw * 0.71, yy + r * subH + 11.5, { align: 'center' });
        } else { norm(doc, 7); doc.setTextColor(150); doc.text(':', bx + cw * 0.71, yy + r * subH + 11.5, { align: 'center' }); doc.setTextColor(20); }
      }
    }
    yy += subRows * subH;
    // service rounds
    var turnsBy = [[], [], [], [], [], []];
    if (R) R.T[t].turns.forEach(function (tr) { if (tr.end !== null) turnsBy[tr.slot].push(tr); });
    for (var r2 = 0; r2 < rndRows; r2++) {
      doc.setLineWidth(0.35); doc.rect(x, yy + r2 * rndH, w, rndH);
      for (var k4 = 0; k4 < 6; k4++) {
        var bx2 = x + lab + k4 * cw;
        doc.setLineWidth(0.25); doc.line(bx2 + cw / 2, yy + r2 * rndH, bx2 + cw / 2, yy + (r2 + 1) * rndH);
        [r2, r2 + 3].forEach(function (ri, side) {
          var cxx = bx2 + side * cw / 2;
          norm(doc, 4.5); doc.setTextColor(110); doc.text(String(ri + 1), cxx + 1.5, yy + r2 * rndH + 5); doc.setTextColor(20);
          var tr = turnsBy[k4][ri];
          if (tr) {
            bold(doc, 8); doc.text(String(tr.end), cxx + cw / 4 + 1, yy + r2 * rndH + 12, { align: 'center' });
            if (tr.final) { doc.setLineWidth(0.7); doc.circle(cxx + cw / 4 + 1, yy + r2 * rndH + rndH / 2 + 0.5, 6.5); }
          }
        });
      }
    }
    yy += rndRows * rndH;
    // column lines + side labels
    doc.setLineWidth(0.5);
    for (var c = 0; c <= 6; c++) doc.line(x + lab + c * cw, gridTop - 11, x + lab + c * cw, yy);
    norm(doc, 5.5);
    doc.text('Order', x + 7.5, gridTop + orderH - 2, { angle: 90 });
    doc.text('Score at Substitution', x + 7.5, gridTop + orderH + subRows * subH - 4, { angle: 90 });
    doc.text('Service Rounds', x + 7.5, yy - 4, { angle: 90 });
    // substitutions strip
    doc.setLineWidth(0.5); doc.rect(x, yy, w, 12);
    norm(doc, 6.3); doc.text('Substitutions', x + 3, yy + 8.5);
    var n2 = g.settings.subLimit || 15, used = R ? R.T[t].subCount : 0, st = (w - 52) / n2;
    for (var i = 1; i <= n2; i++) {
      var nx = x + 50 + (i - 1) * st;
      norm(doc, 6.3); doc.text(String(i), nx + st / 2, yy + 8.5, { align: 'center' });
      if (i <= used) { doc.setLineWidth(0.7); doc.line(nx + 0.5, yy + 10, nx + st - 0.5, yy + 3); }
    }
    return yy + 12;
  }

  function drawAAUPage(doc, g, pair) {
    doc.setTextColor(20); doc.setDrawColor(30);
    drawAAUHeader(doc, g);
    var sanctions = [], notes = [];
    pair.forEach(function (si) {
      var d = setData(g, si);
      if (d.R) {
        sanctions = sanctions.concat(d.R.sanctions);
        d.R.notes.forEach(function (n) { notes.push('Set ' + (si + 1) + ', team ' + n.team + ': ' + n.text); });
      }
    });
    drawAAUSidebar(doc, g, sanctions, notes);
    pair.forEach(function (si, i) { drawAAUSet(doc, g, si, 24, 92 + i * 250, 556); });
  }

  /* ================= PDF entry ================= */
  function pageSets(g) {
    var ms = matchStatus(g), out = [];
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var played = g.sets[i] && g.sets[i].started;
      if (!played && g.settings.format === 'bestof' && ms.decided && !g.blank) continue; // match over, set not needed
      out.push(i);
    }
    return out;
  }
  function makePDF(jsPDF, g) {
    var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    var list = pageSets(g);
    if ((g.settings.style || 'mhsaa') === 'aau') {
      for (var p = 0; p < list.length; p += 2) {
        if (p > 0) doc.addPage('letter', 'landscape');
        drawAAUPage(doc, g, list.slice(p, p + 2));
      }
    } else {
      list.forEach(function (si, n) {
        if (n > 0) doc.addPage('letter', 'landscape');
        drawMHSAA(doc, g, si, n === list.length - 1);
      });
    }
    return doc;
  }
  function blankGame(style) {
    var g = newGame(); g.blank = true; g.info.date = ''; g.info.level = '';
    g.settings.style = style;
    if (style === 'aau') { g.settings.subLimit = 15; g.settings.libero = true; }
    else { g.settings.libero = true; }
    return g;
  }
  function pdfName(g) {
    var s = (teamName(g, 'A') + ' vs ' + teamName(g, 'B') + ' ' + (g.info.date || '')).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
    return (s || 'scoresheet') + '.pdf';
  }

  return {
    levelLabel: levelLabel, ROMAN: ROMAN, LEVELS: LEVELS, PRESETS: PRESETS, STYLES: STYLES, COLORS: COLORS, color: color, presetFor: presetFor, applyPreset: applyPreset, pointsFor: pointsFor,
    other: other, teamName: teamName, newGame: newGame, newSet: newSet, replay: replay, onCourt: onCourt, checkSub: checkSub,
    setResult: setResult, matchStatus: matchStatus, formatLabel: formatLabel, makePDF: makePDF, blankGame: blankGame, pdfName: pdfName, fmtDate: fmtDate, fmtTime: fmtTime
  };
})();
if (typeof module !== 'undefined') module.exports = SB;
