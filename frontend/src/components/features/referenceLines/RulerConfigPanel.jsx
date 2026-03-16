import React, { useState, useEffect } from 'react';
import { 
  RiRuler2Line, 
  RiEyeLine, 
  RiEyeOffLine, 
  RiRestartLine,
  RiArrowLeftSLine,
  RiArrowRightSLine
} from 'react-icons/ri';
import rulerManager from './RulerManager.js';
import styles from './RulerConfigPanel.module.css';

const RulerConfigPanel = () => {
  const [config, setConfig] = useState(rulerManager.getConfig());

  useEffect(() => {
    const unsubscribe = rulerManager.addListener(setConfig);
    return unsubscribe;
  }, []);

  const handleUpdate = (updates) => {
    rulerManager.updateConfig(updates);
  };

  const handleOffsetChange = (delta) => {
    handleUpdate({ offsetMs: config.offsetMs + delta });
  };

  const handleReset = () => {
    rulerManager.reset();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.scrollArea}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <RiRuler2Line className={styles.sectionIcon} />
            Layering Ruler Settings
          </div>
          
          <p className={styles.description}>
            The ruler acts as a secondary synchronized time axis. Move it to align a specific point (e.g. zero-crossing) as the new reference "0s".
          </p>

          <div className={styles.controlRow}>
            <span className={styles.label}>Enable Ruler</span>
            <button 
              className={`${styles.toggleBtn} ${config.enabled ? styles.active : ''}`}
              onClick={() => handleUpdate({ enabled: !config.enabled })}
            >
              {config.enabled ? <RiEyeLine /> : <RiEyeOffLine />}
            </button>
          </div>

          {config.enabled && (
            <div className={styles.rulerControls}>
              <div className={styles.field}>
                <label>Offset (ms)</label>
                <div className={styles.inputWithButtons}>
                  <button onClick={() => handleOffsetChange(-10)} title="-10ms"><RiArrowLeftSLine /></button>
                  <input 
                    type="number" 
                    value={config.offsetMs.toFixed(2)}
                    onChange={(e) => handleUpdate({ offsetMs: parseFloat(e.target.value) || 0 })}
                    step="0.01"
                  />
                  <button onClick={() => handleOffsetChange(10)} title="+10ms"><RiArrowRightSLine /></button>
                </div>
              </div>

              <div className={styles.quickActions}>
                <button onClick={() => handleOffsetChange(-100)}>-100ms</button>
                <button onClick={() => handleOffsetChange(-1)}>-1ms</button>
                <button onClick={() => handleOffsetChange(1)}>+1ms</button>
                <button onClick={() => handleOffsetChange(100)}>+100ms</button>
              </div>

              <div className={styles.note}>
                Note: This only affects the ruler's labels, not the data or main axis.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.resetBtn} onClick={handleReset}>
          <RiRestartLine /> Reset Ruler
        </button>
      </div>
    </div>
  );
};

export default RulerConfigPanel;
