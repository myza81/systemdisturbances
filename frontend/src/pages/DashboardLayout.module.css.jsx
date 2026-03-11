import React from 'react';
import Sidebar from '../components/common/Sidebar';
import { RiNotification3Line, RiSearchLine, RiSettingsLine } from 'react-icons/ri';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children }) => {
  return (
    <div className={styles.layout}>
      <Sidebar />
      
      <div className={`${styles.mainWrapper} scanline`}>
        {/* Top Navigation */}
        <header className={styles.header}>
          <div className={styles.searchBar}>
            <RiSearchLine className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Search disturbances, frequency, or node data..." 
              className={styles.searchInput}
            />
          </div>

          <div className={styles.headerActions}>
            <div className={styles.gridStatus}>
              <div className={styles.statusDot}></div>
              <span className={styles.statusText}>GRID STATUS: OPTIMAL</span>
            </div>
            
            <div className={styles.iconGroup}>
              <button className={styles.actionBtn}>
                <RiNotification3Line size={20} />
              </button>
              <button className={styles.actionBtn}>
                <RiSettingsLine size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
