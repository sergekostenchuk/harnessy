import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {builtinEntries,ProviderCatalog} from '@harnessy/providers';
import {Connections,ProjectRegistry,Settings,Pins} from '@harnessy/projects';
import {createActions,createRuntime,type RuntimeDeps} from '@harnessy/runtime';
import {MemoryKeys} from '../../llm/src/test-helpers.ts';
import {createApi} from '../src/server.ts';
import {fakeScenario,ScenarioProvider} from './ts47-fake.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const scenario=fakeScenario(process.env);
const portText=process.env.HARNESS_FAKE_PORT??'3794';
if(!/^[1-9][0-9]{0,4}$/.test(portText)||Number(portText)>65535||Number(portText)===3777)throw Error('HARNESS_FAKE_PORT: нужен свободный порт 1–65535, кроме 3777');
const port=Number(portText),site=join(root,'ui/deploy/out/ts47f-site');
const built=spawnSync('python3',[join(root,'ui/deploy/build.py'),'--out',site],{cwd:root,stdio:'inherit'});
if(built.error)throw built.error;if(built.status!==0)throw Error('Не удалось собрать proto: '+built.status);

// A fresh sibling directory keeps all project and owner state outside the real projects.
const data=mkdtempSync(join(dirname(root),'TS-47F-stand-')),project=join(data,'project'),empty=join(data,'default');
mkdirSync(join(project,'.harness'),{recursive:true});mkdirSync(empty);
process.env.HARNESS_PROJECTS_ROOT=join(data,'projects');mkdirSync(process.env.HARNESS_PROJECTS_ROOT);
writeFileSync(join(project,'.harness/team.yaml'),[
 'version: 1','integration_branch: main','seats:',
 '  lead: {kind: orchestrator, role: orchestrator, vendor: claude, label: Тестовый руководитель, model: claude-opus-5-5, mode: read, digest: false}',
 '  worker: {kind: worker, role: executor, vendor: codex, label: Тестовый исполнитель, model: gpt-5.6-sol, mode: read, digest: false}',''
].join('\n'),{flag:'wx'});
const claude=new ScenarioProvider('claude',scenario),codex=new ScenarioProvider('codex',scenario),providers={claude,codex};
const models={claude:await claude.models(),codex:await codex.models()};
const catalog=new ProviderCatalog(builtinEntries(providers,models,{
 env:{CLAUDE_BIN:'fake-claude',CODEX_BIN:'fake-codex'},
 execute:async()=>({code:0,signal:null,stdout:'TS-47.F fake 1\n',stderr:''})
}));
const deps:RuntimeDeps={projectDir:project,defaultDir:empty,providers,models,providerCatalog:catalog,appUrl:'http://127.0.0.1:'+port,
 limitsCacheDir:join(data,'limits'),catalogCacheDir:join(data,'catalog'),networkStatsPath:join(data,'network-stats.json'),
 llmKeys:new MemoryKeys(),networkKeys:new MemoryKeys(),llmFetch:async()=>{throw Error('Тестовый стенд не обращается к внешним моделям')},
 connections:new Connections(join(data,'connections.json')),projectRegistry:new ProjectRegistry({projects:join(data,'projects.json'),lastProject:join(data,'last')},{noLast:true}),
 settings:current=>new Settings(join(data,'settings.json'),current),pins:(current,meta)=>new Pins(join(data,'pins.json'),current,meta)};
const runtime=await createRuntime(deps,createActions());
const api=createApi({runtime,siteDir:join(site,'sketches'),port,host:'127.0.0.1',
 router:{models:()=>({ok:false,reason:'Тестовый стенд: внешний роутер выключен'}),health:async()=>({ok:false,reason:'Тестовый стенд: внешний роутер выключен'})}});
try {
 const url=await api.listen();deps.appUrl=url;
 console.log('TS-47.F: '+url+'/sketches/proto/10-new-chat.html');
 console.log('Проект и настройки стенда: '+data);
 console.log('Сценарий: '+JSON.stringify(scenario)+'; настоящие модели не запускаются.');
 const stop=()=>{void api.close().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)})};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
} catch(error){await api.close();throw error}
