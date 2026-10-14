'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Send, X } from 'lucide-react';
import { Portrait, Typewriter } from './ui';
import type { SuspectPublic } from '../lib/contracts';
import { getCastProfile } from '../lib/cast-profiles';

const QUESTIONS=[
 {label:'Your alibi',message:'Where were you at 21:17?'},
 {label:'Your secret',message:'What are you hiding?'},
];
const CLUE_QUESTIONS=[
 {label:'The watch',message:'What do you know about the watch?'},
 {label:'Access logs',message:'What do the access logs show?'},
 {label:'The flask',message:'What can you tell me about the laboratory flask?'},
 {label:'Office note',message:'What do you know about the office note and the audit?'},
 {label:'Corridor camera',message:'What did the corridor camera record?'},
 {label:'Note and data',message:'What do you know about the note and Dr. Sen’s data?'},
];

const dialogueQuery='(max-width:700px)';
function subscribeDialogueWidth(listener:()=>void){const media=window.matchMedia(dialogueQuery);media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener)}
const getNarrowDialogue=()=>window.matchMedia(dialogueQuery).matches;
const PORTRAIT_IDS=['mira','dev','isha','kabir','tara','neil'];
/** Each portrait is an independent image with safe margins around the complete pose. */
export function PortraitBust({index,name,color}:{index:number;name:string;color:string}){
 const cell=Math.max(0,Math.min(5,index));
 const src=`/assets/portraits/${PORTRAIT_IDS[cell]}.png`;
 const [loadedSrc,setLoadedSrc]=useState('');
 const loaded=loadedSrc===src;
 return <div className={`portraitLarge ${loaded?'portrait-loaded':''}`} role="img" aria-label={`${name}, character portrait`}>
  {/* eslint-disable-next-line @next/next/no-img-element -- Keep the original transparent pixel portrait without resampling. */}
  <img key={src} className="portrait-image" src={src} alt="" draggable={false} onLoad={()=>setLoadedSrc(src)} onError={()=>setLoadedSrc('')} style={{opacity:loaded?1:0}}/>
  {!loaded&&<Portrait color={color} index={cell}/>}
 </div>;
}

