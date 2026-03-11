import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RiCloseLine, RiAddLine, RiDeleteBin7Line, RiCalculatorLine } from 'react-icons/ri';
import styles from './CalculatedChannelModal.module.css';

const OPERATORS = ['+', '-', '*', '/', '(', ')', ' '];

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

const CalculatedChannelModal = ({ analogChannels, definitions, onUpdate, onClose }) => {
  const [localDefs, setLocalDefs] = useState(definitions.map(d => ({
    ...d,
    formula: d.formula || `[${d.sourceA || ''}] ${d.operator || '+'} [${d.sourceB || ''}]`
  })) || []);

  const handleAdd = () => {
    const newDef = {
      id: crypto.randomUUID(),
      name: `Calc ${localDefs.length + 1}`,
      formula: '',
      color: DEFAULT_COLORS[localDefs.length % DEFAULT_COLORS.length]
    };
    setLocalDefs([...localDefs, newDef]);
  };

  const handleUpdate = (id, field, value) => {
    setLocalDefs(localDefs.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const insertAtCursor = (id, text) => {
    const input = document.getElementById(`formula-${id}`);
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const currentVal = input.value;
    const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
    
    handleUpdate(id, 'formula', newVal);
    
    // Set cursor position after update (requires timeout for React to render)
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const validateFormula = (formula) => {
    if (!formula.trim()) return "Formula cannot be empty";
    // Basic bracket balance check
    const stack = [];
    for (const char of formula) {
      if (char === '(') stack.push('(');
      if (char === ')') {
        if (stack.length === 0) return "Unbalanced parentheses";
        stack.pop();
      }
    }
    if (stack.length > 0) return "Unbalanced parentheses";
    
    // Check for unknown channels (wrapped in [])
    const matches = formula.match(/\[(.*?)\]/g);
    if (matches) {
      const channelNames = analogChannels.map(ch => ch.name);
      for (const match of matches) {
        const name = match.slice(1, -1);
        if (!channelNames.includes(name)) return `Unknown channel: ${name}`;
      }
    }
    return null;
  };

  const handleDelete = (id) => {
    setLocalDefs(localDefs.filter(d => d.id !== id));
  };

  const handleSave = () => {
    // Validate all formulas before saving
    const errors = localDefs.map(d => validateFormula(d.formula)).filter(Boolean);
    if (errors.length > 0) {
      alert("Please fix the formula errors before saving.");
      return;
    }
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
            Build custom waveforms using formulas. Tip: Use brackets for channel names, e.g. [IA] + [IB].
          </p>

          <div className={styles.list}>
            {localDefs.map(def => {
              const error = validateFormula(def.formula);
              return (
                <div key={def.id} className={styles.defRow}>
                  <div className={styles.rowMain}>
                    <input 
                      className={styles.nameInput}
                      value={def.name}
                      onChange={e => handleUpdate(def.id, 'name', e.target.value)}
                      placeholder="Label"
                    />
                    
                    <div className={styles.formulaContainer}>
                      <div className={styles.formulaInputWrapper}>
                        <input 
                          id={`formula-${def.id}`}
                          className={`${styles.formulaInput} ${error ? styles.invalid : ''}`}
                          value={def.formula}
                          onChange={e => handleUpdate(def.id, 'formula', e.target.value)}
                          placeholder="Formula... e.g. [IA] + [IB]"
                        />
                      </div>

                      <div className={styles.builderTools}>
                        <span className={styles.toolLabel}>Insert:</span>
                        <select 
                          className={styles.chSelector}
                          value=""
                          onChange={(e) => {
                            if (e.target.value) insertAtCursor(def.id, `[${e.target.value}]`);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Channel...</option>
                          {analogChannels.map(ch => (
                            <option key={ch.id} value={ch.name}>{ch.name}</option>
                          ))}
                        </select>

                        {OPERATORS.map(op => (
                          <button 
                            key={op} 
                            className={styles.toolBtn}
                            onClick={() => insertAtCursor(def.id, op)}
                          >
                            {op === ' ' ? '␣' : op}
                          </button>
                        ))}
                      </div>

                      {error && (
                        <div className={styles.errorMsg}>
                          <span>⚠</span> {error}
                        </div>
                      )}
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
              );
            })}

            {localDefs.length === 0 && (
              <div className={styles.empty}>
                <p>No calculations defined.</p>
              </div>
            )}
          </div>

          <button className={styles.addBtn} onClick={handleAdd}>
            <RiAddLine /> New Calculation
          </button>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Apply Formulas</button>
        </footer>
      </motion.div>
    </div>
  );
};

export default CalculatedChannelModal;
