import 'server-only';
import type { CaseStory, OpeningPanel, OpeningSceneId, OpeningPublic } from '../contracts';
import type { EventData } from './engine';
import { STORY_BANK } from '../story-bank';

export type FrozenFlavor = {id:string;text:string;source:'curated'|'local-qwen'};
type NarrativeChoice = {id:string;label:string;outcome:string};
type NarrativePanel = Omit<OpeningPanel,'flavor'|'choices'> & {choices:NarrativeChoice[]};
export type OpeningState = {panelIndex:number;completed:boolean;choices:Record<string,string>;flavors?:Partial<Record<OpeningSceneId,Record<string,FrozenFlavor>>>;script?:{version:2|3;consequenceActions?:true;panels:NarrativePanel[]}};
/** Anonymous first-person narration. Outcomes replace the setup caption after a choice. */
export const LEGACY_OPENING_SCENES: NarrativePanel[] = [
 {id:'threshold',title:'The late meeting',caption:'Dr. Sen has called me back to Aster Lab. Tomorrow, he reports the altered research results. Tonight, I need him to reconsider.',choices:[
  {id:'routine',label:'Arrive as if nothing is wrong',outcome:'I enter as if this is another late shift. Dr. Sen puts the audit between us. He has been waiting for an explanation.'},
  {id:'hesitation',label:'Ask for a private conversation',outcome:'I ask Dr. Sen to hear me out privately. He agrees to listen, but the audit stays on his desk.'},
  {id:'resolve',label:'Bring the unfinished research report',outcome:'I bring the unfinished report to explain the missing results. Dr. Sen pushes it back. He wants answers about the changes already made.'},
 ]},
 {id:'preparation',title:'No easy answer',caption:'The records lie open between us. Dr. Sen points to results that do not match. I have to respond.',choices:[
  {id:'order',label:'Ask him to check the records',outcome:'I ask him to check the records again. He works through them line by line. The discrepancies remain, and tomorrow’s review stays scheduled.'},
  {id:'unfinished',label:'Ask for one more day',outcome:'I ask for one more day to finish the work. Dr. Sen refuses to delay the review. The deadline I feared is now certain.'},
  {id:'distance',label:'Refuse to discuss the report',outcome:'I refuse to discuss the report. Dr. Sen closes it and decides the review will proceed without my explanation. The room goes quiet.'},
 ]},
 {id:'interruption',title:'What I stand to lose',caption:'He refuses to withdraw the audit. While we argue, I act to silence him. Minutes pass. His voice trails off; he reaches for the chair, suddenly unsteady.',choices:[
  {id:'reputation',label:'Fight to protect my reputation',outcome:'I choose my reputation over his report. While we argued, I acted to silence him. Now Dr. Sen grips the chair; I cannot take that decision back.'},
  {id:'work',label:'Demand credit for my research',outcome:'I decide the research must stay mine. While we argued, I acted to silence him. Now Dr. Sen grips the chair; the argument no longer matters.'},
  {id:'belonging',label:'Beg to stay on the team',outcome:'I cannot accept losing my place here. While we argued, I acted to silence him. Now Dr. Sen grips the chair, unsteady. There is no taking it back.'},
 ]},
 {id:'trace',title:'21:17 — the aftermath',caption:'Dr. Sen loses his grip and falls beside the bench. It is 21:17. The argument is over; I must decide what to do in its aftermath.',choices:[
  {id:'detail',label:'Check for a response',outcome:'I kneel beside Dr. Sen and call his name. He does not respond. His broken watch reads 21:17. I stand, then leave him where he fell.'},
  {id:'silence',label:'Retreat to the doorway',outcome:'I back towards the doorway instead of approaching him. The access terminal stays lit behind me. I leave without touching it or knowing what it recorded.'},
  {id:'doubt',label:'Leave the bench untouched',outcome:'I reach towards the clutter, then stop myself. I leave the flask and everything around it untouched. What remains on this bench will have to speak for itself.'},
 ]},
 {id:'corridor',title:'Outside the room',caption:'I step into the corridor. People are still working nearby. Before I can reach the others, something makes me pause.',choices:[
  {id:'echo',label:'Wait while two voices pass',outcome:'I stop as two voices pass farther down the corridor. I cannot make out the words. Later, everyone will have to account for where they were.'},
  {id:'light',label:'Pass the lighted workstations',outcome:'I pass the lighted workstations. Work is still open on the screens. Someone may remember who was working, and who had left.'},
  {id:'stillness',label:'Pause outside the closed office',outcome:'I pause outside the closed office, then move on. I have no idea who is inside. That missing piece will leave another account to check.'},
 ]},
 {id:'departure',title:'21:19 — the alarm',caption:'At 21:19, the corridor alarm sounds. The others turn toward the laboratory. I have seconds to decide how they will first see me.',choices:[
  {id:'uncertainty',label:'Join the gathering group',outcome:'I join the others as the alarm sounds at 21:19. We turn toward the laboratory together. For now, I look like another person searching for answers.'},
  {id:'weight',label:'Stay apart by the doorway',outcome:'I stay by the doorway as the alarm sounds at 21:19. The others gather ahead of me. Someone may remember that I stood apart.'},
  {id:'questions',label:'Ask what has happened',outcome:'I ask what has happened as the alarm sounds at 21:19. The question draws attention to me. Soon, I will have to answer questions myself.'},
 ]},
];
/** New cases freeze the shooting narrative; archived v2 cases keep their original compound incident. */
export const OPENING_SCENES: NarrativePanel[] = LEGACY_OPENING_SCENES.map(panel=>({...panel,choices:panel.choices.map(choice=>({...choice}))}));
OPENING_SCENES[2]={id:'interruption',title:'The irreversible choice',caption:'Dr. Sen refuses to withdraw the audit. A gun lies within reach. I can still leave. Instead, I decide what I am willing to destroy.',choices:[
 {id:'reputation',label:'Fire to protect my reputation',outcome:'I raise the gun and shoot Dr. Sen. One shot breaks the silence at 21:17. He falls beside the bench. My reputation has cost him his life.'},
 {id:'work',label:'Fire to keep the research',outcome:'I choose the research over Dr. Sen. I raise the gun and fire once. At 21:17, he falls beside the bench. The work cannot justify what I have done.'},
 {id:'belonging',label:'Fire to keep my place',outcome:'I refuse to accept being cast out. I raise the gun and fire once. Dr. Sen falls at 21:17. I have destroyed the place I wanted to keep.'},
]};
OPENING_SCENES[3]={...OPENING_SCENES[3],caption:'Dr. Sen lies motionless beside the bench. His watch broke as he fell. The gunshot was at 21:17; the corridor alarm has not sounded yet.'};
export function isShootingCase(e:EventData){return e.opening?.script?.version===3;}
const PRESSURES={
 reputation:{motif:'Reputation under scrutiny',hidden:'the prospect of public professional disgrace'},
 work:{motif:'Ownership of the work',hidden:'losing control of the research and credit built around it'},
 belonging:{motif:'A place in the laboratory',hidden:'losing a valued place in the research group'},
} as const;
const OPPORTUNITIES={
 routine:{public:'The visitor arrived as if this were another ordinary late shift.',hidden:'arrives under the familiar routine of a late shift and faces Dr. Sen’s audit'},
 hesitation:{public:'The visitor asked Dr. Sen for a private chance to explain.',hidden:'returns for the meeting in Dr. Sen’s note and asks to discuss the audit privately'},
 resolve:{public:'The visitor brought unfinished research, hoping it would explain the missing results.',hidden:'brings an unfinished research report to the meeting requested in Dr. Sen’s note'},
} as const;
const CONFRONTATIONS={
 order:{public:'Dr. Sen rechecked the records and kept the review scheduled.',hidden:'asks Dr. Sen to recheck the records; the discrepancies remain and the review stays scheduled',question:'Ask whose work could have been challenged by a fresh check of the trial records.'},
 unfinished:{public:'Dr. Sen refused a request for one more day.',hidden:'asks for another day, but Dr. Sen refuses to delay the review',question:'Ask who needed more time, then distinguish their unfinished work from evidence of the crime.'},
 distance:{public:'The visitor refused to explain the report, so Dr. Sen ended the discussion.',hidden:'refuses to explain the report; Dr. Sen closes the discussion and keeps the review scheduled',question:'Ask what each person was unwilling to discuss, without treating silence as proof.'},
} as const;
const LEADS={
 detail:{evidenceId:'watch',title:'Start with the broken watch',question:'Which account fits a collapse at 21:17 and an alarm at 21:19?',slots:[0,5]},
 silence:{evidenceId:'logs',title:'Start with the access record',question:'Who can place themselves outside the lab, and what does the surviving access record actually show?',slots:[1,3]},
 doubt:{evidenceId:'flask',title:'Start with the laboratory flask',question:'Who can explain the abandoned flask, and which parts of that explanation can the physical evidence confirm?',slots:[2,4]},
} as const;
const AFTERMATHS={
 detail:{public:'After the collapse, the visitor checked for a response, then left Dr. Sen where he fell.',hidden:'checks for a response, sees the stopped watch, and leaves Dr. Sen where he fell'},
 silence:{public:'After the collapse, the visitor retreated straight to the doorway, leaving the access terminal untouched.',hidden:'retreats to the doorway without approaching Dr. Sen or touching the access terminal'},
 doubt:{public:'After the collapse, the visitor stopped short of clearing the bench and left its contents untouched.',hidden:'stops short of clearing the bench and leaves the flask and its surroundings untouched'},
} as const;
const EXITS={
 echo:{public:'On leaving, the visitor waited while two unseen voices passed along the corridor.',hidden:'pauses outside the lab while two unidentified voices pass farther down the corridor',comparison:'their claimed movements and timings',question:'Check the accounts of who was in the corridor; the voices alone do not identify anyone.'},
 light:{public:'The visitor passed workstations that were still lit and in use.',hidden:'passes the lighted workstations with work still open on their screens',comparison:'what each could verify about the workstations',question:'Compare the workstation accounts with what each person could actually have observed.'},
 stillness:{public:'The visitor paused outside the closed office without finding out who was inside.',hidden:'pauses outside the closed office, then leaves without identifying anyone inside',comparison:'what each account says about the office',question:'Check who claims to have been in the office; a closed door is not an alibi.'},
} as const;
const REACTIONS={
 uncertainty:{public:'When the alarm sounded, the visitor joined the gathering group.',hidden:'joins the others gathering outside the laboratory',question:'Who remembers the group assembling, and who was already there?'},
 weight:{public:'When the alarm sounded, the visitor remained apart by the doorway.',hidden:'stays apart from the gathering group beside the doorway',question:'Compare where people stood after the alarm with where they claim to have been before it.'},
 questions:{public:'When the alarm sounded, the visitor asked what had happened.',hidden:'asks what has happened as the others gather',question:'Distinguish what people already knew from what they learned after the alarm.'},
} as const;
function selectedPlan(e:EventData){const state=ensureOpening(e),choices=state.choices;return{
 pressure:PRESSURES[choices.interruption as keyof typeof PRESSURES]??PRESSURES.reputation,
 opportunity:OPPORTUNITIES[choices.threshold as keyof typeof OPPORTUNITIES]??OPPORTUNITIES.routine,
 confrontation:CONFRONTATIONS[choices.preparation as keyof typeof CONFRONTATIONS]??CONFRONTATIONS.order,
 lead:LEADS[choices.trace as keyof typeof LEADS]??LEADS.detail,
 aftermath:state.script?.consequenceActions?(AFTERMATHS[choices.trace as keyof typeof AFTERMATHS]??AFTERMATHS.detail):null,
 exit:EXITS[choices.corridor as keyof typeof EXITS]??EXITS.echo,
 reaction:REACTIONS[choices.departure as keyof typeof REACTIONS]??REACTIONS.uncertainty,
};}
function stableHash(input:string){let value=2166136261;for(let i=0;i<input.length;i++)value=Math.imul(value^input.charCodeAt(i),16777619);return value>>>0;}
function chooseFlavor(seed:string,slot:OpeningSceneId,choice:string):FrozenFlavor{const options=STORY_BANK.entries.filter(entry=>entry.slot===slot);const entry=options[stableHash(seed+':'+slot+':'+choice)%Math.max(1,options.length)];return entry?{id:entry.id,text:entry.text,source:entry.source}:{id:'fallback-'+slot,text:'The laboratory lights are still on.',source:'curated'};}
function allFrozenFlavors(seed:string){return Object.fromEntries(OPENING_SCENES.map(scene=>[scene.id,Object.fromEntries(['unselected',...scene.choices.map(choice=>choice.id)].map(choice=>[choice,chooseFlavor(seed,scene.id,choice)]))])) as Record<OpeningSceneId,Record<string,FrozenFlavor>>;}
function frozenScript(version:2|3=3):NonNullable<OpeningState['script']>{return{version,consequenceActions:true,panels:(version===3?OPENING_SCENES:LEGACY_OPENING_SCENES).map(panel=>({...panel,choices:panel.choices.map(choice=>({...choice}))}))};}
export function initialOpening(seed?:string,version:2|3=3):OpeningState{return{panelIndex:0,completed:false,choices:{},script:frozenScript(version),...(seed?{flavors:allFrozenFlavors(seed)}:{})};}
export function narrativeSeed(e:EventData){return e.narrativeSeed??e.id+':'+e.createdAt;}
/** Freeze legacy metadata once through the caller's existing CAS write. Choices and stored flavors survive. */
export function ensureFrozenOpening(e:EventData):boolean{
 let changed=false;if(!e.narrativeSeed){e.narrativeSeed=narrativeSeed(e);changed=true;}
 if(!e.opening){e.opening=initialOpening(e.narrativeSeed,2);if(e.phase!==1){e.opening.panelIndex=5;e.opening.completed=true;e.opening.choices=Object.fromEntries(OPENING_SCENES.map(s=>[s.id,s.choices[0].id]));}changed=true;}
 if(!e.opening.script){e.opening.script=frozenScript(2);changed=true;}
 // The owner requested the new crime for the still-empty workshop. Never rewrite a started or saved case.
 if(e.id==='live'&&e.mode==='live'&&e.phase===1&&!e.secret&&!e.story&&!e.publishedSnapshotId&&e.promptDeadline===null&&
  e.participants.length===0&&e.suspects.length===0&&e.submissions.length===0&&e.evidenceIds.length===0&&Object.keys(e.votes).length===0&&
  e.opening.script.version===2&&e.opening.panelIndex===0&&!e.opening.completed&&Object.keys(e.opening.choices).length===0){
  e.opening.script=frozenScript(3);changed=true;
 }
 if(!e.opening.flavors){e.opening.flavors={};changed=true;}
 for(const scene of OPENING_SCENES){const byChoice=e.opening.flavors[scene.id]??{};if(!e.opening.flavors[scene.id]){e.opening.flavors[scene.id]=byChoice;changed=true;}for(const choice of ['unselected',...scene.choices.map(option=>option.id)]){const entry=byChoice[choice];if(!entry||typeof entry.id!=='string'||typeof entry.text!=='string'||(entry.source!=='curated'&&entry.source!=='local-qwen')){byChoice[choice]=chooseFlavor(e.narrativeSeed,scene.id,choice);changed=true;}}}
 return changed;
}
export function ensureOpening(e:EventData):OpeningState{ensureFrozenOpening(e);return e.opening!;}
function flavor(e:EventData,slot:OpeningSceneId){const state=ensureOpening(e);return state.flavors![slot]![state.choices[slot]??'unselected'];}
export function openingSnapshot(e:EventData):OpeningPublic{const progress=ensureOpening(e);return{scriptVersion:progress.script!.version,panelIndex:progress.panelIndex,completed:progress.completed,choices:{...progress.choices},panels:progress.script!.panels.map(panel=>({id:panel.id,title:panel.title,caption:panel.choices.find(choice=>choice.id===progress.choices[panel.id])?.outcome??panel.caption,choices:panel.choices.map(({id,label})=>({id,label})),flavor:flavor(e,panel.id)?.text??'The laboratory lights are still on.'}))};}
const quotation=(value:string)=>'“'+value.trim().replace(/[“”]/g,'"')+'”';
/** Public accounts remain attributed claims. No authored secrets or named narrator enter the briefing. */
export function composeCaseStory(e:EventData):CaseStory{
 const approved=e.suspects.filter(s=>s.approved);const fragments=OPENING_SCENES.map(scene=>flavor(e,scene.id));const plan=selectedPlan(e);
 const pair=plan.lead.slots.map(index=>approved[Math.min(index,approved.length-1)]).filter(Boolean);const unique=[...new Map(pair.map(s=>[s.id,s])).values()];
 const connections=unique.length===2?[{id:'first-comparison',suspectIds:unique.map(s=>s.id),prompt:'Compare '+unique[0].prompt.characterName+' and '+unique[1].prompt.characterName+' through '+plan.exit.comparison+'.',reason:plan.exit.question+' Their stated relationships — '+quotation(unique[0].prompt.relationship)+' and '+quotation(unique[1].prompt.relationship)+' — give two accounts to check. '+plan.confrontation.question}]:[];
 return{title:e.title,motif:plan.pressure.motif,investigationLead:{evidenceId:plan.lead.evidenceId,title:plan.lead.title,question:plan.lead.question},connections,summary:(isShootingCase(e)?'Dr. Arjun Sen is shot at 21:17; the corridor alarm follows at 21:19. The laboratory flask concerns the research dispute, not the cause of death. ':'Dr. Arjun Sen collapses at 21:17; the corridor alarm follows at 21:19. ')+plan.opportunity.public+' '+plan.confrontation.public+' The dispute centers on '+plan.pressure.motif.toLowerCase()+'. '+(plan.aftermath?plan.aftermath.public+' ':'')+plan.exit.public+' '+plan.reaction.public+' The visitor’s identity is unknown. Test the approved accounts against all five physical clues.',framing:plan.lead.question+' '+plan.confrontation.question+' '+plan.reaction.question+' '+(fragments[0]?.text??''),suspectThreads:approved.map(s=>({suspectId:s.id,heading:s.prompt.characterName+' · '+s.prompt.occupation,text:s.prompt.relationship+'. Their account: '+quotation(s.prompt.publicAlibi)+' Treat this as a statement to investigate, not an established fact.'})),generatedAt:e.phaseStartedAt,source:fragments.some(f=>f?.source==='local-qwen')?'local-flavor':'story-bank'};
}
/** Preserve the culprit and forensic clocks while carrying the chosen encounter into the reconstruction. */
export function connectPrivateBackstories(e:EventData){
 if(!e.secret)return;const culprit=e.suspects.find(s=>s.id===e.secret!.killerId);if(!culprit)return;const plan=selectedPlan(e);e.secret.killerName=culprit.prompt.characterName;
 e.secret.motive='Dr. Sen’s audit threatened to expose altered trial results linked to '+culprit.prompt.characterName+'. The fear driving the confrontation was '+plan.pressure.hidden+'. Their own account describes a separate concern: '+quotation(culprit.prompt.privateSecret);
 e.secret.explanation=isShootingCase(e)?culprit.prompt.characterName+' shot Dr. Sen at 21:17 after the audit confrontation. The stopped watch fixes that moment, before the 21:19 alarm. The backup ledger records entry at 21:12; corridor frames show the same badge at the doorway with a handgun immediately after the shot. The meeting note explains the confrontation. The flask’s violet residue belongs to the research dispute and does not explain the death.':culprit.prompt.characterName+' gave Dr. Sen the altered compound at 21:14; the flask’s V-17 residue explains his collapse three minutes later. The watch fixes 21:17, before the 21:19 alarm. The backup access ledger and corridor image independently place '+culprit.prompt.characterName+' at the laboratory door, while the meeting note ties the visit to Dr. Sen’s audit.';
 const moments=new Map(e.secret.timeline.map(item=>[item.time,item]));
 if(isShootingCase(e)){moments.delete('21:05');moments.set('21:14',{time:'21:14',event:'The argument over the research audit continues. The trial flask remains on the bench; its contents are not the cause of death.'});moments.set('21:17',{time:'21:17',event:culprit.prompt.characterName+' fires one shot at Dr. Sen, who falls beside the bench. His watch breaks at 21:17; a corridor frame records the same badge with a handgun immediately afterward.'});}
 moments.set('21:12',{time:'21:12',event:culprit.prompt.characterName+' '+plan.opportunity.hidden+'; the badge transaction records entry to the restricted laboratory.'});
 moments.set('21:13',{time:'21:13',event:culprit.prompt.characterName+' '+plan.confrontation.hidden+'.'});
 moments.set('21:18',{time:'21:18',event:culprit.prompt.characterName+' '+(plan.aftermath?plan.aftermath.hidden+'; then ':'')+plan.exit.hidden+'. This observation identifies no other suspect.'});
 moments.set('21:19',{time:'21:19',event:'The corridor alarm sounds and the others return toward the laboratory. '+culprit.prompt.characterName+' '+plan.reaction.hidden+'.'});
 e.secret.timeline=[...moments.values()].sort((a,b)=>a.time.localeCompare(b.time));
 e.secret.redHerrings=e.suspects.filter(s=>s.id!==culprit.id).map(s=>{const compared=e.suspects[(e.suspects.indexOf(s)+1)%e.suspects.length];return{suspectId:s.id,name:s.prompt.characterName,secret:s.prompt.privateSecret,explanation:s.prompt.characterName+' described '+quotation(s.prompt.relationship)+' and claimed '+quotation(s.prompt.publicAlibi)+'. Their concealed issue explains why this account deserved checking alongside '+compared.prompt.characterName+' through '+plan.exit.comparison+'. It is a separate pressure, not proof of this crime.'};});
}
