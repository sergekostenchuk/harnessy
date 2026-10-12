/** Public catalog fields share these checks for live reads and persisted observations. */
type Kind='text'|'modelId'|'label'|'version'|'email'|'account';
const credential=/(?:sk[-_]|gh[pousr]_|github_pat_|AIza|Bearer\s|PRIVATE KEY|api[ _-]?key|(?:password|secret|token)\s*[:=])/i;
const shapes:Record<Kind,{max:number;pattern:RegExp}>={
 text:{max:2048,pattern:/^[\p{L}\p{N}\p{M}\p{P}\p{S} ]+$/u},
 modelId:{max:180,pattern:/^[A-Za-z0-9][A-Za-z0-9._:/~+@-]*$/},
 label:{max:200,pattern:/^[\p{L}\p{N}][\p{L}\p{N} ._:/~+()\[\]·×,@%-]*$/u},
 version:{max:128,pattern:/^[A-Za-z0-9][A-Za-z0-9._+ ()/-]*$/},
 email:{max:254,pattern:/^[\p{L}\p{N}][\p{L}\p{N}._+%-]*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u},
 account:{max:254,pattern:/^[\p{L}\p{N}]•••@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u},
};
export function publicCatalogText(value:unknown,kind:Kind='text'):value is string{const {max,pattern}=shapes[kind];return typeof value==='string'&&value.length>0&&value.length<=max&&pattern.test(value)&&!credential.test(value)}
export function maskCatalogAccount(value:unknown):string|undefined{if(!publicCatalogText(value,'email'))return undefined;return [...value][0]+'•••@'+value.split('@')[1]}
