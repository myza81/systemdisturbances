import React from 'react';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children }) => {
  return (
    <div className={styles.layout}>
      <header className={styles.topbar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>G</div>
          <span className={styles.logoText}>
            GRID DISTURBANCE<span className={styles.logoTextCore}> ANALYZER</span>
          </span>
        </div>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>AD</div>
          <span className={styles.userName}>Admin Operator</span>
        </div>
      </header>
      
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
