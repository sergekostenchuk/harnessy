/** Shared credential rules for catalog/cache validation and public error text. */
const secretField=/(?:token|secret|password|credential|authorization|cookie|api[ ._-]?key|session)/i;
const secretMarker=new RegExp(String.raw`(?:sk[-_]|pk[-_]|gh[pousr]_|github_pat_|AIza|xox[baprs]-|Bearer\s|PRIVATE KEY|api[ ._-]?key|["']?[\w-]*${secretField.source}[\w-]*["']?\s*[:=]|\bsecret\b)`,'i');
export const hasSecretField=(text:string)=>secretField.test(text);
export const hasPublicSecret=(text:string)=>secretMarker.test(text);
/** Redact before truncating. After a credential marker discard the tail, including multiline values. */
export function safeDiagnostic(text:string,options:{project?:string;route?:boolean;limit?:number}={}):string {
 let value=text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'');
 const marker=secretMarker.exec(value);if(marker)value=value.slice(0,marker.index)+'[секрет скрыт]';
 if(options.project)value=value.replaceAll(options.project,'<project>');
 return value.replace(/[A-Za-z0-9_+/.=-]{24,}/g,'[скрыто]')
  .replace(/(?:~\/|[A-Za-z]:[\\/]|\/)(?:[^\s<>"'`,;\]\[{}]+)/g,path=>options.route&&path.startsWith('/api/')?path:'[путь скрыт]')
  .slice(0,options.limit??600).trim();
}
