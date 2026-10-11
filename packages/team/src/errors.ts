export type TeamCode='kind_invalid'|'team_missing'|'team_unreadable'|'team_yaml'|'team_invalid'|'template_missing'|'write_failed'|'role_taken'|'role_unknown'|'seat_exists'|'specialization_invalid'|'seat_file_exists';
export class TeamError extends Error {
 readonly code:TeamCode;readonly vendorText:string;
 constructor(code:TeamCode,message:string,cause?:unknown){super(message,{cause});this.name='TeamError';this.code=code;this.vendorText=cause instanceof Error?cause.message:message}
}
export function message(e:unknown){return e instanceof Error?e.message:String(e)}
