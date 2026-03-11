import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RiFileUploadLine, 
  RiFileTextLine, 
  RiFileExcel2Line, 
  RiCloseLine, 
  RiLoader4Line,
  RiAlertLine,
  RiCheckDoubleLine,
  RiPulseLine
} from 'react-icons/ri';
import styles from './FileUploader.module.css';
import { uploadDisturbance, calculateLocalHash } from '../../api/disturbances';
import { ColumnMapper } from './ColumnMapper';

const FileUploader = ({ onUploadSuccess }) => {
  const [ingestionType, setIngestionType] = useState(null); // 'COMTRADE', 'CSV', 'EXCEL'
  const [currentPackage, setCurrentPackage] = useState({}); // { primary: File, auxiliary: File }
  const [packageQueue, setPackageQueue] = useState([]); // Array of packages ready to ingest
  const [mappingTarget, setMappingTarget] = useState(null); // { file, type }
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null);
  
  const primaryInputRef = useRef(null);
  const auxiliaryInputRef = useRef(null);

  const resetIngestion = () => {
    setIngestionType(null);
    setCurrentPackage({});
    setStatus(null);
  };

  const handleTypeSelect = (type) => {
    setIngestionType(type);
    setCurrentPackage({});
    setStatus(null);
  };

  const handleFileSlot = (file, slot) => {
    if (!file) return;
    setCurrentPackage(prev => ({ ...prev, [slot]: file }));
  };

  const addToQueue = () => {
    const isComtrade = ingestionType === 'COMTRADE';
    const isValid = isComtrade 
      ? (currentPackage.primary && currentPackage.auxiliary)
      : currentPackage.primary;

    if (!isValid) return;

    if (!isComtrade) {
      // CSV and Excel need column mapping
      setMappingTarget({ file: currentPackage.primary, type: ingestionType });
      return;
    }

    const newPackage = {
      id: Math.random().toString(36).substr(2, 9),
      type: ingestionType,
      primary: currentPackage.primary,
      auxiliary: currentPackage.auxiliary,
      name: currentPackage.primary.name.split('.')[0]
    };

    setPackageQueue(prev => [...prev, newPackage]);
    resetIngestion();
  };

  const handleMapComplete = (columnMap) => {
    const newPackage = {
      id: Math.random().toString(36).substr(2, 9),
      type: mappingTarget.type,
      primary: mappingTarget.file,
      auxiliary: null,
      name: mappingTarget.file.name.split('.')[0],
      columnMap: columnMap
    };
    setPackageQueue(prev => [...prev, newPackage]);
    setMappingTarget(null);
    resetIngestion();
  };

  const removeQueuedPackage = (id) => {
    setPackageQueue(prev => prev.filter(p => p.id !== id));
  };

  const handleFinalIngest = async () => {
    if (packageQueue.length === 0) return;
    
    setIsUploading(true);
    setStatus(null);

    try {
      let firstResult = null;
      for (const pkg of packageQueue) {
        const formData = new FormData();
        formData.append('source_type', pkg.type);
        formData.append('primary_file', pkg.primary);
        if (pkg.auxiliary) {
          formData.append('auxiliary_file', pkg.auxiliary);
        }
        if (pkg.columnMap) {
          formData.append('column_map', JSON.stringify(pkg.columnMap));
        }
        
        const result = await uploadDisturbance(formData);
        if (!firstResult) firstResult = result;
      }

      setStatus({ type: 'success', message: 'All disturbances synchronized successfully.' });
      setPackageQueue([]);
      if (onUploadSuccess) onUploadSuccess(firstResult);
      
    } catch (error) {
      if (error.response?.status === 409) {
        // Handle duplicate file detected
        const data = error.response.data;
        setStatus({ type: 'success', message: 'DISTURBANCE RECORD EXISTS: Accessing existing data...' });
        setPackageQueue([]);
        setTimeout(() => {
          if (onUploadSuccess) onUploadSuccess({ id: data.id });
        }, 1500);
      } else {
        const errorMsg = error.response?.data?.error || 'Ingestion synchronization failed.';
        setStatus({ type: 'error', message: `ENGINE REJECTION: ${errorMsg}` });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const renderTypeSelection = () => (
    <div className={styles.typeGrid}>
      {[
        { id: 'COMTRADE', label: 'COMTRADE', icon: RiPulseLine },
        { id: 'CSV', label: 'CSV DATA', icon: RiFileTextLine },
        { id: 'EXCEL', label: 'MS EXCEL', icon: RiFileExcel2Line }
      ].map(type => (
        <motion.div
          key={type.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`${styles.typeCard} ${ingestionType === type.id ? styles.typeCardActive : ''}`}
          onClick={() => handleTypeSelect(type.id)}
        >
          <type.icon className={styles.typeIcon} />
          <span className={styles.typeName}>{type.label}</span>
        </motion.div>
      ))}
    </div>
  );

  const renderSlots = () => {
    const isComtrade = ingestionType === 'COMTRADE';
    const isComplete = isComtrade 
      ? (currentPackage.primary && currentPackage.auxiliary)
      : currentPackage.primary;

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className={styles.slotContainer}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-mono text-accent-cyan font-bold tracking-widest">
            INGESTION PORTS [{ingestionType}]
          </span>
          <button onClick={resetIngestion} className="text-[10px] font-mono text-text-muted hover:text-text-primary">CANCEL</button>
        </div>

        {/* Primary Slot */}
        <div className={`${styles.slot} ${currentPackage.primary ? styles.slotActive : ''}`}>
          <span className={styles.slotLabel}>
            {isComtrade ? '.DAT STREAM' : 'DATA SOURCE'}
          </span>
          <span className={styles.slotInput}>
            {currentPackage.primary ? currentPackage.primary.name : 'No file selected...'}
          </span>
          <button className={styles.slotAction} onClick={() => primaryInputRef.current.click()}>
            SELECT
          </button>
          <input 
            type="file" 
            ref={primaryInputRef}
            style={{ display: 'none' }}
            accept={isComtrade ? '.dat' : (ingestionType === 'CSV' ? '.csv' : '.xlsx,.xls')}
            onChange={(e) => handleFileSlot(e.target.files[0], 'primary')}
          />
        </div>

        {/* Auxiliary Slot (COMTRADE only) */}
        {isComtrade && (
          <div className={`${styles.slot} ${currentPackage.auxiliary ? styles.slotActive : ''}`}>
            <span className={styles.slotLabel}>.CFG CONFIG</span>
            <span className={styles.slotInput}>
              {currentPackage.auxiliary ? currentPackage.auxiliary.name : 'No file selected...'}
            </span>
            <button className={styles.slotAction} onClick={() => auxiliaryInputRef.current.click()}>
              SELECT
            </button>
            <input 
              type="file" 
              ref={auxiliaryInputRef}
              style={{ display: 'none' }}
              accept=".cfg"
              onChange={(e) => handleFileSlot(e.target.files[0], 'auxiliary')}
            />
          </div>
        )}

        <div className={styles.queueAction}>
          <button 
            className={`${styles.btn} ${styles.btnPrimary} ${!isComplete ? styles.btnDisabled : ''}`}
            disabled={!isComplete}
            onClick={addToQueue}
          >
            ADD TO QUEUE
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={styles.uploaderContainer}>
      <h2 className={styles.ingestionTitle}>
        <RiFileUploadLine /> SOURCE FILE INGESTION
      </h2>

      {mappingTarget ? (
        <ColumnMapper 
          file={mappingTarget.file} 
          fileType={mappingTarget.type} 
          onMapComplete={handleMapComplete}
          onCancel={() => setMappingTarget(null)}
        />
      ) : (
        !ingestionType ? renderTypeSelection() : renderSlots()
      )}

      <AnimatePresence>
        {packageQueue.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={styles.fileList}
          >
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-mono font-bold text-text-muted uppercase tracking-wider">
                QUEUE: {packageQueue.length} {packageQueue.length === 1 ? 'PACKAGE' : 'PACKAGES'}
              </span>
              <button onClick={() => setPackageQueue([])} className="text-xs font-mono text-accent-ruby hover:underline">ABORT ALL</button>
            </div>
            
            {packageQueue.map((pkg) => (
              <motion.div 
                key={pkg.id}
                layout
                className={styles.fileItem}
              >
                <div className={`${styles.formatBadge} ${styles['badge' + pkg.type.charAt(0) + pkg.type.slice(1).toLowerCase()]}`}>
                  {pkg.type}
                </div>
                
                <div className={styles.fileInfo}>
                  <p className={styles.fileName}>{pkg.name}</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-mono text-text-muted border border-glass-border px-1.5 rounded uppercase">
                      READY
                    </span>
                  </div>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); removeQueuedPackage(pkg.id); }} 
                  className={styles.removeBtn}
                >
                  <RiCloseLine />
                </button>
              </motion.div>
            ))}

            <div className={styles.actions}>
              <button 
                className={`${styles.btn} ${styles.btnPrimary} ${isUploading ? styles.btnDisabled : ''}`}
                onClick={handleFinalIngest}
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <RiLoader4Line className="animate-spin" /> SYNCHRONIZING...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <RiCheckDoubleLine /> INGEST DISTURBANCES
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${styles.statusMessage} ${status.type === 'error' ? styles.statusError : styles.statusSuccess}`}
          >
            <div className="flex items-start gap-3">
              {status.type === 'error' ? <RiAlertLine size={24} /> : <RiCheckDoubleLine size={24} />}
              <p>{status.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileUploader;
