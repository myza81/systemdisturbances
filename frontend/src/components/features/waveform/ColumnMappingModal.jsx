import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { RiListCheck2, RiCloseLine, RiCheckLine } from 'react-icons/ri';
import styles from './ColumnMappingModal.module.css';
import { ColumnMapper } from '../ColumnMapper';

const ColumnMappingModal = ({ file, fileType, onMapComplete, onClose }) => {
  const mapperRef = useRef();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <motion.div 
        className={styles.modal} 
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <RiListCheck2 className={styles.titleIcon} />
            <h2>Initial Column Mapping</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><RiCloseLine /></button>
        </header>

        <div className={styles.content}>
          <p className={styles.description}>
            Define which columns contain the <strong>Time Axis</strong> and <strong>Signal Values</strong> for this <strong>{fileType}</strong> file.
          </p>
          <ColumnMapper 
            ref={mapperRef}
            file={file} 
            fileType={fileType} 
            onMapComplete={onMapComplete}
            onCancel={onClose}
            isModal={true}
          />
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={() => mapperRef.current?.submit()}>
            <RiCheckLine /> Confirm Mapping
          </button>
        </footer>
      </motion.div>
    </div>
  );
};

export default ColumnMappingModal;
