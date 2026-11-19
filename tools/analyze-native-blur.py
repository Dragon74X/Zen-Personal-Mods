#!/usr/bin/env python3
"""Measure a local probe ZIP without extracting it. Requires Pillow, like zen-smoke.

python3 tools/analyze-native-blur.py /path/to/capture.zip > /path/to/analysis.json
python3 tools/analyze-native-blur.py --self-test
No upload. Output omits user paths, dates, window/process IDs and graphics data.
Metrics describe captured samples; they do not certify smoothness or freshness.
"""
import io
import json
from pathlib import Path
import statistics
import sys
import zipfile

from PIL import Image, ImageChops, ImageStat


def metrics(image):
    image = image.convert('RGB')
    gray = image.convert('L')
    mean = ImageStat.Stat(gray).mean[0]
    edge = ImageStat.Stat(ImageChops.difference(
        gray.crop((1, 0, gray.width, gray.height)),
        gray.crop((0, 0, gray.width-1, gray.height)))).mean[0]
    rgb = ImageStat.Stat(image).mean
    return {'lumaMean255':round(mean, 4), 'horizontalEdge255':round(edge, 4),
            'edgeOverMean':round(edge/max(mean, 1), 4),
            'redMinusBlue255':round(rgb[0]-rgb[2], 4)}


def compare(a, b):
    if a.size != b.size:
        return {'sameSize':False}
    delta = ImageChops.difference(a.convert('RGB'), b.convert('RGB'))
    return {'sameSize':True, 'identical':not any(v[1] for v in delta.getextrema()),
            'meanAbsoluteRGB255':round(statistics.mean(ImageStat.Stat(delta).mean), 4)}


def analyze(path):
    with zipfile.ZipFile(path) as archive:
        if sum(f.file_size for f in archive.infolist()) > 250_000_000:
            raise ValueError('Capture exceeds 250 MB analysis bound')
        report = json.loads(archive.read('report.json'))
        def picture(name):
            if Path(name).name != name or '/' in name or '\\' in name or not name.endswith('.png'):
                raise ValueError('Invalid crop entry name')
            with Image.open(io.BytesIO(archive.read(name))) as im:
                if im.width > 1600 or im.height > 1600 or im.width < 2:
                    raise ValueError('Invalid crop dimensions')
                return im.convert('RGB')
        out = {'probe':report.get('probe'), 'cases':[], 'complete':{}, 'pngCount':0,
               'limits':['Captured samples only; not animation FPS.',
                         'Identical pre/post fixture content cannot prove a fresh backdrop.',
                         'Color-change metrics need corresponding control, document state and timing.']}
        cases = report['cases']
        for c in cases:
            capture = c.get('capture', {})
            files = capture.get('files', [])
            kind = c.get('kind', 'settled')
            row = {k:c[k] for k in ['id','kind','scenario','right','page','variant','reduced','expectedPaint'] if k in c}
            row.update(kind=kind, failed=bool(capture.get('error')), gapCount=len(capture.get('gaps', [])))
            out['pngCount'] += len(files)
            if not row['failed']:
                out['complete'][kind] = out['complete'].get(kind, 0)+1
            for region in ['sidebar','control','surface','menu']:
                selected = [f for f in files if f['name'].endswith('-'+region+'.png')]
                if not selected:
                    continue
                images = [picture(f['name']) for f in selected]
                row[region] = {'samples':len(images), 'first':metrics(images[0]), 'last':metrics(images[-1]),
                               'firstToLast':compare(images[0], images[-1])}
                times = [f['utcMs'] for f in selected if 'utcMs' in f]
                if len(times) > 1:
                    intervals = [b-a for a,b in zip(times,times[1:])]
                    row[region]['sampleIntervalsMs'] = {'median':statistics.median(intervals),'max':max(intervals)}
            if kind == 'sequence':
                row['freshnessChallenge'] = 'changed-color' if c.get('expectedPaint') == 'amber' else 'unchanged-content'
                row['finalDocumentExpected'] = (c.get('after',{}).get('document') or {}).get('paint') == c.get('expectedPaint') if c.get('expectedPaint') else None
            out['cases'].append(row)
        out['nativeNudgeSettled'] = []
        for c in cases:
            if c.get('kind') or c.get('reduced') or c['variant'] != 'native-only':
                continue
            peer = next((p for p in cases if not p.get('kind') and not p.get('reduced') and
                         p['variant']=='native-no-nudge' and p['page']==c['page'] and p['right']==c['right']), None)
            if peer and not c['capture'].get('error') and not peer['capture'].get('error'):
                out['nativeNudgeSettled'].append({'right':c['right'],'page':c['page'],
                    **compare(picture(f"{c['id']:02d}-sidebar.png"),picture(f"{peer['id']:02d}-sidebar.png"))})
        return out


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        stripes = Image.new('RGB',(16,8))
        for x in range(16):
            for y in range(8):stripes.putpixel((x,y),(255,255,255) if x%2 else (0,0,0))
        flat = Image.new('RGB',(16,8),(127,127,127))
        assert metrics(stripes)['horizontalEdge255'] == 255
        assert metrics(flat)['horizontalEdge255'] == 0
        assert compare(flat,flat)['identical']
        assert not compare(flat,stripes)['identical']
        cyan=Image.new('RGB',(16,8),(32,200,255));amber=Image.new('RGB',(16,8),(255,144,32))
        assert metrics(cyan)['redMinusBlue255']<0<metrics(amber)['redMinusBlue255']
        print('Stripe, flat, equality and opposite paint challenges passed.')
    elif len(sys.argv) == 2:
        print(json.dumps(analyze(sys.argv[1]),indent=2))
    else:
        raise SystemExit(__doc__)
