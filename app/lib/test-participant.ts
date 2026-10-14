/** A local workshop fixture identity, not a mailbox or a facilitator account. */
export const TEST_PARTICIPANT_EMAIL='testuser@gmail.com';
export type TestParticipantRole='detective'|'suspect';
export const isTestParticipantEmail=(value:string)=>value.trim().toLowerCase()===TEST_PARTICIPANT_EMAIL;
