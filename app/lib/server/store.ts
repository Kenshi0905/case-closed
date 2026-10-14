import 'server-only';
import { PRIMARY_FACILITATOR_EMAIL } from '../facilitator-emails';
import { env } from 'cloudflare:workers';
import { ensureFrozenOpening } from './story';
import { isCanonicalDialogueOutput } from './dialogue';
import type { CharacterPrompt } from '../contracts';
import type { TestParticipantRole } from '../test-participant';
import { AppError, actorFor, advanceParticipantTest, ensureLiveController, createDemo, createParticipantTest, createSoloGame, createEvent, type EventData, snapshot, type Actor, reusableDialogue, type prepareDialogue } from './engine';
const runtime=env as Cloudflare.Env & {CASE_AI_PROVIDER?:string;CASE_RELAY_TOKEN?:string;CASE_OWNER_EMAIL?:string};
export type StoredEvent={event:EventData;revision:number};
export function database():D1Database {if(!runtime.DB)throw new AppError('The shared workshop database is unavailable. Check the D1 binding.',503);return runtime.DB;}
export function engineName():'scripted'|'local'{return runtime.CASE_AI_PROVIDER==='local'?'local':'scripted'}
export function providerIdentity(request:Request){const id=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();if(!id||!email)return null;let name=request.headers.get('oai-authenticated-user-full-name')||email.split('@')[0];if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name)}catch{}}return{id,email,name};}
async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function readToken(request:Request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('cc_session='))?.slice(11)??null;}
export async function getSession(request:Request){const token=readToken(request);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return await database().prepare('SELECT event_id, participant_id FROM case_sessions WHERE token_hash = ? AND expires_at > ?').bind(await hash(token),Date.now()).first<{event_id:string;participant_id:string}>();}
export async function loadEvent(id:string):Promise<StoredEvent|null>{for(let attempt=0;attempt<3;attempt++){const row=await database().prepare('SELECT state_json, revision FROM case_events WHERE id = ?').bind(id).first<{state_json:string;revision:number}>();if(!row)return null;const stored={event:JSON.parse(row.state_json) as EventData,revision:row.revision};const storyChanged=ensureFrozenOpening(stored.event),flowChanged=advanceParticipantTest(stored.event),controllerChanged=ensureLiveController(stored.event);if(!storyChanged&&!flowChanged&&!controllerChanged)return stored;try{await saveEvent(stored);return stored;}catch(error){if(!(error instanceof AppError&&error.status===409)||attempt===2)throw error;}}throw new AppError('The workshop changed while preparing its saved story. Try again.',409);}
export async function saveEvent(stored:StoredEvent){const result=await database().prepare('UPDATE case_events SET state_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(stored.event),Date.now(),stored.event.id,stored.revision).run();if(result.meta.changes!==1)throw new AppError('Another action just changed the workshop. Refresh and try again.',409);stored.revision++;return stored;}
async function initialize(){const e=createEvent();await database().prepare('INSERT OR IGNORE INTO case_events (id, state_json, revision, updated_at) VALUES (?, ?, 0, ?)').bind('live',JSON.stringify(e),Date.now()).run();}
export async function context(request:Request,options:{live?:boolean}={}){
 const provider=providerIdentity(request);const session=await getSession(request);
 const requestedId=options.live?'live':session?.event_id??'live';
 let stored=await loadEvent(requestedId);
 if(!stored&&requestedId!=='live')stored=await loadEvent('live');
 // Existing sessions and workshops need no initialization write. Creation remains race-safe.
 if(!stored){await initialize();stored=await loadEvent('live');}
 if(!stored)throw new AppError('The workshop could not be initialized. Please try again.',503);
 if(stored.event.mode==='live'&&provider&&!stored.event.ownerProviderId&&Boolean(runtime.CASE_OWNER_EMAIL)&&provider.email===PRIMARY_FACILITATOR_EMAIL&&provider.email===runtime.CASE_OWNER_EMAIL?.trim().toLowerCase()){
  const e=stored.event;e.ownerProviderId=provider.id;e.facilitators=[{id:crypto.randomUUID(),name:provider.name,email:provider.email,providerId:provider.id}];ensureLiveController(e);
  try{await saveEvent(stored);}catch(error){if(!(error instanceof AppError&&error.status===409))throw error;stored=(await loadEvent('live'))!;}
 }
 const participantId=session?.event_id===stored.event.id?session.participant_id:null;
 const actor=actorFor(stored.event,participantId,provider);return{...stored,actor,provider};
}
/** Local inference is an explicit server AND facilitator opt-in; old saved modes cannot enable it. */
export function selectedAiMode(e:EventData):'local'|'scripted'{return engineName()==='local'&&e.aiMode==='local'?'local':'scripted';}
export async function responseState(stored:StoredEvent,actor:Actor){
 const replay=stored.event.mode==='replay',mode=selectedAiMode(stored.event);
 const data=snapshot(stored.event,actor,stored.revision,replay?'recorded':mode);data.state.aiMode=mode;data.state.localAiAvailable=engineName()==='local';
 if(replay){data.state.relayOnline=false;data.state.lastAIStatus=stored.event.lastAIStatus??'Recorded workshop dialogue · no laptop required';return data;}
 // The standard game never polls the optional host PC or its heartbeat table.
 if(mode==='scripted'){data.state.relayOnline=false;data.state.lastAIStatus='Scripted mode · no local model required';return data;}
 const status=await relayStatus();data.state.relayOnline=status.online;
 if(!status.online)data.state.lastAIStatus='Local relay offline · scripted fallback ready';
 return data;
}
export async function issueSession(request:Request,eventId:string,participantId:string){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const expiresAt=Date.now()+24*60*60*1000;await database().prepare('INSERT INTO case_sessions (token_hash, event_id, participant_id, expires_at) VALUES (?, ?, ?, ?)').bind(await hash(token),eventId,participantId,expiresAt).run();return 'cc_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'+(new URL(request.url).protocol==='https:'?'; Secure':'');}
export async function revokeSession(request:Request){const token=readToken(request);if(token)await database().prepare('DELETE FROM case_sessions WHERE token_hash = ?').bind(await hash(token)).run();return 'cc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(new URL(request.url).protocol==='https:'?'; Secure':'');}
export async function isolatedSession(request:Request,replay:boolean,opening=false){let source:EventData|undefined;if(replay){const live=await loadEvent('live');if(!live?.event.publishedSnapshotId)throw new AppError('The live workshop has not published a replay yet.',409);const archive=await database().prepare('SELECT state_json FROM case_showcases WHERE id = ?').bind(live.event.publishedSnapshotId).first<{state_json:string}>();if(!archive)throw new AppError('The published archive could not be loaded.',404);source=JSON.parse(archive.state_json);}
 const participantId=crypto.randomUUID();const id=(replay?'replay-':'demo-')+crypto.randomUUID();const event=createDemo(id,participantId,replay?'replay':'demo',source);if(opening&&!replay){event.phase=1;event.phaseStartedAt=Date.now();event.opening={...event.opening,panelIndex:0,completed:false,choices:{}};event.story=null;}await database().prepare('INSERT INTO case_events (id, state_json, revision, updated_at) VALUES (?, ?, 0, ?)').bind(id,JSON.stringify(event),Date.now()).run();const cookie=await issueSession(request,id,participantId);const actor=actorFor(event,participantId,null);return{data:await responseState({event,revision:0},actor),cookie};}
export async function soloSession(request:Request){
 const participantId=crypto.randomUUID(),id='solo-'+crypto.randomUUID();
 const event=createSoloGame(id,participantId);
 await database().prepare('INSERT INTO case_events (id, state_json, revision, updated_at) VALUES (?, ?, 0, ?)').bind(id,JSON.stringify(event),Date.now()).run();
 await revokeSession(request);
 const cookie=await issueSession(request,id,participantId);
 return{data:await responseState({event,revision:0},actorFor(event,participantId,null)),cookie};
}
/** Each new test login starts the complete private game; existing saved cases are never reset. */
export async function participantTestSession(request:Request,role:TestParticipantRole='detective'){
 const participantId=crypto.randomUUID();const id='participant-test-'+crypto.randomUUID();
 const event=createParticipantTest(id,participantId,role);
 await database().prepare('INSERT INTO case_events (id, state_json, revision, updated_at) VALUES (?, ?, 0, ?)').bind(id,JSON.stringify(event),Date.now()).run();
 await revokeSession(request);
 const cookie=await issueSession(request,id,participantId);
 return{data:await responseState({event,revision:0},actorFor(event,participantId,null)),cookie};
}
export async function publish(stored:StoredEvent){const id=crypto.randomUUID();stored.event.publishedSnapshotId=id;const archive=structuredClone(stored.event);archive.ownerProviderId=null;archive.controllerId=null;archive.facilitators=archive.facilitators.map(f=>({...f,email:'',providerId:null}));archive.participants=archive.participants.map(p=>({...p,email:''}));const result=await database().batch([
 database().prepare('INSERT INTO case_showcases (id, state_json, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM case_events WHERE id = ? AND revision = ?)').bind(id,JSON.stringify(archive),Date.now(),stored.event.id,stored.revision),
 database().prepare('UPDATE case_events SET state_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(stored.event),Date.now(),stored.event.id,stored.revision)
 ]);if(result[1].meta.changes!==1)throw new AppError('The workshop changed while publishing. Try again.',409);stored.revision++;return stored;}

export async function rateLimit(request:Request,category:string,limit:number,windowMs:number,identity?:string){const source=identity||providerIdentity(request)?.id||request.headers.get('cf-connecting-ip')||'local-preview';const key=category+':'+await hash(source);const start=Math.floor(Date.now()/windowMs)*windowMs;const row=await database().prepare('INSERT INTO case_rate_limits (key, window_start, hits) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, hits = CASE WHEN case_rate_limits.window_start = excluded.window_start THEN case_rate_limits.hits + 1 ELSE 1 END RETURNING hits').bind(key,start).first<{hits:number}>();if(!row||row.hits>limit)throw new AppError('Too many requests. Please pause briefly and try again.',429);}
export async function relayStatus(){const row=await database().prepare('SELECT last_heartbeat, model FROM case_ai_status WHERE id = ?').bind('local').first<{last_heartbeat:number;model:string}>();return{online:Boolean(row&&Date.now()-row.last_heartbeat<45000),model:row?.model??'Local model'};}
export function authorizeRelay(request:Request){const secret=runtime.CASE_RELAY_TOKEN;const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';if(!secret||supplied.length!==secret.length)throw new AppError('Relay authentication required.',401);let different=0;for(let i=0;i<secret.length;i++)different|=secret.charCodeAt(i)^supplied.charCodeAt(i);if(different!==0)throw new AppError('Relay authentication required.',401);}
function heartbeatStatement(model?:unknown){const name=typeof model==='string'&&model.length>0&&model.length<=100?model:'Local model';return database().prepare('INSERT INTO case_ai_status (id, last_heartbeat, model) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_heartbeat=excluded.last_heartbeat, model=CASE WHEN excluded.model = ? THEN case_ai_status.model ELSE excluded.model END').bind('local',Date.now(),name,'Local model');}
export async function heartbeat(model?:unknown){await heartbeatStatement(model).run();}
/** Heartbeat and atomic claim share one database round trip. */
export async function claimJob(){
 const now=Date.now(),leaseToken=crypto.randomUUID();
 const result=await database().batch<{id:string;payload_json:string}>([
  heartbeatStatement(),
  database().prepare("UPDATE case_ai_jobs SET status = 'leased', lease_token = ?, leased_until = ? WHERE id = (SELECT id FROM case_ai_jobs WHERE expires_at > ? AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AND (status = 'pending' OR (status = 'leased' AND leased_until < ?)) ORDER BY created_at LIMIT 1) RETURNING id, payload_json").bind(leaseToken,now+30000,now,now),
 ]);
 const row=result[1].results[0];return row?{id:row.id,leaseToken,...JSON.parse(row.payload_json)}:null;
}
export function validateDialogueOutput(text:unknown,permitted:string,candidates?:unknown){if(candidates===undefined)return isCanonicalDialogueOutput(text,permitted);return Array.isArray(candidates)&&candidates.length>=2&&candidates.length<=4&&candidates.every(value=>typeof value==='string'&&value.length>=5&&value.length<=960)&&candidates.includes(permitted)&&typeof text==='string'&&candidates.includes(text);}
export async function completeJob(input:Record<string,unknown>){
 if(typeof input.jobId!=='string'||typeof input.leaseToken!=='string')throw new AppError('A job ID and lease token are required.');
 const now=Date.now();
 const job=await database().prepare("SELECT payload_json, expires_at FROM case_ai_jobs WHERE id = ? AND status = 'leased' AND lease_token = ? AND leased_until > ? AND expires_at > ?").bind(input.jobId,input.leaseToken,now,now).first<{payload_json:string;expires_at:number}>();
 if(!job)throw new AppError('This job lease expired or was already completed.',409);
 const payload=JSON.parse(job.payload_json),completionTime=Date.now();
 if(job.expires_at<=completionTime)throw new AppError('This job lease expired or was already completed.',409);
 const accepted=validateDialogueOutput(input.text,payload.permittedAnswer,payload.responseCandidates),model=typeof input.model==='string'?input.model.slice(0,100):'Local model';
 const results=await database().batch([
  database().prepare("UPDATE case_ai_jobs SET status = ?, result_text = ?, model = ? WHERE id = ? AND status = 'leased' AND lease_token = ? AND expires_at > ? AND leased_until > ? AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AND leased_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)").bind(accepted?'complete':'rejected',accepted?input.text as string:null,model,input.jobId,input.leaseToken,completionTime,completionTime),
  heartbeatStatement(model),
 ]);
 // A heartbeat alone never acknowledges a reply; the guarded job write must have committed.
 if(results[0].meta.changes!==1)throw new AppError('This job is no longer active.',409);
 return{ok:true,accepted};
}
export const AI_WAIT_MS=8000;
export const AI_JOB_TTL_MS=10000;
export type DialogueResult={text:string;status:string;engine:'local'|'recorded'|'scripted';model?:string;cacheFallback?:boolean};
export type DialogueModelContext={question:string;approvedCharacter:CharacterPrompt;personality:string;style?:string;responseCandidates?:string[];recentConversation?:{speaker:string;text:string}[];intent?:string};
export async function modelDialogue(permittedText:string,name:string,occupation:string,context?:DialogueModelContext):Promise<DialogueResult>{if(runtime.CASE_AI_PROVIDER!=='local')return{text:permittedText,status:'Scripted case engine',engine:'scripted'};const connection=await relayStatus();if(!connection.online)return{text:permittedText,status:'Local relay offline · scripted response',engine:'scripted'};const id=crypto.randomUUID();const now=Date.now();await database().batch([database().prepare('DELETE FROM case_ai_jobs WHERE expires_at < ?').bind(now-60000),database().prepare('INSERT INTO case_ai_jobs (id, payload_json, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id,JSON.stringify({characterName:name,occupation,permittedAnswer:permittedText,...context}),'pending',now,now+AI_JOB_TTL_MS)]);while(Date.now()-now<AI_WAIT_MS){await new Promise(resolve=>setTimeout(resolve,200));const row=await database().prepare('SELECT status, result_text, model FROM case_ai_jobs WHERE id = ?').bind(id).first<{status:string;result_text:string|null;model:string|null}>();if(Date.now()-now>=AI_WAIT_MS)break;if(row?.status==='complete'&&row.result_text)return{text:row.result_text,engine:row.model==='scripted'?'scripted':'local',model:row.model??connection.model,status:row.model==='scripted'?'Local model unavailable · scripted response':'Local AI · '+(row.model??connection.model)};if(row?.status==='rejected')return{text:permittedText,status:'Local output failed validation · scripted response',engine:'scripted'};}await database().prepare("UPDATE case_ai_jobs SET status = 'expired' WHERE id = ? AND status != 'complete'").bind(id).run();return{text:permittedText,status:'Local model timed out · scripted response',engine:'scripted'};}

export async function resolveDialogue(e:EventData,prepared:ReturnType<typeof prepareDialogue>):Promise<DialogueResult>{
 if(prepared.blocked)return{text:prepared.scriptedAnswer,status:'Application guardrail · scripted refusal',engine:'scripted'};
 if(e.mode!=='replay'&&selectedAiMode(e)==='scripted')return{text:prepared.scriptedAnswer,status:'Scripted mode · no local model required',engine:'scripted'};
 const archived=reusableDialogue(e,prepared);
 if(archived){if(archived.engine==='scripted')return{text:archived.text,status:'Saved scripted response · no new model request',engine:'scripted'};return{text:archived.text,status:(e.mode==='replay'?'Recorded workshop dialogue':'Saved local AI response')+(archived.model?' · '+archived.model:''),engine:'recorded',model:archived.model};}
 if(e.mode==='replay')return{text:prepared.scriptedAnswer,status:'No matching recording · scripted response',engine:'scripted'};
 if(prepared.answer.length>960)return{text:prepared.scriptedAnswer,status:'Detailed approved account · scripted response',engine:'scripted'};
 if(engineName()!=='local')return{text:prepared.scriptedAnswer,status:'Local Qwen is not configured · scripted response',engine:'scripted'};
 const result=await modelDialogue(prepared.answer,prepared.s.prompt.characterName,prepared.s.prompt.occupation,{
  question:prepared.input,approvedCharacter:{...prepared.s.prompt},personality:prepared.personality,style:prepared.style,responseCandidates:prepared.responseCandidates,
  recentConversation:e.dialogue.filter(entry=>entry.suspectId===prepared.s.id&&(entry.kind==='question'||entry.kind==='answer')).slice(-4).map(({speaker,text})=>({speaker,text})),
  intent:prepared.plan.topics.join(', ')||(prepared.plan.greeting?'greeting':prepared.plan.followup?'follow-up':'general'),
 });
 return result.engine==='scripted'?{...result,text:prepared.scriptedAnswer,cacheFallback:true}:result;
}
