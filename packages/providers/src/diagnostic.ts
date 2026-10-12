/** Bounded public stderr excerpt; exact environment credentials are removed by the caller first. */
export function safeDiagnostic(text:string):string {
 return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'')
  .replace(/Bearer\s+[^\s,;]+/gi,'[вход скрыт]')
  .replace(/["']?[\w-]*(?:token|password|api[_-]?key|secret|authorization|cookie)[\w-]*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'[секрет скрыт]')
  .replace(/(?:sk|pk|ghp|gho|xoxb|xoxp)[-_][A-Za-z0-9_-]+/g,'[ключ скрыт]')
  .replace(/[A-Za-z0-9_+/.=-]{24,}/g,'[скрыто]').slice(0,600).trim();
}
