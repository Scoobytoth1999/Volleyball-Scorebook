from playwright.sync_api import sync_playwright
URL='file:///home/claude/volleyball-scorebook/retail/dist/Digital_Volleyball_Scorebook.html'
O='shots/'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=2, accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL)
    # sample + PDFs both styles
    pg.click('[data-act=sample]'); pg.wait_for_timeout(2800)
    pg.screenshot(path=O+'01_home.png')
    with pg.expect_download() as d: pg.click('[data-act=pdf]')
    d.value.save_as(O+'Sample_School_Scoresheet.pdf')
    pg.click('[data-act=open]'); pg.click('[data-act=editinfo]')
    pg.select_option('#f-style','aau'); pg.fill('#f-comp','Fall Classic'); pg.fill('#f-city','Springfield, IL'); pg.fill('#f-pool','Gold'); pg.fill('#f-matchno','7')
    pg.click('button[type=submit]')
    with pg.expect_download() as d: pg.click('[data-act=pdf]')
    d.value.save_as(O+'Sample_Club_Scoresheet.pdf')
    pg.click('[data-act=home]'); pg.click('[data-act=askdel]'); pg.click('[data-act=dodel]')
    # new match flow
    pg.click('[data-act=new]')
    pg.fill('#f-home','Lincoln Lions'); pg.fill('#f-away','Westview Hawks'); pg.fill('#f-site','Main gym'); pg.fill('#f-scorer','Coach Taylor')
    pg.click('[data-act=color][data-team=A][data-c=navy]'); pg.click('[data-act=color][data-team=B][data-c=gold]')
    pg.fill('#f-gamenum','4')
    pg.wait_for_timeout(2800); pg.screenshot(path=O+'02_setup.png', full_page=True)
    pg.click('button[type=submit]')
    pg.click('[data-act=kp][data-team=A][data-k="0"]')
    for n in ['4','11','7','15','2','9','3','12','8','21','5','10']:
        for ch in n: pg.click(f'#kp [data-key="{ch}"]')
        if n=='15': pg.wait_for_timeout(2800); pg.screenshot(path=O+'03_lineup_keypad.png')
        pg.click('#kp [data-key=next]')
    pg.click('[data-act=captain][data-team=A][data-num="7"]'); pg.click('[data-act=captain][data-team=B][data-num="21"]')
    pg.wait_for_timeout(2800); pg.screenshot(path=O+'04_lineup.png')
    pg.click('button[type=submit]'); pg.wait_for_timeout(2800); pg.screenshot(path=O+'05_check.png')
    pg.click('[data-act=startset]')
    seq='AABABAAABBABAABA'
    for t in seq: pg.wait_for_timeout(360); pg.click(f'[data-act=point][data-team={t}]')
    pg.click('[data-act=to][data-team=B]'); pg.wait_for_timeout(2800)
    pg.screenshot(path=O+'06_live.png')
    pg.click('[data-act=sub][data-team=A]'); pg.click('[data-act=subout][data-num="11"]')
    pg.click('.keys.inline [data-key="1"]'); pg.click('.keys.inline [data-key="8"]'); pg.screenshot(path=O+'07_sub.png')
    pg.click('[data-act=dosub]'); pg.wait_for_timeout(2800)
    pg.click('[data-act=log]'); pg.click('button.logrow >> nth=2'); pg.screenshot(path=O+'08_log.png'); pg.click('[data-act=close]')
    pg.click('[data-act=more]'); pg.screenshot(path=O+'09_more.png'); pg.click('[data-act=close]')
    for i in range(60):
        if pg.locator('.setover').count(): break
        pg.wait_for_timeout(360); pg.click('[data-act=point][data-team=A]')
    pg.wait_for_timeout(2800); pg.screenshot(path=O+'10_setover.png')
    pg.click('.setover .btn.primary'); pg.click('[data-act=copy][data-team=A]'); pg.click('[data-act=copy][data-team=B]'); pg.wait_for_timeout(2800)
    pg.screenshot(path=O+'11_copy.png')
    pg.goto(URL); pg.click('[data-act=about]'); pg.screenshot(path=O+'12_about.png')
    print('errors', errs); b.close()
