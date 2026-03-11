import React from 'react';
import { 
  RiAlertLine, 
  RiCheckboxCircleLine, 
  RiTimeLine, 
  RiErrorWarningLine 
} from 'react-icons/ri';
import styles from './ActivityLog.module.css';

const ActivityItem = ({ type, message, time }) => {
  const getStatusConfig = () => {
    switch(type) {
      case 'alert': return { icon: RiAlertLine, colorClass: styles.amber };
      case 'error': return { icon: RiErrorWarningLine, colorClass: styles.ruby };
      case 'success': return { icon: RiCheckboxCircleLine, colorClass: styles.emerald };
      default: return { icon: RiTimeLine, colorClass: styles.cyan };
    }
  };

  const { icon: Icon, colorClass } = getStatusConfig();

  return (
    <div className={styles.activityItem}>
      <div className={`${styles.iconWrapper} ${colorClass}`}>
        <Icon size={20} />
      </div>
      <div className={styles.itemContent}>
        <div className={styles.itemHeader}>
          <span className={`${styles.itemType} ${colorClass}`}>
            {type}
          </span>
          <span className={styles.itemTime}>{time}</span>
        </div>
        <p className={styles.itemMessage}>
          {message}
        </p>
      </div>
    </div>
  );
};

const ActivityLog = () => {
  const activities = [
    { type: 'error', message: 'Voltage Sag Detected at Node-04 (15% Deviation)', time: '10:42:01' },
    { type: 'alert', message: 'Frequency Fluctuation: 49.95Hz -> 50.02Hz', time: '10:38:15' },
    { type: 'success', message: 'Periodic System Diagnosis Complete: All Nodes Optimal', time: '10:15:00' },
    { type: 'info', message: 'Disturbance Log Exported to Cloud Storage', time: '09:45:12' },
    { type: 'alert', message: 'Transient Overvoltage Recovery at Substation-B', time: '09:30:45' },
  ];

  return (
    <div className={styles.logPanel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            <RiTimeLine /> ACTIVITY STREAM
          </h2>
          <p className={styles.subtitle}>Live grid telemetry and event tracking</p>
        </div>
        <button className={styles.viewAllBtn}>
          VIEW FULL LOG
        </button>
      </div>

      <div className={styles.stream}>
        {activities.map((activity, idx) => (
          <ActivityItem key={idx} {...activity} />
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.syncIndicator}>
          <div className={`${styles.syncDot} scanline`}></div>
          SYNCING IN REAL-TIME
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
