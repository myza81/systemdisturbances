import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RiTimeLine, RiLineChartLine, RiCloseLine, RiLayoutGridLine } from 'react-icons/ri';
import ReferenceLineControlPanel from './ReferenceLineControlPanel.jsx';
import GridConfigPanel from './GridConfigPanel.jsx';
import styles from './ReferenceLineDrawer.module.css';

const ReferenceLineDrawer = ({ onClose, sessionKey, lineIntersections }) => {
  const [activeTab, setActiveTab] = useState('lines');

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
            <RiTimeLine />
            <span>Reference Lines</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <RiCloseLine />
          </button>
        </header>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'lines' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('lines')}
          >
            <RiLineChartLine />
            <span>Lines</span>
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'grid' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('grid')}
          >
            <RiLayoutGridLine />
            <span>Grid</span>
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'lines' && <ReferenceLineControlPanel sessionKey={sessionKey} intersections={lineIntersections} />}
          {activeTab === 'grid' && <GridConfigPanel />}
        </div>
      </motion.div>
    </>
  );
};

export default ReferenceLineDrawer;
