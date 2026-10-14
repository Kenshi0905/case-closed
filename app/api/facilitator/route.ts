import { context, providerIdentity, revokeSession } from '../../lib/server/store';
export const dynamic='force-dynamic';
function redirect(request:Request,path:string,cookie?:string){return new Response(null,{status:303,headers:{Location:new URL(path,request.url).toString(),'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});}
/** A provider return always resolves the live event; a practice cookie cannot mask facilitator identity. */
export async function GET(request:Request){
 if(!providerIdentity(request))return redirect(request,'/signin-with-chatgpt?return_to=%2Fapi%2Ffacilitator');
 try{
  const ctx=await context(request,{live:true});
  if(ctx.actor.role!=='admin')return redirect(request,'/?facilitator=denied');
  const cookie=await revokeSession(request);
  return redirect(request,'/?facilitator=ready',cookie);
 }catch{return redirect(request,'/?facilitator=error');}
}