/** Pack whole sentences when possible; long sentences wrap only between words. */
export function paginateDialogue(text:string,maxLength=260):string[]{
 const words=text.trim().split(/\s+/).filter(Boolean),sentences:string[]=[],pages:string[]=[];
 const limit=Number.isFinite(maxLength)?Math.max(1,Math.floor(maxLength)):260;
 let sentence:string[]=[],page='';
 for(const word of words){
  sentence.push(word);
  const bare=word.replace(/^[“"'(]+/,'').replace(/[”"')\]]+$/,'');
  const abbreviation=/^(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|e\.g|i\.e)\.$/i.test(bare)||/^(?:[A-Za-z]\.)+$/.test(bare);
  if(/[.!?][”"')\]]*$/.test(word)&&!abbreviation){sentences.push(sentence.join(' '));sentence=[]}
 }
 if(sentence.length)sentences.push(sentence.join(' '));
 for(const item of sentences){
  if(item.length<=limit){
   if(page&&page.length+item.length+1>limit){pages.push(page);page=''}
   page+=(page?' ':'')+item;
  }else{
   if(page){pages.push(page);page=''}
   for(const word of item.split(' ')){
    if(page&&page.length+word.length+1>limit){pages.push(page);page=''}
    page+=(page?' ':'')+word;
   }
  }
 }
 if(page)pages.push(page);
 return pages.length?pages:[''];
}

type Props={participantTest?:boolean;mode?:'live'|'demo'|'replay';utteranceKey:number;readOnlyReason:string;suspect:SuspectPublic;index:number;text:string;question:string;setQuestion:(q:string)=>void;onAsk:(q?:string)=>void;busy:boolean;disabled:boolean;error:string;engineLabel:string;clueCount:number;guest:boolean;onJoin:()=>void;onClose:()=>void};
export default function InterrogationDialog({participantTest=false,mode='live',suspect,index,text,utteranceKey,readOnlyReason,question,setQuestion,onAsk,busy,disabled,error,engineLabel,clueCount,guest,onJoin,onClose}:Props){
 const profile=getCastProfile(suspect.id,index);
 const castIndex=profile?Number(profile.id.split('-')[1])-1:index;
 const questions=[QUESTIONS[0],CLUE_QUESTIONS[castIndex]??CLUE_QUESTIONS[0],QUESTIONS[1]];
 const replyKey=suspect.id+':'+utteranceKey+':'+text;
 const [pagination,setPagination]=useState({replyKey,index:0});
 const pageIndex=pagination.replyKey===replyKey?pagination.index:0;
 const setPageIndex=(index:number)=>setPagination({replyKey,index});
 const narrow=useSyncExternalStore(subscribeDialogueWidth,getNarrowDialogue,()=>false);
 const pages=paginateDialogue(text,narrow?160:260),page=Math.min(pageIndex,pages.length-1);
 const ref=useRef<HTMLElement>(null);
 function askQuestion(message=question){if(disabled||busy||!message.trim())return;setQuestion(message);onAsk(message)}
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.focus({preventScroll:true});const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose()}};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);previous?.focus({preventScroll:true})}},[onClose]);
 return <div className="interrogation-dock"><section ref={ref} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="interrogation-name" className="interrogation-panel">
  <PortraitBust index={castIndex} name={suspect.name} color={suspect.color}/>
  <div className="interrogation-nameplate" title={profile?.knownFor}><h2 id="interrogation-name">{suspect.name}</h2><span>{suspect.occupation}</span></div>
  <button className="interrogation-close" aria-label="End conversation" onClick={onClose}><X/></button>
  <div className="interrogation-main">
   <div className="interrogation-copy"><Typewriter text={pages[page]} voiceIndex={castIndex} utteranceKey={`${utteranceKey}:${page}`} revealOnClick/></div>
   {pages.length>1&&<div className="interrogation-pages" aria-label="Reply pages"><button type="button" disabled={page===0} onClick={()=>setPageIndex(page-1)} aria-label="Previous reply page"><ArrowLeft/>Back</button><span>Reply {page+1} / {pages.length}</span><button type="button" disabled={page===pages.length-1} onClick={()=>setPageIndex(page+1)} aria-label="Next reply page">Continue<ArrowRight/></button></div>}
   {error&&<p className="interrogation-error" role="alert">{error}</p>}
   <div className="interrogation-options">{disabled?<span className="interrogation-readonly">{readOnlyReason}</span>:<strong>Ask a question</strong>}<span>{busy?'Thinking…':`${clueCount}/5 clues found`}</span></div>
   {!disabled&&<><div className="interrogation-suggestions" aria-label="Suggested questions">{questions.map(q=><button type="button" key={q.message} title={q.message} aria-label={q.message} disabled={busy} onClick={()=>askQuestion(q.message)}><span>▸</span>{q.label}</button>)}</div>
   <form className="interrogation-form" onSubmit={e=>{e.preventDefault();askQuestion()}}><input aria-label={`Question for ${suspect.name}`} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about an object, time, or alibi…" maxLength={1000} required disabled={busy}/><button disabled={busy||!question.trim()}><Send/><span>{busy?'…':'Ask'}</span></button></form></>}
   {guest?<button className="interrogation-join" onClick={onJoin}>Join the event to ask a question<ArrowRight/></button>:<div className="interrogation-engine">{engineLabel} <span>·</span> {busy?'WAITING FOR A REPLY':mode==='live'?'SHARED WITH THE WORKSHOP':mode==='replay'?'PRIVATE REPLAY':participantTest?'PARTICIPANT TEST':'PRIVATE SAMPLE'}</div>}
  </div>
 </section></div>;
}
