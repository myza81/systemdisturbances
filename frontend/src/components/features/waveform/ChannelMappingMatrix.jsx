import React from 'react';
import styles from './ChannelMappingMatrix.module.css';

const UNIT_SCALES = [
  { label: 'None (x1)', value: 1 },
  { label: 'Kilo (÷10³)', value: 0.001 },
  { label: 'Mega (÷10⁶)', value: 0.000001 },
];

const CHANNEL_TYPES = [
  { label: 'Voltage', value: 'voltage' },
  { label: 'Current', value: 'current' },
  { label: 'Frequency', value: 'frequency' },
  { label: 'Power (P)', value: 'power_p' },
  { label: 'Power (Q)', value: 'power_q' },
  { label: 'Power Angle', value: 'angle' },
  { label: 'Digital', value: 'digital' },
  { label: 'Other', value: 'other' },
];

const LINE_STYLES = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

const ChannelMappingMatrix = ({ channels, localConfigs, onChange, isModal = false }) => {
  return (
    <div className={`${styles.tableWrapper} ${isModal ? styles.modalTable : ''}`}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th>Show</th>
            <th>Source Name</th>
            <th>Display Title</th>
            <th>Type</th>
            <th>Scale</th>
            <th>Color</th>
            <th>Line Style</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch, idx) => {
            const config = localConfigs[ch.name] || {};
            const isDigital = ch.type === 'digital' || !ch.unit;
            
            return (
              <tr key={`${ch.name}-${idx}`}>
                <td className={styles.centerCol}>
                  <input 
                    type="checkbox" 
                    checked={config.visible !== false}
                    onChange={e => onChange(ch.name, 'visible', e.target.checked)}
                    className={styles.checkbox}
                  />
                </td>
                <td className={styles.sourceCol}>
                  <code>{ch.name}</code>
                  {ch.unit && <span className={styles.unitHint}>{ch.unit}</span>}
                </td>
                <td>
                  <input 
                    type="text" 
                    value={config.title || ''}
                    onChange={e => onChange(ch.name, 'title', e.target.value)}
                    className={styles.titleInput}
                    placeholder={ch.name}
                  />
                </td>
                <td>
                  <select 
                    value={config.type || (isDigital ? 'digital' : 'other')}
                    onChange={e => onChange(ch.name, 'type', e.target.value)}
                    className={styles.select}
                  >
                    {CHANNEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td>
                  <select 
                    value={config.scale || 1}
                    onChange={e => onChange(ch.name, 'scale', Number(e.target.value))}
                    className={styles.select}
                    disabled={isDigital}
                  >
                    {UNIT_SCALES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className={styles.centerCol}>
                  <div className={styles.colorWrapper}>
                    <input 
                      type="color" 
                      value={config.color || '#64748b'}
                      onChange={e => onChange(ch.name, 'color', e.target.value)}
                      className={styles.colorPicker}
                    />
                  </div>
                </td>
                <td>
                  <select 
                    value={config.lineStyle || 'solid'}
                    onChange={e => onChange(ch.name, 'lineStyle', e.target.value)}
                    className={styles.select}
                  >
                    {LINE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ChannelMappingMatrix;
