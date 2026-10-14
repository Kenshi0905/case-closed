import { body, failure, json } from '../../lib/server/http';
import { joinRehearsal } from '../../lib/server/rehearsal';
import { rateLimit } from '../../lib/server/store';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const input=await body(request);await rateLimit(request,'rehearsal-join',24,60000);
 const result=await joinRehearsal(request,input);return json(result.data,200,result.cookie);
}catch(error){return failure(error)}}
