import {z} from 'zod';
export const KINDS=['task','status','question','answer','review-request','verdict','blocker','escalation','note','stop','resume','digest','proposal','decision','report'] as const;
const modes=['chat','read','check','web','ask','edit','all'] as const;
export const schemas={
 propose_seats:z.strictObject({proposalId:z.string().describe('Только для обновления ожидающего состава: proposalId из ответа движка. Для нового состава не передавай.').optional(),version:z.int().positive().describe('Текущая version из ответа движка; передавай только вместе с proposalId для обновления ожидающего состава.').optional(),seats:z.array(z.strictObject({kind:z.enum(['assistant','architect','worker','reviewer','tester','researcher']),label:z.string().min(1).refine(v=>[...v].length<=60,'label ≤ 60 знаков'),vendor:z.string().regex(/^(?:[a-z][a-z0-9-]*|api:[a-z][a-z0-9_-]{0,63})$/),model:z.string().min(1),mode:z.enum(modes),intro:z.string().min(1).refine(v=>Buffer.byteLength(v,'utf8')<=8192,'intro ≤ 8 КиБ')})).min(1).max(12)}),
 create_seats:z.strictObject({proposalId:z.string(),version:z.int().positive()}),
 send:z.strictObject({to:z.string(),kind:z.enum(KINDS),text:z.string(),thread:z.string().optional(),reply_to:z.int().optional(),evidence:z.array(z.string()).optional(),score:z.int().min(0).max(10).optional(),round:z.int().min(1).optional(),sha:z.string().optional()}),
 ask:z.strictObject({to:z.string(),text:z.string(),thread:z.string().optional()}),
 read_pane:z.strictObject({pane:z.string(),last_n:z.int().min(1).max(100).optional()}),
 merge:z.strictObject({sha:z.string(),message:z.string().optional()}),
 assign_role:z.strictObject({role:z.string(),model:z.string().optional(),mode:z.enum(modes).optional(),specialization:z.strictObject({title:z.string().max(60),text:z.string().max(20000)}).optional()})
};
// Hints describe effects; authorization is enforced by the authenticated Harnessy bridge.
export const toolAnnotations=Object.fromEntries(Object.keys(schemas).map(name=>[name,{
 readOnlyHint:name==='read_pane',destructiveHint:name==='merge',openWorldHint:false
}])) as Record<keyof typeof schemas,{readOnlyHint:boolean;destructiveHint:boolean;openWorldHint:boolean}>;
export const descriptions={
 propose_seats:'Предложить владельцу состав команды с предметными вводными. Доступно оркестратору. Новый состав: вызови БЕЗ proposalId и version — движок выдаст proposalId (p+hex) и version:1 в ответе. Для обновления ожидающего состава передай proposalId и текущую version из ответа движка. После подтверждения владельцем состав не редактируется: для добавления мест вызови propose_seats без proposalId и version, в seats перечисли только новые места. Существующие места и чаты сохраняются. Места пока не создаются.',
 create_seats:'Создать участников по proposalId и version, подтверждённым владельцем в окне. Только оркестратор. Повтор продолжает частичное создание без замены чатов. Ответ «да» в чате не является подтверждением.',
 send:'Отправить запись другому окну и продолжить работу, не дожидаясь ответа. Ответ на чужую question — kind=answer с reply_to, на task — status, на review-request — verdict с score (0..10), round и evidence=[путь к отчёту]. review-request обязан нести sha коммита. Адресат получит запись следующим ходом. Пиши полный самодостаточный текст: адресат не видит твоей переписки.',
 ask:'Задать вопрос другому окну и дождаться ответа. Адресат ответит, когда дойдёт до вопроса в своей очереди; ожидание может занять минуты. Для поручений и статусов пользуйся send.',
 read_pane:'Прочитать последние реплики разговора в другом окне.',
 merge:'Слить принятый коммит в интеграционную ветку проекта. Пройдёт только SHA, у которого есть принятый вердикт; корень проекта должен быть на интеграционной ветке и без незакоммиченных правок. Право слияния — по merge_roles манифеста.',
 assign_role:'Устаревший инструмент: участников создаёт оркестратор по подтверждённому предложению. Назначение через assign_role отклоняется ядром.'
};
