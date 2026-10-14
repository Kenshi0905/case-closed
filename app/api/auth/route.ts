import { isFacilitatorEmail } from '../../lib/facilitator-emails';
import { actorFor, AppError, checkOrigin, emailOf } from '../../lib/server/engine';
import { context, issueSession, loadEvent, participantTestSession, providerIdentity, rateLimit, responseState, revokeSession } from '../../lib/server/store';
import { isTestParticipantEmail } from '../../lib/test-participant';
import { body, failure, json } from '../../lib/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const input=await body(request);await rateLimit(request,'email-entry',12,60000);
 const email=emailOf(input.email);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter your roster email.');
 if(isTestParticipantEmail(email)){
  const role=input.testRole??'detective';
  if(role!=='detective'&&role!=='suspect')throw new AppError('Choose Detective or Suspect writer for the participant test.');
  const result=await participantTestSession(request,role);
  return json(result.data,200,result.cookie);
 }
 await context(request,{live:true});const stored=(await loadEvent('live'))!;
 if(isFacilitatorEmail(email)||stored.event.facilitators.some(f=>f.email===email))throw new AppError('Facilitators must use their verified ChatGPT sign-in. Email entry cannot grant facilitator access.',403);
 const person=stored.event.participants.find(p=>p.email===email);
 if(!person)throw new AppError('This email is not on the workshop roster. Ask a facilitator to check the spelling.',403);
 const cookie=await issueSession(request,'live',person.id);
 return json(await responseState(stored,actorFor(stored.event,person.id,providerIdentity(request))),200,cookie);
}catch(error){return failure(error)}}
export async function DELETE(request:Request){try{checkOrigin(request);const cookie=await revokeSession(request);const live=await context(request,{live:true});return json(await responseState(live,live.actor),200,cookie);}catch(error){return failure(error)}}
