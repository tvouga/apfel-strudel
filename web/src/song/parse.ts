// Maps the Song document <-> Strudel source text.
//
// Each part is serialized as a labeled statement (Strudel turns `name: pattern`
// into `pattern.p('name')`, the same mechanism behind `$:`). A `// name` comment
// header is kept for readability. Tempo lives in engine state, not the buffer.

import type { Song, Part } from './model';

const SAFE = /[^A-Za-z0-9_]/g;

export function safeLabel(name: string): string {
  const cleaned = name.trim().replace(SAFE, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `p_${cleaned}`;
}

// Buffer the user sees and edits: every part shown, regardless of mute.
export function serializeForEditor(song: Song): string {
  if (song.parts.length === 0) return '// add a part, or ask the assistant for a groove\n';
  return song.parts
    .map((p) => `// ${p.name}\n${safeLabel(p.name)}: ${p.code}`)
    .join('\n\n') + '\n';
}

// What the engine actually plays: muted parts are dropped.
export function serializeForEngine(song: Song): string {
  const live = song.parts.filter((p) => !p.muted && p.code.trim());
  if (live.length === 0) return 'silence';
  return live.map((p) => `${safeLabel(p.name)}: ${p.code}`).join('\n');
}

interface Block {
  name?: string;
  label?: string;
  code: string;
}

// Parse editor text back into parts. Mute state is not encoded in the buffer, so
// callers should re-apply it by matching part names against the previous Song.
export function parsePartsFromText(text: string): Part[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let current: Block | null = null;
  let pendingName: string | undefined;

  const labelRe = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(.*)$/;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed === '') {
      if (current) {
        blocks.push(current);
        current = null;
      }
      pendingName = undefined;
      continue;
    }

    if (trimmed.startsWith('//')) {
      // A standalone comment becomes the friendly name for the next labeled line.
      if (!current) pendingName = trimmed.replace(/^\/\/\s?/, '').trim() || undefined;
      continue;
    }

    const m: RegExpMatchArray | null = !current ? line.match(labelRe) : null;
    if (m) {
      current = { label: m[1], name: pendingName, code: m[2].trim() };
      pendingName = undefined;
    } else if (current) {
      current.code += '\n' + line.trim();
    } else {
      // Code with no label/header: keep as an anonymous part.
      current = { code: trimmed };
    }
  }
  if (current) blocks.push(current);

  return blocks
    .filter((b) => b.code.trim())
    .map((b, i) => ({
      name: b.name || b.label || `part${i + 1}`,
      code: b.code.trim(),
      muted: false,
    }));
}

// Re-parse text but preserve mute flags from the previous song (matched by name).
export function songFromText(text: string, prev: Song): Song {
  const parts = parsePartsFromText(text);
  const muteByName = new Map(prev.parts.map((p) => [p.name, p.muted]));
  for (const p of parts) {
    if (muteByName.has(p.name)) p.muted = muteByName.get(p.name)!;
  }
  return { ...prev, parts };
}

export interface SelectionContext {
  partName: string;
  snippet: string;
}

// Given a selection in the editor text, figure out which part it lands in.
export function resolveSelection(
  text: string,
  from: number,
  to: number,
): SelectionContext | null {
  if (from === to) return null;
  const snippet = text.slice(from, to).trim();
  if (!snippet) return null;

  // Walk the part headers and label offsets to find the enclosing part.
  const parts = parsePartsFromText(text);
  const labelRe = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/;
  const lines = text.split('\n');
  let offset = 0;
  let currentName: string | undefined;
  let pendingName: string | undefined;
  let bestName: string | undefined;

  for (const line of lines) {
    const start = offset;
    const end = offset + line.length;
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      pendingName = trimmed.replace(/^\/\/\s?/, '').trim();
    } else if (labelRe.test(line)) {
      const m = line.match(labelRe)!;
      currentName = pendingName || m[1];
      pendingName = undefined;
    }
    if (from >= start && from <= end + 1 && currentName) bestName = currentName;
    offset = end + 1; // + newline
  }

  const partName = bestName || parts[0]?.name || 'song';
  return { partName, snippet };
}
