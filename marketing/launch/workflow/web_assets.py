"""Export the review to a static directory. Stable filenames have content-versioned URLs."""
import argparse
import base64
from hashlib import sha256
import json
from pathlib import Path
import re

def export(source,destination):
    page=source.read_text(encoding='utf-8')
    media=destination/'media'
    media.mkdir(parents=True,exist_ok=True)
    names={}
    def value(key):
        match=re.search(r'^const '+key+r' = (.*);$',page,re.M)
        if not match: raise ValueError(f'Missing {key} in generated HTML')
        return json.loads(match.group(1))
    for key,screen in value('catalogue').items():
        names[screen['src']]=key+'-desktop.webp'
        names[screen['mobile']]=key+'-mobile.webp'
    for mode,film in value('films').items():
        names[film['poster']]='tour-'+mode+'-poster.webp'
        names[film['src']]='tour-'+mode+'.mp4'
    def write(match):
        uri=match.group(0)
        name='mark.svg' if match.group(1)=='image/svg+xml' else names[uri]
        data=base64.b64decode(match.group(2),validate=True)
        (media/name).write_bytes(data)
        return 'media/'+name+'?v='+sha256(data).hexdigest()[:12]
    page=re.sub(r'data:(video/mp4|image/webp|image/svg\+xml);base64,([A-Za-z0-9+/=]+)',write,page)
    (destination/'index.html').write_text(page,encoding='utf-8')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('destination',type=Path)
    args=parser.parse_args()
    export(args.source,args.destination)
