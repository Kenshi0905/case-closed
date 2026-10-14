import type { StateResponse } from './contracts';
/** Open a writer's assigned work once, without interrupting drafts on every poll. */
export function participantScreenChange(current:StateResponse|null,next:StateResponse,activeTab:string):'suspects'|'investigation'|null{
 const sameParticipant=current?.state.id===next.state.id&&current.viewer.id===next.viewer.id;
 if(next.viewer.role==='suspect'&&next.state.phase===2&&(!sameParticipant||current?.state.phase!==2||current.viewer.role!=='suspect'))return 'suspects';
 if(current?.state.id===next.state.id&&current.state.phase===2&&next.state.phase===3&&(next.state.testSession||(next.viewer.role==='suspect'&&activeTab==='suspects')))return 'investigation';
 return null;
}

/** A deliberate close stays closed; only a real signed-in session ending greets again. */
export function needsLoginGreeting(current:Pick<StateResponse,'viewer'>|null,next:Pick<StateResponse,'viewer'>):boolean{return !!current&&current.viewer.role!=='guest'&&next.viewer.role==='guest'}
