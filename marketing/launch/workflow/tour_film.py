"""Render the dark product tour. Chapter timestamps come from the recorded clicks."""
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageStat

INK = '#0b101a'
PAPER = '#f5f4ee'
GOLD = '#f5bb51'
MUTED = '#b5bdcc'

def font(size, bold=False):
    return ImageFont.truetype('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf', size)

def label(draw, point, words, size, colour=PAPER, bold=False):
    draw.text(point,words,font=font(size,bold),fill=colour,anchor='lt')

def amount(value):
    return f'£{value:.2f}'.rstrip('0').rstrip('.')

def captions(stats):
    rows={row['item']:row for row in stats['rows']}
    jacket=rows['Levi’s denim trucker jacket']
    game=rows['Mario Kart 8 Deluxe, cartridge only']
    return {
        'finds': ('SUNDAY CAR BOOT','Six finds.',f"{amount(stats['spend'])} spent.",'The buying trip'),
        'jacket-open': ('VINTED  /  DENIM JACKET','Sold for',amount(jacket['sale'])+'.','The jacket sale'),
        'jacket-profit': ('VINTED  /  DENIM JACKET',amount(jacket['net']),'profit.','The jacket sale'),
        'game-list': ('EBAY  /  MARIO KART','Next up,','Mario Kart.','The game sale'),
        'game-open': ('EBAY  /  MARIO KART','Sold for',amount(game['sale'])+'.','The game sale'),
        'game-profit': ('EBAY  /  MARIO KART',amount(game['net']),'profit.','The game sale'),
        'result': ('ALL SIX SALES',amount(stats['profit']),'run profit.',f"{amount(stats['revenue'])} in sales"),
    }

def artwork(mode, phase, index, mark):
    phone=mode=='mobile'
    width,height=(1080,1920) if phone else (1600,960)
    art=Image.new('RGB',(width,height),INK)
    draw=ImageDraw.Draw(art)
    # A small, consistent brand frame leaves the whole app panel unobstructed.
    kicker,first,second,chapter=phase
    if phone:
        x,y=32,200
        sw,sh=1016,1590
        label(draw,(38,34),kicker,25,GOLD,True)
        words=first+' '+second
        size=64
        while draw.textlength(words,font=font(size,True))>1000: size-=1
        label(draw,(34,91),words,size,PAPER,True)
        label(draw,(43,1850),'RETRADE',31,PAPER,True)
        draw.text((1037,1853),'DEMO HAUL',font=font(24,True),fill=MUTED,anchor='rt')
        track=(40,1820,1040)
    else:
        x,y,sw,sh=502,74,1064,818
        small=mark.copy();small.thumbnail((44,51))
        art.paste(small,(47,62),small)
        label(draw,(101,72),'RETRADE',33,PAPER,True)
        label(draw,(49,274),kicker,22,GOLD,True)
        size=61
        while max(draw.textlength(s,font=font(size,True)) for s in [first,second])>428: size-=1
        label(draw,(44,342),first,size,PAPER,True)
        label(draw,(44,342+size+13),second,size,GOLD,True)
        label(draw,(50,650),chapter,28,MUTED)
        label(draw,(50,837),'PRODUCT TOUR   /   EXAMPLE SALES',16,MUTED,True)
        track=(50,792,435)
    tx,ty,end=track
    length=(end-tx-18)/4
    for i in range(4):
        start=round(tx+i*(length+6))
        draw.rounded_rectangle((start,ty,round(start+length),ty+4),radius=2,fill=GOLD if i<=index else '#364151')
    draw.rounded_rectangle((x-3,y-3,x+sw+2,y+sh+2),radius=5,fill='#364150')
    return art,(x,y,sw,sh)

def crop_box(width,height,mode):
    # On desktop the left navigation is outside the two columns used in the tour.
    if mode=='mobile': return (0,0,width,height)
    return (int(width*0.264)//2*2,0,width,height)

def render(mode, recordings, stats, assets, scratch):
    timeline=json.loads((recordings/(mode+'-chapters.json')).read_text())
    if timeline['theme']!='dark': raise ValueError('Tour must use the native dark theme.')
    source=recordings/(mode+'.mp4')
    with Image.open(recordings/('finds-mobile.png' if mode=='mobile' else 'finds.png')) as snap:
        screenshot=snap.convert('RGB')
    if ImageStat.Stat(screenshot.convert('L')).median[0]>75: raise ValueError(f'{mode} poster has a light app surface.')
    # Detect accidental 1x headless recordings before labelling a video as high definition.
    probe=subprocess.check_output(['ffmpeg','-hide_banner','-i',str(source),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],stderr=subprocess.DEVNULL)
    import io
    with Image.open(io.BytesIO(probe)) as check:
        if check.size[0]<screenshot.width-1 or check.width<1000: raise ValueError(f'Capture rendered at {check.size} instead of device resolution {screenshot.size}.')
    left,top,right,bottom=crop_box(*screenshot.size,mode)
    graphic=Image.open(assets/'mark.png').convert('RGBA')
    labels=captions(stats)
    stages={'finds':0,'jacket-open':1,'jacket-profit':1,'game-list':2,'game-open':2,'game-profit':2,'result':3}
    segments=timeline['chapters']; seconds=timeline['seconds']; timing=[]
    for i,entry in enumerate(segments):
        key=entry['key']; start=entry['seconds'] if i else 0
        finish=segments[i+1]['seconds'] if i+1<len(segments) else seconds
        art,(x,y,sw,sh)=artwork(mode,labels[key],stages[key],graphic)
        filename=f'{mode}-frame-{i}.png';art.save(scratch/filename)
        timing.extend(["file '"+filename+"'",'option framerate 30','duration '+str(finish-start)])
        if i==0:
            poster=art.copy()
            poster.paste(screenshot.crop((left,top,right,bottom)).resize((sw,sh),Image.Resampling.LANCZOS),(x,y))
            poster.save(scratch/(mode+'-poster.webp'),quality=91,method=6)
    timing+=["file '"+filename+"'",'option framerate 30']
    timing_file=scratch/(mode+'-frames.txt');timing_file.write_text('\n'.join(timing)+'\n')
    target=scratch/(mode+'.mp4')
    crop=f'crop={right-left}:{bottom-top}:{left}:{top}'
    vf=f'[0:v]fps=30[bg];[1:v]{crop},scale={sw}:{sh}:flags=lanczos[app];[bg][app]overlay={x}:{y}:shortest=1,format=yuv420p[out]'
    subprocess.run(['ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i',str(timing_file),'-i',str(source),'-filter_complex_threads','2','-filter_complex',vf,'-map','[out]','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','17','-movflags','+faststart',str(target)],check=True)
    return target
