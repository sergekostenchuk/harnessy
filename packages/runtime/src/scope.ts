import type {TurnScope} from './types.ts';
import type {Vendor} from '@harnessy/providers';
import {RuntimeError} from './errors.ts';
export class Scopes {
 private current=new Map<string,TurnScope>();
 create(projectDir:string,seatId:string,turnInstanceId:string):TurnScope {const scope=Object.freeze({projectDir,seatId,turnInstanceId});this.current.set(seatId,scope);return scope}
 get(seatId:string){return this.current.get(seatId)??null}
 assert(scope:TurnScope):void{if(this.current.get(scope.seatId)!==scope)throw new RuntimeError('turn_ended','ход не активен',403)}
 revoke(scope:TurnScope):void{if(this.current.get(scope.seatId)===scope)this.current.delete(scope.seatId)}
 clear():void{this.current.clear()}
}
export class ProcessTokens {
 private tokens=new Map<string,{generation:number;seatId:string;vendor:Vendor}>();
 private scopes:Scopes;constructor(scopes:Scopes){this.scopes=scopes}
 register(token:string,generation:number,seatId:string,vendor:Vendor):void {
 if(!token)throw new RuntimeError('token_invalid','недействительный токен',403);const prev=this.tokens.get(token);
 if(prev&&(prev.generation!==generation||prev.seatId!==seatId||prev.vendor!==vendor))throw new RuntimeError('token_invalid','недействительный токен',403);
 this.tokens.set(token,{generation,seatId,vendor})
 }
 revoke(token:string,generation:number,seatId:string,vendor:Vendor):void{const entry=this.tokens.get(token);if(entry?.generation===generation&&entry.seatId===seatId&&entry.vendor===vendor)this.tokens.delete(token)}
 revokeVendor(generation:number,vendor:Vendor):void{for(const [key,v] of this.tokens)if(v.generation===generation&&v.vendor===vendor)this.tokens.delete(key)}
 clear():void{this.tokens.clear()}
 validate(from:string,token:string,generation:number,vendor:string):TurnScope {const entry=this.tokens.get(token);if(!entry||entry.generation!==generation||entry.seatId!==from||entry.vendor!==vendor)throw new RuntimeError('token_invalid','недействительный токен',403);const scope=this.scopes.get(from);if(!scope)throw new RuntimeError('turn_ended','ход не активен',403);return scope}
}
