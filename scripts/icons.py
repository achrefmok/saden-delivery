# Regenerates the PNG app icons in public/icons (requires Pillow).
from PIL import Image, ImageDraw, ImageFont
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
ORANGE, NAVY = (240, 138, 60), (27, 42, 78)

def font(size):
    for f in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()

def icon(size, maskable):
    s = 4 * size
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable: d.rectangle([0, 0, s, s], fill=ORANGE)
    else: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=ORANGE)
    f = font(int(s * (0.34 if maskable else 0.43)))
    d.text((s / 2, s / 2), 'SD', font=f, fill=NAVY, anchor='mm')
    return im.resize((size, size), Image.LANCZOS)

icon(192, False).save(os.path.join(OUT, 'icon-192.png'))
icon(512, False).save(os.path.join(OUT, 'icon-512.png'))
icon(512, True).save(os.path.join(OUT, 'maskable-512.png'))
print('icons ok')
