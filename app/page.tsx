'use client';
import { StaffCredential } from './components/StaffCredential';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCheck, CircleHelp, Crosshair, Fingerprint, FolderClosed, LockKeyhole, LogIn, MessageSquare, Radio, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import InvestigationGame from './components/InvestigationGame';
import InterrogationDialog from './components/InterrogationDialog';
import { TutorialCard,HowToPlay } from './components/Tutorial';
import { tutorialFor } from './lib/tutorial';
import RehearsalDialog from './components/RehearsalDialog';
import { createVisiblePoller } from './lib/audience-runtime';
import { needsLoginGreeting,participantScreenChange } from './lib/participant-navigation';
import { readRehearsalInvitation, withoutRehearsalInvitation } from './lib/rehearsal-links';
import Facilitator from './components/Facilitator';
import { Ballot, Credits, Learning, RevealPanel, StressLab, SuspectWorkspace } from './components/SessionPanels';
import { EvidenceIcon, Modal, Portrait, Typewriter } from './components/ui';
import { crimeContext } from './lib/crime-context';
import { getCastProfile } from './lib/cast-profiles';
import { isFacilitatorEmail } from './lib/facilitator-emails';
import { FACILITATOR_ENTRY, resolveFacilitatorReturn } from './lib/facilitator-access';
import { TEST_PARTICIPANT_EMAIL, isTestParticipantEmail, type TestParticipantRole } from './lib/test-participant';
import { unlockAudio, disposeAudio, playSfx } from './lib/audio';
import { ACTION_TIMEOUT_MS, MOVE_TIMEOUT_MS, STATE_TIMEOUT_MS, RecoveryRequiredError, createActionRecovery, requestJson } from './lib/action-recovery';
import { createEvidenceInspector, createMovementPathQueue, cancelMovementPath, enqueueMovementPath, MOVEMENT_BUFFER_LIMIT, reconcileMovementPosition, type InspectionStatus } from './lib/interaction-flow';
import type { Action, StateResponse, SuspectPublic } from './lib/contracts';

type Tab='investigation'|'evidence'|'suspects'|'facilitator'|'learning'|'credits';
type Dialog={kind:'login'|'facilitator'|'help'|'officer'|'sample'|'stress'|'ballot'|'rehearsal'}|{kind:'evidence';id:string}|{kind:'suspect';id:string};
const NAV:{id:Tab;label:string;icon:typeof Search}[]=[{id:'investigation',label:'Investigation',icon:Crosshair},{id:'evidence',label:'Evidence',icon:FolderClosed},{id:'suspects',label:'Suspects',icon:Users},{id:'facilitator',label:'Facilitator',icon:Radio},{id:'learning',label:'Learning',icon:BookOpen},{id:'credits',label:'Credits',icon:Fingerprint}];
const PREVIEW_SUSPECTS:SuspectPublic[]=[
 {id:'preview-1',name:'Mira Rao',occupation:'Research fellow',color:'#f6ba73',x:5,y:9},
 {id:'preview-2',name:'Dev Mehta',occupation:'Systems engineer',color:'#8d9fea',x:13,y:5},
 {id:'preview-3',name:'Isha Das',occupation:'Lab technician',color:'#db8abe',x:21,y:5},
 {id:'preview-4',name:'Kabir Sethi',occupation:'Grant coordinator',color:'#a1c979',x:28,y:10},
 {id:'preview-5',name:'Tara Bose',occupation:'Visiting researcher',color:'#76ccd0',x:22,y:16},
 {id:'preview-6',name:'Neil Kapoor',occupation:'Doctoral candidate',color:'#d8bc83',x:12,y:16},
].map(s=>({...s,participantId:null,relationship:'',publicAlibi:'',approved:true,writerName:'Sample character',suspicion:0}));

async function requestState(url:string,init:RequestInit={},timeoutMs=STATE_TIMEOUT_MS):Promise<StateResponse>{
 const value=await requestJson<StateResponse>(url,init,timeoutMs);
 if(!value?.state?.id||!Number.isFinite(value.state.revision)||!value.viewer||!value.state.avatar||!Array.isArray(value.state.evidence)||!Array.isArray(value.state.dialogue))throw new Error('The case response was incomplete. Checking the confirmed state.');
 return value;
}

