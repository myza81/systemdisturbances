import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiCloseLine, RiEyeLine, RiEyeOffLine, RiFilterLine } from 'react-icons/ri';
import styles from './ChannelVisibilityDrawer.module.css';

const ChannelVisibilityDrawer = ({ channels, hiddenChannels, onToggle, onClose }) => {
  const analog = channels.filter(c => c.type === 'analog');
  const digital = channels.filter(c => c.type === 'digital');

  const handleToggle = (name) => {
    const next = new Set(hiddenChannels);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onToggle(next);
  };

  const ChannelItem = ({ ch }) => {
    const isHidden = hiddenChannels.has(ch.name);
    return (
      <div 
        className={`${styles.channelItem} ${isHidden ? styles.itemHidden : ''}`}
        onClick={() => handleToggle(ch.name)}
      >
        <div className={styles.itemMain}>
          <div className={styles.colorIndicator} style={{ backgroundColor: ch.color }} />
          <span className={styles.itemName}>{ch.title || ch.name}</span>
        </div>
        <button className={styles.visibilityBtn}>
          {isHidden ? <RiEyeOffLine /> : <RiEyeLine />}
        </button>
      </div>
    );
  };

  return (
    <>
      <motion.div 
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div 
        className={styles.drawer}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <RiFilterLine />
            <span>Channel Visibility</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </header>

        <div className={styles.content}>
          {analog.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Analog Channels</h4>
              <div className={styles.itemList}>
                {analog.map(ch => <ChannelItem key={ch.name} ch={ch} />)}
              </div>
            </section>
          )}

          {digital.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Digital Channels</h4>
              <div className={styles.itemList}>
                {digital.map(ch => <ChannelItem key={ch.name} ch={ch} />)}
              </div>
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.actionBtn} onClick={() => onToggle(new Set())}>Show All</button>
          <button className={styles.actionBtn} onClick={() => onToggle(new Set(channels.map(c => c.name)))}>Hide All</button>
        </footer>
      </motion.div>
    </>
  );
};

export default ChannelVisibilityDrawer;
