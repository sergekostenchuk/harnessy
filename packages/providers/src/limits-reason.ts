import type {LimitsCode} from './types.ts';

// Only engine-authored diagnostics cross the CLI/cache boundary. Never copy stderr,
// account data or arbitrary provider error text, even if it looks like a reason.
const reasons:Record<LimitsCode,string>={
 limits_unsupported:'Программа не предоставляет лимиты',limits_not_applicable:'У входа нет окон подписки',
 limits_auth:'Не удалось подтвердить вход для чтения лимитов',limits_rate_limited:'Программа просит повторить чтение лимитов позже',
 limits_unavailable:'Лимиты программы временно недоступны',limits_invalid:'Программа вернула неверный ответ лимитов',
 limits_timeout:'Чтение лимитов превысило время ожидания',limits_storage:'Не удалось прочитать или сохранить кэш лимитов',
};
export const COPILOT_LIMIT_REASONS={
 response:'Copilot: неверный ответ квоты',quota:'Copilot: неверная квота',
 resetMissing:'Copilot не передал дату сброса квоты',window:'Copilot: дата сброса не задаёт календарное месячное окно',
 empty:'Copilot не передал измеряемые квоты',
} as const;
const known=new Set<string>([...Object.values(reasons),...Object.values(COPILOT_LIMIT_REASONS)]);
export function limitsReason(code:LimitsCode,reason?:unknown):string{
 return typeof reason==='string'&&known.has(reason)?reason:reasons[code];
}
