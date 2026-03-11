import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from './DashboardLayout';
import WaveformViewer from '../components/features/WaveformViewer';
import FileUploader from '../components/features/FileUploader';
import DisturbanceList from '../components/features/DisturbanceList';
import { RiPulseLine, RiFileUploadLine, RiBarChartLine, RiArrowLeftSLine, RiArrowRightSLine } from 'react-icons/ri';
import styles from './Disturbances.module.css';

const Disturbances = () => {
  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'repository'
  const [selectedDisturbanceId, setSelectedDisturbanceId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleUploadSuccess = (result) => {
    if (result && result.id) {
      setSelectedDisturbanceId(result.id);
      setActiveTab('repository'); // Switch to repository after successful upload
      setIsCollapsed(false); // Ensure panel is visible to see the list
    }
  };

  return (
    <DashboardLayout>
      <div className={styles.splitLayout}>
        {/* Left Panel: File Management with Tabs */}
        <motion.aside 
          className={styles.leftPanel}
          animate={{ 
            width: isCollapsed ? '48px' : '280px',
            marginRight: isCollapsed ? '0.25rem' : '0.25rem'
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <button 
            className={styles.collapseToggle}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <RiArrowRightSLine /> : <RiArrowLeftSLine />}
          </button>

          <div className={styles.tabHeader} style={{ opacity: isCollapsed ? 0 : 1, pointerEvents: isCollapsed ? 'none' : 'auto' }}>
            <button 
              className={`${styles.tabButton} ${activeTab === 'import' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('import')}
            >
              <RiFileUploadLine /> Import
            </button>
            <button 
              className={`${styles.tabButton} ${activeTab === 'repository' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('repository')}
            >
              <RiBarChartLine /> Repository
            </button>
          </div>

          <div className={styles.tabContent} style={{ opacity: isCollapsed ? 0 : 1, pointerEvents: isCollapsed ? 'none' : 'auto' }}>
            <AnimatePresence mode="wait">
              {activeTab === 'import' ? (
                <motion.div
                  key="import"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <FileUploader onUploadSuccess={handleUploadSuccess} />
                </motion.div>
              ) : (
                <motion.div
                  key="repository"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <DisturbanceList 
                    onSelect={setSelectedDisturbanceId} 
                    selectedId={selectedDisturbanceId} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>

        {/* Right Panel: Analysis */}
        <main className={styles.rightPanel}>
          <WaveformViewer disturbanceId={selectedDisturbanceId} />
        </main>
      </div>
    </DashboardLayout>
  );
};

export default Disturbances;
