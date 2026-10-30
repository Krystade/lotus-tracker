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

/** Peak gain at full volume. Volume is squared on the way in, so the slider
 * moves evenly in loudness rather than doing everything in its first quarter. */
const MAX_GAIN = 0.3;

/**
 * A soft two-note chime. Best-effort; silent if audio is unavailable/blocked.
 *
 * It used to be a square wave switched straight on at a fixed 0.09 gain: a
 * square wave's loudness is mostly odd harmonics at 2-3kHz, right where phone
 * speakers and ears are most sensitive, and a gain that jumps from 0 clicks.
 * That is what made it loud and sudden. Sines with a short fade-in and a
 * decaying tail carry the same "time's up" with nothing harsh in them.
 */
export function playBeep(volume = 0.5): void {
  const c = getCtx();
  if (!c) return;
  const peak = MAX_GAIN * Math.max(0, Math.min(1, volume)) ** 2;
  if (peak <= 0) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  try {
    const t0 = c.currentTime + 0.01;
    // A5 then D6: high enough for a phone speaker to carry, nowhere near
    // the old square wave's harmonic pile-up.
    ([
      [880, 0],
      [1175, 0.16],
    ] as const).forEach(([freq, at]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + at;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // ignore
  }
}

/**
 * One soft blip for the 0:30 / 0:10 warnings: the same sine voice as the
 * chime, shorter and at half its level, so the table hears time running
 * down before it runs out rather than being startled at 0:00.
 */
export function playTick(volume = 0.5, urgent = false): void {
  const c = getCtx();
  if (!c) return;
  const peak = MAX_GAIN * 0.5 * Math.max(0, Math.min(1, volume)) ** 2;
  if (peak <= 0) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  try {
    const start = c.currentTime + 0.01;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = urgent ? 1175 : 880;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.25);
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

export function fireTurnExpiredAlert(
  sound: boolean,
  buzz: boolean,
  volume = 0.5,
): void {
  if (sound) playBeep(volume);
  if (buzz) vibrate();
}
