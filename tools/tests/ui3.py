from playwright.sync_api import sync_playwright
import random
URL='file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1024,'height':768}, accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(URL); pg.click('[data-act=new]')
    pg.fill('#f-home','Cranbrook'); pg.fill('#f-away','Brother Rice')
    pg.select_option('#f-level','Club 14U'); print('club style', pg.input_value('#f-style'), 'comp field', pg.locator('#f-comp').count())
    pg.fill('#f-comp','Fall Classic')
    pg.select_option('#f-level','7th grade'); print('7th style', pg.input_value('#f-style'), 'gamenum', pg.locator('#f-gamenum').count())
    pg.fill('#f-gamenum','14'); pg.fill('#f-ref2','A. Lee')
    pg.screenshot(path='v3_setup.png', full_page=True)
    pg.click('button[type=submit]')
    pg.click('[data-act=kp][data-team=A][data-k="0"]')
    for n in ['5','3','12','7','9','21','2','8','15','4','10','17']:
        for ch in n: pg.click(f'#kp [data-key="{ch}"]')
        pg.click('#kp [data-key=next]')
    pg.click('[data-act=captain][data-team=A][data-num="12"]')
    pg.screenshot(path='v3_lineup.png', full_page=True)
    pg.click('button[type=submit]'); pg.click('[data-act=startset]')
    random.seed(4)
    for i in range(10):
        pg.wait_for_timeout(360); pg.click(f'[data-act=point][data-team={random.choice("AB")}]')
    pg.click('[data-act=more]'); pg.click('[data-act=cardteam][data-team=B]'); pg.click('[data-act=cardcolor][data-c=red]')
    pg.click('.morem [data-key="8"]'); pg.screenshot(path='v3_more.png'); pg.click('[data-act=docard]')
    pg.click('[data-act=more]'); pg.click('[data-act=replay]')
    pg.screenshot(path='v3_live.png')
    for i in range(80):
        if pg.locator('.setover').count(): break
        pg.wait_for_timeout(360); pg.click('[data-act=point][data-team=A]')
    with pg.expect_download() as d:
        pg.click('[data-act=menu]'); pg.click('.menulist [data-act=pdf]')
    d.value.save_as('v3_ui.pdf'); print('pdf ok')
    pg.click('[data-act=close]')
    pg.click('.setover .btn.primary'); pg.click('[data-act=copy][data-team=A]')
    print('copied captain', pg.locator('.capchip.on').count())
    pg.set_viewport_size({'width':390,'height':844}); pg.screenshot(path='v3_lineup_phone.png', full_page=True)
    print('errors', errs); b.close()
