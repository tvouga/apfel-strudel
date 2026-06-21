import type { AppliedEdit } from '../ai/tools';
import type { ValidationReport } from '../ai/validate';

interface Props {
  edits: AppliedEdit[];
  report: ValidationReport | null;
  auditioning: boolean;
  abSide: 'staged' | 'live';
  onAudition: () => void;
  onToggleAB: () => void;
  onAccept: () => void;
  onDiscard: () => void;
}

export function StagingPanel({
  edits,
  report,
  auditioning,
  abSide,
  onAudition,
  onToggleAB,
  onAccept,
  onDiscard,
}: Props) {
  const names = [...new Set(edits.map((e) => e.partName))].join(', ');
  const canApply = report?.compiles ?? false;

  return (
    <div className="staging">
      <div className="staging-head">
        <span className="flask">⚗</span>
        <strong>staging</strong>
        <span className="dim">{names}</span>
        <span className="not-live">not yet live</span>
      </div>

      <div className="checks">
        <Check
          state={report ? (report.compiles ? 'ok' : 'bad') : 'pending'}
          label="compiles"
          sub={report ? (report.compiles ? 'syntax + eval ok' : 'has errors') : 'checking…'}
        />
        <Check
          state={report ? (report.makesSound ? 'ok' : 'warn') : 'pending'}
          label="makes sound"
          sub={report ? (report.makesSound ? `${report.eventsPerBar} events/bar` : 'may be silent') : '—'}
        />
        <Check state="future" label="audio rms" sub="future check" />
      </div>

      {report && report.errors.length > 0 && (
        <div className="errs">
          {report.errors.map((e, i) => (
            <div key={i} className="err">
              <strong>{e.part}</strong>: {e.message}
            </div>
          ))}
        </div>
      )}
      {report && report.warnings.length > 0 && (
        <div className="warns">
          {report.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="diffs">
        {edits.map((e, i) => (
          <div key={i} className="diff">
            <div className="diff-label">{e.summary}</div>
            {e.before && <div className="line del">- {e.before}</div>}
            {e.after && <div className="line add">+ {e.after}</div>}
          </div>
        ))}
      </div>

      <div className="staging-foot">
        <button className="ghost" onClick={onAudition}>
          {auditioning ? '■ stop' : '▶ audition'}
        </button>
        {auditioning && (
          <button className="ab" onClick={onToggleAB} title="A/B staged vs live">
            <span className={abSide === 'staged' ? 'on' : ''}>staged</span>
            <span className={abSide === 'live' ? 'on' : ''}>live</span>
          </button>
        )}
        <div className="spacer" />
        <button className="ghost" onClick={onDiscard}>discard</button>
        <button className="primary" onClick={onAccept} disabled={!canApply} title={canApply ? 'apply on next bar' : 'fix errors first'}>
          ✓ apply on next bar
        </button>
      </div>
    </div>
  );
}

function Check({ state, label, sub }: { state: 'ok' | 'bad' | 'warn' | 'pending' | 'future'; label: string; sub: string }) {
  const icon = { ok: '✓', bad: '✕', warn: '⚠', pending: '…', future: '~' }[state];
  return (
    <div className={`check ${state}`}>
      <span className="check-icon">{icon}</span>
      <div>
        <div className="check-label">{label}</div>
        <div className="check-sub">{sub}</div>
      </div>
    </div>
  );
}
