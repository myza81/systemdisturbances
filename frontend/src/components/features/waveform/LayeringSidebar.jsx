import React from 'react';
import { 
  RiStackLine, RiAddLine, RiDeleteBinLine, 
  RiSettings3Line, RiMistLine, RiTimeLine 
} from 'react-icons/ri';
import styles from './LayeringSidebar.module.css';

const LayeringSidebar = ({ 
  groups, 
  activeGroupId, 
  onSelectGroup, 
  onUpdateGroups, 
  onOpenModal,
  samplingInterval = 1,
  laneHeight = 60
}) => {
  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0];

  const updateChannelConfig = (name, disturbanceId, key, value) => {
    const updatedGroups = groups.map(g => {
      if (g.id !== activeGroup?.id) return g;
      return {
        ...g,
        channels: g.channels.map(tc => (tc.name === name && String(tc.disturbanceId) === String(disturbanceId)) ? { ...tc, [key]: value } : tc)
      };
    });
    onUpdateGroups(updatedGroups);
  };

  const deleteGroup = (id) => {
    onUpdateGroups(groups.filter(g => g.id !== id));
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.title}>
          <RiStackLine className={styles.icon} />
          <span>Layer Groups</span>
        </div>
        <button className={styles.addBtn} onClick={() => onOpenModal('new')} title="Create New Group">
          <RiAddLine />
        </button>
      </div>

      <div className={styles.groupList}>
        {groups.map(g => (
          <div 
            key={g.id} 
            className={`${styles.groupItem} ${g.id === activeGroup?.id ? styles.activeGroup : ''}`}
            onClick={() => onSelectGroup(g.id)}
          >
            <div className={styles.groupInfo}>
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

      {activeGroup && (
        <div className={styles.activeConfig}>
          <div className={styles.configHeader}>
            <RiSettings3Line /> 
            <span>Configure: {activeGroup.name}</span>
          </div>
          
          <div className={styles.channelScroll}>
            {activeGroup.channels.map((ch, idx) => (
              <div key={`${String(ch.disturbanceId)}-${ch.name}-${idx}`} className={styles.channelRow}>
                <div className={styles.rowTop}>
                  <div className={styles.colorIndicator} style={{ backgroundColor: ch.color }}>
                    <input 
                      type="color" 
                      value={ch.color} 
                      onChange={(e) => updateChannelConfig(ch.name, ch.disturbanceId, 'color', e.target.value)}
                    />
                  </div>
                  <span className={styles.name}>{ch.name}</span>
                  <div className={styles.axisToggle}>
                    <button 
                      className={ch.yAxis === 'left' ? styles.axisActive : ''}
                      onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, 'yAxis', 'left')}
                    >L</button>
                    <button 
                      className={ch.yAxis === 'right' ? styles.axisActive : ''}
                      onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, 'yAxis', 'right')}
                    >R</button>
                  </div>
                </div>
                
                <div className={styles.rowBottom}>
                  <div className={styles.offsetControl}>
                    <RiTimeLine className={styles.offsetIcon} />
                    <button onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, 'offsetMs', (ch.offsetMs || 0) - samplingInterval)}>-</button>
                    <input 
                      type="number" 
                      value={(ch.offsetMs || 0).toFixed(2)}
                      onChange={(e) => updateChannelConfig(ch.name, ch.disturbanceId, 'offsetMs', parseFloat(e.target.value) || 0)}
                    />
                    <button onClick={() => updateChannelConfig(ch.name, ch.disturbanceId, 'offsetMs', (ch.offsetMs || 0) + samplingInterval)}>+</button>
                    <span className={styles.unit}>ms</span>
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
