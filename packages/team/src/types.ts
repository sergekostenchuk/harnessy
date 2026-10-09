import type {Mode,Vendor} from './catalog.ts';
export interface Seat {id:string;role:string;label:string;vendor:Vendor;model:string;mode:Mode;digest:boolean;writePaths:string[];instructions:string|null;worktree:string|null}
export interface Team {version:number;project:string;integrationBranch:string;seats:Record<string,Seat>;harnessDir:string;mergeRoles:string[];warnings:string[]}
export interface AddSeatArgs {role:string;label?:string;vendor:Vendor;model:string;mode:Mode;instructions?:string|null;specialization?:{title:string;text:string}}
export interface FileOptions {templatesDir?:string;now?:()=>Date;replace?:(from:string,to:string)=>void}
