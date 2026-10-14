/** A request includes reading its body: a stalled JSON response must time out too. */
export const ACTION_TIMEOUT_MS=20_000;
export const STATE_TIMEOUT_MS=8_000;
export const MOVE_TIMEOUT_MS=8_000;
export class RequestTimeoutError extends Error {
 constructor(){super('The connection took too long. Checking the last confirmed case state…');this.name='RequestTimeoutError';}
}
export class RequestRejectedError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='RequestRejectedError';}
}
export class RecoveryRequiredError extends Error {
 constructor(){super('Confirming the case state before another action. Use Reconnect if the connection is still interrupted.');this.name='RecoveryRequiredError';}
}
export function isUncertainWrite(error:unknown):boolean {
 return !(error instanceof RecoveryRequiredError)&&!(error instanceof RequestRejectedError&&error.status>=400&&error.status<500);
}
export async function requestJson<T>(url:string,init:RequestInit={},timeoutMs=STATE_TIMEOUT_MS,fetcher:typeof fetch=fetch):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new RequestTimeoutError());controller.abort()},timeoutMs)});
 const request=(async()=>{
  const response=await fetcher(url,{...init,signal:controller.signal});
  const value=await response.json() as T&{error?:string};
  if(!response.ok)throw new RequestRejectedError(value.error||'This request could not be completed.',response.status);
  return value;
 })();
 try{return await Promise.race([request,deadline])}finally{clearTimeout(timer)}
}
/** Never repeats a write. An uncertain result permits only an authoritative read until it succeeds. */
export function createActionRecovery<T>(options:{read:()=>Promise<T>;blocked:()=>void;recovered:(state:T)=>void;failed:(error:unknown)=>void}){
 let blocked=false,generation=0,refresh:Promise<boolean>|null=null;
 const synchronize=():Promise<boolean>=>{
  if(refresh)return refresh;
  refresh=Promise.resolve().then(options.read).then(state=>{options.recovered(state);blocked=false;return true},error=>{options.failed(error);return false}).finally(()=>{refresh=null});
  return refresh;
 };
 return{
  get blocked(){return blocked},
  synchronize,
  async write<R>(request:()=>Promise<R>,beforeSend?:()=>Promise<unknown>,reconcileRejection=false):Promise<R>{
   if(blocked)throw new RecoveryRequiredError();
   const started=generation;
   if(beforeSend)await beforeSend();
   if(blocked||started!==generation)throw new RecoveryRequiredError();
   try{return await request()}catch(error){
    if(isUncertainWrite(error)||reconcileRejection){
     blocked=true;generation++;options.blocked();void synchronize();
    }
    throw error;
   }
  },
 };
}
