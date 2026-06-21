import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from './editorTheme';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSelect: (text: string, from: number, to: number) => void;
}

export function Editor({ value, onChange, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Keep latest callbacks without recreating the editor.
  const cb = useRef({ onChange, onSelect });
  cb.current = { onChange, onSelect };

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        javascript(),
        oneDark,
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          if (u.selectionSet) {
            const sel = u.state.selection.main;
            cb.current.onSelect(u.state.doc.toString(), sel.from, sel.to);
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external value changes (AI edits, rail) into the editor.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="editor" ref={host} />;
}
