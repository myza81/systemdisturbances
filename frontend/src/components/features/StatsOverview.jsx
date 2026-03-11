import React from 'react';
import { motion } from 'framer-motion';
import { 
  RiFlashlightLine, 
  RiPulseLine, 
  RiTimerFlashLine, 
  RiAlertLine 
} from 'react-icons/ri';
import styles from './StatsOverview.module.css';

const StatCard = ({ icon: Icon, label, value, unit, colorClass, trend }) => {
  const accentClass = styles[`accent${colorClass}`];
  const bgClass = styles[`accent${colorClass}Bg`];
  const glowClass = styles[`accent${colorClass}Glow`];

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className={`${styles.statCard} ${accentClass}`}
    >
      <div className={styles.cardHeader}>
        <div className={`${styles.iconWrapper} ${bgClass}`}>
          <Icon size={24} />
        </div>
        {trend !== undefined && (
          <span className={`${styles.trend} ${trend > 0 ? styles.trendUp : styles.trendDown}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <p className={styles.label}>{label}</p>
        <div className={styles.valueWrapper}>
          <h3 className={styles.value}>{value}</h3>
          <span className={styles.unit}>{unit}</span>
        </div>
      </div>
      <div className={`${styles.glow} ${glowClass}`}></div>
    </motion.div>
  );
};

const StatsOverview = () => {
  const stats = [
    { label: 'Grid Frequency', value: '49.98', unit: 'Hz', icon: RiPulseLine, colorClass: 'Cyan', trend: -0.02 },
    { label: 'Active Voltage', value: '231.4', unit: 'V', icon: RiFlashlightLine, colorClass: 'Emerald', trend: 0.5 },
    { label: 'Disturbance Events', value: '12', unit: 'Today', icon: RiAlertLine, colorClass: 'Amber', trend: 8 },
    { label: 'System Uptime', value: '99.98', unit: '%', icon: RiTimerFlashLine, colorClass: 'Cyan', trend: 0.01 },
  ];

  return (
    <div className={styles.statsGrid}>
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
};

export default StatsOverview;
