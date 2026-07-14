import type { Song } from '../song/model';
import { activeSectionName, partInSection } from '../song/model';
import type { LibraryEntry } from '../song/library';

interface Props {
  song: Song;
  soloed: string | null;
  onToggleMute: (name: string) => void;
  onSolo: (name: string) => void;
  onToggleSection: (name: string) => void;
  onAddSection: (name: string) => void;
  onRemoveSection: (name: string) => void;
  onTogglePartSection: (partName: string) => void;
  library: LibraryEntry[];
  onSaveSong: () => void;
  onLoadSong: (id: string) => void;
  onDeleteSong: (id: string) => void;
}

export function PartsRail({
  song,
  soloed,
  onToggleMute,
  onSolo,
  onToggleSection,
  onAddSection,
  onRemoveSection,
  onTogglePartSection,
  library,
  onSaveSong,
  onLoadSong,
  onDeleteSong,
}: Props) {
  const active = activeSectionName(song);

  const addSection = () => {
    const name = window.prompt('Section name (e.g. intro, drop):');
    if (name) onAddSection(name);
  };

  return (
    <div className="rail">
      <div className="rail-head">parts</div>
      <div className="rail-list">
        {song.parts.length === 0 && <div className="rail-empty">no parts yet</div>}
        {song.parts.map((p) => {
          const inActive = active ? partInSection(p, active) : true;
          const dimmed = (soloed && soloed !== p.name) || !inActive;
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
              {active && (
                <button
                  className={`insec ${inActive ? 'on' : ''}`}
                  onClick={() => onTogglePartSection(p.name)}
                  title={inActive ? `plays in "${active}" — tap to toggle` : `silent in "${active}" — tap to include`}
                  aria-label={`toggle ${p.name} in section ${active}`}
                >
                  {inActive ? '●' : '○'}
                </button>
              )}
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
            <button className="section-name" onClick={() => onToggleSection(s.name)}>
              {s.name}
            </button>
            <button
              className="section-del"
              onClick={() => onRemoveSection(s.name)}
              aria-label={`delete section ${s.name}`}
              title="delete section"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="rail-add" onClick={addSection}>+ section</button>
        {active ? (
          <div className="rail-hint">
            playing "{active}" — ● marks the parts in it; untagged parts play everywhere
          </div>
        ) : (
          song.sections.length > 0 && <div className="rail-hint">tap a section to play only its parts</div>
        )}
      </div>
      <div className="rail-head">library</div>
      <div className="rail-list">
        {library.length === 0 && <div className="rail-empty">no saved songs</div>}
        {library.map((e) => (
          <div key={e.id} className="lib-entry">
            <button className="lib-load" onClick={() => onLoadSong(e.id)} title={`load "${e.name}"`}>
              <span className="lib-name">{e.name}</span>
              <span className="lib-meta">
                {e.song.parts.length} part{e.song.parts.length === 1 ? '' : 's'} · {e.song.tempo} bpm
              </span>
            </button>
            <button
              className="lib-del"
              onClick={() => onDeleteSong(e.id)}
              aria-label={`delete ${e.name}`}
              title="delete"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="rail-add" onClick={onSaveSong}>+ save current song</button>
      </div>
    </div>
  );
}
