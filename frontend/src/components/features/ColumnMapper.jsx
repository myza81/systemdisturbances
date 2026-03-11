import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RiListCheck2, RiTimeLine, RiCloseLine, RiCheckLine, RiLoader4Line } from 'react-icons/ri';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import styles from './ColumnMapper.module.css';

const TIME_ALIASES = ['time', 't', 'timestamp', 'time(s)', 'time_s', 'sec', 'seconds', 'ms', 'time(ms)', 'time_ms'];

export const ColumnMapper = ({ file, fileType, onMapComplete, onCancel }) => {
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        if (fileType === 'CSV') {
          Papa.parse(file, {
            header: true,
            preview: 5,
            skipEmptyLines: true,
            complete: (results) => {
              if (results.meta.fields) {
                initMapping(results.meta.fields, results.data);
              } else {
                setError('Could not detect CSV columns.');
                setLoading(false);
              }
            },
            error: (err) => {
              setError('Failed to parse CSV: ' + err.message);
              setLoading(false);
            }
          });
        } else if (fileType === 'EXCEL') {
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: 'buffer' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          if (json.length > 0) {
            const headers = json[0];
            const dataPreview = json.slice(1, 6).map(row => {
              const obj = {};
              headers.forEach((h, i) => obj[h] = row[i]);
              return obj;
            });
            initMapping(headers, dataPreview);
          } else {
            setError('Excel file appears to be empty.');
            setLoading(false);
          }
        }
      } catch (err) {
        setError('Error reading file headers.');
        setLoading(false);
      }
    };

    parseHeaders();
  }, [file, fileType]);

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
    // Convert to backend expected format
    const outChannels = {};
    Object.entries(mapping.channels).forEach(([origCol, cfg]) => {
      if (cfg.include) {
        // We map displayName to its source details
        outChannels[cfg.displayName] = {
          source_column: origCol,
          unit: cfg.unit,
          phase: cfg.phase
        };
      }
    });

    const finalMap = {
      time: mapping.timeCol,
      channels: outChannels
    };

    onMapComplete(finalMap);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={styles.mapperBox}
    >
      <div className={styles.header}>
        <h3 className="text-sm font-mono font-bold text-text-primary flex items-center gap-2">
          <RiListCheck2 className="text-accent-cyan" /> 
          COLUMN MAPPING
        </h3>
        <span className="text-xs text-text-muted font-mono">{columns.length} columns detected</span>
      </div>

      <div className={styles.timeSelectRow}>
        <RiTimeLine className="text-accent-cyan" />
        <span className="text-xs font-mono text-text-muted mr-4">TIME AXIS COLUMN:</span>
        <select 
          className={styles.select}
          value={mapping.timeCol}
          onChange={(e) => setMapping(prev => ({ ...prev, timeCol: e.target.value }))}
        >
          {columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className="w-10 text-center">Inc</th>
              <th>Source Column</th>
              <th>Display Name</th>
              <th>Unit</th>
              <th>Phase</th>
            </tr>
          </thead>
          <tbody>
            {columns.map(col => {
              if (col === mapping.timeCol) return null;
              const cfg = mapping.channels[col];
              if (!cfg) return null;

              return (
                <tr key={col} className={!cfg.include ? 'opacity-50' : ''}>
                  <td className="text-center">
                    <input 
                      type="checkbox" 
                      className={styles.checkbox}
                      checked={cfg.include}
                      onChange={(e) => handleChannelUpdate(col, 'include', e.target.checked)}
                    />
                  </td>
                  <td className="font-mono text-xs text-text-muted truncate max-w-[120px]" title={col}>
                    {col}
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={cfg.displayName}
                      disabled={!cfg.include}
                      onChange={(e) => handleChannelUpdate(col, 'displayName', e.target.value)}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={cfg.unit}
                      disabled={!cfg.include}
                      onChange={(e) => handleChannelUpdate(col, 'unit', e.target.value)}
                      placeholder="e.g. kV"
                    />
                  </td>
                  <td>
                    <select 
                      className={styles.select}
                      value={cfg.phase}
                      disabled={!cfg.include}
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

      <div className={styles.footer}>
        <button className={styles.btnSec} onClick={onCancel}>
          <RiCloseLine /> Cancel
        </button>
        <button className={styles.btnPri} onClick={submitMapping}>
          <RiCheckLine /> Confirm Mapping
        </button>
      </div>
    </motion.div>
  );
};
