/**
 * ChannelSidebar – Left panel showing channel labels, colors, and live cursor values.
 * Mirrors the left panel in the reference PSCAD-style waveform viewer.
 */
import React from 'react';
import styles from './ChannelSidebar.module.css';

const ChannelSidebar = ({ channels, hoveredValues, settings }) => {
  const { t, channels: vals } = hoveredValues || {};

  return (
    <div className={styles.sidebar}>
      {/* Time indicator at top */}
      <div className={styles.timeHeader}>
        <span className={styles.timeLabel}>t =</span>
        <span className={styles.timeValue}>
          {t !== undefined ? `${Number(t).toFixed(3)} ms` : '—'}
        </span>
      </div>

      {/* Channel rows */}
      <div className={styles.channelList}>
        {channels.map((ch) => {
          const rawVal = vals?.[ch.name];
          const value = rawVal !== undefined ? rawVal : null;
          const isDigital = ch.type === 'digital';

          let displayVal;
          if (value === null) {
            displayVal = '—';
          } else if (isDigital) {
            displayVal = value === 1 ? 'HIGH' : 'LOW';
          } else {
            displayVal = Number(value).toFixed(4);
          }

          const unit = isDigital ? '' : (ch.unit || '');

          return (
            <div key={ch.name} className={styles.channelRow}>
              <div
                className={styles.colorBar}
                style={{ backgroundColor: ch.color }}
              />
              <div className={styles.channelInfo}>
                <span className={styles.channelName} title={ch.name}>
                  {ch.name}
                </span>
                <span
                  className={`${styles.channelValue} ${isDigital ? (value === 1 ? styles.high : styles.low) : ''}`}
                >
                  {displayVal}
                  {unit && <span className={styles.unit}> {unit}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChannelSidebar;
