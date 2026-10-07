import json, glob, os, sys, collections
files = sorted(glob.glob('/Users/kostenchuksergey/.claude/projects/-Users-kostenchuksergey-*/*.jsonl'))
print(len(files),'files')
tot_direct=0; tot_toolres=0
msgs_direct=0
per_proj=collections.Counter()
rows=[]
for f in files:
    proj=f.split('/')[-2].replace('-Users-kostenchuksergey-','')
    sess=os.path.basename(f)[:-6]
    with open(f,'r',errors='replace') as fh:
        for ln,line in enumerate(fh,1):
            if '"image"' not in line: continue
            try: d=json.loads(line)
            except Exception: continue
            if d.get('type')!='user': continue
            m=d.get('message',{})
            c=m.get('content')
            if not isinstance(c,list): continue
            n=0; ntr=0
            for b in c:
                if not isinstance(b,dict): continue
                if b.get('type')=='image': n+=1
                elif b.get('type')=='tool_result':
                    cc=b.get('content')
                    if isinstance(cc,list):
                        for x in cc:
                            if isinstance(x,dict) and x.get('type')=='image': ntr+=1
            if n: 
                msgs_direct+=1; tot_direct+=n; per_proj[proj]+=1
                rows.append((proj,sess,ln,n,d.get('timestamp'),bool(d.get('isMeta')),d.get('toolUseResult') is not None))
            tot_toolres+=ntr
print('direct image msgs',msgs_direct,'direct images',tot_direct,'toolresult images',tot_toolres)
print(per_proj)
for r in rows[:5]: print(r)
