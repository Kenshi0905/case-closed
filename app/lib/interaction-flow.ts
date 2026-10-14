export type InspectionStatus='moving'|'inspecting'|'done'|'failed';
/** Open feedback synchronously; only the server response can finish an inspection. */
export function createEvidenceInspector(){
 let generation=0;
 return{
  cancel(){generation++;},
  async inspect(options:{open:()=>void;waitForMovement:()=>Promise<unknown>;isCurrentSession:()=>boolean;discover:()=>Promise<boolean>;status:(status:InspectionStatus)=>void}){
   const token=++generation,current=()=>token===generation&&options.isCurrentSession();
   options.open();options.status('moving');
   try{
    await options.waitForMovement();if(!current())return;
    options.status('inspecting');const accepted=await options.discover();if(!current())return;
    options.status(accepted?'done':'failed');
   }catch{if(current())options.status('failed');}
  },
 };
}
export type MovementQueue={pending:number;generation:number;tail:Promise<void>};
export function createMovementQueue():MovementQueue{return{pending:0,generation:0,tail:Promise.resolve()};}
/** A two-step lookahead bounds interaction waiting time without dropping ordered tile writes. */
export function enqueueMovement(queue:MovementQueue,send:()=>Promise<boolean>,callbacks:{pending:(count:number)=>void;failed:()=>void;idle:()=>void},limit=2):boolean{
 if(queue.pending>=limit)return false;
 const generation=queue.generation;queue.pending++;callbacks.pending(queue.pending);
 queue.tail=queue.tail.then(async()=>{if(generation!==queue.generation)return;try{if(await send())return;}catch{}queue.generation++;callbacks.failed();}).finally(()=>{queue.pending--;callbacks.pending(queue.pending);if(queue.pending===0)callbacks.idle();});
 return true;
}

export type MovementPosition={x:number;y:number};
export type MovementPath={from:MovementPosition;path:MovementPosition[]};
type MovementCallbacks={pending:(count:number)=>void;failed:()=>void;idle:()=>void};
export const MOVEMENT_BUFFER_LIMIT=32;
export const MOVEMENT_BATCH_LIMIT=16;
export type MovementPathQueue={pending:number;generation:number;tail:Promise<void>;buffer:MovementPosition[];active:number;running:boolean;cancelled:boolean;onPending?:MovementCallbacks['pending']};
export function createMovementPathQueue():MovementPathQueue{return{pending:0,generation:0,tail:Promise.resolve(),buffer:[],active:0,running:false,cancelled:false}};
/** Drop only unsent steps. An in-flight write still settles before the drain promise resolves. */
export function cancelMovementPath(queue:MovementPathQueue){
 queue.generation++;queue.cancelled=queue.running;queue.buffer=[];queue.pending=queue.active;queue.onPending?.(queue.pending);
}
/** One request in flight, one bounded coalesced buffer; the same drain covers every batch. */
export function enqueueMovementPath(queue:MovementPathQueue,position:MovementPosition,from:MovementPosition,send:(movement:MovementPath)=>Promise<boolean>,callbacks:MovementCallbacks):boolean{
 if(queue.cancelled||queue.pending>=MOVEMENT_BUFFER_LIMIT)return false;
 queue.buffer.push({...position});queue.pending++;queue.onPending=callbacks.pending;callbacks.pending(queue.pending);
 if(queue.running)return true;
 queue.running=true;const generation=queue.generation;let origin={...from};let finish!:()=>void;
 queue.tail=new Promise<void>(resolve=>{finish=resolve});
 void(async()=>{
  try{
   while(queue.buffer.length&&generation===queue.generation){
    const path=queue.buffer.splice(0,MOVEMENT_BATCH_LIMIT);queue.active=path.length;
    let accepted=false;try{accepted=await send({from:{...origin},path})}catch{}
    queue.active=0;queue.pending-=path.length;callbacks.pending(queue.pending);
    if(generation!==queue.generation)break;
    if(!accepted){cancelMovementPath(queue);callbacks.failed();break}
    origin={...path[path.length-1]};
   }
  }finally{
   queue.buffer=[];queue.active=0;queue.pending=0;queue.running=false;queue.cancelled=false;
   callbacks.pending(0);callbacks.idle();finish();
  }
 })();
 return true;
}

/** Polls confirm progress but must not pull an actively predicted avatar backwards. */
export function reconcileMovementPosition(predicted:MovementPosition,confirmed:MovementPosition,pending:number):MovementPosition{return pending>0?predicted:{...confirmed}}
