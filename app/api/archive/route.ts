import { AppError, requireAdmin } from '../../lib/server/engine';
import { context } from '../../lib/server/store';
import { failure, json } from '../../lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const ctx=await context(request);requireAdmin(ctx.actor);if(ctx.event.mode==='replay')throw new AppError('Replay visitors cannot download private authoring records.',403);if(!ctx.event.revealed)throw new AppError('The conversation archive unlocks after the reveal.',403);const data={format:'case-closed-dialogue-archive',version:1,title:ctx.event.title,exportedAt:new Date().toISOString(),characters:ctx.event.suspects.filter(s=>s.approved).map(s=>({id:s.id,writerName:s.writerName,prompt:s.prompt})),recordings:ctx.event.dialogueArchive??[]};const response=json(data);response.headers.set('Content-Disposition','attachment; filename="case-closed-dialogue-archive.json"');return response;}catch(error){return failure(error)}}
