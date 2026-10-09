import {chars} from './strings.ts';
export const CONTEXT_WINDOWS=[['gpt-5.3-codex-spark',128000],['claude-',200000],['gpt-',400000],['deepseek',128000],['qwen',128000],['glm',128000],['kimi',256000]] as const;
export function estTokens(text:string){return text?Math.trunc(chars(text)/3.2)+1:0}
export function contextWindow(model:string):number|null{const lower=model.toLowerCase();return CONTEXT_WINDOWS.find(([key])=>lower.includes(key))?.[1]??null}
// Round the exact IEEE-754 value, without losing its tie direction by multiplying floats.
export function pythonRound(value:number,digits=0):number{
 if(!Number.isFinite(value)||value===0)return value;
 const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,Math.abs(value));const bits=data.getBigUint64(0),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
 let numerator=(exponent?fraction+(1n<<52n):fraction)*10n**BigInt(digits),denominator=1n;const shift=exponent?exponent-1023-52:-1074;
 if(shift>=0)numerator<<=BigInt(shift);else denominator<<=BigInt(-shift);
 let rounded=numerator/denominator;const rest=numerator%denominator;if(rest*2n>denominator||(rest*2n===denominator&&rounded%2n===1n))rounded++;
 return Number(rounded)/10**digits*(value<0?-1:1)
}
