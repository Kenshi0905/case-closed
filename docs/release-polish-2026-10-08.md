# Deployment polish — 8 October 2026

This pass addresses the findings in [the timed playtest](playtest-2026-10-08.md).

## Player experience

- A private game now has visible progress, real walking routes to missing objects, an accusation, a chance to reconsider before voting, a verdict, and a debrief. Workshop hosts retain the live phase controls.
- The opening connects the confrontation to the collapse more clearly and offers distinct aftermath actions. Those actions appear in the reconstruction. Existing saved scripts and replay stories remain frozen.
- The objective occupies less of the map on narrow screens. Radio interviews are clearly labelled. Portraits use the existing individual artwork without cropping their sides.
- Long dialogue breaks at sentence boundaries where possible. The verdict leads with the culprit's portrait and the player's accusation result, followed by the evidence, motive, and timeline.
- Controls are disabled when their phase does not permit the action. The writing timer no longer misleadingly counts down after writing ends.

## Dialogue and reliability

- Common synonyms and plurals resolve to the relevant clue. Multiple requested topics can appear in one response; corroboration questions do not invent witnesses.
- Wrong timeline premises are corrected. Broad audit questions reveal the approved personal concern instead of immediately dumping the named meeting note.
- Existing cast foundations supply distinct redirects and role descriptions. Approved character details remain the source for alibis, relationships, and secrets.
- Compatible saved local answers are reused within the same case and suspect. The offline/replay fallback uses the same improved planner. No local model request is required for an archived replay answer.
- Accepted local text must preserve the entire approved answer; matching numbers alone is no longer sufficient. Local generation is capped at 6.5 seconds; hosted waiting falls back after eight seconds.
- Fixed late answers appearing under another suspect, overlapping non-movement requests, pending moves during authentication, and replay links being blocked by a guest login overlay or an existing sample cookie.

## Verification before packaging

- 82 automated tests passed, including all 729 opening-choice combinations, permissions and private state, question semantics, recording isolation, vote guards, map reachability, audio/mute behavior, and sentence-preserving pagination.
- TypeScript passed.
- The private HTTP playthrough completed the opening, 97 valid tile moves, all five clues, boundary tests, accusation/reconsideration, duplicate-vote rejection, reveal, and debrief. The local live fixture was unchanged.
- Browser playthrough at the narrow default viewport completed every opening scene, walked to all five clues, asked a previously failing compound question, voted, revealed the case, opened credits, and started a fresh case. The replay entry path and persisted mute setting were also checked. Desktop layout was checked at 985 × 651.
- Actual local Qwen rehearsal accepted all six test replies; measured model generation was 0.36–0.66 seconds. These are model timings, not hosted round trips. The verified relay was restarted; the model process stayed healthy.

This pass does not substitute for a rehearsal with 50 people on the event network. Audible sound quality was not evaluated by browser automation; audio behavior is covered by tests and the mute control was checked in the interface.

## Public release and first-person world follow-up

- Facilitator entry now goes through `/api/facilitator`: verified sign-in resolves the live event, removes a masking private-sample session, and opens the control room. Denied accounts retain their sample and receive a useful explanation.
- Facilitators can choose the usual local Qwen connection or scripted responses. The choice persists per case; practice choices never affect the live workshop. Scripted mode bypasses both local generation and saved AI deliveries. Replays retain their frozen dialogue archive.
- Anonymous live snapshots omit the real participant roster, writer identities, facilitator credits, and controller ID. Existing explicitly requested email-only participant self-identification remains unchanged.
- The opening now uses an original 2.5D laboratory renderer with automatic choice-driven movement and object-directed camera turns. The existing six choices, stored consequences, and case timeline remain authoritative.
- Dr. Sen has a new transparent pixel sprite, shared by the world and the dialogue portrait. Conversations use the game's bottom dialogue box; the killer remains anonymous. The later investigation remains top-down.

Focused local sign-in, mode switching, provider-cookie preservation, participant-entry compatibility, and unauthorized-request checks passed before world integration.

### First-person release verification

- All 103 automated tests passed, including every opening story combination, all 600 automatic camera routes, narrow/wide watch framing, facilitator callbacks, mode authorization and persistence, anonymous roster redaction, and existing investigation behavior. TypeScript and whitespace checks passed.
- Browser review traversed all six scenes and alternate choices, doctor dialogue paging, automatic walks, skip-walk, menu pause, and camera framing for the watch and flask. The watch framing was corrected after visual review at 1100 × 720 and 416 × 650.
- The renderer and laboratory assets are original. DOOM was a reference for the first-person visual language; no engine code, HUD, ROM, or game artwork is included.

Hosted release verification passed after packaging: anonymous page/state access, redacted guest data, unauthorized actions and forged identity rejection, private scripted/local selection, accepted local recording, and recording reuse. The live workshop stayed at phase 1, revision 2. The real browser facilitator callback opened the live controls and showed the PC connected.

A final camera-only refinement keeps the doctor and lab visible above tall mobile dialogue boxes; normal views use a higher horizon and character-focused framing. Six renderer tests and TypeScript passed after this refinement; no backend or case-state behavior changed.

## Shooting, dialogue specificity, and participant testing

- New story version 3 shows an explicit motive-labelled firing choice, an original synthesized shot and non-graphic fall. A proper lying pixel pose appears in both the opening and top-down crime scene. Versioned forensic clues/reconstruction agree with the shooting; started legacy stories stay frozen. Only the completely untouched empty live setup can be upgraded through the normal revision guard.
- First-person routes now accelerate/decelerate gradually and round collision-safe corners. Pixel/depth/gradient buffers are reused and sprites render in visible spans. Map positions interpolate to exact tile centers in 120 ms independent of frame rate. Firing head clearance is tested on desktop and narrow projections.
- Every suspect now distinguishes alibi claims, corroborating people, arrival/departure, mistaken locations, accusations and evidence requests. The regression matrix includes 606 paraphrases across all six suspects and 48 writer-personality scenarios. Explicit writer personality overrides cast defaults; scripted answers retain the same specificity and tone.
- Local Qwen now receives the current approved character, question, personality, canonical answer and two recent same-character turns. A small constrained delivery choice prevents hallucinated facts. The model has 4096 context tokens and a 16-token output cap with prompt caching. Twelve synthetic contextual requests all passed, measuring 0.65–1.10 s fresh-character inference and 0.19–0.28 s repeated inference; network time is additional. This is prompt/runtime tuning, not weight training. View Local AI.cmd provides a credential-free live monitor.
- testuser@gmail.com opens a separate normal Detective or Suspect writer case. Writer mode exercises the eight-minute form before investigating. Local HTTP verification completed writing, personality, question variants, 97 legal moves, five clues, accusation, voting and reveal. Six administrator actions were denied and the live fixture remained unchanged.
- The complete 135-test suite passed before the last camera-only refinement; its focused renderer tests and TypeScript passed afterward. Hosted verification follows packaging. Browser QA reproduced both reported Dev questions in offline mode, checked normal test-user login and menu permissions, and inspected the new firing/aftermath and top-down body.
