'use client';
import { useEffect,useState } from 'react';
import { BookOpen,Check,X } from 'lucide-react';
import type { Tutorial } from '../lib/tutorial';
const storageKey=(tutorial:Tutorial)=>'case-closed:tutorial:'+tutorial.key;
export function TutorialCard({tutorial,onHelp}:{tutorial:Tutorial;onHelp:()=>void}){
 const key=storageKey(tutorial);
 const [visible,setVisible]=useState(()=>{try{return !window.localStorage.getItem(key)}catch{return true}});
 useEffect(()=>{if(visible){try{window.localStorage.setItem(key,'seen')}catch{}}},[key,visible]);
 if(!visible)return null;
 return <aside className="first-time-tutorial" aria-label="Quick start guide"><button className="tutorial-close" aria-label="Dismiss quick start guide" onClick={()=>setVisible(false)}><X size={16}/></button><span className="eyebrow">QUICK START</span><h2>{tutorial.title}</h2><ol>{tutorial.steps.map(step=><li key={step.title}><strong>{step.title}</strong><p>{step.text}</p></li>)}</ol><div className="button-row"><button className="button small" onClick={()=>setVisible(false)}><Check/>Got it</button><button className="subtle-action" onClick={()=>{setVisible(false);onHelp()}}><BookOpen/>How to play</button></div></aside>;
}
export function HowToPlay({tutorial}:{tutorial:Tutorial|null}){
 return <div className="modal-content"><div className="eyebrow">CASE CLOSED / HOW TO PLAY</div><h2>{tutorial?.title||'Join your workshop.'}</h2>{tutorial?<><div className="stack" style={{marginTop:20}}>{tutorial.steps.map((step,index)=><div className="callout" key={step.title}><strong>{String(index+1).padStart(2,'0')} / {step.title}</strong><p style={{margin:'8px 0 0'}}>{step.text}</p></div>)}</div><p className="helper" style={{marginTop:20}}>You can reopen this guide from Menu → How to play at any time.</p></>:<p>Enter your registered email to join. Your guide will match your workshop role; testuser gets a separate full-practice guide.</p>}</div>;
}
