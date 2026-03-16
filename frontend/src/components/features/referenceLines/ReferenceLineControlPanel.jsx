import React, { useState, useEffect, useCallback, Fragment } from 'react';
import referenceLineManager from './ReferenceLineManager.js';
import { 
  RiAddLine, 
  RiDeleteBinLine, 
  RiCheckboxCircleLine, 
  RiSquareLine,
  RiSettingsLine
} from 'react-icons/ri';
import styles from './ReferenceLineControlPanel.module.css';

/**
 * ReferenceLineControlPanel - UI component for managing reference lines
 * Provides controls to add, remove, toggle, and configure reference lines
 */
const ReferenceLineControlPanel = ({ sessionKey }) => {
  const [horizontalValue, setHorizontalValue] = useState('');
  const [horizontalError, setHorizontalError] = useState('');
  const [lines, setLines] = useState([]);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingType, setEditingType] = useState('');

  // Hydrate from session storage on first mount (if manager is empty)
  useEffect(() => {
    if (!sessionKey) return;
    try {
      const existingCount = referenceLineManager.getLineCount();
      if (existingCount > 0) return;
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(obj => {
          try {
            referenceLineManager.addLine(obj);
          } catch (e) {
            // Ignore invalid lines
          }
        });
      }
    } catch (e) {
      // Ignore JSON errors – treat as no saved state
    }
  }, [sessionKey]);

  // Load lines from manager and persist to session when they change
  useEffect(() => {
    const updateLines = (linesArray) => {
      setLines(linesArray);
      if (sessionKey) {
        const plain = linesArray.map(line =>
          typeof line.toObject === 'function' ? line.toObject() : { ...line }
        );
        try {
          sessionStorage.setItem(sessionKey, JSON.stringify(plain));
        } catch (e) {
          // Ignore sessionStorage quota errors
        }
      }
    };

    const unsubscribe = referenceLineManager.addListener(updateLines);
    updateLines(referenceLineManager.getAllLines());
    return unsubscribe;
  }, [sessionKey]);

  // Validate horizontal value (Y-axis/value)
  const validateHorizontalValue = useCallback((value) => {
    if (value === '') return true;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setHorizontalError('Please enter a valid number');
      return false;
    }
    // Assuming typical PU range, can be adjusted
    if (numValue < -10 || numValue > 10) {
      setHorizontalError('Value must be between -10 and 10');
      return false;
    }
    setHorizontalError('');
    return true;
  }, []);

  // Handle adding horizontal line
  const handleAddHorizontalLine = useCallback(() => {
    if (!validateHorizontalValue(horizontalValue)) return;
    
    const value = parseFloat(horizontalValue);
    const id = `h_line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      referenceLineManager.addLine({
        id,
        type: 'horizontal',
        value,
        axis: 'left',
        color: '#888888',
        visible: true
      });
      
      setHorizontalValue('');
      setHorizontalError('');
    } catch (error) {
      if (error.message.includes('maximum')) {
        setHorizontalError('Maximum number of lines (20) reached');
      } else {
        setHorizontalError(error.message);
      }
    }
  }, [horizontalValue]);

  // Handle enter key press in input fields
  const handleKeyPress = useCallback((e, type) => {
    if (e.key === 'Enter') {
      if (type === 'horizontal') {
        handleAddHorizontalLine();
      }
    }
  }, [handleAddHorizontalLine]);

  // Handle removing a line
  const handleRemoveLine = useCallback((id) => {
    referenceLineManager.removeLine(id);
  }, []);

  // Handle toggling line visibility
  const handleToggleVisibility = useCallback((id) => {
    referenceLineManager.toggleLineVisibility(id);
  }, []);

  // Handle starting to edit a line
  const handleStartEditing = useCallback((id, type, value) => {
    setEditingLineId(id);
    setEditingType(type);
    setEditingValue(value.toString());
  }, []);

  // Handle saving edited line
  const handleSaveEdit = useCallback(() => {
    if (editingValue === '' || isNaN(parseFloat(editingValue))) {
      alert('Please enter a valid number');
      return;
    }
    
    const value = parseFloat(editingValue);
    const updates = { value };
    
    // Additional validation based on type
    if (editingType === 'horizontal') {
      if (value < -10 || value > 10) {
        alert('Horizontal value must be between -10 and 10');
        return;
      }
    }
    
    try {
      referenceLineManager.updateLine(editingLineId, updates);
      // Reset editing state
      setEditingLineId(null);
      setEditingValue('');
      setEditingType('');
    } catch (error) {
      alert(`Error updating line: ${error.message}`);
    }
  }, [editingLineId, editingValue, editingType]);

  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    setEditingLineId(null);
    setEditingValue('');
    setEditingType('');
  }, []);

  // Separate lines by type for display
  const horizontalLines = lines.filter(line => line.type === 'horizontal');

  return (
    <div className={styles.controlPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.headerTitleGroup}>
          <h3>Reference Lines</h3>
          <p className={styles.headerHint}>Set horizontal thresholds and see where waveforms cross them.</p>
        </div>
      </div>
      
      {/* Horizontal Lines Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <RiAddLine className={styles.sectionIcon} />
          Horizontal thresholds (Y axis)
        </div>
        
        <div className={styles.inputGroup}>
          <input
            type="text"
            value={horizontalValue}
            onChange={(e) => setHorizontalValue(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, 'horizontal')}
            placeholder="Enter value (pu)"
            className={`${styles.input} ${horizontalError ? styles.error : ''}`}
          />
          <button 
            onClick={handleAddHorizontalLine}
            className={styles.addButton}
            disabled={referenceLineManager.isAtMaxCapacity()}
          >
            Add
          </button>
          {horizontalError && (
            <div className={styles.errorMessage}>{horizontalError}</div>
          )}
        </div>
        
        <div className={styles.listHeader}>
          <span>Value</span>
          <span>Actions</span>
        </div>
        
        {horizontalLines.length === 0 ? (
          <div className={styles.emptyList}>
            No horizontal lines
          </div>
        ) : (
          <div className={styles.lineList}>
            {horizontalLines.map((line) => (
              <div 
                key={line.id} 
                className={`${styles.lineItem} ${editingLineId === line.id ? styles.editing : ''}`}
              >
                {!editingLineId || editingLineId !== line.id ? (
                  <React.Fragment>
                    <span className={styles.lineValue}>
                      {line.value.toFixed(4)} pu
                    </span>
                    <div className={styles.lineActions}>
                      <button
                        onClick={() => handleToggleVisibility(line.id)}
                        className={styles.iconButton}
                        title={line.visible ? 'Hide' : 'Show'}
                      >
                        {line.visible ? <RiCheckboxCircleLine /> : <RiSquareLine />}
                      </button>
                      <button
                        onClick={() => handleStartEditing(line.id, line.type, line.value)}
                        className={styles.iconButton}
                        title="Edit"
                      >
                        <RiSettingsLine />
                      </button>
                      <button
                        onClick={() => handleRemoveLine(line.id)}
                        className={styles.iconButtonRed}
                        title="Remove"
                      >
                        <RiDeleteBinLine />
                      </button>
                    </div>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      className={styles.editInput}
                    />
                    <div className={styles.lineActions}>
                      <button
                        onClick={handleSaveEdit}
                        className={styles.actionButton}
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className={styles.actionButton}
                      >
                        Cancel
                      </button>
                    </div>
                  </React.Fragment>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Capacity Indicator */}
      <div className={styles.capacityIndicator}>
        <span>Thresholds: {horizontalLines.length}/20</span>
        {referenceLineManager.isAtMaxCapacity() && (
          <span className={styles.capacityWarning}>Maximum reached</span>
        )}
      </div>
    </div>
  );
};

export default ReferenceLineControlPanel;
