"""Builds retail/package/listing/Preview.pdf: guide pages + watermarked sample sheets."""
import io, sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
R = '/home/claude/volleyball-scorebook/retail/package/'
GUIDE_PAGES = [1, 4, 5, 6]
def mark(w, h):
    b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(w, h))
    c.setFillColorRGB(0.12, 0.23, 0.43, alpha=0.13); c.setFont('Helvetica-Bold', 120)
    c.translate(w / 2, h / 2); c.rotate(30); c.drawCentredString(0, -40, 'PREVIEW'); c.save()
    b.seek(0); return PdfReader(b).pages[0]
out = PdfWriter()
g = PdfReader(R + 'product/Quick-Start_Guide.pdf')
for n in GUIDE_PAGES: out.add_page(g.pages[n - 1])
for f in ('Sample_School_Scoresheet.pdf', 'Sample_Club_Scoresheet.pdf'):
    p = PdfReader(R + 'product/' + f).pages[0]
    p.merge_page(mark(float(p.mediabox.width), float(p.mediabox.height))); out.add_page(p)
out.write(R + 'listing/Preview.pdf'); print('pages', len(out.pages))
