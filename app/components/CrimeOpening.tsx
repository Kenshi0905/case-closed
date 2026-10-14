'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Feather, Footprints, Play, SkipForward } from 'lucide-react';
import type { Action, PublicState, StateResponse, Viewer } from '../lib/contracts';
import { getOpeningBeats, openingHotkeyAllowed } from '../lib/opening-dialogue';
import { playSfx } from '../lib/audio';
import OpeningWorld from './OpeningWorld';
import { paginateDialogue } from './InterrogationDialog';
import { Typewriter } from './ui';

type Props={state:PublicState;viewer:Viewer;busy:boolean;blocked:boolean;run:(action:Action)=>Promise<StateResponse|null>};
const narrowQuery='(max-width:700px), (max-height:580px)';
function subscribeWidth(listener:()=>void){const media=window.matchMedia(narrowQuery);media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener)}
const getNarrow=()=>window.matchMedia(narrowQuery).matches;

function DoctorPortrait(){
 const [loaded,setLoaded]=useState(false);
 return <div className={'opening-doctor '+(loaded?'is-loaded':'')} aria-hidden="true">
  {/* eslint-disable-next-line @next/next/no-img-element -- Original transparent pixel character, preserved without resampling. */}
  <img src="/assets/portraits/dr-sen-pixel.png" alt="" draggable={false} onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>
 </div>;
}

