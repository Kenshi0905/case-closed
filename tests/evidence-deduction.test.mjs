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

test('every possible culprit in five- and six-person cases requires intersecting anonymous clues',()=>{
 const fields=[['logs','clearance'],['camera','badgeMark'],['note','docketGroup']];let checked=0;
 for(let seed=0;seed<12;seed++)for(const size of [5,6])for(let killer=0;killer<size;killer++)for(const version of [2,3]){
  const f=fixture(),e=f.event;e.narrativeSeed='deduction-'+seed;e.suspects=e.suspects.slice(0,size);e.opening=opening.initialOpening(e.narrativeSeed,version);engine.sealCase(e,e.suspects[killer].id);e.evidenceIds=['watch','logs','flask','camera','note'];
  const before=JSON.stringify(e),view=engine.snapshot(e,f.actor,1).state;assert.equal(JSON.stringify(e),before,'Projection must not rewrite a stored case');assert.equal(view.reveal,null);
  const target=view.suspects[killer].accessProfile;assert.ok(target);let intersection=view.suspects;
  for(const[id,key]of fields){const clue=view.evidence.find(c=>c.id===id),text=clue.description+' '+clue.significance;assert.ok(clue.description.includes(target[key]));const candidates=view.suspects.filter(s=>s.accessProfile[key]===target[key]);assert.ok(candidates.length>=2);if(size===6)assert.equal(candidates.length,3);intersection=intersection.filter(s=>s.accessProfile[key]===target[key]);for(const suspect of view.suspects)assert.ok(!text.includes(suspect.name),'A clue names '+suspect.name);assert.doesNotMatch(text,/S-\d|suspect-\d|handgun/);}
  assert.deepEqual(intersection.map(s=>s.id),[e.suspects[killer].id]);
  e.revealed=true;const reveal=engine.snapshot(e,f.actor,2).state.reveal;assert.equal(reveal.killerId,e.suspects[killer].id);assert.ok(reveal.explanation.includes(e.suspects[killer].prompt.characterName));for(const value of Object.values(target))assert.ok(reveal.explanation.includes(value));assert.ok(reveal.explanation.includes('matches all three'));
  const serialized=JSON.stringify(e),replay=engine.createDemo('deduction-replay-'+checked,'visitor','replay',JSON.parse(serialized));replay.evidenceIds=[...e.evidenceIds];const replayView=engine.snapshot(replay,engine.actorFor(replay,'visitor',null),0).state;assert.deepEqual(replayView.suspects.map(s=>s.accessProfile),view.suspects.map(s=>s.accessProfile));assert.deepEqual(replayView.evidence,view.evidence);assert.equal(replay.secret.killerId,e.secret.killerId);checked++;
 }
 assert.equal(checked,264);
});
test('explicit record dialogue stays anonymous and cannot reuse old named-clue answers',()=>{
 const f=fixture();f.event.evidenceIds=['watch','logs','flask','camera','note'];
 for(let slot=0;slot<6;slot++)for(const id of ['logs','camera','note']){
  const p=ask(f,slot,'What does the '+id+' record show?');assert.equal(p.responseCandidates.length,3);for(const text of p.responseCandidates)for(const suspect of f.event.suspects)assert.ok(!text.includes(suspect.prompt.characterName));
  const named=p.answer+' The badge belongs to '+f.event.secret.killerName+'.';f.event.dialogueArchive.push({suspectId:p.s.id,question:p.input,permittedAnswer:named,text:named,engine:'local',timestamp:1,cache:{version:2,context:'old',scope:'old',evidence:[id]}});assert.equal(engine.reusableDialogue(f.event,p),null);
 }
});
