#!/usr/bin/env python3
"""Ubah frontend/assets/simbologi.stylx (ArcGIS Pro style = SQLite) menjadi frontend/assets/simbologi.js
yang bisa dibaca browser tanpa fetch (aman dibuka lewat file://).
Pakai:  python3 tools/stylx_to_js.py [input.stylx] [output.js]
Butuh:  pip install pillow
"""
import sqlite3, json, sys, io, base64, re
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'frontend/assets/simbologi.stylx'
dst = sys.argv[2] if len(sys.argv) > 2 else 'frontend/assets/simbologi.js'

hexc = lambda v: '#%02x%02x%02x' % tuple(int(round(x)) for x in v[:3])
def col(c): return hexc(c['values']) if c and c.get('values') else None

def bmp_to_png(url, subst):
    """BMP 1-bit (hitam/putih) -> PNG: hitam diganti warna baru, putih dibuat transparan agar basemap tetap terlihat."""
    raw = base64.b64decode(url.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    new_black = (0, 0, 0)
    for s in subst or []:
        if s['oldColor']['values'][:3] == [0, 0, 0]:
            new_black = tuple(s['newColor']['values'][:3])
    out = Image.new('RGBA', im.size)
    px, po = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y]
            po[x, y] = (*new_black, 255) if (r + g + b) < 384 else (0, 0, 0, 0)
    buf = io.BytesIO(); out.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), im.size

def line_of(sym):
    for l in (sym or {}).get('symbolLayers', []):
        if l.get('type') == 'CIMSolidStroke': return col(l.get('color')), l.get('width', 1)
    return None, 1

def marker_color(l):
    s = l.get('symbol') or {}
    for a in s.get('symbolLayers', []):
        if a.get('type') == 'CIMSolidFill': return col(a['color'])
        if a.get('type') == 'CIMSolidStroke': return col(a['color'])
    return '#444444'

out = {}
db = sqlite3.connect(src)
for name, content in db.execute('select NAME, CONTENT from ITEMS'):
    j = json.loads(content.rstrip('\x00'))
    spec = {'fill': None, 'stroke': None, 'hatch': [], 'pic': None, 'mk': None}
    for l in j.get('symbolLayers', []):
        if not l.get('enable', True): continue
        t = l['type']
        if t == 'CIMSolidFill' and not spec['fill']: spec['fill'] = col(l['color'])
        elif t == 'CIMSolidStroke' and not spec['stroke']: spec['stroke'] = {'c': col(l['color']), 'w': l.get('width', 1)}
        elif t == 'CIMHatchFill':
            c, w = line_of(l.get('lineSymbol'))
            spec['hatch'].append({'a': l.get('rotation', 0), 's': l.get('separation', 5), 'w': w, 'c': c})
        elif t in ('CIMPictureFill', 'CIMPictureMarker') and not spec['pic']:
            png, size = bmp_to_png(l['url'], l.get('colorSubstitutions'))
            mp = l.get('markerPlacement') or {}
            spec['pic'] = {'src': png, 'px': size[0], 'h': l.get('height') or l.get('size') or size[1], 'step': mp.get('stepX')}
        elif t == 'CIMCharacterMarker' and not spec['mk']:
            mp = l.get('markerPlacement') or {}
            spec['mk'] = {'c': marker_color(l), 'size': l.get('size', 5), 'step': mp.get('stepX', 6), 'ch': l.get('characterIndex'), 'font': l.get('fontFamilyName')}
    # warna wakil (untuk pie/bar): garis arsir > isi > garis tepi > penanda
    rep = (spec['hatch'][0]['c'] if spec['hatch'] else None) or spec['fill'] or (spec['stroke'] or {}).get('c') or (spec['mk'] or {}).get('c')
    if not rep and spec['pic']:
        rep = '#666666'
    spec['rep'] = rep or '#999999'
    out[name] = spec

with open(dst, 'w', encoding='utf-8') as f:
    f.write('// Dibuat otomatis oleh tools/stylx_to_js.py dari simbologi.stylx - jangan diedit manual.\n')
    f.write('window.SIMBOLOGI = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
kinds = {'fill': 0, 'hatch': 0, 'pic': 0, 'mk': 0, 'stroke-only': 0}
for s in out.values():
    if s['pic']: kinds['pic'] += 1
    elif s['mk']: kinds['mk'] += 1
    elif s['hatch']: kinds['hatch'] += 1
    elif s['fill']: kinds['fill'] += 1
    else: kinds['stroke-only'] += 1
print(len(out), 'simbol ->', dst, kinds)
angles = sorted({h['a'] for s in out.values() for h in s['hatch']}); print('sudut arsiran:', angles)
print('font marker:', sorted({s['mk']['font'] for s in out.values() if s['mk']}))
