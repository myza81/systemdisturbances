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
  RiPulseLine,
  RiArrowGoBackLine,
  RiCloudLine,
  RiDeleteBin6Line,
  RiBroadcastLine,
  RiAddLine
} from 'react-icons/ri';
import styles from './FileUploader.module.css';
import { uploadDisturbance } from '../../api/disturbances';
import { ColumnMapper } from './ColumnMapper';

const FileUploader = ({ onUploadSuccess }) => {
  const [ingestionType, setIngestionType] = useState(null); // 'COMTRADE', 'CSV', 'EXCEL'
  const [currentPackage, setCurrentPackage] = useState({}); // { primary: File, auxiliary: File }
  const [packageQueue, setPackageQueue] = useState([]); // Array of packages ready to ingest
  const [mappingTarget, setMappingTarget] = useState(null); // { file, type }
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeSlot, setActiveSlot] = useState(null);
  
  const primaryInputRef = useRef(null);
  const auxiliaryInputRef = useRef(null);

  const resetIngestion = () => {
    setIngestionType(null);
    setCurrentPackage({});
    setStatus(null);
    setActiveSlot(null);
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

      setStatus({ type: 'success', message: 'Synchronization complete. All assets ingested.' });
      setPackageQueue([]);
      if (onUploadSuccess) onUploadSuccess(firstResult);
      
    } catch (error) {
      if (error.response?.status === 409) {
        const data = error.response.data;
        setStatus({ type: 'success', message: 'RECORD EXISTS: Redirecting to analysis...' });
        setPackageQueue([]);
        setTimeout(() => {
          if (onUploadSuccess) onUploadSuccess({ id: data.id });
        }, 1200);
      } else {
        const errorMsg = error.response?.data?.error || 'Ingestion failed.';
        setStatus({ type: 'error', message: errorMsg });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const renderTypeSelection = () => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={styles.typeGrid}
    >
      {[
        { id: 'COMTRADE', label: 'COMTRADE', sub: 'Oscillography (CFG/DAT)', icon: <RiPulseLine /> },
        { id: 'CSV', label: 'CSV / TEXT', sub: 'Time-Series Data', icon: <RiFileTextLine /> },
        { id: 'EXCEL', label: 'EXCEL', sub: 'Tabular Sheet', icon: <RiFileExcel2Line /> }
      ].map(type => (
        <div 
          key={type.id}
          className={`${styles.typeCard} ${ingestionType === type.id ? styles.typeCardActive : ''}`}
          onClick={() => handleTypeSelect(type.id)}
        >
          <div className={styles.typeIcon}>{type.icon}</div>
          <div className={styles.typeInfo}>
            <h3>{type.label}</h3>
            <p>{type.sub}</p>
          </div>
        </div>
      ))}
    </motion.div>
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
        className={styles.configContainer}
      >
        <div className={styles.headerRow}>
          <span className={styles.configLabel}>{ingestionType} Protocol</span>
          <button onClick={resetIngestion} className={styles.backBtn}>
            <RiArrowGoBackLine /> Change Format
          </button>
        </div>

        <div className={styles.slotGroup}>
          <div className={styles.slotGroup}>
            <span className={styles.slotLabel}>
              {isComtrade ? 'Data Stream (DAT)' : 'Source File'}
            </span>
            <div 
              className={`${styles.slot} ${currentPackage.primary ? styles.slotFilled : ''} ${activeSlot === 'primary' ? styles.slotActive : ''}`}
              onClick={() => { setActiveSlot('primary'); primaryInputRef.current.click(); }}
            >
              <RiFileUploadLine className={styles.slotIcon} />
              <span className={styles.slotText}>{currentPackage.primary ? 'Source Ready' : 'Choose Data Source'}</span>
              {currentPackage.primary && <p className={styles.fileName}>{currentPackage.primary.name}</p>}
            </div>
          </div>

          {isComtrade && (
            <div className={styles.slotGroup}>
              <span className={styles.slotLabel}>Configuration (CFG)</span>
              <div 
                className={`${styles.slot} ${currentPackage.auxiliary ? styles.slotFilled : ''} ${activeSlot === 'secondary' ? styles.slotActive : ''}`}
                onClick={() => { setActiveSlot('secondary'); auxiliaryInputRef.current.click(); }}
              >
                <RiBroadcastLine className={styles.slotIcon} />
                <span className={styles.slotText}>{currentPackage.auxiliary ? 'Config Ready' : 'Choose Configuration'}</span>
                {currentPackage.auxiliary && <p className={styles.fileName}>{currentPackage.auxiliary.name}</p>}
              </div>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button 
            className={`${styles.btn} ${styles.btnPrimary} ${!isComplete ? styles.btnDisabled : ''}`}
            disabled={!isComplete}
            onClick={addToQueue}
          >
            <RiAddLine /> Stage Asset
          </button>
        </div>

        <input 
          type="file" 
          ref={primaryInputRef}
          className="hidden"
          accept={isComtrade ? '.dat' : (ingestionType === 'CSV' ? '.csv' : '.xlsx,.xls')}
          onChange={(e) => handleFileSlot(e.target.files[0], 'primary')}
        />
        <input 
          type="file" 
          ref={auxiliaryInputRef}
          className="hidden"
          accept=".cfg"
          onChange={(e) => handleFileSlot(e.target.files[0], 'auxiliary')}
        />
      </motion.div>
    );
  };

  return (
    <div className={styles.uploaderContainer}>
      <h2 className={styles.ingestionTitle}>
        <RiCloudLine /> Disturbance Ingestion
      </h2>

      <AnimatePresence mode="wait">
        {mappingTarget ? (
          <motion.div
            key="mapper"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
          >
            <ColumnMapper 
              file={mappingTarget.file} 
              fileType={mappingTarget.type} 
              onMapComplete={handleMapComplete}
              onCancel={() => setMappingTarget(null)}
            />
          </motion.div>
        ) : (
          !ingestionType ? renderTypeSelection() : renderSlots()
        )}
      </AnimatePresence>

      <AnimatePresence>
        {packageQueue.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={styles.fileList}
          >
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>Staged Assets ({packageQueue.length})</span>
              <button onClick={() => setPackageQueue([])} className={styles.clearBtn}>Clear All</button>
            </div>
            
            {packageQueue.map((pkg) => (
              <motion.div 
                key={pkg.id}
                layout
                className={styles.fileItem}
              >
                <div className={`${styles.formatBadge} ${styles['badge' + pkg.type.charAt(0) + pkg.type.slice(1).toLowerCase()]}`}>
                  {pkg.type === 'COMTRADE' ? <RiPulseLine /> : (pkg.type === 'CSV' ? <RiFileTextLine /> : <RiFileExcel2Line />)}
                </div>
                
                <div className={styles.fileInfo}>
                  <span className={styles.fileItemName}>{pkg.name}</span>
                  <span className={styles.fileStatus}>Authenticated & Ready</span>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); removeQueuedPackage(pkg.id); }} 
                  className={styles.removeBtn}
                  title="Remove asset"
                >
                  <RiDeleteBin6Line size={14} />
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
                  <>
                    <RiLoader4Line className="animate-spin" /> Synchronizing...
                  </>
                ) : (
                  <>
                    <RiCheckDoubleLine /> Start Ingestion
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${styles.statusMessage} ${status.type === 'error' ? styles.statusError : styles.statusSuccess}`}
          >
            {status.type === 'error' ? <RiAlertLine size={18} /> : <RiCheckDoubleLine size={18} />}
            <p>{status.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileUploader;
