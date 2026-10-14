"use client";

export type SfxType = "step" | "menu" | "close" | "clue" | "join" | "ask" | "error" | "vote" | "reveal" | "shot";
const STORAGE_KEY = "case-closed:sound-enabled";
const MASTER_VOLUME = 0.24;
const MAX_VOICES = 12;
type Voice = { oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; channel: "voice" | "sfx" };
let context: AudioContext | null = null;
let master: GainNode | null = null;
let outputFilter: BiquadFilterNode | null = null;
let preference: boolean | undefined;
let gestureUnlocked = false;
let listening = false;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
let lastVoiceAt = -Infinity;
let stepNumber = 0;
const activeVoices = new Set<Voice>();
const subscribers = new Set<() => void>();
const lastEffectAt = new Map<SfxType, number>();
const browser = () => typeof window !== "undefined" && typeof document !== "undefined";
const clockNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();

export function getSoundEnabled(): boolean {
  if (preference !== undefined) return preference;
  if (!browser()) return true;
  try { preference = window.localStorage.getItem(STORAGE_KEY) !== "0"; } catch { preference = true; }
  return preference;
}

function notify() { for (const subscriber of subscribers) subscriber(); }
function clearSuspendTimer() { if (suspendTimer !== null) { clearTimeout(suspendTimer); suspendTimer = null; } }
function removeVoice(voice: Voice) {
  activeVoices.delete(voice);
  try { voice.oscillator.disconnect(); voice.filter.disconnect(); voice.gain.disconnect(); } catch { /* Already disconnected. */ }
}
function releaseVoice(voice: Voice, immediate = false) {
  const now = context?.currentTime ?? 0;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0, voice.gain.gain.value), now);
    voice.gain.gain.linearRampToValueAtTime(0, now + (immediate ? 0 : .008));
    voice.oscillator.stop(now + (immediate ? 0 : .01));
  } catch { removeVoice(voice); }
  activeVoices.delete(voice);
}

/** Stops current and scheduled notes. Preference and the gesture-unlocked context remain reusable. */
export function stopAudio(): void {
  for (const voice of [...activeVoices]) releaseVoice(voice);
  lastVoiceAt = -Infinity;
  lastEffectAt.clear();
}
/** Stops dialogue bleeps without cutting off a menu, discovery, or reveal cue. */
export function stopVoice(): void {
  for (const voice of [...activeVoices]) if (voice.channel === "voice") releaseVoice(voice);
  lastVoiceAt = -Infinity;
}
function silenceAndSuspend() {
  stopAudio(); clearSuspendTimer();
  const current = context;
  if (!current || current.state === "closed") return;
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (context === current && (!getSoundEnabled() || (browser() && document.hidden))) void current.suspend().catch(() => {});
  }, 25);
}
function storageChanged(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  preference = event.newValue !== "0";
  if (!preference) silenceAndSuspend();
  notify();
}
function visibilityChanged() {
  if (document.hidden) silenceAndSuspend();
  else if (gestureUnlocked && getSoundEnabled()) void resumeContext();
}
function attachLifecycle() {
  if (!browser() || listening) return;
  window.addEventListener("storage", storageChanged);
  document.addEventListener("visibilitychange", visibilityChanged);
  listening = true;
}

export function subscribeSound(listener: () => void): () => void {
  subscribers.add(listener); attachLifecycle();
  return () => { subscribers.delete(listener); };
}
export function setSoundEnabled(enabled: boolean): void {
  preference = !!enabled;
  if (browser()) { try { window.localStorage.setItem(STORAGE_KEY, preference ? "1" : "0"); } catch { /* Session-only preference when storage is unavailable. */ } }
  if (!preference) silenceAndSuspend();
  else if (gestureUnlocked) void resumeContext();
  notify();
}
export function toggleSound(): boolean {
  const enabled = !getSoundEnabled(); setSoundEnabled(enabled); return enabled;
}
async function resumeContext() {
  if (!context || !master || !browser() || document.hidden || !getSoundEnabled()) return;
  clearSuspendTimer();
  try {
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(MASTER_VOLUME, now + .015);
  } catch { stopAudio(); }
}

/** Call from a trusted pointer/keyboard handler. No context is constructed before this call. */
export async function unlockAudio(): Promise<void> {
  if (!browser() || document.hidden || !getSoundEnabled()) return;
  attachLifecycle();
  if (!context || context.state === "closed") {
    const AudioContextConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      master = context.createGain(); master.gain.value = MASTER_VOLUME;
      outputFilter = context.createBiquadFilter(); outputFilter.type = "highpass";
      outputFilter.frequency.value = 35; outputFilter.Q.value = .6;
      master.connect(outputFilter); outputFilter.connect(context.destination);
    } catch { context = null; master = null; outputFilter = null; return; }
  }
  gestureUnlocked = true;
  await resumeContext();
}

