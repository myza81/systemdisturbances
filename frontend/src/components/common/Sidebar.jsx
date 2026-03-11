import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RiDashboardLine, 
  RiPulseLine, 
  RiLineChartLine, 
  RiSettings4Line, 
  RiFileUploadLine,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
  RiDatabase2Line
} from 'react-icons/ri';
import styles from './Sidebar.module.css';

const SidebarItem = ({ icon: Icon, label, collapsed, to }) => (
  <NavLink 
    to={to}
    className={({ isActive }) => `${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
  >
    <motion.div 
      className="flex items-center w-full"
      whileTap={{ scale: 0.98 }}
    >
      <div className={styles.sidebarItemIcon}>
        <Icon />
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.span 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className={styles.sidebarItemLabel}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  </NavLink>
);

const Sidebar = ({ collapsed, setCollapsed }) => {
  const items = [
    { name: 'Disturbances', icon: RiPulseLine, to: '/' },
  ];

  return (
    <motion.aside 
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      className={styles.sidebar}
    >
      <div className={styles.sidebarHeader}>
        <AnimatePresence>
          {!collapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.logo}
            >
              <div className={styles.logoIcon}>
                P
              </div>
              <span className={styles.logoText}>
                POWER<span className={styles.logoTextCore}>CORE</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className={styles.toggleBtn}
        >
          {collapsed ? <RiMenuUnfoldLine /> : <RiMenuFoldLine />}
        </button>
      </div>

      <nav className={styles.nav}>
        {items.map((item) => (
          <SidebarItem 
            key={item.name}
            to={item.to}
            icon={item.icon} 
            label={item.name} 
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={`${styles.userProfile} ${collapsed ? styles.userProfileCollapsed : ''}`}>
          <div className={styles.avatar}>
            AD
          </div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <p className={styles.userName}>Admin Operator</p>
              <p className={styles.userStatus}>System Active</p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
