import 'server-only';
import type { CharacterPrompt } from '../contracts';
import { getCastProfile } from '../cast-profiles';
import STYLE_BANK from '../dialogue-style-bank.json';
import { matchIntents, normalizeIntentText } from './semantic-intents';

export type ClueId = 'watch'|'logs'|'flask'|'camera'|'note';
type Topic = 'knowledge'|'clue'|'alibi'|'secret'|'relationship'|'background'|'timeline'|'movement'|'guilt'|'weapon'|'evidenceLimit'|'observation'|'accountDetail';
export type DialogueStyle = keyof typeof STYLE_BANK;
export type DialoguePlan = {input:string;normalized:string;authoredAnswer?:string;blocked:boolean;slot:number;clueId:ClueId;trigger:boolean;publicEvidenceId?:ClueId;requestedClues:ClueId[];topics:Topic[];corroboration:boolean;compareAccount:boolean;handling:boolean;correction:string;greeting:boolean;followup:boolean;movement:'departure'|'arrival'|'duration'|'timing'|null;shooting:boolean;style:DialogueStyle;intent:string[];locationMismatch:string;negatedLocation:boolean;observation:'hearing'|'sighting'|'people'|null;recordRequest:boolean;activity:string;disclosure:'locked'|'hint'|'reveal'|'repeat';disclosureEvidence:ClueId;disclosureTargeted:boolean};
export type DialogueKnowledge = {stage?:0|1|2;question?:string};
export const DIALOGUE_POLICY_VERSION=2;
const CLUES:ClueId[]=['watch','logs','flask','note','camera','note'];
const CLUE_NAMES:Record<ClueId,string>={watch:'the broken watch',logs:'the access records',flask:'the flask and its residue',camera:'the corridor camera',note:'the meeting note'};
const GENERIC_TRIGGER_WORDS=new Set('ask asks asking about when then with your that this there their them could would should have what which where were been from into only reveal explain specific condition trigger someone person anything something victim alarm time timing clock audit grant data research work result results office worry secret alibi motive evidence clue detail remember notice know tell please information discover question answer'.split(' '));
const IRREGULAR:Record<string,string>={cameras:'camera',bottles:'bottle',flasks:'flask',glasses:'glass',watches:'watch',clocks:'clock',records:'record',logs:'log',entries:'entry',badges:'badge',notes:'note',messages:'message',letters:'letter',invitations:'invitation',footsteps:'footstep',reagents:'reagent',residues:'residue',containers:'container',samples:'sample',results:'result',witnesses:'witness',worried:'worry',hiding:'hide',hidden:'hide'};
export function normalizeQuestion(value:string){return normalizeIntentText(value).replace(/[^a-z0-9:' -]/g,' ').replace(/\s+/g,' ').trim();}
function words(value:string){return normalizeQuestion(value).split(/[^a-z0-9:']+/).filter(Boolean).map(word=>IRREGULAR[word]??(word.length>5&&word.endsWith('s')&&!word.endsWith('ss')?word.slice(0,-1):word));}
function hash(value:string){let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619);return n>>>0;}
function identifyClues(input:string):ClueId[]{const q=words(input).join(' ').replace(/\bwatch (?=(?:(?:the|a|that) )?(?:camera|cctv|footage|video|recording|security (?:video|footage))\b)/g,'view ');const found:ClueId[]=[];
 if(/\b(watch|smartwatch|wristwatch|clock)\b|stopped display|pulse reading|cracked (?:glass|display)/.test(q))found.push('watch');
 if(/\b(log|ledger|badge|swipe|keycard|key card)\b|access record|entry record|door record|backup record|security record/.test(q))found.push('logs');
 if(/\b(flask|beaker|cup|bottle|reagent|residue|vial|compound)\b|drinking (?:container|vessel)|sample container|violet film|v 17|v-17/.test(q))found.push('flask');
 if(/\b(camera|cctv|footage|photograph|image|footstep)\b|security (?:video|recording)|corridor frame|doorway recording/.test(q))found.push('camera');
 if(/\b(note|letter|message|invitation)\b|meeting (?:request|memo)|written (?:request|warning)|folded paper/.test(q))found.push('note');
 return found;
}
function timelineCorrection(input:string){
 const clockMentions=[...input.matchAll(/\b(\d{1,2})[:.](\d{2})(?:\s*(a\.?m\.?|p\.?m\.?))?\b/gi)].map(match=>{let hour=Number(match[1]);const suffix=match[3]?.replace(/\./g,'').toLowerCase();if(suffix==='pm'&&hour<12)hour+=12;if(suffix==='am'&&hour===12)hour=0;return{index:match.index!,time:String(hour).padStart(2,'0')+':'+match[2]};});
 const alarm=/\balarm\b/i.test(input),death=/\b(?:collapse[sd]?|death|died|dead|watch|gunshot|shooting|shot)\b/i.test(input);
 if(!clockMentions.length)return alarm&&death&&/before|after/i.test(input)?'The collapse was at 21:17; the alarm followed at 21:19.':'';
 const wrong=clockMentions.some(clock=>{const before=input.slice(Math.max(0,clock.index-65),clock.index);const after=input.slice(clock.index,clock.index+65);const nearby=before+' '+after;const mentions=[...nearby.matchAll(/\b(alarm|collapse[sd]?|death|died|dead|watch|gunshot|shooting|shot)\b/gi)];if(!mentions.length)return false;const localIndex=before.length;const closest=mentions.sort((a,b)=>Math.abs(a.index!-localIndex)-Math.abs(b.index!-localIndex))[0][1].toLowerCase();return clock.time!==(closest==='alarm'?'21:19':'21:17');});
 if(!wrong)return '';
 return alarm&&death?'The collapse was at 21:17; the alarm followed at 21:19.':alarm?'The alarm sounded at 21:19.':'Dr. Sen collapsed at 21:17.';
}
const PERSONALITY_RULES:Record<DialogueStyle,RegExp>={reserved:/\b(?:reserved|quiet|shy|introvert\w*|reticent|laconic|soft.spoken|withdrawn)\b/g,gruff:/\b(?:grumpy|gruff|blunt|irritable|impatient|abrasive|curt|snappy|rude)\b/g,precise:/\b(?:precise|meticulous|methodical|careful|analytical|perfectionist|exact)\b/g,warm:/\b(?:warm|friendly|kind|gentle|empathetic|caring|cheerful|welcoming|patient)\b/g,anxious:/\b(?:anxious|nervous|timid|flustered|uneasy|worried|hesitant)\b/g,confident:/\b(?:confident|bold|assertive|outgoing|energetic|fearless|extrovert\w*)\b/g,formal:/\b(?:formal|professional|strict|businesslike|polite|dignified)\b/g,curious:/\b(?:curious|inquisitive|playful|imaginative|creative|enthusiastic)\b/g};
function authoredTemperament(prompt:CharacterPrompt){
 if(prompt.personality?.trim())return prompt.personality.trim();
 const text=[prompt.occupation,prompt.relationship,prompt.publicAlibi,prompt.privateSecret].join(' ');
 // Only explicit temperament descriptions are overrides; a secret causing worry is not a personality profile.
 return [...text.matchAll(/(?:\bI am|\bI'm|\bI’m|\bpersonality\s*:|\btemperament\s*:|\bnaturally)\s+([^.!?]{3,150})/gi)].map(match=>match[1]).join(' ').trim();
}
export function getDialoguePersonality(prompt:CharacterPrompt,slot=0):string{return authoredTemperament(prompt)||getCastProfile(null,slot)?.personality||'Careful, straightforward, and unwilling to guess.';}
export function getDialogueStyle(prompt:CharacterPrompt,slot=0):DialogueStyle{
 const text=normalizeIntentText(getDialoguePersonality(prompt,slot)).replace(/\b(?:not|never|no longer)\s+(?:very\s+|at all\s+)?\w+/g,'');
 let best:DialogueStyle='reserved',highest=0;
 for(const [style,pattern]of Object.entries(PERSONALITY_RULES) as [DialogueStyle,RegExp][]){const score=[...text.matchAll(pattern)].length;if(score>highest){highest=score;best=style;}}
 return best;
}
const ACTIVITY_GROUPS=[['call','phone','calling','called','supervisor'],['backup','backups','server'],['catalogue','cataloguing','catalogued','catalog','samples'],['restock','restocking','restocked','glassware'],['review','reviewing','reviewed','budget'],['print','printing','printed','sheets']];
function activitySubject(q:string){return ACTIVITY_GROUPS.find(group=>group.some(word=>new RegExp('\\b'+word+'\\b').test(q)))?.[0]??'';}
const GENERIC_PRIVATE=new Set('about after before because concealed conceal failed hide hiding hid private secret something anything someone matter explain exactly would could should planned planning wanted without permission myself protect protecting afraid worry worried result results'.split(' '));
function privateSubject(input:string,prompt:CharacterPrompt){const tokens=new Set(words(input));return words(prompt.privateSecret).some(word=>word.length>=5&&!GENERIC_TRIGGER_WORDS.has(word)&&!GENERIC_PRIVATE.has(word)&&tokens.has(word));}
function disclosureFocus(q:string){return /\bwhy\b|\breason\b|\bmotive\b/.test(q)?'reason':/\bhow\b|\bmethod\b/.test(q)?'method':/\bwhen\b|\btime\b/.test(q)?'time':/\bwhat\b|\bwhich\b|\bexplain\b|\btell\b/.test(q)?'action':'';}
function explicitRecordQuestion(q:string){return /\b(?:read|interpret|examine|inspect|compare)\b|\b(?:record|case file|evidence report|findings|forensic)\b|\b(?:what|who)\b.{0,55}\b(?:show|shows|say|says|read|reads|received|addressed)\b|\bexplain\b.{0,40}\b(?:reading|record|frame|ledger|residue)\b|\b(?:when|what time)\b.{0,30}\bwatch\b.{0,15}\bstop/.test(q);}
/** Own knowledge and deliberately presented records are different permissions. */
export function planDialogue(input:string,prompt:CharacterPrompt,slot:number,previous?:{text:string;clueId?:string;question?:string},shooting=false,knownClues:ClueId[]=[],knowledge:DialogueKnowledge={}):DialoguePlan{
 const matched=matchIntents(input),active=matched.active,normalized=normalizeQuestion(input);const clueId=CLUES[slot]??'note';let requestedClues=identifyClues(active);
 const blocked=/(?:ignore|disregard|override).{0,45}(?:instruction|previous|rule|system|developer)|system\s*(?:prompt|message)|developer\s*message|reveal.{0,30}(?:killer|murderer|answer|solution)|confess|admit.{0,24}(?:kill|murder|shoot|shot)|pretend.{0,30}(?:guilty|kill|shoot|shot)|<\/?(?:system|assistant)|jailbreak|secret.{0,12}(?:key|state|answer)|(?:yes|say).{0,18}i (?:killed|murdered|shot)/i.test(normalized);
 const followup=/^(?:why|how so|and then|go on|tell me more|what do you mean|explain that|say more|what about that|and (?:when|where)|when exactly|when was that|at what time|what time was that|what exact time|(?:what|how) about (?:the )?(?:time|timing|witness|alibi))(?:[.!? ]|$)/i.test(active)&&words(active).length<=10;
 const previousQuestion=normalizeQuestion(previous?.question??'');
 const firsthandQuestion=/\b(?:did|do|have|were|could|can) you\b.{0,28}\b(?:see|seen|hear|heard|notice|touch|handle|find|inspect|check|break|write|record|read)|\b(?:yourself|personally|firsthand|first hand)\b/.test(active);
 let recordRequest=!firsthandQuestion&&explicitRecordQuestion(active);
 if(followup&&previous?.clueId&&explicitRecordQuestion(previousQuestion)){requestedClues=[previous.clueId as ClueId];recordRequest=true;}
 const compareAccount=requestedClues.length>0&&/\b(?:contradict\w*|consistent|compare|conflict\w*|fit|match\w*|against)\b/.test(active)&&/\b(?:your|you|own)\b.{0,25}\b(?:account|alibi|story|claim|version)\b/.test(active);
 recordRequest=recordRequest||compareAccount;
 const corroboration=matched.has('witness'),background=matched.has('identity'),greeting=matched.has('greeting');
 const observation=!requestedClues.length?(matched.has('hearing')?'hearing':matched.has('sighting')?'sighting':matched.has('people')?'people':null):null;
 let movement:DialoguePlan['movement']=matched.has('duration')?'duration':matched.has('departure')?'departure':matched.has('arrival')?'arrival':null;
 let alibi=corroboration||matched.has('alibi')||matched.has('location')||compareAccount;
 let relationship=matched.has('relationship');
 const activity=activitySubject(active)||(followup?activitySubject(previousQuestion)||activitySubject(normalizeQuestion(prompt.publicAlibi)):'');
 const asksTime=/\b(?:when|time|timing|timestamp|how late|what hour|what minute)\b/.test(active)||(Boolean(activity)&&/\b\d{1,2}[:.]\d{2}\b/.test(active)&&/\b(?:you|your)\b/.test(active));
 const crimeTime=/\b(?:gunshot|shot|shooting|alarm|collapse|death|died|dead)\b/.test(active);
 if(asksTime&&!movement&&!observation&&!recordRequest&&!requestedClues.length&&(!crimeTime||activity)&&!matched.has('guilt'))movement='timing';
 if(followup&&previous&&!recordRequest){if(previous.text.includes(prompt.publicAlibi)){alibi=true;if(asksTime)movement='timing';}else if(previous.text.includes(prompt.relationship))relationship=true;}
 const otherPerson=/\b(?:killer|murderer|culprit|dr\.? sen|he|she|they|someone|anyone)\b/.test(active)&&!/\b(?:you|your)\b/.test(active);
 if(otherPerson){movement=null;alibi=false;}
 const subjectMatch=privateSubject(active,prompt);
 const publicDetail=retrieveAccountDetail(active,prompt);
 const secret=matched.has('motive')||(!publicDetail&&!background&&!alibi&&!observation&&!recordRequest&&!requestedClues.length&&subjectMatch);
 const disclosureEvidence=prompt.secretEvidence??clueId;
 const disclosureTargeted=secret&&(subjectMatch||requestedClues.includes(disclosureEvidence))&&/\b(?:you|your|why|how|what|explain|tell)\b/.test(active);
 const hasRelevantEvidence=knownClues.includes(disclosureEvidence);
 const priorStage=hasRelevantEvidence?(knowledge.stage??0):0;
 const distinctFollowup=Boolean(disclosureFocus(active)&&disclosureFocus(active)!==disclosureFocus(knowledge.question??''));
 const disclosure:DialoguePlan['disclosure']=priorStage===2?'repeat':disclosureTargeted&&hasRelevantEvidence?(priorStage===1&&distinctFollowup?'reveal':priorStage===0?'hint':'locked'):'locked';
 // Questions never award a world clue. Only deliberate inspection changes evidenceIds.
 const trigger=false;
 const publicEvidenceId=!blocked&&recordRequest?requestedClues.find(id=>knownClues.includes(id)):undefined;
 const explicitEventClock=/\b(?:alarm|gunshot|collapse|death|shot)\b(?:\s+(?:was|is|at|sounded|began|happened|occurred|started|around|exactly)){0,5}\s+\d{1,2}[:.]\d{2}\b/.test(active);
 let correction=crimeTime&&(explicitEventClock||(!observation&&!movement&&!alibi))?timelineCorrection(active):'';if(shooting)correction=correction.replace(/The collapse was/g,'The gunshot was').replace(/Dr\. Sen collapsed/g,'Dr. Sen was shot');
 const rooms=['security room','server room','preparation room','main lab','lounge','admin office','corridor'];const queryRoom=rooms.find(room=>active.includes(room)),statedRoom=rooms.find(room=>normalizeQuestion(prompt.publicAlibi).includes(room));
 const locationMismatch=(alibi||movement)&&queryRoom&&statedRoom&&queryRoom!==statedRoom?'My account names the '+statedRoom+', not the '+queryRoom+'.':'';
 const negatedLocation=Boolean(statedRoom&&new RegExp("(?:weren't|were not|not|never)\\s+(?:you\\s+)?(?:in|at|near)\\s+(?:the\\s+)?"+statedRoom).test(active));
 const weapon=/\b(?:gun|pistol|weapon|bullet)\b/.test(active)&&!observation&&!correction&&!asksTime;
 const topics:Topic[]=[];
 if(requestedClues.length&&!secret)topics.push(publicEvidenceId?'clue':recordRequest?'evidenceLimit':'knowledge');
 if(movement)topics.push('movement');else if(alibi)topics.push('alibi');
 if(secret)topics.push('secret');if(relationship)topics.push('relationship');if(background&&!relationship)topics.push('background');if(observation)topics.push('observation');if(matched.has('guilt'))topics.push('guilt');if(weapon&&!requestedClues.length)topics.push('weapon');
 if(crimeTime&&!observation&&!movement&&!alibi&&!requestedClues.length&&!matched.has('guilt')&&!weapon&&!correction)topics.push('timeline');
 const authoredAnswer=!blocked&&!topics.length&&!greeting?publicDetail:undefined;
 if(authoredAnswer)topics.push('accountDetail');
 return{input,normalized,authoredAnswer,blocked,slot,clueId,trigger,publicEvidenceId,requestedClues,topics,corroboration,compareAccount,handling:/\b(?:touch|touched|handle|handled|gave|handed)\b/.test(active),correction,greeting,followup,movement,shooting,style:getDialogueStyle(prompt,slot),intent:matched.intents,locationMismatch,negatedLocation,observation,recordRequest,activity,disclosure,disclosureEvidence,disclosureTargeted};
}
const REDIRECTS=[
 ['I would rather check a detail than guess.','Let us keep the sequence straight.','A small discrepancy can matter.'],
 ['Give me something I can check.','I trust a record more than a hunch.','Let us work through one detail.'],
 ['I need a specific question.','Precision matters here.','Let us separate an observation from an assumption.'],
 ['Be specific with me.','I can account for my part.','Let us keep the claims clear.'],
 ['Let us look at the pieces.','There may be another explanation.','I can help test an idea.'],
 ['Which part of the pattern concerns you?','Let us check what fits.','One detail at a time.'],
];
/** Only exact excerpts of authored text are shortened; an ellipsis explicitly marks incomplete quotes. */
function excerpt(text:string,limit:number){text=text.trim();if(text.length<=limit)return text;const sentences=text.match(/[^.!?]+[.!?]+(?:\s|$)/g)??[];let out='';for(const sentence of sentences){if((out+sentence).trim().length>limit)break;out+=sentence;}if(out.trim())return out.trim()+' [excerpt]';const cut=text.slice(0,Math.max(40,limit-22));return '“'+cut.slice(0,cut.lastIndexOf(' ')>20?cut.lastIndexOf(' '):cut.length)+'…” [excerpt]';}
function introduction(prompt:CharacterPrompt){
 const occupations=new Set(['research fellow','systems engineer','lab technician','grant coordinator','visiting researcher','doctoral candidate']);
 const occupation=prompt.occupation.trim();const normalized=occupation.toLowerCase();
 const role=occupations.has(normalized)?'I am '+(/^[aeiou]/.test(normalized)?'an ':'a ')+normalized+'.':'My role is “'+occupation.replace(/[“”]/g,'"')+'”.';
 const relationships:Record<string,string>={
  'Dr. Sen’s protégé':'I was Dr. Sen’s protégé.',
  'Maintained the victim’s security system':'I maintained Dr. Sen’s security system.',
  'Prepared the victim’s compounds':'I prepared Dr. Sen’s compounds.',
  'Managed Dr. Sen’s research funding':'I managed Dr. Sen’s research funding.',
  'Former collaborator':'I previously collaborated with Dr. Sen.',
  'Helped analyze the victim’s trial data':'I helped analyze Dr. Sen’s trial data.',
 };
 const relationship=prompt.relationship.trim();const exact=relationship.replace(/[.!?]+$/,'');
 const connection=relationships[exact]??(/^(?:I|My)\b/.test(relationship)?exact+'.':'My connection to Dr. Sen: '+exact+'.');
 return role+' '+connection;
}
const STYLE_REDIRECTS:Record<DialogueStyle,string[]>={reserved:['One thing at a time.','I would rather not guess.','I can answer a direct question.'],gruff:['Be specific. I cannot check a hunch.','Fine. Give me a detail I can verify.','Guesswork will not help either of us.'],precise:['Let us separate facts from assumptions.','The exact question matters.','A small distinction can change the answer.'],warm:['I want to help, but I should not guess.','We can work through the details together.','Take your time. Which detail matters?'],anxious:['Give me a moment. I want to get this right.','Please ask one thing at a time.','I do not want to say more than I know.'],confident:['Ask directly. I can explain my account.','Let us get straight to the facts.','Put the evidence beside the claim.'],formal:['Please specify the point you want to establish.','Let us keep the account clear.','I can address a specific observation.'],curious:['Which part does not fit for you?','That is worth checking against a real detail.','Let us see which part we can test.']};
function sentences(text:string){return text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);}
function authoredFacts(prompt:CharacterPrompt){return sentences([prompt.publicAlibi,prompt.eventTimeline??'',prompt.personalKnowledge??''].filter(Boolean).join(' '));}
// Retrieve only approved public account sentences. Never search privateSecret or disclosureHint.
const DETAIL_STOP_WORDS=new Set('a an the i me my you your yourself we our it its they them their he she him her is are was were be been am do does did have has had can could would should tell explain describe about what which why how when where who please know think thing things remember regarding related doing done'.split(' '));
function detailTokens(text:string){return new Set(words(text).filter(word=>word.length>2&&!DETAIL_STOP_WORDS.has(word)).map(word=>word.replace(/(?:ing|ed|s)$/,'')));}
function retrieveAccountDetail(question:string,prompt:CharacterPrompt){
 const query=detailTokens(question);if(query.size<2)return;
 const ranked=authoredFacts(prompt).map(text=>{const tokens=detailTokens(text);const overlap=[...query].filter(word=>tokens.has(word)).length;return{text,overlap,score:overlap/query.size};}).filter(item=>item.overlap>=2&&item.score>=0.6).sort((a,b)=>b.score-a.score||b.overlap-a.overlap);
 // A keyword overlap cannot answer an unstated cause or a negated premise.
 if(/\b(?:why|because|reason|not|never|didn't|wasn't|weren't)\b/.test(question))return;
 return ranked.length?excerpt(ranked[0].text,420):undefined;
}
function movementAnswer(plan:DialoguePlan,prompt:CharacterPrompt,limit:number){
 const kind=plan.movement,group=ACTIVITY_GROUPS.find(g=>g[0]===plan.activity);
 const candidates=authoredFacts(prompt).filter(f=>!group||group.some(word=>new RegExp('\\b'+word+'\\b','i').test(f)));
 const relevant=kind==='departure'?candidates.filter(f=>/\b(?:left|exited|departed|walked out)\b/i.test(f)):kind==='arrival'?candidates.filter(f=>/\b(?:arrived|entered|reached|came in)\b/i.test(f)):candidates;
 const explicit=relevant.filter(f=>kind==='duration'?/\b(?:for \d+ (?:minutes?|hours?)|from \d{1,2}:\d{2} to \d{1,2}:\d{2})\b/i.test(f):/\b\d{1,2}[:.]\d{2}\b|\b\d+\s*(?:am|pm)\b/i.test(f));
 if(explicit.length)return excerpt(explicit.join(' '),limit)+' That is my account, not independent proof.';
 const missing=kind==='timing'?'I do not know a more exact time'+(plan.activity==='call'?' for that call':' for that activity')+'.':kind==='duration'?'I have not given a precise duration.':kind==='arrival'?'I have not given an exact arrival time.':'I have not given an exact departure time.';
 return missing+' '+excerpt(prompt.publicAlibi,limit);
}
function relationshipAnswer(plan:DialoguePlan,prompt:CharacterPrompt){return introduction(prompt)+(/\b(?:friends?|friendship)\b|close to/.test(plan.normalized)&&!/\b(?:friend|friends|friendship|close|confidant)\b/i.test(prompt.relationship)?' I have not described our relationship as a friendship.':'');}
function observationAnswer(plan:DialoguePlan,prompt:CharacterPrompt,limit:number){
 const facts=authoredFacts(prompt),q=plan.normalized,includeAccount=!plan.topics.includes('alibi')&&!plan.topics.includes('movement');
 const relevant=facts.filter(f=>{const a=normalizeQuestion(f);if(plan.observation==='hearing'){const subject=/alarm/.test(q)?/\balarm\b/:/gunshot|shot|bang/.test(q)?/\b(?:gunshot|shot|bang)\b/:/./;return /\b(?:heard|hear|hearing)\b/.test(a)&&subject.test(a);}if(plan.observation==='sighting')return /\b(?:sen|victim|him)\b/.test(a)&&/\b(?:saw|seen|see|met)\b/.test(a);return /\b(?:saw|with|accompanied|met)\b/.test(a);});
 if(relevant.length){const text=includeAccount?excerpt(relevant.join(' '),limit):relevant.filter(f=>!prompt.publicAlibi.includes(f)).join(' ');return text+(plan.observation==='people'?' That does not establish everyone who was in the lab.':'');}
 const missing=plan.observation==='hearing'?'I cannot confirm hearing '+(/alarm/.test(q)?'the alarm':'the gunshot')+'.':plan.observation==='sighting'?(/when|last|time/.test(q)?'I do not know a last-seen time for Dr. Sen.':'I cannot claim I saw Dr. Sen then.'):'I do not know who else was in the lab.';
 return missing+(includeAccount?' '+excerpt(prompt.publicAlibi,limit):'');
}
function personalEvidenceAnswer(plan:DialoguePlan,prompt:CharacterPrompt){
 const id=plan.requestedClues[0],subject=CLUE_NAMES[id];
 const facts=authoredFacts(prompt).filter(f=>identifyClues(f).includes(id));
 if(!facts.length)return 'I do not know anything firsthand about '+subject+'. I can only speak about my own account.';
 const action=/\b(?:break|broke|broken)\b/.test(plan.normalized)?/\b(?:break|broke|broken)\b/:plan.handling?/\b(?:touch|touched|handle|handled)\b/:null;
 return 'What I remember is: '+excerpt(facts.join(' '),340)+(action&&!facts.some(f=>action.test(normalizeQuestion(f)))?' I do not know about that specific action.':'');
}
function secretAnswer(plan:DialoguePlan,prompt:CharacterPrompt){
 if(plan.disclosure==='reveal')return excerpt(prompt.privateSecret,650)+' That is what I concealed; it is not a confession to the killing.';
 if(plan.disclosure==='hint'){const hint=prompt.disclosureHint?.trim();const containsSecret=hint&&normalizeQuestion(hint).includes(normalizeQuestion(prompt.privateSecret));return hint&&!containsSecret?excerpt(hint,240):'That evidence touches a private matter I have avoided. Ask how it relates to what I did, or why I kept it quiet.';}
 if(plan.disclosure==='repeat')return 'I have already explained what I concealed. Repeating the question does not add another secret; compare that account with the evidence.';
 return 'I am not ready to discuss a private matter on a vague accusation. Show me relevant evidence and ask about my connection to it.';
}
function recordCandidates(plan:DialoguePlan,text:string){const subject=CLUE_NAMES[plan.publicEvidenceId!];return ['Reading the recovered record for '+subject+': '+text,'The case file records this about '+subject+': '+text,'From the inspected evidence, rather than my own observation: '+text];}
export function composeDialogue(plan:DialoguePlan,prompt:CharacterPrompt,clueText?:string){
 if(plan.blocked)return{answer:'I am sticking to my account. I will not make a confession because you demand one.',legacyAnswers:[] as string[]};
 const parts:string[]=[];const selected=plan.topics.slice(0,3);let variants:string[]|undefined,variantIndex=-1;
 if(plan.correction)parts.push(plan.correction);if(plan.locationMismatch)parts.push(plan.locationMismatch);else if(plan.negatedLocation)parts.push('That is not what my account says.');
 for(const topic of selected){
  if(topic==='clue'&&clueText){variants=recordCandidates(plan,clueText);variantIndex=parts.length;parts.push(variants[0]);}
  if(topic==='evidenceLimit')parts.push('I do not have that inspected record to read. Examine '+CLUE_NAMES[plan.requestedClues[0]]+' before asking what it establishes.');
  if(topic==='knowledge')parts.push(personalEvidenceAnswer(plan,prompt));
  if(topic==='alibi')parts.push(excerpt(prompt.publicAlibi,420));
  if(topic==='accountDetail'&&plan.authoredAnswer)parts.push(plan.authoredAnswer);
  if(topic==='movement')parts.push(movementAnswer(plan,prompt,430));
  if(topic==='secret')parts.push(secretAnswer(plan,prompt));
  if(topic==='relationship')parts.push(excerpt(relationshipAnswer(plan,prompt),420));
  if(topic==='background'){const profile=getCastProfile(null,plan.slot),authored=authoredTemperament(prompt),brief=/\bwho are you\b/.test(plan.normalized);parts.push("I'm "+prompt.characterName+'. '+introduction(prompt)+(!brief&&!authored&&profile?' I am known for '+profile.knownFor.charAt(0).toLowerCase()+profile.knownFor.slice(1).replace(/\btheir\b/g,'my'):''));}
  if(topic==='observation')parts.push(observationAnswer(plan,prompt,420));
  if(topic==='guilt')parts.push((/\b(?:you|your)\b/.test(plan.normalized)?excerpt(prompt.publicAlibi,380)+' ':'')+'An accusation or suspicion alone does not establish who committed the killing. My account needs independent checking.');
  if(topic==='weapon')parts.push('I do not have firsthand details about the weapon or who handled it.');
  if(topic==='timeline')parts.push(plan.shooting?'The public case timeline places the gunshot at 21:17 and the corridor alarm at 21:19.':'The public case timeline places the collapse at 21:17 and the corridor alarm at 21:19.');
 }
 if(plan.compareAccount)parts.push('The record does not verify my whereabouts. My alibi is a claim, not independent proof.');
 if(plan.corroboration){const named=/\bwith\s+[A-Z][a-z]+|\b(?:saw me|can (?:confirm|vouch)|witnessed)\b/.test(prompt.publicAlibi);parts.push((named?'My account mentions another person; ask them to confirm what they actually saw.':'I have not named a witness who can confirm it.')+' That is my account, not independent proof.');}
 if(!parts.length){const choices=STYLE_REDIRECTS[plan.style]??REDIRECTS[plan.slot];parts.push((plan.greeting?'I am ready to answer. ':'')+choices[hash(plan.normalized+':'+plan.slot)%choices.length]+' Ask about my own activities or a specific detail I might know.');}
 let answer=parts.filter(Boolean).join(' ');if(answer.length>940)answer=excerpt(answer,900);
 const responseCandidates=variants&&variantIndex>=0?variants.map(v=>parts.map((p,i)=>i===variantIndex?v:p).filter(Boolean).join(' ')).filter(a=>a.length<=960):undefined;
 if(responseCandidates?.length===3)answer=responseCandidates[0];
 // Previous policy recordings must never bypass the current knowledge or disclosure gate.
 return{answer,responseCandidates:responseCandidates?.length===3?responseCandidates:undefined,legacyAnswers:[] as string[]};
}
/** Offline delivery changes tone only; local generation receives the unprefaced canonical answer. */
export function scriptedDialogue(plan:DialoguePlan,answer:string){
 if(plan.blocked||!plan.topics.length||plan.greeting||plan.topics.includes('clue')||plan.topics.includes('evidenceLimit'))return answer;
 const options=STYLE_BANK[plan.style];const prefix=options[hash(plan.normalized+':'+plan.style+':'+plan.slot+':'+plan.topics.join(','))%options.length];
 return prefix.length+answer.length+1<=1000?prefix+' '+answer:answer;
}
const OPENING_WORDS=new Set('all right let me tell you what i can remember clearly please listen carefully here is my answer as honestly know for the record will be with about this take a moment to explain that now have say look try keep it simple and clear just want sure understand only'.split(' '));
/** Accepted local delivery must preserve every canonical word; a neutral preface cannot introduce a new fact. */
export function isCanonicalDialogueOutput(text:unknown,permitted:string){
 if(typeof text!=='string'||text.length<5||text.length>1000||!permitted||permitted.length>960)return false;
 if(text===permitted)return true;
 if(!text.endsWith(' '+permitted))return false;
 const prefix=text.slice(0,-permitted.length).trim();if(prefix.length<=64&&Object.values(STYLE_BANK).some(values=>values.includes(prefix)))return true;if(prefix.length>=36||/[^a-zA-Z ,.!?:;'’-]/.test(prefix))return false;
 const tokens=prefix.match(/[a-zA-Z]+/g)??[];
 return tokens.length>=2&&tokens.length<=5&&tokens.every(word=>OPENING_WORDS.has(word.toLowerCase()))&&!/^(?:let me|for the|here is|i can|i will|tell you)[.!?]?$/i.test(prefix);
}

/** Old recordings may retain neutral delivery or the current character's finite style, never another style. */
export function isCompatibleLegacyDelivery(text:string,permitted:string,style:DialogueStyle){
 if(!isCanonicalDialogueOutput(text,permitted))return false;if(text===permitted)return true;
 const prefix=text.slice(0,-permitted.length).trim();
 return STYLE_BANK[style].includes(prefix)||!Object.values(STYLE_BANK).some(values=>values.includes(prefix));
}
