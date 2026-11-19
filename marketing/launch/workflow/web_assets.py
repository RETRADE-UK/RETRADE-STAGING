"""Write a lightweight, static web version of the offline review for a host."""
import argparse
import base64
from hashlib import sha256
from pathlib import Path
import re

def export(source, destination):
    destination.mkdir(parents=True,exist_ok=True)
    assets=destination/'media'
    assets.mkdir(exist_ok=True)
    types={'video/mp4':'mp4','image/webp':'webp','image/svg+xml':'svg'}
    def write(match):
        mime,encoded=match.groups()
        data=base64.b64decode(encoded,validate=True)
        filename=sha256(data).hexdigest()[:20]+'.'+types[mime]
        (assets/filename).write_bytes(data)
        return 'media/'+filename
    page=re.sub(r'data:(video/mp4|image/webp|image/svg\+xml);base64,([A-Za-z0-9+/=]+)',write,source.read_text(encoding='utf-8'))
    (destination/'index.html').write_text(page,encoding='utf-8')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('destination',type=Path)
    args=parser.parse_args()
    export(args.source,args.destination)
