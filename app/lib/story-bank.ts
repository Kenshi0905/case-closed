import generated from './story-bank.generated.json';
import { CURATED_STORY_BANK, STORY_SLOTS, type StoryBank, type StoryFragment } from './story-bank-curated';
export type { StorySlot, StoryBank, StoryFragment } from './story-bank-curated';

const entries = Array.isArray(generated.entries) ? generated.entries.filter((entry): entry is StoryFragment =>
  typeof entry.id === 'string' && STORY_SLOTS.includes(entry.slot as typeof STORY_SLOTS[number]) &&
  (entry.kind === 'atmosphere' || entry.kind === 'object') && typeof entry.text === 'string' &&
  (entry.source === 'curated' || entry.source === 'local-qwen'),
) : CURATED_STORY_BANK;

/** Public atmosphere only. Identity, actions, clues and chronology are owned by the case engine. */
export const STORY_BANK: StoryBank = { version: 1, canonical: { deathTime: '21:17', alarmTime: '21:19' }, entries };
