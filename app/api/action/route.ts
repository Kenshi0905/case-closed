import { REVISION_RETRY_ATTEMPTS, waitForRevisionRetry } from '../../lib/server/concurrency';
import type { Action } from '../../lib/contracts';
import { actorFor, AppError, archiveDialogue, mutate, prepareDialogue, recordDialogue } from '../../lib/server/engine';
import { context, soloSession, isolatedSession, loadEvent, resolveDialogue, providerIdentity, publish, rateLimit, responseState, revokeSession, saveEvent } from '../../lib/server/store';
import { body, failure, json } from '../../lib/server/http';
import { refreshRehearsalInvites, startRehearsal } from '../../lib/server/rehearsal';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const input=await body(request) as Action;const ctx=await context(request);
 if(input.type==='startSolo'){await rateLimit(request,'startSolo',30,3600000);const result=await soloSession(request);return json(result.data,200,result.cookie)}
 if((input.type==='startDemo'||input.type==='startRehearsal')&&ctx.actor.role!=='admin')throw new AppError('Sign in as a facilitator to create a practice session.',ctx.actor.role==='guest'?401:403);
 if(input.type==='startReplay'&&ctx.actor.role==='guest')throw new AppError('Join the workshop before opening its published replay.',401);
 if(input.type==='startRehearsal'){await rateLimit(request,'startRehearsal',4,3600000);const result=await startRehearsal(request,input.participantCount);return json(result.data,200,result.cookie)}
 if(input.type==='startDemo'||input.type==='startReplay'){await rateLimit(request,input.type,12,3600000);const result=await isolatedSession(request,input.type==='startReplay',input.type==='startDemo'&&input.opening===true);return json(result.data,200,result.cookie)}
 if(input.type==='exitSession'){const cookie=await revokeSession(request);const live=(await loadEvent('live'))!;return json(await responseState(live,actorFor(live.event,null,providerIdentity(request))),200,cookie)}
 if(ctx.actor.role==='guest')throw new AppError('Join the workshop or open a practice case first.',401);
 if(input.type==='refreshRehearsalInvites')return json(await refreshRehearsalInvites(ctx,ctx.actor));
 if(input.type==='interrogate'||input.type==='stressTest'){
  const stress=input.type==='stressTest';const prepared=prepareDialogue(ctx.event,ctx.actor,input.suspectId,input.message,stress);await rateLimit(request,'dialogue',30,60000,ctx.actor.providerId??ctx.actor.id);
  const answer=await resolveDialogue(ctx.event,prepared);
  for(let attempt=0;attempt<3;attempt++){
   const current=await context(request);if(current.event.id!==ctx.event.id)throw new AppError('Your investigation session changed. Try again.',409);
   const next=prepareDialogue(current.event,current.actor,input.suspectId,input.message,stress);
   const matching=next.answer===prepared.answer;recordDialogue(current.event,next,matching?answer.text:next.scriptedAnswer,stress);if(matching)archiveDialogue(current.event,next,answer);current.event.lastAIStatus=matching?answer.status:'Case state changed · scripted response';
   try{await saveEvent(current);return json(await responseState(current,current.actor));}catch(error){if(!(error instanceof AppError&&error.status===409)||attempt===2)throw error;}
  }
  throw new AppError('The workshop is busy. Try the question again.',409);
 }
 // Retry only a known uncommitted revision conflict, never a network failure or a movement path.
 const commuting=input.type==='submitPrompt'||input.type==='vote';let current=ctx;
 for(let attempt=0;attempt<(commuting?REVISION_RETRY_ATTEMPTS:1);attempt++){
  mutate(current.event,current.actor,input);
  try{if(input.type==='publishReplay')await publish(current);else await saveEvent(current);}
  catch(error){
   if(!commuting||!(error instanceof AppError&&error.status===409)||attempt===REVISION_RETRY_ATTEMPTS-1)throw error;
   await waitForRevisionRetry(attempt);
   current=await context(request);if(current.event.id!==ctx.event.id||current.actor.id!==ctx.actor.id)throw new AppError('Your workshop session changed. Please refresh.',409);
   continue;
  }
  return json(await responseState(current,current.actor));
 }
 throw new AppError('The workshop is busy. Please try again.',409);
 }catch(error){return failure(error)}}
