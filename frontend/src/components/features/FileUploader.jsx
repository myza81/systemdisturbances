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
import { uploadDisturbance, scanDisturbance } from '../../api/disturbances';
import { ColumnMapper } from './ColumnMapper';
import ChannelMappingModal from './waveform/ChannelMappingModal';

const FileUploader = ({ onUploadSuccess }) => {
  const [ingestionType, setIngestionType] = useState(null); // 'COMTRADE', 'CSV', 'EXCEL'
  const [currentPackage, setCurrentPackage] = useState({}); // { primary: File, auxiliary: File }
  const [mappingTarget, setMappingTarget] = useState(null); // { file, type }
  const [scanTarget, setScanTarget] = useState(null); // { scanData, pkgInfo }
  const [isUploading, setIsUploading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
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

  const addToQueue = async () => {
    const isComtrade = ingestionType === 'COMTRADE';
    const isValid = isComtrade 
      ? (currentPackage.primary && currentPackage.auxiliary)
      : currentPackage.primary;

    if (!isValid) return;

    if (!isComtrade) {
      // CSV and Excel need column mapping first
      setMappingTarget({ file: currentPackage.primary, type: ingestionType });
      return;
    }

    // COMTRADE: Scan immediately
    setIsScanning(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append('source_type', ingestionType);
      formData.append('primary_file', currentPackage.primary);
      formData.append('auxiliary_file', currentPackage.auxiliary);
      const scanData = await scanDisturbance(formData);
      setScanTarget({ 
        scanData, 
        pkgInfo: { 
          type: ingestionType, 
          primary: currentPackage.primary, 
          auxiliary: currentPackage.auxiliary,
          name: currentPackage.primary.name.split('.')[0]
        } 
      });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to scan channel metadata.' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleMapComplete = async (columnMap) => {
    // After column mapping (CSV/Excel), we need to scan to get detected channels
    setIsScanning(true);
    try {
      const formData = new FormData();
      formData.append('source_type', mappingTarget.type);
      formData.append('primary_file', mappingTarget.file);
      formData.append('column_map', JSON.stringify(columnMap));
      const scanData = await scanDisturbance(formData);
      
      setScanTarget({
        scanData,
        pkgInfo: {
          type: mappingTarget.type,
          primary: mappingTarget.file,
          auxiliary: null,
          name: mappingTarget.file.name.split('.')[0],
          columnMap: columnMap
        }
      });
      setMappingTarget(null);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to scan channel metadata.' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleChannelConfigComplete = async (channelConfig) => {
    const pkg = scanTarget.pkgInfo;
    setIsUploading(true);
    setStatus(null);
    setScanTarget(null); // Close modal

    try {
      const formData = new FormData();
      formData.append('source_type', pkg.type);
      formData.append('primary_file', pkg.primary);
      if (pkg.auxiliary) {
        formData.append('auxiliary_file', pkg.auxiliary);
      }
      if (pkg.columnMap) {
        formData.append('column_map', JSON.stringify(pkg.columnMap));
      }
      formData.append('channel_config', JSON.stringify(channelConfig));
      
      const result = await uploadDisturbance(formData);
      
      setStatus({ type: 'success', message: 'Ingestion complete. Record populated in repository.' });
      resetIngestion();
      if (onUploadSuccess) onUploadSuccess(result);
      
    } catch (error) {
      if (error.response?.status === 409) {
        const data = error.response.data;
        setStatus({ type: 'success', message: 'RECORD EXISTS: Redirecting to analysis...' });
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
        { id: 'COMTRADE', label: 'COMTRADE', sub: 'Oscillography', icon: <RiPulseLine /> },
        { id: 'CSV', label: 'CSV / TEXT', sub: 'Time-Series', icon: <RiFileTextLine /> },
        { id: 'EXCEL', label: 'EXCEL', sub: 'Tabular Sheet', icon: <RiFileExcel2Line /> }
      ].map(type => (
        <div 
          key={type.id}
          className={`${styles.typeCard} ${ingestionType === type.id ? styles.typeCardActive : ''}`}
          onClick={() => handleTypeSelect(type.id)}
        >
          <div className={styles.typeIcon}>{type.icon}</div>
          <div className={styles.typeInfo}>
            <div className={styles.typeTitleRow}>
              <h3 className={styles.typeLabel}>{type.label}</h3>
            </div>
            <p className={styles.typeSub}>{type.sub}</p>
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
        <div className={styles.protocolHeader}>
          <div className={styles.protocolIcon}>
            {ingestionType === 'COMTRADE' ? <RiPulseLine /> : (ingestionType === 'CSV' ? <RiFileTextLine /> : <RiFileExcel2Line />)}
          </div>
          <div className={styles.protocolInfo}>
            <span className={styles.protocolTitle}>{ingestionType} PROTOCOL</span>
            <button onClick={resetIngestion} className={styles.backLink}>
              <RiArrowGoBackLine /> CHANGE FORMAT
            </button>
          </div>
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
            className={`${styles.btn} ${styles.btnPrimary} ${(!isComplete || isScanning) ? styles.btnDisabled : ''}`}
            disabled={!isComplete || isScanning}
            onClick={addToQueue}
          >
            {isScanning ? <><RiLoader4Line className="animate-spin" /> Validating...</> : <><RiCheckDoubleLine /> Verify & Map Channels</>}
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
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <RiCloudLine />
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.headerTitle}>Disturbance Ingestion</h3>
          <span className={styles.headerSubtitle}>Signal Import</span>
        </div>
      </div>

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
        {scanTarget && (
          <ChannelMappingModal
            isIngestion={true}
            analogChannels={scanTarget.scanData.analog}
            digitalChannels={scanTarget.scanData.digital}
            onSaveSuccess={handleChannelConfigComplete}
            onClose={() => setScanTarget(null)}
          />
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
