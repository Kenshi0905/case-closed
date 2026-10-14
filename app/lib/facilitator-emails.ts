/** These emails identify the two organizer seats; server-verified Sites identity is still required. */
export const PRIMARY_FACILITATOR_EMAIL='ashmitavash@gmail.com';
export const SECONDARY_FACILITATOR_EMAIL='gouravduttagd7@gmail.com';
export const FACILITATOR_EMAILS=[PRIMARY_FACILITATOR_EMAIL,SECONDARY_FACILITATOR_EMAIL] as const;
export function isFacilitatorEmail(value:unknown){return typeof value==='string'&&FACILITATOR_EMAILS.some(email=>email===value.trim().toLowerCase());}
