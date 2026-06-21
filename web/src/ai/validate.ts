// Validates a candidate song before it can go live.
//   Layer 1 (hard gate): does each part compile? (transpile + eval, no audio)
//   Layer 2 (soft warning): does it produce audible events? (pure queryArc)
//   Layer 3 (true audio RMS) is intentionally not implemented yet.

import { evaluate } from '@strudel/transpiler';
import type { Song } from '../song/model';
import { getEngine } from '../strudel/engine';

export interface ValidationReport {
  compiles: boolean;
  makesSound: boolean;
  errors: { part: string; message: string }[];
  warnings: string[];
  eventsPerBar: number;
}

interface Hap {
  value: unknown;
  whole?: unknown;
}

function isAudible(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== 'object') return true; // bare note/number
  const v = value as Record<string, unknown>;
  const gain = typeof v.gain === 'number' ? v.gain : 1;
  if (gain <= 0) return false;
  return 's' in v || 'note' in v || 'n' in v || 'sound' in v || 'freq' in v;
}

async function checkPart(code: string): Promise<{ ok: boolean; error?: string; events: number }> {
  try {
    const { pattern } = (await evaluate(code)) as { pattern: { queryArc: (a: number, b: number) => Hap[] } };
    let events = 0;
    try {
      const haps = pattern.queryArc(0, 4); // 4 bars
      events = haps.filter((h) => isAudible(h.value)).length;
    } catch {
      events = -1; // compiled but couldn't be queried statically
    }
    return { ok: true, events };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), events: 0 };
  }
}

export async function validateSong(song: Song): Promise<ValidationReport> {
  await getEngine().whenReady(); // ensures the Strudel scope (globals) is loaded
  const errors: ValidationReport['errors'] = [];
  const warnings: string[] = [];
  let totalEvents = 0;
  let queryable = false;

  const live = song.parts.filter((p) => !p.muted && p.code.trim());
  for (const part of live) {
    const r = await checkPart(part.code);
    if (!r.ok) {
      errors.push({ part: part.name, message: cleanError(r.error) });
    } else if (r.events === 0) {
      warnings.push(`"${part.name}" may be silent (no audible events).`);
    } else if (r.events > 0) {
      totalEvents += r.events;
      queryable = true;
    }
  }

  if (live.length === 0) warnings.push('All parts are muted — nothing will play.');

  const compiles = errors.length === 0;
  return {
    compiles,
    makesSound: compiles && queryable && totalEvents > 0,
    errors,
    warnings,
    eventsPerBar: queryable ? Math.round(totalEvents / 4) : 0,
  };
}

function cleanError(msg?: string): string {
  if (!msg) return 'failed to compile';
  // Surface the most useful line of often-verbose parser errors.
  return msg.split('\n')[0].slice(0, 200);
}
