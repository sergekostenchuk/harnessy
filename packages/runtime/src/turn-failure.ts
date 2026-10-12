import {safeDiagnostic} from '@harnessy/providers';
export interface TurnFailure {code:string;reason:string;durationMs:number}
export function turnFailure(error:unknown,project:string,durationMs:number):TurnFailure {
 const e=error as {code?:unknown;message?:unknown};
 const code=typeof e?.code==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(e.code)?e.code:'internal';
 const reason=typeof e?.message==='string'&&e.message.trim()?e.message:'Причина отказа не получена';
 return {code:safeDiagnostic(code)===code?code:'internal',reason:safeDiagnostic(reason,{project}),durationMs:Number.isFinite(durationMs)?Math.max(0,durationMs):0};
}
