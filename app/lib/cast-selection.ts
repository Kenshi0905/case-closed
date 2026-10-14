/** Keep a manual cast unique, current-roster-only, and within its requested size. */
export function normalizeCastSelection(selected:readonly string[],rosterIds:readonly string[],count:5|6):string[]{
 const valid=new Set(rosterIds);return [...new Set(selected)].filter(id=>valid.has(id)).slice(0,count);
}
export function toggleCastSelection(selected:readonly string[],id:string,rosterIds:readonly string[],count:5|6):string[]{
 const current=normalizeCastSelection(selected,rosterIds,count);
 if(current.includes(id))return current.filter(value=>value!==id);
 return current.length<count&&rosterIds.includes(id)?[...current,id]:current;
}
