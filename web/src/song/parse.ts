// Maps the Song document <-> Strudel source text.
//
// Each part is a labeled statement (`name: pattern`, the same mechanism behind
// `$:`), preceded by a `// name` header. A MUTED part has all its code lines
// commented out — so the editor text is exactly what the engine evaluates
// (muted = inert), which keeps note-highlight offsets aligned with the buffer.

import type { Song, Part } from './model';

const SAFE = /[^A-Za-z0-9_]/g;
const LABEL = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*[\s\S]*$/;

export function safeLabel(name: string): string {
  const cleaned = name.trim().replace(SAFE, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `p_${cleaned}`;
}

// The single serialization: what the editor shows AND what the engine evaluates.
export function serializeForEditor(song: Song): string {
  if (song.parts.length === 0) return '// add a part, or ask the assistant for a groove\n';
  return (
    song.parts
      .map((p) => {
        const body = `${safeLabel(p.name)}: ${p.code}`;
        if (p.muted) {
          const commented = body
            .split('\n')
            .map((l) => `// ${l}`)
            .join('\n');
          return `// ${p.name} (muted)\n${commented}`;
        }
        return `// ${p.name}\n${body}`;
      })
      .join('\n\n') + '\n'
  );
}

// True when the text has at least one line the engine would actually play.
export function hasAudibleCode(text: string): boolean {
  return text.split('\n').some((l) => {
    const t = l.trim();
    return t !== '' && !t.startsWith('//');
  });
}

function stripComment(line: string): { isComment: boolean; text: string } {
  const t = line.trim();
  if (t.startsWith('//')) return { isComment: true, text: t.replace(/^\/\/\s?/, '') };
  return { isComment: false, text: t };
}

// Parse editor text into parts. Mute is read from whether the code is commented.
export function parsePartsFromText(text: string): Part[] {
  const blocks = text.split(/\n[ \t]*\n/);
  const parts: Part[] = [];

  for (const block of blocks) {
    let nameHint: string | undefined;
    let muted = false;
    let started = false;
    const codeLines: string[] = [];

    for (const raw of block.split('\n')) {
      if (raw.trim() === '') continue;
      const { isComment, text: stripped } = stripComment(raw);
      if (!started) {
        if (LABEL.test(stripped)) {
          started = true;
          if (isComment) muted = true;
          codeLines.push(stripped);
        } else if (isComment) {
          nameHint = stripped.replace(/\(muted\)/i, '').trim() || nameHint;
        } else {
          started = true;
          codeLines.push(stripped); // code without a label
        }
      } else {
        codeLines.push(stripped);
      }
    }

    if (codeLines.length === 0) continue;
    const joined = codeLines.join('\n');
    const m = joined.match(LABEL);
    const label = m?.[1];
    const code = (m ? joined.slice(joined.indexOf(':') + 1) : joined).trim();
    if (!code) continue;
    parts.push({ name: nameHint || label || `part${parts.length + 1}`, code, muted });
  }

  return parts;
}

export function songFromText(text: string, prev: Song): Song {
  return { ...prev, parts: parsePartsFromText(text) };
}

export interface SelectionContext {
  partName: string;
  snippet: string;
}

// Map a selection in the editor to the part that encloses it.
export function resolveSelection(
  text: string,
  from: number,
  to: number,
): SelectionContext | null {
  if (from === to) return null;
  const snippet = text.slice(from, to).trim();
  if (!snippet) return null;

  const lines = text.split('\n');
  let offset = 0;
  let currentName: string | undefined;
  let pendingName: string | undefined;
  let bestName: string | undefined;

  for (const line of lines) {
    const start = offset;
    const end = offset + line.length;
    const { isComment, text: stripped } = stripComment(line);
    if (LABEL.test(stripped)) {
      currentName = pendingName || stripped.match(LABEL)![1];
      pendingName = undefined;
    } else if (isComment) {
      pendingName = stripped.replace(/\(muted\)/i, '').trim() || pendingName;
    }
    if (from >= start && from <= end + 1 && currentName) bestName = currentName;
    offset = end + 1;
  }

  return { partName: bestName || parsePartsFromText(text)[0]?.name || 'song', snippet };
}
