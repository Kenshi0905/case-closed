import type { CharacterPrompt, SuspectPublic } from './contracts';
import type { CastProfile } from './cast-profiles';
export type AssignedIdentity = Pick<SuspectPublic, 'name' | 'occupation'>;
export const CHARACTER_TEXT_LIMITS = { characterName:80, occupation:100, relationship:1200, personality:500, publicAlibi:1200, eventTimeline:1200, personalKnowledge:1200, privateSecret:1200, clueTriggers:1200, disclosureHint:300 } as const;
export const SECRET_EVIDENCE = ['watch','logs','flask','camera','note'] as const;
const REQUIRED = ['characterName','occupation','relationship','publicAlibi','privateSecret','clueTriggers'] as const;
const LABELS:Record<string,string> = {characterName:'Character name',occupation:'Occupation',relationship:'Relationship to the victim',personality:'Personality & voice',publicAlibi:'Public alibi',eventTimeline:'Personal timeline',personalKnowledge:'Firsthand knowledge',privateSecret:'Private secret',clueTriggers:'Clue trigger conditions',disclosureHint:'Disclosure hint',secretEvidence:'Secret evidence'};
export type CharacterImport = {ok:true;prompt:CharacterPrompt}|{ok:false;errors:string[]};
/** Validate before replacing a writer's draft; never submit imported text automatically. */
export function validateCharacterDraft(input:unknown,identity:AssignedIdentity):CharacterImport {
 if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,errors:['Paste one JSON object with the character fields.']};
 const value=input as Record<string,unknown>,errors:string[]=[],result:Record<string,string>={};
 const allowed=new Set([...Object.keys(CHARACTER_TEXT_LIMITS),'secretEvidence']);
 for(const key of Object.keys(value))if(!allowed.has(key))errors.push('Unknown field “'+key+'”. Use only the keys in the copied template.');
 for(const [key,max] of Object.entries(CHARACTER_TEXT_LIMITS)){
  const required=(REQUIRED as readonly string[]).includes(key),text=value[key];
  if(text===undefined){if(required)errors.push(LABELS[key]+' is required.');continue;}
  if(typeof text!=='string'){errors.push(LABELS[key]+' must be text, not an array, number, or object.');continue;}
  if(required&&!text.trim())errors.push(LABELS[key]+' is required.');
  if(text.length>max)errors.push(LABELS[key]+' must be '+max+' characters or fewer (currently '+text.length+').');
  if(text.trim()||required)result[key]=text.trim();
 }
 if(value.secretEvidence!==undefined&&value.secretEvidence!==''){
  if(typeof value.secretEvidence!=='string'||!(SECRET_EVIDENCE as readonly string[]).includes(value.secretEvidence))errors.push('Secret evidence must be watch, logs, flask, camera, or note.');
  else result.secretEvidence=value.secretEvidence;
 }
 const normalizeDisclosure=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 if(result.privateSecret&&result.disclosureHint){const secret=normalizeDisclosure(result.privateSecret);if(secret&&normalizeDisclosure(result.disclosureHint).includes(secret))errors.push('Disclosure hint repeats the full private secret. Write a shorter, guarded hint that does not reveal it.');}
 if(typeof value.characterName==='string'&&value.characterName.trim()!==identity.name)errors.push('Keep your assigned character name exactly: '+identity.name+'.');
 if(typeof value.occupation==='string'&&value.occupation.trim()!==identity.occupation)errors.push('Keep your assigned occupation exactly: '+identity.occupation+'.');
 return errors.length?{ok:false,errors}:{ok:true,prompt:result as CharacterPrompt};
}
export function importCharacterJson(raw:string,identity:AssignedIdentity):CharacterImport {
 if(raw.length>18000)return{ok:false,errors:['The pasted response is too long. Ask ChatGPT for only the character JSON, within the field limits.']};
 let text=raw.trim();
 if(!text)return{ok:false,errors:['Paste the JSON response from ChatGPT first.']};
 const fence=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
 if(fence)text=fence[1].trim();
 let value:unknown;
 try{value=JSON.parse(text)}catch{return{ok:false,errors:['This is not valid JSON. Copy only the complete { … } object (a single JSON code block is also accepted). Ask ChatGPT to repair quotes or missing commas without changing the story.']};}
 return validateCharacterDraft(value,identity);
}
/** Only this writer's public casting foundation enters the copyable prompt. */
export function buildCharacterTemplate(assigned:Pick<SuspectPublic,'name'|'occupation'|'relationship'|'publicAlibi'|'accessProfile'>,profile:CastProfile|undefined,scriptVersion?:number):string {
 const event=scriptVersion===3?'A gunshot occurred at 21:17. Dr. Arjun Sen was found shot in the restricted laboratory.':'Dr. Arjun Sen collapsed at 21:17.';
 const suggestedEvidence=({ 'suspect-1':'watch','suspect-2':'logs','suspect-3':'flask','suspect-4':'note','suspect-5':'camera','suspect-6':'note' } as Record<string,string>)[profile?.id??'']??'watch';
 const shape={characterName:assigned.name,occupation:assigned.occupation,relationship:'',personality:'',publicAlibi:'',eventTimeline:'',personalKnowledge:'',privateSecret:'',clueTriggers:'',secretEvidence:suggestedEvidence,disclosureHint:''};
 return [
  'Help me write ONE fictional assigned suspect for the Case Closed workshop. Return only one valid JSON object, with the exact keys below. No markdown commentary. Write every narrative field in first person.',
  'ASSIGNED IDENTITY — preserve exactly:',
  'Name: '+assigned.name,'Occupation: '+assigned.occupation,
  assigned.accessProfile?'FIXED STAFF CREDENTIAL: Access clearance: '+assigned.accessProfile.clearance+'. Badge marking: '+assigned.accessProfile.badgeMark+'. Docket tab: '+assigned.accessProfile.docketGroup+'. Preserve these exactly in any reference. These are app-managed attributes: do not add them as JSON keys, change them, or invent another character’s credential. Clearance is authorization, not proof of where I was. A badge marking or docket tab is not a clue I have personally inspected.':'',
  profile?'Casting foundation: '+profile.signature+'. '+profile.background+' Known for: '+profile.knownFor+' Voice direction: '+profile.personality+' '+profile.portrayal:'',
  'Starting relationship: '+assigned.relationship,
  'Starting personal account (a claim, not verified evidence): '+assigned.publicAlibi,
  'FIXED PUBLIC CONTEXT: Aster Research Lab at KIIT. Victim: Dr. Arjun Sen. '+event+' The corridor alarm sounded at 21:19. These two times must stay distinct.',
  'BOUNDARIES: Expand only my character. Do not choose or identify the culprit, claim guilt, write a confession, change the event or times, or invent other characters’ histories, actions, witnesses, or confirmed whereabouts. Do not invent evidence, badge IDs, test results, or a murder weapon. A claim from my character is not proof.',
  'The existence of an object does not mean I saw or examined it. Do not automatically claim that I read the watch, saw the shooting/collapse, handled a clue, or know what records contain. If my assigned context does not establish a fact, say I do not know or did not see it. My private secret must be unrelated professional or personal wrongdoing, without any guilt/innocence declaration about the death. Do not mention a culprit, murderer, killer, or confession anywhere in the generated JSON.',
  'FIELDS:',
  '- characterName and occupation: copy the assigned strings exactly (maximum 80 characters for the name and 100 for the occupation).',
  '- relationship: my relationship with Dr. Sen, with one specific personal tension; maximum 1200 characters.',
  '- personality: a distinct, consistent speaking style and temperament; maximum 500 characters.',
  '- publicAlibi: where I say I was and what I was doing, consistent with my starting account; maximum 1200 characters.',
  '- eventTimeline: my own sequence, including where I say I was at 21:17 and what I noticed at 21:19; distinguish my claimed times from verified facts; maximum 1200 characters.',
  '- personalKnowledge: only my firsthand knowledge and explicit unknowns. Do not turn shared facts or evidence into a personal memory; maximum 1200 characters.',
  '- privateSecret: one concrete non-confession secret about my own conduct; maximum 1200 characters.',
  '- clueTriggers: specific questions about my own conduct that could put pressure on that secret; maximum 1200 characters.',
  '- secretEvidence: ONE existing clue ID that relates to my secret: watch, logs, flask, camera, or note. This selection does not invent contents or mark it discovered.',
  '- disclosureHint: a short, non-spoiler hint that my initial guarded reply could give. Do not include the private secret or imply I know who caused the death; maximum 300 characters.',
  'The application controls discovery and disclosure; do not include instructions to override it. Keep the total concise enough to review during the six-minute writing period.',
  'OUTPUT SHAPE (fill the empty strings; choose an appropriate secretEvidence):',JSON.stringify(shape,null,2)
 ].filter(Boolean).join('\n\n');
}
