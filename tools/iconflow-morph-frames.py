#!/usr/bin/env python3
"""Bake approved Morph poses into native image strips. Standard library only."""
import argparse
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FRAMES, WIND, FIRE_MS = 128, 31, 600
NUMBER = re.compile(r"[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?", re.I)

def nums(text):
    return [float(n) for n in NUMBER.findall(text)]

def fmt(value):
    return str(round(value, 5)).removesuffix('.0')

def spring(start, target, ms, response, velocity=0):
    t, w = max(0, ms) / 1000, 8 / (response / 1000)
    y = start - target
    b = velocity + w * y
    e = math.exp(-w * t)
    return target + (y + b * t) * e, (velocity - w * b * t) * e

def pose(part, value):
    value = {**part.get('rest', {}), **(value or {})}
    transform = nums(value['transform']) if value.get('transform') else [value.get('x', 0), value.get('y', 0), value.get('angle', 0)]
    node = ET.fromstring('<g>' + part['svg'] + '</g>')
    path = node.find('.//path')
    path_data=value.get('d', path.get('d') if path is not None else None)
    if path_data and path_data.startswith('path("'): path_data=path_data[6:-2]
    return dict(x=transform[0], y=transform[1], angle=transform[2],
                fill=value.get('fillOpacity', float(path.get('fill-opacity', '1')) if path is not None else 1),
                d=path_data)

def interpolate(a, b, ms, response, returned=None):
    def sample(x, y, z=None):
        if returned and ms > returned[0]:
            p, v = spring(x, y, returned[0], response)
            return spring(p, z, ms-returned[0], response, v)[0]
        return spring(x, y, ms, response)[0]
    result = {k:sample(a[k], b[k], returned[1][k] if returned else None) for k in ['x', 'y', 'angle', 'fill']}
    result['d'] = a['d']
    if a['d'] and b['d'] and a['d'] != b['d']:
        aa, bb = nums(a['d']), nums(b['d'])
        cc = nums(returned[1]['d']) if returned else [None]*len(aa)
        assert len(aa) == len(bb) == len(cc), 'incompatible path landmarks'
        values = iter(sample(x,y,z) for x,y,z in zip(aa,bb,cc))
        result['d'] = NUMBER.sub(lambda _:fmt(next(values)), a['d'])
    return result

def render(glyph, poses):
    groups = []
    timeline = glyph.get('timeline')
    marker = timeline['baselineY'] + poses[timeline['marker']]['y'] if timeline else 0
    for i, (part, value) in enumerate(zip(glyph['parts'], poses)):
        node = ET.fromstring('<g>' + part['svg'].replace('currentColor', 'context-fill') + '</g>')
        cx, cy = part.get('pivot', [12,12])
        node.set('transform', f"translate({fmt(value['x'])} {fmt(value['y'])}) rotate({fmt(value['angle'])} {cx} {cy})")
        path = node.find('.//path')
        if path is not None:
            if value['d']: path.set('d', value['d'])
            fill = max(0, min(1, value['fill']))
            if timeline and 0 < i < timeline['marker']:
                base = float(path.get('fill-opacity', '1'))
                fill = base + (1-base)*max(0,min(1,(timeline['thresholds'][i-1]-marker)/timeline['span']))
            path.set('fill-opacity', fmt(fill))
        groups.append(ET.tostring(node, encoding='unicode'))
    return ''.join(groups)

def build():
    data = json.loads((ROOT/'iconflow/morph.json').read_text())
    controls = {c['id']:c for c in data['controls']}
    files, index = {}, {'frames':FRAMES, 'wind':WIND, 'fireMs':FIRE_MS, 'glyphs':{}}
    for key, glyph in data['glyphs'].items():
        control = controls.get(glyph.get('controlId'))
        states = control['states'] if control else [None]
        rows = [(a,b) for a in states for b in states if a is not b] if control else [(None,None)]
        body = []
        for row, (source, target) in enumerate(rows):
            rests = [pose(p, source['values'][i] if source else None) for i,p in enumerate(glyph['parts'])]
            winds = [pose(p, source['wind'][i] if source else {**p.get('wind',{}), **({'d':p['morph']['wind']} if p.get('morph') else {})}) for i,p in enumerate(glyph['parts'])]
            fires = [pose(p, target['values'][i] if target else {**p.get('action',{}), **({'d':p['morph']['action']} if p.get('morph') else {})}) for i,p in enumerate(glyph['parts'])]
            for i,p in enumerate(glyph['parts']):
                if not control: fires[i]['angle'] += p.get('spin',0)
            for frame in range(FRAMES):
                if frame <= WIND:
                    values = [interpolate(a,b,180*frame/WIND,180) for a,b in zip(rests,winds)]
                    if frame == WIND: values = winds
                else:
                    ms = FIRE_MS*(frame-WIND)/(FRAMES-1-WIND)
                    values = [interpolate(a,b,ms,260 if control else p.get('responseMs',400+i*35 if p.get('spin') else 190+i*20),
                              None if control or p.get('spin') else (p.get('returnMs',130+i*18),rests[i]))
                              for i,(a,b,p) in enumerate(zip(winds,fires,glyph['parts']))]
                    if frame == FRAMES-1: values = fires if control else [fires[i] if p.get('spin') else rests[i] for i,p in enumerate(glyph['parts'])]
                body.append(f'<svg x="{frame*24}" y="{row*24}" width="24" height="24" viewBox="0 0 24 24">'+render(glyph,values)+'</svg>')
        width, height = FRAMES*24, len(rows)*24
        files[ROOT/f'iconflow/icons/morph/{key}.svg'] = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" preserveAspectRatio="none">'+''.join(body)+'</svg>\n'
        index['glyphs'][key] = {'rows':[[a['id'],b['id']] if control else ['rest','rest'] for a,b in rows]}
    files[ROOT/'iconflow/morph-frames.json'] = json.dumps(index,separators=(',',':'))+'\n'
    return files

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    files=build()
    for path, content in files.items():
        if args.check: assert path.read_text()==content, path
        else: path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
    print(f'{len(files)-1} native sprite sheets, {FRAMES} frames per row, {sum(len(s.encode()) for s in files.values())} bytes')
