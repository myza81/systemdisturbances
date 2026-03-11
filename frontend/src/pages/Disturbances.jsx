import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from './DashboardLayout';
import WaveformViewer from '../components/features/WaveformViewer';
import FileUploader from '../components/features/FileUploader';
import DisturbanceList from '../components/features/DisturbanceList';
import { RiPulseLine, RiFileUploadLine, RiBarChartLine } from 'react-icons/ri';
import styles from './Disturbances.module.css';

const Disturbances = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedDisturbanceId, setSelectedDisturbanceId] = useState(null);

  const tabs = [
    { id: 'upload', label: 'FILE UPLOAD', icon: RiFileUploadLine },
    { id: 'display', label: 'WAVEFORM DISPLAY', icon: RiBarChartLine },
  ];

  const handleUploadSuccess = (result) => {
    if (result && result.id) {
      setSelectedDisturbanceId(result.id);
      setActiveTab('display');
    } else {
      setActiveTab('display');
    }
  };

  return (
    <DashboardLayout>
      <div className={styles.pageWrapper}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            GRID <span className={styles.accent}>DISTURBANCES</span>
          </h1>
        </header>

        {/* Tab Navigation */}
        <div className={styles.tabsContainer}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="flex items-center gap-2">
                <tab.icon />
                {tab.label}
              </span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTab"
                  className={styles.activeIndicator}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          <AnimatePresence mode="wait">
            {activeTab === 'upload' ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                  <FileUploader onUploadSuccess={handleUploadSuccess} />
                </motion.div>
            ) : (
              <motion.div
                key="display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex min-h-0 overflow-hidden gap-6"
              >
                <DisturbanceList 
                  onSelect={setSelectedDisturbanceId} 
                  selectedId={selectedDisturbanceId} 
                />
                <div className="flex-1 min-w-0 flex flex-col pb-2">
                  <WaveformViewer disturbanceId={selectedDisturbanceId} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Disturbances;
