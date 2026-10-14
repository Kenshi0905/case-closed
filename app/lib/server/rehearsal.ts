import 'server-only';
import { REVISION_RETRY_ATTEMPTS, waitForRevisionRetry } from './concurrency';
import type { RehearsalInvite, StateResponse } from '../contracts';
import { AppError, actorFor, createRehearsal, requireAdmin, type Actor, type EventData } from './engine';
import { database, getSession, issueSession, loadEvent, responseState, saveEvent, type StoredEvent } from './store';

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
async function digest(value:string) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function replaceUnusedInvites(event:EventData):Promise<RehearsalInvite[]> {
 const room=event.rehearsal!;const used=room.invites.filter(invite=>invite.usedAt!==null);
 const issued:RehearsalInvite[]=[];const pending=[];
 for(const participant of event.participants){
  if(used.some(invite=>invite.participantId===participant.id))continue;
  const raw=token();pending.push({participantId:participant.id,hash:await digest(raw),usedAt:null});
  issued.push({participantId:participant.id,role:participant.role,token:raw});
 }
 room.invites=[...used,...pending];return issued;
}
export async function startRehearsal(request:Request,participantCount?:number) {
 const hostId=crypto.randomUUID(),event=createRehearsal('rehearsal-'+crypto.randomUUID(),hostId,participantCount);
 const invites=await replaceUnusedInvites(event);
 await database().prepare('INSERT INTO case_events (id, state_json, revision, updated_at) VALUES (?, ?, 0, ?)').bind(event.id,JSON.stringify(event),Date.now()).run();
 const cookie=await issueSession(request,event.id,hostId);
 const data=await responseState({event,revision:0},actorFor(event,hostId,null));data.rehearsalInvites=invites;
 return {data,cookie};
}
export async function refreshRehearsalInvites(stored:StoredEvent,actor:Actor):Promise<StateResponse> {
 requireAdmin(actor);const room=stored.event.rehearsal;
 if(stored.event.mode!=='demo'||!room)throw new AppError('This is not a shared rehearsal.');
 if(room.expiresAt<=Date.now())throw new AppError('These rehearsal invitations have expired.',410);
 if(stored.event.phase!==1)throw new AppError('Invitation links can be replaced during setup only.');
 const invites=await replaceUnusedInvites(stored.event);await saveEvent(stored);
 const data=await responseState(stored,actor);data.rehearsalInvites=invites;return data;
}
/** Claim the fixed seat and create its session in one revision-checked database transaction. */
export async function joinRehearsal(request:Request,input:Record<string,unknown>) {
 if(typeof input.roomId!=='string'||!/^rehearsal-[a-f0-9-]{36}$/.test(input.roomId)||typeof input.inviteToken!=='string'||! /^[a-f0-9]{64}$/.test(input.inviteToken))throw new AppError('Use a valid rehearsal invitation.',400);
 if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||/[\u0000-\u001f]/.test(input.name))throw new AppError('Enter your name, up to 80 characters.');
 if('role' in input||'participantId' in input)throw new AppError('Your invitation determines your participant seat.');
 const name=input.name.trim(),inviteHash=await digest(input.inviteToken),existing=await getSession(request);
 for(let attempt=0;attempt<REVISION_RETRY_ATTEMPTS;attempt++){
  const stored=await loadEvent(input.roomId),room=stored?.event.rehearsal;
  if(!stored||stored.event.mode!=='demo'||!room)throw new AppError('This rehearsal invitation is unavailable.',404);
  if(room.expiresAt<=Date.now())throw new AppError('This rehearsal invitation has expired.',410);
  const invite=room.invites.find(candidate=>candidate.hash===inviteHash);
  if(!invite)throw new AppError('This rehearsal invitation is invalid or has been replaced.',403);
  const participant=stored.event.participants.find(candidate=>candidate.id===invite.participantId);
  if(!participant)throw new AppError('This rehearsal seat is unavailable.',404);
  if(invite.usedAt!==null){
   if(existing?.event_id===stored.event.id&&existing.participant_id===participant.id)return {data:await responseState(stored,actorFor(stored.event,participant.id,null)),cookie:undefined};
   throw new AppError('This invitation has already been used. Ask the host for an available seat.',409);
  }
  if(stored.event.phase!==1)throw new AppError('This rehearsal has already begun.',409);
  participant.name=name;const suspect=stored.event.suspects.find(candidate=>candidate.participantId===participant.id);if(suspect)suspect.writerName=name;
  invite.usedAt=Date.now();const rawSession=token(),sessionHash=await digest(rawSession);
  const result=await database().batch([
   database().prepare('INSERT INTO case_sessions (token_hash, event_id, participant_id, expires_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM case_events WHERE id = ? AND revision = ?)').bind(sessionHash,stored.event.id,participant.id,room.expiresAt,stored.event.id,stored.revision),
   database().prepare('UPDATE case_events SET state_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(stored.event),Date.now(),stored.event.id,stored.revision),
  ]);
  if(result[1].meta.changes!==1){if(attempt===REVISION_RETRY_ATTEMPTS-1)throw new AppError('The room changed while joining. Please try this invitation again.',409);await waitForRevisionRetry(attempt);continue;}
  stored.revision++;
  const cookie='cc_session='+rawSession+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+Math.max(1,Math.floor((room.expiresAt-Date.now())/1000))+(new URL(request.url).protocol==='https:'?'; Secure':'');
  return {data:await responseState(stored,actorFor(stored.event,participant.id,null)),cookie};
 }
 throw new AppError('The room is busy. Please try your invitation again.',409);
}
