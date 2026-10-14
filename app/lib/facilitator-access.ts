import type { Role } from './contracts';

export const FACILITATOR_ENTRY = '/api/facilitator';

export function resolveFacilitatorReturn(marker:string|null,mode:'live'|'demo'|'replay',role:Role):'ready'|'denied'|'error'|null{
 if(marker==='ready')return mode==='live'&&role==='admin'?'ready':'error';
 if(marker==='denied'||marker==='error')return marker;
 return null;
}
