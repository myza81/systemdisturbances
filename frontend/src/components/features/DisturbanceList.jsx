import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RiHistoryLine, 
  RiPulseLine, 
  RiDeleteBinLine, 
  RiTimeLine,
  RiCheckDoubleLine
} from 'react-icons/ri';
import styles from './DisturbanceList.module.css';

const DisturbanceList = ({ onSelect, selectedId }) => {
  const [disturbances, setDisturbances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDisturbances();
  }, []);

  const fetchDisturbances = async () => {
    try {
      const response = await fetch('/api/v1/disturbances/all/');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const text = await response.text();
      if (!text) {
        setDisturbances([]);
        return;
      }

      const data = JSON.parse(text);
      setDisturbances(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch disturbances:', error);
      // Optional: set an error state to show in the UI
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-text-muted text-sm font-medium animate-pulse text-center">Loading captures...</div>;

  return (
    <div className={styles.listContainer}>
      <div className={styles.header}>
        <RiHistoryLine className="text-accent-primary" />
        <span className="font-bold text-xs tracking-wider uppercase opacity-70">Capture Repository</span>
      </div>

      <div className={styles.scrollArea}>
        {disturbances.length === 0 ? (
          <div className={styles.empty}>
            <p>No captures found.</p>
          </div>
        ) : (
          disturbances.map((item) => (
            <motion.div
              key={item.id}
              whileHover={{ x: 2 }}
              className={`${styles.item} ${selectedId === item.id ? styles.itemActive : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div className={styles.itemIcon}>
                <RiPulseLine />
              </div>
              <div className={styles.itemContent}>
                <h4 className={styles.itemName}>{item.name}</h4>
                <div className={styles.itemMeta}>
                  <span className="flex items-center gap-1"><RiTimeLine size={10} /> {new Date(item.timestamp).toLocaleDateString()}</span>
                  <span className="border-l border-border-light pl-2 uppercase">{item.source_type}</span>
                </div>
              </div>
              {selectedId === item.id && (
                <RiCheckDoubleLine className="text-accent-primary ml-auto" />
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default DisturbanceList;
