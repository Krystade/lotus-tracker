// Shared AudioContext. iOS Safari starts audio contexts suspended and only
// lets them resume inside a user gesture, so we unlock once on first touch and
// reuse the same context for every beep thereafter.
let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from within a user gesture (first tap) to satisfy iOS autoplay rules. */
export function unlockAudio(): void {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  c.resume().catch(() => undefined);
  // Play a near-silent blip to fully unlock the context on iOS.
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.02);
  } catch {
    // ignore
  }
  unlocked = true;
}

/** Short two-tone beep. Best-effort; silent if audio is unavailable/blocked. */
export function playBeep(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = 660;
    gain.gain.value = 0.09;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.frequency.setValueAtTime(880, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.09, c.currentTime + 0.28);
    gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.32);
    osc.stop(c.currentTime + 0.34);
  } catch {
    // ignore
  }
}

/** Vibrate where supported (Android Chrome). iOS Safari has no Vibration API. */
export function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function fireTurnExpiredAlert(sound: boolean, buzz: boolean): void {
  if (sound) playBeep();
  if (buzz) vibrate();
}
