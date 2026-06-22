// Thin wrapper around @strudel/web: transport, tempo, cycle clock, next-bar
// quantized hot-swapping, and active-note highlight queries.
//
// The engine evaluates a code string verbatim (the editor buffer), so the note
// locations it reports index straight into that same text.

import { initStrudel, samples } from '@strudel/web';
import { hasAudibleCode } from '../song/parse';

// The scheduler triggers events 0.1s ahead (neocyclist.latency), so scheduler.now()
// leads what's heard by this much — subtract it to highlight the sounding note.
// Tunable: bump up if highlights feel early, down if they feel late.
const HIGHLIGHT_LATENCY = 0.1;

interface Scheduler {
  now(): number;
  cps: number;
  started: boolean;
  pattern?: { queryArc: (a: number, b: number) => Hap[] };
}
interface Hap {
  whole?: { begin: number; end: number };
  context?: { locations?: { start: number; end: number }[] };
}
interface Repl {
  scheduler: Scheduler;
  evaluate: (code: string, autostart?: boolean) => Promise<unknown>;
  stop: () => void;
  setCps: (cps: number) => void;
}

export const bpmToCps = (bpm: number) => bpm / 60 / 4; // 1 cycle = 1 bar (4 beats)

export interface Range {
  from: number;
  to: number;
  /** 1 at the moment a note triggers, fading toward a sustain floor as it rings. */
  intensity: number;
}

// Onset flash: bright at trigger, decaying with this time constant (seconds)
// down to a steady floor while the note is still held.
const FLASH_TAU = 0.12;
const SUSTAIN = 0.28;

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
      // dirt-samples gives the default sounds; the drum-machines pack registers
      // the bank samples (RolandTR909_bd, etc.) that .bank("RolandTR909") needs.
      prebake: () =>
        Promise.all([
          samples('github:tidalcycles/dirt-samples'),
          samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'),
        ]),
    })) as unknown as Repl;
  }

  async whenReady() {
    await this.ready;
  }

  /** The exact code currently playing (for callers to verify highlight alignment). */
  get playingCode(): string {
    return this.currentCode;
  }

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

  async play(code: string) {
    await this.ready;
    await this.evaluate(code);
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

  /** Hot-swap to new code. When playing, lands on the next bar boundary. */
  async update(code: string, quantize = true) {
    await this.ready;
    if (!this.playing) {
      this.currentCode = code;
      return;
    }
    if (!quantize) return this.evaluate(code);
    this.scheduleAtNextBar(() => this.evaluate(code));
  }

  /** Audition arbitrary code immediately (staging A/B). Diverges from the editor. */
  async preview(code: string) {
    await this.ready;
    await this.evaluate(code);
    this.playing = true;
  }

  /** Active note ranges at the moment currently being heard. */
  getHighlights(): Range[] {
    if (!this.repl || !this.playing) return [];
    const sch = this.repl.scheduler;
    const pat = sch.pattern;
    if (!pat) return [];
    let head: number;
    try {
      head = sch.now();
    } catch {
      return [];
    }
    const cps = sch.cps || 0.5;
    // The cycle currently sounding (scheduler.now() leads the audio by latency).
    const t = head - HIGHLIGHT_LATENCY * cps;
    if (t < 0) return [];
    let haps: Hap[];
    try {
      haps = pat.queryArc(Math.max(0, t - 0.02), t + 0.02);
    } catch {
      return [];
    }
    // Brightest intensity wins when a token is lit by several events.
    const byRange = new Map<string, Range>();
    for (const h of haps) {
      // A note is lit from its onset through the end of its duration.
      if (!h.whole || h.whole.begin > t || t >= h.whole.end) continue;
      const ageSec = ((t - h.whole.begin) / cps); // seconds since this note fired
      const intensity = SUSTAIN + (1 - SUSTAIN) * Math.exp(-ageSec / FLASH_TAU);
      for (const l of h.context?.locations ?? []) {
        const key = `${l.start}:${l.end}`;
        const prev = byRange.get(key);
        if (!prev || intensity > prev.intensity) {
          byRange.set(key, { from: l.start, to: l.end, intensity });
        }
      }
    }
    return [...byRange.values()];
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
    this.currentCode = code;
    const toRun = hasAudibleCode(code) ? code : 'silence';
    try {
      await this.repl?.evaluate(toRun, true);
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
}

let engine: StrudelEngine | null = null;
export function getEngine(): StrudelEngine {
  if (!engine) engine = new StrudelEngine();
  return engine;
}
