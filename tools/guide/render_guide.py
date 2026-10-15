from playwright.sync_api import sync_playwright
import pathlib, sys
d=pathlib.Path(__file__).parent
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.goto('file://'+str(d/'guide.html')); pg.wait_for_timeout(500)
    pg.pdf(path=str(d/'Quick-Start_Guide.pdf'), format='Letter', print_background=True, prefer_css_page_size=True,
           display_header_footer=True, header_template='<span></span>',
           footer_template='<div style="font-size:8px;color:#556171;width:100%;padding:0 0.65in;display:flex;justify-content:space-between;font-family:Inter,Arial"><span>Digital Volleyball Scorebook · Quick-Start Guide</span><span class="pageNumber"></span></div>')
    b.close()
