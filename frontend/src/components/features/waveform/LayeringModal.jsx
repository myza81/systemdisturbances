import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RiCloseLine, RiAddLine, RiDeleteBinLine, 
  RiStackLine, RiCheckboxCircleLine, RiSquareLine 
} from 'react-icons/ri';
import styles from './LayeringModal.module.css';

const getChannelType = (unit) => {
  if (!unit) return 'Other';
  const u = unit.trim().toLowerCase();
  if (u === 'v' || u === 'kv' || u.includes('volt')) return 'Voltage';
  if (u === 'a' || u === 'ka' || u.includes('amp')) return 'Current';
  if (u === 'hz' || u.includes('freq')) return 'Frequency';
  return 'Other';
};

const LayeringModal = ({ 
  analogChannels: initialChannels, 
  groups, 
  onUpdate, 
  onClose, 
  disturbances, 
  samplingInterval = 1,
  editingGroupId // New prop
}) => {
  const [tempName, setTempName] = useState('');
  const [tempChannels, setTempChannels] = useState([]); // [{ name, yAxis, color, offsetMs, disturbanceId }]
  
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [selectedDisturbanceId, setSelectedDisturbanceId] = useState(null);
  const [activeAnalogChannels, setActiveAnalogChannels] = useState(initialChannels);

  // Initialize state based on editingGroupId
  useEffect(() => {
    if (editingGroupId && editingGroupId !== 'new') {
      const group = groups.find(g => g.id === editingGroupId);
      if (group) {
        setTempName(group.name);
        setTempChannels(group.channels);
      }
    } else {
      setTempName(`Layer Group ${groups.length + 1}`);
      setTempChannels([]);
    }
    setValidationError(null);
  }, [editingGroupId, groups]);

  // Fetch channels when disturbance changed in selector
  useEffect(() => {
    if (!selectedDisturbanceId) {
      setActiveAnalogChannels(initialChannels);
      return;
    }
    setLoadingChannels(true);
    fetch(`/api/v1/disturbances/${selectedDisturbanceId}/channels/`)
      .then(r => r.json())
      .then(data => {
        setActiveAnalogChannels((data.analog || []).map(ch => ({ ...ch, disturbanceId: selectedDisturbanceId })));
      })
      .catch(console.error)
      .finally(() => setLoadingChannels(false));
  }, [selectedDisturbanceId, initialChannels]);

  const handleSave = () => {
    if (!tempName.trim() || tempChannels.length === 0) return;
    
    const id = (editingGroupId && editingGroupId !== 'new') ? editingGroupId : Math.random().toString(36).substr(2, 9);
    const newGroup = {
      id,
      name: tempName,
      channels: tempChannels
    };

    if (editingGroupId === 'new' || !editingGroupId) {
      onUpdate([...groups, newGroup]);
    } else {
      onUpdate(groups.map(g => g.id === id ? newGroup : g));
    }
    onClose();
  };

  const toggleChannelSelection = (ch) => {
    const isSelected = tempChannels.find(tc => tc.name === ch.name && tc.disturbanceId === ch.disturbanceId);
    if (isSelected) {
      setTempChannels(tempChannels.filter(tc => !(tc.name === ch.name && tc.disturbanceId === ch.disturbanceId)));
      setValidationError(null);
    } else {
      const chType = getChannelType(ch.unit);
      const existingTypes = new Set(tempChannels.map(tc => tc.type));
      
      if (existingTypes.size >= 2 && !existingTypes.has(chType)) {
        setValidationError(`Cannot add "${chType}" channel. Group already contains ${Array.from(existingTypes).join(' and ')}.`);
        return;
      }

      setTempChannels([...tempChannels, { 
        name: ch.name, 
        yAxis: 'left', 
        color: ch.color || '#64748b',
        offsetMs: 0,
        disturbanceId: ch.disturbanceId,
        type: chType
      }]);
      setValidationError(null);
    }
  };

  const updateChannelConfig = (name, key, value) => {
    setTempChannels(tempChannels.map(tc => tc.name === name ? { ...tc, [key]: value } : tc));
  };

  const modalContent = (
    <>
      <motion.div 
        className={styles.backdrop} 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
      />
      <motion.div 
        className={styles.modal} 
        initial={{ scale: 0.95, opacity: 0, x: '-50%', y: '-45%' }} 
        animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }} 
        exit={{ scale: 0.95, opacity: 0, x: '-50%', y: '-45%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <RiStackLine className={styles.titleIcon} />
            <span className={styles.titleText}>Channel Layering</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </header>

        <div className={styles.body}>
          <div className={styles.editorView}>
            <div className={styles.editorSection}>
              <label className={styles.fieldLabel}>Group Name</label>
              <input 
                type="text" 
                className={styles.nameInput} 
                value={tempName} 
                onChange={e => setTempName(e.target.value)}
                placeholder="e.g., Voltage Overlay"
                autoFocus
              />
            </div>

            <div className={styles.editorLayout}>
              <div className={styles.channelPicker}>
                <label className={styles.fieldLabel}>Disturbance Record</label>
                <select 
                  className={styles.disturbanceSelect}
                  value={selectedDisturbanceId || ''}
                  onChange={(e) => setSelectedDisturbanceId(e.target.value)}
                >
                  <option value="">Current Record</option>
                  {disturbances.map(d => (
                    <option key={d.id} value={d.id}>{d.name || `Record ${d.id}`}</option>
                  ))}
                </select>

                <label className={styles.fieldLabel} style={{ marginTop: '1.25rem' }}>Select Channels</label>
                <div className={styles.pickerScroll}>
                  {loadingChannels ? (
                    <div className={styles.pickerLoading}><RiLoader4Line className={styles.spinner} /></div>
                  ) : (
                    activeAnalogChannels.map(ch => {
                      const isSelected = tempChannels.find(tc => tc.name === ch.name && tc.disturbanceId === ch.disturbanceId);
                      const chType = getChannelType(ch.unit);
                      const existingTypes = new Set(tempChannels.map(tc => tc.type));
                      const isFull = existingTypes.size >= 2;
                      const isCompatible = existingTypes.has(chType);
                      const isDisabled = !isSelected && isFull && !isCompatible;

                      return (
                        <div 
                          key={`${ch.disturbanceId}-${ch.name}`} 
                          className={`${styles.pickerItem} ${isSelected ? styles.itemSelected : ''} ${isDisabled ? styles.itemDisabled : ''}`}
                          onClick={() => !isDisabled && toggleChannelSelection(ch)}
                          title={isDisabled ? `Cannot add ${chType} channel. Group already has 2 types.` : ''}
                        >
                          <div className={styles.checkIcon}>
                            {isSelected ? <RiCheckboxCircleLine /> : <RiSquareLine />}
                          </div>
                          <div className={styles.chRowText}>
                            <span className={styles.chTitle}>{ch.title || ch.name}</span>
                            {ch.unit && <span className={styles.chUnit}>{ch.unit}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className={styles.configList}>
                <label className={styles.fieldLabel}>Selected Channels</label>
                <div className={styles.configScroll}>
                  {tempChannels.length === 0 ? (
                    <div className={styles.emptyConfig}>
                      <RiStackLine className={styles.emptyIcon} />
                      <p>Select channels from the left to add to this group</p>
                    </div>
                  ) : (
                    tempChannels.map(tc => (
                      <div key={`${tc.disturbanceId}-${tc.name}`} className={styles.configRow}>
                        <div className={styles.rowLead}>
                          <div className={styles.dot} style={{ backgroundColor: tc.color }} />
                          <div className={styles.configText}>
                            <span className={styles.configName}>{tc.name}</span>
                            <span className={styles.configFile}>
                              {disturbances.find(d => String(d.id) === String(tc.disturbanceId))?.name || 'Primary Record'}
                            </span>
                          </div>
                        </div>
                        <button className={styles.iconBtnRed} onClick={() => toggleChannelSelection(tc)}>
                          <RiDeleteBinLine />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={styles.editorFooter}>
              {validationError && (
                <div className={styles.validationError}>
                  {validationError}
                </div>
              )}
              <div className={styles.footerActions}>
                <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                <button 
                  className={styles.saveBtn} 
                  onClick={handleSave}
                  disabled={!tempName.trim() || tempChannels.length === 0}
                >Update Group</button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default LayeringModal;
