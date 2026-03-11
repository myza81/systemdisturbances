import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RiCloseLine, RiAddLine, RiDeleteBin7Line, RiCalculatorLine } from 'react-icons/ri';
import styles from './CalculatedChannelModal.module.css';

const OPERATORS = [
  { value: '+', label: 'Add (+)' },
  { value: '-', label: 'Subtract (-)' },
  { value: '*', label: 'Multiply (*)' },
  { value: '/', label: 'Divide (/)' },
];

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

const CalculatedChannelModal = ({ analogChannels, definitions, onUpdate, onClose }) => {
  const [localDefs, setLocalDefs] = useState(definitions || []);

  const handleAdd = () => {
    const newDef = {
      id: crypto.randomUUID(),
      name: `Calc ${localDefs.length + 1}`,
      sourceA: analogChannels[0]?.name || '',
      sourceB: analogChannels[1]?.name || analogChannels[0]?.name || '',
      operator: '+',
      color: DEFAULT_COLORS[localDefs.length % DEFAULT_COLORS.length]
    };
    setLocalDefs([...localDefs, newDef]);
  };

  const handleUpdate = (id, field, value) => {
    setLocalDefs(localDefs.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleDelete = (id) => {
    setLocalDefs(localDefs.filter(d => d.id !== id));
  };

  const handleSave = () => {
    onUpdate(localDefs);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <motion.div 
        className={styles.modal} 
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <RiCalculatorLine className={styles.titleIcon} />
            <h2>Calculated Channels</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </header>

        <div className={styles.content}>
          <p className={styles.description}>
            Define virtual waveforms by performing math on existing analog channels.
          </p>

          <div className={styles.list}>
            {localDefs.map(def => (
              <div key={def.id} className={styles.defRow}>
                <div className={styles.rowMain}>
                  <input 
                    className={styles.nameInput}
                    value={def.name}
                    onChange={e => handleUpdate(def.id, 'name', e.target.value)}
                    placeholder="Channel Name"
                  />
                  
                  <div className={styles.mathEquation}>
                    <select 
                      value={def.sourceA}
                      onChange={e => handleUpdate(def.id, 'sourceA', e.target.value)}
                      className={styles.select}
                    >
                      {analogChannels.map(ch => (
                        <option key={ch.id} value={ch.name}>{ch.name}</option>
                      ))}
                    </select>

                    <select 
                      value={def.operator}
                      onChange={e => handleUpdate(def.id, 'operator', e.target.value)}
                      className={styles.opSelect}
                    >
                      {OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.value}</option>
                      ))}
                    </select>

                    <select 
                      value={def.sourceB}
                      onChange={e => handleUpdate(def.id, 'sourceB', e.target.value)}
                      className={styles.select}
                    >
                      {analogChannels.map(ch => (
                        <option key={ch.id} value={ch.name}>{ch.name}</option>
                      ))}
                    </select>
                  </div>

                  <input 
                    type="color" 
                    value={def.color}
                    onChange={e => handleUpdate(def.id, 'color', e.target.value)}
                    className={styles.colorPicker}
                  />
                </div>

                <button 
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(def.id)}
                  title="Delete definition"
                >
                  <RiDeleteBin7Line />
                </button>
              </div>
            ))}

            {localDefs.length === 0 && (
              <div className={styles.empty}>
                <p>No calculated channels defined yet.</p>
              </div>
            )}
          </div>

          <button className={styles.addBtn} onClick={handleAdd}>
            <RiAddLine /> Add Calculation
          </button>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Apply Changes</button>
        </footer>
      </motion.div>
    </div>
  );
};

export default CalculatedChannelModal;
