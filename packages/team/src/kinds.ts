import {TeamError} from './errors.ts';
export const SEAT_KINDS=['orchestrator','assistant','architect','worker','reviewer','tester','researcher'] as const;
export type SeatKind=typeof SEAT_KINDS[number];
export function legacyKind(role:unknown):SeatKind|null {
 return role==='executor'?'worker':typeof role==='string'&&SEAT_KINDS.includes(role as SeatKind)?role as SeatKind:null;
}
/** Only an absent field may use the explicit legacy mapping. Labels and seat ids grant no rights. */
export function seatKind(kind:unknown,role?:unknown):SeatKind {
 const value=kind===undefined?legacyKind(role):typeof kind==='string'&&SEAT_KINDS.includes(kind as SeatKind)?kind as SeatKind:null;
 if(!value)throw new TeamError('kind_invalid','kind: ожидается '+SEAT_KINDS.join(', '));return value;
}
