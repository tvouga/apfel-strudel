import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import './App.css';
import { Editor } from './components/Editor';
import { TransportBar } from './components/TransportBar';
import { PartsRail } from './components/PartsRail';
import { ChatPanel } from './components/ChatPanel';
import { StagingPanel } from './components/StagingPanel';
import { applyHighlights } from './components/highlight';
import type { Song } from './song/model';
import { cloneSong } from './song/model';
import { seedSong } from './song/seed';
import { serializeForEditor, songFromText, resolveSelection } from './song/parse';
import type { SelectionContext } from './song/parse';
import { getEngine } from './strudel/engine';
import { streamChat, checkServer } from './ai/client';
import type { ChatMessage } from './ai/client';
import { applyToolCalls } from './ai/tools';
import type { AppliedEdit, ToolCall } from './ai/tools';
import { validateSong } from './ai/validate';
import type { ValidationReport } from './ai/validate';

interface Staging {
  candidate: Song;
  edits: AppliedEdit[];
  report: ValidationReport | null;
}

// Serialize a song, optionally soloing one part (others muted).
function toText(song: Song, soloed: string | null): string {
  if (!soloed) return serializeForEditor(song);
  const c = cloneSong(song);
  c.parts = c.parts.map((p) => ({ ...p, muted: p.name !== soloed }));
  return serializeForEditor(c);
}

