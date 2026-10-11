import {trim} from './strings.ts';
import type {SeatView,RoleNoteDeps} from './types.ts';
export function roleNote(seat:SeatView,deps:RoleNoteDeps):string{
 const parts:string[]=[],instr=trim(deps.instructionText);if(instr)parts.push(instr);if(deps.policySummary!==null)parts.push(deps.policySummary);
 if(seat.writePaths.length)parts.push('Правки файлов тебе разрешены только в: '+seat.writePaths.join(', ')+'. Остальное — только чтение.');
 const where=['Корень проекта: '+deps.projectDir+'.'];if(deps.team)where.push('Интеграционная ветка: '+deps.team.integrationBranch+'.');
 where.push(seat.worktree?'Твоя рабочая папка: '+seat.worktree+' — worktree на ветке '+(seat.branch??'None')+'; корень проекта и чужие worktree не трогай.':'Ты работаешь в корне проекта.');
 if(deps.repoRoot){where.push('Отчёты ревью и тестов: '+deps.projectDir+'/.harness/evidence/<тред>/r<раунд>/report.md с разделами Ran, Skipped, Planned, Manual.');if(deps.team?.mergeRoles.includes((seat.kind===undefined?seat.role:seat.kind)||''))where.push('Слияние принятых вех — только инструментом merge с SHA принятого вердикта.')}
 else where.push('Папка не под git: worktree, sha и слияние недоступны.');
 if((seat.kind===undefined?seat.role:seat.kind)==='orchestrator')where.push('Команду создавай через propose_seats: явно укажи kind, label, vendor, model, mode и предметную intro. Получи proposalId/version. Только после подтверждения этой версии владельцем в окне вызывай create_seats с теми же proposalId/version. Ответ «да» в переписке не заменяет подтверждение.');
 parts.push(where.join(' '));return parts.join('\n\n')
}
