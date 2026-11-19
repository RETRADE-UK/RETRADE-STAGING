"""Build the RETRADE preview, social cut and campaign links from recorded staging sessions."""
import argparse
import base64
import csv
import html
import json
import os
from pathlib import Path
import subprocess
import shutil
from workflow.tour_film import render
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from PIL import Image

ROOT = Path(__file__).resolve().parent
SCREENS = {
    'finds': ('Six finds', 'Compare what each item cost, sold for and earned.'),
    'haul': ('The buying trip', 'See the total stock cost and realised profit.'),
    'jacket': ('Vinted jacket', 'Open the denim jacket’s sale breakdown.'),
    'game': ('eBay game', 'See how fees, packaging and postage affect a £19 sale.'),
}
CHANNELS = {'vinted': 'Vinted', 'ebay_biz': 'eBay UK business', 'fb': 'Facebook Marketplace · local collection'}

def money(value):
    return f'£{value:,.2f}' if value % 1 else f'£{value:,.0f}'

def as_data(path):
    mime = {'.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4'}[path.suffix]
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')

def build_page(target, recordings, stats, examples, scratch):
    template=(ROOT/'source/page.html').read_text()
    screens, buttons = {}, []
    for key,(name,caption) in SCREENS.items():
        item={'title':name,'caption':caption,'alt':f'{name} in the RETRADE test app. {caption}'}
        for suffix,field in [('', 'src'),('-mobile','mobile')]:
            filename=key+suffix
            image_path=scratch/(filename+'.webp')
            with Image.open(recordings/(filename+'.png')) as im:
                im.convert('RGB').save(image_path,quality=89,method=6)
            item[field]=as_data(image_path)
        screens[key]=item
        buttons.append(f'<button type="button" class="pick" aria-pressed="{str(key=="finds").lower()}" data-key="{key}"><strong>{html.escape(name)}</strong><span>{html.escape(caption)}</span></button>')
    # The poster and clip switch together on layout changes. Video bytes remain local to this HTML.
    films = {}
    for mode in ['mobile','desktop']:
        master = render(mode, recordings, stats, ROOT/'assets', scratch)
        films[mode] = {'poster': as_data(scratch/(mode+'-poster.webp')), 'src': as_data(master)}
    actual={r['item']:r for r in stats['rows']}
    if len(examples)!=6 or set(actual)!={x['item'] for x in examples}: raise ValueError('The captured haul and the marketing examples must match.')
    rows=[]
    for ex in examples:
        r=actual[ex['item']]
        if (r['cost'],r['sale'])!=(ex['cost'],ex['price']): raise ValueError(f"The example terms changed for {ex['item']}. Refresh the staging haul.")
        cells=''.join(f'<td>{money(r[k])}</td>' for k in ['cost','sale','net'])
        rows.append(f'<tr><td>{html.escape(ex["item"])}<small>{CHANNELS[ex["platform"]]}</small></td>{cells}</tr>')
    tokens={'MARK':as_data(ROOT/'assets/mark.svg'),'FINDS':screens['finds']['src'],'FINDS_MOBILE':screens['finds']['mobile'],'PICKS':''.join(buttons),
            'CATALOGUE':json.dumps(screens,ensure_ascii=False),'FILMS':json.dumps(films),'ROWS':''.join(rows),
            'SPEND':money(stats['spend']),'REVENUE':money(stats['revenue']),'PROFIT':money(stats['profit'])}
    for k,v in tokens.items(): template=template.replace('{{'+k+'}}',v)
    if '{{' in template: raise ValueError('Unresolved template field')
    target.write_text(template,encoding='utf-8')

def build_links(target, landing):
    dest=urlsplit(landing)
    if dest.scheme!='https' or not dest.netloc or dest.fragment: raise ValueError('Use an absolute HTTPS destination without a fragment.')
    with (ROOT/'source/campaigns.csv').open() as src, target.open('w',newline='') as out:
        writer=csv.writer(out); writer.writerow(['source','medium','campaign','content','destination'])
        for row in csv.DictReader(src):
            pairs=dict(parse_qsl(dest.query));pairs.update({'utm_'+k:v for k,v in row.items()})
            writer.writerow([row[k] for k in ('source','medium','campaign','content')]+[urlunsplit(dest._replace(query=urlencode(pairs)))])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=ROOT/'output')
    p.add_argument('--landing',default='https://retrade-uk.com/start/',help='Published campaign destination; the default is a proposed route.')
    p.add_argument('--refresh',action='store_true',help='Sign into the hosted developer test app, verify the sample haul and record the workflow in both viewports.')
    opts=p.parse_args();opts.output.mkdir(parents=True,exist_ok=True)
    recordings=ROOT/'recorded'
    recordings.mkdir(exist_ok=True)
    if opts.refresh or not (recordings/'results.json').exists():
        # Switch only after both recordings finish so an interrupted run never mixes two captures.
        with tempfile.TemporaryDirectory(dir=ROOT) as new:
            subprocess.run(['node',str(ROOT/'workflow/record.cjs'),new],check=True)
            for src in Path(new).iterdir(): shutil.copy2(src,recordings/src.name)
    stats=json.loads((recordings/'results.json').read_text())
    examples=json.loads((ROOT/'workflow/examples.json').read_text())
    with tempfile.TemporaryDirectory(dir=opts.output) as td:
        scratch=Path(td)
        build_page(scratch/'RETRADE-launch-preview.html',recordings,stats,examples,scratch)
        build_links(scratch/'campaign-links.csv',opts.landing)
        shutil.copyfile(scratch/'mobile.mp4',scratch/'RETRADE-car-boot-haul.mp4')
        for name in ['RETRADE-launch-preview.html','campaign-links.csv','RETRADE-car-boot-haul.mp4']:
            os.replace(scratch/name,opts.output/name)
    print('Built the recorded staging tour, page and campaign links.')

if __name__=='__main__': main()
