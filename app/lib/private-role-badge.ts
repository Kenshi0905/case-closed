import type { PublicState, Viewer } from './contracts';
export function privateRoleBadge(state:Pick<PublicState,'mode'|'rehearsal'|'phase'>,viewer:Pick<Viewer,'role'|'ownCaseRole'>){
 if(viewer.role!=='suspect'||(state.mode!=='live'&&!state.rehearsal))return null;
 const culprit=state.phase>=3&&viewer.ownCaseRole==='culprit';
 return{culprit,label:culprit?'Culprit':'Suspect',description:culprit?'Your private assignment: culprit. Only you see this badge. Follow the shared investigation.':state.phase<3?'You are a suspect writer. Your private assignment is confirmed after the writing phase.':'Your private assignment: suspect. Only you see this badge. Follow the shared investigation.'};
}
