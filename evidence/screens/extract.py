import json, glob, os, hashlib, base64, collections, re
OUT='/private/tmp/claude-501/ux-screens'
files = sorted(glob.glob('/Users/kostenchuksergey/.claude/projects/-Users-kostenchuksergey-*/*.jsonl'))
seen={}   # hash -> record
records=[]
extmap={'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp','image/gif':'gif'}
def text_of(c):
    parts=[]
    for b in c:
        if isinstance(b,dict) and b.get('type')=='text':
            parts.append(b.get('text',''))
    return '\n'.join(parts)
for f in files:
    proj=f.split('/')[-2].replace('-Users-kostenchuksergey-','')
    sess=os.path.basename(f)[:-6]
    with open(f,'r',errors='replace') as fh:
        for ln,line in enumerate(fh,1):
            if '"image"' not in line: continue
            try: d=json.loads(line)
            except Exception: continue
            if d.get('type')!='user': continue
            c=d.get('message',{}).get('content')
            if not isinstance(c,list): continue
            imgs=[b for b in c if isinstance(b,dict) and b.get('type')=='image']
            if not imgs: continue
            txt=text_of(c)
            k=0
            for b in imgs:
                src=b.get('source',{})
                data=src.get('data')
                if not data: continue
                h=hashlib.sha1(data.encode()).hexdigest()[:12]
                k+=1
                rec=dict(proj=proj,sess=sess,line=ln,ts=d.get('timestamp'),n=len(imgs),k=k,hash=h,media=src.get('media_type'),text=txt,meta=bool(d.get('isMeta')),size=len(data))
                if h in seen:
                    seen[h]['dups'].append((proj,sess[:8],ln)); continue
                rec['dups']=[]
                seen[h]=rec
                ext=extmap.get(src.get('media_type'),'bin')
                fn=f"{proj}-{sess[:8]}-{ln}-{k}.{ext}"
                rec['file']=fn
                with open(os.path.join(OUT,fn),'wb') as o: o.write(base64.b64decode(data))
                records.append(rec)
json.dump(records,open(OUT+'/records.json','w'),ensure_ascii=False,indent=1)
print(len(records),'unique images')
msgs=collections.OrderedDict()
for r in records: msgs.setdefault((r['proj'],r['sess'],r['line']),[]).append(r)
print(len(msgs),'unique messages(first-seen)')
print(collections.Counter(r['media'] for r in records))
print(collections.Counter(r['proj'] for r in records))
