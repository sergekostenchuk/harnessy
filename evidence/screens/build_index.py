# -*- coding: utf-8 -*-
import json,os,re,subprocess,glob,collections
OUT='/private/tmp/claude-501/ux-screens'
rows=json.load(open(OUT+'/rows.json'))
recs=json.load(open(OUT+'/records_all.json'))
V="""HARNESS-bde94333-124-1.png HARNESS-bde94333-139-1.png HARNESS-bde94333-139-2.webp OMG-2adee739-1100-1.webp OMG-2adee739-1100-2.webp OMG-2adee739-1100-3.webp HARNESS-f421b105-869-1.png HARNESS-f421b105-1081-1.png HARNESS-f421b105-1108-1.png HARNESS-f421b105-1265-1.png HARNESS-f421b105-2438-1.png HARNESS-fb59eb7f-3321-1.png OMG-2adee739-1326-1.webp OMG-1964d85b-14091-1.png OMG-1964d85b-14145-1.png OMG-1964d85b-14591-1.png OMG-6a01efce-11766-1.png OMG-6a01efce-12039-1.webp OMG-6a01efce-12186-1.png OMG-6a01efce-12205-1.png OMG-f0b671d7-1040-1.webp OMG-6a01efce-12247-1.png OMG-6a01efce-12247-2.png OMG-6a01efce-12247-3.png OMG-6a01efce-12247-4.png
TASKPLAN-PRO-V2-25570f76-4918-1.png TASKPLAN-PRO-V2-25570f76-7250-1.png TASKPLAN-PRO-V2-25570f76-8001-1.webp TASKPLAN-PRO-V2-25570f76-8001-2.webp TASKPLAN-PRO-V2-25570f76-8272-1.webp TASKPLAN-PRO-V2-25570f76-8420-1.png TASKPLAN-PRO-V2-25570f76-8744-1.png TASKPLAN-PRO-V2-25570f76-8840-1.webp TASKPLAN-PRO-V2-25570f76-9200-1.png TASKPLAN-PRO-V2-25570f76-9463-1.png TASKPLAN-PRO-V2-25570f76-9760-1.webp TASKPLAN-PRO-V2-25570f76-9792-1.webp TASKPLAN-PRO-V2-25570f76-9955-1.webp TASKPLAN-PRO-V2-25570f76-9955-2.png TASKPLAN-PRO-V2-25570f76-10063-1.png TASKPLAN-PRO-V2-25570f76-10221-1.png
Social-MSU-2a56db67-417-1.png Social-MSU-2a56db67-284-1.webp Social-MSU-15b9e00b-3-1.png TASKPLAN-PRO-V3-f9de24ec-1332-1.png TASKPLAN-PRO-V3-f9de24ec-1395-1.png TASKPLAN-PRO-V3-f9de24ec-1395-2.png TASKPLAN-PRO-V2-8e05efa4-4-1.png TASKPLAN-PRO-V2-d5cbede6-527-1.webp TASKPLAN-PRO-V3-d09c89fe-7506-11.webp TASKPLAN-PRO-V3-d09c89fe-7506-2.png TASKPLAN-PRO-V3-d09c89fe-7506-10.png TASKPLAN-PRO-V3-bb991941-898-1.png TASKPLAN-PRO-V3-bb991941-4929-1.png TASKPLAN-PRO-V3-bb991941-5204-1.png TASKPLAN-PRO-V3-bb991941-5470-1.png TASKPLAN-PRO-V3-bb991941-676-1.png TASKPLAN-PRO-V3-bb991941-676-2.png TASKPLAN-PRO-V3-bb991941-2342-1.png TASKPLAN-PRO-V2-c30a83e4-88-1.png TASKPLAN-PRO-V2-c30a83e4-88-3.png TASKPLAN-PRO-V3-240df162-17167-1.webp TASKPLAN-PRO-V3-240df162-17167-2.png TASKPLAN-PRO-V3-bb991941-2879-1.png TASKPLAN-PRO-V3-bb991941-3039-1.png HARNESS-f421b105-1068-1.png HARNESS-f421b105-1094-1.png OMG-1964d85b-14520-1.png Social-MSU-2a56db67-112-1.png TASKPLAN-PRO-V2-25570f76-8213-1.webp TASKPLAN-PRO-V2-25570f76-9746-1.webp TASKPLAN-PRO-V3-bb991941-2176-1.webp TASKPLAN-PRO-V2-c30a83e4-88-2.png TASKPLAN-PRO-V2-c30a83e4-88-4.webp
OMG-1964d85b-22768q-1.png OMG-ebc42c9f-218q-1.png TASKPLAN-PRO-V2-25570f76-2975q-1.png TASKPLAN-PRO-V2-25570f76-5440q-1.png TASKPLAN-PRO-V2-25570f76-5463q-1.webp TASKPLAN-PRO-V2-25570f76-20202q-1.webp TASKPLAN-PRO-V2-25570f76-20202q-2.png TASKPLAN-PRO-V2-d5cbede6-815q-1.webp TASKPLAN-PRO-V3-bb991941-957q-1.png TASKPLAN-PRO-V3-bb991941-1194q-1.png TASKPLAN-PRO-V3-bb991941-4294q-1.png TASKPLAN-PRO-V3-bb991941-5019q-1.png""".split()
viewed=set(V)
sheet_prefix=('TASKPLAN-PRO-V3-d09c89fe-7506-','TASKPLAN-PRO-V3-effc9b2f-2276-','TASKPLAN-PRO-V3-effc9b2f-2319-')
allf=[r['file'] for r in recs]
for f in viewed: assert f in allf, f
sheet=set(f for f in allf if f.startswith(sheet_prefix))
unv=[f for f in allf if f not in viewed and f not in sheet]
print('images',len(allf),'viewed individually',len(viewed),'via sheets',len(sheet),'overlap',len(viewed&sheet),'unviewed',len(unv),unv)
print('unique viewed',len(viewed|sheet))
dim={}
for f in allf:
    o=subprocess.check_output(['sips','-g','pixelWidth','-g','pixelHeight',os.path.join(OUT,f)],text=True)
    w=re.search(r'pixelWidth: (\d+)',o).group(1);h=re.search(r'pixelHeight: (\d+)',o).group(1);dim[f]=f'{w}x{h}'
