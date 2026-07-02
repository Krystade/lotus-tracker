/** Short beep via the Web Audio API — no asset needed. Best-effort. */
export function playBeep(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 660;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close().catch(() => undefined);
  } catch {
    // Audio blocked before a user gesture — ignore.
  }
}

/** Vibrate where supported (Android Chrome). iOS Safari ignores this. */
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
