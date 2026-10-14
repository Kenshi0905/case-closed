/** Public casting foundations. These describe roles and habits, never case guilt or hidden evidence. */
export type CastProfile = {
  id: string;
  signature: string;
  knownFor: string;
  background: string;
  portrayal: string;
  personality: string;
};

export const CAST_PROFILES: readonly CastProfile[] = [
  {
    id: 'suspect-1',
    signature: 'The meticulous sample archivist',
    knownFor: 'Comparing labels and amber sample vials against a carefully kept catalogue.',
    background: 'You are a research fellow who keeps the lab’s sample history precise and traceable. Colleagues rely on your catalogue when a label, batch, or observation needs checking.',
    personality: "Meticulous, precise, and quietly protective of the details.",
    portrayal: 'Speak carefully, check a detail before answering, and hold the catalogue beside an amber vial as if accuracy is a personal promise.',
  },
  {
    id: 'suspect-2',
    signature: 'The systems fixer',
    knownFor: 'Reconstructing corrupted logs on a handheld diagnostic laptop while adjusting their glasses.',
    background: 'You maintain the systems that help the laboratory run and recover records when technology fails. You are comfortable turning a messy technical problem into a sequence of small checks.',
    personality: "Reserved, blunt, and grumpy when pressed; concise rather than chatty.",
    portrayal: 'Adjust your glasses, glance at the diagnostic screen, and explain your reasoning one step at a time.',
  },
  {
    id: 'suspect-3',
    signature: 'The precision reagent specialist',
    knownFor: 'Measuring a reagent drop by drop with a pipette and flask, always wearing gloves.',
    background: 'You prepare and handle the materials that make the lab’s experiments possible. Careful quantities, clean equipment, and repeatable technique are central to your professional identity.',
    personality: "Precise, methodical, and careful with claims.",
    portrayal: 'Keep your movements economical and precise; pause as if measuring a drop before choosing a word.',
  },
  {
    id: 'suspect-4',
    signature: 'The exacting grant coordinator',
    knownFor: 'Checking a tabbed budget ledger with a pen poised over every expense.',
    background: 'You coordinate the grants, records, and practical commitments behind the research. You expect people to be as specific about resources and responsibilities as they are about their results.',
    personality: "Formal, strict, and impatient with vague accounting.",
    portrayal: 'Keep the ledger open, tap a tab with your pen, and ask for concrete details when an explanation becomes vague.',
  },
  {
    id: 'suspect-5',
    signature: 'The visual molecular theorist',
    knownFor: 'Building an idea around a ball-and-stick molecular model held confidently in one hand.',
    background: 'You are a visiting researcher who thinks quickly in shapes, structures, and relationships. A physical model helps you turn a complicated theory into something the whole room can picture.',
    personality: "Confident, outgoing, and curious about other explanations.",
    portrayal: 'Hold the molecular model confidently, make clear visual comparisons, and speak with the energy of someone testing an idea aloud.',
  },
  {
    id: 'suspect-6',
    signature: 'The pattern-obsessed data analyst',
    knownFor: 'Tracing patterns on a timestamped graph printout with a spare pencil behind one ear.',
    background: 'You are a doctoral researcher who looks for meaningful patterns in experimental data. You notice repeated shapes, unusual gaps, and the difference between a hunch and a result that can be checked.',
    personality: "Curious, analytical, and absorbed by patterns.",
    portrayal: 'Study the graph before answering, mark the point you mean, and let curiosity show when a detail does not fit.',
  },
];

/** Identity follows the assigned cast slot, even when a writer personalizes their character name. */
export function getCastProfile(suspectId?: string | null, fallbackIndex?: number): CastProfile | undefined {
  const match = /^(?:suspect|preview)-([1-6])$/.exec(suspectId ?? '');
  const index = match ? Number(match[1]) - 1 : fallbackIndex;
  return index !== undefined && Number.isInteger(index) && index >= 0 && index < CAST_PROFILES.length ? CAST_PROFILES[index] : undefined;
}