json.dump(dict(viewed=sorted(viewed),sheet=sorted(sheet),unv=unv,dim=dim),open(OUT+'/viewstat.json','w'),ensure_ascii=False)
def one(t,n=300): return re.sub(r'\s+',' ',t).strip()[:n]
L=['# Индекс скриншотов владельца (Claude Code, 73 реплики, 143 картинки)','',
'Источник: `~/.claude/projects/-Users-kostenchuksergey-*/*.jsonl`, записи `type=user` (image в message.content) и `attachment/queued_command` (реплики, отправленные пока агент был занят). Дубли по хэшу base64 убраны (копии форков и возобновлений сессий). Время — МСК (UTC+3). Каталог: `/private/tmp/claude-501/ux-screens/`.',
'Пометка: `+` — просмотрено отдельно, `#` — просмотрено в контактном листе (`sheets/*.jpg`), `-` — не просматривалось.','']
for r in rows:
    fl=[]
    for f in r['files']:
        m='+' if f in viewed else ('#' if f in sheet else '-')
        fl.append(f"{m}{f} ({dim[f]})")
    L.append(f"## {r['id']} · {r['key']} · {r['ts'][8:10]}.{r['ts'][5:7]} {r['ts'][11:16]}")
    L.append(f"- реплика владельца: {one(r['text']) or '(без текста, только картинка)'}")
    L.append(f"- картинки: {'; '.join(fl)}")
    L.append(f"- на экране: {r['desc']}")
    L.append('')
open(OUT+'/index.md','w').write('\n'.join(L))
print('index.md written',len('\n'.join(L)))
