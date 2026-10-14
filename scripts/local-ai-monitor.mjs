import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const STATUS_FILE=fileURLToPath(new URL('../local-ai/status/relay-status.json',import.meta.url));
const STAGES=new Set(['received','generating','cached','delivering','delivered','fallback','rejected','expired','delivery-unknown','interrupted']);
const RELAY_STATES=new Set(['starting','connected','retrying','stopped','access-denied']);
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').slice(0,max):'';
async function writeStatus(filename,value){await fs.writeFile(filename+'.tmp',JSON.stringify(value));await fs.rename(filename+'.tmp',filename);}
/** Only this explicit projection reaches the loopback page; never write job tokens or character-private fields. */
export function createRelayMonitor({filename=STATUS_FILE,write=writeStatus,now=Date.now}={}){
 const state={version:1,updatedAt:now(),relay:'starting',active:null,recent:[]};let sequence=0,lastSaved=0,tail=Promise.resolve();
 function save(force=true){const time=now();state.updatedAt=time;if(!force&&time-lastSaved<5000)return;lastSaved=time;const copy=structuredClone(state);tail=tail.then(()=>write(filename,copy)).catch(()=>{});}
 function update(stage,metrics={}){if(!state.active||!STAGES.has(stage))return;state.active.stage=stage;for(const key of ['modelLatencyMs','deliveryLatencyMs'])if(Number.isFinite(metrics[key])&&metrics[key]>=0)state.active[key]=Math.round(metrics[key]);if(['local','scripted','cache'].includes(metrics.source))state.active.source=metrics.source;}
 return{
  heartbeat(status='connected'){if(!RELAY_STATES.has(status))return;const changed=state.relay!==status;state.relay=status;save(changed);},
  begin(job){state.active={sequence:++sequence,suspect:text(job.characterName,100),question:text(job.question,1000)||'Question text unavailable for this older job.',stage:'received',startedAt:now()};save();},
  stage(stage,metrics){update(stage,metrics);save();},
  finish(stage,metrics){if(!state.active)return;update(stage,metrics);state.active.finishedAt=now();state.recent.push(state.active);state.recent=state.recent.slice(-12);state.active=null;save();},
  stop(){if(state.active){update('interrupted');state.active.finishedAt=now();state.recent.push(state.active);state.recent=state.recent.slice(-12);state.active=null;}state.relay='stopped';save();},
  snapshot(){return structuredClone(state)},
  flush(){return tail},
 };
}
