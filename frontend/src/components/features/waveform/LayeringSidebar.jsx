import React, { useState } from 'react';
import { 
  RiAddLine, RiDeleteBinLine, 
  RiSettings3Line, RiMistLine, RiTimeLine,
  RiLineChartLine, RiEyeLine, RiEyeOffLine,
  RiArrowDownSLine, RiArrowRightSLine,
  RiRuler2Line
} from 'react-icons/ri';
import referenceLineManager from '../referenceLines/ReferenceLineManager.js';
import styles from './LayeringSidebar.module.css';

const LayeringSidebar = ({ 
  groups, 
  activeGroupId, 
  onSelectGroup, 
  onUpdateGroups, 
  onOpenModal,
  samplingInterval = 1,
  laneHeight = 60,
  puMode = false,
  onTogglePu,
  onOpenReferenceLines,
  rulerEnabled = false,
  onToggleRuler,
}) => {
  const [puBaseEditTarget, setPuBaseEditTarget] = useState(null);
  const [isGroupsExpanded, setIsGroupsExpanded] = useState(groups.length < 5);
  
  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0];

  const updateChannelConfig = (name, disturbanceId, updates) => {
    const updatedGroups = groups.map(g => {
      if (g.id !== activeGroup?.id) return g;
      return {
        ...g,
        channels: g.channels.map(tc => 
          (tc.name === name && String(tc.disturbanceId) === String(disturbanceId)) 
            ? { ...tc, ...updates } 
            : tc
        )
      };
    });
    onUpdateGroups(updatedGroups);
  };

  const deleteGroup = (id) => {
    onUpdateGroups(groups.filter(g => g.id !== id));
  };

  const handleSavePuBase = () => {
    if (!puBaseEditTarget) return;
    const { name, disturbanceId, value, displayMode, yAxis } = puBaseEditTarget;
    const updates = {};

    if (displayMode) updates.displayMode = displayMode;
    if (yAxis) updates.yAxis = yAxis;

    if (value !== '') {
      const valueNum = parseFloat(value);
      if (Number.isFinite(valueNum) && valueNum > 0) {
        updates.puBase = valueNum;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      updateChannelConfig(name, disturbanceId, updates);
    }
    setPuBaseEditTarget(null);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.collapsibleHeader} onClick={() => setIsGroupsExpanded(!isGroupsExpanded)}>
        <div className={styles.headerTitle}>
          {isGroupsExpanded ? <RiArrowDownSLine /> : <RiArrowRightSLine />}
          <RiMistLine className={styles.icon} />
          <span>Layer Groups</span>
        </div>
        <div className={styles.headerActions} onClick={e => e.stopPropagation()}>
          <div className={styles.puMiniToggle} title="Global PU Mode">
            <span className={styles.puMiniLabel}>PU</span>
            <div 
              className={`${styles.toggleSwitch} ${puMode ? styles.toggleOn : ''}`}
              onClick={() => onTogglePu(!puMode)}
            >
              <div className={styles.toggleKnob} />
            </div>
          </div>
          <button className={styles.addBtn} onClick={() => onOpenModal('new')} title="Create new group">
            <RiAddLine />
          </button>
          <button className={styles.refBtn} onClick={onOpenReferenceLines} title="Reference Lines Tool">
            <RiLineChartLine />
          </button>
          <button 
            className={`${styles.refBtn} ${rulerEnabled ? styles.rulerActive : ''}`} 
            onClick={onToggleRuler} 
            title="Interactive Ruler"
          >
            <RiRuler2Line />
          </button>
        </div>
      </div>

      {isGroupsExpanded && (
        <div className={styles.groupList}>
          {groups.filter(g => g.id !== activeGroup?.id).map(g => (
            <div 
              key={g.id} 
              className={styles.groupItem}
              onClick={() => onSelectGroup(g.id)}
            >
              <div 
                className={styles.groupInfo} 
                onClick={(e) => { e.stopPropagation(); onSelectGroup(g.id); onOpenModal(g.id); }}
                title="Click to manage channels"
              >
                <span className={styles.groupName}>{g.name}</span>
                <span className={styles.groupCount}>{g.channels.length} ch</span>
              </div>
              <button 
                className={styles.deleteBtn} 
                onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
              >
                <RiDeleteBinLine />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeGroup && (
        <div className={styles.activeConfig}>
          <div className={styles.configHeader}>
            <div className={styles.configHeaderLeft} onClick={() => onOpenModal(activeGroup.id)} title="Click to add/remove channels">
              <RiSettings3Line /> 
              <span>CHANNELS: {activeGroup.name}</span>
            </div>
            <button 
              className={styles.groupDeleteBtnHeader} 
              onClick={(e) => { e.stopPropagation(); deleteGroup(activeGroup.id); }}
              title="Delete this group"
            >
              <RiDeleteBinLine />
            </button>
          </div>
          
          <div className={styles.channelScroll}>
            {activeGroup.channels.map((ch, idx) => (
              <div key={`${String(ch.disturbanceId)}-${ch.name}-${idx}`} className={`${styles.channelRow} ${ch.visible === false ? styles.hidden : ''}`}>
                <div className={styles.rowTop}>
                  <div className={styles.colorIndicator} style={{ backgroundColor: ch.color }}>
                    <input 
                      type="color" 
                      value={ch.color} 
                      onChange={(e) => updateChannelConfig(ch.name, ch.disturbanceId, { color: e.target.value })}
                    />
                  </div>
                  <span className={styles.name}>{ch.name}</span>
                  <div className={styles.rowTopRight}>
                    <button 
                      className={`${styles.visibilityBtn} ${ch.visible === false ? styles.hidden : ''}`}
                      onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, { visible: ch.visible !== false ? false : true })}
                      title={ch.visible !== false ? "Hide channel" : "Show channel"}
                    >
                      {ch.visible !== false ? <RiEyeLine /> : <RiEyeOffLine />}
                    </button>
                    <button
                      className={styles.puBaseBadge}
                      onClick={() => setPuBaseEditTarget({
                        name: ch.name,
                        disturbanceId: ch.disturbanceId,
                        value: ch.puBase || '',
                        displayMode: ch.displayMode || 'actual',
                        yAxis: ch.yAxis || 'left'
                      })}
                      title="Channel Settings (Scale, Axis, PU)"
                    >
                      <RiSettings3Line />
                    </button>
                  </div>
                </div>

                <div className={styles.puModalRow}>
                  <div className={styles.offsetControl}>
                    <RiTimeLine className={styles.offsetIcon} />
                    <button onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, { offsetMs: (ch.offsetMs || 0) - samplingInterval })}>-</button>
                    <input 
                      type="number" 
                      value={(ch.offsetMs || 0).toFixed(2)}
                      onChange={(e) => updateChannelConfig(ch.name, ch.disturbanceId, { offsetMs: parseFloat(e.target.value) || 0 })}
                    />
                    <button onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, { offsetMs: (ch.offsetMs || 0) + samplingInterval })}>+</button>
                    <span className={styles.unit}>ms</span>
                  </div>
                  <div className={styles.axisToggle}>
                    <button
                      className={ch.yAxis !== 'right' ? styles.axisActive : ''}
                      onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, { yAxis: 'left' })}
                    >
                      L
                    </button>
                    <button
                      className={ch.yAxis === 'right' ? styles.axisActive : ''}
                      onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, { yAxis: 'right' })}
                    >
                      R
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className={styles.manageBtn} onClick={() => onOpenModal(activeGroup.id)}>
            <RiAddLine /> Add/Remove Channels
          </button>
        </div>
      )}

      {puBaseEditTarget && (
        <div className={styles.puModalBackdrop} onClick={() => setPuBaseEditTarget(null)}>
          <div className={styles.puModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.puModalHeader}>
              Axis / scale
            </div>
            <div className={styles.puModalBody}>
              <label>
                Channel: <span>{puBaseEditTarget.name}</span>
              </label>



              <div className={styles.puModalRow}>
                <span className={styles.puModalLabel}>Base</span>
                <input
                  type="number"
                  value={puBaseEditTarget.value}
                  onChange={(e) => setPuBaseEditTarget(prev => ({ ...prev, value: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.puModalActions}>
              <button className={styles.puModalButton} onClick={() => setPuBaseEditTarget(null)}>Cancel</button>
              <button className={`${styles.puModalButton} ${styles.puModalPrimary}`} onClick={handleSavePuBase}>Save</button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div className={styles.empty}>
          <RiMistLine className={styles.emptyIcon} />
          <p>No layering groups defined.</p>
          <button className={styles.primaryAdd} onClick={() => onOpenModal('new')}>Create First Layering</button>
        </div>
      )}
    </div>
  );
};

export default LayeringSidebar;
