import {trim,rstrip,lines} from './strings.ts';
export function memorySections(text:string):ReadonlyMap<string,string>{
 const out=new Map<string,string>();let current:string|null=null;
 for(const line of lines(text)){
 if(line.startsWith('## ')){current=trim(line.slice(3)).toLowerCase();out.set(current,'')}
 else if(current!==null){const s=trim(line);if(s&&!s.startsWith('(')&&!['—','-','–'].includes(s))out.set(current,(out.get(current)??'')+rstrip(line)+'\n')}
 }
 return new Map([...out].map(([key,value])=>[key,trim(value)]))
}
