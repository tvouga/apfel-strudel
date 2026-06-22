// CodeMirror extension that paints decorations on active note ranges, with an
// onset flash that fades as each note rings out. Driven imperatively from an
// animation loop (no React state churn).

import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Range } from '../strudel/engine';

export const setHighlights = StateEffect.define<Range[]>();

function markFor(intensity: number) {
  const i = Math.max(0, Math.min(1, intensity));
  const bg = (0.1 + 0.55 * i).toFixed(3); // background alpha
  const glow = (1 + 7 * i).toFixed(1); // glow radius (px)
  return Decoration.mark({
    attributes: {
      style: `background-color: rgba(124,156,255,${bg}); border-radius: 3px; box-shadow: 0 0 ${glow}px rgba(124,156,255,${(0.6 * i).toFixed(3)});`,
    },
  });
}

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlights)) {
        const docLen = tr.state.doc.length;
        const ranges = e.value
          .filter((r) => r.from < r.to && r.to <= docLen && r.from >= 0)
          .sort((a, b) => a.from - b.from || a.to - b.to)
          .map((r) => markFor(r.intensity).range(r.from, r.to));
        return Decoration.set(ranges, true);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const highlightExtension = [highlightField];

let last = '';
export function applyHighlights(view: EditorView, ranges: Range[]) {
  // Dedup on rounded intensity so a settled note doesn't dispatch every frame,
  // while a fading flash still updates smoothly.
  const sig = ranges
    .map((r) => `${r.from}:${r.to}:${r.intensity.toFixed(2)}`)
    .sort()
    .join(',');
  if (sig === last) return;
  last = sig;
  view.dispatch({ effects: setHighlights.of(ranges) });
}