function ready(): boolean {
  return browser() && !document.hidden && getSoundEnabled() && gestureUnlocked && !!context && context.state !== "closed" && !!master;
}
function tone(frequency: number, duration: number, options: { wave?: OscillatorType; volume?: number; delay?: number; endFrequency?: number; cutoff?: number; channel?: "voice" | "sfx" } = {}) {
  if (!ready() || !context || !master) return;
  if (activeVoices.size >= MAX_VOICES) { const oldest = activeVoices.values().next().value; if (oldest) releaseVoice(oldest); }
  try {
    const oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
    const start = context.currentTime + .006 + (options.delay ?? 0), end = start + duration;
    oscillator.type = options.wave ?? "triangle";
    oscillator.frequency.setValueAtTime(Math.max(45, Math.min(1800, frequency)), start);
    if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, options.endFrequency), end);
    filter.type = "lowpass"; filter.frequency.value = options.cutoff ?? 1800; filter.Q.value = .4;
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(options.volume ?? .12, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    gain.gain.setValueAtTime(0, end + .004);
    oscillator.connect(filter); filter.connect(gain); gain.connect(master);
    const voice: Voice = { oscillator, gain, filter, channel: options.channel ?? "sfx" }; activeVoices.add(voice);
    oscillator.onended = () => removeVoice(voice);
    oscillator.start(start); oscillator.stop(end + .006);
  } catch { /* Unsupported or interrupted audio remains a silent progressive enhancement. */ }
}

export function playSfx(type: SfxType): void {
  if (!ready()) return;
  const now = clockNow(), minimumGap = type === "step" ? 115 : type === "reveal" || type === "shot" ? 1200 : 90;
  if (now - (lastEffectAt.get(type) ?? -Infinity) < minimumGap) return;
  lastEffectAt.set(type, now);
  if (type === "shot") {
    // One original arcade report: a short sharp crack over a quiet low thump.
    tone(1500, .065, { wave: "square", endFrequency: 95, volume: .15, cutoff: 2100 });
    tone(135, .16, { wave: "sawtooth", endFrequency: 48, volume: .13, cutoff: 650 });
    return;
  }
  if (type === "step") { tone(++stepNumber % 2 ? 98 : 83, .045, { endFrequency: 55, volume: .09, cutoff: 550 }); return; }
  if (type === "menu") { tone(360, .065, { wave: "square", endFrequency: 480, volume: .08, cutoff: 1300 }); return; }
  if (type === "close") { tone(300, .065, { wave: "triangle", endFrequency: 180, volume: .1 }); return; }
  if (type === "ask") { tone(440, .075, { wave: "sine", endFrequency: 510, volume: .11 }); return; }
  const notes: Record<"clue" | "join" | "error" | "vote" | "reveal", number[]> = {
    clue: [523, 659, 784, 1047], join: [330, 440, 660], error: [196, 147], vote: [660, 880], reveal: [220, 330, 440, 554, 660],
  };
  for (const [index, frequency] of notes[type].entries()) tone(frequency, type === "reveal" ? .24 : .13, { delay: index * (type === "reveal" ? .10 : .065), volume: type === "error" ? .10 : .12, wave: type === "error" ? "triangle" : "sine" });
}

/** Six original short voice timbres; caller skips whitespace and punctuation. */
export function playVoice(voiceIndex: number, charIndex: number): void {
  if (!ready() || !Number.isFinite(voiceIndex) || !Number.isFinite(charIndex)) return;
  const now = clockNow();
  if (now - lastVoiceAt < 52) return;
  lastVoiceAt = now;
  const index = ((Math.floor(voiceIndex) % 6) + 6) % 6;
  const bases = [240, 145, 285, 178, 220, 198];
  const waves: OscillatorType[] = ["square", "triangle", "square", "sawtooth", "triangle", "square"];
  const variation = [0, 2, -1, 1, 0, -2][Math.abs(Math.floor(charIndex)) % 6];
  tone(bases[index] * 2 ** (variation / 12), .035 + index % 3 * .006, { wave: waves[index], volume: .09, cutoff: [1350, 850, 1700, 950, 1200, 1100][index], channel: "voice" });
}

/** The application calls this during root unmount; no timers or browser listeners survive it. */
export function disposeAudio(): void {
  clearSuspendTimer();
  for (const voice of [...activeVoices]) { releaseVoice(voice, true); removeVoice(voice); }
  if (browser() && listening) { window.removeEventListener("storage", storageChanged); document.removeEventListener("visibilitychange", visibilityChanged); }
  listening = false; gestureUnlocked = false; lastVoiceAt = -Infinity; lastEffectAt.clear();
  const previous = context; context = null;
  try { master?.disconnect(); outputFilter?.disconnect(); } catch { /* Already disconnected. */ }
  master = null; outputFilter = null;
  if (previous && previous.state !== "closed") void previous.close().catch(() => {});
}
