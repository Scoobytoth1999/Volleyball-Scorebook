from playwright.sync_api import sync_playwright
import random
URL='file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1024,'height':768})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(URL); pg.click('[data-act=new]')
    pg.fill('#f-home','Cranbrook'); pg.fill('#f-away','Brother Rice'); pg.fill('#f-site','MS gym')
    pg.click('[data-act=color][data-team=A][data-c=maroon]'); pg.click('[data-act=color][data-team=B][data-c=gold]')
    pg.select_option('#f-level','Varsity'); print('varsity sets', pg.input_value('#f-sets'), pg.input_value('#f-format'))
    pg.select_option('#f-level','7th grade'); print('7th', pg.input_value('#f-sets'), pg.input_value('#f-format'), pg.input_value('#f-p2'))
    print('home kept', pg.input_value('#f-home'))
    pg.screenshot(path='v2_setup.png', full_page=True)
    pg.click('button[type=submit]')
    pg.click('[data-act=kp][data-team=A][data-k="0"]')
    for n in ['5','3','12','7','9','21','2','8','15','4','10','17']:
        for ch in n: pg.click(f'#kp [data-key="{ch}"]')
        if n=='3': pg.screenshot(path='v2_keypad.png')
        pg.click('#kp [data-key=next]')
    print('lineup A', [pg.inner_text(f'[data-act=kp][data-team=A][data-k="{k}"]') for k in range(6)])
    pg.click('button[type=submit]'); pg.click('[data-act=startset]')
    random.seed(5)
    for i in range(14):
        pg.wait_for_timeout(360); pg.click(f'[data-act=point][data-team={random.choice("AAB")}]')
    pg.click('[data-act=to][data-team=B]')
    pg.screenshot(path='v2_live.png')
    pg.click('[data-act=sub][data-team=A]'); pg.click('[data-act=subout][data-num="12"]')
    pg.click('.keys.inline [data-key="1"]'); pg.click('.keys.inline [data-key="4"]')
    pg.screenshot(path='v2_sub.png'); pg.click('[data-act=dosub]')
    pg.click('[data-act=log]'); pg.click('button.logrow >> nth=2'); pg.screenshot(path='v2_log.png')
    pg.click('[data-act=logflip]'); pg.click('[data-act=close]')
    pg.click('[data-act=togglelog]'); pg.screenshot(path='v2_live_nolog.png'); pg.click('[data-act=togglelog]')
    pg.click('[data-act=check]'); pg.screenshot(path='v2_check.png'); pg.click('[data-act=close]')
    for s in range(3):
        for i in range(60):
            if pg.locator('.setover').count(): break
            pg.wait_for_timeout(360); pg.click('[data-act=point][data-team=A]')
        btn=pg.locator('.setover .btn.primary'); txt=btn.inner_text(); print('setover btn', txt); btn.click()
        if 'Finish' in txt: break
        pg.click('[data-act=copy][data-team=A]'); pg.click('[data-act=copy][data-team=B]')
        if s==0: pg.screenshot(path='v2_lineup2.png', full_page=True)
        pg.click('button[type=submit]'); pg.click('[data-act=startset]')
    pg.screenshot(path='v2_summary.png', full_page=True)
    pg.click('[data-act=newmatch]'); print('carried site', pg.input_value('#f-site'), 'home blank', repr(pg.input_value('#f-home')))
    pg.set_viewport_size({'width':390,'height':844}); pg.goto(URL); pg.click('[data-act=open]')
    print('errors', errs); b.close()
