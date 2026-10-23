/* ---------- Digital Volleyball Scorebook UI (retail 1.0) ---------- */
(function () {
  var KEY = 'dvScorebook.v1', PREF_KEY = 'dvScorebook.prefs';
  var VERSION = '1.1', SELLER = 'Mike Toth', SUPPORT = 'oaklandballistics@gmail.com';
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var db = { games: {} };
  var prefs = { showLog: true };
  var ui = { view: 'home', gameId: null, modal: null, edit: false, draft: null, kp: null, lineupErr: null };
  var lastTap = 0;
  var O = SB.other;

  /* ---------- storage ---------- */
  function normalize(g) {
    g.settings = g.settings || {};
    if (!g.settings.format) g.settings.format = 'all';
    if (!g.settings.setsTotal) g.settings.setsTotal = 3;
    if (!g.settings.points) g.settings.points = SB.pointsFor(g.settings.setsTotal);
    if (!g.info.colorA) g.info.colorA = 'royal';
    if (!g.info.colorB) g.info.colorB = 'orange';
    if (!g.settings.style) g.settings.style = 'mhsaa';
    (g.sets || []).forEach(function (s) { if (!s.captain) s.captain = { A: '', B: '' }; });
    return g;
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw) || db; } catch (e) { }
    if (!db.games) db.games = {};
    Object.keys(db.games).forEach(function (k) { normalize(db.games[k]); });
    try { var p = localStorage.getItem(PREF_KEY); if (p) prefs = Object.assign(prefs, JSON.parse(p)); } catch (e) { }
  }
  function save() {
    var g = game(); if (g) g.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Could not autosave on this device. Use Backup file from the saved games list.'); }
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { } }
  function game() { return ui.gameId ? db.games[ui.gameId] : null; }
  function curSetIdx(g) { return g.sets.length - 1; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tn(g, t) { return SB.teamName(g, t); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- team colors ---------- */
  function applyColors(g) {
    var r = document.documentElement.style;
    var a = SB.color(g ? g.info.colorA : 'royal'), b = SB.color(g ? g.info.colorB : 'orange');
    r.setProperty('--cA', a.hex); r.setProperty('--onA', a.light ? '#1b1b1b' : '#ffffff'); r.setProperty('--ctA', a.text || a.hex);
    r.setProperty('--cB', b.hex); r.setProperty('--onB', b.light ? '#1b1b1b' : '#ffffff'); r.setProperty('--ctB', b.text || b.hex);
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
  var LEFT_LAYOUT = [[4, 3], [5, 2], [0, 1]];   // [back, front] position indexes (0 = pos 1)
  var RIGHT_LAYOUT = [[1, 0], [2, 5], [3, 4]];  // [front, back]
  function courtTiles(R, t, side, opts) {
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
        if (opts.select && !sel) cls += ' dim';
        var tag = sel ? 'button' : 'div';
        var attrs = sel ? ' data-act="' + opts.act + '" data-pos="' + p + '" data-num="' + esc(c.num) + '"' : '';
        h += '<' + tag + ' class="' + cls + '"' + attrs + '><span class="num">' + esc(c.num || '–') + (c.libero ? '<small>L</small>' : '') + '</span>' +
          '<span class="pos">' + (serving ? 'serving' : 'pos ' + (p + 1)) + '</span></' + tag + '>';
      });
    });
    return h + '</div>';
  }
  function netEl(cls) { return '<div class="net' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><span>NET</span></div>'; }

  /* ---------- keypad ---------- */
  function keypadKeys(last) {
    var k = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) { k += '<button type="button" class="key" data-act="key" data-key="' + d + '">' + d + '</button>'; });
    k += '<button type="button" class="key fn" data-act="key" data-key="clr">Clear</button>';
    k += '<button type="button" class="key" data-act="key" data-key="0">0</button>';
    k += last;
    return k;
  }
  // A box just tapped shows its old number faded; the first digit replaces it.
  function freshKey(val, key, fresh) {
    if (fresh && /^[0-9]$/.test(key)) return key;
    if (fresh && key === 'back') return '';
    return pressKey(val, key);
  }
  function pressKey(val, key) {
    val = String(val || '');
    if (key === 'clr') return '';
    if (key === 'back') return val.slice(0, -1);
    if (val.length >= 2) val = '';
    return val + key;
  }
  function kpOrder(g) {
    var o = [];
    ['A', 'B'].forEach(function (t) {
      for (var k = 0; k < 6; k++) o.push({ team: t, k: k });
      if (g.settings.libero) o.push({ team: t, k: 'lib' });
    });
    return o;
  }
  function kpGet(set, kp) { return kp.k === 'lib' ? set.libero[kp.team] : set.lineup[kp.team][kp.k]; }
  function kpSet(set, kp, v) { if (kp.k === 'lib') set.libero[kp.team] = v; else set.lineup[kp.team][kp.k] = v; }
  function positionKeypad() {
    var kp = document.getElementById('kp'), box = document.querySelector('.nbox.active');
    if (!kp || !box) return;
    var r = box.getBoundingClientRect(), w = kp.offsetWidth, h = kp.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = r.right + 10, top = r.top - 10;
    if (left + w > vw - 8) left = r.left - w - 10;
    if (left < 8) { left = Math.min(Math.max(8, r.left), vw - w - 8); top = r.bottom + 8; if (top + h > vh - 8) top = r.top - h - 8; }
    top = Math.min(Math.max(8, top), vh - h - 8);
    kp.style.left = left + 'px'; kp.style.top = top + 'px';
  }

  /* ---------- log text ---------- */
  function teamSpan(g, t) { return '<span class="tcol team-' + t + '">' + esc(tn(g, t)) + '</span>'; }
  function describe(g, e) {
    var ev = e.ev, t = ev.team, out = { what: '', meta: '' };
    var tm = function () { return teamSpan(g, t); };
    switch (ev.t) {
      case 'pt':
        out.what = 'Point ' + tm() + (e.sideout ? ' · side out' : '') + (e.setPoint ? ' · set point' : '');
        if (e.server) out.meta = '#' + esc(e.server.num) + ' serving · ' + SB.ROMAN[e.server.slot];
        break;
      case 'to': out.what = 'Timeout ' + tm(); out.meta = SB.fmtTime(ev.ts); break;
      case 'sub': out.what = 'Sub ' + tm() + ' #' + esc(ev.inn) + ' in for #' + esc(ev.out) + (ev.injury ? ' (injury)' : ''); out.meta = e.slot != null ? 'spot ' + SB.ROMAN[e.slot] : ''; break;
      case 'rot': out.what = 'Rotation corrected ' + tm(); out.meta = ev.dir > 0 ? 'forward one' : 'back one'; break;
      case 'lib': out.what = 'Libero ' + ev.action + ' ' + tm() + (ev.action === 'in' && e.replaced ? ' for #' + esc(e.replaced) : ''); out.meta = SB.fmtTime(ev.ts); break;
      case 'rp': out.what = 'Replay'; out.meta = SB.fmtTime(ev.ts); break;
      case 'pen':
        out.what = 'Penalty point ' + tm() + (e.sideout ? ' · side out' : '') + (e.setPoint ? ' · set point' : '');
        out.meta = 'P1';
        break;
      case 'card':
        out.what = (ev.color === 'red' ? 'Red' : 'Yellow') + ' card ' + tm() + ' ' + (ev.who ? '#' + esc(ev.who) : 'coach/bench') +
          (ev.color === 'red' ? ' · point ' + teamSpan(g, O(t)) : '');
        out.meta = SB.fmtTime(ev.ts);
        break;
    }
    if (e.ignored) out.meta = 'not applied';
    return out;
  }
  function logRow(g, e, opts) {
    var d = describe(g, e);
    var sc = e.score ? e.score.A + '–' + e.score.B : '';
    var tag = opts && opts.button ? 'button' : 'div';
    var attrs = opts && opts.button ? ' type="button" data-act="logsel" data-idx="' + e.idx + '"' : '';
    return '<' + tag + ' class="logrow' + (opts && opts.latest ? ' latest' : '') + (opts && opts.selected ? ' sel' : '') + (e.ignored ? ' ignored' : '') + '"' + attrs + '>' +
      '<b class="lsc">' + sc + '</b><span class="lwhat">' + d.what + '</span><span class="lmeta">' + d.meta + '</span></' + tag + '>';
  }

  /* ---------- views ---------- */
  function vHome() {
    var list = Object.keys(db.games).map(function (k) { return db.games[k]; }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    var h = '<div class="page"><header class="pagehead"><div><h1>Digital Volleyball Scorebook</h1><p class="sub">Keep the official game book on a laptop or Chromebook. Works offline. Prints school and club scoresheets.</p></div>' +
      '<div class="headbtns"><button class="btn" data-act="about">About and help</button><button class="btn primary big" data-act="new">New match</button></div></header>';
    if (IS_IOS) h += '<div class="notice warn"><strong>This device isn\'t supported.</strong> Digital Volleyball Scorebook is built for Chrome or Edge on a Windows, Mac, or Chromebook computer. On iPad and iPhone, saving and PDFs may not work.</div>';
    h += '<div class="notice"><strong>Your games are saved in this browser on this computer.</strong> Keep this file in one place, open it in the same browser each time, and use <em>Back up all games</em> after each match.</div>';
    h += '<section><h2>Saved games</h2>';
    if (!list.length) {
      h += '<div class="empty"><p><strong>No games yet.</strong> Start a new match and it will appear here. Every tap saves automatically, so you can close the app and pick up where you left off.</p><div class="actions left"><button class="btn" data-act="sample">Load a sample match</button></div></div>';
    } else {
      h += '<ul class="games">';
      list.forEach(function (g) {
        var parts = [];
        for (var i = 0; i < g.settings.setsTotal; i++) { var r = SB.setResult(g, i); if (r) parts.push(r.a + '–' + r.b); }
        var status = g.status === 'done' ? '<span class="chip chip-ok">Final</span>' : '<span class="chip chip-live">In progress</span>';
        h += '<li class="gamerow"><div class="ginfo"><div class="gtitle">' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + ' ' + status + '</div>' +
          '<div class="gmeta">' + esc([SB.fmtDate(g.info.date), SB.levelLabel(g), g.info.site].filter(Boolean).join(' · ')) + (parts.length ? ' · Sets ' + parts.join(', ') : '') + '</div></div>' +
          '<div class="gact"><button class="btn" data-act="open" data-id="' + g.id + '">Open</button>' +
          '<button class="btn" data-act="pdf" data-id="' + g.id + '">Save PDF</button>' +
          '<button class="btn" data-act="print" data-id="' + g.id + '">Print</button>' +
          '<button class="btn" data-act="backup" data-id="' + g.id + '">Backup file</button>' +
          '<button class="btn danger" data-act="askdel" data-id="' + g.id + '">Delete</button></div></li>';
      });
      h += '</ul>';
    }
    h += '</section><section class="restore"><h2>Backups</h2><p class="sub">A backup file holds your saved games. Use it to move games to another computer or browser, or to keep a copy if browser data gets cleared.</p>' +
      '<div class="actions left">' + (list.length ? '<button class="btn" data-act="backupall">Back up all games</button>' : '') +
      '<label class="btn file">Restore from a backup file<input type="file" id="importFile" accept=".json,application/json"></label></div></section>';
    h += '<section class="restore"><h2>Blank scoresheet</h2><p class="sub">A printable sheet with nothing filled in, for a paper backup.</p><div class="actions left"><button class="btn" data-act="blankpdf" data-style="mhsaa">Blank school sheet</button><button class="btn" data-act="blankpdf" data-style="aau">Blank club sheet</button></div></section></div>';
    return h;
  }

  function swatches(g, t) {
    var cur = t === 'A' ? g.info.colorA : g.info.colorB;
    return '<div class="swatches" role="radiogroup" aria-label="' + (t === 'A' ? 'Home' : 'Away') + ' color">' + SB.COLORS.map(function (c) {
      return '<button type="button" class="sw' + (c.id === cur ? ' on' : '') + '" role="radio" aria-checked="' + (c.id === cur) + '" aria-label="' + c.name + '" title="' + c.name + '" style="--sw:' + c.hex + '" data-act="color" data-team="' + t + '" data-c="' + c.id + '"></button>';
    }).join('') + '</div>';
  }

  function vSetup() {
    if (!ui.draft) ui.draft = ui.edit ? clone(game()) : SB.newGame();
    var g = ui.draft, I = g.info, S = g.settings;
    function f(id, label, val, type, ph) { return '<label class="field"><span>' + label + '</span><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"></label>'; }
    var levelOpts = SB.LEVELS.map(function (grp) {
      return '<optgroup label="' + esc(grp.group) + '">' + grp.items.map(function (it) { return '<option' + (it === I.level ? ' selected' : '') + '>' + esc(it) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var known = SB.presetFor(I.level) !== null || I.level === 'Other';
    if (!known && I.level) levelOpts = '<option selected>' + esc(I.level) + '</option>' + levelOpts;
    var h = '<div class="page narrow"><header class="pagehead"><div><h1>' + (ui.edit ? 'Game info' : 'New match') + '</h1><p class="sub">Team names and officials print at the top of every page.</p></div></header>';
    h += '<form id="setupForm" class="card form">';
    h += '<div class="teamsetup">';
    ['A', 'B'].forEach(function (t) {
      h += '<div class="tsetup team-' + t + '">' + f('f-' + (t === 'A' ? 'home' : 'away'), t === 'A' ? 'Home team' : 'Away team', t === 'A' ? I.home : I.away, 'text', t === 'A' ? 'Your school' : 'Visiting school') +
        '<span class="lbl">Color on the scoring screen</span>' + swatches(g, t) + '</div>';
    });
    h += '</div>';
    h += '<div class="grid3"><label class="field"><span>Level</span><select id="f-level">' + levelOpts + '</select></label>' + f('f-date', 'Date', I.date, 'date') + f('f-site', 'Site', I.site, 'text', 'Gym') + '</div>';
    if (I.level === 'Other' || !known) h += f('f-levelother', 'Level name', I.levelOther || '', 'text', 'Describe the level');
    h += '<div class="grid2"><label class="field"><span>Scoresheet style</span><select id="f-style">' + SB.STYLES.map(function (s) { return '<option value="' + s.id + '"' + (S.style === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></label>' +
      (S.style === 'aau' ? f('f-matchno', 'Match number', I.matchNo, 'text', '') : f('f-gamenum', 'Game number', I.gameNumber, 'text', '')) + '</div>';
    if (S.style === 'aau') {
      h += '<div class="grid2">' + f('f-comp', 'Name of the competition', I.competition, 'text', 'Fall Classic') + f('f-city', 'City, state', I.city, 'text', 'City, ST') + '</div>';
      h += '<div class="grid3">' + f('f-pool', 'Pool phase', I.pool, 'text', '') +
        '<label class="field"><span>Division</span><select id="f-div">' + ['', 'Men', 'Women', 'CoEd'].map(function (v) { return '<option value="' + v + '"' + (I.division === v ? ' selected' : '') + '>' + (v || '—') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Category</span><select id="f-cat">' + ['', 'Adult', 'Junior'].map(function (v) { return '<option value="' + v + '"' + (I.category === v ? ' selected' : '') + '>' + (v || '—') + '</option>'; }).join('') + '</select></label></div>';
    }
    h += '<div class="grid3">' + f('f-scorer', 'Scorer', I.scorer, 'text', 'Your name') + f('f-ref', 'First referee', I.referee, 'text', '') + f('f-ref2', 'Second referee', I.referee2 || '', 'text', '') + '</div>';
    h += '<h3>Rules</h3><p class="hint">Filled in from the level. Change anything that differs for this match.</p>';
    h += '<div class="grid3"><label class="field"><span>Match format</span><select id="f-format"><option value="all"' + (S.format === 'all' ? ' selected' : '') + '>Play every set</option><option value="bestof"' + (S.format === 'bestof' ? ' selected' : '') + '>Best of</option></select></label>' +
      '<label class="field"><span>Sets</span><select id="f-sets">' + [3, 5].map(function (n) { return '<option' + (S.setsTotal === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      f('f-winby', 'Win by', S.winBy, 'number') + '</div>';
    h += '<div class="pointsrow">';
    for (var i = 0; i < S.setsTotal; i++) h += f('f-p' + i, 'Set ' + (i + 1) + ' to', S.points[i] || 25, 'number');
    h += '</div>';
    h += '<div class="grid2">' + f('f-to', 'Timeouts per set', S.timeouts, 'number') + f('f-subs', 'Subs per set', S.subLimit, 'number') + '</div>';
    h += '<label class="check"><input type="checkbox" id="f-lib"' + (S.libero ? ' checked' : '') + '> Use a libero</label>';
    h += '<p class="hint">' + esc(SB.formatLabel(S)) + '. Rally scoring, no point cap.</p>';
    h += '<div class="actions"><button type="button" class="btn" data-act="' + (ui.edit ? 'back-live' : 'home') + '">Cancel</button><button type="submit" class="btn primary">' + (ui.edit ? 'Save' : 'Enter set 1 lineups') + '</button></div>';
    h += '</form></div>';
    return h;
  }

  function vLineup() {
    var g = game(), si = curSetIdx(g), set = g.sets[si];
    var h = '<div class="page"><header class="pagehead"><div><h1>Set ' + (si + 1) + ' lineups</h1><p class="sub">Boxes sit where each serve spot starts on the court, seen from the table. I is back right and serves first. Set to ' + (g.settings.points[si] || 25) + '.</p></div><button class="btn" data-act="menu">Menu</button></header>';
    h += '<form id="lineupForm" class="card form"><div class="lineupcourt">';
    var sides = [[set.left, 'left'], [O(set.left), 'right']];
    sides.forEach(function (pair, idx) {
      var t = pair[0], side = pair[1];
      if (idx === 1) h += netEl('tall');
      h += '<fieldset class="lineup team-' + t + ' ' + side + '"><legend>' + esc(tn(g, t)) + '</legend>';
      var prev = [];
      for (var j = 0; j < si; j++) if (g.sets[j] && g.sets[j].started) prev.push(j);
      if (prev.length) h += '<div class="copyrow"><span>Copy from</span>' + prev.map(function (j) { return '<button type="button" class="btn small" data-act="copy" data-team="' + t + '" data-from="' + j + '">Set ' + (j + 1) + '</button>'; }).join('') + '</div>';
      var layout = side === 'left' ? LEFT_LAYOUT : RIGHT_LAYOUT;
      h += '<div class="cgrid">';
      layout.forEach(function (row) {
        row.forEach(function (k) {
          var num = set.lineup[t][k];
          var act = ui.kp && ui.kp.team === t && ui.kp.k === k, fr = act && ui.kp.fresh && num;
          h += '<div class="cslot"><span class="rn">' + SB.ROMAN[k] + '</span><button type="button" class="nbox' + (act ? ' active' : '') + (fr ? ' fresh' : '') + '" data-act="kp" data-team="' + t + '" data-k="' + k + '" aria-label="' + esc(tn(g, t)) + ' spot ' + SB.ROMAN[k] + '">' + esc(num) +
            (num && set.captain[t] === num ? '<sup class="capmark">C</sup>' : '') + '</button></div>';
        });
      });
      h += '</div><div class="cgrid-foot">' + (side === 'left' ? '<span>back</span><span>front</span>' : '<span>front</span><span>back</span>') + '</div>';
      if (g.settings.libero) {
        var la = ui.kp && ui.kp.team === t && ui.kp.k === 'lib', lfr = la && ui.kp.fresh && set.libero[t];
        h += '<div class="slot lib"><span>Libero</span><button type="button" class="nbox' + (la ? ' active' : '') + (lfr ? ' fresh' : '') + '" data-act="kp" data-team="' + t + '" data-k="lib" aria-label="' + esc(tn(g, t)) + ' libero">' + (set.libero[t] ? esc(set.libero[t]) : '<i>none</i>') + '</button></div>';
      }
      var nums = set.lineup[t].filter(Boolean);
      h += '<div class="caprow"><span>Captain</span>' + (nums.length ? nums.map(function (n) {
        return '<button type="button" class="capchip' + (set.captain[t] === n ? ' on' : '') + '" data-act="captain" data-team="' + t + '" data-num="' + esc(n) + '">' + esc(n) + '</button>';
      }).join('') : '<i>Enter numbers first</i>') + '</div>';
      h += '</fieldset>';
    });
    h += '</div>';
    h += '<div class="seg-row"><span>Serves first</span><div class="seg">' +
      ['A', 'B'].map(function (t) { return '<button type="button" class="' + (set.firstServe === t ? 'on' : '') + '" data-act="firstserve" data-team="' + t + '">' + esc(tn(g, t)) + '</button>'; }).join('') + '</div></div>';
    h += '<div class="seg-row"><span>On the left, seen from the table</span><div class="seg">' +
      ['A', 'B'].map(function (t) { return '<button type="button" class="' + (set.left === t ? 'on' : '') + '" data-act="leftside" data-team="' + t + '">' + esc(tn(g, t)) + '</button>'; }).join('') + '</div></div>';
    h += '<p class="err"' + (ui.lineupErr ? '' : ' hidden') + '>' + esc(ui.lineupErr || '') + '</p>';
    h += '<div class="actions">' + (si > 0 ? '<button type="button" class="btn" data-act="back-prevset">Back to set ' + si + '</button>' : '<button type="button" class="btn" data-act="home">Saved games</button>') +
      '<button type="submit" class="btn primary">Check lineups</button></div></form></div>';
    if (ui.kp) {
      var order = kpOrder(g), pos = -1;
      order.forEach(function (o, i) { if (o.team === ui.kp.team && o.k === ui.kp.k) pos = i; });
      var isLast = pos === order.length - 1;
      h += '<div class="keypad pop team-' + ui.kp.team + '" id="kp" role="dialog" aria-label="Number keypad"><div class="kphead"><span>' + esc(tn(g, ui.kp.team)) + ' · ' + (ui.kp.k === 'lib' ? 'Libero' : 'Spot ' + SB.ROMAN[ui.kp.k]) + '</span><button type="button" class="kpclose" data-act="kpclose" aria-label="Close keypad">✕</button></div>' +
        '<div class="keys">' + keypadKeys('<button type="button" class="key fn next" data-act="key" data-key="next">' + (isLast ? 'Done' : 'Next') + '</button>') + '</div></div>';
    }
    return h;
  }

  function teamPanel(g, R, t, side) {
    var tm = R.T[t], S = g.settings, serving = R.serving === t && !R.done;
    var h = '<section class="team team-' + t + ' ' + side + (serving ? ' is-serving' : '') + '">';
    h += '<div class="thead"><span class="tname">' + esc(tn(g, t)) + '</span><span class="sbadge">' + (serving ? 'Serving' : 'Receiving') + '</span></div>';
    h += '<div class="score" aria-live="polite">' + R.score[t] + '</div>';
    h += courtTiles(R, t, side);
    h += '<button class="point" data-act="point" data-team="' + t + '"' + (R.done ? ' disabled' : '') + '>Point ' + esc(tn(g, t)) + '</button>';
    h += '<div class="minor">';
    h += '<button class="btn" data-act="to" data-team="' + t + '">Timeout <b>' + tm.timeouts.length + '/' + S.timeouts + '</b></button>';
    h += '<button class="btn" data-act="sub" data-team="' + t + '">Sub <b>' + tm.subCount + '/' + S.subLimit + '</b></button>';
    h += '<button class="btn" data-act="rotate" data-team="' + t + '"' + (R.done ? ' disabled' : '') + '>Rotate</button>';
    if (S.libero && tm.lib.num) h += '<button class="btn" data-act="libero" data-team="' + t + '">Libero ' + (tm.lib.slot !== null ? 'out' : 'in') + '</button>';
    h += '</div></section>';
    return h;
  }

  function liveLog(g, si, R) {
    var rows = R.log.filter(function (e) { return !e.ignored; }).slice(-3).reverse();
    var h = '<div class="livelog">';
    if (!rows.length) h += '<div class="logrow latest"><b class="lsc">0–0</b><span class="lwhat">Set ' + (si + 1) + ' started · ' + teamSpan(g, g.sets[si].firstServe) + ' serves first</span><span class="lmeta"></span></div>';
    rows.forEach(function (e, i) { h += logRow(g, e, { latest: i === 0 }); });
    h += '<button class="btn small fulllog" data-act="log">Full log</button></div>';
    return h;
  }

  function vLive() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], R = SB.replay(g, si);
    var L = set.left, Rt = O(L);
    var chips = '';
    for (var i = 0; i < g.settings.setsTotal; i++) {
      var r = SB.setResult(g, i);
      if (!r && i > si) continue;
      chips += '<span class="setchip' + (i === si ? ' cur' : '') + '">S' + (i + 1) + ' ' + (r ? r.a + '–' + r.b : '—') + '</span>';
    }
    var h = '<div class="live' + (prefs.showLog ? ' with-log' : '') + '">';
    h += '<header class="livebar"><div class="lb-left"><strong>Set ' + (si + 1) + ' of ' + g.settings.setsTotal + '</strong><span class="to-target">to ' + R.target + '</span></div><div class="chips">' + chips + '</div>' +
      '<button class="btn" data-act="togglelog">' + (prefs.showLog ? 'Hide log' : 'Show log') + '</button><button class="btn" data-act="menu">Menu</button></header>';
    if (prefs.showLog) h += liveLog(g, si, R);
    h += '<main class="floor">' + teamPanel(g, R, L, 'left') + netEl() + teamPanel(g, R, Rt, 'right');
    if (R.done) {
      var ms = SB.matchStatus(g);
      var last = ms.decided || si === g.settings.setsTotal - 1;
      h += '<div class="setover"><div class="card"><h2>Set ' + (si + 1) + ' goes to ' + esc(tn(g, R.winner)) + '</h2><p class="bigscore">' + R.score[R.winner] + '–' + R.score[O(R.winner)] + '</p>' +
        (ms.decided && g.settings.format === 'bestof' ? '<p class="sub">' + esc(tn(g, ms.winner)) + ' wins the match ' + ms.wins[ms.winner] + '–' + ms.wins[O(ms.winner)] + '.</p>' : '') +
        '<div class="actions"><button class="btn" data-act="undo">Undo last point</button><button class="btn primary" data-act="' + (last ? 'finish' : 'nextset') + '">' + (last ? 'Finish match' : 'Set ' + (si + 2) + ' lineups') + '</button></div></div></div>';
    }
    h += '</main>';
    h += '<footer class="livefoot"><div class="fixes">' +
      (prefs.showLog ? '' : '<button class="btn" data-act="log">Game log</button>') +
      '<button class="btn" data-act="more">More</button>' +
      '<button class="btn" data-act="check">Lineup check</button>' +
      '<button class="btn" data-act="editlu">Edit lineup</button>' +
      '<button class="btn strong" data-act="undo">Undo</button></div></footer>';
    h += '</div>';
    return h;
  }

  function vSummary() {
    var g = game(), ms = SB.matchStatus(g);
    var h = '<div class="page narrow"><header class="pagehead"><div><h1>' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + '</h1><p class="sub">' + esc([SB.fmtDate(g.info.date), SB.levelLabel(g), g.info.site].filter(Boolean).join(' · ')) + '</p></div></header>';
    var cols = [];
    for (var i = 0; i < g.settings.setsTotal; i++) if (g.sets[i] && g.sets[i].started) cols.push(i);
    h += '<div class="card">';
    if (ms.decided && ms.winner !== 'tie') h += '<p class="winner">' + esc(tn(g, ms.winner)) + ' wins the match, ' + ms.wins[ms.winner] + '–' + ms.wins[O(ms.winner)] + '</p>';
    h += '<div class="tablewrap"><table class="results"><thead><tr><th></th>';
    cols.forEach(function (i) { h += '<th>Set ' + (i + 1) + '</th>'; });
    h += '<th>Sets won</th></tr></thead><tbody>';
    ['A', 'B'].forEach(function (t) {
      h += '<tr><th>' + esc(tn(g, t)) + '</th>';
      cols.forEach(function (i) {
        var r = SB.setResult(g, i);
        h += '<td class="' + (r.done && r.winner === t ? 'won' : '') + '">' + (t === 'A' ? r.a : r.b) + '</td>';
      });
      h += '<td><b>' + ms.wins[t] + '</b></td></tr>';
    });
    h += '</tbody></table></div><div class="actions"><button class="btn" data-act="editinfo">Game info</button><button class="btn" data-act="reopen">Back to scoring</button><button class="btn" data-act="print">Print</button><button class="btn" data-act="pdf">Save PDF</button></div></div>';
    h += '<div class="card nextmatch"><div><h2>Next match</h2><p class="sub">Keeps the date, site, scorer, referee, level, and rules. Enter the new teams.</p></div><button class="btn primary big" data-act="newmatch">Start new match</button></div>';
    h += '<div class="actions left"><button class="btn" data-act="home">Saved games</button></div></div>';
    return h;
  }

  /* ---------- modals ---------- */
  function mWrap(inner, cls) { return '<div class="scrim" data-act="scrim"><div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + inner + '</div></div>'; }

  function mSub() {
    var g = game(), si = curSetIdx(g), R = SB.replay(g, si), m = ui.modal, t = m.team;
    var side = g.sets[si].left === t ? 'left' : 'right';
    var tm = R.T[t];
    var h = '<h2>Substitution · ' + esc(tn(g, t)) + '</h2><p class="sub">Subs used ' + tm.subCount + ' of ' + g.settings.subLimit + ' · score ' + R.score[t] + '–' + R.score[O(t)] + '</p>';
    h += '<div class="subgrid"><div><div class="lbl">Player out (tap)</div>' + courtTiles(R, t, side, { select: [0, 1, 2, 3, 4, 5], act: 'subout', picked: m.out }) +
      '<label class="check' + (m.needsInjury ? ' flag' : '') + '"><input type="checkbox" id="subInj"' + (m.injury ? ' checked' : '') + '> Injury sub (exceptional)</label>' +
      '<p class="hint">For an injured or ill player when no legal sub is available. The injured player can\'t return this set. Counts toward the ' + g.settings.subLimit + ' unless they\'re used up.</p></div>';
    h += '<div><div class="lbl">Player in</div><div class="kpdisplay team-' + t + '">' + (m.inn ? esc(m.inn) : '<span>#</span>') + '</div>' +
      '<div class="keys inline">' + keypadKeys('<button type="button" class="key fn" data-act="key" data-key="back" aria-label="Delete">⌫</button>') + '</div></div></div>';
    h += '<p class="err"' + (m.error ? '' : ' hidden') + '>' + esc(m.error || '') + '</p>';
    h += '<div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="dosub">Make sub</button></div>';
    return mWrap(h, 'subm');
  }

  function mLibero() {
    var g = game(), si = curSetIdx(g), R = SB.replay(g, si), t = ui.modal.team, tm = R.T[t];
    var side = g.sets[si].left === t ? 'left' : 'right';
    var h = '<h2>Libero #' + esc(tm.lib.num) + ' · ' + esc(tn(g, t)) + '</h2>';
    if (tm.lib.slot === null) {
      h += '<p class="sub">Tap the back-row player the libero replaces. Libero swaps don\'t count as subs.</p>' + courtTiles(R, t, side, { select: [0, 4, 5], act: 'libin' });
    } else {
      h += '<p class="sub">#' + esc(tm.slots[tm.lib.slot].current) + ' comes back on for the libero. This also happens automatically when the libero rotates to the front row.</p>' +
        '<div class="actions left"><button class="btn primary" data-act="libout">Libero out</button></div>';
    }
    h += '<div class="actions"><button class="btn" data-act="close">Close</button></div>';
    return mWrap(h);
  }

  /* ---------- rotate a team without scoring ---------- */
  function mRotate() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], R = SB.replay(g, si), t = ui.modal.team;
    var side = set.left === t ? 'left' : 'right';
    var h = '<div class="checkhead"><h2>Rotate ' + esc(tn(g, t)) + '</h2></div>';
    h += '<p class="sub">Use this when a team\'s lineup was turned the wrong way and the players are in the wrong spots. It moves the whole team one spot without scoring a point, and the change is noted on the scoresheet.</p>';
    h += '<div class="rotwrap">' + courtTiles(R, t, side, { big: true }) + '</div>';
    h += '<div class="actions center"><button class="btn" data-act="rot" data-team="' + t + '" data-dir="-1">↺ Back one</button><button class="btn" data-act="rot" data-team="' + t + '" data-dir="1">↻ Forward one</button></div>';
    h += '<p class="hint center">Each tap is saved right away. Undo takes one back.</p>';
    h += '<div class="actions"><button class="btn primary" data-act="close">Done</button></div>';
    return mWrap(h, 'rotm');
  }

  /* ---------- edit lineup during play ---------- */
  function elTabs(m) {
    return '<div class="seg eltabs"><button type="button" class="' + (m.mode === 'court' ? 'on' : '') + '" data-act="elmode" data-mode="court">On court now</button>' +
      '<button type="button" class="' + (m.mode === 'start' ? 'on' : '') + '" data-act="elmode" data-mode="start">Starting lineup</button></div>';
  }

  function mEditCourt() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], m = ui.modal, d = m.draft, R = SB.replay(g, si);
    var h = '<div class="checkhead"><h2>Edit lineup · ' + R.score.A + '–' + R.score.B + '</h2>' + elTabs(m) + '</div>';
    h += '<p class="sub">Fix who is on the court right now, like a sub entered with the wrong number or for the wrong player. The app corrects that sub in the record, and the rest of the set recalculates. Tap a player to change the number, or tap <b>Swap</b> to trade two spots.</p>';
    h += '<div class="lineupcourt">';
    [[set.left, 'left'], [O(set.left), 'right']].forEach(function (pair, idx) {
      var t = pair[0], side = pair[1], tm = R.T[t];
      if (idx === 1) h += netEl('tall');
      h += '<fieldset class="lineup team-' + t + ' ' + side + '"><legend>' + esc(tn(g, t)) + (R.serving === t ? ' · serving' : '') + '</legend><div class="cgrid">';
      (side === 'left' ? LEFT_LAYOUT : RIGHT_LAYOUT).forEach(function (row) {
        row.forEach(function (p) {
          var k = tm.court[p];
          if (tm.lib.slot === k) {
            h += '<div class="cslot"><span class="rn">' + SB.ROMAN[k] + '</span><div class="nbox libon" title="Libero">' + esc(tm.lib.num) + '<sup class="capmark">L</sup></div></div>';
            return;
          }
          var on = m.sel && m.sel.team === t && m.sel.k === k, num = d.court[t][k];
          var changed = num !== tm.slots[k].current;
          var cameIn = tm.subs.some(function (s) { return s.slot === k; });
          h += '<div class="cslot"><span class="rn">' + SB.ROMAN[k] + (cameIn ? ' <i class="subtag">sub</i>' : '') + '</span><button type="button" class="nbox' + (on ? ' active' : '') + (on && m.sel.fresh && num ? ' fresh' : '') + (changed ? ' changed' : '') + '" data-act="elsel" data-team="' + t + '" data-k="' + k + '">' + esc(num) + '</button></div>';
        });
      });
      h += '</div><div class="cgrid-foot">' + (side === 'left' ? '<span>back</span><span>front</span>' : '<span>front</span><span>back</span>') + '</div>';
      h += '<div class="hint small">Subs used: ' + tm.subCount + '</div></fieldset>';
    });
    h += '</div>';
    if (m.sel) {
      var label = tn(g, m.sel.team) + ' · Spot ' + SB.ROMAN[m.sel.k];
      var cur = d.court[m.sel.team][m.sel.k];
      h += '<div class="elpanel team-' + m.sel.team + '"><div><div class="lbl">' + esc(label) + '</div><div class="kpdisplay' + (m.sel.fresh && cur ? ' fresh' : '') + '">' + (cur ? esc(cur) : '<span>#</span>') + '</div>' +
        '<button type="button" class="btn' + (m.swap ? ' primary' : '') + '" data-act="elswap">' + (m.swap ? 'Now tap the spot to swap with' : 'Swap with another spot') + '</button></div>' +
        '<div class="keys inline">' + keypadKeys('<button type="button" class="key fn" data-act="key" data-key="back" aria-label="Delete">⌫</button>') + '</div></div>';
    } else {
      h += '<p class="hint center">Tap a player to edit.</p>';
    }
    h += '<p class="err"' + (m.error ? '' : ' hidden') + '>' + esc(m.error || '') + '</p>';
    h += '<div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="elsave">Save</button></div>';
    return mWrap(h, 'wide editlu');
  }

  /* Find the record change that makes the court match what the scorer says is on the floor. */
  function courtFixError(g, t, target, lib) {
    if (target.some(function (x) { return !x; })) return 'Fill in all six numbers for ' + tn(g, t) + '.';
    var seen = {}, dup = null;
    target.forEach(function (x) { if (seen[x]) dup = x; seen[x] = 1; });
    if (dup) return tn(g, t) + ' has #' + dup + ' in two spots.';
    if (lib && seen[lib]) return '#' + lib + ' is ' + tn(g, t) + '\'s libero. Use the Libero button for the libero.';
    return null;
  }
  function resolveCourtFix(g, si, t, target) {
    var set = g.sets[si];
    var base = SB.replay(g, si);
    var baseIgnored = base.log.filter(function (e) { return e.ignored; }).length;
    function test(trial) {
      var g2 = JSON.parse(JSON.stringify(g)); g2.sets[si] = trial;
      var R = SB.replay(g2, si);
      if (R.log.filter(function (e) { return e.ignored; }).length > baseIgnored) return false;
      if (trial.events.some(function (ev) { return ev.t === 'sub' && ev.out === ev.inn; })) return false;
      return R.T[t].slots.every(function (s, k) { return s.current === target[k]; });
    }
    function clone() { return JSON.parse(JSON.stringify(set)); }
    function renameCards(trial, fromIdx, oldN, newN) {
      trial.events.forEach(function (ev, i) { if (i > fromIdx && ev.team === t && ev.t === 'card' && ev.who === oldN) ev.who = newN; });
    }
    var cur = base.T[t].slots.map(function (s) { return s.current; });
    var values = target.concat(cur).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    var subIdx = [];
    base.log.forEach(function (e) { if (e.ev.t === 'sub' && e.ev.team === t && !e.ignored) subIdx.push(e.idx); });
    subIdx.reverse(); // newest first
    // 1. a single wrong entry: one sub's "in" or "out" number, or a starter who never left
    for (var a = 0; a < subIdx.length; a++) {
      var i = subIdx[a], ev = set.events[i];
      var fields = ['inn', 'out'];
      for (var f = 0; f < 2; f++) {
        for (var v = 0; v < values.length; v++) {
          if (values[v] === ev[fields[f]]) continue;
          var tr = clone(); tr.events[i][fields[f]] = values[v];
          if (fields[f] === 'inn') renameCards(tr, i, ev.inn, values[v]);
          if (test(tr)) return tr;
        }
      }
    }
    for (var k = 0; k < 6; k++) {
      if (target[k] === cur[k]) continue;
      var tr2 = clone(); tr2.lineup[t][k] = target[k]; renameCards(tr2, -1, cur[k], target[k]);
      if (test(tr2)) return tr2;
    }
    // 2. several spots wrong: fix each spot's most recent entry
    var tr3 = clone();
    for (var k2 = 0; k2 < 6; k2++) {
      if (target[k2] === cur[k2]) continue;
      var lastSub = -1;
      base.log.forEach(function (e) { if (e.ev.t === 'sub' && e.ev.team === t && !e.ignored && e.slot === k2) lastSub = e.idx; });
      if (lastSub >= 0) { tr3.events[lastSub].inn = target[k2]; renameCards(tr3, lastSub, cur[k2], target[k2]); }
      else { tr3.lineup[t][k2] = target[k2]; renameCards(tr3, -1, cur[k2], target[k2]); }
    }
    if (test(tr3)) return tr3;
    return null;
  }

  function saveCourtEdit() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], m = ui.modal, d = m.draft;
    var R0 = SB.replay(g, si), original = JSON.parse(JSON.stringify(set)), changed = [];
    for (var x = 0; x < 2; x++) {
      var t = ['A', 'B'][x];
      var cur = R0.T[t].slots.map(function (s) { return s.current; });
      if (JSON.stringify(cur) === JSON.stringify(d.court[t])) continue;
      var err = courtFixError(g, t, d.court[t], R0.T[t].lib.num);
      var fixed = err ? null : resolveCourtFix(g, si, t, d.court[t]);
      if (!fixed) {
        g.sets[si] = original;  // undo a fix already applied to the other team
        m.error = err || 'That doesn\'t match any single sub or starting number for ' + tn(g, t) + '. Fix it one change at a time, or check the game log.';
        render(); return;
      }
      g.sets[si] = fixed;   // the next team is resolved on top of this one
      changed.push(t);
    }
    if (!changed.length) { ui.modal = null; render(); toast('No changes'); return; }
    var fs = g.sets[si];
    fs.fixes = (fs.fixes || []).concat(changed.map(function (t) { return { team: t, at: R0.score[t] + '-' + R0.score[O(t)], ts: Date.now() }; }));
    save();
    ui.modal = { kind: 'check', pre: false }; render();
    toast('Corrected. Check the floor against this view.');
  }

  function mEditLineup() {
    if (ui.modal.mode === 'court') return mEditCourt();
    var g = game(), si = curSetIdx(g), set = g.sets[si], m = ui.modal, d = m.draft;
    var h = '<div class="checkhead"><h2>Edit lineup · Set ' + (si + 1) + '</h2>' + elTabs(m) + '</div>';
    h += '<p class="sub">Fix a starting lineup that was entered wrong. The whole set is recalculated as if it had been entered correctly. Tap a spot to change its number, or tap <b>Swap</b> to trade two spots.</p>';
    h += '<div class="lineupcourt">';
    [[set.left, 'left'], [O(set.left), 'right']].forEach(function (pair, idx) {
      var t = pair[0], side = pair[1];
      if (idx === 1) h += netEl('tall');
      h += '<fieldset class="lineup team-' + t + ' ' + side + '"><legend>' + esc(tn(g, t)) + '</legend><div class="cgrid">';
      (side === 'left' ? LEFT_LAYOUT : RIGHT_LAYOUT).forEach(function (row) {
        row.forEach(function (k) {
          var on = m.sel && m.sel.team === t && m.sel.k === k, num = d.lineup[t][k];
          var changed = num !== set.lineup[t][k];
          h += '<div class="cslot"><span class="rn">' + SB.ROMAN[k] + '</span><button type="button" class="nbox' + (on ? ' active' : '') + (on && m.sel.fresh && num ? ' fresh' : '') + (changed ? ' changed' : '') + '" data-act="elsel" data-team="' + t + '" data-k="' + k + '">' + esc(num) +
            (num && d.captain[t] === num ? '<sup class="capmark">C</sup>' : '') + '</button></div>';
        });
      });
      h += '</div><div class="cgrid-foot">' + (side === 'left' ? '<span>back</span><span>front</span>' : '<span>front</span><span>back</span>') + '</div>';
      if (g.settings.libero) {
        var lon = m.sel && m.sel.team === t && m.sel.k === 'lib';
        h += '<div class="slot lib"><span>Libero</span><button type="button" class="nbox' + (lon ? ' active' : '') + (lon && m.sel.fresh && d.libero[t] ? ' fresh' : '') + (d.libero[t] !== set.libero[t] ? ' changed' : '') + '" data-act="elsel" data-team="' + t + '" data-k="lib">' + (d.libero[t] ? esc(d.libero[t]) : '<i>none</i>') + '</button></div>';
      }
      var nums = d.lineup[t].filter(Boolean);
      h += '<div class="caprow"><span>Captain</span>' + nums.map(function (n) {
        return '<button type="button" class="capchip' + (d.captain[t] === n ? ' on' : '') + '" data-act="elcap" data-team="' + t + '" data-num="' + esc(n) + '">' + esc(n) + '</button>';
      }).join('') + '</div></fieldset>';
    });
    h += '</div>';
    if (m.sel) {
      var label = tn(g, m.sel.team) + ' · ' + (m.sel.k === 'lib' ? 'Libero' : 'Spot ' + SB.ROMAN[m.sel.k]);
      var cur = m.sel.k === 'lib' ? d.libero[m.sel.team] : d.lineup[m.sel.team][m.sel.k];
      h += '<div class="elpanel team-' + m.sel.team + '"><div><div class="lbl">' + esc(label) + '</div><div class="kpdisplay' + (m.sel.fresh && cur ? ' fresh' : '') + '">' + (cur ? esc(cur) : '<span>#</span>') + '</div>' +
        (m.sel.k === 'lib' ? '' : '<button type="button" class="btn' + (m.swap ? ' primary' : '') + '" data-act="elswap">' + (m.swap ? 'Now tap the spot to swap with' : 'Swap with another spot') + '</button>') + '</div>' +
        '<div class="keys inline">' + keypadKeys('<button type="button" class="key fn" data-act="key" data-key="back" aria-label="Delete">⌫</button>') + '</div></div>';
    } else {
      h += '<p class="hint center">Tap a spot to edit it.</p>';
    }
    h += '<p class="err"' + (m.error ? '' : ' hidden') + '>' + esc(m.error || '') + '</p>';
    h += '<div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="elsave">Save lineup</button></div>';
    return mWrap(h, 'wide editlu');
  }

  function saveLineupEdit() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], m = ui.modal, d = m.draft;
    var err = lineupError(g, d);
    if (err) { m.error = err; render(); return; }
    var R0 = SB.replay(g, si);
    var ignoredBefore = R0.log.filter(function (e) { return e.ignored; }).length;
    var changedTeams = [];
    ['A', 'B'].forEach(function (t) {
      var oldL = set.lineup[t], newL = d.lineup[t];
      var oldAll = oldL.concat([set.libero[t] || '']), newAll = newL.concat([d.libero[t] || '']);
      var changed = JSON.stringify(oldAll) !== JSON.stringify(newAll) || (set.captain[t] || '') !== (d.captain[t] || '');
      if (!changed) return;
      changedTeams.push(t);
      // numbers that were typed wrong: old number gone, new number new -> rename in this set's events
      var ren = {};
      oldAll.forEach(function (o, i) {
        var n = newAll[i];
        if (o && n && o !== n && newAll.indexOf(o) < 0 && oldAll.indexOf(n) < 0) ren[o] = n;
      });
      set.events.forEach(function (ev) {
        if (ev.team !== t) return;
        if (ev.t === 'sub') { if (ren[ev.out]) ev.out = ren[ev.out]; if (ren[ev.inn]) ev.inn = ren[ev.inn]; }
        if (ev.t === 'card' && ren[ev.who]) ev.who = ren[ev.who];
      });
      set.lineup[t] = newL.slice(); set.libero[t] = d.libero[t] || ''; set.captain[t] = d.captain[t] || '';
    });
    if (!changedTeams.length) { ui.modal = null; render(); toast('No changes'); return; }
    if (!set.fixes) set.fixes = [];
    changedTeams.forEach(function (t) { set.fixes.push({ team: t, at: R0.score[t] + '-' + R0.score[O(t)], ts: Date.now() }); });
    save();
    var R1 = SB.replay(g, si);
    var ignoredAfter = R1.log.filter(function (e) { return e.ignored; }).length;
    ui.modal = { kind: 'check', pre: false }; render();
    toast(ignoredAfter > ignoredBefore ? 'Lineup saved, but a sub no longer matches. Check the game log.' : 'Lineup corrected. Check the floor against this view.');
  }

  function mCheck() {
    var g = game(), si = curSetIdx(g), set = g.sets[si], R = SB.replay(g, si), pre = ui.modal.pre;
    var L = set.left, Rt = O(L);
    function orderList(t) { return R.T[t].slots.map(function (s, i) { return SB.ROMAN[i] + ' #' + esc(s.current); }).join(' · '); }
    function teamCol(t, side) {
      return '<div class="ccol"><div class="chead team-' + t + '"><strong>' + esc(tn(g, t)) + '</strong> <span>' + (R.serving === t ? 'serving' : 'receiving') + '</span></div>' +
        courtTiles(R, t, side, { big: true }) +
        '<div class="corder">Serve order: ' + orderList(t) + '</div>' +
        (pre ? '' : '<div class="rotfix"><span>Fix rotation</span><button class="btn small" data-act="rot" data-team="' + t + '" data-dir="-1">↺ Back one</button><button class="btn small" data-act="rot" data-team="' + t + '" data-dir="1">↻ Forward one</button></div>') + '</div>';
    }
    var h = '<div class="checkhead"><h2>Lineup check' + (pre ? ' · Set ' + (si + 1) : ' · ' + R.score.A + '–' + R.score.B) + '</h2><button class="btn" data-act="swap">⇄ Swap sides</button></div>';
    h += '<div class="checkcourt">' + teamCol(L, 'left') + netEl('tall') + teamCol(Rt, 'right') + '</div>';
    if (pre) h += '<p class="hint center">Compare with the floor and the lineup cards. Fix numbers on the lineup screen if anything is off.</p>';
    h += '<div class="actions">' + (pre ? '<button class="btn" data-act="close">Edit lineups</button><button class="btn primary" data-act="startset">Start set ' + (si + 1) + '</button>' : '<button class="btn primary" data-act="close">Done</button>') + '</div>';
    return mWrap(h, 'wide');
  }

  function mLog() {
    var g = game(), cur = curSetIdx(g), m = ui.modal;
    var si = m.set == null ? cur : m.set;
    var tabs = '';
    for (var i = 0; i <= cur; i++) if (g.sets[i] && g.sets[i].started) tabs += '<button type="button" class="tab' + (i === si ? ' on' : '') + '" data-act="logtab" data-set="' + i + '">Set ' + (i + 1) + '</button>';
    var R = SB.replay(g, si);
    var editable = si === cur;
    var h = '<div class="loghead"><h2>Game log</h2><div class="tabs">' + tabs + '</div></div>';
    h += '<p class="sub">' + (editable ? 'Newest first. Tap a row to delete it or give a point to the other team. Everything after it recalculates.' : 'Earlier sets are view-only.') + '</p>';
    h += '<div class="loglist">';
    var rows = R.log.slice().reverse();
    if (!rows.length) h += '<p class="hint">Nothing recorded yet.</p>';
    rows.forEach(function (e) {
      var selected = editable && m.sel === e.idx;
      h += logRow(g, e, { button: editable, selected: selected });
      if (selected) {
        h += '<div class="logactions">';
        if (e.ev.t === 'pt') h += '<button class="btn small" data-act="logflip" data-idx="' + e.idx + '">Give point to ' + esc(tn(g, O(e.ev.team))) + '</button>';
        h += m.confirm === e.idx ? '<button class="btn small danger solid" data-act="logdel" data-idx="' + e.idx + '">Tap again to delete</button>' : '<button class="btn small danger" data-act="logdelask" data-idx="' + e.idx + '">Delete</button>';
        h += '<button class="btn small" data-act="logcancel">Cancel</button></div>';
      }
    });
    h += '</div><div class="actions"><button class="btn primary" data-act="close">Done</button></div>';
    return mWrap(h, 'logm');
  }

  function mMore() {
    var g = game(), m = ui.modal, t = m.cardTeam;
    var h = '<h2>More</h2><p class="sub">Less common calls. Each one is logged and printed on the scoresheet.</p>';
    h += '<div class="moresec"><h3>Replay</h3><p class="hint">The rally is replayed. No point is scored.</p><div class="actions left"><button class="btn" data-act="replay">Record replay</button></div></div>';
    h += '<div class="moresec"><h3>Penalty point</h3><p class="hint">Awards a point and serve to the team you tap.</p><div class="actions left">' +
      ['A', 'B'].map(function (x) { return '<button class="btn team-' + x + ' teamtint" data-act="penalty" data-team="' + x + '">Point to ' + esc(tn(g, x)) + '</button>'; }).join('') + '</div></div>';
    h += '<div class="moresec"><h3>Card</h3><div class="cardgrid"><div>' +
      '<div class="lbl">Team that gets the card</div><div class="seg">' + ['A', 'B'].map(function (x) { return '<button type="button" class="' + (t === x ? 'on' : '') + '" data-act="cardteam" data-team="' + x + '">' + esc(tn(g, x)) + '</button>'; }).join('') + '</div>' +
      '<div class="lbl" style="margin-top:10px">Card</div><div class="seg">' + [['yellow', 'Yellow (warning)'], ['red', 'Red (point to opponent)']].map(function (c) { return '<button type="button" class="' + (m.color === c[0] ? 'on' : '') + '" data-act="cardcolor" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<p class="hint">Leave the number blank for a coach or bench card.</p></div>' +
      '<div><div class="lbl">Player number</div><div class="kpdisplay team-' + t + '">' + (m.who ? esc(m.who) : '<span>coach/bench</span>') + '</div>' +
      '<div class="keys inline">' + keypadKeys('<button type="button" class="key fn" data-act="key" data-key="back" aria-label="Delete">⌫</button>') + '</div></div></div>' +
      '<div class="actions left"><button class="btn primary" data-act="docard">Record ' + m.color + ' card</button></div></div>';
    h += '<div class="actions"><button class="btn" data-act="close">Close</button></div>';
    return mWrap(h, 'morem');
  }

  function mMenu() {
    var g = game();
    var h = '<h2>Menu</h2><div class="menulist">' +
      '<button class="btn" data-act="pdf">Save PDF</button>' +
      '<button class="btn" data-act="print">Print</button>' +
      '<button class="btn" data-act="editinfo">Game info, colors, and rules</button>' +
      '<button class="btn" data-act="home">Saved games</button></div>' +
      '<p class="hint">' + esc(tn(g, 'A')) + ' vs ' + esc(tn(g, 'B')) + ' is saved after every tap.</p>' +
      '<div class="actions"><button class="btn primary" data-act="close">Back</button></div>';
    return mWrap(h);
  }

  function mAbout() {
    var h = '<h2>Digital Volleyball Scorebook</h2><p class="sub">Version ' + VERSION + ' · by ' + esc(SELLER) + '</p>';
    h += '<div class="aboutsec"><h3>Getting help</h3><p>Questions or problems? Email <span class="sel">' + esc(SUPPORT) + '</span> <button class="btn small" data-act="copyemail">Copy address</button></p>' +
      '<p class="hint">The Quick-Start Guide PDF that came with this file covers setup, scoring, fixing mistakes, and backups.</p></div>';
    h += '<div class="aboutsec"><h3>Works best in</h3><p>Chrome or Edge on a Windows, Mac, or Chromebook computer. Touchscreen laptops work well. iPad and iPhone are not supported.</p></div>';
    h += '<div class="aboutsec"><h3>Privacy</h3><p>No accounts and no internet needed. Your games are saved only in this browser on this computer and are never sent anywhere.</p></div>';
    h += '<div class="aboutsec"><h3>Your saved games</h3><p>Saved games stay with this browser. If you move the file, switch browsers, or clear browsing data, they won\'t appear. Use <em>Back up all games</em> after each match.</p></div>';
    h += '<div class="aboutsec"><h3>License</h3><p>One purchase covers one coach or scorekeeper, on as many of their own computers as they like. Please buy an additional license for each other person who uses it. Don\'t post or share the file publicly.</p>' +
      '<p class="hint">Scoresheet layouts follow common school (NFHS rally scoring) and club (USAV/AAU style) formats. This product is not affiliated with or endorsed by NFHS, any state association, USA Volleyball, or AAU. Always follow your league\'s official rules.</p></div>';
    h += '<div class="actions"><button class="btn primary" data-act="close">Close</button></div>';
    return mWrap(h, 'aboutm');
  }

  /* demo game for first-time users and previews */
  function buildSample() {
    var g = SB.newGame({ level: '7th grade' });
    Object.assign(g.info, { home: 'Lincoln Lions', away: 'Westview Hawks', site: 'Main gym', scorer: 'Sample', referee: 'J. Rivera', referee2: 'K. Chen', gameNumber: '4', colorA: 'navy', colorB: 'gold' });
    var seed = 14; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var t0 = Date.now() - 90 * 60000, k = 0;
    function ev(si, e) { e.ts = t0 + (k++) * 22000; g.sets[si].events.push(e); }
    var bias = [0.53, 0.47, 0.53];
    for (var si = 0; si < g.settings.setsTotal; si++) {
      var s = SB.newSet(g);
      s.lineup.A = ['4', '11', '7', '15', '2', '9']; s.lineup.B = ['3', '12', '8', '21', '5', '10'];
      s.captain = { A: '7', B: '21' };
      s.started = true; s.start = t0 + k * 22000; g.sets.push(s);
      var n = 0;
      while (!SB.replay(g, si).done && n < 200) {
        n++;
        if (n === 9) ev(si, { t: 'to', team: rnd() < 0.5 ? 'A' : 'B' });
        if (n === 14) ev(si, { t: 'sub', team: 'A', out: SB.replay(g, si).T.A.slots[1].current, inn: '18' });
        if (n === 20) ev(si, { t: 'sub', team: 'B', out: SB.replay(g, si).T.B.slots[4].current, inn: '14' });
        if (n === 27) ev(si, { t: 'to', team: 'A' });
        ev(si, { t: 'pt', team: rnd() < bias[si] ? 'A' : 'B' });
      }
    }
    g.status = 'done'; g.updatedAt = Date.now();
    return g;
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
    applyColors(v === 'setup' ? ui.draft : game());
    if (v === 'home') h = vHome();
    else if (v === 'setup') h = vSetup();
    else if (v === 'lineup') h = vLineup();
    else if (v === 'live') h = vLive();
    else if (v === 'summary') h = vSummary();
    if (v === 'setup') applyColors(ui.draft);
    if (ui.modal) {
      var k = ui.modal.kind;
      h += k === 'sub' ? mSub() : k === 'libero' ? mLibero() : k === 'check' ? mCheck() : k === 'menu' ? mMenu() : k === 'del' ? mConfirmDel() : k === 'log' ? mLog() : k === 'more' ? mMore() : k === 'about' ? mAbout() : k === 'editlu' ? mEditLineup() : k === 'rotate' ? mRotate() : '';
    }
    var scrollY = window.scrollY;
    var listEl = document.querySelector('.loglist'), listScroll = listEl ? listEl.scrollTop : 0;
    app.innerHTML = h;
    if (v === 'lineup' || v === 'setup') window.scrollTo(0, scrollY);
    var nl = document.querySelector('.loglist'); if (nl && ui.modal && ui.modal.keepScroll) nl.scrollTop = listScroll;
    document.body.classList.toggle('is-live', v === 'live');
    keepAwake(v === 'live');
    if (ui.kp) positionKeypad();
  }

  function openGame(id) {
    ui.gameId = id; ui.modal = null; ui.kp = null; ui.lineupErr = null;
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
    } else doc.save(name);
  }

  function readSetupForm() {
    var g = ui.draft;
    function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function n(id, d) { var x = parseInt(v(id), 10); return isNaN(x) || x < 1 ? d : x; }
    g.info.home = v('f-home'); g.info.away = v('f-away'); g.info.date = v('f-date');
    g.info.site = v('f-site'); g.info.scorer = v('f-scorer'); g.info.referee = v('f-ref');
    function keep(id, key) { var el = document.getElementById(id); if (el) g.info[key] = el.value.trim(); }
    keep('f-ref2', 'referee2'); keep('f-gamenum', 'gameNumber'); keep('f-matchno', 'matchNo'); keep('f-comp', 'competition');
    keep('f-city', 'city'); keep('f-pool', 'pool'); keep('f-div', 'division'); keep('f-cat', 'category');
    var sty = document.getElementById('f-style'); if (sty) g.settings.style = sty.value;
    var lvl = document.getElementById('f-level'); if (lvl) g.info.level = lvl.value;
    if (document.getElementById('f-levelother')) g.info.levelOther = v('f-levelother');
    var fmt = document.getElementById('f-format'); if (fmt) g.settings.format = fmt.value;
    var st = document.getElementById('f-sets'); if (st) g.settings.setsTotal = Number(st.value);
    var pts = [];
    for (var i = 0; i < g.settings.setsTotal; i++) pts.push(n('f-p' + i, i === g.settings.setsTotal - 1 ? 15 : 25));
    g.settings.points = pts;
    g.settings.winBy = n('f-winby', 2); g.settings.timeouts = n('f-to', 2); g.settings.subLimit = n('f-subs', 18);
    var lib = document.getElementById('f-lib'); if (lib) g.settings.libero = lib.checked;
    return g;
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

  function keypadPress(key) {
    var g = game();
    if (ui.modal && ui.modal.kind === 'sub') {
      ui.modal.inn = pressKey(ui.modal.inn, key);
      ui.modal.error = null; render(); return;
    }
    if (ui.modal && ui.modal.kind === 'more') { ui.modal.who = pressKey(ui.modal.who, key); render(); return; }
    if (ui.modal && ui.modal.kind === 'editlu') {
      var em = ui.modal; if (!em.sel) return;
      var fr = em.sel.fresh; em.sel.fresh = false;
      if (em.mode === 'court') em.draft.court[em.sel.team][em.sel.k] = freshKey(em.draft.court[em.sel.team][em.sel.k], key, fr);
      else if (em.sel.k === 'lib') em.draft.libero[em.sel.team] = freshKey(em.draft.libero[em.sel.team], key, fr);
      else em.draft.lineup[em.sel.team][em.sel.k] = freshKey(em.draft.lineup[em.sel.team][em.sel.k], key, fr);
      em.error = null; render(); return;
    }
    if (!ui.kp || ui.view !== 'lineup') return;
    var set = g.sets[curSetIdx(g)];
    if (key === 'next') {
      var order = kpOrder(g), pos = -1;
      order.forEach(function (o, i) { if (o.team === ui.kp.team && o.k === ui.kp.k) pos = i; });
      ui.kp = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
      if (ui.kp) ui.kp.fresh = true;
    } else {
      kpSet(set, ui.kp, freshKey(kpGet(set, ui.kp), key, ui.kp.fresh));
      ui.kp.fresh = false;
      ui.lineupErr = null;
      save();
    }
    render();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    // tapping away from the lineup keypad closes it
    if (ui.kp && !e.target.closest('.keypad') && !e.target.closest('.nbox')) {
      ui.kp = null;
      if (!el) { render(); return; }
    }
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'scrim') { if (e.target === el && ui.modal && ui.modal.kind !== 'check') { ui.modal = null; render(); } return; }
    var g = game(), si = g ? curSetIdx(g) : -1, team = el.getAttribute('data-team');

    switch (act) {
      case 'new': ui.edit = false; ui.draft = SB.newGame(); ui.view = 'setup'; render(); break;
      case 'newmatch':
        ui.edit = false;
        ui.draft = SB.newGame({ date: g.info.date, site: g.info.site, scorer: g.info.scorer, referee: g.info.referee, referee2: g.info.referee2, level: g.info.level, settings: g.settings,
          competition: g.info.competition, city: g.info.city, pool: g.info.pool, division: g.info.division, category: g.info.category });
        if (g.info.levelOther) ui.draft.info.levelOther = g.info.levelOther;
        ui.gameId = null; ui.view = 'setup'; render(); window.scrollTo(0, 0); break;
      case 'home': ui.modal = null; ui.kp = null; ui.view = 'home'; ui.gameId = null; ui.draft = null; render(); break;
      case 'open': openGame(el.getAttribute('data-id')); break;
      case 'pdf': doPDF(db.games[el.getAttribute('data-id')] || g, 'save'); break;
      case 'print': doPDF(db.games[el.getAttribute('data-id')] || g, 'print'); break;
      case 'blankpdf':
        var bg = SB.blankGame(el.getAttribute('data-style'));
        var bdoc = SB.makePDF(window.jspdf.jsPDF, bg); bdoc.save('Blank_' + (el.getAttribute('data-style') === 'aau' ? 'club' : 'school') + '_scoresheet.pdf'); break;

      /* more menu */
      case 'more': ui.modal = { kind: 'more', cardTeam: 'A', color: 'yellow', who: '' }; render(); break;
      case 'cardteam': ui.modal.cardTeam = team; render(); break;
      case 'cardcolor': ui.modal.color = el.getAttribute('data-c'); render(); break;
      case 'replay':
        if (SB.replay(g, si).done) { toast('This set is over.'); break; }
        addEvent({ t: 'rp' }); ui.modal = null; render(); toast('Replay recorded'); break;
      case 'penalty':
        if (SB.replay(g, si).done) { toast('This set is over.'); break; }
        addEvent({ t: 'pen', team: team }); ui.modal = null; render(); toast('Penalty point to ' + tn(g, team)); break;
      case 'docard':
        var mm = ui.modal;
        if (SB.replay(g, si).done) { toast('This set is over.'); break; }
        addEvent({ t: 'card', team: mm.cardTeam, color: mm.color, who: mm.who || '' });
        ui.modal = null; render();
        toast((mm.color === 'red' ? 'Red' : 'Yellow') + ' card, ' + tn(g, mm.cardTeam) + (mm.color === 'red' ? '. Point to ' + tn(g, O(mm.cardTeam)) : ''));
        break;
      case 'captain':
        var cs = g.sets[si];
        cs.captain[team] = cs.captain[team] === el.getAttribute('data-num') ? '' : el.getAttribute('data-num');
        save(); render(); break;
      case 'backup':
        var bgm = db.games[el.getAttribute('data-id')];
        var blob = new Blob([JSON.stringify(bgm, null, 1)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = SB.pdfName(bgm).replace(/\.pdf$/, '') + '.scorebook.json';
        document.body.appendChild(a); a.click(); a.remove();
        break;
      case 'about': ui.modal = { kind: 'about' }; render(); break;
      case 'copyemail':
        try { navigator.clipboard.writeText(SUPPORT).then(function () { toast('Email address copied'); }, function () { toast(SUPPORT); }); } catch (err) { toast(SUPPORT); }
        break;
      case 'sample': var sg = buildSample(); db.games[sg.id] = sg; save(); render(); toast('Sample match loaded. Open it or save its PDF.'); break;
      case 'backupall':
        var all = Object.keys(db.games).map(function (k) { return db.games[k]; });
        var ab = new Blob([JSON.stringify({ app: 'dvScorebook', version: VERSION, games: all }, null, 1)], { type: 'application/json' });
        var aa = document.createElement('a'); var d0 = new Date();
        aa.href = URL.createObjectURL(ab); aa.download = 'Scorebook_backup_' + d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0') + '.json';
        document.body.appendChild(aa); aa.click(); aa.remove();
        toast('Backed up ' + all.length + ' game' + (all.length === 1 ? '' : 's')); break;
      case 'askdel': ui.modal = { kind: 'del', id: el.getAttribute('data-id') }; render(); break;
      case 'dodel': delete db.games[el.getAttribute('data-id')]; ui.modal = null; save(); render(); toast('Game deleted'); break;
      case 'close': ui.modal = null; render(); break;
      case 'menu': ui.kp = null; ui.modal = { kind: 'menu' }; render(); break;
      case 'editinfo': ui.modal = null; ui.edit = true; ui.draft = null; ui.view = 'setup'; render(); window.scrollTo(0, 0); break;
      case 'back-live': ui.edit = false; ui.draft = null; openGame(ui.gameId); break;

      /* setup */
      case 'color':
        readSetupForm();
        var d = ui.draft, c = el.getAttribute('data-c'), mine = team === 'A' ? 'colorA' : 'colorB', theirs = team === 'A' ? 'colorB' : 'colorA';
        d.info[mine] = c;
        if (d.info[theirs] === c) {
          var ids = SB.COLORS.map(function (x) { return x.id; }), j = ids.indexOf(c);
          d.info[theirs] = ids[(j + 1) % ids.length];
        }
        render(); break;

      /* lineup + keypad */
      case 'kp': ui.kp = { team: team, k: el.getAttribute('data-k') === 'lib' ? 'lib' : Number(el.getAttribute('data-k')), fresh: true }; render(); break;
      case 'kpclose': ui.kp = null; render(); break;
      case 'key': keypadPress(el.getAttribute('data-key')); break;
      case 'copy':
        var from = g.sets[Number(el.getAttribute('data-from'))], set = g.sets[si];
        set.lineup[team] = from.lineup[team].slice();
        set.libero[team] = from.libero[team] || '';
        set.captain[team] = (from.captain && from.captain[team]) || '';
        ui.lineupErr = null; save(); render();
        toast('Copied ' + tn(g, team) + ' from set ' + (Number(el.getAttribute('data-from')) + 1) + '. Tap any box to change it.');
        break;
      case 'firstserve': g.sets[si].firstServe = team; save(); render(); break;
      case 'leftside': g.sets[si].left = team; save(); render(); break;
      case 'back-prevset':
        if (!g.sets[si].events.length) { g.sets.pop(); save(); ui.kp = null; ui.view = 'live'; render(); }
        break;
      case 'startset':
        g.sets[si].started = true; g.sets[si].start = Date.now(); save();
        ui.modal = null; ui.view = 'live'; render(); break;

      /* live */
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
      case 'togglelog': prefs.showLog = !prefs.showLog; savePrefs(); render(); break;
      case 'to':
        var R = SB.replay(g, si);
        if (R.done) return;
        if (R.T[team].timeouts.length >= g.settings.timeouts) { toast(tn(g, team) + ' has used all ' + g.settings.timeouts + ' timeouts'); break; }
        addEvent({ t: 'to', team: team }); render(); toast('Timeout ' + tn(g, team) + ' at ' + R.score[team] + '–' + R.score[O(team)]); break;
      case 'sub': ui.modal = { kind: 'sub', team: team, inn: '' }; render(); break;
      case 'subout':
        ui.modal.injury = (document.getElementById('subInj') || {}).checked;
        ui.modal.out = el.getAttribute('data-num'); ui.modal.error = null; ui.modal.needsInjury = false; render(); break;
      case 'dosub':
        var m = ui.modal;
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
      case 'editlu':
        var es = g.sets[si];
        var esR = SB.replay(g, si);
        ui.modal = { kind: 'editlu', mode: 'court', sel: null, swap: false, error: null,
          draft: { court: { A: esR.T.A.slots.map(function (s) { return s.current; }), B: esR.T.B.slots.map(function (s) { return s.current; }) },
            lineup: { A: es.lineup.A.slice(), B: es.lineup.B.slice() }, libero: { A: es.libero.A || '', B: es.libero.B || '' }, captain: { A: (es.captain && es.captain.A) || '', B: (es.captain && es.captain.B) || '' } } };
        render(); break;
      case 'elsel':
        var em2 = ui.modal, kk = el.getAttribute('data-k') === 'lib' ? 'lib' : Number(el.getAttribute('data-k'));
        if (em2.swap && em2.sel && em2.sel.team === team && kk !== 'lib' && kk !== em2.sel.k) {
          var arr = em2.mode === 'court' ? em2.draft.court[team] : em2.draft.lineup[team], tmp = arr[kk]; arr[kk] = arr[em2.sel.k]; arr[em2.sel.k] = tmp;
          em2.swap = false; em2.sel = null; em2.error = null; render(); toast('Swapped spots'); break;
        }
        em2.swap = false; em2.sel = { team: team, k: kk, fresh: true }; render(); break;
      case 'elswap': ui.modal.swap = !ui.modal.swap; render(); break;
      case 'elmode': ui.modal.mode = el.getAttribute('data-mode'); ui.modal.sel = null; ui.modal.swap = false; ui.modal.error = null; render(); break;
      case 'elcap': var ec = ui.modal.draft.captain; ec[team] = ec[team] === el.getAttribute('data-num') ? '' : el.getAttribute('data-num'); render(); break;
      case 'elsave': if (ui.modal.mode === 'court') saveCourtEdit(); else saveLineupEdit(); break;
      case 'swap': g.sets[si].left = O(g.sets[si].left); save(); render(); break;
      case 'rotate': ui.modal = { kind: 'rotate', team: team }; render(); break;
      case 'rot':
        addEvent({ t: 'rot', team: team, dir: Number(el.getAttribute('data-dir')) }); render(); toast('Rotation corrected for ' + tn(g, team) + '. Noted on the scoresheet.'); break;

      /* game log */
      case 'log': ui.modal = { kind: 'log', set: null, sel: null, confirm: null }; render(); break;
      case 'logtab': ui.modal.set = Number(el.getAttribute('data-set')); ui.modal.sel = null; ui.modal.confirm = null; render(); break;
      case 'logsel': var ix = Number(el.getAttribute('data-idx')); ui.modal.sel = ui.modal.sel === ix ? null : ix; ui.modal.confirm = null; ui.modal.keepScroll = true; render(); break;
      case 'logcancel': ui.modal.sel = null; ui.modal.confirm = null; ui.modal.keepScroll = true; render(); break;
      case 'logdelask': ui.modal.confirm = Number(el.getAttribute('data-idx')); ui.modal.keepScroll = true; render(); break;
      case 'logdel':
        g.sets[si].events.splice(Number(el.getAttribute('data-idx')), 1);
        ui.modal.sel = null; ui.modal.confirm = null; ui.modal.keepScroll = true; save(); render(); toast('Entry deleted. The set recalculated.'); break;
      case 'logflip':
        var fe = g.sets[si].events[Number(el.getAttribute('data-idx'))];
        fe.team = O(fe.team);
        ui.modal.sel = null; ui.modal.keepScroll = true; save(); render(); toast('Point moved to ' + tn(g, fe.team) + '. The set recalculated.'); break;

      case 'nextset': g.sets.push(SB.newSet(g)); save(); ui.lineupErr = null; ui.view = 'lineup'; render(); window.scrollTo(0, 0); break;
      case 'finish': g.status = 'done'; save(); ui.view = 'summary'; render(); break;
      case 'reopen': g.status = 'live'; save(); ui.view = 'live'; render(); break;
    }
  });

  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'f-level') {
      readSetupForm();
      var p = SB.applyPreset(null, ui.draft.info.level);
      if (p) { ui.draft.settings = p; toast('Rules set for ' + ui.draft.info.level + '. Change anything that differs.'); }
      render();
    } else if (id === 'f-sets') {
      readSetupForm();
      ui.draft.settings.points = SB.pointsFor(ui.draft.settings.setsTotal);
      render();
    } else if (id === 'f-style') {
      readSetupForm(); render();
    } else if (id === 'f-format') {
      readSetupForm(); render();
    } else if (id === 'importFile') {
      var file = e.target.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var data = JSON.parse(rd.result);
          var games = data && data.games ? data.games : [data];
          var n = 0, added = 0;
          games.forEach(function (g) {
            if (!g || !g.info || !g.sets || !g.settings) return;
            normalize(g); n++;
            if (db.games[g.id] && JSON.stringify(db.games[g.id].sets) === JSON.stringify(g.sets)) return; // already here
            if (db.games[g.id]) g.id = g.id + '-r' + Date.now().toString(36) + n;
            db.games[g.id] = g; added++;
          });
          if (!n) throw new Error('bad');
          save(); render(); toast(added ? 'Restored ' + added + ' game' + (added === 1 ? '' : 's') : 'Those games are already here');
        } catch (err) { toast('That file isn\'t a scorebook backup.'); }
      };
      rd.readAsText(file);
    }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'setupForm') {
      var g = readSetupForm();
      if (ui.edit) {
        var live = game();
        live.info = g.info; live.settings = g.settings;
        ui.edit = false; ui.draft = null; save(); openGame(live.id); toast('Game info saved'); return;
      }
      db.games[g.id] = g; ui.draft = null; ui.gameId = g.id;
      g.sets.push(SB.newSet(g)); save(); ui.view = 'lineup'; render(); window.scrollTo(0, 0);
    } else if (e.target.id === 'lineupForm') {
      var gm = game(), set = gm.sets[curSetIdx(gm)];
      ui.kp = null;
      var err = lineupError(gm, set);
      if (err) { ui.lineupErr = err; render(); return; }
      ui.modal = { kind: 'check', pre: true }; render();
    }
  });

  /* physical keyboard support for laptops */
  document.addEventListener('keydown', function (e) {
    var inSub = ui.modal && (ui.modal.kind === 'sub' || ui.modal.kind === 'more' || ui.modal.kind === 'editlu');
    if (ui.kp || inSub) {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); keypadPress(e.key); return; }
      if (e.key === 'Backspace') { e.preventDefault(); keypadPress(inSub ? 'back' : 'clr'); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (inSub) { var b = document.querySelector('[data-act="dosub"],[data-act="docard"],[data-act="elsave"]'); if (b) b.click(); } else keypadPress('next');
        return;
      }
    }
    if (e.key === 'Escape') {
      if (ui.kp) { ui.kp = null; render(); }
      else if (ui.modal && ui.modal.kind !== 'check') { ui.modal = null; render(); }
    }
  });
  window.addEventListener('resize', function () { if (ui.kp) positionKeypad(); });
  window.addEventListener('scroll', function () { if (ui.kp) positionKeypad(); }, { passive: true });

  load();
  render();
})();
