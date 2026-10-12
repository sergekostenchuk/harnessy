import {ProviderError} from './types.ts';
export type LoginFailure='region'|'blocked'|'offline'|'unresponsive';
/** Only typed evidence gives a specific cause; neither stderr nor a free-form message does. */
export function loginFailure(error:unknown):LoginFailure {
 if(error instanceof ProviderError){if(error.code==='region_restricted')return 'region';if(error.code==='network_blocked')return 'blocked';if(error.code==='network_unavailable')return 'offline'}
 const code=error instanceof Error?(error as NodeJS.ErrnoException).code:undefined;
 if(code&&['ENETUNREACH','EHOSTUNREACH','ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(code))return 'offline';
 return 'unresponsive';
}
