// The canonical "music document". The CodeMirror buffer is a projection of this.
// Everything (AI edits, mute/solo, staging, future collab) operates on Song.

export interface Part {
  name: string;
  code: string; // full Strudel expression, without the leading "$:"
  muted: boolean;
  sectionTags?: string[];
}

export interface Section {
  name: string;
  active: boolean;
}

export interface Song {
  tempo: number; // bpm
  parts: Part[];
  sections: Section[];
}

export function emptySong(): Song {
  return { tempo: 120, parts: [], sections: [] };
}

export function cloneSong(song: Song): Song {
  return {
    tempo: song.tempo,
    parts: song.parts.map((p) => ({ ...p, sectionTags: p.sectionTags ? [...p.sectionTags] : undefined })),
    sections: song.sections.map((s) => ({ ...s })),
  };
}

export function findPart(song: Song, name: string): Part | undefined {
  return song.parts.find((p) => p.name === name);
}

export function activeSectionName(song: Song): string | null {
  return song.sections.find((s) => s.active)?.name ?? null;
}

// Untagged (undefined) parts belong to every section; tagged parts only to
// the sections listed (an empty list means none).
export function partInSection(part: Part, section: string): boolean {
  if (!part.sectionTags) return true;
  return part.sectionTags.includes(section);
}

// A short, stable signature used to detect whether two songs differ musically.
export function songSignature(song: Song): string {
  return (
    song.tempo +
    '|' +
    song.parts.map((p) => `${p.name}:${p.muted ? 'm' : ''}:${p.code}`).join('||')
  );
}
