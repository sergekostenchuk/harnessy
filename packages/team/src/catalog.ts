export const MODE_IDS=['chat','read','check','web','ask','edit','all'] as const;
export type Mode=typeof MODE_IDS[number];
export const MODES=MODE_IDS.map((id,i)=>({id,label:['Только чат','Чтение папки','Чтение и команды','Чтение и интернет','Спрашивать','Правки без вопросов','Всё без вопросов'][i]!}));
export const ROLE_CATALOG=[
 {role:'orchestrator',label:'оркестратор',multi:false},{role:'assistant',label:'ассистент',multi:false},{role:'architect',label:'архитектор',multi:false},
 {role:'executor',label:'воркер',multi:true},{role:'reviewer',label:'ревьюер',multi:true},{role:'tester',label:'тестер',multi:false},{role:'researcher',label:'ресёрчер',multi:false}
] as const;
export type Vendor=string;
export const providerId=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v)&&!['human','owner','harness'].includes(v);
