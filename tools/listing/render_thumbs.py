"""Renders the four 1500x1500 TpT thumbnails from thumbs.html."""
import pathlib
from playwright.sync_api import sync_playwright
d = pathlib.Path(__file__).parent
out = pathlib.Path('/home/claude/volleyball-scorebook/retail/package/listing')
names = ['Thumbnail_1_Cover', 'Thumbnail_2_Scoring', 'Thumbnail_3_Scoresheets', 'Thumbnail_4_Features']
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1500, 'height': 1500})
    pg.goto('file://' + str(d / 'thumbs.html')); pg.wait_for_timeout(800)
    for i, n in enumerate(names):
        pg.locator('#t%d' % (i + 1)).screenshot(path=str(out / (n + '.png')))
    b.close()
print('ok')
