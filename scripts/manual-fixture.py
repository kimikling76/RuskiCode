# Writes tests/fixtures/manual/sample-unit.pdf: a small synthetic unit for the manual engine tests.
# The text is generic and written for the test. It has the kinds of objects a real unit has: an exercise header
# band with a number badge, headphones and an audio code, example lines with a highlighted word, items in two
# columns, photos (one with transparency), a white patch over old text, footer, side tab and a page with a
# gradient (which the editor keeps as it is).
#   python3 scripts/manual-fixture.py
import io, os
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import Color, white
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONTS = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DejaVuSans', FONTS + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', FONTS + 'DejaVuSans-Bold.ttf'))
W, H = A4
teal = Color(0.09, 0.337, 0.325)
dark = Color(0.086, 0.149, 0.149)
band = Color(0.82, 0.9, 0.88)
blue = Color(0, 0.278, 0.8)

def photo(seed, alpha=False):
    im = Image.new('RGBA' if alpha else 'RGB', (120, 90), (40 + seed * 30, 120, 160, 255) if alpha else (40 + seed * 30, 120, 160))
    d = ImageDraw.Draw(im)
    d.ellipse((30, 15, 90, 75), fill=(230, 190, 90, 255) if alpha else (230, 190, 90))
    if alpha:
        for x in range(120):
            for y in range(20):
                im.putpixel((x, y), (0, 0, 0, 0))
    out = io.BytesIO()
    im.save(out, 'PNG' if alpha else 'JPEG', quality=80)
    out.seek(0)
    return ImageReader(out)

def header(c, top, number, code, instruction):
    c.setFillColor(band)
    p = c.beginPath(); p.moveTo(28, top - 25); p.lineTo(556, top - 25); p.lineTo(564, top - 12); p.lineTo(556, top); p.lineTo(28, top); p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(teal); c.circle(45, top - 12.5, 10, stroke=0, fill=1)
    c.setFillColor(white); c.setFont('DejaVuSans-Bold', 11); c.drawCentredString(45, top - 16.5, number)
    c.setStrokeColor(teal); c.setLineWidth(1.5)
    c.arc(64, top - 16, 79, top - 2, 0, 180)
    c.roundRect(63.5, top - 20, 3.5, 7, 1.5, stroke=1, fill=0)
    c.roundRect(75.5, top - 20, 3.5, 7, 1.5, stroke=1, fill=0)
    c.setFillColor(teal); c.setFont('DejaVuSans-Bold', 9.5); c.drawString(85, top - 16.5, code)
    c.setFillColor(dark); c.setFont('DejaVuSans-Bold', 10.5); c.drawString(130, top - 16.5, instruction)

def line(c, x, y, parts):
    for font, size, color, text in parts:
        c.setFont(font, size); c.setFillColor(color); c.drawString(x, y, text)
        x += pdfmetrics.stringWidth(text, font, size)

def footer(c, number, side=False):
    c.setFont('DejaVuSans', 9); c.setFillColor(teal); c.drawString(28, 20, 'Тестовый курс · A1')
    c.setFont('DejaVuSans-Bold', 9); c.drawCentredString(W / 2, 20, number)
    if side:
        c.setFillColor(teal); c.roundRect(580, 718, 18, 40, 4, stroke=0, fill=1)
        c.setFillColor(white); c.setFont('DejaVuSans-Bold', 9); c.drawString(583, 733, '9')

c = canvas.Canvas(os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'manual', 'sample-unit.pdf'), pagesize=A4, invariant=1)
c.setTitle('Sample unit for tests')

# Page 1
c.setFont('DejaVuSans-Bold', 25); c.setFillColor(teal); c.drawString(32, 790, 'Урок 9. Тест')
header(c, 760, '1', '9.01', 'Скажи по образцу. Используй «тоже».')
line(c, 35, 717, [('DejaVuSans-Bold', 11, teal, 'Анна — студентка. Олег '), ('DejaVuSans-Bold', 11, blue, 'тоже'), ('DejaVuSans-Bold', 11, teal, ' студент.')])
line(c, 35, 695, [('DejaVuSans-Bold', 11, teal, 'Это кот. Это '), ('DejaVuSans-Bold', 11, blue, 'тоже'), ('DejaVuSans-Bold', 11, teal, ' кот.')])
left = ['1. Это ла́мпа. → ________', '2. Это дом. → ________', '3. Это А́нна. → ________']
right = ['4. Это стол. → ________', '5. Это парк. → ________', '6. Это мама. → ________']
for i, t in enumerate(left): line(c, 35, 667 - 22 * i, [('DejaVuSans', 10.5, dark, t)])
for i, t in enumerate(right): line(c, 310, 667 - 22 * i, [('DejaVuSans', 10.5, dark, t)])
header(c, 580, '2', '9.02', 'Посмотри и скажи.')
c.saveState(); p = c.beginPath(); p.roundRect(35, 440, 120, 90, 4); c.clipPath(p, stroke=0); c.drawImage(photo(1), 35, 440, 120, 90); c.restoreState()
c.drawImage(photo(2, alpha=True), 200, 440, 120, 90, mask='auto')
# An old line, then a white patch over it and the corrected line on top (as an earlier edit leaves it).
line(c, 35, 400, [('DejaVuSans', 10.5, dark, '1. Старый текст с ошибкой.')])
c.setFillColor(white); c.setStrokeColor(white); c.setLineWidth(1); c.rect(30, 392, 300, 20, stroke=1, fill=1)
line(c, 35, 400, [('DejaVuSans', 10.5, dark, '1. Это '), ('DejaVuSans-Bold', 10.5, dark, 'новый'), ('DejaVuSans', 10.5, dark, ' текст.')])
footer(c, '5', side=True)
c.showPage()

# Page 2
header(c, 810, '3', '9.03', 'Прочитай.')
for i, t in enumerate(['Это школа. Это Анна. Анна — учительница.', 'Это Олег. Олег — студент.']): line(c, 35, 768 - 22 * i, [('DejaVuSans', 10.5, dark, t)])
footer(c, '6')
c.showPage()

# Page 3: a gradient, which the editor keeps from the original.
c.linearGradient(0, 300, 0, 600, (band, teal))
c.setFont('DejaVuSans-Bold', 20); c.setFillColor(white); c.drawString(60, 450, 'Повторение')
footer(c, '7')
c.showPage()
c.save()
