/**
 * Simulation in festen Schritten, getrennt vom Zeichnen (RM-FR-PERF-01).
 * Jedes Bild holt die vergangene Zeit in gleich großen Schritten nach – unabhängig von der Bildrate.
 * Dauert das Rechnen zu lange, läuft das Spiel kurz langsamer, statt zu ruckeln.
 */
/** reale Sekunden je Schritt */
export const SIM_STEP = 1 / 60;
/** höchstens so viel Rechenzeit je Bild (ms) */
export const SIM_BUDGET_MS = 10;
/** höchstens so viel Zeit nachholen (s), z. B. nach einem verdeckten Tab */
const MAX_LAG = 0.25;

export class SimClock {
  private acc = 0;
  /** Bilder, in denen das Budget nicht gereicht hat */
  slowFrames = 0;

  constructor(private tick: (dtReal: number) => void, private now: () => number = () => performance.now()) {}

  /** dtReal: seit dem letzten Bild vergangene Zeit in Sekunden; liefert die Zahl der Schritte */
  advance(dtReal: number): number {
    this.acc = Math.min(this.acc + Math.max(0, dtReal), MAX_LAG);
    const t0 = this.now();
    let n = 0;
    while (this.acc >= SIM_STEP) {
      this.tick(SIM_STEP);
      this.acc -= SIM_STEP;
      n++;
      if (this.now() - t0 > SIM_BUDGET_MS) {
        // Rest verwerfen: lieber langsamer als ein stehendes Bild
        this.acc = Math.min(this.acc, SIM_STEP);
        this.slowFrames++;
        break;
      }
    }
    return n;
  }
}
