import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { RiTimeLine, RiLoader4Line, RiInformationLine } from 'react-icons/ri';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import styles from './ColumnMapper.module.css';

const TIME_ALIASES = ['time', 't', 'timestamp', 'time(s)', 'time_s', 'sec', 'seconds', 'ms', 'time(ms)', 'time_ms'];

export const ColumnMapper = forwardRef(({ file, fileType, onMapComplete, onCancel, isModal = false }, ref) => {
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerIndex, setHeaderIndex] = useState(0);
  const [rawRows, setRawRows] = useState([]);
  const [timeMode, setTimeMode] = useState('column'); // 'column' or 'manual'
  const [sampleRate, setSampleRate] = useState(1000);

  useImperativeHandle(ref, () => ({
    submit: submitMapping
  }));

  // Auto-detect phase from name
  const detectPhase = (name) => {
    const n = name.toUpperCase();
    if (n.includes(' R') || n.endsWith('R') || n.includes('RED')) return 'R';
    if (n.includes(' Y') || n.endsWith('Y') || n.includes('YELLOW')) return 'Y';
    if (n.includes(' B') || n.endsWith('B') || n.includes('BLUE')) return 'B';
    if (n.includes(' N') || n.endsWith('N') || n.includes('NEUTRAL')) return 'N';
    return 'default';
  };

  // Extract unit logic
  const extractUnit = (name) => {
    const match = name.match(/\(([^)]+)\)|\[([^\]]+)\]/);
    if (match) return match[1] || match[2] || '';
    return '';
  };

  const cleanName = (name) => {
    return name.replace(/\(([^)]+)\)|\[([^\]]+)\]/, '').trim();
  };

  useEffect(() => {
    const parseHeaders = async () => {
      try {
        setLoading(true);
        if (fileType === 'CSV') {
          // First, get raw lines for preview
          Papa.parse(file, {
            header: false,
            preview: 15,
            skipEmptyLines: false,
            complete: (rawResults) => {
              setRawRows(rawResults.data);
              
              // Now parse with headers at selected index
              // PapaParse doesn't easily skip to N rows for headers, so we slice rawRows
              const actualRaw = rawResults.data;
              if (actualRaw.length > headerIndex) {
                 const headers = actualRaw[headerIndex];
                 // Generate preview data from subsequent rows
                 const dataPreview = actualRaw.slice(headerIndex + 1, headerIndex + 6).map(row => {
                   const obj = {};
                   headers.forEach((h, i) => obj[h] = row[i]);
                   return obj;
                 });
                 initMapping(headers, dataPreview);
              }
            }
          });
        } else if (fileType === 'EXCEL') {
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: 'buffer' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rawJson = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          setRawRows(rawJson.slice(0, 15));
          
          if (rawJson.length > headerIndex) {
            const headers = rawJson[headerIndex];
            const dataPreview = rawJson.slice(headerIndex + 1, headerIndex + 6).map(row => {
              const obj = {};
              headers.forEach((h, i) => obj[h] = row[i]);
              return obj;
            });
            initMapping(headers, dataPreview);
          } else {
            setError('Excel file appears to be empty or start row is out of bounds.');
            setLoading(false);
          }
        }
      } catch (err) {
        setError('Error reading file headers.');
        setLoading(false);
      }
    };

    parseHeaders();
  }, [file, fileType, headerIndex]);

  const initMapping = (headers, dataPreview) => {
    let timeColStr = '';
    
    // Find time col candidate
    for (const h of headers) {
      if (TIME_ALIASES.includes(h.trim().toLowerCase())) {
        timeColStr = h;
        break;
      }
    }

    const initMap = {};
    headers.forEach(h => {
      if (h === timeColStr) return; // Time gets its own slot
      
      const cName = cleanName(h);
      initMap[h] = {
        include: true,
        displayName: cName,
        unit: extractUnit(h),
        phase: detectPhase(cName)
      };
    });

    setColumns(headers);
    setMapping({
      timeCol: timeColStr || headers[0], // fallback to first col
      channels: initMap
    });
    setLoading(false);
  };

  const handleChannelUpdate = (origCol, field, value) => {
    setMapping(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [origCol]: {
          ...prev.channels[origCol],
          [field]: value
        }
      }
    }));
  };

  const submitMapping = () => {
    const outChannels = {};
    Object.entries(mapping.channels).forEach(([origCol, cfg]) => {
      outChannels[cfg.displayName] = {
        source_column: origCol,
        unit: cfg.unit,
        phase: cfg.phase
      };
    });

    onMapComplete({
      time: mapping.timeCol,
      time_mode: timeMode,
      sample_rate: sampleRate,
      channels: outChannels,
      start_row: headerIndex // Tell backend where data actually starts
    });
  };

  if (loading) {
    return (
      <div className={styles.mapperBox}>
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-text-muted">
          <RiLoader4Line className="animate-spin text-3xl text-accent-cyan" />
          <p className="font-mono text-xs uppercase tracking-widest">Scanning columns...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.mapperBox}>
        <p className="text-accent-ruby text-sm">{error}</p>
        <button onClick={onCancel} className={styles.btnSec}>Cancel</button>
      </div>
    );
  }

  const renderRawPreview = () => (
    <div className={styles.previewSection}>
      <header className={styles.previewHeader}>
        <div className={styles.previewTitle}>
          <RiInformationLine />
          <span>File Preview & Header Selection</span>
        </div>
        <span className={styles.hint}>Click a row to set it as the <strong>Header Row</strong></span>
      </header>
      <div className={styles.previewScroll}>
        <table className={styles.previewTable}>
          <tbody>
            {rawRows.map((row, idx) => (
              <tr 
                key={idx} 
                className={`${styles.previewRow} ${idx === headerIndex ? styles.activeHeader : ''} ${idx < headerIndex ? styles.metadataRow : ''}`}
                onClick={() => setHeaderIndex(idx)}
              >
                <td className={styles.rowIdx}>{idx + 1}</td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className={styles.previewCell}>{cell?.toString() || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={styles.mapperBox}>
      {renderRawPreview()}

      <div className={styles.timeSectionCompact}>
        <div className={styles.timeLabel}>
          <RiTimeLine className={styles.timeIcon} />
          <span>Time Axis</span>
        </div>
        
        <div className={styles.timeControlsCompact}>
          <div className={styles.modeToggleCompact}>
            <button 
              className={`${styles.toggleBtnSmall} ${timeMode === 'column' ? styles.active : ''}`}
              onClick={() => setTimeMode('column')}
            >
              From Column
            </button>
            <button 
              className={`${styles.toggleBtnSmall} ${timeMode === 'manual' ? styles.active : ''}`}
              onClick={() => setTimeMode('manual')}
            >
              Fixed Rate
            </button>
          </div>

          <div className={styles.divider} />

          {timeMode === 'column' ? (
            <select 
              className={styles.timeSelectCompact}
              value={mapping.timeCol}
              onChange={(e) => setMapping(prev => ({ ...prev, timeCol: e.target.value }))}
            >
              {columns.map((c, idx) => <option key={`${c}-${idx}`} value={c}>{c}</option>)}
            </select>
          ) : (
            <div className={styles.rateInputGroupCompact}>
              <input 
                type="number" 
                className={styles.rateInputCompact}
                value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value))}
                min="1"
              />
              <span className={styles.rateUnitCompact}>Hz</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th>Source Column</th>
              <th>Display Name</th>
              <th>Unit</th>
              <th>Phase</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => {
              if (col === mapping.timeCol) return null;
              const cfg = mapping.channels[col];
              if (!cfg) return null;

              return (
                <tr key={`${col}-${idx}`}>
                  <td>
                    <div className={styles.sourceCol}>
                      <code>{col}</code>
                    </div>
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={cfg.displayName}
                      onChange={(e) => handleChannelUpdate(col, 'displayName', e.target.value)}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={cfg.unit}
                      onChange={(e) => handleChannelUpdate(col, 'unit', e.target.value)}
                      placeholder="e.g. kV"
                    />
                  </td>
                  <td>
                    <select 
                      className={styles.select}
                      value={cfg.phase}
                      onChange={(e) => handleChannelUpdate(col, 'phase', e.target.value)}
                    >
                      <option value="R">R (Red)</option>
                      <option value="Y">Y (Yellow)</option>
                      <option value="B">B (Blue)</option>
                      <option value="N">N (Neutral)</option>
                      <option value="default">None</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ColumnMapper;