export default function CrimeOpening({state,viewer,busy,blocked,run}:Props){
 const rootRef=useRef<HTMLElement>(null),choiceRefs=useRef<(HTMLButtonElement|null)[]>([]),nextRef=useRef<HTMLButtonElement>(null),actionLock=useRef(false);
 const [moving,setMoving]=useState(true),[skipToken,setSkipToken]=useState(0);
 const onTravelChange=useCallback((value:boolean)=>setMoving(value),[]);
 const narrow=useSyncExternalStore(subscribeWidth,getNarrow,()=>false);
 const opening=state.opening,panel=opening.panels[Math.min(opening.panelIndex,opening.panels.length-1)];
 const selected=panel?opening.choices[panel.id]:undefined;
 const isDirector=viewer.canControl;
 const canChoose=isDirector&&!blocked&&!moving;
 const castWord=state.suspectCount===5?'five':'six';
 const readingKey=state.id+':'+opening.panelIndex+':'+(selected||'entry')+':'+opening.completed;
 const [reading,setReading]=useState({key:readingKey,index:0});
 const scriptVersion=opening.scriptVersion===3?3:2;
 const beats=panel?getOpeningBeats(panel,selected,scriptVersion).flatMap(beat=>paginateDialogue(beat.text,narrow?160:260).map(text=>({...beat,text}))):[];
 const line=Math.min(reading.key===readingKey?reading.index:0,Math.max(0,beats.length-1));
 const beat=beats[line],lastLine=line===beats.length-1;
 const showDecisions=lastLine&&!opening.completed&&!moving;
 function advanceLine(){if(blocked||moving||lastLine)return;playSfx('menu');setReading({key:readingKey,index:line+1})}
 function backLine(){if(blocked||moving||line===0)return;playSfx('menu');setReading({key:readingKey,index:line-1})}
 async function perform(action:Action){
  if(actionLock.current||busy||!canChoose)return;
  actionLock.current=true;
  try{await run(action)}finally{actionLock.current=false}
 }
 async function choose(index:number){
  const choice=panel?.choices[index];
  if(!choice||!showDecisions||choice.id===selected)return;
  await perform({type:'openingSelect',sceneId:panel.id,choiceId:choice.id});
 }
 useEffect(()=>{
  if(!panel||blocked||moving||busy||opening.completed)return;
  const keydown=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(actionLock.current||!openingHotkeyAllowed(event,target,rootRef.current,document.body))return;
   const focused=choiceRefs.current.findIndex(button=>button===document.activeElement);
   const index=Number(event.key)-1;
   if(canChoose&&showDecisions&&/^[1-3]$/.test(event.key)&&panel.choices[index]){
    event.preventDefault();choiceRefs.current[index]?.focus();void choose(index);return;
   }
   if(canChoose&&showDecisions&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
    if(target?.closest('button')&&focused<0)return;
    event.preventDefault();const current=focused>=0?focused:Math.max(0,panel.choices.findIndex(choice=>choice.id===selected));
    const delta=event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1;
    choiceRefs.current[(current+delta+panel.choices.length)%panel.choices.length]?.focus();
   }else if(event.key==='Enter'){
    if(target?.closest('button')&&focused<0)return;
    event.preventDefault();
    if(!lastLine)advanceLine();
    else if(canChoose&&focused>=0&&panel.choices[focused].id!==selected)void choose(focused);
    else if(canChoose&&selected)void perform({type:'openingNext'});
    else if(canChoose)choiceRefs.current[0]?.focus();
   }
  };
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 });
 // A selected choice removes its button during travel. Restore a usable reading focus on arrival.
 useEffect(()=>{if(!moving&&!blocked&&document.activeElement===document.body)rootRef.current?.focus({preventScroll:true})},[moving,blocked,readingKey]);
 async function sampleCast(){
  if(actionLock.current||busy||!canChoose)return;
  actionLock.current=true;
  try{const writing=await run({type:'setPhase',phase:2});if(writing)await run({type:'setPhase',phase:3})}finally{actionLock.current=false}
 }
 if(!panel)return <div className="opening-standby">Preparing the opening scene…</div>;
 return <section className="crime-opening opening-firstperson" ref={rootRef} tabIndex={-1} aria-label="First-person opening sequence">
  <OpeningWorld sceneIndex={opening.panelIndex} choiceId={selected} completed={opening.completed} paused={blocked} skipToken={skipToken} onTravelChange={onTravelChange} scriptVersion={scriptVersion} eventKey={state.id}/>
  <div className="opening-world-shade"/>
  <header className="opening-world-hud"><div><span>CASE 001 · BEFORE THE INVESTIGATION</span><strong>{opening.completed?'PROLOGUE COMPLETE':panel.title}</strong></div><span className="opening-world-counter">{String(opening.panelIndex+1).padStart(2,'0')}<i>/</i>{String(opening.panels.length).padStart(2,'0')}</span></header>
  {moving&&!blocked&&<div className="opening-travel" role="status"><span><Footprints/>{scriptVersion===3&&opening.panelIndex===2&&selected?'21:17 — the confrontation':'Moving through the lab…'}</span><button type="button" onClick={()=>{setSkipToken(n=>n+1);playSfx('menu')}}><SkipForward/>{scriptVersion===3&&opening.panelIndex===2&&selected?'Skip sequence':'Skip walk'}</button></div>}
  {!moving&&!blocked&&<div className="opening-conversation-dock"><div className={'opening-conversation '+(opening.completed?'is-complete':'')+(showDecisions?' has-choices':'')}>
   {!opening.completed&&beat?.speaker==='doctor'&&<DoctorPortrait/>}
   <div className="opening-speaker">{opening.completed?'THE NEXT CHAPTER':beat?.speaker==='doctor'?'DR. ARJUN SEN':beat?.speaker==='you'?'YOU · IDENTITY UNKNOWN':'THE SCENE'}</div>
   <div className="opening-reading" aria-live="polite" aria-atomic="true">
    {opening.completed?<><h2>The lab falls silent.</h2><p>{state.soloPlay?'Six suspects. Five clues. You are now the detective: explore the lab and find the gap in their stories.':<>Now {castWord} writers have six minutes to create the suspects. Their approved stories will shape the investigation.</>}</p></>:beat&&<Typewriter text={beat.text} voiceIndex={beat.speaker==='doctor'?6:undefined} utteranceKey={readingKey+':'+line} revealOnClick/>}
   </div>
   {!opening.completed?<>
    {showDecisions&&<fieldset className="opening-world-choices" disabled={!canChoose||busy} aria-busy={busy}><legend>{scriptVersion===3&&panel.id==='interruption'&&!selected?'RAISE THE GUN AND FIRE':selected?'YOUR DECISION':'WHAT DO YOU DO?'}</legend>{panel.choices.map((choice,i)=><button ref={node=>{choiceRefs.current[i]=node}} type="button" className={selected===choice.id?'is-selected':''} key={choice.id} aria-pressed={selected===choice.id} onClick={()=>void choose(i)}><kbd>{i+1}</kbd><span>{choice.label}</span>{selected===choice.id&&<Check aria-label="Selected"/>}</button>)}</fieldset>}
    <footer className="opening-world-actions"><div className="opening-reading-controls"><button type="button" disabled={line===0||busy} onClick={backLine} aria-label="Previous dialogue line"><ArrowLeft/>Back line</button><span>LINE {line+1}/{beats.length}</span></div>{!lastLine?<button ref={nextRef} type="button" className="opening-world-next" onClick={advanceLine}>Next line<ArrowRight/></button>:canChoose?<button ref={nextRef} type="button" className="opening-world-next" disabled={busy||!selected} onClick={()=>void perform({type:'openingNext'})}>{busy?'Saving…':opening.panelIndex===opening.panels.length-1?'Finish prologue':'Continue'}<ArrowRight/></button>:<span className="opening-world-watching"><Eye/>Waiting for the facilitator</span>}</footer>
    {isDirector&&showDecisions&&opening.panelIndex>0&&<button className="opening-previous-scene" disabled={busy} onClick={()=>void perform({type:'openingBack'})}>Previous scene</button>}
   </>:<div className="opening-world-finish">{canChoose?<>{state.soloPlay?<button className="opening-world-next" disabled={busy} onClick={()=>void perform({type:'beginSoloInvestigation'})}><Play/>Begin investigation<ArrowRight/></button>:state.testSession?<button className="opening-world-next" disabled={busy} onClick={()=>void perform({type:'beginWriting'})}><Feather/>Begin six-minute writing<ArrowRight/></button>:state.mode==='demo'&&!state.rehearsal?<button className="opening-world-next" disabled={busy} onClick={()=>void sampleCast()}><Play/>Play with sample cast<ArrowRight/></button>:<button className="opening-world-next" disabled={busy||!!state.rehearsal&&state.rehearsal.seats.some(seat=>!seat.joined)} onClick={()=>void perform({type:'setPhase',phase:2})}><Feather/>Begin six-minute writing<ArrowRight/></button>}{state.rehearsal&&state.rehearsal.seats.some(seat=>!seat.joined)&&<p className="opening-world-watching">All {state.rehearsal.seats.length} participants need to join before writing begins. Open Group rehearsal in the Menu to share their invitations.</p>}{state.mode==='demo'&&!state.soloPlay&&!state.testSession&&!state.rehearsal&&<button className="opening-world-practice" disabled={busy} onClick={()=>void perform({type:'setPhase',phase:2})}>Try the six-minute writing phase</button>}</>:<p className="opening-world-watching"><Eye/>Your facilitator will begin the writing phase.</p>}</div>}
  </div></div>}
 </section>;
}
