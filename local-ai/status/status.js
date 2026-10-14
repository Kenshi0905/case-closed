const health = document.querySelector('#health');
const detail = document.querySelector('#detail');
const refresh = document.querySelector('#refresh');
let checking = false;
async function checkModel() {
  if (checking) return;
  checking = true; refresh.disabled = true;
  try {
    const response = await fetch('/health', {cache:'no-store',signal:AbortSignal.timeout(4000)});
    const data = await response.json();
    const ready = response.ok && data.status === 'ok';
    health.dataset.ready = String(ready);
    health.textContent = ready ? '● Model ready' : '◌ Model loading';
    detail.textContent = ready ? 'The local model is responding. Last checked ' + new Date().toLocaleTimeString() + '.' : 'The model is still starting. This page checks again automatically.';
  } catch {
    health.dataset.ready = 'false'; health.textContent = '○ Model not responding';
    detail.textContent = 'Open Start Local AI.cmd from your case-closed folder, then check again.';
  } finally { checking = false; refresh.disabled = false; }
}
refresh.addEventListener('click', () => {void checkModel();void checkRelay()});
document.addEventListener('visibilitychange', () => { if (!document.hidden) {void checkModel();void checkRelay()} });
setInterval(() => { if (!document.hidden) void checkModel(); }, 15000);
void checkModel();

const relayState=document.querySelector('#relay-state'),relayDetail=document.querySelector('#relay-detail'),activeJob=document.querySelector('#active-job'),recentJobs=document.querySelector('#recent-jobs');
const stageNames={received:'Received',generating:'Model working',cached:'Saved local reply',delivering:'Sending reply',delivered:'Delivered',fallback:'Scripted fallback delivered',rejected:'Output rejected by the game',expired:'Request expired', 'delivery-unknown':'Connection lost; delivery unconfirmed',interrupted:'Relay stopped during request'};
let readingRelay=false;
function jobElement(job,active=false){
 const item=document.createElement(active?'div':'li');item.className='job'+(active?' active-job':'');
 const title=document.createElement('strong');title.textContent=String(job.suspect||'Character');item.append(title);
 const meta=document.createElement('p');meta.className='job-meta';const parts=[stageNames[job.stage]||'Status unavailable'];if(job.source==='cache')parts.push('cached');if(Number.isFinite(job.modelLatencyMs))parts.push('model '+job.modelLatencyMs+' ms');if(Number.isFinite(job.deliveryLatencyMs))parts.push('delivery '+job.deliveryLatencyMs+' ms');if(Number.isFinite(job.startedAt))parts.push(new Date(job.startedAt).toLocaleTimeString());meta.textContent=parts.join(' · ');item.append(meta);
 const question=document.createElement('p');question.className='job-question';question.textContent=String(job.question||'Question text unavailable.');item.append(question);return item;
}
async function checkRelay(){
 if(readingRelay)return;readingRelay=true;
 try{
  const response=await fetch('/relay-status.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('No relay feed');const data=await response.json();if(data.version!==1||!Array.isArray(data.recent)||!Number.isFinite(data.updatedAt))throw Error('Invalid relay feed');
  const stale=Date.now()-data.updatedAt>45000;relayState.textContent=stale?'No recent heartbeat':data.relay==='connected'?'Relay connected':data.relay==='retrying'?'Reconnecting':data.relay==='stopped'?'Relay stopped':data.relay==='access-denied'?'Relay access denied':'Relay starting';
  relayDetail.textContent=stale?'The activity feed is over 45 seconds old. Check that the relay is running.':'Last relay update '+new Date(data.updatedAt).toLocaleTimeString()+'. Questions below are from this laptop’s relay.';
  activeJob.replaceChildren();if(data.active)activeJob.append(jobElement(data.active,true));else{const empty=document.createElement('p');empty.className='empty';empty.textContent='No active question. The relay is waiting for the next request.';activeJob.append(empty);}
  recentJobs.replaceChildren(...data.recent.slice(-12).reverse().map(job=>jobElement(job)));if(!data.recent.length){const empty=document.createElement('li');empty.className='empty';empty.textContent='No questions recorded since the relay started.';recentJobs.append(empty);}
 }catch{relayState.textContent='Activity feed unavailable';relayDetail.textContent='Start or restart the local relay to enable question monitoring. Model health is checked separately.';}
 finally{readingRelay=false;}
}
setInterval(()=>{if(!document.hidden)void checkRelay()},2000);
void checkRelay();
