import { context, responseState } from '../../lib/server/store';
import { failure, json } from '../../lib/server/http';
import { retryStateRead } from '../../lib/server/state-read-retry';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const data=await retryStateRead(async()=>{
   const ctx=await context(request);
   return responseState(ctx,ctx.actor);
  });
  return json(data);
 }catch(error){return failure(error)}
}
