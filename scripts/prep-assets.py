"""One-off asset prep. Reads brand/ + reference/, writes src/assets/.
Run: python -I scripts/prep-assets.py
- Logo source: brand/LOGO SHUTDOWN PNG...png  (IHDR 2000x2000, 8-bit, colortype 6 RGBA,
  87.0% alpha 0, 3,479,665 pure-black (0,0,0,0) transparent pixels -> premultiplied resize required)
- Palette sampled from pixels: bg #000000 (logo JPG dominant exact), fg #efefef (logo PNG dominant opaque).
"""
import re, shutil
from PIL import Image
import numpy as np

SRC = 'brand/LOGO SHUTDOWN PNG...png'
im = Image.open(SRC)
assert im.mode == 'RGBA'
al = np.array(im)[..., 3]
mask = al > 127
ys, xs = np.where(mask)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = int(max(x1 - x0, y1 - y0) * 1.16)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
crop = im.crop(box)

def premul_resize(img, n):
    # RGBa = premultiplied alpha; resizing here avoids black fringe from (0,0,0,0) regions
    return img.convert('RGBa').resize((n, n), Image.LANCZOS).convert('RGBA')

premul_resize(crop, 512).save('src/assets/logo.png', optimize=True)
premul_resize(crop, 192).save('src/assets/logo-192.png', optimize=True)
out = np.array(Image.open('src/assets/logo.png'))
edge = (out[..., 3] > 0) & (out[..., 3] < 255)
print('edge px', int(edge.sum()), 'edge rgb mean', out[edge][:, :3].mean(0).round(1), '(must stay ~efefef, not darkened)')

# --- favicon: geometry measured from the 2000px pixel grid (see scan: pill x907-1093 y467-972,
# ring outer x484-1514, centre y1016, outer R515, inner R336, gap edges x851/x1149) ---
tok = open('src/css/tokens.css').read()
BG = re.search(r'--color-bg:\s*(#[0-9a-fA-F]{6})', tok).group(1)
FG = re.search(r'--color-fg:\s*(#[0-9a-fA-F]{6})', tok).group(1)
CX, CY, RO, RI, GL, GR = 999, 1016, 515, 336, 851, 1149
yo = CY - (RO**2 - (GL - CX)**2) ** .5
yi = CY - (RI**2 - (GL - CX)**2) ** .5
H = np.hypot
# analytic coverage vs real mask (IoU)
Y, X = np.mgrid[0:2000, 0:2000]
d = H(X + .5 - CX, Y + .5 - CY)
ring = (d <= RO) & (d >= RI) & ~((X + .5 > GL) & (X + .5 < GR) & (Y + .5 < CY))
pill = (X + .5 >= 907) & (X + .5 <= 1093) & (Y + .5 >= 467) & (Y + .5 <= 972)
cap = (H(X + .5 - 1000, Y + .5 - 560) > 93) & (Y + .5 < 560)
cap2 = (H(X + .5 - 1000, Y + .5 - 879) > 93) & (Y + .5 > 879)
pill &= ~cap & ~cap2
shape = ring | pill
iou = (shape & mask).sum() / (shape | mask).sum()
print('favicon trace IoU vs real alpha mask: %.4f' % iou)
s = 26 / 1065
tx, ty = 16 - 999.5 * s, 16 - 999 * s
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
<rect width="32" height="32" rx="6" fill="{BG}"/>
<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})" fill="{FG}">
<path d="M{GL} {yo:.1f}A{RO} {RO} 0 1 0 {GR} {yo:.1f}V{yi:.1f}A{RI} {RI} 0 1 1 {GL} {yi:.1f}Z"/>
<rect x="907" y="467" width="186" height="505" rx="93"/>
</g>
</svg>
'''
open('src/assets/favicon.svg', 'w').write(svg)
shutil.copyfile('reference/SAMPUL SHUTDOWN JPG.jpg.jpeg', 'src/assets/cover.jpg')
print('ok')
