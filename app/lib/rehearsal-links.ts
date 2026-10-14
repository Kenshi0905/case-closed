export type RehearsalInvitation={roomId:string;token:string};
export function readRehearsalInvitation(url:URL):RehearsalInvitation|null{
 const roomId=url.searchParams.get('rehearsal'),token=url.searchParams.get('invite');
 return roomId&&token?{roomId,token}:null;
}
export function rehearsalSeatLink(origin:string,roomId:string,token:string):string{
 const url=new URL('/',origin);url.searchParams.set('rehearsal',roomId);url.searchParams.set('invite',token);return url.toString();
}
export function withoutRehearsalInvitation(url:URL):string{
 const next=new URL(url);next.searchParams.delete('rehearsal');next.searchParams.delete('invite');return next.pathname+next.search+next.hash;
}
