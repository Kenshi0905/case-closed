'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Check, ClipboardPaste, Copy, ExternalLink, FileCheck2, Pencil, Send } from 'lucide-react';
import type { CharacterPrompt, SuspectPublic } from '../lib/contracts';
import type { CastProfile } from '../lib/cast-profiles';
import { buildCharacterTemplate, importCharacterJson, validateCharacterDraft } from '../lib/character-planning';
import { PromptFields } from './ui';
type Props={assigned:SuspectPublic;profile?:CastProfile;scriptVersion?:number;value:CharacterPrompt;onChange:(value:CharacterPrompt)=>void;editable:boolean;busy:boolean;onSave:(value:CharacterPrompt)=>Promise<boolean>;notify:(message:string)=>void};
export function CharacterPlanning({assigned,profile,scriptVersion,value,onChange,editable,busy,onSave,notify}:Props){
 const [raw,setRaw]=useState(''),[errors,setErrors]=useState<string[]>([]),[review,setReview]=useState(false),[status,setStatus]=useState(''),[copied,setCopied]=useState(false);
 const reviewRef=useRef<HTMLElement>(null),pasteRef=useRef<HTMLTextAreaElement>(null);
 const template=buildCharacterTemplate(assigned,profile,scriptVersion);
 const identity={name:assigned.name,occupation:assigned.occupation};
 async function copy(){try{await navigator.clipboard.writeText(template);setCopied(true);setErrors([]);notify('Assigned-character prompt copied. Paste it into ChatGPT.')}catch{setCopied(false);setErrors(['Clipboard access was unavailable. Open “View the prompt”, select the text, and copy it manually.'])}}
 function showReview(){
  setReview(true);
  window.setTimeout(()=>{
   const target=reviewRef.current,scroller=target?.closest<HTMLElement>('.game-page-content');
   if(target&&scroller){const offset=target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop;scroller.scrollTop=Math.max(0,scroller.scrollTop+offset-12)}
   target?.focus({preventScroll:true});
  },0);
 }
 function importDraft(){const result=importCharacterJson(raw,identity);if(!result.ok){setErrors(result.errors);pasteRef.current?.focus();return}onChange(result.prompt);setErrors([]);setStatus('Imported locally. Review every field below, then save your submission.');showReview()}
 function change(next:CharacterPrompt){onChange(next);setStatus('You have unsaved changes.');setErrors([])}
 async function save(event:FormEvent){event.preventDefault();if(!editable||busy)return;const result=validateCharacterDraft(value,identity);if(!result.ok){setErrors(result.errors);return}setErrors([]);if(await onSave(result.prompt))setStatus('Submission saved. You can revise and save again until the timer ends.')}
 return <div className="character-planning">
  {editable&&<>
   <ol className="planning-steps" aria-label="Character creation steps"><li><span>1</span>Copy prompt</li><li><span>2</span>Paste response</li><li><span>3</span>Review & save</li></ol>
   <section className="planning-step"><div className="planning-step-heading"><span className="planning-number">01</span><div><h3>Create your character with ChatGPT</h3><p>Your prompt contains only your assigned role and the public case facts. Keep this game open while you generate the JSON.</p></div></div><div className="planning-actions"><button type="button" className="button" onClick={()=>void copy()}>{copied?<Check/>:<Copy/>}{copied?'Prompt copied':'Copy my character prompt'}</button><a className="button secondary" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT<ExternalLink/></a></div><details className="planning-prompt"><summary>View the prompt</summary><textarea aria-label="Assigned-character ChatGPT prompt" readOnly value={template} onFocus={event=>event.currentTarget.select()}/></details></section>
   <section className="planning-step"><div className="planning-step-heading"><span className="planning-number">02</span><div><h3>Paste the generated JSON</h3><p>Copy the complete JSON object or its code block. Importing creates a local draft; it does not submit anything.</p></div></div><label className="sr-only" htmlFor="character-json">Generated character JSON</label><textarea ref={pasteRef} id="character-json" disabled={busy} className="planning-json" value={raw} onChange={event=>setRaw(event.target.value)} spellCheck={false} maxLength={18000} placeholder={JSON.stringify({characterName:assigned.name,occupation:assigned.occupation,relationship:'…',publicAlibi:'…'},null,2)}/><div className="planning-actions"><button type="button" className="button secondary" disabled={busy} onClick={importDraft}><ClipboardPaste/>Import & review</button><button type="button" className="planning-manual" disabled={busy} onClick={()=>{setStatus('Review and complete your own draft, then save.');showReview()}}><Pencil/>Write or edit it myself</button></div></section>
  </>}
  {errors.length>0&&<div className="error-banner planning-errors" role="alert"><strong>Check your character draft</strong><ul>{errors.map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
  {(review||!editable)&&<section ref={reviewRef} tabIndex={-1} className="planning-review" aria-labelledby="planning-review-title"><div className="planning-step-heading"><span className="planning-number"><FileCheck2 size={20}/></span><div><h3 id="planning-review-title">{editable?'Review your character':'Your character details'}</h3><p>{editable?'Keep the assigned identity, check the two event times, and separate firsthand knowledge from assumptions. You can edit the story below.':'Writing is closed. Your character details remain available here.'}</p></div></div><form onSubmit={event=>void save(event)}><PromptFields value={value} onChange={change} disabled={!editable||busy} lockIdentity/><div className="planning-save"><p className="helper" role="status">{editable?(status||'Nothing is sent until you choose Save character submission.'):'The writing window is closed.'}</p>{editable&&<button className="button" disabled={busy}><Send/>{busy?'Saving…':'Save character submission'}</button>}</div></form></section>}
 </div>;
}
