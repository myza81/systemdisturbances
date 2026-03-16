import React, { useState, useEffect } from 'react';
import { 
  RiGridLine, 
  RiEyeLine, 
  RiEyeOffLine, 
  RiRestartLine 
} from 'react-icons/ri';
import gridConfigManager from './GridConfigManager.js';
import styles from './GridConfigPanel.module.css';

const GridConfigPanel = () => {
  const [config, setConfig] = useState(gridConfigManager.getConfig());

  useEffect(() => {
    const unsubscribe = gridConfigManager.addListener(setConfig);
    return unsubscribe;
  }, []);

  const handleUpdate = (axis, type, updates) => {
    gridConfigManager.updateConfig(axis, type, updates);
  };

  const handleReset = () => {
    if (window.confirm('Reset grid settings to defaults?')) {
      gridConfigManager.reset();
    }
  };

  const renderGridSection = (axis, title) => {
    const axisConfig = config[axis];
    
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <RiGridLine className={styles.sectionIcon} />
          {title} Axis Grid
        </div>

        {/* Major Grid */}
        <div className={styles.gridRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>Major Grid</span>
            <button 
              className={`${styles.toggleBtn} ${axisConfig.major.show ? styles.active : ''}`}
              onClick={() => handleUpdate(axis, 'major', { show: !axisConfig.major.show })}
              title={axisConfig.major.show ? 'Hide Major Grid' : 'Show Major Grid'}
            >
              {axisConfig.major.show ? <RiEyeLine /> : <RiEyeOffLine />}
            </button>
          </div>
          
          {axisConfig.major.show && (
            <div className={styles.rowControls}>
              <div className={styles.inputGroup}>
                <label>Interval</label>
                <input 
                  type="number"
                  value={axisConfig.major.interval === null ? '' : axisConfig.major.interval}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    handleUpdate(axis, 'major', { interval: val });
                  }}
                  placeholder="Auto"
                  step="any"
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Style</label>
                <select 
                  value={axisConfig.major.type}
                  onChange={(e) => handleUpdate(axis, 'major', { type: e.target.value })}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label>Opacity</label>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={axisConfig.major.opacity}
                  onChange={(e) => handleUpdate(axis, 'major', { opacity: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Minor Grid */}
        <div className={styles.gridRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>Minor Grid</span>
            <button 
              className={`${styles.toggleBtn} ${axisConfig.minor.show ? styles.active : ''}`}
              onClick={() => handleUpdate(axis, 'minor', { show: !axisConfig.minor.show })}
              title={axisConfig.minor.show ? 'Hide Minor Grid' : 'Show Minor Grid'}
            >
              {axisConfig.minor.show ? <RiEyeLine /> : <RiEyeOffLine />}
            </button>
          </div>

          {axisConfig.minor.show && (
            <div className={styles.rowControls}>
              <div className={styles.inputGroup}>
                <label>Interval</label>
                <input 
                  type="number"
                  value={axisConfig.minor.interval === null ? '' : axisConfig.minor.interval}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    handleUpdate(axis, 'minor', { interval: val });
                  }}
                  placeholder="Auto"
                  step="any"
                />
              </div>
              <div className={styles.inputGroup}>
                <label>Style</label>
                <select 
                  value={axisConfig.minor.type}
                  onChange={(e) => handleUpdate(axis, 'minor', { type: e.target.value })}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label>Opacity</label>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={axisConfig.minor.opacity}
                  onChange={(e) => handleUpdate(axis, 'minor', { opacity: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.scrollArea}>
        {renderGridSection('x', 'Time (X)')}
        {renderGridSection('y', 'Value (Y)')}
      </div>

      <div className={styles.footer}>
        <button className={styles.resetBtn} onClick={handleReset}>
          <RiRestartLine /> Reset to Defaults
        </button>
      </div>
    </div>
  );
};

export default GridConfigPanel;
