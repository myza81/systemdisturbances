import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RiHistoryLine, 
  RiPulseLine, 
  RiDeleteBinLine, 
  RiTimeLine,
  RiCheckDoubleLine,
  RiRefreshLine,
  RiAlertLine
} from 'react-icons/ri';
import styles from './DisturbanceList.module.css';

const DisturbanceList = ({ onSelect, selectedId }) => {
  const [disturbances, setDisturbances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDisturbances();
  }, []);

  const fetchDisturbances = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/disturbances/all/');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const text = await response.text();
      const data = text ? JSON.parse(text) : [];
      setDisturbances(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch disturbances:', error);
      setError('Failed to load captures. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this recording?')) return;

    try {
      const response = await fetch(`/api/v1/disturbances/${id}/delete/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDisturbances(prev => prev.filter(d => d.id !== id));
        if (selectedId === id) onSelect(null);
      } else {
        alert('Failed to delete record.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Error deleting record.');
    }
  };

  if (loading) return <div className="p-8 text-text-muted text-sm font-medium animate-pulse text-center">Loading captures...</div>;

  return (
    <div className={styles.listContainer}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <RiHistoryLine />
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.headerTitle}>Capture Repository</h3>
          <span className={styles.headerSubtitle}>Signal Library</span>
        </div>
        <button 
          className={styles.refreshBtn} 
          onClick={fetchDisturbances}
          disabled={loading}
          title="Refresh repository"
        >
          <RiRefreshLine className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={styles.scrollArea}>
        {error ? (
          <div className={styles.errorContainer}>
            <RiAlertLine size={24} />
            <p>{error}</p>
            <button onClick={fetchDisturbances} className={styles.retryBtn}>Retry</button>
          </div>
        ) : loading && disturbances.length === 0 ? (
          <div className={styles.empty}>
            <RiPulseLine className="animate-pulse" size={24} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p>Scanning signals...</p>
          </div>
        ) : disturbances.length === 0 ? (
          <div className={styles.empty}>
            <p>No captures found.</p>
          </div>
        ) : (
          disturbances.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`${styles.item} ${selectedId === item.id ? styles.itemActive : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div className={styles.cardContent}>
                <div className={styles.titleRow}>
                  <div className={styles.primaryMeta}>
                    <span className={styles.metaDate}>{item.name ? item.name.replace(/\.[^/.]+$/, "") : "Untitled"}</span>
                  </div>
                  <div className={styles.statusGroup}>
                    {!item.has_config && (
                      <span className={`${styles.statusBadge} ${styles.pending}`}>Pending</span>
                    )}
                    <button 
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Delete recording"
                    >
                      <RiDeleteBinLine />
                    </button>
                    {selectedId === item.id && (
                      <RiCheckDoubleLine className={styles.activeCheck} />
                    )}
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaDateSmall}>{new Date(item.timestamp).toLocaleDateString()}</span>
                  <span className={styles.metaSeparator}>•</span>
                  <span className={styles.metaType}>{item.source_type}</span>
                  <span className={styles.metaSeparator}>•</span>
                  <span className={styles.metaValue}>{(item.file_size / 1024).toFixed(0)}KB</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default DisturbanceList;
