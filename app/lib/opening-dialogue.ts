import type { OpeningPanel } from './contracts';
export type OpeningBeat = {speaker:'you'|'doctor'|'narration';text:string};

const CHOICE_LINES:Record<string,{you:string;doctor?:string}>={
 routine:{you:'Another late shift, Dr. Sen. You wanted to see me?',doctor:'Yes. The audit is here. I need an explanation for these changes.'},
 hesitation:{you:'Can we speak privately? Please hear me out.',doctor:'I will listen. But this audit cannot simply disappear.'},
 resolve:{you:'I brought the unfinished report. It should explain the missing results.',doctor:'We can discuss what is unfinished later. First, explain the results already changed.'},
 order:{you:'Please check the records again. There must be something we missed.',doctor:'I have checked every entry. The discrepancies remain. Tomorrow’s review will go ahead.'},
 unfinished:{you:'Give me one more day. I can finish the work.',doctor:'I cannot delay the review. The original trial records must be examined tomorrow.'},
 distance:{you:'I have nothing more to say about the report.',doctor:'Then the review will proceed without your explanation.'},
 reputation:{you:'If that report goes ahead, everything people believe about me will change.'},
 work:{you:'That research is my work. I cannot let the credit be taken away.'},
 belonging:{you:'This team is all I have. I cannot lose my place here.'},
};

/** The final beat is always the full server-authored outcome, never a new local fact. */
export function getOpeningBeats(panel:OpeningPanel,choiceId?:string,scriptVersion=2):OpeningBeat[]{
 if(choiceId){
  // The new incident has already played before this line becomes visible.
  // Do not replay a pre-incident spoken retort over the doctor's fallen pose.
  if(scriptVersion===3&&panel.id==='interruption')return [{speaker:'narration',text:panel.caption}];
  const line=CHOICE_LINES[choiceId];
  const conversation:OpeningBeat[]=[];
  if(['threshold','preparation','interruption'].includes(panel.id)&&line){
   conversation.push({speaker:'you',text:line.you});
   if((panel.id==='threshold'||panel.id==='preparation')&&line.doctor)conversation.push({speaker:'doctor',text:line.doctor});
  }
  return [...conversation,{speaker:'narration',text:panel.caption}];
 }
 if(panel.id==='threshold')return [{speaker:'you',text:panel.caption},{speaker:'doctor',text:'Come in. I left the report on the bench. We need to talk before tomorrow’s review.'}];
 if(panel.id==='preparation')return [{speaker:'narration',text:panel.caption},{speaker:'doctor',text:'These entries do not match the original trials. Help me understand why they changed.'}];
 if(panel.id==='interruption')return [{speaker:'doctor',text:'I will not withdraw the audit. Whatever happens here tonight, the review must go ahead.'},{speaker:'narration',text:panel.caption}];
 return [{speaker:'narration',text:panel.caption}];
}

/** Game shortcuts must never take keys from a menu, form, or another overlay. */
export function openingHotkeyAllowed(event:Pick<KeyboardEvent,'defaultPrevented'|'repeat'|'altKey'|'ctrlKey'|'metaKey'>,target:Element|null,root:HTMLElement|null,body:HTMLElement):boolean{
 if(event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return false;
 if(target?.closest('input,textarea,select,[contenteditable="true"]'))return false;
 return !target||target===body||!!root?.contains(target);
}
