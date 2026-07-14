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
import { cloneSong, activeSectionName, partInSection, findPart } from './song/model';
import { seedSong } from './song/seed';
import { listLibrary, saveToLibrary, removeFromLibrary } from './song/library';
import type { LibraryEntry } from './song/library';
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

// Serialize a song for playback: solo wins; otherwise the active section
// silences parts tagged to other sections.
function toText(song: Song, soloed: string | null): string {
  const c = cloneSong(song);
  const section = activeSectionName(song);
  if (soloed) {
    c.parts = c.parts.map((p) => ({ ...p, muted: p.name !== soloed }));
  } else if (section) {
    c.parts = c.parts.map((p) => ({ ...p, muted: p.muted || !partInSection(p, section) }));
  }
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

  // Which pane is visible on small screens (CSS ignores this on desktop).
  const [mobileTab, setMobileTab] = useState<'parts' | 'editor' | 'chat'>('editor');

  const [library, setLibrary] = useState<LibraryEntry[]>(() => listLibrary());

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

  // User edits flow back into the song; the engine plays their exact text
  // unless a solo or an active section requires a projection.
  const onEditorChange = (text: string) => {
    setEditorText(text);
    const next = songFromText(text, songRef.current);
    setSong(next);
    engine.setTempo(next.tempo);
    if (engine.playing) {
      const needsProjection = soloedRef.current || activeSectionName(next);
      engine.update(needsProjection ? toText(next, soloedRef.current) : text, true);
    }
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

  // --- Sections ---
  const onToggleSection = (name: string) => {
    const next = cloneSong(songRef.current);
    next.sections = next.sections.map((s) => ({ ...s, active: s.name === name ? !s.active : false }));
    setSong(next);
    if (engine.playing) engine.update(toText(next, soloedRef.current), true);
  };

  const onAddSection = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = cloneSong(songRef.current);
    if (next.sections.some((s) => s.name === trimmed)) return;
    next.sections.push({ name: trimmed, active: false });
    setSong(next);
  };

  const onRemoveSection = (name: string) => {
    const next = cloneSong(songRef.current);
    const wasActive = next.sections.find((s) => s.name === name)?.active;
    next.sections = next.sections.filter((s) => s.name !== name);
    next.parts = next.parts.map((p) => ({
      ...p,
      sectionTags: p.sectionTags?.filter((t) => t !== name),
    }));
    setSong(next);
    if (wasActive && engine.playing) engine.update(toText(next, soloedRef.current), true);
  };

  const onTogglePartSection = (partName: string) => {
    const section = activeSectionName(songRef.current);
    if (!section) return;
    const next = cloneSong(songRef.current);
    const p = findPart(next, partName);
    if (!p) return;
    if (partInSection(p, section)) {
      // Exclude: an untagged part first materializes as "member of everything".
      const current = p.sectionTags ?? next.sections.map((s) => s.name);
      p.sectionTags = current.filter((t) => t !== section);
    } else {
      p.sectionTags = [...(p.sectionTags ?? []), section];
    }
    setSong(next);
    if (engine.playing) engine.update(toText(next, soloedRef.current), true);
  };

  // --- Library ---
  const onSaveSong = () => {
    const name = window.prompt('Save song as:', library[0]?.name ?? 'my song');
    if (!name?.trim()) return;
    setLibrary(saveToLibrary(name.trim(), songRef.current));
  };

  const onLoadSong = (id: string) => {
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    if (!window.confirm(`Load "${entry.name}"? The current song is replaced (save it first if you want to keep it).`)) return;
    setSoloed(null);
    soloedRef.current = null;
    applySong(cloneSong(entry.song), true);
  };

  const onDeleteSong = (id: string) => {
    const entry = library.find((e) => e.id === id);
    if (entry && !window.confirm(`Delete "${entry.name}" from the library?`)) return;
    setLibrary(removeFromLibrary(id));
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

      <div className={`main pane-${mobileTab}`}>
        <PartsRail
          song={song}
          soloed={soloed}
          onToggleMute={onToggleMute}
          onSolo={onSolo}
          onToggleSection={onToggleSection}
          onAddSection={onAddSection}
          onRemoveSection={onRemoveSection}
          onTogglePartSection={onTogglePartSection}
          library={library}
          onSaveSong={onSaveSong}
          onLoadSong={onLoadSong}
          onDeleteSong={onDeleteSong}
        />
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

      <nav className="mobile-tabs">
        <button className={mobileTab === 'parts' ? 'on' : ''} onClick={() => setMobileTab('parts')}>
          parts
        </button>
        <button className={mobileTab === 'editor' ? 'on' : ''} onClick={() => setMobileTab('editor')}>
          editor
          {staging && <span className="tab-dot" />}
        </button>
        <button className={mobileTab === 'chat' ? 'on' : ''} onClick={() => setMobileTab('chat')}>
          chat
          {busy && <span className="tab-dot" />}
        </button>
      </nav>
    </div>
  );
}
