import type { CaseAccessProfile } from '../lib/contracts';
/** All dossier credentials receive identical treatment; comparison belongs to the player. */
export function StaffCredential({profile}:{profile?:CaseAccessProfile}){
 return <section className="staff-credential" aria-label="Staff credential"><h4>Staff credential</h4>{profile?<dl><div><dt>Access clearance</dt><dd>{profile.clearance}</dd></div><div><dt>Badge marking</dt><dd>{profile.badgeMark}</dd></div><div><dt>Docket tab</dt><dd>{profile.docketGroup}</dd></div></dl>:<p>Available when the case begins.</p>}</section>;
}
