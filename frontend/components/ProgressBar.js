export default function ProgressBar({ progress }) {
  return (
    <div
      id="exportProgress"
      className={`export-progress ${progress.visible ? '' : 'hidden'} ${progress.failed ? 'failed' : ''}`}
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={progress.value}
    >
      <div className="export-progress-head">
        <span id="exportProgressLabel" className="export-progress-label">{progress.label}</span>
        <span id="exportProgressPercent" className="export-progress-percent">{Math.round(progress.value)}%</span>
      </div>
      <div className="export-progress-track">
        <div id="exportProgressBar" className="export-progress-bar" style={{ width: `${progress.value}%` }} />
      </div>
    </div>
  );
}
