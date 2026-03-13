/**
 * WaveformViewer – Main Container
 * 
 * Layout:
 * ┌──────────────────────────────────────────┐
 * │ WaveformToolbar (top)                    │
 * ├───────────────┬──────────────────────────┤
 * │ ChannelSidebar│  ECharts multi-grid      │
 * │  (left panel) │  ┌──────────────────┐   │
 * │               │  │ Digital channels │   │
 * │               │  ├──────────────────┤   │
 * │               │  │ Voltage channels │   │
 * │               │  ├──────────────────┤   │
 * │               │  │ Current channels │   │
 * │               │  └──────────────────┘   │
 * ├───────────────┴──────────────────────────┤
 * │ PaginationBar + DeltaReadout (bottom)    │
 * └──────────────────────────────────────────┘
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as echarts from 'echarts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiPulseLine, RiLoader4Line, RiSettings3Line,
  RiDownload2Line, RiFullscreenLine, RiFullscreenExitLine,
  RiCalculatorLine, RiAddLine, RiTableLine, RiStackLine,
} from 'react-icons/ri';
import { useWaveformData, useChannelMeta } from '../../hooks/useWaveformData';
import { useSettings } from '../../hooks/useSettings';
import WaveformToolbar from './waveform/WaveformToolbar';
import ChannelSidebar from './waveform/ChannelSidebar';
import ZoomSlider from './waveform/ZoomSlider';
import PaginationBar from './waveform/PaginationBar';
import SettingsModal from './settings/SettingsModal';
import CalculatedChannelModal from './waveform/CalculatedChannelModal';
import ChannelMappingModal from './waveform/ChannelMappingModal';
import ChannelVisibilityDrawer from './waveform/ChannelVisibilityDrawer';
import LayeringModal from './waveform/LayeringModal';
import LayeringSidebar from './waveform/LayeringSidebar';
import styles from './WaveformViewer.module.css';

// ─── Phase / channel group classification ───────────────────────────────────

function classifyChannels(analogChannels) {
  const voltage = [];
  const current = [];
  const other = [];

  for (const ch of analogChannels) {
    const unit = (ch.unit || '').toLowerCase();
    const name = (ch.name || '').toLowerCase();
    if (unit.includes('v') || name.includes('v') || name.includes('volt')) {
      voltage.push(ch);
    } else if (unit.includes('a') || name.includes('i') || name.includes('curr') || name.includes('amp')) {
      current.push(ch);
    } else {
      other.push(ch);
    }
  }
  return { voltage, current, other };
}

function sortChannels(channels) {
  const phaseOrder = { 'R': 1, 'Y': 2, 'B': 3, 'N': 4 };
  
  return [...channels].sort((a, b) => {
    // 1. Extract Bay/Prefix and Type (V/I)
    // Robustly handles "KPDN1 VR", "KPDN1-VY", "KPDN1_VB", or "KPDN1VR"
    const regex = /^(.*?)[\s\-_]*([VI])([RYBN])$/i;
    const matchA = (a.title || a.name).match(regex);
    const matchB = (b.title || b.name).match(regex);

    if (matchA && matchB) {
      const [_, bayA, typeA, phaseA] = matchA;
      const [__, bayB, typeB, phaseB] = matchB;

      // Group by Bay
      if (bayA.toLowerCase() !== bayB.toLowerCase()) {
        return bayA.toLowerCase().localeCompare(bayB.toLowerCase());
      }

      // V before I
      if (typeA.toUpperCase() !== typeB.toUpperCase()) {
        return typeA.toUpperCase() === 'V' ? -1 : 1;
      }

      // R-Y-B-N order
      return (phaseOrder[phaseA.toUpperCase()] || 99) - (phaseOrder[phaseB.toUpperCase()] || 99);
    }

    // Fallback: If one doesn't match the pattern, push it to bottom of its bay or just alpha
    return (a.title || a.name).localeCompare(b.title || b.name);
  });
}

// ─── Build ECharts option from waveform data ──────────────────────────────

function buildChartOption({ data, settings, mergedConfigs, cursors, samplingMode, hiddenChannels, laneHeight = 60 }) {
  const { theme } = settings;
  const phaseColors = settings.phaseColors || { R: '#ef4444', Y: '#f59e0b', B: '#3b82f6', N: '#10b981', default: '#64748b' };
  const channelConfigs = mergedConfigs || settings.channelConfigs || {};
  const analog = data.analog || [];
  const digital = data.digital || [];
  const time_ms = data.time_ms || [];

  const minX = time_ms.length > 0 ? time_ms[0] : 0;
  const maxX = time_ms.length > 0 ? time_ms[time_ms.length - 1] : 100;

  // Pre-calculate colors
  const processChannel = (ch, type) => {
    const config = channelConfigs[ch.name] || {};
    
    // Visibility check: respects session-based hiddenChannels
    if (hiddenChannels?.has(ch.name)) return null;

    // Respect existing color if provided (e.g. for calculated channels)
    // or use mapped color from config
    let color = ch.color || config.color;
    
    if (!color) {
      if (type === 'analog') {
        // Try to derive phase from name if ch.phase is missing
        let phase = ch.phase;
        if (!phase) {
          const m = (config.title || ch.name).match(/[RYBN]$/i);
          if (m) phase = m[0].toUpperCase();
        }
        color = phaseColors[phase] || phaseColors.default || '#64748b';
      } else if (type === 'digital') {
        color = settings.theme.digitalHighColor || '#10b981';
      } else {
        color = settings.theme.textColor;
      }
    }
    
    // Scale and title
    const scale = config.scale || 1;
    const title = config.title || ch.name;
    const lineStyleType = config.lineStyle || 'solid';
    const values = ch.values || [];

    return { 
      ...ch, 
      type, 
      color, 
      displayName: title,
      scaledValues: values.map(v => (v !== null && v !== undefined) ? v * scale : null),
      lineStyleType
    };
  };

  const allChannels = sortChannels([
    ...analog.map(ch => processChannel(ch, 'analog')),
    ...digital.map(ch => processChannel(ch, 'digital'))
  ].filter(Boolean));

  const grids = [];
  const xAxes = [];
  const yAxes = [];
  const series = [];

  allChannels.forEach((ch, idx) => {
    const gridPadding = 8; // Guaranteed gap for stacked lanes
    const gridIdx = idx;
    const top = idx * laneHeight + gridPadding;

    grids.push({
      top: top,
      height: laneHeight - (gridPadding * 2),
      left: 60, // Ample space for large numeric labels
      right: 20,
      containLabel: false,
    });

    // X-axis (shared range across all)
    const isLast = idx === allChannels.length - 1;
    xAxes.push({
      type: 'value',
      gridIndex: gridIdx,
      min: minX,
      max: maxX,
      axisLine: { lineStyle: { color: theme.gridColor } },
      splitLine: { 
        show: true,
        lineStyle: { color: theme.gridColor, type: 'dashed' } 
      },
      axisLabel: {
        show: isLast,
        color: theme.textColor,
        fontSize: 10,
        formatter: (v) => `${v.toFixed(0)}ms`,
        hideOverlap: true,
      },
      axisTick: { show: isLast, lineStyle: { color: theme.gridColor } },
    });

    // Y-axis
    if (ch.type === 'digital') {
      yAxes.push({
        type: 'value',
        gridIndex: gridIdx,
        min: -0.2, 
        max: 1.2,
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      });

      series.push({
        name: ch.displayName || ch.name,
        id: `digital-${idx}-${ch.name}`,
        type: 'line',
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        step: 'end',
        symbol: 'none',
        lineStyle: { width: 1.5, color: ch.color, type: ch.lineStyleType },
        data: time_ms.map((t, i) => [t, ch.scaledValues[i]]),
        z: 3,
      });
    } else {
      yAxes.push({
        type: 'value',
        gridIndex: gridIdx,
        splitNumber: Math.max(2, Math.floor(laneHeight / 45)), // Much sparser
        boundaryGap: ['5%', '5%'],
        axisLabel: { 
          show: true,
          showMinLabel: false,
          showMaxLabel: false,
          color: theme.textColor,
          fontSize: 7.5, // Tiny for high density
          hideOverlap: true,
          margin: 10, // More horizontal space
          formatter: (v) => {
            const absV = Math.abs(v);
            if (absV >= 1000) return (v / 1000).toFixed(1) + 'k';
            if (absV === 0) return '0';
            return Number.isInteger(v) ? v.toString() : v.toFixed(1);
          }
        },
        splitLine: { 
          show: true, 
          lineStyle: { color: theme.gridColor, type: 'solid', opacity: 0.1 } 
        },
        axisLine: { show: false },
        axisTick: { show: true, lineStyle: { color: theme.gridColor } },
      });

      series.push({
        name: ch.displayName || ch.name,
        type: 'line',
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        symbol: 'none',
        sampling: samplingMode === 'none' ? undefined : samplingMode,
        lineStyle: { width: 1.5, color: ch.color, type: ch.lineStyleType },
        data: time_ms.map((t, i) => [t, ch.scaledValues[i] ?? null]),
        z: 3,
      });
    }
  });

  // Cursors (MarkLines) unchanged...
  const cursorMarkLines = [];
  if (cursors.A !== null) {
    cursorMarkLines.push({
      xAxis: cursors.A,
      lineStyle: { color: theme.cursorAColor, width: 1.5, type: 'solid' },
      label: { formatter: 'A', color: theme.cursorAColor, position: 'insideEndTop' },
    });
  }
  if (cursors.B !== null) {
    cursorMarkLines.push({
      xAxis: cursors.B,
      lineStyle: { color: theme.cursorBColor, width: 1.5, type: 'dashed' },
      label: { formatter: 'B', color: theme.cursorBColor, position: 'insideEndTop' },
    });
  }

  if (cursorMarkLines.length > 0 && series.length > 0) {
    const usedGrids = new Set();
    for (const s of series) {
      if (!usedGrids.has(s.xAxisIndex)) {
        usedGrids.add(s.xAxisIndex);
        s.markLine = {
          silent: false,
          symbol: ['none', 'none'],
          data: cursorMarkLines,
        };
      }
    }
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: xAxes.map((_, i) => i),
        start: 0,
        end: 100,
        filterMode: 'none',
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#00606433', type: 'dashed' } },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#0f172a', fontSize: 11 },
      formatter: (params) => {
        if (!params || params.length === 0) return '';
        const t = params[0]?.axisValue?.toFixed(3);
        let html = `<div style="font-weight:700;margin-bottom:6px;color:#006064;border-bottom:1px solid #f1f5f9;padding-bottom:4px">${t} ms</div>`;
        params.forEach(p => {
          if (p.value && p.value[1] !== null) {
            let displayValue = p.value[1];
            if (p.seriesId && p.seriesId.startsWith('digital')) {
              displayValue = p.value[1];
            } else if (typeof displayValue === 'number') {
              displayValue = displayValue.toFixed(4);
            }
            html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block"></span>
                <span style="color:#64748b;font-size:10px">${p.seriesName}</span>
              </div>
              <span style="color:#0f172a;font-weight:700;font-family:var(--font-mono)">${displayValue}</span>
            </div>`;
          }
        });
        return html;
      },
    },
    series: series,
  };
}

function buildLayeringOption({
  primaryData,
  settings,
  layeringGroups,
  crossFileData = {},
  primaryDisturbanceId,
  laneHeight = 120,
}) {
  if (!primaryData || layeringGroups.length === 0) {
    const { theme } = settings || { theme: { textColor: '#64748b' } };
    return {
      backgroundColor: 'transparent',
      animation: false,
      series: [],
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: !primaryData ? 'Waiting for primary waveform page...' : 'No layer groups yet.',
          fill: theme?.textColor || '#64748b',
          fontSize: 12,
        }
      }
    };
  }
  const { theme } = settings;

  const normalizeKey = (s) => String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const grids = [];
  const xAxes = [];
  const yAxes = [];
  const series = [];

  // Calculate vertical layout
  const gridSpacing = 30; // space between groups
  const topPadding = 20;

  layeringGroups.forEach((group, groupIdx) => {
    const top = topPadding + groupIdx * (laneHeight + gridSpacing);
    
    grids.push({
      top: `${top}px`,
      height: `${laneHeight}px`,
      left: '60px',
      right: '60px',
      containLabel: false
    });

    xAxes.push({
      type: 'value',
      gridIndex: groupIdx,
      show: true,
      axisLabel: { show: groupIdx === layeringGroups.length - 1, color: theme.textColor, fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: theme.gridColor, type: 'dashed', opacity: 0.3 } },
      axisLine: { lineStyle: { color: theme.gridColor } },
      min: 'dataMin',
      max: 'dataMax'
    });

    yAxes.push(
      { 
        type: 'value',
        gridIndex: groupIdx,
        position: 'left',
        splitLine: { show: true, lineStyle: { color: theme.gridColor, opacity: 0.1 } },
        axisLabel: { color: theme.textColor, fontSize: 8 },
      },
      { 
        type: 'value',
        gridIndex: groupIdx,
        position: 'right',
        splitLine: { show: false },
        axisLabel: { color: theme.textColor, fontSize: 8 },
      }
    );

    group.channels.forEach(chCfg => {
      // Use loose comparison to handle number vs string IDs
      const isPrimary = !chCfg.disturbanceId || String(chCfg.disturbanceId) === String(primaryDisturbanceId);
      const sourceData = isPrimary ? primaryData : crossFileData[chCfg.disturbanceId];
      
      if (!sourceData) {
        console.warn('No source data for channel', chCfg.name, 'in group', group.name);
        return;
      }

      const channelsData = sourceData.analog || [];
      const analogByKey = new Map();
      channelsData.forEach(c => {
        const k = normalizeKey(c.name);
        if (k && !analogByKey.has(k)) analogByKey.set(k, c);
      });

      const channel = analogByKey.get(normalizeKey(chCfg.name)) || channelsData.find(c => c.name === chCfg.name);
      if (!channel) {
        console.warn('[layering] Channel not found in waveform page', {
          requested: chCfg.name,
          disturbanceId: chCfg.disturbanceId,
          available: channelsData.slice(0, 10).map(c => c.name),
          availableCount: channelsData.length,
        });
        return;
      }

      const offset = chCfg.offsetMs || 0;
      const sourceTime = sourceData.time_ms || [];
      const config = (settings.channelConfigs || {})[chCfg.name] || {};
      const scale = config.scale || 1;
      const values = channel.values || [];

      const n = Math.min(sourceTime.length, values.length);
      if (n === 0) return;

      series.push({
        name: `${group.name}: ${chCfg.name}`,
        type: 'line',
        xAxisIndex: groupIdx,
        yAxisIndex: chCfg.yAxis === 'right' ? (groupIdx * 2 + 1) : (groupIdx * 2),
        symbol: 'none',
        lineStyle: { width: 1.5, color: chCfg.color },
        data: Array.from({ length: n }, (_, i) => [sourceTime[i] + offset, (values[i] ?? null) === null ? null : (values[i] * scale)]),
        z: 3
      });
    });
  });

  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    tooltip: { trigger: 'axis' },
    series,
    ...(series.length === 0 ? {
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: 'No layered waveforms to display (channels not found on current page).',
          fill: theme.textColor,
          fontSize: 12,
        }
      }
    } : {})
  };
}

const WaveformViewer = ({ disturbanceId }) => {
  const [rawPage, setRawPage] = useState(1);
  const [rawWindowMs, setRawWindowMs] = useState(500);
  const [rawLaneHeight, setRawLaneHeight] = useState(60);

  const [calcPage, setCalcPage] = useState(1);
  const [calcWindowMs, setCalcWindowMs] = useState(500);
  const [calcLaneHeight, setCalcLaneHeight] = useState(60);

  const [mode, setMode] = useState('instantaneous');
  const [cursors, setCursors] = useState({ A: null, B: null, active: 'A' });
  const [hoveredValues, setHoveredValues] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalculatedModal, setShowCalculatedModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [view, setView] = useState('raw'); 
  const [calculatedDefinitions, setCalculatedDefinitions] = useState([]);
  const [samplingMode, setSamplingMode] = useState('none'); // 'none' (Raw) or 'lttb' (Optimized)
  const [hiddenChannels, setHiddenChannels] = useState(new Set());
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);

  const [allDisturbances, setAllDisturbances] = useState([]);
  const [crossFileData, setCrossFileData] = useState({}); // { [id]: data }
  const [layeringGroups, setLayeringGroups] = useState([]);
  const [showLayeringModal, setShowLayeringModal] = useState(false);
  const [activeLayeringGroupId, setActiveLayeringGroupId] = useState(null);
  const [layeringModalEditId, setLayeringModalEditId] = useState(null);
  const [layeringPage, setLayeringPage] = useState(1);
  const [layeringWindowMs, setLayeringWindowMs] = useState(500);
  const [layeringLaneHeight, setLayeringLaneHeight] = useState(120); // Taller lanes for overlays

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const rawResult = useWaveformData(disturbanceId, rawPage, rawWindowMs, mode);
  const calcBaseResult = useWaveformData(disturbanceId, calcPage, calcWindowMs, mode);

  const { meta, loading: metaLoading, refetch: refetchMeta } = useChannelMeta(disturbanceId);
  const { settings, updateSettings } = useSettings();

  const getPhaseColor = useCallback((phase) => {
    const phaseColors = { R: '#ef4444', Y: '#f59e0b', B: '#3b82f6', N: '#10b981' };
    return phaseColors[phase] || '#64748b';
  }, []);

  // Merged configurations: Record-level (from backend) + App-level (local settings)
  const mergedConfigs = useMemo(() => {
    const recordConfigs = {};
    if (meta) {
      [...(meta.analog || []), ...(meta.digital || [])].forEach(ch => {
        recordConfigs[ch.name] = {
          title: ch.title,
          color: ch.color,
          scale: ch.scale,
          visible: ch.visible
        };
      });
    }
    return { ...settings.channelConfigs, ...recordConfigs };
  }, [meta, settings.channelConfigs]);

  // Derive display channels for the sidebar
  const allChannels = useMemo(() => {
    const data = rawResult.data;
    if (!data) return [];
    
    const digitalWithColor = (data.digital || [])
      .map(ch => {
        const config = mergedConfigs[ch.name] || {};
        if (hiddenChannels.has(ch.name)) return null;
        return { 
          ...ch, 
          title: config.title || ch.name,
          color: config.color || settings.theme.digitalHighColor, 
          type: 'digital',
          values: config.scale ? ch.values.map(v => v * config.scale) : ch.values
        };
      })
      .filter(Boolean);

    const analogWithColor = (data.analog || [])
      .map(ch => {
        const config = mergedConfigs[ch.name] || {};
        if (hiddenChannels.has(ch.name)) return null;
        
        let unitPrefix = '';
        if (config.scale === 0.001) unitPrefix = 'k';
        if (config.scale === 0.000001) unitPrefix = 'M';
        const displayUnit = ch.unit ? `${unitPrefix}${ch.unit}` : '';

        return { 
          ...ch, 
          title: config.title || ch.name,
          unit: displayUnit,
          color: config.color || getPhaseColor(ch.phase), 
          type: 'analog',
          values: config.scale ? ch.values.map(v => v !== null ? v * config.scale : null) : ch.values
        };
      })
      .filter(Boolean);

    return sortChannels([...analogWithColor, ...digitalWithColor]);
  }, [rawResult.data, getPhaseColor, settings.theme.digitalHighColor, mergedConfigs, hiddenChannels]);

  // compute engine for calculated channels
  const calculatedData = useMemo(() => {
    const data = calcBaseResult.data;
    if (!data || !data.analog || calculatedDefinitions.length === 0) return null;
    const time_ms = data.time_ms || [];
    const analogMap = {};
    data.analog.forEach(ch => { analogMap[ch.name] = ch; });

    const computedAnalog = calculatedDefinitions.map(def => {
      const formula = def.formula || '';
      if (!formula.trim()) return null;
      try {
        const matches = formula.match(/\[(.*?)\]/g) || [];
        const uniqueChannels = [...new Set(matches)];
        const channelSources = uniqueChannels.map(m => {
          const name = m.slice(1, -1);
          return { placeholder: m, name, data: analogMap[name] };
        });
        if (channelSources.some(s => !s.data)) return null;
        let cleanExpr = formula;
        channelSources.forEach((s, idx) => {
          const escaped = s.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          cleanExpr = cleanExpr.replace(new RegExp(escaped, 'g'), `v${idx}`);
        });
        const argNames = channelSources.map((_, i) => `v${i}`);
        const evaluator = new Function(...argNames, `return (${cleanExpr})`);
        const samplesCount = time_ms.length;
        const values = new Float32Array(samplesCount);
        for (let i = 0; i < samplesCount; i++) {
          const args = channelSources.map(s => s.data.values[i]);
          try {
            const res = evaluator(...args);
            values[i] = isFinite(res) ? res : 0;
          } catch (e) { values[i] = 0; }
        }
        return {
          id: def.id,
          name: def.name,
          values: Array.from(values),
          unit: channelSources[0]?.data.unit || '',
          phase: 'default',
          color: def.color,
          formula: def.formula
        };
      } catch (err) { return null; }
    }).filter(Boolean);

    return { time_ms, analog: computedAnalog, digital: [], total_pages: data.total_pages, total_samples: data.total_samples };
  }, [calcBaseResult.data, calculatedDefinitions]);

  const handleUpdateLayering = (groups) => {
    setLayeringGroups(groups);
    if (!activeLayeringGroupId && groups.length > 0) {
      setActiveLayeringGroupId(groups[0].id);
    }
  };

  const handleAddToLayer = (channel) => {
    let targetGroups = [...layeringGroups];
    let activeId = activeLayeringGroupId;

    if (!activeId || !layeringGroups.find(g => g.id === activeId)) {
      const newId = Math.random().toString(36).substr(2, 9);
      const newGroup = {
        id: newId,
        name: `Layer Group ${layeringGroups.length + 1}`,
        channels: []
      };
      targetGroups.push(newGroup);
      activeId = newId;
      setActiveLayeringGroupId(newId);
    }

    const group = targetGroups.find(g => g.id === activeId);
    if (!group) return; // Should not happen

    const alreadyIn = group.channels.find(c => c.name === channel.name && c.disturbanceId === (channel.disturbanceId || disturbanceId));

    if (!alreadyIn) {
      // Basic type detection for validation
      const unit = (channel.unit || '').toLowerCase();
      const type = (unit.includes('v') || unit.includes('volt')) ? 'Voltage' : 
                   (unit.includes('a') || unit.includes('amp')) ? 'Current' : 'Other';

      group.channels.push({
        name: channel.name,
        disturbanceId: channel.disturbanceId || disturbanceId,
        color: channel.color || '#64748b',
        yAxis: 'left',
        offsetMs: 0,
        type
      });
      handleUpdateLayering(targetGroups);
    }

    setView('layering'); 
  };

  const calcChartRef = useRef(null);
  const calcChartInstance = useRef(null);
  const layeringChartRef = useRef(null);
  const layeringChartInstance = useRef(null);

  useEffect(() => {
    if (!calculatedData || !calcChartRef.current || view !== 'advanced') return;
    if (!calcChartInstance.current) calcChartInstance.current = echarts.init(calcChartRef.current, null, { renderer: 'canvas' });
    const option = buildChartOption({ 
      data: calculatedData, 
      settings, 
      mergedConfigs, 
      cursors, 
      samplingMode, 
      hiddenChannels,
      laneHeight: calcLaneHeight 
    });
    calcChartInstance.current.setOption(option, { notMerge: true });

    // Cursor click handler
    const zr = calcChartInstance.current.getZr();
    zr.off('click');
    zr.on('click', (params) => {
      if (!calcChartInstance.current) return;
      const pointInPixel = [params.offsetX, calcLaneHeight / 2]; 
      const pointInData = calcChartInstance.current.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
      if (pointInData) {
        let t = pointInData[0];
        const tArr = calculatedData.time_ms || [];
        if (tArr.length > 0) {
          const tMin = tArr[0];
          const tMax = tArr[tArr.length - 1];
          t = Math.max(tMin, Math.min(tMax, t));
        }
        setCursors(prev => {
          const next = { ...prev };
          next[prev.active] = t;
          next.active = prev.active === 'A' ? 'B' : 'A';
          return next;
        });
      }
    });

    // Hovered value tracking
    calcChartInstance.current.off('updateAxisPointer');
    calcChartInstance.current.on('updateAxisPointer', (evt) => {
      if (!evt.axesInfo || evt.axesInfo.length === 0) return;
      const xVal = evt.axesInfo[0]?.value;
      if (xVal === undefined) return;
      const newVals = {};
      const tArr = calculatedData.time_ms || [];
      let minDiff = Infinity, nearestIdx = 0;
      for (let i = 0; i < tArr.length; i++) {
        const d = Math.abs(tArr[i] - xVal);
        if (d < minDiff) { minDiff = d; nearestIdx = i; }
      }
      (calculatedData.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      (calculatedData.digital || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      // Also include raw data just in case, though they might not be visible in sidebar
      if (rawResult.data) {
        (rawResult.data.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
        (rawResult.data.digital || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      }
      setHoveredValues({ t: xVal, channels: newVals });
    });

    const ro = new ResizeObserver(() => calcChartInstance.current?.resize());
    ro.observe(calcChartRef.current);
    return () => {
      ro.disconnect();
      calcChartInstance.current?.off('updateAxisPointer');
      calcChartInstance.current?.getZr().off('click');
    };
  }, [calculatedData, rawResult.data, settings, cursors, calcLaneHeight, view, mergedConfigs, hiddenChannels, samplingMode]);
  useEffect(() => {
    const data = rawResult.data;
    if (!data || !chartRef.current) return;
    if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    const option = buildChartOption({ 
      data, 
      settings, 
      mergedConfigs, 
      cursors, 
      samplingMode, 
      hiddenChannels,
      laneHeight: rawLaneHeight 
    });
    chartInstance.current.setOption(option, { notMerge: true });

    const zr = chartInstance.current.getZr();
    zr.off('click');
    zr.on('click', (params) => {
      if (!chartInstance.current) return;
      const pointInPixel = [params.offsetX, rawLaneHeight / 2]; 
      const pointInData = chartInstance.current.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
      if (pointInData) {
        let t = pointInData[0];
        const tArr = data.time_ms || [];
        if (tArr.length > 0) {
          const tMin = tArr[0];
          const tMax = tArr[tArr.length - 1];
          t = Math.max(tMin, Math.min(tMax, t));
        }
        setCursors(prev => {
          const next = { ...prev };
          next[prev.active] = t;
          next.active = prev.active === 'A' ? 'B' : 'A';
          return next;
        });
      }
    });

    chartInstance.current.off('updateAxisPointer');
    chartInstance.current.on('updateAxisPointer', (evt) => {
      if (!evt.axesInfo || evt.axesInfo.length === 0) return;
      const xVal = evt.axesInfo[0]?.value;
      if (xVal === undefined) return;
      const newVals = {};
      const tArr = data.time_ms || [];
      let minDiff = Infinity, nearestIdx = 0;
      for (let i = 0; i < tArr.length; i++) {
        const d = Math.abs(tArr[i] - xVal);
        if (d < minDiff) { minDiff = d; nearestIdx = i; }
      }
      (data.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      (data.digital || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      if (calculatedData) {
        (calculatedData.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
      }
      setHoveredValues({ t: xVal, channels: newVals });
    });

    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chartInstance.current?.off('updateAxisPointer');
      chartInstance.current?.getZr().off('click');
    };
  }, [rawResult.data, calculatedData, settings, cursors, rawLaneHeight, view, mergedConfigs, hiddenChannels, samplingMode]);

  useEffect(() => {
    if (!layeringChartRef.current || view !== 'layering' || layeringGroups.length === 0) return;

    if (!layeringChartInstance.current) {
      layeringChartInstance.current = echarts.init(layeringChartRef.current, null, { renderer: 'canvas' });
    }
    const chart = layeringChartInstance.current;

    // Defer init one frame so the container has size
    let rafId = window.requestAnimationFrame(() => {
      const option = buildLayeringOption({
        primaryData: rawResult.data,
        settings,
        layeringGroups,
        crossFileData,
        primaryDisturbanceId: disturbanceId,
        laneHeight: layeringLaneHeight,
      });

      chart.setOption(option, { notMerge: true });
      // Ensure it paints even if init happened while hidden
      chart.resize();
    });

    const zr = chart.getZr();
    zr.off('click');
    zr.on('click', (params) => {
      if (!chart) return;
      const pointInPixel = [params.offsetX, layeringLaneHeight / 2]; 
      const pointInData = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
      if (pointInData) {
        let t = pointInData[0];
        const tArr = rawResult.data?.time_ms || [];
        if (tArr.length > 0) {
          const tMin = tArr[0], tMax = tArr[tArr.length - 1];
          t = Math.max(tMin, Math.min(tMax, t));
        }
        setCursors(prev => {
          const next = { ...prev };
          next[prev.active] = t;
          next.active = prev.active === 'A' ? 'B' : 'A';
          return next;
        });
      }
    });

    chart.off('updateAxisPointer');
    chart.on('updateAxisPointer', (evt) => {
      if (!evt.axesInfo || evt.axesInfo.length === 0) return;
      const xVal = evt.axesInfo[0]?.value;
      if (xVal === undefined) return;
      
      const newVals = {};
      const tArrPrimary = rawResult.data?.time_ms || [];
      if (tArrPrimary.length === 0) return;
      const primaryNearest = tArrPrimary.reduce((prev, curr, i) => Math.abs(curr - xVal) < Math.abs(tArrPrimary[prev] - xVal) ? i : prev, 0);
      
      (rawResult.data?.analog || []).forEach(ch => { newVals[ch.name] = ch.values[primaryNearest]; });

      // Add values from cross-file data
      Object.keys(crossFileData || {}).forEach(extId => {
        const ext = crossFileData[extId];
        const tArrExt = ext?.time_ms || [];
        if (tArrExt.length === 0) return;
        const extNearest = tArrExt.reduce((prev, curr, i) => Math.abs(curr - xVal) < Math.abs(tArrExt[prev] - xVal) ? i : prev, 0);
        (ext?.analog || []).forEach(ch => { 
          // We use name + extId to avoid collisions in hover readout if multiple files have same channel name
          newVals[`${ch.name}_${extId}`] = ch.values[extNearest]; 
        });
      });
      
      setHoveredValues({ t: xVal, channels: newVals });
    });

    const ro = new ResizeObserver(() => layeringChartInstance.current?.resize());
    ro.observe(layeringChartRef.current);
    return () => {
      ro.disconnect();
      chart?.off('updateAxisPointer');
      chart?.getZr().off('click');
      window.cancelAnimationFrame(rafId);
    };
  }, [rawResult.data, layeringGroups, settings, cursors, layeringLaneHeight, view, crossFileData, disturbanceId]);

  const handleExternalZoom = useCallback((params) => {
    const activeChart = view === 'raw' ? chartInstance.current : calcChartInstance.current;
    if (!activeChart) return;
    const { start, end } = params;
    activeChart.setOption({ dataZoom: [{ type: 'inside', start, end }] });
  }, [view]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      calcChartInstance.current?.dispose();
      layeringChartInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    setRawPage(1);
    setCalcPage(1);
    setCursors({ A: null, B: null, active: 'A' });
    setHoveredValues({});
    
    // Auto-prompt mapping if no config exists for this record
    if (disturbanceId && meta && !meta.has_config) {
      setShowMappingModal(true);
    }
  }, [disturbanceId, meta]);

  useEffect(() => {
    fetch('/api/v1/disturbances/all/')
      .then(r => r.json())
      .then(setAllDisturbances)
      .catch(console.error);
  }, []);

  // Sync crossFileData for any external records in layeringGroups
  useEffect(() => {
    const externalIds = new Set();
    
    layeringGroups.forEach(g => {
      g.channels.forEach(ch => {
        // Only fetch if it's a valid external ID (not primary, not 'current', not null)
        if (ch.disturbanceId && 
            ch.disturbanceId !== disturbanceId && 
            ch.disturbanceId !== 'current' &&
            ch.disturbanceId !== 'null') {
          externalIds.add(ch.disturbanceId);
        }
      });
    });

    externalIds.forEach(extId => {
      if (!crossFileData[extId]) {
        fetch(`/api/v1/disturbances/${extId}/waveform/?page=${layeringPage}&window_ms=${layeringWindowMs}&mode=${mode}`)
          .then(r => r.json())
          .then(res => {
            // The waveform endpoint returns the payload at the top level.
            // Store the whole response as { [id]: { time_ms, analog, ... } }.
            setCrossFileData(prev => ({ ...prev, [extId]: res }));
          })
          .catch(console.error);
      }
    });
  }, [layeringGroups, layeringPage, layeringWindowMs, mode, disturbanceId]);

  useEffect(() => {
    if (view === 'raw' && chartInstance.current) setTimeout(() => chartInstance.current.resize(), 0);
    if (view === 'layering' && layeringChartInstance.current) setTimeout(() => layeringChartInstance.current.resize(), 0);
  }, [view]);

  const getValuesAt = useCallback((t) => {
    if (t === null) return null;
    const vals = {};
    const lookups = [
      { data: rawResult.data, analog: rawResult.data?.analog || [], digital: rawResult.data?.digital || [] },
      { data: calculatedData, analog: calculatedData?.analog || [], digital: [] }
    ];

    lookups.forEach(src => {
      if (!src.data) return;
      const tArr = src.data.time_ms || [];
      let minDiff = Infinity, nearestIdx = 0;
      for (let i = 0; i < tArr.length; i++) {
        const d = Math.abs(tArr[i] - t);
        if (d < minDiff) { minDiff = d; nearestIdx = i; }
      }
      src.analog.forEach(ch => { vals[ch.name] = ch.values[nearestIdx]; });
      src.digital.forEach(ch => { vals[ch.name] = ch.values[nearestIdx]; });
    });
    return vals;
  }, [rawResult.data, calculatedData]);

  const cursorAValues = useMemo(() => getValuesAt(cursors.A), [cursors.A, getValuesAt]);
  const cursorBValues = useMemo(() => getValuesAt(cursors.B), [cursors.B, getValuesAt]);

  const delta = useMemo(() => {
    const dt = (cursors.A !== null && cursors.B !== null) ? Math.abs(cursors.B - cursors.A).toFixed(3) : null;
    return { A: cursors.A !== null ? cursors.A.toFixed(2) : '--', B: cursors.B !== null ? cursors.B.toFixed(2) : '--', dt };
  }, [cursors]);

  if (!disturbanceId) {
    return (
      <div className={styles.emptyState}>
        <RiPulseLine className={styles.emptyIcon} />
        <p className={styles.emptyText}>Select a disturbance to analyze waveform</p>
      </div>
    );
  }

  const currentLaneHeight = view === 'raw' ? rawLaneHeight : calcLaneHeight;
  const setLaneHeight = view === 'raw' ? setRawLaneHeight : setCalcLaneHeight;
  const currentData = view === 'raw' ? rawResult.data : calcBaseResult.data;
  const currentPage = view === 'raw' ? rawPage : calcPage;
  const setPage = view === 'raw' ? setRawPage : setCalcPage;
  const currentWindowMs = view === 'raw' ? rawWindowMs : calcWindowMs;
  const setWindowMs = view === 'raw' ? setRawWindowMs : setCalcWindowMs;
  const currentLoading = view === 'raw' ? rawResult.loading : calcBaseResult.loading;
  const currentError = view === 'raw' ? rawResult.error : calcBaseResult.error;

  return (
    <div className={`${styles.viewerContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      <WaveformToolbar
        mode={mode} onModeChange={setMode} laneHeight={currentLaneHeight} onLaneHeightChange={setLaneHeight}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMapping={() => setShowMappingModal(true)}
        onOpenVisibility={() => setShowVisibilityPanel(true)}
        isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)}
        samplingMode={samplingMode} onSamplingModeChange={setSamplingMode}
        cursors={cursors} onCursorChange={setCursors} delta={delta} meta={meta} data={currentData}
      />

      <div className={styles.viewTabs}>
        <button className={`${styles.viewTab} ${view === 'raw' ? styles.activeViewTab : ''}`} onClick={() => setView('raw')}>Raw Waveform</button>
        <button className={`${styles.viewTab} ${view === 'advanced' ? styles.activeViewTab : ''}`} onClick={() => setView('advanced')}>Calculated Channels</button>
        <button className={`${styles.viewTab} ${view === 'layering' ? styles.activeViewTab : ''}`} onClick={() => setView('layering')}>Channel Layering</button>
      </div>

      <div className={styles.viewContent} style={{ display: view === 'raw' ? 'flex' : 'none' }}>
        <div className={styles.stickyHeader}>
          <div className={styles.sidebarSpacer} />
          <div className={styles.zoomContainer}>
            {rawResult.data && <ZoomSlider data={rawResult.data} settings={settings} onZoom={handleExternalZoom} height={20} />}
          </div>
        </div>

        <div className={styles.mainArea}>
          <div style={{ height: `${allChannels.length * rawLaneHeight + 20}px` }}>
            <ChannelSidebar
              channels={allChannels} 
              hoveredValues={hoveredValues} 
              cursorAValues={cursorAValues} 
              cursorBValues={cursorBValues}
              cursors={cursors} 
              settings={settings} 
              laneHeight={rawLaneHeight}
              onAddToLayer={handleAddToLayer}
            />
          </div>
          <div className={styles.chartWrapper} style={{ height: `${allChannels.length * rawLaneHeight + 20}px` }}>
            {rawResult.loading && <div className={styles.loadingOverlay}><RiLoader4Line className={styles.spinner} /><span>Loading waveform data...</span></div>}
            {rawResult.error && <div className={styles.errorOverlay}><p>⚠ {rawResult.error}</p></div>}
            <div ref={chartRef} className={styles.chart} style={{ height: '100%' }} />
          </div>
        </div>
      </div>

      <div className={styles.viewContent} style={{ display: view === 'advanced' ? 'flex' : 'none' }}>
        <div className={styles.calculatedHeader}>
          <div className={styles.calcTitle}><RiCalculatorLine /><span>Virtual Waveforms</span></div>
          <div className={styles.headerActions}>
            <button className={styles.manageBtn} onClick={() => setShowCalculatedModal(true)}><RiSettings3Line /> Manage Calculations</button>
          </div>
        </div>

        {calculatedDefinitions.length > 0 ? (
          <div className={styles.mainArea}>
            <div style={{ height: `${calculatedDefinitions.length * calcLaneHeight + 20}px` }}>
              <ChannelSidebar
                channels={calculatedData?.analog.map(ch => ({ ...ch, type: 'analog' })) || []}
                hoveredValues={hoveredValues} cursorAValues={cursorAValues} cursorBValues={cursorBValues}
                cursors={cursors} settings={settings} laneHeight={calcLaneHeight}
              />
            </div>
            <div className={styles.chartWrapper} style={{ height: `${calculatedDefinitions.length * calcLaneHeight + 20}px` }}>
              {calcBaseResult.loading && (
                <div className={styles.loadingOverlay}>
                  <RiLoader4Line className={styles.spinner} />
                  <span>Calculating virtual waveforms...</span>
                </div>
              )}
              {calcBaseResult.error && (
                <div className={styles.errorOverlay}>
                  <p>⚠ {calcBaseResult.error}</p>
                </div>
              )}
              <div ref={calcChartRef} className={styles.chart} style={{ height: '100%' }} />
            </div>
          </div>
        ) : (
          <div className={styles.advancedPlaceholder}>
            <div className={styles.placeholderContent}>
              <RiCalculatorLine className={styles.placeholderIcon} />
              <h3>No Calculated Channels</h3>
              <p>Define new waveforms (e.g., IA + IB) to perform multi-channel analysis.</p>
              <button className={styles.primaryAddBtn} onClick={() => setShowCalculatedModal(true)}><RiAddLine /> Create First Calculation</button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.viewContent} style={{ display: view === 'layering' ? 'flex' : 'none' }}>
        <div className={styles.mainArea}>
          <LayeringSidebar 
            groups={layeringGroups}
            activeGroupId={activeLayeringGroupId}
            onSelectGroup={setActiveLayeringGroupId}
            onUpdateGroups={handleUpdateLayering}
            onOpenModal={(id) => {
              setLayeringModalEditId(id);
              setShowLayeringModal(true);
            }}
            samplingInterval={rawResult.data?.time_ms?.length > 1 ? (rawResult.data.time_ms[1] - rawResult.data.time_ms[0]) : 1}
          />

          {layeringGroups.length > 0 ? (
            <div className={styles.chartWrapper} style={{ height: `${layeringGroups.length * (layeringLaneHeight + 30) + 40}px` }}>
              {rawResult.loading && <div className={styles.loadingOverlay}><RiLoader4Line className={styles.spinner} /><span>Updating overlays...</span></div>}
              <div ref={layeringChartRef} className={styles.chart} style={{ height: '100%' }} />
            </div>
          ) : (
            <div className={styles.advancedPlaceholder}>
              <div className={styles.placeholderContent}>
                <RiStackLine className={styles.placeholderIcon} />
                <h3>Streamlined Layering</h3>
                <p>Add channels to an overlay group directly from the sidebar, or create one here.</p>
                <button className={styles.primaryAddBtn} onClick={() => setView('raw')}>
                  <RiPulseLine /> Go to Raw Waveform to Pick Channels
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shared Bottom Bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomRowTop}>
          <div className={styles.deltaReadout}>
            <span className={`${styles.deltaLabel} ${cursors.active === 'A' ? styles.active : ''}`}>A:</span>
            <span className={styles.deltaA}>{delta.A} ms</span>
            <span className={`${styles.deltaLabel} ${cursors.active === 'B' ? styles.active : ''}`}>B:</span>
            <span className={styles.deltaB}>{delta.B} ms</span>
            {delta.dt && <><span className={styles.deltaSep}>|</span><span className={styles.deltaDt}>Δt = {delta.dt} ms</span></>}
          </div>
          <button className={styles.clearCursors} onClick={() => setCursors({ A: null, B: null, active: 'A' })} disabled={cursors.A === null && cursors.B === null} style={{ opacity: (cursors.A !== null || cursors.B !== null) ? 1 : 0.5, marginLeft: 'auto' }}>✕ Clear</button>
        </div>
        <div className={styles.bottomRowBottom}>
          <div className={styles.bottomRightActions}>
            <div className={styles.hoverTime}>
              <span className={styles.timeLabel}>T =</span>
              <span className={styles.timeValue}>{hoveredValues.t !== undefined ? `${Number(hoveredValues.t).toFixed(3)} ms` : '--'}</span>
            </div>
            <div className={styles.vScaleBar}>
              <span className={styles.timeLabel}>V-SCALE</span>
              <input type="range" min="40" max="300" step="10" value={currentLaneHeight} onChange={(e) => setLaneHeight(Number(e.target.value))} className={styles.vScaleInput} />
            </div>
            <PaginationBar page={currentPage} totalPages={currentData?.total_pages || 1} windowMs={currentWindowMs} onPageChange={setPage} onWindowChange={(ms) => { setWindowMs(ms); setPage(1); }} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showVisibilityPanel && (
          <ChannelVisibilityDrawer 
            channels={[
              ...(rawResult.data?.analog || []).map(ch => ({ ...ch, type: 'analog' })),
              ...(rawResult.data?.digital || []).map(ch => ({ ...ch, type: 'digital' }))
            ].map(ch => ({ 
              ...ch, 
              title: mergedConfigs[ch.name]?.title || ch.name, 
              color: ch.color || (ch.type === 'digital' ? settings.theme.digitalHighColor : getPhaseColor(ch.phase)) 
            }))} 
            hiddenChannels={hiddenChannels} 
            onToggle={setHiddenChannels} 
            onClose={() => setShowVisibilityPanel(false)} 
          />
        )}
        {showCalculatedModal && <CalculatedChannelModal analogChannels={rawResult.data?.analog || []} definitions={calculatedDefinitions} onUpdate={setCalculatedDefinitions} onClose={() => setShowCalculatedModal(false)} />}
        {showMappingModal && <ChannelMappingModal disturbanceId={disturbanceId} analogChannels={rawResult.data?.analog || []} digitalChannels={rawResult.data?.digital || []} configs={settings.channelConfigs} onUpdate={updateSettings} onSaveSuccess={refetchMeta} onClose={() => setShowMappingModal(false)} settings={settings} />}
        {showSettings && <SettingsModal settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} />}
        {showLayeringModal && (
          <LayeringModal 
            analogChannels={(rawResult.data?.analog || []).map(ch => ({ ...ch, disturbanceId }))} 
            groups={layeringGroups} 
            editingGroupId={layeringModalEditId === 'new' ? null : layeringModalEditId}
            onUpdate={handleUpdateLayering} 
            onClose={() => setShowLayeringModal(false)}
            samplingInterval={rawResult.data?.time_ms?.length > 1 ? (rawResult.data.time_ms[1] - rawResult.data.time_ms[0]) : 1}
            disturbances={allDisturbances}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WaveformViewer;
