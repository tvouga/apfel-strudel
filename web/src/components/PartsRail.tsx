import type { Song } from '../song/model';

interface Props {
  song: Song;
  soloed: string | null;
  onToggleMute: (name: string) => void;
  onSolo: (name: string) => void;
}

export function PartsRail({ song, soloed, onToggleMute, onSolo }: Props) {
  return (
    <div className="rail">
      <div className="rail-head">parts</div>
      <div className="rail-list">
        {song.parts.length === 0 && <div className="rail-empty">no parts yet</div>}
        {song.parts.map((p) => {
          const dimmed = soloed && soloed !== p.name;
          return (
            <div key={p.name} className={`part ${p.muted || dimmed ? 'muted' : ''}`}>
              <button
                className="mute"
                onClick={() => onToggleMute(p.name)}
                aria-label={p.muted ? `unmute ${p.name}` : `mute ${p.name}`}
                title="mute / unmute"
              >
                {p.muted ? '🔇' : '🔊'}
              </button>
              <span className="part-name">{p.name}</span>
              <button
                className={`solo ${soloed === p.name ? 'on' : ''}`}
                onClick={() => onSolo(p.name)}
                title="solo"
              >
                S
              </button>
            </div>
          );
        })}
      </div>
      <div className="rail-head">sections</div>
      <div className="rail-list">
        {song.sections.length === 0 && <div className="rail-empty">—</div>}
        {song.sections.map((s) => (
          <div key={s.name} className={`section ${s.active ? 'on' : ''}`}>
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}
