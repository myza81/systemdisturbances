import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RiCloseLine, RiTableLine, RiRefreshLine, RiCheckLine } from 'react-icons/ri';
import styles from './ChannelMappingModal.module.css';
import ChannelMappingMatrix from './ChannelMappingMatrix';

const ChannelMappingModal = ({ 
  disturbanceId, 
  analogChannels = [], 
  digitalChannels = [], 
  configs = {}, 
  onUpdate, 
  onSaveSuccess, 
  onClose, 
  settings,
  isIngestion = false // New prop to handle import-time mapping
}) => {
  const [localConfigs, setLocalConfigs] = useState(configs);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize configs for any new channels found
  useEffect(() => {
    const next = { ...localConfigs };
    let changed = false;
    
    [...(analogChannels || []), ...(digitalChannels || [])].forEach(ch => {
      if (!next[ch.name]) {
        const isDigital = ch.type === 'digital' || !ch.unit;
        next[ch.name] = {
          visible: true,
          title: ch.title || ch.label || ch.name,
          type: isDigital ? 'digital' :
                (ch.unit || '').toLowerCase().includes('v') ? 'voltage' : 
                (ch.unit || '').toLowerCase().includes('a') ? 'current' : 'other',
          scale: ch.scale || 1,
          color: ch.color || { R: '#ef4444', Y: '#f59e0b', B: '#3b82f6', N: '#10b981' }[ch.phase] || (isDigital ? '#00e676' : '#64748b'),
          lineStyle: 'solid'
        };
        changed = true;
      }
    });

    if (changed) setLocalConfigs(next);
  }, [analogChannels, digitalChannels, settings]);

  const handleChange = (name, field, value) => {
    setLocalConfigs(prev => ({
      ...prev,
      [name]: { ...prev[name], [field]: value }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Return configs to parent if provided (essential for ingestion)
      if (onUpdate) {
        onUpdate('channelConfigs', localConfigs);
      }

      // 2. Persist to backend record specifically (only if we have an ID)
      if (disturbanceId) {
        await fetch(`/api/v1/disturbances/${disturbanceId}/channel-config/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localConfigs)
        });
      }
      
      if (onSaveSuccess) onSaveSuccess(localConfigs);
      onClose();
    } catch (err) {
      console.error('Failed to save channel mapping:', err);
      alert('Failed to save mapping to repository.');
    } finally {
      setIsSaving(false);
    }
  };

  const allCh = [...analogChannels, ...digitalChannels];

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
            <RiTableLine className={styles.titleIcon} />
            <h2>{isIngestion ? 'Assisted Channel Mapping' : 'Channel Mapping Matrix'}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </header>

        <div className={styles.content}>
          <ChannelMappingMatrix 
            channels={allCh}
            localConfigs={localConfigs}
            onChange={handleChange}
            isModal={true}
          />
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
            {isSaving ? <RiRefreshLine className="animate-spin" /> : <RiCheckLine />}
            {isSaving ? ' Processing...' : (isIngestion ? 'Confirm & Apply Metadata' : 'Update Channel Configurations')}
          </button>
        </footer>
      </motion.div>
    </div>
  );
};

export default ChannelMappingModal;
