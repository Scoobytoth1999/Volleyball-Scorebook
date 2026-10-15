from playwright.sync_api import sync_playwright
import random
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1024,'height':768}, accept_downloads=True)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
    pg.goto('file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html')
    pg.click('[data-act=new]')
    pg.fill('#f-home','Cranbrook'); pg.fill('#f-away','Brother Rice'); pg.fill('#f-site','MS gym'); pg.fill('#f-scorer','M. Toth')
    pg.check('#f-lib')
    pg.click('button[type=submit]')
    for t,nums in (('A',['5','3','12','7','9','21']),('B',['2','8','15','4','10','17'])):
        for k,n in enumerate(nums): pg.fill(f'#ln-{t}-{k}', n)
    pg.fill('#lib-A','1')
    pg.screenshot(path='s1_lineup.png')
    pg.click('button[type=submit]')
    pg.screenshot(path='s2_check.png')
    pg.click('[data-act=startset]')
    random.seed(3)
    for i in range(17):
        pg.wait_for_timeout(360); pg.click(f'[data-act=point][data-team={random.choice("AAB")}]')
    pg.click('[data-act=to][data-team=B]')
    pg.screenshot(path='s3_live.png')
    pg.click('[data-act=sub][data-team=A]')
    pg.click('[data-act=subout][data-num="12"]'); pg.fill('#subIn','3'); pg.click('[data-act=dosub]')
    pg.screenshot(path='s4_sub.png')
    pg.click('[data-act=close]')
    pg.goto('file:///home/claude/volleyball-scorebook/cranbrook/Volleyball_Scorebook.html')
    pg.click('[data-act=open]')
    for i in range(30):
        if pg.locator('.setover').count(): break
        pg.wait_for_timeout(360); pg.click('[data-act=point][data-team=A]')
    pg.screenshot(path='s5_setover.png')
    with pg.expect_download() as d: pg.click('[data-act=menu]') or pg.click('.menulist [data-act=pdf]')
    print('download', d.value.suggested_filename)
    pg.click('.menulist [data-act=home]') if pg.locator('.menulist').count() else None; pg.set_viewport_size({'width':390,'height':844})
    pg.screenshot(path='s6_home_phone.png', full_page=True)
    print('errors', errs)
    b.close()
