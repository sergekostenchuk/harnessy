export type ProjectCode='write_failed'|'invalid_settings'|'pricelist_unreadable'|'billing_invalid'|'billing_unreadable'|'invalid_pin'|'invalid_route'|'invalid_path'|'tool_missing'|'tool_timeout'|'tool_failed'|'merge_failed'|'section_invalid'|'section_outside'|'section_unreadable';
export class ProjectError extends Error {
 readonly code:ProjectCode;readonly status:number;readonly vendorText:string;
 constructor(code:ProjectCode,message:string,status=400,cause?:unknown){super(message,{cause});this.name='ProjectError';this.code=code;this.status=status;this.vendorText=cause instanceof Error?cause.message:message}
}
