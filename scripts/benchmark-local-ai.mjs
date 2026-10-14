#!/usr/bin/env node
import fs from 'node:fs/promises';
import {localCompletion} from './local-ai-relay.mjs';
const config={model:'case-closed-local',localUrl:'http://127.0.0.1:8081/v1/chat/completions'};
const cases=[
 ['Dev Mehta','Systems engineer','reserved','Introverted, terse and slightly grumpy; distinguishes records from guesses.','Who was your alibi?','I was checking the nightly backup in the server room. No independent witness has been established.'],
 ['Isha Das','Lab technician','precise','Careful, practical, concise; checks quantities before speaking.','What time did you leave?','I was restocking clean glassware. My account does not give an exact departure time.'],
 ['Tara Bose','Visiting researcher','confident','Outgoing, expressive, curious, confident.','Did you kill him?','I cannot identify the culprit from my own account. Compare the evidence.'],
 ['Kabir Sethi','Grant coordinator','formal','Formal, efficient and focused on documentation.','Why were you arguing with the doctor?','My concern was the delayed grant. That is a motive to question, not proof of guilt.'],
 ['Neil Kapoor','Doctoral candidate','anxious','Nervous, self-conscious and eager to explain his research.','Can someone back you up?','I said I was printing data sheets beside the lounge. No witness has independently confirmed that account.'],
 ['Mira Rao','Research fellow','warm','Warm and patient; dedicated to accurate sample records.','Where were you at 21:17?','I was cataloguing samples in the main lab from 21:05 to 21:25.'],
];
const results=[];
for(const [characterName,occupation,style,personality,question,permittedAnswer] of cases){
 const job={characterName,occupation,style,personality,question,permittedAnswer,intent:'context-benchmark',approvedCharacter:{characterName,occupation,personality,publicAlibi:permittedAnswer,relationship:'Dr. Sen supervised the lab work.',privateSecret:'I was worried about a delayed report.',clueTriggers:'Answer only what this character knows.'}};
 for(let pass=0;pass<2;pass++){
  try{const answer=await localCompletion(config,job);const row={character:characterName,pass:pass?'warm':'cold',ok:answer.text.endsWith(permittedAnswer),...answer.metrics};results.push(row);console.log(JSON.stringify(row));}
  catch{const row={character:characterName,pass:pass?'warm':'cold',ok:false};results.push(row);console.log(JSON.stringify(row));}
 }
}
const times=results.filter(x=>x.ok).map(x=>x.latencyMs).sort((a,b)=>a-b);
const summary={at:new Date().toISOString(),successful:times.length,total:results.length,medianMs:times[Math.floor(times.length/2)]??null,minMs:times[0]??null,maxMs:times.at(-1)??null,results};
await fs.writeFile(new URL('../.local-ai/context-benchmark.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({successful:summary.successful,total:summary.total,medianMs:summary.medianMs,minMs:summary.minMs,maxMs:summary.maxMs}));
if(times.length!==results.length)process.exitCode=1;
