import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const base = EditorView.theme(
  {
    '&': { color: '#cdd6e4', backgroundColor: 'transparent', height: '100%', fontSize: '13px' },
    '.cm-content': { fontFamily: 'var(--mono)', caretColor: '#7c9cff', padding: '12px 0' },
    '.cm-scroller': { overflow: 'auto', lineHeight: '1.7' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#4a5168', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(124,156,255,0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#7c9cff' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(124,156,255,0.25)',
    },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: '#5b6479', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: '#e5b06e' },
  { tag: [t.function(t.variableName), t.labelName], color: '#7cc4ff' },
  { tag: [t.propertyName], color: '#8fd6a0' },
  { tag: [t.number, t.bool], color: '#c792ea' },
  { tag: [t.keyword, t.operator], color: '#7c9cff' },
  { tag: [t.variableName], color: '#cdd6e4' },
]);

export const oneDark = [base, syntaxHighlighting(highlight)];
