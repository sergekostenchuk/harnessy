// Observations agreed in TS-01. Extend only from vendor evidence.
export const VENDOR_ERRORS=[
 {vendor:'claude',code:'session_missing',text:'No conversation found with session ID'},
 {vendor:'codex',code:'model_unsupported',text:'model is not supported when using Codex with a ChatGPT account'}
] as const;
