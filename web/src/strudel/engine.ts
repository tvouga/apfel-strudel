// Thin wrapper around @strudel/web: transport, tempo, cycle clock, and
// next-bar quantized hot-swapping of the playing pattern.

import { initStrudel, samples } from '@strudel/web';
import type { Song } from '../song/model';
import { serializeForEngine } from '../song/parse';

interface Scheduler {
  now(): number;
  cps: number;
  started: boolean;
  setCps(cps: number): void;
}
interface Repl {
  scheduler: Scheduler;
  evaluate: (code: string, autostart?: boolean) => Promise<unknown>;
  start: () => void;
  stop: () => void;
  pause: () => void;
  setCps: (cps: number) => void;
}

export const bpmToCps = (bpm: number) => bpm / 60 / 4; // 1 cycle = 1 bar (4 beats)

export class StrudelEngine {
  private repl: Repl | null = null;
  private ready: Promise<void>;
  private currentCode = 'silence';
  private pendingTimer: number | null = null;
  playing = false;
  lastError: string | null = null;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    this.repl = (await initStrudel({
      prebake: () => samples('github:tidalcycles/dirt-samples'),
    })) as unknown as Repl;
  }

  async whenReady() {
    await this.ready;
  }

  /** Current cycle position (one cycle == one bar). 0 when stopped. */
  cyclePosition(): number {
    if (!this.repl || !this.playing) return 0;
    try {
      return this.repl.scheduler.now();
    } catch {
      return 0;
    }
  }

  setTempo(bpm: number) {
    this.repl?.setCps(bpmToCps(bpm));
  }

  async play(song: Song) {
    await this.ready;
    this.setTempo(song.tempo);
    this.currentCode = serializeForEngine(song);
    await this.evaluate(this.currentCode);
    this.playing = true;
  }

  stop() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.repl?.stop();
    this.playing = false;
  }

  /** Hot-swap to a new song. When playing, lands on the next bar boundary. */
  async update(song: Song, quantize = true) {
    await this.ready;
    this.setTempo(song.tempo);
    const code = serializeForEngine(song);
    this.currentCode = code;
    if (!this.playing) return;
    if (!quantize) return this.evaluate(code);
    this.scheduleAtNextBar(() => this.evaluate(code));
  }

  /** Audition arbitrary code on the main engine (used by the staging A/B). */
  async preview(code: string) {
    await this.ready;
    await this.evaluate(code);
    this.playing = true;
  }

  /** Return to the song after auditioning. */
  async restoreCurrent() {
    await this.ready;
    if (this.playing) await this.evaluate(this.currentCode);
  }

  private scheduleAtNextBar(fn: () => void) {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    const sch = this.repl?.scheduler;
    if (!sch) return fn();
    const now = sch.now();
    const next = Math.floor(now) + 1;
    const secondsPerCycle = 1 / (sch.cps || 0.5);
    const delayMs = Math.max(0, (next - now) * secondsPerCycle * 1000);
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      fn();
    }, delayMs);
  }

  private async evaluate(code: string) {
    try {
      await this.repl?.evaluate(code, true);
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
}

// Singleton for the app's live transport.
let engine: StrudelEngine | null = null;
export function getEngine(): StrudelEngine {
  if (!engine) engine = new StrudelEngine();
  return engine;
}
