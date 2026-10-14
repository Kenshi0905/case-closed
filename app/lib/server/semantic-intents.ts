import 'server-only';

export type SemanticIntent = 'alibi'|'witness'|'departure'|'arrival'|'duration'|'location'|'guilt'|'identity'|'relationship'|'motive'|'timeline'|'greeting'|'hearing'|'sighting'|'people';
const SPELLING:Record<string,string>={aliby:'alibi',alibie:'alibi',alibii:'alibi',albii:'alibi',alby:'alibi',allibi:'alibi',alibiw:'alibi',whre:'where',wher:'where',wherre:'where',wht:'what',wat:'what',wot:'what',wen:'when',whn:'when',whos:'who is',whats:'what is',whatsup:'hello',ur:'your',r:'are',u:'you',ya:'you',yr:'your',pls:'please',plz:'please',tym:'time',tiem:'time',tme:'time',exti:'exit',exitted:'exited',leav:'leave',lefft:'left',securty:'security',securiy:'security',serer:'server',sever:'server',rooom:'room',witnes:'witness',wittness:'witness',witnesss:'witness',coroborate:'corroborate',corrobrate:'corroborate',verfy:'verify',killr:'killer',kiler:'killer',killler:'killer',muderer:'murderer',murdere:'murderer',suspcious:'suspicious',suspicous:'suspicious',camra:'camera',camerra:'camera',flsk:'flask',reagant:'reagent',reagnt:'reagent',whatch:'watch',smartwach:'smartwatch',timstamp:'timestamp',timestmp:'timestamp',recrod:'record',recrods:'records',loggs:'logs',arriv:'arrive',arive:'arrive',arriive:'arrive',depat:'depart',depature:'departure',relatioship:'relationship',relashionship:'relationship',bacground:'background',bakground:'background',motve:'motive'};
export function normalizeIntentText(value:string){return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\b([a-z]+)\b/g,word=>SPELLING[word]??word).replace(/\bdidnt\b/g,"didn't").replace(/\bdont\b/g,"don't").replace(/\bcant\b/g,"can't").replace(/[^a-z0-9:'?.!,; -]/g,' ').replace(/\s+/g,' ').trim();}
/** Exclude explicitly declined subjects from evidence matching, while retaining the original for security checks. */
export function activeQuestion(value:string){return normalizeIntentText(value)
 .replace(/\b(?:do not|don't)\s+(?:tell me(?: about)?|discuss|mention|show me|ask me(?: about)?)\s+[^,;.!?]*?(?=\bbut\b|\binstead\b|[,;.!?]|$)/g,' ')
 .replace(/\b(?:not asking about|not interested in|forget about|never mind)\s+[^,;.!?]*?(?=\bbut\b|\binstead\b|[,;.!?]|$)/g,' ')
 .replace(/\bnot\s+(?:the\s+)?(?:watch|clock|camera|cctv|logs?|flask|note|alibi)\b(?:\s+but)?/g,' ')
 .replace(/\s+/g,' ').trim();}

type Rule={intent:SemanticIntent;pattern:RegExp;weight:number};
const RULES:Rule[]=[
 {intent:'witness',pattern:/\b(?:who|whose)\b.{0,35}\balibi\b|\balibi\b.{0,30}\b(?:who|witness|confirm|prove|verify)\b/,weight:6},
 {intent:'witness',pattern:/\b(?:witness|corroborat\w*|vouch\w*)\b|\bback\b.{0,15}\bup\b|(?:anyone|someone|who).{0,22}(?:saw you|see you|with you)|(?:confirm|verify|prove|proof).{0,28}(?:alibi|where|account|story|version)|were you alone|who (?:was|were) (?:there|with)/,weight:5},
 {intent:'alibi',pattern:/\balibi\b|\bwhereabouts\b|what were you doing|what did you do|why were you (?:still )?here|(?:account|accounting) for your (?:movement|time)/,weight:5},
 {intent:'location',pattern:/\bwhere\b.{0,24}\byou\b|\b(?:were you|you were|weren't you|you weren't) (?:at|in|near|inside|outside)\b|which (?:room|place).{0,22}\byou\b|your (?:location|whereabouts)/,weight:4},
 {intent:'departure',pattern:/\b(?:exit(?:ed)?|leav(?:e|ing)|left|depart(?:ed|ure)?|get out|walk(?:ed)? out|head(?:ed)? out|go away)\b/,weight:4},
 {intent:'departure',pattern:/\b(?:what|which) time\b|\bwhen\b|\bhow late\b|timestamp|exact (?:time|minute)/,weight:1},
 {intent:'arrival',pattern:/\b(?:arriv(?:e|ed|al)|enter(?:ed)?|get (?:here|there|in)|reach(?:ed)?|come (?:in|back)|came (?:in|back))\b/,weight:4},
 {intent:'duration',pattern:/how long|duration|how many (?:minute|hour)s|until when|since when/,weight:5},
 {intent:'guilt',pattern:/\b(?:killer|murderer|culprit|guilty|innocent|suspect|suspicious)\b|\bwho (?:really |actually |else )?(?:kill(?:ed)?|murder(?:ed)?|shot|shoot)\b|\byou (?:really |actually |accidentally |ever )?(?:kill(?:ed)?|murder(?:ed)?|shot|shoot)\b|did you do it|was it you|who did (?:it|this)|why should i (?:trust|believe) you|(?:are|were) you responsible for/,weight:5},
 {intent:'identity',pattern:/\b(?:background|occupation|profession|job|role|personality)\b|about yourself|who are you|what(?: is|'s) your name|tell me your name|what.{0,12}(?:known for|do here|do for)|describe yourself|tell me about you/,weight:5},
 {intent:'relationship',pattern:/\b(?:relationship|connection|connected)\b|how.{0,15}(?:know|knew)|(?:know|knew) (?:dr\.? )?sen|why (?:are|were) you (?:still )?here|why.{0,20}(?:working|meeting|meet)|\b(?:friends?|friendship)\b|(?:close to|get along with) (?:dr\.? )?sen/,weight:5},
 {intent:'motive',pattern:/\b(?:secret|hiding|hid|hide|afraid|fear|worried|worry|motive|pressure|scholarship|audit|grant|funding)\b|stand to lose|why.{0,20}(?:scared|upset|nervous)|protect.{0,16}(?:job|work|reputation)/,weight:5},
 {intent:'timeline',pattern:/\b(?:alarm|collapse[sd]?|death|died|dead|gunshot|shooting|shot)\b/,weight:3},
 {intent:'timeline',pattern:/what happened|sequence of events|order of events/,weight:5},
 {intent:'hearing',pattern:/\b(?:did|could|can|have|were) you\b.{0,18}\b(?:hear|heard|hearing)\b|\bwhat did you hear\b|\b(?:hear|heard) (?:the |a )?(?:gunshot|shot|alarm|bang)\b/,weight:5},
 {intent:'sighting',pattern:/\b(?:did|have|when did|had) you\b.{0,18}\b(?:see|seen|meet|met)\b.{0,24}\b(?:dr\.? sen|sen|victim|him)\b|\b(?:last|final) (?:sighting|meeting|encounter)\b/,weight:5},
 {intent:'people',pattern:/\bwho else\b.{0,30}\b(?:lab|room|there|here|present)\b|\b(?:anyone|anybody|someone) else\b.{0,30}\b(?:lab|room|there|here|with you)\b|\bwho (?:was|were) (?:in|inside) (?:the )?lab\b/,weight:5},
 {intent:'greeting',pattern:/^(?:hi|hello|hey|good (?:evening|morning|afternoon)|how are you|how.{0,8}holding up|are you (?:okay|ok))\b/,weight:5},
];
/** Small transparent domain classifier: high-value phrases outweigh isolated ambiguous words. */
export function matchIntents(input:string){
 const normalized=normalizeIntentText(input),active=activeQuestion(input);const scores:Partial<Record<SemanticIntent,number>>={};
 for(const rule of RULES)if(rule.pattern.test(active))scores[rule.intent]=(scores[rule.intent]??0)+rule.weight;
 const intents=(Object.entries(scores) as [SemanticIntent,number][]).filter(([intent,score])=>score>=(intent==='timeline'?3:4)).sort((a,b)=>b[1]-a[1]).map(([intent])=>intent);
 return{normalized,active,scores,intents,has:(intent:SemanticIntent)=>intents.includes(intent)};
}
