export type OpeningSceneId = 'threshold' | 'preparation' | 'interruption' | 'trace' | 'corridor' | 'departure';
export type OpeningPanel = { id: OpeningSceneId; title: string; caption: string; flavor: string; choices: {id:string;label:string}[] };
export type OpeningPublic = { scriptVersion?:number; panelIndex:number; completed:boolean; panels:OpeningPanel[]; choices:Record<string,string> };
export type CaseStory = { title:string; motif:string; investigationLead:{evidenceId:string;title:string;question:string}; connections:{id:string;suspectIds:string[];prompt:string;reason:string}[]; summary:string; framing:string; suspectThreads:{suspectId:string;heading:string;text:string}[]; generatedAt:number; source:'story-bank'|'local-flavor' };
export type Phase = 1 | 2 | 3 | 4 | 5 | 6;
export type Role = 'guest' | 'admin' | 'suspect' | 'detective';
export type CharacterPrompt = { personality?:string; eventTimeline?:string; personalKnowledge?:string; secretEvidence?:'watch'|'logs'|'flask'|'camera'|'note'; disclosureHint?:string; characterName: string; occupation: string; relationship: string; publicAlibi: string; privateSecret: string; clueTriggers: string };
export type CaseAccessProfile = {clearance:'North wing'|'South wing';badgeMark:'single stripe'|'double stripe';docketGroup:'blue tab'|'brass tab'};
export type ParticipantPublic = { id: string; name: string; role: 'suspect' | 'detective'; suspectId?: string };
export type RehearsalPublic = { expiresAt:number; seats:(ParticipantPublic & {joined:boolean})[] };
export type RehearsalInvite = { participantId:string; role:'detective'|'suspect'; token:string };
export type SuspectPublic = { id: string; participantId: string | null; name: string; occupation: string; relationship: string; publicAlibi: string; accessProfile?:CaseAccessProfile; color: string; x: number; y: number; approved: boolean; writerName: string; suspicion: number };
export type EvidencePublic = { id: string; title: string; room: string; x: number; y: number; discovered: boolean; description: string; significance: string };
export type DialogueEntry = { id: string; speaker: string; suspectId?: string; text: string; kind: 'question' | 'answer' | 'system' | 'banter'; timestamp: number; clueId?: string; guarded?: boolean };
export type Reveal = { killerId: string; killerName: string; motive: string; explanation: string; timeline: { time: string; event: string }[]; redHerrings?:{suspectId:string;name:string;secret:string;explanation:string}[] };
export type Submission = { suspectId: string; participantId: string; prompt: CharacterPrompt; status: 'pending' | 'approved' };
export type GuardrailTest = { id: string; timestamp: number; suspectId: string; prompt: string; outcome: 'blocked' | 'passed'; reason: string };
export type Viewer = { id: string | null; name: string; role: Role; isOwner: boolean; canControl: boolean; hasVoted: boolean; suspectId?: string; ownPrompt?: CharacterPrompt; ownCaseRole?:'suspect'|'culprit' };
export type PublicState = { id: string; workshopStarted?:boolean; castReady?:boolean; title: string; phase: Phase; opening:OpeningPublic; story:CaseStory|null; phaseStartedAt: number; promptDeadline: number | null; suspectCount: number; participants: ParticipantPublic[]; suspects: SuspectPublic[]; evidence: EvidencePublic[]; dialogue: DialogueEntry[]; avatar: { x: number; y: number }; controllerId: string | null; pollOpen: boolean; revealed: boolean; reveal: Reveal | null; voteCounts: Record<string, number>; voteTotal: number; credits: { id: string; name: string; role: string }[]; published: boolean; replayAvailable: boolean; mode: 'live' | 'demo' | 'replay'; soloPlay?:boolean; testSession?:boolean; rehearsal?:RehearsalPublic; boundaryTestCount?:number; boundaryHistory?:GuardrailTest[]; engine: 'scripted' | 'openai' | 'local' | 'recorded'; aiMode:'local'|'scripted'; localAiAvailable?:boolean; archiveCount?: number; relayOnline?: boolean; lastAIStatus?: string; revision: number; admin?: { roster: (ParticipantPublic & { email: string })[]; submissions: Submission[]; facilitators: { id: string; name: string; email: string }[]; testLog: GuardrailTest[] } };
export type StateResponse = { state: PublicState; viewer: Viewer; serverTime: number; rehearsalInvites?:RehearsalInvite[] };
export type Action =
 | { type: 'startDemo'; opening?:boolean }
 | { type:'startRehearsal'; participantCount?:number }
 | { type:'refreshRehearsalInvites' }
 | { type: 'startSolo' | 'beginSoloInvestigation' | 'beginWriting' | 'beginBoundaryTest' | 'openingNext' | 'openingBack' | 'startReplay' | 'exitSession' | 'claimControl' | 'reveal' | 'publishReplay' | 'beginAccusation' | 'returnToInvestigation' | 'finishCase' }
 | { type:'transferControl';facilitatorId:string }
 | { type:'openingSelect';sceneId:OpeningSceneId;choiceId:string }
 | { type:'startWorkshop' }
 | { type:'addParticipant';name:string;email:string }
 | { type:'removeParticipant';participantId:string }
 | { type: 'importRoster'; entries: { name: string; email: string }[] }
 | { type:'setAiMode';mode:'local'|'scripted' }
 | { type: 'setFacilitator'; email: string; name: string }
 | { type: 'assignSuspects'; count: 5 | 6; participantIds?: string[] }
 | { type: 'setPhase'; phase: Phase }
 | { type: 'move'; x: number; y: number }
 | { type: 'movePath'; from: { x: number; y: number }; path: { x: number; y: number }[] }
 | { type: 'discover'; evidenceId: string }
 | { type: 'interrogate' | 'stressTest'; suspectId: string; message: string }
 | { type: 'submitPrompt'; prompt: CharacterPrompt }
 | { type: 'reviewPrompt'; suspectId: string; prompt?: CharacterPrompt; approve: boolean }
 | { type: 'setPoll'; open: boolean }
 | { type: 'vote'; suspectId: string };
