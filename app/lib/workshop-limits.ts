/** Shared bounds for setup forms and authoritative server validation. */
export const PLANNING_DURATION_SECONDS = 6 * 60;
export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 50;
export const MIN_REHEARSAL_PARTICIPANTS = 8;
export const MAX_REHEARSAL_PARTICIPANTS = 15;
export const DEFAULT_REHEARSAL_PARTICIPANTS = 8;
export const REHEARSAL_WRITERS = 6;
export function isParticipantCount(value: unknown): value is number {
 return typeof value === 'number' && Number.isInteger(value) && value >= MIN_PARTICIPANTS && value <= MAX_PARTICIPANTS;
}
export function isRehearsalParticipantCount(value: unknown): value is number {
 return typeof value === 'number' && Number.isInteger(value) && value >= MIN_REHEARSAL_PARTICIPANTS && value <= MAX_REHEARSAL_PARTICIPANTS;
}
