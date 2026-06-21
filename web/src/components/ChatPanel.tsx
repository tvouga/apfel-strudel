import { useState } from 'react';
import type { ChatMessage } from '../ai/client';
import type { SelectionContext } from '../song/parse';

interface Props {
  messages: ChatMessage[];
  streaming: string;
  busy: boolean;
  selection: SelectionContext | null;
  onSend: (text: string) => void;
  onClearSelection: () => void;
}

export function ChatPanel({ messages, streaming, busy, selection, onSend, onClearSelection }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-hint">
            Ask for a groove or a change.
            <div className="chat-examples">
              <span>"give me a 124bpm techno beat"</span>
              <span>"make the hats swing"</span>
              <span>"add a dubby chord stab"</span>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            {streaming || <span className="dots">thinking…</span>}
          </div>
        )}
      </div>
      <div className="chat-input">
        {selection && (
          <div className="sel-chip">
            <span className="sel-icon">{'</>'}</span>
            <span>
              {selection.partName}: <code>{selection.snippet.slice(0, 28)}{selection.snippet.length > 28 ? '…' : ''}</code>
            </span>
            <button onClick={onClearSelection} aria-label="clear selection">✕</button>
          </div>
        )}
        <div className="chat-box">
          <textarea
            rows={2}
            placeholder={busy ? 'working…' : 'ask for a change…'}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="send" onClick={submit} disabled={busy} aria-label="send">↑</button>
        </div>
      </div>
    </div>
  );
}
