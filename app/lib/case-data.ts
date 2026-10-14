import type { CaseAccessProfile, CharacterPrompt, Phase } from './contracts';
/** Six unique credentials; every individual attribute is shared by half the cast.
 * Their stable per-case ordering is public information, never the culprit choice. */
export function getCaseAccessProfile(seed:string,slot:number):CaseAccessProfile {
 const patterns=[0b000,0b001,0b010,0b101,0b110,0b111];
 let state=2166136261;
 for(const character of seed)state=Math.imul(state^character.charCodeAt(0),16777619)>>>0;
 for(let i=patterns.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[patterns[i],patterns[j]]=[patterns[j],patterns[i]];}
 const pattern=patterns[((slot%patterns.length)+patterns.length)%patterns.length];
 return {clearance:pattern&4?'South wing':'North wing',badgeMark:pattern&2?'double stripe':'single stripe',docketGroup:pattern&1?'brass tab':'blue tab'};
}
export const CASE_TITLE = 'The last experiment';
export const CRIME_CONTEXT = 'Dr. Arjun Sen collapsed at 21:17 in the Aster Research Lab at KIIT. The alarm sounded at 21:19. An altered trial compound, a missing access log, and six people with something to hide. One timeline. One killer.';
export const PHASES: { id: Phase; title: string; duration: string; cue: string }[] = [
 {id:1,title:'Crime setup',duration:'8 MIN',cue:'Introduce Dr. Sen and the lab. Separate what everyone knows from what each character knows. Assign five or six suspect writers.'},
 {id:2,title:'Suspect prompting',duration:'6 MIN',cue:'Start the six-minute deadline. Build a persona, a public alibi, an innocent secret and a specific clue trigger. Keep secrets out of public context.'},
 {id:3,title:'Live investigation',duration:'20 MIN',cue:'Explore the lab and question suspects. Point out that evidence flags live in the database: a context window is not durable memory.'},
 {id:4,title:'Stress test',duration:'10 MIN',cue:'Try an instruction override, demand a false confession, or invent a clue. Discuss why model instructions need application-side validation.'},
 {id:5,title:'Accusation & reveal',duration:'8 MIN',cue:'Open the ballot. Every participant gets one vote. Close voting, hear the theories, then reveal the sealed timeline.'},
 {id:6,title:'Debrief',duration:'6 MIN',cue:'Connect the case to prompt engineering, context separation, persistent state, structured output, and guardrail tests. Publish the replay and celebrate contributors.'}
];
export const CHARACTER_TEMPLATES: (CharacterPrompt & {color:string;x:number;y:number})[] = [
 {characterName:'Mira Rao',occupation:'Research fellow',relationship:'Dr. Sen’s protégé',publicAlibi:'I was cataloguing samples in the main lab from 21:05 to 21:25.',privateSecret:'I concealed a failed trial to protect my scholarship.',clueTriggers:'Ask about the watch or the time of the alarm.',color:'#f6ba73',x:3,y:6},
 {characterName:'Dev Mehta',occupation:'Systems engineer',relationship:'Maintained the victim’s security system',publicAlibi:'I was in the server room checking the nightly backup.',privateSecret:'I disabled one camera to hide a side project.',clueTriggers:'Ask about access logs, cameras, or deleted records.',color:'#8d9fea',x:19,y:7},
 {characterName:'Isha Das',occupation:'Lab technician',relationship:'Prepared the victim’s compounds',publicAlibi:'I was restocking clean glassware in the preparation room.',privateSecret:'I borrowed a restricted reagent for an independent experiment.',clueTriggers:'Ask about the flask, reagent, or residue.',color:'#db8abe',x:10,y:17},
 {characterName:'Kabir Sethi',occupation:'Grant coordinator',relationship:'Managed Dr. Sen’s research funding',publicAlibi:'I was reviewing budget reports in the admin office.',privateSecret:'I inflated travel expenses and feared an audit.',clueTriggers:'Ask about the office note, grant, or audit.',color:'#a1c979',x:26,y:17},
 {characterName:'Tara Bose',occupation:'Visiting researcher',relationship:'Former collaborator',publicAlibi:'I was in the lounge calling my supervisor.',privateSecret:'I planned to publish a competing result.',clueTriggers:'Ask about the corridor, footsteps, or camera.',color:'#76ccd0',x:28,y:7},
 {characterName:'Neil Kapoor',occupation:'Doctoral candidate',relationship:'Helped analyze the victim’s trial data',publicAlibi:'I was printing data sheets beside the lounge.',privateSecret:'I copied preliminary results without permission.',clueTriggers:'Ask about the note, data, or the clock.',color:'#d8bc83',x:13,y:6}
];
export const EVIDENCE_LOCATIONS = [
 {id:'watch',title:'Broken smartwatch',room:'Crime scene',x:8,y:6},
 {id:'flask',title:'Laboratory flask',room:'Main lab',x:14,y:3},
 {id:'logs',title:'Access logs',room:'Server room',x:25,y:5},
 {id:'camera',title:'Camera fragment',room:'Corridor',x:30,y:10},
 {id:'note',title:'Folded note',room:'Admin office',x:21,y:15}
];
export const DEBRIEF = [
 {title:'Prompt engineering',text:'A character needs a role, boundaries and a trigger—not just a personality. Compare the submitted prompt with the final approved character.'},
 {title:'Context engineering',text:'Public facts, one character’s private context and the sealed answer are separate. The dialogue model never receives the killer or the complete secret timeline.'},
 {title:'State & memory',text:'The database remembers discoveries, deadlines, turns and votes. Model context may disappear; durable game state does not.'},
 {title:'Structured output',text:'Dialogue is accepted only as validated text. Evidence IDs and discoveries are owned by the application, so invented model output cannot create clues.'},
 {title:'Guardrails & testing',text:'The test log records boundary attacks and refusals. Server authorization, output checks and human review all contribute to the result.'}
];
