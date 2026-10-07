import json,glob,os,re,collections
recs=json.load(open('records.json'))
msgs=collections.OrderedDict()
for r in recs: msgs.setdefault((r['proj'],r['sess'],r['line']),[]).append(r)
base='/Users/kostenchuksergey/.claude/projects/-Users-kostenchuksergey-'
def txt(c):
    if isinstance(c,str): return c
    out=[]
    for b in c or []:
        if isinstance(b,dict):
            if b.get('type')=='text': out.append(b.get('text',''))
            elif b.get('type')=='tool_use': out.append('[tool_use %s %s]'%(b.get('name'),json.dumps(b.get('input'),ensure_ascii=False)[:150]))
    return '\n'.join(out)
out=[]
cache={}
for (p,s,l),rs in msgs.items():
    f=f'{base}{p}/{s}.jsonl'
    if f not in cache:
        cache[f]=open(f,errors='replace').read().split('\n')
    lines=cache[f]
    # previous assistant text
    prev=''
    for j in range(l-2,max(0,l-40),-1):
        try: d=json.loads(lines[j])
        except: continue
        if d.get('type')=='assistant':
            t=txt(d['message'].get('content')).strip()
            if t and not t.startswith('[tool_use'):
                prev=t;break
    nxt=''
    for j in range(l,min(len(lines),l+40)):
        try: d=json.loads(lines[j])
        except: continue
        if d.get('type')=='assistant':
            t=txt(d['message'].get('content')).strip()
            if t and not t.startswith('[tool_use'):
                nxt=t;break
    out.append(f"\n=== {p}/{s[:8]}:{l} {rs[0]['ts']} imgs={[x['file'] for x in rs]}\nOWNER: {rs[0]['text'][:900]}\nPREV_ASSISTANT: {prev[:700]}\nNEXT_ASSISTANT: {nxt[:700]}\n")
open('ctx.txt','w').write(''.join(out))
print(len(''.join(out)))
