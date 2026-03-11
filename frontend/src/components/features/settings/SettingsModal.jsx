/**
 * SettingsModal – dedicated settings panel with tabs:
 * - Colors: phase (R/Y/B/N) and channel color customization
 * - Theme: background, grid, cursor, digital colors
 * - Display: default window, RMS behavior
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RiCloseLine, RiPaletteLine, RiContrastLine, RiSettings3Line } from 'react-icons/ri';
import styles from './SettingsModal.module.css';

const TABS = [
  { id: 'colors', label: 'Phase Colors', icon: <RiPaletteLine /> },
  { id: 'theme', label: 'Theme', icon: <RiContrastLine /> },
  { id: 'display', label: 'Display', icon: <RiSettings3Line /> },
];

const ColorSwatch = ({ label, value, path, onUpdate }) => (
  <div className={styles.swatchRow}>
    <label className={styles.swatchLabel}>{label}</label>
    <div className={styles.swatchControls}>
      <input
        type="color"
        value={value}
        className={styles.colorInput}
        onChange={(e) => onUpdate(path, e.target.value)}
      />
      <span className={styles.hexValue}>{value}</span>
    </div>
  </div>
);

const SettingsModal = ({ settings, onUpdate, onClose }) => {
  const [activeTab, setActiveTab] = useState('colors');

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        className={styles.panel}
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>⚙ Settings</span>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.content}>
          {activeTab === 'colors' && (
            <section>
              <p className={styles.sectionNote}>
                3-phase color coding applied automatically from channel names.
                These are also used for the waveform lines.
              </p>
              <div className={styles.swatchGroup}>
                <ColorSwatch label="Phase R (Red)"    value={settings.phaseColors.R} path="phaseColors.R" onUpdate={onUpdate} />
                <ColorSwatch label="Phase Y (Yellow)" value={settings.phaseColors.Y} path="phaseColors.Y" onUpdate={onUpdate} />
                <ColorSwatch label="Phase B (Blue)"   value={settings.phaseColors.B} path="phaseColors.B" onUpdate={onUpdate} />
                <ColorSwatch label="Phase N (Neutral/Green)" value={settings.phaseColors.N} path="phaseColors.N" onUpdate={onUpdate} />
                <ColorSwatch label="Unknown / Other"  value={settings.phaseColors.default} path="phaseColors.default" onUpdate={onUpdate} />
              </div>
            </section>
          )}

          {activeTab === 'theme' && (
            <section>
              <p className={styles.sectionNote}>
                Visual theme for the waveform display and exported reports.
              </p>
              <div className={styles.swatchGroup}>
                <ColorSwatch label="Background"       value={settings.theme.background}       path="theme.background"       onUpdate={onUpdate} />
                <ColorSwatch label="Grid Lines"       value={settings.theme.gridColor}        path="theme.gridColor"        onUpdate={onUpdate} />
                <ColorSwatch label="Axis Text"        value={settings.theme.textColor}        path="theme.textColor"        onUpdate={onUpdate} />
                <ColorSwatch label="Cursor A"         value={settings.theme.cursorAColor}     path="theme.cursorAColor"     onUpdate={onUpdate} />
                <ColorSwatch label="Cursor B"         value={settings.theme.cursorBColor}     path="theme.cursorBColor"     onUpdate={onUpdate} />
                <ColorSwatch label="Digital High"     value={settings.theme.digitalHighColor} path="theme.digitalHighColor" onUpdate={onUpdate} />
                <ColorSwatch label="Digital Low"      value={settings.theme.digitalLowColor}  path="theme.digitalLowColor"  onUpdate={onUpdate} />
              </div>
            </section>
          )}

          {activeTab === 'display' && (
            <section>
              <div className={styles.displayOption}>
                <label className={styles.optionLabel}>Default window size (ms)</label>
                <select
                  className={styles.optionSelect}
                  value={settings.display.defaultWindowMs}
                  onChange={(e) => onUpdate('display.defaultWindowMs', Number(e.target.value))}
                >
                  {[100, 200, 500, 1000, 2000, 5000].map(v => (
                    <option key={v} value={v}>{v} ms</option>
                  ))}
                </select>
              </div>

              <div className={styles.displayOption}>
                <label className={styles.optionLabel}>System nominal frequency (Hz)</label>
                <select
                  className={styles.optionSelect}
                  value={settings.display.nominalFrequency || 50}
                  onChange={(e) => onUpdate('display.nominalFrequency', Number(e.target.value))}
                >
                  <option value={50}>50 Hz</option>
                  <option value={60}>60 Hz</option>
                </select>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerNote}>Settings are saved automatically to your browser.</p>
          <button className={styles.resetBtn} onClick={() => {
            if (window.confirm('Reset all settings to defaults?')) {
              localStorage.removeItem('waveform_app_settings');
              window.location.reload();
            }
          }}>Reset Defaults</button>
        </div>
      </motion.div>
    </>
  );
};

export default SettingsModal;
