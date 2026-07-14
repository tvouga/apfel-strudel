// Small localStorage-backed song library: save the current song under a
// name, load it back later, delete entries. Saving under an existing name
// overwrites that entry.

import type { Song } from './model';
import { cloneSong } from './model';

export interface LibraryEntry {
  id: string;
  name: string;
  song: Song;
  savedAt: number;
}

const KEY = 'apfelstrudel.library.v1';

function read(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: LibraryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked — the in-memory list still works this session
  }
}

export function listLibrary(): LibraryEntry[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveToLibrary(name: string, song: Song): LibraryEntry[] {
  const entry: LibraryEntry = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    name,
    song: cloneSong(song),
    savedAt: Date.now(),
  };
  const next = [entry, ...read().filter((e) => e.name !== name)];
  write(next);
  return next;
}

export function removeFromLibrary(id: string): LibraryEntry[] {
  const next = read().filter((e) => e.id !== id);
  write(next);
  return next;
}
