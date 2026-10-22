"""v6 test: home team on the right every set, tap-to-retype boxes, Rotate button."""
import sys
from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
STATE = """() => { const k = Object.keys(localStorage).find(k => localStorage.getItem(k).includes('"sets"'));
  const all = JSON.parse(localStorage.getItem(k)); const list = all.games || all; const g = Array.isArray(list) ? list.find(x => x.sets) : Object.values(list)[0];
  const si = g.sets.length - 1, R = g.sets[si].started ? SB.replay(g, si) : null;
  return { si, left: g.sets.map(s => s.left), lineup: g.sets[si].lineup, court: R && R.T.A.court, notes: R ? R.notes.map(n => n.text) : [], score: R && R.score }; }"""
ok = True
def check(name, cond, detail=''):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + name, detail)
def kp(pg, n):
    for ch in n: pg.click(f'#kp [data-key="{ch}"]')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1024, 'height': 768})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.click('[data-act=new]'); pg.fill('#f-home', 'Cranbrook'); pg.fill('#f-away', 'Rice')
    pg.click('button[type=submit]')
    # type the lineups with Next
    pg.click('[data-act=kp][data-team=A][data-k="0"]')
    for n in ['5', '3', '12', '7', '9', '21', '2', '8', '15', '4', '10', '17']:
        kp(pg, n); pg.click('#kp [data-key=next]')
    s = pg.evaluate(STATE)
    check('lineups typed with Next', s['lineup']['A'] == ['5', '3', '12', '7', '9', '21'] and s['lineup']['B'] == ['2', '8', '15', '4', '10', '17'], s['lineup'])
    # tap a filled box and type: replaces instead of appending
    pg.click('[data-act=kp][data-team=A][data-k="2"]')
    check('tapped box shows old number faded', pg.locator('.nbox.active.fresh').count() == 1)
    pg.screenshot(path=f'{OUT}/v6_fresh.png')
    kp(pg, '14'); s = pg.evaluate(STATE)
    check('tap then type 14 replaces 12', s['lineup']['A'][2] == '14', s['lineup']['A'])
    pg.click('#kp [data-key=next]'); kp(pg, '6'); s = pg.evaluate(STATE)
    check('Next then type 6 replaces 7', s['lineup']['A'][3] == '6', s['lineup']['A'])
    pg.click('[data-act=kp][data-team=A][data-k="3"]'); kp(pg, '7'); kp(pg, '7'); s = pg.evaluate(STATE)
    check('second digit still appends (7 then 7 = 77)', s['lineup']['A'][3] == '77', s['lineup']['A'])
    pg.click('[data-act=kp][data-team=A][data-k="3"]'); kp(pg, '7')
    pg.click('[data-act=kp][data-team=A][data-k="2"]'); pg.click('#kp [data-key=clr]'); s = pg.evaluate(STATE)
    check('tap then Clear empties the box', s['lineup']['A'][2] == '', s['lineup']['A'])
    kp(pg, '12'); pg.click('#kp [data-key=next]')
    s = pg.evaluate(STATE); check('home team on the right in set 1', s['left'] == ['B'])
    pg.keyboard.press('Escape')
    pg.click('button[type=submit]'); pg.click('[data-act=startset]')
    # Rotate button
    s0 = pg.evaluate(STATE)
    pg.click('[data-act=rotate][data-team=A]'); pg.screenshot(path=f'{OUT}/v6_rotate.png')
    pg.click('.rotm [data-act=rot][data-dir="1"]'); s1 = pg.evaluate(STATE)
    check('Rotate forward moves Cranbrook one spot', s1['court'] == s0['court'][1:] + s0['court'][:1], (s0['court'], s1['court']))
    check('rotation noted on the sheet', any('Rotation corrected' in n for n in s1['notes']), s1['notes'])
    check('no point scored', s1['score'] == {'A': 0, 'B': 0})
    pg.click('.rotm [data-act=rot][data-dir="-1"]'); s2 = pg.evaluate(STATE)
    check('Rotate back returns it', s2['court'] == s0['court'], s2['court'])
    pg.click('.rotm [data-act=close]')
    pg.screenshot(path=f'{OUT}/v6_live.png')
    # edit lineup boxes also retype fresh
    pg.click('[data-act=editlu]'); pg.click('[data-act=elsel][data-team=B][data-k="0"]')
    for ch in '22': pg.click(f'.keys.inline [data-key="{ch}"]')
    val = pg.inner_text('.elpanel .kpdisplay'); check('edit lineup: tap then type replaces', val.strip() == '22', val)
    pg.click('[data-act=close]')
    # play set 1 out and check set 2 side
    for i in range(25):
        pg.click('[data-act=point][data-team=A]'); pg.wait_for_timeout(360)
    if pg.locator('[data-act=nextset]').count(): pg.click('[data-act=nextset]')
    s = pg.evaluate(STATE); check('home team on the right in set 2 too', s['left'] == ['B', 'B'], s['left'])
    check('no JS errors', not errs, errs); b.close()
print('ALL PASS' if ok else 'SOME FAILED')
