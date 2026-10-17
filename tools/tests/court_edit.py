"""v5 test: fix the on-court lineup after fat-fingered subs; home team starts on the right."""
import json, sys
from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
STATE = """() => { const k = Object.keys(localStorage).find(k => localStorage.getItem(k).includes('"sets"'));
  const all = JSON.parse(localStorage.getItem(k)); const g = (all.games || all).find ? (all.games || all).find(x => x.sets) : Object.values(all.games || all)[0];
  const si = g.sets.length - 1, R = SB.replay(g, si);
  return { court: { A: R.T.A.slots.map(s => s.current), B: R.T.B.slots.map(s => s.current) }, subs: { A: R.T.A.subCount, B: R.T.B.subCount },
    lineup: g.sets[si].lineup, subEvents: g.sets[si].events.filter(e => e.t === 'sub'), notes: R.notes.map(n => n.text),
    ignored: R.log.filter(e => e.ignored).length, score: R.score, left: g.sets[si].left }; }"""
def keys(pg, n):
    for ch in n: pg.click(f'.keys.inline [data-key="{ch}"]')
def edit(pg, team, k, n):
    pg.click(f'[data-act=elsel][data-team={team}][data-k="{k}"]')
    for _ in range(3): pg.click('.keys.inline [data-key=back]')
    keys(pg, n)
def sub(pg, team, out, inn):
    pg.click(f'[data-act=sub][data-team={team}]'); pg.click(f'[data-act=subout][data-num="{out}"]'); keys(pg, inn); pg.click('[data-act=dosub]')
def pts(pg, s):
    for t in s: pg.wait_for_timeout(360); pg.click(f'[data-act=point][data-team={t}]')
ok = True
def check(name, cond, detail=''):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + name, detail)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1024, 'height': 768}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.click('[data-act=new]'); pg.fill('#f-home', 'Cranbrook'); pg.fill('#f-away', 'Rice'); pg.click('button[type=submit]')
    check('home team starts on the right in set 1', pg.evaluate(STATE)['left'] == 'B')
    pg.click('[data-act=kp][data-team=A][data-k="0"]')
    for n in ['5', '3', '12', '7', '9', '21', '2', '8', '15', '4', '10', '17']:
        for ch in n: pg.click(f'#kp [data-key="{ch}"]')
        pg.click('#kp [data-key=next]')
    pg.click('button[type=submit]'); pg.click('[data-act=startset]')
    pts(pg, 'AABBA')
    # 1. typo on the number going in: 41 instead of 14
    sub(pg, 'A', '12', '41'); pts(pg, 'BA')
    pg.click('[data-act=editlu]'); pg.screenshot(path=f'{OUT}/v5_edit_court.png')
    edit(pg, 'A', 2, '14'); pg.screenshot(path=f'{OUT}/v5_edit_typing.png'); pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    s = pg.evaluate(STATE); pg.click('[data-act=close]')
    check('typo: #14 on court in spot III', s['court']['A'][2] == '14', s['court']['A'])
    check('typo: sub record now #14 for #12', s['subEvents'][0]['inn'] == '14' and s['subEvents'][0]['out'] == '12', s['subEvents'])
    check('typo: still 1 sub used', s['subs']['A'] == 1)
    # 2. wrong player tapped out: entered 6 for 7, really 6 for 9
    sub(pg, 'A', '7', '6'); pts(pg, 'AB')
    pg.click('[data-act=editlu]'); edit(pg, 'A', 3, '7'); edit(pg, 'A', 4, '6'); pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    s = pg.evaluate(STATE); pg.click('[data-act=close]')
    check('wrong out: court is 7 in IV, 6 in V', s['court']['A'][3:5] == ['7', '6'], s['court']['A'])
    check('wrong out: sub record now #6 for #9', s['subEvents'][1]['out'] == '9' and s['subEvents'][1]['inn'] == '6', s['subEvents'][1])
    check('wrong out: 2 subs used', s['subs']['A'] == 2)
    # 3. same thing done with Swap: 11 in for 21 (VI), really for 5 (I)
    sub(pg, 'A', '21', '11'); pts(pg, 'A')
    pg.click('[data-act=editlu]')
    pg.click('[data-act=elsel][data-team=A][data-k="5"]'); pg.click('[data-act=elswap]'); pg.click('[data-act=elsel][data-team=A][data-k="0"]')
    edit(pg, 'A', 5, '21')
    pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    s = pg.evaluate(STATE); pg.click('[data-act=close]')
    check('swap: 11 in I, 21 back in VI', s['court']['A'][0] == '11' and s['court']['A'][5] == '21', s['court']['A'])
    check('swap: sub record now #11 for #5', s['subEvents'][2]['out'] == '5', s['subEvents'][2])
    # 4. both teams at once: Rice starter #2 is really #22, and Cranbrook 14 is really 16
    pg.click('[data-act=editlu]'); edit(pg, 'B', 0, '22'); edit(pg, 'A', 2, '16'); pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    s = pg.evaluate(STATE); pg.click('[data-act=close]')
    check('both: Rice starting lineup now #22', s['lineup']['B'][0] == '22' and s['court']['B'][0] == '22', s['lineup']['B'])
    check('both: Cranbrook sub record now #16 for #12', s['subEvents'][0]['inn'] == '16', s['subEvents'][0])
    check('nothing ignored', s['ignored'] == 0)
    # 5. two starter typos at once: #3 is really #30, #7 is really #31
    pg.click('[data-act=editlu]'); edit(pg, 'A', 1, '30'); edit(pg, 'A', 3, '31'); pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    s = pg.evaluate(STATE); pg.click('[data-act=close]')
    check('two typos: starting lineup now 30 and 31', s['lineup']['A'][1] == '30' and s['lineup']['A'][3] == '31', s['lineup']['A'])
    check('two typos: subs unchanged', s['subs']['A'] == 3)
    # 6. a duplicate number is refused and nothing is saved
    before = pg.evaluate(STATE)
    pg.click('[data-act=editlu]'); edit(pg, 'A', 1, '6'); pg.click('[data-act=elsave]'); pg.wait_for_timeout(150)
    err = pg.inner_text('.modal .err'); check('duplicate shows an error', 'two spots' in err, err)
    pg.click('[data-act=close]'); check('duplicate saved nothing', pg.evaluate(STATE)['court'] == before['court'])
    # 7. starting-lineup tab still works
    pg.click('[data-act=editlu]'); pg.click('[data-act=elmode][data-mode=start]'); pg.screenshot(path=f'{OUT}/v5_edit_start.png')
    pg.click('[data-act=close]')
    print('notes:', s['notes']); print('score:', s['score'])
    pg.screenshot(path=f'{OUT}/v5_live.png')
    pg.click('[data-act=menu]')
    with pg.expect_download() as d: pg.click('.menulist [data-act=pdf]')
    d.value.save_as(f'{OUT}/v5.pdf')
    check('no JS errors', not errs, errs); b.close()
print('ALL PASS' if ok else 'SOME FAILED')
