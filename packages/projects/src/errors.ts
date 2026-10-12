export type ProjectCode='network_invalid'|'network_unreadable'|'network_conflict'|'exit_unknown'|'exit_in_use'|'iface_unsupported'|'provider_unknown'|'credential_unavailable'|'credential_cleanup_failed'|'llm_conflict'|'write_failed'|'invalid_settings'|'pricelist_unreadable'|'billing_invalid'|'billing_unreadable'|'billing_conflict'|'invalid_pin'|'pins_unreadable'|'invalid_route'|'invalid_path'|'tool_missing'|'tool_timeout'|'tool_failed'|'merge_failed'|'section_invalid'|'section_outside'|'section_unreadable';
export class ProjectError extends Error {
 readonly code:ProjectCode;readonly status:number;readonly vendorText:string;
 constructor(code:ProjectCode,message:string,status=400,cause?:unknown){super(message,{cause});this.name='ProjectError';this.code=code;this.status=status;this.vendorText=cause instanceof Error?cause.message:message}
}
