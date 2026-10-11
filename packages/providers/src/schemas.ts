import {z} from 'zod';
export const KINDS=['task','status','question','answer','review-request','verdict','blocker','escalation','note','stop','resume','digest','proposal','decision','report'] as const;
const modes=['chat','read','check','web','ask','edit','all'] as const;
export const schemas={
 send:z.strictObject({to:z.string(),kind:z.enum(KINDS),text:z.string(),thread:z.string().optional(),reply_to:z.int().optional(),evidence:z.array(z.string()).optional(),score:z.int().min(0).max(10).optional(),round:z.int().min(1).optional(),sha:z.string().optional()}),
 ask:z.strictObject({to:z.string(),text:z.string(),thread:z.string().optional()}),
 read_pane:z.strictObject({pane:z.string(),last_n:z.int().min(1).max(100).optional()}),
 merge:z.strictObject({sha:z.string(),message:z.string().optional()}),
 assign_role:z.strictObject({role:z.string(),model:z.string().optional(),mode:z.enum(modes).optional(),specialization:z.strictObject({title:z.string().max(60),text:z.string().max(20000)}).optional()})
};
export const descriptions={
 send:'Отправить запись другому окну и продолжить работу, не дожидаясь ответа. Ответ на чужую question — kind=answer с reply_to, на task — status, на review-request — verdict с score (0..10), round и evidence=[путь к отчёту]. review-request обязан нести sha коммита. Адресат получит запись следующим ходом. Пиши полный самодостаточный текст: адресат не видит твоей переписки.',
 ask:'Задать вопрос другому окну и дождаться ответа. Адресат ответит, когда дойдёт до вопроса в своей очереди; ожидание может занять минуты. Для поручений и статусов пользуйся send.',
 read_pane:'Прочитать последние реплики разговора в другом окне.',
 merge:'Слить принятый коммит в интеграционную ветку проекта. Пройдёт только SHA, у которого есть принятый вердикт; корень проекта должен быть на интеграционной ветке и без незакоммиченных правок. Право слияния — по merge_roles манифеста.',
 assign_role:'Устаревший инструмент: участников создаёт оркестратор по подтверждённому предложению. Назначение через assign_role отклоняется ядром.'
};
