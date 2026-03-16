/**
 * WaveformToolbar – top action bar for the waveform viewer.
 * Controls: mode toggle (instantaneous/RMS), fullscreen, settings, export.
 */
import React from 'react';
import {
  RiPulseLine, RiSettings3Line, RiFullscreenLine, RiFullscreenExitLine,
  RiDownload2Line, RiTableLine, RiEyeLine,
} from 'react-icons/ri';
import styles from './WaveformToolbar.module.css';

const WaveformToolbar = ({
  mode, onModeChange,
  samplingMode, onSamplingModeChange,
  laneHeight, onLaneHeightChange,
  onOpenSettings,
  onOpenMapping,
  onOpenVisibility,
  isFullscreen, onToggleFullscreen,
}) => {
  return (
    <div className={styles.toolbar}>
      {/* Left – record info */}
      <div className={styles.infoGroup}>
        <RiPulseLine className={styles.pulseIcon} />
        <div className={styles.recordInfo}>
          <span className={styles.stationName}>Waveform Viewer</span>
        </div>
      </div>

      {/* Center – mode toggles */}
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

        {/* High Precision / Optimized toggle */}
        <div className={styles.precisionGroup}>
          <button
            className={`${styles.precisionBtn} ${samplingMode === 'none' ? styles.active : ''}`}
            onClick={() => onSamplingModeChange('none')}
            title="High Precision (Raw Samples)"
          >
            RAW
          </button>
          <button
            className={`${styles.precisionBtn} ${samplingMode === 'lttb' ? styles.active : ''}`}
            onClick={() => onSamplingModeChange('lttb')}
            title="Optimized (Downsampled)"
          >
            OPT
          </button>
        </div>
      </div>

      {/* Right – action buttons */}
      <div className={styles.actionGroup}>
        <button className={styles.iconBtn} onClick={onOpenVisibility} title="Channel Visibility">
          <RiEyeLine />
        </button>
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
