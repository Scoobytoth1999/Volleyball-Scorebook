from playwright.sync_api import sync_playwright
URL='file:///home/claude/volleyball-scorebook/retail/dist/Digital_Volleyball_Scorebook.html'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':800}, accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(URL); pg.screenshot(path='retail/home_empty.png')
    pg.click('[data-act=sample]'); pg.screenshot(path='retail/home.png', full_page=True)
    for style in ['school','club']:
        pass
    with pg.expect_download() as d: pg.click('[data-act=pdf]')
    d.value.save_as('retail/sample_school.pdf')
    with pg.expect_download() as d: pg.click('[data-act=backupall]')
    d.value.save_as('retail/backup.json')
    pg.click('[data-act=about]'); pg.screenshot(path='retail/about.png')
    pg.click('[data-act=close]')
    pg.click('[data-act=askdel]'); pg.click('[data-act=dodel]')
    pg.set_input_files('#importFile','retail/backup.json'); pg.wait_for_timeout(300)
    print('restored rows', pg.locator('.gamerow').count())
    print('errors', errs); b.close()
