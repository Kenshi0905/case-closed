import { authorizeRelay, claimJob, completeJob, heartbeat } from '../../lib/server/store';
import { body, failure, json } from '../../lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{authorizeRelay(request);return json({job:await claimJob(),pollAfterMs:1000});}catch(error){return failure(error)}}
export async function POST(request:Request){try{authorizeRelay(request);const input=await body(request);if(input.heartbeat===true){await heartbeat(input.model);return json({ok:true})}return json(await completeJob(input));}catch(error){return failure(error)}}