export default function Home(){
 const [data,setData]=useState<StateResponse|null>(null),[tab,setTab]=useState<Tab>('investigation'),[dialog,setDialog]=useState<Dialog|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connection,setConnection]=useState<'connecting'|'synced'|'offline'>('connecting'),[toast,setToast]=useState(''),[email,setEmail]=useState(''),[question,setQuestion]=useState(''),[dialogueText,setDialogueText]=useState(''),[utteranceKey,setUtteranceKey]=useState(0),[localPosition,setLocalPosition]=useState({x:16,y:10}),[movementPaused,setMovementPaused]=useState(false);
 const [recovering,setRecovering]=useState(false);
 const [rehearsalInvites,setRehearsalInvites]=useState<NonNullable<StateResponse['rehearsalInvites']>>([]),[rehearsalInvitation,setRehearsalInvitation]=useState<{roomId:string;token:string}|null>(null),[rehearsalName,setRehearsalName]=useState('');
 const [movementPending,setMovementPending]=useState(false),[inspection,setInspection]=useState<{id:string;sessionId:string;status:InspectionStatus}|null>(null);
 const [inspector]=useState(createEvidenceInspector),[movementQueue]=useState(createMovementPathQueue);
 const [facilitatorAccess,setFacilitatorAccess]=useState<'denied'|'error'|null>(null);
 const [testRole,setTestRole]=useState<TestParticipantRole>('detective'),[participantEntry,setParticipantEntry]=useState(false);
 const dataRef=useRef<StateResponse|null>(null),offset=useRef(0),moveQueue=useRef<Promise<unknown>>(Promise.resolve()),pendingMoves=useRef(0),busyRef=useRef(false),busyToken=useRef(0),readPending=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null),sceneRef=useRef<HTMLDivElement>(null),initialized=useRef(false),requestEpoch=useRef(0),answerCursor=useRef<{sessionId:string;answerId:string|null}|null>(null),viewRef=useRef<{tab:Tab;dialog:Dialog|null}>({tab:'investigation',dialog:null}),drawerOpenRef=useRef(false);
 useEffect(()=>{viewRef.current={tab,dialog}},[tab,dialog]);
 useEffect(()=>{const unlock=(event:Event)=>{if(event.isTrusted)void unlockAudio()};document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);return()=>{document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);disposeAudio()}},[]);
 const trackDrawer=useCallback((open:boolean)=>{drawerOpenRef.current=open},[]);
 const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),4500)},[]);
 const [publicHome,setPublicHome]=useState(false);
 const apply=useCallback((next:StateResponse)=>{const current=dataRef.current;if(current&&next.state.id===current.state.id&&next.state.revision<current.state.revision)return;const sessionChanged=!!current&&current.state.id!==next.state.id;const lostControl=!!current?.viewer.canControl&&!next.viewer.canControl;if(lostControl){cancelMovementPath(movementQueue);inspector.cancel();setInspection(null)}if(sessionChanged){setRehearsalInvites([]);cancelMovementPath(movementQueue);inspector.cancel();setInspection(null);setDialog(null)}const nextScreen=participantScreenChange(current,next,viewRef.current.tab);if(nextScreen){setTab(nextScreen);setDialog(null)}if(needsLoginGreeting(current,next)||(sessionChanged&&next.state.mode==='live')){setPublicHome(true);setDialog(null)}const latest=next.state.dialogue.filter(entry=>entry.kind==='answer'&&entry.suspectId).at(-1);const answerId=latest?.id||null;const cursor=answerCursor.current;const fresh=cursor?.sessionId===next.state.id&&!!answerId&&cursor.answerId!==answerId;answerCursor.current={sessionId:next.state.id,answerId};const view=viewRef.current;if(next.viewer.role!=='guest'&&fresh&&latest?.suspectId&&(next.state.mode==='live'||!!next.state.rehearsal)&&(next.state.phase===3||next.state.phase===4)&&!next.viewer.canControl&&view.tab==='investigation'&&!drawerOpenRef.current&&document.visibilityState==='visible'&&(!view.dialog||view.dialog.kind==='suspect')&&next.state.suspects.some(s=>s.id===latest.suspectId)){setQuestion('');setDialogueText(latest.text);setUtteranceKey(n=>n+1);setDialog({kind:'suspect',id:latest.suspectId})}if(next.rehearsalInvites)setRehearsalInvites(next.rehearsalInvites);dataRef.current=next;setData(next);offset.current=next.serverTime-Date.now();setLocalPosition(position=>reconcileMovementPosition(position,next.state.avatar,sessionChanged?0:pendingMoves.current));setConnection('synced')},[inspector,movementQueue]);
 const [recovery]=useState(()=>createActionRecovery<StateResponse>({
  read:()=>requestState('/api/state',{cache:'no-store'},STATE_TIMEOUT_MS),
  blocked:()=>{requestEpoch.current++;busyToken.current++;busyRef.current=false;setBusy(false);cancelMovementPath(movementQueue);inspector.cancel();setInspection(current=>current?{...current,status:'failed'}:null);setMovementPaused(true);setRecovering(true);setConnection('offline')},
  recovered:next=>{apply(next);setRecovering(false);setMovementPaused(false);setError('')},
  failed:()=>{setConnection('offline');setError('The last action could not be confirmed. Reconnect to check the case before trying another action.')},
 }));
 const load=useCallback(async()=>{
  if(recovery.blocked){await recovery.synchronize();return}
  if(readPending.current||busyRef.current)return;
  readPending.current=true;
  const epoch=requestEpoch.current;
  try{
   const value=await requestState('/api/state',{cache:'no-store'},STATE_TIMEOUT_MS);
   if(epoch!==requestEpoch.current)return;
   apply(value);
   if(initialized.current)return;
   initialized.current=true;
   const url=new URL(window.location.href);
   const outcome=resolveFacilitatorReturn(url.searchParams.get('facilitator'),value.state.mode,value.viewer.role);
   if(outcome){
    url.searchParams.delete('facilitator');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    setError('');
    if(outcome==='ready'){setFacilitatorAccess(null);setDialog(null);setTab('facilitator')}
    else{setFacilitatorAccess(outcome);setDialog({kind:'facilitator'})}
    return;
   }
   const invitation=readRehearsalInvitation(url);
   if(invitation){setRehearsalInvitation(invitation);setDialog({kind:'rehearsal'});return}
   const wantsReplay=url.searchParams.get('replay')==='1';
   if(url.searchParams.get('workshop')==='1'||wantsReplay){if(value.viewer.role==='guest'){setDialog({kind:'login'});return}}else if(value.state.mode==='live'){setPublicHome(true);setDialog(null);return}
   if(wantsReplay&&value.state.replayAvailable){
    requestEpoch.current++;const token=++busyToken.current;busyRef.current=true;setBusy(true);
    try{const payload=await recovery.write(()=>requestState('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'startReplay'})},ACTION_TIMEOUT_MS));apply(payload);setDialog(null);setTab('investigation')}
    catch(error){setError(error instanceof Error?error.message:'The replay could not be opened.')}
    finally{if(token===busyToken.current){busyRef.current=false;setBusy(false)}}
   }
  }catch(e){if(epoch!==requestEpoch.current&&!recovery.blocked)return;setConnection('offline');if(!dataRef.current||recovery.blocked)setError(e instanceof Error?e.message:'Unable to connect. Please retry.')}
  finally{readPending.current=false}
 },[apply,recovery]);
 useEffect(()=>{const poller=createVisiblePoller({visible:()=>document.visibilityState==='visible',busy:()=>busyRef.current,poll:load});poller.start();document.addEventListener('visibilitychange',poller.visibilityChanged);return()=>{poller.dispose();document.removeEventListener('visibilitychange',poller.visibilityChanged);if(toastTimer.current)clearTimeout(toastTimer.current)}},[load]);
 const run=useCallback(async(action:Action):Promise<StateResponse|null>=>{
  const silent=action.type==='move'||action.type==='movePath';if(recovery.blocked||(!silent&&busyRef.current))return null;
  const token=silent?0:++busyToken.current;const sessionId=dataRef.current?.state.id;
  const knownClues=new Set(dataRef.current?.state.evidence.filter(e=>e.discovered).map(e=>e.id)||[]);
  if(!silent){setBusy(true);busyRef.current=true;setError('');requestEpoch.current++}
  try{
   const next=await recovery.write(()=>{if(dataRef.current?.state.id!==sessionId)throw new RecoveryRequiredError();return requestState('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)},silent?MOVE_TIMEOUT_MS:ACTION_TIMEOUT_MS)},silent?undefined:()=>moveQueue.current,silent);
   if(silent&&dataRef.current?.state.id!==sessionId)return null;
   apply(next);
   if(action.type==='discover'||((action.type==='interrogate'||action.type==='stressTest')&&next.state.evidence.some(e=>e.discovered&&!knownClues.has(e.id))))playSfx('clue');else if(action.type==='startDemo'||action.type==='startReplay')playSfx('join');else if(action.type==='interrogate'||action.type==='stressTest')playSfx('ask');else if(action.type==='vote')playSfx('vote');else if(action.type==='reveal'||action.type==='finishCase')playSfx('reveal');else if(action.type==='exitSession')playSfx('close');else if(!silent)playSfx('menu');
   return next;
  }catch(e){if(!silent)playSfx('error');setError(e instanceof Error?e.message:'The action could not be confirmed. Please reconnect.');return null}
  finally{if(!silent&&token===busyToken.current){setBusy(false);busyRef.current=false}}
 },[apply,recovery]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!dialog)setTab('investigation')};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[dialog]);
 const closeDialog=useCallback(()=>{inspector.cancel();setInspection(null);setDialog(null);setQuestion('')},[inspector]);
 const closeByUser=useCallback(()=>{playSfx('close');closeDialog()},[closeDialog]);
 async function login(e:React.FormEvent){
  e.preventDefault();if(isFacilitatorEmail(email)||busyRef.current||recovery.blocked)return;
  requestEpoch.current++;const token=++busyToken.current;setBusy(true);busyRef.current=true;setError('');
  try{
   const next=await recovery.write(()=>requestState('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,...(isTestParticipantEmail(email)?{testRole}:{})})},ACTION_TIMEOUT_MS),()=>moveQueue.current);
   apply(next);playSfx('join');closeDialog();if(next.state.testSession){setTab(next.viewer.role==='suspect'&&next.state.phase===2?'suspects':'investigation');notify('Participant test opened. The live workshop is unchanged.')}else{notify('Welcome, '+next.viewer.name+'. You’re in the room.');const url=new URL(window.location.href),invitation=readRehearsalInvitation(url);if(invitation){setRehearsalInvitation(invitation);setDialog({kind:'rehearsal'})}else if(url.searchParams.get('replay')==='1'&&next.state.replayAvailable){const replay=await recovery.write(()=>requestState('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'startReplay'})},ACTION_TIMEOUT_MS));apply(replay);setTab('investigation')}}
  }catch(e){playSfx('error');setError(e instanceof Error?e.message:'Could not sign in.')}
  finally{if(token===busyToken.current){setBusy(false);busyRef.current=false}}
 }
 async function logoutParticipant(){
  if(busyRef.current||recovery.blocked)return;
  requestEpoch.current++;const token=++busyToken.current;setBusy(true);busyRef.current=true;setError('');
  try{
   const next=await recovery.write(()=>requestState('/api/auth',{method:'DELETE'},ACTION_TIMEOUT_MS),()=>moveQueue.current);
   apply(next);closeDialog();if(next.viewer.role==='guest')setDialog({kind:'login'});notify('Participant session ended.');
  }catch(e){setError(e instanceof Error?e.message:'Could not leave the participant session.')}
  finally{if(token===busyToken.current){setBusy(false);busyRef.current=false}}
 }
 async function createRehearsal(participantCount:number){const next=await run({type:'startRehearsal',participantCount});if(next){setRehearsalInvitation(null);setTab('investigation');setDialog({kind:'rehearsal'})}}
 async function joinRehearsal(){
  if(!rehearsalInvitation||!rehearsalName.trim()||busyRef.current||recovery.blocked)return;
  requestEpoch.current++;const token=++busyToken.current;busyRef.current=true;setBusy(true);setError('');
  try{
   const next=await recovery.write(()=>requestState('/api/rehearsal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomId:rehearsalInvitation.roomId,inviteToken:rehearsalInvitation.token,name:rehearsalName.trim()})},ACTION_TIMEOUT_MS),()=>moveQueue.current);
   apply(next);setRehearsalInvitation(null);closeDialog();setTab(next.viewer.role==='suspect'&&next.state.phase===2?'suspects':'investigation');
   window.history.replaceState(window.history.state,'',withoutRehearsalInvitation(new URL(window.location.href)));
   playSfx('join');notify('You joined the private group rehearsal as a '+(next.viewer.role==='suspect'?'suspect writer':'detective')+'.');
  }catch(error){setError(error instanceof Error?error.message:'Could not join this rehearsal.')}
  finally{if(token===busyToken.current){setBusy(false);busyRef.current=false}}
 }
 async function startSolo(){const next=await run({type:'startSolo'});if(next){setPublicHome(false);closeDialog();setTab('investigation')}}
 async function startSample(){if(dataRef.current?.viewer.role!=='admin'){setDialog({kind:'login'});return}const next=await run({type:'startDemo',opening:true});if(next){closeDialog();setTab('investigation')}}
 function move(position:{x:number;y:number}){
  if(busyRef.current||recovery.blocked||!dataRef.current?.viewer.canControl)return false;
  const accepted=enqueueMovementPath(movementQueue,position,dataRef.current?.state.avatar??position,async movement=>!!(await run({type:'movePath',...movement})),{
   pending:count=>{pendingMoves.current=count;setMovementPending(count>=MOVEMENT_BUFFER_LIMIT)},
   failed:()=>setMovementPaused(true),
   idle:()=>{if(dataRef.current)setLocalPosition(dataRef.current.state.avatar);setMovementPaused(recovery.blocked)},
  });
  if(accepted){setLocalPosition(position);moveQueue.current=movementQueue.tail;}
  return accepted;
 }
 function interact(target:{type:'evidence'|'suspect'|'officer';id:string;label:string}){
  if(!dataRef.current?.viewer.canControl)return;
  inspector.cancel();setInspection(null);
  if(target.type==='officer'){playSfx('menu');setDialog({kind:'officer'});return}
  if(target.type!=='evidence'){openSuspect(target.id);return}
  const current=dataRef.current,evidence=current?.state.evidence.find(item=>item.id===target.id);if(!current||!evidence)return;
  const sessionId=current.state.id;
  playSfx('menu');setError('');setDialog({kind:'evidence',id:target.id});
  if(evidence.discovered||current.state.revealed)return;
  void inspector.inspect({
   open:()=>setInspection({id:target.id,sessionId,status:'moving'}),
   waitForMovement:()=>moveQueue.current,
   isCurrentSession:()=>dataRef.current?.state.id===sessionId,
   discover:async()=>{
    const latest=dataRef.current;
    if(latest?.state.evidence.find(item=>item.id===target.id)?.discovered)return true;
    const next=await run({type:'discover',evidenceId:target.id});
    return !!next&&next.state.id===sessionId&&next.state.evidence.some(item=>item.id===target.id&&item.discovered);
   },
   status:status=>{setInspection({id:target.id,sessionId,status});if(status==='done')notify('Evidence discovered and added to the case file.');},
  });
 }
 function openSuspect(id:string){inspector.cancel();setInspection(null);playSfx('menu');if(id.startsWith('preview-')){setDialog({kind:'sample'});return}const suspect=dataRef.current?.state.suspects.find(s=>s.id===id);if(!suspect)return;setQuestion('');setUtteranceKey(n=>n+1);setDialogueText(suspect.approved?`“${suspect.publicAlibi}”`:'My character is still being reviewed by the facilitator.');setDialog({kind:'suspect',id})}
 async function ask(message=question){if(!message.trim()||dialog?.kind!=='suspect'||busyRef.current||recovery.blocked||!dataRef.current?.viewer.canControl)return;const suspectId=dialog.id,sessionId=dataRef.current?.state.id;const next=await run({type:'interrogate',suspectId,message:message.trim()});const currentDialog=viewRef.current.dialog;if(next&&next.state.id===sessionId&&dataRef.current?.state.id===sessionId&&currentDialog?.kind==='suspect'&&currentDialog.id===suspectId){const answer=next.state.dialogue.filter(d=>d.suspectId===suspectId&&d.kind==='answer').at(-1);setUtteranceKey(n=>n+1);setDialogueText(answer?.text||'Your question has been recorded.');setQuestion('')}}
 async function fullScreen(){try{if(sceneRef.current){if(document.fullscreenElement)await document.exitFullscreen();else await sceneRef.current.requestFullscreen()}}catch{notify('Full screen is unavailable in this browser.')}}
 const controlsDisabled=busy||recovering;
 const tutorial=data?tutorialFor(data.state,data.viewer):null;
 const state=data?.state,viewer=data?.viewer,preview=!!state&&(publicHome||!state.suspects.length),shownSuspects=state?.suspects.length?state.suspects:PREVIEW_SUSPECTS,discovered=state?.evidence.filter(e=>e.discovered).length||0,activeEvidence=dialog?.kind==='evidence'?state?.evidence.find(e=>e.id===dialog.id):null,activeSuspect=dialog?.kind==='suspect'?state?.suspects.find(s=>s.id===dialog.id):null;
 const activeInspection=activeEvidence&&inspection?.id===activeEvidence.id&&inspection.sessionId===state?.id?inspection:null;
 const inspectionPending=activeInspection?.status==='moving'||activeInspection?.status==='inspecting';
 const hasLiveFacilitatorAccess=state?.mode==='live'&&viewer?.role==='admin';
 const showFacilitatorAccess=hasLiveFacilitatorAccess&&!participantEntry;
 const engineLabel=state?.engine==='recorded'?'RECORDED WORKSHOP':state?.engine==='local'?(state.relayOnline?'LOCAL AI · QWEN':'SCRIPTED FALLBACK'):state?.engine==='openai'?'CONNECTED AI':'RULES ENGINE';
 return <div className="app-shell game-shell console-shell">{(busy||!data)&&<div className="loading-line" role="progressbar" aria-label="Synchronizing investigation"/>}<aside className="sidebar"><button className="brand-mark" aria-label="Case Closed home" onClick={()=>setTab('investigation')}><Fingerprint size={18}/></button><nav className="side-nav" aria-label="Main navigation">{NAV.map(n=><button key={n.id} className={`nav-item ${tab===n.id?'active':''}`} aria-current={tab===n.id?'page':undefined} onClick={()=>setTab(n.id)}><n.icon/><span>{n.label}</span></button>)}</nav><div className="sidebar-bottom"><span>OPENAI STUDENT COLLECTIVE</span><i className="tiny-status"/><button className="avatar" aria-label="Your event access" onClick={()=>setDialog({kind:'login'})}>{viewer&&viewer.role!=='guest'?viewer.name.split(' ').slice(0,2).map(n=>n[0]).join(''):'CC'}</button></div></aside>
 <header className="topbar"><div className="brand"><div><div className="brand-name">CASE CLOSED<span style={{color:'#6ccdcc'}}>.</span></div><div className="brand-sub">AN AI MURDER MYSTERY</div></div><div className="top-divider"/><div className="case-number">CASEFILE / 001<br/><span style={{color:'#5e8288',fontSize:8}}>ASTER RESEARCH LAB</span></div></div><div className="top-actions"><span className={`connection ${connection==='offline'?'error':''}`}><i className="dot"/>{connection==='synced'?'Case synced':connection==='offline'?'Reconnecting':'Connecting'}</span><span className="pill"><Users size={11}/>{state?.participants.length||0} / 50</span><button className="button secondary small" onClick={()=>setDialog({kind:'login'})}><LogIn/>{viewer?.role==='guest'||state?.mode!=='live'?'Join event':viewer?.name.split(' ')[0]||'Join event'}</button></div></header>
 <main className="content">
 {error&&<div className="error-banner" role="alert"><CircleHelp/><span>{error}</span><button className="subtle-action" onClick={()=>{setError('');void load()}} style={{color:'inherit'}}><RefreshCw/>Retry sync</button><button className="subtle-action" aria-label="Dismiss error" onClick={()=>setError('')} style={{color:'inherit'}}><X/></button></div>}
 {connection==='offline'&&data&&<div className="error-banner"><RefreshCw/><span>{recovering?'Checking the last action. New actions are paused until the case is confirmed.':'Connection interrupted. You’re seeing the last synced state.'}</span><button className="subtle-action" style={{color:'inherit'}} onClick={()=>void load()}>Reconnect</button></div>}
 {!data?<section className="panel loading-map"><div className="stack" style={{alignItems:'center'}}><Crosshair size={27}/><span>Opening casefile 001…</span>{connection==='offline'&&<button className="button secondary" onClick={()=>void load()}>Retry connection</button>}</div></section>:<>
 <InvestigationGame data={data} soloEntry={publicHome} preview={preview} suspects={shownSuspects} position={viewer!.canControl?localPosition:state!.avatar} busy={controlsDisabled||movementPaused} movementPending={movementPending} clockOffset={offset.current} hasDialog={!!dialog||tab!=='investigation'} connection={connection} engineLabel={engineLabel} sceneRef={sceneRef} onMove={move} onInteract={interact} open={d=>{if(d.kind==='login')setPublicHome(false);playSfx('menu');if(d.kind==='login'&&state!.testSession)setEmail(TEST_PARTICIPANT_EMAIL);setDialog(d)}} openSuspect={openSuspect} startSample={()=>void (publicHome||state!.soloPlay?startSolo():startSample())} fullScreen={()=>void fullScreen()} changeTab={setTab} run={run} onOpenMenu={closeDialog} onDrawerChange={trackDrawer}/>
 {tab!=='investigation'&&<section className="game-page-overlay" aria-label={tab}><div className="game-page-heading"><span>{tab.toUpperCase()}</span><button className="pixel-return" onClick={()=>{playSfx('close');setTab('investigation')}}><X size={16}/> RETURN TO GAME</button></div><div className="game-page-content">
 {tab==='evidence'&&<div className="animate-in"><div className="section-title"><div><h2>The evidence board</h2><p>{discovered} of 5 clues discovered. Inspect objects on the map to reveal their contents.</p></div><span className="pill"><FolderClosed size={12}/> CASEFILE 001</span></div><div className="callout evidence-deduction-guide"><strong>Compare the records</strong><p>Compare access clearance, badge marking and docket tab across records; one clue alone does not identify a person.</p></div><div className="evidence-grid">{state!.evidence.map((e,i)=><button className="evidence-card" key={e.id} onClick={()=>setDialog({kind:'evidence',id:e.id})}><span className="evidence-card-art"><span className="tag">EVIDENCE / 0{i+1}</span><EvidenceIcon id={e.id}/></span><span className="evidence-card-copy"><h3>{e.title}</h3><p>{e.discovered?e.description:`A point of interest in the ${e.room.toLowerCase()}. Move the detective next to it to investigate.`}</p><span className={`pill ${e.discovered?'green':''}`}>{e.discovered?<Check size={11}/>:<LockKeyhole size={11}/>} {e.discovered?'DISCOVERED':e.room.toUpperCase()}</span></span></button>)}</div><div className="callout" style={{marginTop:24}}>A clue becomes part of the shared state only when it is discovered. The evidence file stays consistent for every investigator.</div></div>}
 {tab==='suspects'&&<div className="stack animate-in">{viewer!.role==='suspect'&&<SuspectWorkspace key={viewer!.id} state={state!} viewer={viewer!} run={run} busy={controlsDisabled} offset={offset.current} notify={notify} onReady={()=>setTab('investigation')}/>}<div className="section-title" style={{marginBottom:0}}><div><h2>{preview?'Meet the sample cast':'Persons of interest'}</h2><p>{preview?'Start a sample investigation to discover their stories.':'A public alibi is a starting point. Ask the question that opens a different story.'}</p></div><span className="pill soft">{shownSuspects.length} DOSSIERS</span></div><div className="three-column">{shownSuspects.map((s,i)=><section key={s.id} className="profile-card"><div className="profile-header"><Portrait color={s.color} index={i}/><div><h3>{s.name}</h3><p>{s.occupation}</p></div></div><div className="profile-casting"><strong>{getCastProfile(s.id,i)?.signature}</strong><p>{getCastProfile(s.id,i)?.knownFor}</p></div><StaffCredential profile={s.accessProfile}/><div className="profile-label">{preview?'CASE PREVIEW':'PUBLIC ALIBI'}</div><div className="profile-alibi">{preview?'Everyone at Aster Research Lab has something to hide. Enter the sample case to hear this character’s alibi.':`“${s.publicAlibi||'Awaiting character submission.'}”`}</div><div className="detail-row"><span>Character status</span><strong>{preview?'Sample cast':s.approved?'Ready for questioning':'Pending review'}</strong></div><div className="detail-row"><span>Written by</span><strong>{s.writerName||'Workshop participant'}</strong></div><button className="button secondary" onClick={()=>openSuspect(s.id)} disabled={!preview&&(!s.approved||(viewer!.canControl&&(state!.phase!==3&&state!.phase!==4)))}><MessageSquare/>{preview?'Explore sample':viewer!.canControl?'Question by radio':'Read public alibi'}<ArrowRight/></button></section>)}</div>{state!.phase>=5&&<Ballot state={state!} viewer={viewer!} run={run} busy={controlsDisabled} onJoin={()=>setDialog({kind:'login'})} onComplete={()=>{closeDialog();setTab('learning')}} onReturnToInvestigation={()=>{closeDialog();setTab('investigation')}}/>}</div>}
 {tab==='facilitator'&&<Facilitator state={state!} viewer={viewer!} run={run} busy={controlsDisabled} offset={offset.current} onJoin={()=>setDialog({kind:'login'})} onOpenGame={()=>{closeDialog();setTab('investigation')}} onOpenRehearsal={()=>setDialog({kind:'rehearsal'})} notify={notify}/>}
 {tab==='learning'&&<Learning state={state!} viewer={viewer!} run={run} busy={controlsDisabled}/>} {tab==='credits'&&<Credits state={state!} viewer={viewer!} run={run} busy={controlsDisabled} notify={notify} onPlay={()=>{closeDialog();setTab('investigation')}}/>}
 </div></section>}
 </>}
 <footer className="bottom-note"><span><ShieldCheck/>{state?.engine==='recorded'?(state.lastAIStatus||'Recorded workshop · works while the host is offline'):state?.engine==='local'?(state.lastAIStatus||'Local AI · character context isolated'):state?.engine==='openai'?'Connected AI · character context isolated':'Rules engine · no paid model API'}<span className="desktop-only"> · Truth lives in the case state.</span></span><span className="footer-brand">A CASE BY THE COLLECTIVE</span></footer></main>
 {tutorial&&!dialog&&<TutorialCard key={tutorial.key} tutorial={tutorial} onHelp={()=>setDialog({kind:'help'})}/>}
 {toast&&<div className="toast" role="status"><CheckCheck/>{toast}</div>}
 {dialog?.kind==='rehearsal'&&<RehearsalDialog data={data} invites={rehearsalInvites} invitation={rehearsalInvitation} name={rehearsalName} setName={setRehearsalName} busy={controlsDisabled} error={error} onCreate={count=>void createRehearsal(count)} onRefresh={()=>void run({type:'refreshRehearsalInvites'})} onJoin={()=>void joinRehearsal()} onClose={closeByUser} notify={notify}/>}
 {dialog?.kind==='facilitator'&&<Modal label="Facilitator access" onClose={closeByUser}><div className="modal-content facilitator-access-result"><div className="large-icon"><ShieldCheck/></div><div className="eyebrow">LIVE WORKSHOP / FACILITATOR ACCESS</div><h2>{facilitatorAccess==='denied'?'This account isn’t registered.':'We couldn’t open your controls.'}</h2><p>{facilitatorAccess==='denied'?'Your ChatGPT sign-in worked, but this account is not registered as a facilitator. Use one of the two registered facilitator accounts.':'Facilitator access could not be confirmed. Try signing in again with your registered ChatGPT account. If this continues, ask the event owner to check the workshop setup.'}</p><button className="button full" onClick={()=>setDialog({kind:'login'})}><LogIn/>Return to email sign-in<ArrowRight/></button><button className="button secondary full" style={{marginTop:15}} onClick={closeByUser}>Return to the game</button></div></Modal>}
 {dialog?.kind==='login'&&<Modal label={showFacilitatorAccess?'Facilitator access':'Join Case Closed'} onClose={closeByUser}><div className="modal-content player-entry"><div className="eyebrow">CASE CLOSED / {showFacilitatorAccess?'FACILITATOR ACCESS':'PLAYER ACCESS'}</div><h2>{showFacilitatorAccess?'Your controls are ready.':'Welcome to Case Closed.'}</h2><p>{showFacilitatorAccess?'Signed in as '+viewer!.name+'. You can manage the live workshop.':'Enter your registered email to continue.'}</p>{error&&<div className="error-banner" role="alert">{error}</div>}
  {showFacilitatorAccess?<button className="button full" onClick={()=>{closeDialog();setTab('facilitator')}}><ShieldCheck/>Open facilitator controls<ArrowRight/></button>:<form {...(isFacilitatorEmail(email)?{action:FACILITATOR_ENTRY,method:'get',target:'_top'}:{onSubmit:login})}><div className="field"><label htmlFor="login-email">Registered email address</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required maxLength={200}/></div>{isTestParticipantEmail(email)&&<fieldset className="participant-test-options" disabled={controlsDisabled}><legend>PARTICIPANT TEST · PRIVATE CASE</legend><p>Try a normal participant role with a fictional roster. This does not join or change the live workshop.</p><label><input type="radio" name="test-role" checked={testRole==='detective'} onChange={()=>setTestRole('detective')}/><span><strong>Detective</strong><small>Play the opening, follow the writing phase, then investigate.</small></span></label><label><input type="radio" name="test-role" checked={testRole==='suspect'} onChange={()=>setTestRole('suspect')}/><span><strong>Suspect writer</strong><small>Play the opening, write for six minutes, then investigate.</small></span></label></fieldset>}<button className="button full" disabled={controlsDisabled}><LogIn/>{busy?'Joining…':isTestParticipantEmail(email)?'Start participant test':isFacilitatorEmail(email)?'Continue to facilitator access':'Join live workshop'}<ArrowRight/></button></form>}
  {showFacilitatorAccess&&<button className="button secondary full" style={{marginTop:15}} disabled={controlsDisabled} onClick={()=>{setParticipantEntry(true);setEmail(TEST_PARTICIPANT_EMAIL)}}>Test a participant role<ArrowRight/></button>}
  {hasLiveFacilitatorAccess&&participantEntry&&<button className="subtle-action" style={{marginTop:15}} onClick={()=>setParticipantEntry(false)}>Back to my facilitator access</button>}
  {!hasLiveFacilitatorAccess&&viewer?.role!=='guest'&&(state?.mode==='live'||state?.testSession)&&<button className="subtle-action" disabled={controlsDisabled} style={{marginTop:17,display:'flex'}} onClick={()=>void logoutParticipant()}>{state?.testSession?'Leave participant test':'Leave participant session'}</button>}
 </div></Modal>}
 {dialog?.kind==='sample'&&<Modal label="Explore the sample case" onClose={closeDialog}><div className="modal-content"><div className="large-icon"><Crosshair/></div><div className="eyebrow">A CASE OF YOUR OWN</div><h2>The lab is waiting.</h2><p>Explore a private sample with six fictional suspects, five pieces of evidence, and the complete investigation flow. Collect the five clues, question the suspects, then make your accusation and reveal the full story.</p><div className="callout" style={{margin:'22px 0'}}>Your sample is isolated from the live workshop. It runs with the rules engine unless the host’s local AI relay is connected.</div><button className="button full" disabled={controlsDisabled} onClick={()=>void startSample()}><Crosshair/>{busy?'Preparing your case…':'Start sample investigation'}<ArrowRight/></button></div></Modal>}
 {dialog?.kind==='help'&&<Modal label="How to play" onClose={closeDialog}><HowToPlay tutorial={tutorial}/></Modal>}
 {dialog?.kind==='officer'&&<Modal pixel label="Officer briefing" onClose={closeDialog}><div className="dialogue-header"><Portrait color="#6e9cc9" index={6}/><div><h2>Officer Sharma</h2><p>SCENE COORDINATOR / ASTER LAB</p></div></div><div className="dialogue-content"><Typewriter voiceIndex={6} text={`“${crimeContext(state?.opening.scriptVersion)} Start with the broken smartwatch. The lab remembers more than the people do.”`}/><div className="dialogue-meta"><span>PUBLIC CRIME CONTEXT</span><ShieldCheck size={12}/></div></div></Modal>}
 {dialog?.kind==='stress'&&state&&viewer&&<Modal label="Adversarial playground" wide onClose={closeDialog}><div className="modal-content"><StressLab state={state} viewer={viewer} run={run} busy={controlsDisabled}/></div></Modal>}
 {dialog?.kind==='ballot'&&state&&viewer&&<Modal label="The final accusation" wide onClose={closeDialog}><div className="modal-content">{state.revealed?<RevealPanel state={state}/>:<Ballot state={state} viewer={viewer} run={run} busy={controlsDisabled} onJoin={()=>setDialog({kind:'login'})} onComplete={()=>{closeDialog();setTab('learning')}} onReturnToInvestigation={()=>{closeDialog();setTab('investigation')}}/>}</div></Modal>}
 {activeEvidence&&<Modal label={activeEvidence.title} onClose={closeDialog}><div className="modal-evidence-art"><EvidenceIcon id={activeEvidence.id}/></div><div className="modal-content"><div className="eyebrow">CASEFILE 001 / EVIDENCE RECORD</div><h2>{activeEvidence.title}</h2>{inspectionPending&&!activeEvidence.discovered?<div className="evidence-inspection-feedback" role="status" aria-live="polite"><Search/><div><strong>Inspecting {activeEvidence.title.toLowerCase()}…</strong><p>{activeInspection?.status==='moving'?'Finishing your approach to the object.':'Checking the object and recording the clue.'}</p></div></div>:<p>{(activeEvidence.discovered||state?.revealed)?activeEvidence.description:activeInspection?.status==='failed'?'The inspection could not be confirmed. Your evidence file has not changed.':`This item has not been inspected. Find it in the ${activeEvidence.room.toLowerCase()} and move the detective next to it.`}</p>}{activeInspection?.status==='failed'&&!activeEvidence.discovered&&<div className="inspection-failed" role="alert"><p>{error||'Move next to the object and try again.'}</p><button className="button secondary" disabled={controlsDisabled} onClick={()=>interact({type:'evidence',id:activeEvidence.id,label:activeEvidence.title})}><RefreshCw/>Retry inspection</button></div>}<div className="detail-row"><span>Location</span><strong>{activeEvidence.room}</strong></div><div className="detail-row"><span>Status</span><strong className="accent">{activeEvidence.discovered?'Added to your case file':state?.revealed?'Unsealed with the solution':inspectionPending?'Inspection in progress':activeInspection?.status==='failed'?'Inspection not confirmed':'Undiscovered'}</strong></div><div className="detail-row"><span>Investigative relevance</span><strong>{activeEvidence.discovered?'Worth questioning':'Unassessed'}</strong></div>{(activeEvidence.discovered||state?.revealed)&&activeEvidence.significance&&<div className="callout" style={{marginTop:20}}>{activeEvidence.significance}</div>}<button className="button secondary full" style={{marginTop:23}} onClick={()=>{closeDialog();setTab('investigation')}}><Crosshair/>Return to the crime scene</button></div></Modal>}
 {activeSuspect&&<InterrogationDialog key={activeSuspect.id} suspect={activeSuspect} index={state!.suspects.findIndex(s=>s.id===activeSuspect.id)} text={dialogueText} utteranceKey={utteranceKey} question={question} setQuestion={setQuestion} onAsk={q=>void ask(q)} busy={busy} disabled={recovering||!activeSuspect.approved||!viewer?.canControl||(state?.phase!==3&&state?.phase!==4)} readOnlyReason={recovering?'Confirming the last action. Reconnect before asking another question.':!activeSuspect.approved?'Character awaiting facilitator review':!viewer?.canControl?'Watching the shared investigation':'Questioning is open in phases 03 and 04'} error={error} engineLabel={engineLabel} clueCount={state!.evidence.filter(e=>e.discovered).length} mode={state!.rehearsal?'live':state!.mode} participantTest={state!.testSession} guest={viewer?.role==='guest'} onJoin={()=>setDialog({kind:'login'})} onClose={closeDialog}/>}
 </div>
}
