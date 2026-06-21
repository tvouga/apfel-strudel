// Applies the model's tool calls to a candidate Song (pure; never touches live).

import type { Song } from '../song/model';
import { cloneSong, findPart } from '../song/model';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AppliedEdit {
  partName: string;
  kind: 'update' | 'add' | 'remove' | 'mute' | 'tempo';
  before?: string;
  after?: string;
  summary: string;
}

export function applyToolCalls(
  base: Song,
  calls: ToolCall[],
): { song: Song; edits: AppliedEdit[] } {
  const song = cloneSong(base);
  const edits: AppliedEdit[] = [];

  for (const call of calls) {
    const i = call.input;
    switch (call.name) {
      case 'update_part': {
        const name = String(i.name);
        const code = String(i.code);
        const p = findPart(song, name);
        if (p) {
          edits.push({ partName: name, kind: 'update', before: p.code, after: code, summary: `update ${name}` });
          p.code = code;
        } else {
          song.parts.push({ name, code, muted: false });
          edits.push({ partName: name, kind: 'add', after: code, summary: `add ${name}` });
        }
        break;
      }
      case 'add_part': {
        const name = String(i.name);
        const code = String(i.code);
        const existing = findPart(song, name);
        if (existing) {
          edits.push({ partName: name, kind: 'update', before: existing.code, after: code, summary: `update ${name}` });
          existing.code = code;
        } else {
          song.parts.push({ name, code, muted: false });
          edits.push({ partName: name, kind: 'add', after: code, summary: `add ${name}` });
        }
        break;
      }
      case 'remove_part': {
        const name = String(i.name);
        const p = findPart(song, name);
        if (p) {
          song.parts = song.parts.filter((x) => x.name !== name);
          edits.push({ partName: name, kind: 'remove', before: p.code, summary: `remove ${name}` });
        }
        break;
      }
      case 'mute_part': {
        const name = String(i.name);
        const muted = Boolean(i.muted);
        const p = findPart(song, name);
        if (p) {
          p.muted = muted;
          edits.push({ partName: name, kind: 'mute', summary: `${muted ? 'mute' : 'unmute'} ${name}` });
        }
        break;
      }
      case 'set_tempo': {
        const bpm = Number(i.bpm);
        if (Number.isFinite(bpm) && bpm > 0) {
          edits.push({ partName: 'tempo', kind: 'tempo', before: String(song.tempo), after: String(bpm), summary: `tempo → ${bpm} bpm` });
          song.tempo = bpm;
        }
        break;
      }
      default:
        break;
    }
  }

  return { song, edits };
}
