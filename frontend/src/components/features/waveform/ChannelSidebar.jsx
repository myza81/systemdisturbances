/**
 * ChannelSidebar – Left panel showing channel labels, colors, and live cursor values.
 * Mirrors the left panel in the reference PSCAD-style waveform viewer.
 */
import React from 'react';
import styles from './ChannelSidebar.module.css';

const ChannelSidebar = ({ channels, hoveredValues, cursorAValues, cursorBValues, cursors, settings, laneHeight = 60 }) => {
  const { channels: hoverVals } = hoveredValues || {};
  const { active } = cursors || {};

  // For simplicity, we just show the values passed down. 
  // In a more complex app, we'd pre-calculate these in WaveformViewer.

  const formatVal = (val, isDigital) => {
    if (val === undefined || val === null) return '—';
    if (isDigital) return val === 1 ? 'ON' : 'OFF';
    return Number(val).toFixed(3);
  };

  return (
    <div className={styles.sidebar}>
      {/* Channel rows */}
      <div className={styles.channelList}>
        {channels.map((ch, idx) => {
          const isDigital = ch.type === 'digital';
          const valA = cursorAValues?.[ch.name];
          const valB = cursorBValues?.[ch.name];
          const valH = hoverVals?.[ch.name];
          const unit = isDigital ? '' : (ch.unit || '');

          return (
            <div 
              key={`${ch.name}-${idx}`} 
              className={styles.channelRow}
              style={{ height: `${laneHeight}px` }}
            >
              <div
                className={styles.colorBar}
                style={{ backgroundColor: ch.color }}
              />
              <div className={styles.channelInfo}>
                <div className={styles.nameSection}>
                  <span className={styles.channelName} title={ch.name}>
                    {ch.name}
                  </span>
                  {unit && <span className={styles.unit}>{unit}</span>}
                </div>
                
                <div className={styles.valueSection}>
                  {/* Cursor A */}
                  <div className={`${styles.valGroup} ${active === 'A' ? styles.active : ''}`}>
                    <span className={styles.valLabel}>A</span>
                    <span className={`${styles.valText} ${styles.cursorA}`}>
                      {formatVal(valA, isDigital)}
                    </span>
                  </div>
                  
                  {/* Cursor B */}
                  <div className={`${styles.valGroup} ${active === 'B' ? styles.active : ''}`}>
                    <span className={styles.valLabel}>B</span>
                    <span className={`${styles.valText} ${styles.cursorB}`}>
                      {formatVal(valB, isDigital)}
                    </span>
                  </div>

                  {/* Real-time Hover/Active Tracking */}
                  <div className={styles.valGroup}>
                    <span className={styles.valLabel}>H</span>
                    <span className={styles.valText}>
                      {formatVal(valH, isDigital)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChannelSidebar;
