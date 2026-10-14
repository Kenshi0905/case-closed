import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const base = new URL('../app/lib/', import.meta.url);
async function moduleURL(name, replacements = {}) { let source=(await fs.readFile(new URL(name,base),'utf8')).replace("import 'server-only';",'');for(const [from,to]of Object.entries(replacements))source=source.replaceAll(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'); }
const caseUrl=await moduleURL('case-data.ts');const mapUrl=await moduleURL('map-data.ts');
const bankJSON=JSON.parse(await fs.readFile(new URL('story-bank.generated.json',base),'utf8'));
const bankJSONUrl='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(bankJSON)).toString('base64');
const curatedUrl=await moduleURL('story-bank-curated.ts');
const bankUrl=await moduleURL('story-bank.ts',{"'./story-bank.generated.json'":JSON.stringify(bankJSONUrl),"'./story-bank-curated'":JSON.stringify(curatedUrl)});
const openingUrl=await moduleURL('server/story.ts',{"'../story-bank'":JSON.stringify(bankUrl)});
const opening=await import(openingUrl);
const castUrl=await moduleURL('cast-profiles.ts');
const intentUrl=await moduleURL('server/semantic-intents.ts');
const styleJSON=JSON.parse(await fs.readFile(new URL('dialogue-style-bank.json',base),'utf8'));
const styleUrl='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(styleJSON)).toString('base64');
const dialogueUrl=await moduleURL('server/dialogue.ts',{"'../cast-profiles'":JSON.stringify(castUrl),"'./semantic-intents'":JSON.stringify(intentUrl),"'../dialogue-style-bank.json'":JSON.stringify(styleUrl)});
const limitsUrl=await moduleURL('workshop-limits.ts');
const facilitatorEmailUrl=await moduleURL('facilitator-emails.ts');
const engineUrl=await moduleURL('server/engine.ts',{"'../workshop-limits'":JSON.stringify(limitsUrl),"'../facilitator-emails'":JSON.stringify(facilitatorEmailUrl),"'../case-data'":JSON.stringify(caseUrl),"'../map-data'":JSON.stringify(mapUrl),"'./story'":JSON.stringify(openingUrl),"'./dialogue'":JSON.stringify(dialogueUrl)});
const engine=await import(engineUrl);
const dialogue=await import(dialogueUrl);

function fixture(){const event=engine.createDemo('semantic-case','player');return{event,actor:engine.actorFor(event,'player',null)};}
function ask(f,slot,question){return engine.prepareDialogue(f.event,f.actor,f.event.suspects[slot].id,question,false);}

const clueTerms=['watch','logs','flask','note','camera','note'];
function commit(f,p){engine.recordDialogue(f.event,p,p.answer,false);return p;}

test('scripted retrieval answers specific public backstory details for every suspect without a model',()=>{
 for(let slot=0;slot<6;slot++){
  const f=fixture(),p=f.event.suspects[slot].prompt;
  p.personalKnowledge='I sorted the amber catalogue into alphabetical sections. I labelled the storage drawers with green stickers.';
  p.privateSecret='I destroyed the amber catalogue draft to conceal my mistake.';
  const reply=ask(f,slot,'Tell me about the amber catalogue.');
  assert.equal(reply.answer,'I sorted the amber catalogue into alphabetical sections.');
  assert.ok(reply.scriptedAnswer.endsWith(reply.answer));assert.deepEqual(f.event.evidenceIds,[]);
  assert.ok(!reply.answer.includes('destroyed'));assert.ok(!reply.answer.includes('green stickers'));
  const other=ask(f,slot,'Tell me about the storage drawers.');
  assert.equal(other.answer,'I labelled the storage drawers with green stickers.');
 }
});
test('retrieval does not fabricate causes, accept negated premises or search the private secret',()=>{
 const f=fixture(),p=f.event.suspects[0].prompt;
 p.personalKnowledge='I sorted the amber catalogue into alphabetical sections.';
 p.privateSecret='I destroyed a crimson notebook.';
 for(const question of ['Why did you sort the amber catalogue?','You never sorted the amber catalogue?','Tell me about the crimson notebook.','Tell me about amber planetary biology.']){
  const reply=ask(f,0,question);assert.notEqual(reply.plan.topics[0],'accountDetail');assert.ok(!reply.answer.includes(p.privateSecret));
 }
});
test('retrieval cache cannot substitute one authored detail for a different question',()=>{
 const f=fixture(),p=f.event.suspects[0].prompt;
 p.personalKnowledge='I sorted the amber catalogue into alphabetical sections. I labelled the storage drawers with green stickers.';
 const first=ask(f,0,'Tell me about the amber catalogue.');engine.archiveDialogue(f.event,first,{text:first.answer,engine:'local'});
 assert.ok(engine.reusableDialogue(f.event,first));
 assert.equal(engine.reusableDialogue(f.event,ask(f,0,'Tell me about the storage drawers.')),null);
});
test('activity time and short contextual followups stay with each of the six authored activities',()=>{
 const questions=['What time did you catalogue samples?','What time was the backup?','What time did you restock glassware?','What time did you review the budget?','What time was the call?','What time did you print the data sheets?'];
 const activities=['catalogued samples','checked the backup','restocked glassware','reviewed the budget','called my supervisor','printed data sheets'];
 for(let slot=0;slot<6;slot++){
  const f=fixture(),p=f.event.suspects[slot].prompt,reply=ask(f,slot,questions[slot]);assert.equal(reply.plan.corroboration,false);assert.doesNotMatch(reply.answer,/21:17|21:19/);
  if(slot===0){assert.match(reply.answer,/21:05/);assert.match(reply.answer,/21:25/);}else assert.match(reply.answer,/do not know a more exact time/);
  p.eventTimeline='I '+activities[slot]+' at 21:08. I heard the alarm at 21:19.';const timed=ask(f,slot,questions[slot]);assert.match(timed.answer,/21:08/);assert.doesNotMatch(timed.answer,/21:19/);
  for(const follow of ['At what time?','When exactly?','What time was that?','What exact time?']){commit(f,ask(f,slot,'What is your alibi?'));const next=ask(f,slot,follow);assert.match(next.answer,/21:08/);assert.doesNotMatch(next.answer,/21:19/);}
 }
});
test('twenty generic secret repetitions never unlock a character before or after unrelated evidence',()=>{
 for(let slot=0;slot<6;slot++){const f=fixture(),p=f.event.suspects[slot].prompt;p.secretEvidence=clueTerms[slot];p.disclosureHint='That clue relates to something I kept from Dr. Sen.';
  for(const known of [[],['watch','logs','flask','camera','note'].filter(id=>id!==p.secretEvidence),[p.secretEvidence]]){f.event.evidenceIds=known;for(let n=0;n<20;n++){const reply=commit(f,ask(f,slot,n%2?'What are you hiding?':'Tell me your secret.'));assert.ok(!reply.answer.includes(p.privateSecret));assert.equal(reply.plan.disclosure,'locked');assert.equal(f.event.dialogueDisclosure?.[f.event.suspects[slot].id],undefined);}}
 }
});
test('all six secrets require relevant inspected evidence, a hint and a distinct targeted followup',()=>{
 for(let slot=0;slot<6;slot++){const f=fixture(),suspect=f.event.suspects[slot],p=suspect.prompt;p.secretEvidence=clueTerms[slot];p.disclosureHint='That evidence puts my earlier explanation under pressure.';
  const first='Why are you hiding something connected to the '+clueTerms[slot]+'?';
  assert.equal(commit(f,ask(f,slot,first)).plan.disclosure,'locked');assert.equal(f.event.dialogueDisclosure,undefined);
  f.event.evidenceIds=[p.secretEvidence];const hint=commit(f,ask(f,slot,first));assert.equal(hint.plan.disclosure,'hint');assert.ok(!hint.answer.includes(p.privateSecret));assert.ok(hint.answer.includes(p.disclosureHint));
  for(let n=0;n<20;n++){const repeated=commit(f,ask(f,slot,n%2?first:'What is your secret?'));assert.ok(!repeated.answer.includes(p.privateSecret));}
  const disclosed=commit(f,ask(f,slot,'Explain what you hid concerning the '+clueTerms[slot]+'.'));assert.equal(disclosed.plan.disclosure,'reveal');assert.ok(disclosed.answer.includes(p.privateSecret));
  f.event.dialogue=[];const repeat=ask(f,slot,'Explain what you hid concerning the '+clueTerms[slot]+'.');assert.equal(repeat.plan.disclosure,'repeat');assert.ok(!repeat.answer.includes(p.privateSecret));
  const replay=engine.createDemo('fresh-replay-'+slot,'visitor','replay',JSON.parse(JSON.stringify(f.event)));replay.evidenceIds=[p.secretEvidence];const replayActor=engine.actorFor(replay,'visitor',null);const reset=engine.prepareDialogue(replay,replayActor,suspect.id,'Explain what you hid concerning the '+clueTerms[slot]+'.',false);assert.equal(reset.plan.disclosure,'hint');assert.ok(!reset.answer.includes(p.privateSecret));
 }
});
test('each possible culprit keeps the approved cover account without exposing the sealed solution',()=>{
 for(let slot=0;slot<6;slot++){const f=fixture(),s=f.event.suspects[slot];engine.sealCase(f.event,s.id);
  for(const q of ['Did you kill Dr. Sen?','Are you responsible for his death?','Why should I trust you?']){const reply=ask(f,slot,q);assert.ok(reply.answer.includes(s.prompt.publicAlibi));assert.ok(!reply.answer.includes(s.prompt.privateSecret));assert.doesNotMatch(reply.answer,/I (?:killed|shot|murdered)|S-\d/);assert.deepEqual(f.event.evidenceIds,[]);}
 }
});
test('knowledge policy, disclosure state, approved fields and reveal stage are cache boundaries',()=>{
 const f=fixture(),s=f.event.suspects[0];const p=ask(f,0,'Who are you?');engine.archiveDialogue(f.event,p,{text:p.answer,engine:'local'});assert.ok(engine.reusableDialogue(f.event,p));
 f.event.dialogueArchive[0].cache.version=1;assert.equal(engine.reusableDialogue(f.event,p),null);f.event.dialogueArchive[0].cache.version=2;
 f.event.revealed=true;assert.equal(engine.reusableDialogue(f.event,ask(f,0,'Who are you?')),null);f.event.revealed=false;
 for(const field of ['eventTimeline','personalKnowledge','secretEvidence','disclosureHint']){const saved=s.prompt[field];s.prompt[field]=field==='secretEvidence'?'camera':'A revised approved detail.';assert.equal(engine.reusableDialogue(f.event,ask(f,0,'Who are you?')),null);if(saved===undefined)delete s.prompt[field];else s.prompt[field]=saved;}
 const secret=s.prompt.privateSecret;f.event.dialogueArchive.push({suspectId:s.id,question:'What are you hiding?',permittedAnswer:secret,text:secret,engine:'local',timestamp:1});const locked=ask(f,0,'What are you hiding?');assert.equal(engine.reusableDialogue(f.event,locked),null);assert.ok(!locked.answer.includes(secret));
 assert.ok(!JSON.stringify(engine.snapshot(f.event,{id:'',name:'Viewer',role:'guest',isOwner:false},0)).includes('dialogueDisclosure'));
});


test('watching footage is a camera question while an actual watch-camera compound keeps both objects',()=>{
 for(let slot=0;slot<6;slot++){const f=fixture();f.event.evidenceIds=['watch','camera'];const p=f.event.suspects[slot].prompt;p.personalKnowledge='I watched the camera footage, but could not identify anyone.';
 const reply=ask(f,slot,'Did you watch the camera footage?');assert.deepEqual(reply.plan.requestedClues,['camera']);assert.ok(reply.answer.includes(p.personalKnowledge));assert.doesNotMatch(reply.answer,/pulse|cracked glass|21:17/);
 const compound=ask(f,slot,'What do you know about the watch and camera?');assert.deepEqual(compound.plan.requestedClues,['watch','camera']);assert.equal(compound.plan.recordRequest,false);
 }
});
test('a hint containing the complete private secret cannot disclose it before the final stage',()=>{
 for(let slot=0;slot<6;slot++){const f=fixture(),p=f.event.suspects[slot].prompt;p.secretEvidence=clueTerms[slot];p.disclosureHint='Actually, '+p.privateSecret.toUpperCase()+'!';f.event.evidenceIds=[p.secretEvidence];const hint=commit(f,ask(f,slot,'Why are you hiding something connected to the '+clueTerms[slot]+'?'));assert.equal(hint.plan.disclosure,'hint');assert.ok(!hint.answer.toLowerCase().includes(p.privateSecret.toLowerCase()));assert.ok(!hint.answer.includes('Actually'));
 const paraphrase=ask(f,slot,'Please, why are you hiding something connected to the '+clueTerms[slot]+'?');assert.equal(paraphrase.plan.disclosure,'locked');assert.ok(!paraphrase.answer.includes(p.privateSecret));
 }
});
test('false public event times are corrected without fabricating a departure time or overwriting an activity clock',()=>{
 const f=fixture();const reply=ask(f,4,'I heard the alarm sounded at 22:30. Is that when you left?');assert.match(reply.answer,/alarm sounded at 21:19/);assert.match(reply.answer,/not given an exact departure/);assert.doesNotMatch(reply.answer,/22:30/);
 f.event.suspects[4].prompt.eventTimeline='I called my supervisor at 21:08.';const own=ask(f,4,'Was your call at 21:08 before the alarm?');assert.doesNotMatch(own.answer,/alarm sounded at 21:19/);
});
