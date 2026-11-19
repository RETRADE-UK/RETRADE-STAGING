"""Build the RETRADE preview, social cut and campaign links from recorded staging sessions."""
import argparse
import base64
import csv
import html
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from PIL import Image, ImageDraw, ImageFont

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
    films={mode:{'poster':screens['finds']['mobile' if mode=='mobile' else 'src'],'src':as_data(recordings/(mode+'.mp4'))} for mode in ['mobile','desktop']}
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

def film(target, recording, stats, scratch):
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(recording)],text=True))
    navy='#101826'; gold='#f2b33d'; white='#f7f5ee'; muted='#acb9c8'
    def font(size,bold=False):
        return ImageFont.truetype('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf',size)
    indexed={r['item']:r for r in stats['rows']}
    jacket=indexed['Levi’s denim trucker jacket'];game=indexed['Mario Kart 8 Deluxe, cartridge only']
    phases=[(0,'Sunday at the car boot',f"{money(stats['spend'])} spent on six finds"),
            (.095,'Inside the sourcing run','Six finds. Three ways to sell.'),
            (.245,'Vinted · denim jacket',f"{money(jacket['sale'])} sold / {money(jacket['net'])} profit"),
            (.455,'Inside the sourcing run','Now open the game sale'),
            (.565,'eBay · Mario Kart',f"{money(game['sale'])} sold / {money(game['net'])} profit"),
            (.79,'All six sales',f"{money(stats['revenue'])} sold / {money(stats['profit'])} profit")]
    timing=[]
    for n,(t,kicker,heading) in enumerate(phases):
        image=Image.new('RGB',(720,1280),navy); draw=ImageDraw.Draw(image)
        draw.text((52,32),kicker.upper(),font=font(18,True),fill=gold,anchor='lt')
        draw.text((49,69),heading,font=font(38,True),fill=white,anchor='lt')
        draw.rounded_rectangle((79,148,641,1172),radius=12,fill='#344050')
        mark=Image.open(ROOT/'assets/mark.png').convert('RGBA');mark.thumbnail((28,33))
        image.paste(mark,(52,1197),mark)
        draw.text((90,1205),'RETRADE',font=font(23,True),fill=white,anchor='lt')
        draw.text((667,1209),'START FREE · RETRADE-UK.COM' if n==len(phases)-1 else 'UK RESELLERS',font=font(15,True),fill=gold,anchor='rt')
        draw.text((53,1244),'Product demo with example sales',font=font(17),fill=muted,anchor='lt')
        filename=f'caption-{n}.png'; image.save(scratch/filename)
        end=phases[n+1][0] if n+1<len(phases) else 1
        timing.extend(["file '"+filename+"'",'duration '+str((end-t)*duration)])
    timing.append("file 'caption-"+str(len(phases)-1)+".png'")
    concat=scratch/'caption-list.txt'; concat.write_text('\n'.join(timing)+'\n')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-i',str(recording),
                    '-filter_complex','[0:v]fps=25[bg];[1:v]scale=550:1016:flags=lanczos[phone];[bg][phone]overlay=85:152:shortest=1,format=yuv420p[out]',
                    '-map','[out]','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-movflags','+faststart',str(target)],check=True)

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
        import shutil
        with tempfile.TemporaryDirectory(dir=ROOT) as new:
            subprocess.run(['node',str(ROOT/'workflow/record.cjs'),new],check=True)
            for src in Path(new).iterdir(): shutil.copy2(src,recordings/src.name)
    stats=json.loads((recordings/'results.json').read_text())
    examples=json.loads((ROOT/'workflow/examples.json').read_text())
    with tempfile.TemporaryDirectory(dir=opts.output) as td:
        scratch=Path(td)
        build_page(scratch/'RETRADE-launch-preview.html',recordings,stats,examples,scratch)
        build_links(scratch/'campaign-links.csv',opts.landing)
        film(scratch/'RETRADE-car-boot-haul.mp4',recordings/'mobile.mp4',stats,scratch)
        for name in ['RETRADE-launch-preview.html','campaign-links.csv','RETRADE-car-boot-haul.mp4']:
            os.replace(scratch/name,opts.output/name)
    print('Built the recorded staging tour, page and campaign links.')

if __name__=='__main__': main()