export default function App() {
  const [song, setSong] = useState<Song>(seedSong);
  const [editorText, setEditorText] = useState(() => serializeForEditor(seedSong));
  const [playing, setPlaying] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [soloed, setSoloed] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<SelectionContext | null>(null);

  const [staging, setStaging] = useState<Staging | null>(null);
  const [auditioning, setAuditioning] = useState(false);
  const [abSide, setAbSide] = useState<'staged' | 'live'>('staged');

  const engine = getEngine();
  const songRef = useRef(song);
  songRef.current = song;
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;
  const soloedRef = useRef(soloed);
  soloedRef.current = soloed;
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    checkServer().then(setServerReady);
  }, []);

  // Animation loop: cycle readout (throttled) + active-note highlights (every frame).
  useEffect(() => {
    let raf = 0;
    let lastCycleUpdate = 0;
    const tick = (t: number) => {
      if (t - lastCycleUpdate > 80) {
        setCycle(engine.cyclePosition());
        lastCycleUpdate = t;
      }
      const view = viewRef.current;
      if (view) {
        // Only highlight when what's playing is exactly what's shown.
        const aligned = engine.playing && engine.playingCode === editorTextRef.current;
        applyHighlights(view, aligned ? engine.getHighlights() : []);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // What the engine should currently play, given solo state.
  const currentPlayText = useCallback(
    () => toText(songRef.current, soloedRef.current),
    [],
  );

  // Commit a new song: update state, re-project the buffer, hot-swap audio.
  const applySong = useCallback(
    (next: Song, quantize: boolean) => {
      setSong(next);
      const text = serializeForEditor(next);
      setEditorText(text);
      engine.setTempo(next.tempo);
      if (engine.playing) engine.update(toText(next, soloedRef.current), quantize);
    },
    [engine],
  );

  const toggleTransport = async () => {
    if (playing) {
      engine.stop();
      setPlaying(false);
    } else {
      engine.setTempo(songRef.current.tempo);
      await engine.play(currentPlayText());
      setPlaying(true);
    }
  };

  const onTempo = (bpm: number) => {
    setSong((s) => ({ ...s, tempo: bpm }));
    engine.setTempo(bpm); // tempo isn't in the buffer, so no re-eval needed
  };

  // User edits flow back into the song; the engine plays their exact text.
  const onEditorChange = (text: string) => {
    setEditorText(text);
    const next = songFromText(text, songRef.current);
    setSong(next);
    engine.setTempo(next.tempo);
    if (engine.playing) engine.update(soloedRef.current ? toText(next, soloedRef.current) : text, true);
  };

  const onSelect = (text: string, from: number, to: number) => {
    setSelection(resolveSelection(text, from, to));
  };

  const onToggleMute = (name: string) => {
    const next = cloneSong(songRef.current);
    const p = next.parts.find((x) => x.name === name);
    if (p) p.muted = !p.muted;
    applySong(next, true);
  };

  const onSolo = (name: string) => {
    const next = soloed === name ? null : name;
    setSoloed(next);
    soloedRef.current = next;
    if (engine.playing) engine.update(toText(songRef.current, next), true);
  };

  // --- Chat / AI editing ---
  const onSend = async (input: string) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: selection
        ? `${input}\n\n[Focused on part "${selection.partName}": ${selection.snippet}]`
        : input,
    };
    const convo = [...messages, userMsg];
    setMessages(convo);
    setSelection(null);
    setBusy(true);
    setStreaming('');

    const calls: ToolCall[] = [];
    let assistantText = '';

    await streamChat(convo, songRef.current, {
      onText: (delta) => {
        assistantText += delta;
        setStreaming(assistantText);
      },
      onTool: (call) => calls.push(call),
      onError: (message) => {
        assistantText += `\n[error: ${message}]`;
        setStreaming(assistantText);
      },
    }).catch((e) => {
      assistantText += `\n[error: ${e?.message ?? e}]`;
    });

    setBusy(false);
    setStreaming('');
    setMessages((m) => [...m, { role: 'assistant', content: assistantText || '(no reply)' }]);

    if (calls.length > 0) {
      const { song: candidate, edits } = applyToolCalls(songRef.current, calls);
      setStaging({ candidate, edits, report: null });
      const report = await validateSong(candidate);
      setStaging((s) => (s ? { ...s, report } : s));
    }
  };

  // --- Staging audition / accept / discard ---
  const onAudition = async () => {
    if (!staging) return;
    if (auditioning) {
      setAuditioning(false);
      if (engine.playing) await engine.update(currentPlayText(), false);
      return;
    }
    setAuditioning(true);
    setAbSide('staged');
    const text = toText(staging.candidate, soloedRef.current);
    if (!engine.playing) {
      engine.setTempo(staging.candidate.tempo);
      await engine.play(text);
      setPlaying(true);
    } else {
      await engine.preview(text);
    }
  };

  const onToggleAB = async () => {
    if (!staging) return;
    const next = abSide === 'staged' ? 'live' : 'staged';
    setAbSide(next);
    const target = next === 'staged' ? staging.candidate : song;
    await engine.preview(toText(target, soloedRef.current));
  };

  const finishStaging = () => {
    setStaging(null);
    setAuditioning(false);
    setAbSide('staged');
  };

  const onAccept = async () => {
    if (!staging) return;
    applySong(staging.candidate, true);
    finishStaging();
  };

  const onDiscard = async () => {
    if (engine.playing) await engine.update(currentPlayText(), false);
    finishStaging();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">apfel·strudel <span className="dim">ai music studio</span></div>
        <TransportBar
          playing={playing}
          tempo={song.tempo}
          cycle={cycle}
          serverReady={serverReady}
          onToggle={toggleTransport}
          onTempo={onTempo}
        />
      </header>

      <div className="main">
        <PartsRail song={song} soloed={soloed} onToggleMute={onToggleMute} onSolo={onSolo} />
        <div className="center">
          <Editor
            value={editorText}
            onChange={onEditorChange}
            onSelect={onSelect}
            onReady={(v) => (viewRef.current = v)}
          />
          {staging && (
            <StagingPanel
              edits={staging.edits}
              report={staging.report}
              auditioning={auditioning}
              abSide={abSide}
              onAudition={onAudition}
              onToggleAB={onToggleAB}
              onAccept={onAccept}
              onDiscard={onDiscard}
            />
          )}
        </div>
        <ChatPanel
          messages={messages}
          streaming={streaming}
          busy={busy}
          selection={selection}
          onSend={onSend}
          onClearSelection={() => setSelection(null)}
        />
      </div>
    </div>
  );
}
