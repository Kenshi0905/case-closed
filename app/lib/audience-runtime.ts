/** Read-only maps need fewer ambient frames; movement and active control remain responsive. */
export function audienceFrameDelay(canControl:boolean,hidden:boolean,motionActive:boolean):number|null{
 if(hidden)return null;return canControl?0:motionActive?Math.round(1000/15):250;
}
/** One visible snapshot read at a time. Hidden tabs have no polling timer. */
export function createVisiblePoller(options:{visible:()=>boolean;busy:()=>boolean;poll:()=>Promise<unknown>;interval?:number;schedule?:(callback:()=>void,ms:number)=>ReturnType<typeof setTimeout>;cancel?:(timer:ReturnType<typeof setTimeout>)=>void}){
 const schedule=options.schedule??setTimeout,cancel=options.cancel??clearTimeout,interval=options.interval??2000;
 let timer:ReturnType<typeof setTimeout>|null=null,running=false,disposed=false;
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}};
 const plan=(delay:number)=>{clear();if(!disposed&&options.visible())timer=schedule(()=>void tick(),delay)};
 async function tick(){
  timer=null;if(disposed||!options.visible())return;
  if(running||options.busy()){plan(interval);return}
  running=true;try{await options.poll()}catch{}finally{running=false;plan(interval)}
 }
 return{start:()=>plan(0),visibilityChanged:()=>options.visible()?plan(0):clear(),dispose:()=>{disposed=true;clear()}};
}
