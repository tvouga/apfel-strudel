interface Props {
  playing: boolean;
  tempo: number;
  cycle: number;
  serverReady: boolean;
  onToggle: () => void;
  onTempo: (bpm: number) => void;
}

export function TransportBar({ playing, tempo, cycle, serverReady, onToggle, onTempo }: Props) {
  const bar = Math.floor(cycle) + 1;
  const beat = Math.floor((cycle % 1) * 4) + 1;
  return (
    <div className="transport">
      <button className={`play ${playing ? 'on' : ''}`} onClick={onToggle} aria-label={playing ? 'stop' : 'play'}>
        {playing ? '■' : '▶'}
      </button>
      <div className="readout">
        <span className="pos">{playing ? `${bar}.${beat}` : '—'}</span>
        <span className="dim">bar.beat</span>
      </div>
      <label className="tempo">
        <input
          type="number"
          min={40}
          max={220}
          value={tempo}
          onChange={(e) => onTempo(Number(e.target.value) || tempo)}
        />
        <span className="dim">bpm</span>
      </label>
      <div className="spacer" />
      <span className={`badge ${serverReady ? 'live' : 'warn'}`}>
        {serverReady ? '● ai ready' : '○ no api key'}
      </span>
      <button className="ghost" disabled title="Collaborative jam — coming soon">
        jam
      </button>
    </div>
  );
}
