import type { PublicState,Viewer,Phase } from './contracts';
import { MAX_PARTICIPANTS } from './workshop-limits';
export type WorkshopTarget='roster'|'cast'|'facilitators'|'rehearsal'|'start'|'opening'|'writing'|'review'|'investigation';
export type WorkshopCheck={id:WorkshopTarget;label:string;detail:string;complete:boolean};
export function workshopReadiness(state:PublicState,viewer:Viewer,now:number){
 const roster=state.admin?.roster.length??state.participants.length,cast=state.suspects.length;
 const approved=state.suspects.filter(s=>s.approved).length;
 const remaining=state.promptDeadline===null?null:Math.max(0,state.promptDeadline-now);
 const checks:WorkshopCheck[]=[];
 if(state.mode==='live')checks.push({id:'roster',label:'Add your participant roster',detail:roster<5?roster+' registered · at least 5 needed to assign writers':roster+' registered · capacity '+MAX_PARTICIPANTS,complete:roster>=5&&roster<=MAX_PARTICIPANTS});
 checks.push({id:'cast',label:'Assign five or six suspect writers',detail:state.castReady===false&&cast?'A writer seat changed · assign the complete cast again':cast?cast+' writers assigned':'Choose people from the roster or assign at random',complete:(cast===5||cast===6)&&state.castReady!==false});
 if(state.mode==='live')checks.push({id:'facilitators',label:'Confirm both facilitators',detail:(state.admin?.facilitators.length??0)+' of 2 registered',complete:state.admin?.facilitators.length===2});
 if(state.rehearsal){const joined=state.rehearsal.seats.filter(s=>s.joined).length,total=state.rehearsal.seats.length;checks.push({id:'rehearsal',label:'Invite your rehearsal participants',detail:joined+' of '+total+' seats joined',complete:total>0&&joined===total})}
 const setupMissing=checks.filter(step=>!step.complete);
 const started=state.mode!=='live'||state.workshopStarted!==false;
 const start={started,disabled:!viewer.canControl||setupMissing.length>0,reasons:[...setupMissing.map(step=>step.label+' · '+step.detail),...(!viewer.canControl?['Only the active facilitator can start the shared opening.']:[])]};
 checks.push({id:'opening',label:'Play the shared opening',detail:state.opening.completed?'All six scenes completed':!started?'Unlocks when the host presses Start game':state.opening.panelIndex?'Scene '+(state.opening.panelIndex+1)+' of '+state.opening.panels.length:'Six short scenes before the writing timer starts',complete:state.opening.completed});
 const missing=checks.find(step=>!step.complete);
 const setupLabels:Record<WorkshopTarget,string>={roster:roster?'Manage participants':'Upload participant roster',cast:'Choose suspect writers',facilitators:'Set up facilitators',rehearsal:'Open rehearsal invitations',start:'Start game',opening:viewer.canControl?(state.opening.panelIndex?'Continue opening':'Open shared opening'):'Watch the shared opening',writing:'Begin six-minute writing',review:'Review submitted characters',investigation:'Begin investigation'};
 if(state.phase===1){const target=!started&&!setupMissing.length?'start':missing?.id??'writing';return{checks,start,approved,required:cast,remaining,next:{kind:target as WorkshopTarget,label:setupLabels[target],disabled:target==='start'&&start.disabled,reason:!started&&!setupMissing.length?'Setup is ready. Start game opens the shared scene for everyone.':missing?.id==='opening'&&!viewer.canControl?'The active facilitator advances the opening. You can watch the shared scene.':missing?missing.detail:'Everyone is set. This starts the full six-minute writing timer for your selected writers.'}};}
 const writing=remaining===null||remaining>0;
 if(state.phase===2)return{checks,start,approved,required:cast,remaining,next:writing?{kind:'review' as const,label:approved===cast&&cast>=5?'Writing window in progress':'Review submitted characters',disabled:approved===cast&&cast>=5,reason:'The full six-minute window must finish. '+approved+' of '+cast+' characters approved.'}:approved<cast||cast<5?{kind:'review' as const,label:'Review remaining characters',disabled:false,reason:approved+' of '+cast+' characters approved. Approve every writer before investigation.'}:{kind:'investigation' as const,label:'Begin investigation',disabled:false,reason:'The writing window is complete and all '+cast+' characters are approved.'}};
 return{checks,start,approved,required:cast,remaining,next:{kind:'opening' as const,label:'Return to the shared game',disabled:false,reason:'The workshop is in progress.'}};
}
export function phaseBlockReason(state:PublicState,phase:Phase,now:number):string|null{
 if(phase<=state.phase)return phase===state.phase?'Current phase':'Completed phase';
 if(phase!==state.phase+1)return 'Complete the preceding phase first';
 if(phase===2){if(state.mode==='live'&&state.workshopStarted===false)return 'Press Start game after completing setup';const readiness=workshopReadiness(state,{role:'admin',canControl:true} as Viewer,now);const missing=readiness.checks.find(step=>!step.complete);if(missing)return missing.label+' · '+missing.detail}
 if(phase===3){if((state.mode==='live'||state.rehearsal)&&(state.promptDeadline===null||now<state.promptDeadline))return 'Wait for the full six-minute writing window';if(state.suspects.length<5||state.suspects.some(s=>!s.approved))return 'Review and approve every suspect character'}
 if(phase===6&&!state.revealed)return 'Reveal the case before the debrief';
 return null;
}
