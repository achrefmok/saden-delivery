# Generates every brand asset from ONE source file (npm run brand).
# To change the logo: replace public/brand/logo-source.(png|jpg) and run `npm run brand`.
#   public/brand/logo.png        colour logo, transparent background (UI: navbar, login, dashboard)
#   public/brand/logo-print.png  black & white, high contrast, white background (PDF bordereaux, labels)
#   public/brand/favicon-32.png, favicon-64.png
#   public/icons/icon-192.png, icon-512.png, maskable-512.png (PWA)
import os, sys
from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
BRAND = os.path.join(ROOT, 'brand')
src = next((os.path.join(BRAND, f) for f in ('logo-source.png', 'logo-source.jpg', 'logo-source.jpeg') if os.path.exists(os.path.join(BRAND, f))), None)
if not src:
    sys.exit('public/brand/logo-source.png|jpg introuvable')

base = Image.open(src).convert('RGBA')
# square canvas
w, h = base.size
side = max(w, h)
sq = Image.new('RGBA', (side, side), (255, 255, 255, 255))
sq.paste(base, ((side - w) // 2, (side - h) // 2))

# transparent background: flood-fill the near-white area connected to the borders
def transparent(img, tol=28):
    im = img.copy()
    mask = Image.new('L', im.size, 0)
    # JPEG noise / grey frame: snap near-white pixels to pure white before filling
    lo = Image.eval(im.convert('L'), lambda v: 255 if v >= 255 - tol else 0)
    rgb = Image.composite(Image.new('RGB', im.size, (255, 255, 255)), im.convert('RGB'), lo)
    marker = (255, 0, 255)
    for seed in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
        if rgb.getpixel(seed) != marker:
            ImageDraw.floodfill(rgb, seed, marker, thresh=tol)
    px, mp = rgb.load(), mask.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y] == marker:
                mp[x, y] = 255
    alpha = ImageOps.invert(mask)
    im.putalpha(alpha)
    return im

colour = transparent(sq)
bbox = colour.getbbox() or (0, 0, side, side)
pad = int(side * 0.02)
bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(side, bbox[2] + pad), min(side, bbox[3] + pad))
colour = colour.crop(bbox)
cw, ch = colour.size
cs = max(cw, ch)
logo = Image.new('RGBA', (cs, cs), (255, 255, 255, 0))
logo.paste(colour, ((cs - cw) // 2, (cs - ch) // 2), colour)
logo.resize((512, 512), Image.LANCZOS).save(os.path.join(BRAND, 'logo.png'), optimize=True)

# black & white version for printing (orange → mid grey, black kept, white paper)
on_white = Image.new('RGB', logo.size, (255, 255, 255))
on_white.paste(logo, mask=logo.split()[3])
grey = ImageOps.autocontrast(ImageOps.grayscale(on_white), cutoff=1)
grey.resize((512, 512), Image.LANCZOS).save(os.path.join(BRAND, 'logo-print.png'), optimize=True)

# favicons and PWA icons (logo on a white rounded tile)
def tile(size, scale, rounded=True):
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22) if rounded else 0, fill=255)
    t.paste(bg, mask=m)
    inner = int(size * scale)
    lg = logo.resize((inner, inner), Image.LANCZOS)
    t.paste(lg, ((size - inner) // 2, (size - inner) // 2), lg)
    return t

tile(32, 0.98).save(os.path.join(BRAND, 'favicon-32.png'))
tile(64, 0.98).save(os.path.join(BRAND, 'favicon-64.png'))
os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
tile(192, 0.92).save(os.path.join(ROOT, 'icons', 'icon-192.png'))
tile(512, 0.92).save(os.path.join(ROOT, 'icons', 'icon-512.png'))
tile(512, 0.72, rounded=False).save(os.path.join(ROOT, 'icons', 'maskable-512.png'))
print('brand OK:', ', '.join(['logo.png', 'logo-print.png', 'favicon-32/64.png', 'icons/icon-192/512.png', 'maskable-512.png']))
