import { CRIME_CONTEXT } from './case-data';
/** Saved older cases keep their original cause of death. */
export function crimeContext(scriptVersion?:number){return scriptVersion===3?'Dr. Arjun Sen has been found shot in the restricted laboratory at Aster Research Lab. The gunshot was at 21:17; the corridor alarm sounded at 21:19. Six people were working nearby. Compare their accounts with the five objects left at the scene.':CRIME_CONTEXT;}
