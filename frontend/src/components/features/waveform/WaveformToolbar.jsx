/**
 * WaveformToolbar – top action bar for the waveform viewer.
 * Controls: mode toggle (instantaneous/RMS), cursor mode, fullscreen, settings, export.
 */
import React from 'react';
import {
  RiPulseLine, RiSettings3Line, RiFullscreenLine, RiFullscreenExitLine,
  RiDownload2Line, RiCursorLine, RiTableLine,
} from 'react-icons/ri';
import styles from './WaveformToolbar.module.css';

const WaveformToolbar = ({
  mode, onModeChange,
  cursors, onCursorChange,
  laneHeight, onLaneHeightChange,
  onOpenSettings,
  onOpenMapping,
  isFullscreen, onToggleFullscreen,
  delta, meta, data,
}) => {
  const station = data?.station || meta?.station || '—';
  const device = data?.device || meta?.device || '—';
  const sampleRate = meta?.sample_rate || data?.sample_rate || '—';
  const freq = meta?.nominal_frequency || '—';

  return (
    <div className={styles.toolbar}>
      {/* Left – record info */}
      <div className={styles.infoGroup}>
        <RiPulseLine className={styles.pulseIcon} />
        <div className={styles.recordInfo}>
          <span className={styles.stationName}>{station}</span>
          {device && device !== station && (
            <span className={styles.deviceId}> / {device}</span>
          )}
        </div>
        <div className={styles.metaBadges}>
          {sampleRate !== '—' && (
            <span className={styles.badge}>{Math.round(sampleRate)} Hz</span>
          )}
          {freq !== '—' && (
            <span className={styles.badge}>{freq} Hz nom.</span>
          )}
          {data?.total_pages > 1 && (
            <span className={styles.badge}>pg {data.page}/{data.total_pages}</span>
          )}
        </div>
      </div>

      {/* Center – mode & cursor toggles */}
      <div className={styles.controlGroup}>
        {/* Instantaneous / RMS toggle */}
        <div className={styles.modeToggle}>
          <button
            className={`${styles.toggleBtn} ${mode === 'instantaneous' ? styles.active : ''}`}
            onClick={() => onModeChange('instantaneous')}
            title="Show instantaneous waveform"
          >
            Inst.
          </button>
          <button
            className={`${styles.toggleBtn} ${mode === 'rms' ? styles.activeRms : ''}`}
            onClick={() => onModeChange('rms')}
            title="Show running RMS"
          >
            RMS
          </button>
        </div>

        {/* Cursor A / B selector */}
        <div className={styles.cursorGroup}>
          <span className={styles.cursorLabel}>Cursor:</span>
          <button
            className={`${styles.cursorBtn} ${styles.cursorA} ${cursors.active === 'A' ? styles.cursorActive : ''}`}
            onClick={() => onCursorChange(prev => ({ ...prev, active: 'A' }))}
            title="Place cursor A (click on chart)"
          >A</button>
          <button
            className={`${styles.cursorBtn} ${styles.cursorB} ${cursors.active === 'B' ? styles.cursorActive : ''}`}
            onClick={() => onCursorChange(prev => ({ ...prev, active: 'B' }))}
            title="Place cursor B (click on chart)"
          >B</button>
        </div>
      </div>

      {/* Right – action buttons */}
      <div className={styles.actionGroup}>
        <button className={styles.iconBtn} onClick={onOpenMapping} title="Channel Mapping">
          <RiTableLine />
        </button>
        <button className={styles.iconBtn} onClick={onOpenSettings} title="Settings">
          <RiSettings3Line />
        </button>
        <button className={styles.iconBtn} onClick={onToggleFullscreen} title="Fullscreen">
          {isFullscreen ? <RiFullscreenExitLine /> : <RiFullscreenLine />}
        </button>
        <button className={styles.iconBtn} title="Export" onClick={() => window.dispatchEvent(new Event('waveform-export'))}>
          <RiDownload2Line />
        </button>
      </div>
    </div>
  );
};

export default WaveformToolbar;
