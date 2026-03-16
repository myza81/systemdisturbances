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
  RiMistLine, RiTimeLine, RiStackLine, RiLineChartLine, RiCalculatorLine, RiAddLine,
} from 'react-icons/ri';
import { useWaveformData, useChannelMeta } from '../../hooks/useWaveformData';
import { useWaveformMetadata, useWaveformWindow } from '../../hooks/useWaveformWindow';
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
import ReferenceLineDrawer from './referenceLines/ReferenceLineDrawer.jsx';
import referenceLineManager from './referenceLines/ReferenceLineManager.js';
import gridConfigManager from './referenceLines/GridConfigManager.js';
import rulerManager from './referenceLines/RulerManager.js';
import ReferenceLineRenderer from './referenceLines/ReferenceLineRenderer.js';
import IntersectionCalculator from './referenceLines/IntersectionCalculator.js';
import IntersectionDisplay from './referenceLines/IntersectionDisplay.js';
import styles from './WaveformViewer.module.css';

// Perf (dev-only): set `localStorage.waveform_perf = "1"` to enable.
const PERF_ENABLED = (typeof window !== 'undefined') &&
  (window.localStorage?.getItem('waveform_perf') === '1');

function perfNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function clampInt(v, lo, hi) {
  const n = Number.isFinite(v) ? Math.trunc(v) : lo;
  return Math.max(lo, Math.min(hi, n));
}

// Returns index of nearest value in sorted numeric array.
function nearestIndexSorted(arr, x) {
  const n = arr?.length || 0;
  if (n === 0) return 0;
  if (x <= arr[0]) return 0;
  if (x >= arr[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = arr[mid];
    if (v === x) return mid;
    if (v < x) lo = mid + 1;
    else hi = mid - 1;
  }
  // lo is first index where arr[lo] > x
  const i = Math.min(n - 1, Math.max(1, lo));
  const a = arr[i - 1];
  const b = arr[i];
  return (Math.abs(a - x) <= Math.abs(b - x)) ? (i - 1) : i;
}

function applyLiveCursorGraphic(chart, xPx, theme) {
  if (!chart || chart.isDisposed() || !Number.isFinite(xPx)) return;
  const h = chart.getHeight?.() || 0;
  if (h <= 0) return;
  const stroke = theme?.cursorHoverColor || theme?.gridColor || 'rgba(2, 132, 199, 0.45)';
  chart.setOption({
    graphic: [{
      id: 'liveCursor',
      type: 'line',
      silent: true,
      invisible: false,
      shape: { x1: xPx, y1: 0, x2: xPx, y2: h },
      style: { stroke, lineWidth: 1, lineDash: [4, 4], opacity: 0.9 },
      z: 100,
    }]
  }, { notMerge: false, lazyUpdate: false, silent: true });
}

function clearLiveCursorGraphic(chart) {
  if (!chart || chart.isDisposed()) return;
  const h = chart.getHeight?.() || 0;
  const x = 0;
  chart.setOption({
    graphic: [{
      id: 'liveCursor',
      type: 'line',
      silent: true,
      invisible: true,
      shape: { x1: x, y1: 0, x2: x, y2: h },
      style: { opacity: 0 },
      z: 100,
    }]
  }, { notMerge: false, lazyUpdate: false, silent: true });
}

function applyCursorsToCategoryChart(chart, seriesCount, time_ms, cursors, theme, onCursorMove) {
  // Disabled - cursor graphics cause issues with ECharts
  // Cursors are tracked in state and shown in bottom bar
}


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

  // Helper: extract bay/prefix from channel name
  // Handles variations like:
  // - "KPDN1 VR" -> "KPDN1"
  // - "KPDN1+CB_R+OPEN" -> "KPDN1"
  // - "OVER+KPDN1+VR" -> "KPDN1"
  // - "KLMK1 OVER VR" -> "KLMK1"
  // - "KPDN2 VB" -> "KPDN2"
  const extractBay = (name) => {
    const s = name || '';
    const upper = s.toUpperCase();
    
    // List of known bay prefixes in the data (expand as needed)
    const knownBays = ['KPDN1', 'KPDN2', 'SLKS', 'MCRS', 'SGT1', 'TGEN', 'BBTN', 'LPPT', 'MACH', 'SIRP', 'Tanjung', 'KLMK1', 'KLMK2', 'KLMK3', 'KLMK4', 'KLMK5'];
    
    // First check if any known bay is in the name (case insensitive)
    for (const bay of knownBays) {
      const regex = new RegExp('\\b' + bay + '\\b', 'i');
      if (regex.test(s)) return bay.toUpperCase();
    }

    // Try to find a bay-like pattern at the start (alphanumeric prefix before any special chars)
    const match = s.match(/^([A-Z0-9]+)/);
    if (match) return match[1].toUpperCase();
    
    // Last resort: first word
    return s.split(/[\s\-_+/]/)[0].toUpperCase();
  };

  // Helper: extract phase for analog channels
  const extractPhase = (name) => {
    const s = name || '';
    const m = s.match(/[VI]([RYBN])/i);
    return m ? m[1].toUpperCase() : null;
  };

  // Helper: check if channel is digital/protection (not a raw measurement)
  // Looks for common protection mnemonics and patterns
  const isDigital = (ch) => {
    const n = (ch.title || ch.name || '').toUpperCase();
    
    // Already marked as digital type in metadata
    if (ch.type === 'digital') return true;
    
    // Has + separator (common in COMTRADE digital channel names)
    if (n.includes('+')) return true;
    
    // Common protection/status prefixes (these are digital, not measurement)
    const digitalPrefixes = [
      'OVER', 'UNDER', '50', '51', '52', '67', '87', '21', '79', 
      'CB_', 'CBF', 'DIST', 'SOTF', 'AR_', 'Z1', 'Z2', 'Z3',
      'TRIP', 'PICKUP', 'OPEN', 'CLOSE', 'LOCKOUT', 'ATTEMPTED',
      'RECEIVE', 'SEND', 'FAIL', 'COMM', 'OPRT', 'STG'
    ];
    
    for (const prefix of digitalPrefixes) {
      if (n.startsWith(prefix) || n.includes('+' + prefix)) {
        return true;
      }
    }
    
    // If it ends with just a phase letter (like VR, VY, VB) without V/I prefix, 
    // it's likely analog. But if it has other words, it's probably digital.
    // Example: "KLMK1 OVER VR" - has "OVER" so digital
    // Example: "KPDN1 VR" - just VR at end, analog
    const justPhase = n.match(/^[A-Z0-9]+\s+(VR|VY|VB|VN|IR|IY|IB|IN)$/);
    if (justPhase) return false;
    
    // If name has multiple parts and doesn't match V/I pattern, likely digital
    const parts = n.split(/[\s\-_+/]/).filter(Boolean);
    if (parts.length > 2) return true;
    
    return false;
  };

  const analog = [];
  const digital = [];

  channels.forEach(ch => {
    if (isDigital(ch)) {
      digital.push(ch);
    } else {
      analog.push(ch);
    }
  });

  // Sort analog: by bay, then V before I, then R-Y-B-N
  analog.sort((a, b) => {
    const nameA = a.title || a.name || '';
    const nameB = b.title || b.name || '';

    const bayA = extractBay(nameA);
    const bayB = extractBay(nameB);
    if (bayA !== bayB) return bayA.localeCompare(bayB);

    const typeA = nameA.match(/[VI]/i)?.[0]?.toUpperCase() || 'I';
    const typeB = nameB.match(/[VI]/i)?.[0]?.toUpperCase() || 'I';
    if (typeA !== typeB) return typeA === 'V' ? -1 : 1;

    const phaseA = extractPhase(nameA);
    const phaseB = extractPhase(nameB);
    const orderA = phaseA ? phaseOrder[phaseA] : 99;
    const orderB = phaseB ? phaseOrder[phaseB] : 99;
    return orderA - orderB;
  });

  // Sort digital: group by bay, place after corresponding analog group
  digital.sort((a, b) => {
    const bayA = extractBay(a.title || a.name || '');
    const bayB = extractBay(b.title || b.name || '');
    if (bayA !== bayB) return bayA.localeCompare(bayB);
    // Within same bay, alphabetical
    return (a.title || a.name || '').localeCompare(b.title || b.name || '');
  });

  // Interleave: for each bay, place analog V, then analog I, then digital
  const result = [];
  
  // Group analog by bay and type (V/I)
  const analogByBay = new Map(); // bay -> { V: [], I: [] }
  analog.forEach(ch => {
    const bay = extractBay(ch.title || ch.name || '');
    const type = (ch.title || ch.name || '').match(/[VI]/i)?.[0]?.toUpperCase() || 'I';
    if (!analogByBay.has(bay)) analogByBay.set(bay, { V: [], I: [] });
    analogByBay.get(bay)[type].push(ch);
  });
  
  // Group digital by bay
  const digitalByBay = new Map();
  digital.forEach(ch => {
    const bay = extractBay(ch.title || ch.name || '');
    if (!digitalByBay.has(bay)) digitalByBay.set(bay, []);
    digitalByBay.get(bay).push(ch);
  });

  // Get all unique bays from analog, then add any bays only in digital
  const allBays = new Set([...analogByBay.keys(), ...digitalByBay.keys()]);
  const sortedBays = [...allBays].sort();
  
  sortedBays.forEach(bay => {
    // Add Voltage channels first
    if (analogByBay.has(bay)) {
      analogByBay.get(bay).V.forEach(ch => result.push(ch));
      // Add Current channels
      analogByBay.get(bay).I.forEach(ch => result.push(ch));
    }
    // Add Digital channels
    if (digitalByBay.has(bay)) {
      digitalByBay.get(bay).forEach(ch => result.push(ch));
    }
  });

  return result;
}

// ─── Build ECharts option from waveform data ──────────────────────────────

function buildChartOption({ data, settings, mergedConfigs, samplingMode, hiddenChannels, laneHeight = 60 }) {
  const { theme } = settings;
  const phaseColors = settings.phaseColors || { R: '#ef4444', Y: '#f59e0b', B: '#3b82f6', N: '#10b981', default: '#64748b' };
  const channelConfigs = mergedConfigs || settings.channelConfigs || {};
  const analog = data.analog || [];
  const digital = data.digital || [];
  const time_ms = data.time_ms || [];

  const representation = data.representation || 'raw';
  const isEnvelopeResponse = representation === 'envelope';

  const interleave = (a, b) => {
    const n = Math.min(a?.length || 0, b?.length || 0);
    const out = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      out[i * 2] = a[i];
      out[i * 2 + 1] = b[i];
    }
    return out;
  };

  const xData = isEnvelopeResponse
    ? time_ms.flatMap(t => [t, t])
    : time_ms;

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
    const rawValues = ch.values;
    const minValues = ch.min;
    const maxValues = ch.max;
    const isEnvelope = isEnvelopeResponse && Array.isArray(minValues) && Array.isArray(maxValues);

    const values = rawValues || (isEnvelope ? maxValues : []) || [];

    let scaledValues;
    if (isEnvelope) {
      const scaledMin = (scale === 1)
        ? minValues
        : minValues.map(v => (v !== null && v !== undefined) ? v * scale : null);
      const scaledMax = (scale === 1)
        ? maxValues
        : maxValues.map(v => (v !== null && v !== undefined) ? v * scale : null);
      scaledValues = interleave(scaledMax, scaledMin);
    } else {
      if (scale === 1) {
        scaledValues = values;
      } else {
        scaledValues = values.map(v => (v !== null && v !== undefined) ? v * scale : null);
      }
    }

    return { 
      ...ch, 
      type, 
      color, 
      displayName: title,
      scaledValues,
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
      type: 'category',
      gridIndex: gridIdx,
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: theme.gridColor } },
      splitLine: { 
        show: true,
        lineStyle: { color: theme.gridColor, type: 'dashed' } 
      },
      axisLabel: {
        show: isLast,
        color: theme.textColor,
        fontSize: 10,
        formatter: (v) => `${Number(v).toFixed(0)}ms`,
        hideOverlap: true,
      },
      axisTick: { show: isLast, lineStyle: { color: theme.gridColor } },
      axisPointer: { show: true },
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
        data: ch.scaledValues,
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
        id: `analog-${idx}-${ch.name}`,
        type: 'line',
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        symbol: 'none',
        sampling: (!isEnvelopeResponse && samplingMode !== 'none') ? samplingMode : undefined,
        lineStyle: { width: 1.5, color: ch.color, type: ch.lineStyleType },
        data: ch.scaledValues,
        z: 3,
      });
    }
  });

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
        const t = Number(params[0]?.axisValue)?.toFixed(3);
        let html = `<div style="font-weight:700;margin-bottom:6px;color:#006064;border-bottom:1px solid #f1f5f9;padding-bottom:4px">${t} ms</div>`;
        params.forEach(p => {
          if (p.value !== null && p.value !== undefined) {
            let displayValue = p.value;
            if (p.seriesId && p.seriesId.startsWith('digital')) {
              displayValue = p.value;
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
  puMode = false,
  refLinesVersion, // Added to trigger re-render
  gridConfigVersion, // Added to trigger re-render
  rulerVersion,
  chart, // Pass the chart instance for coordinate conversion and event handling
}) {
  const gridConfig = gridConfigManager.getConfig();
  const rulerConfig = rulerManager.getConfig();
  if (!primaryData || layeringGroups.length === 0) {
    const { theme } = settings || { theme: { textColor: '#64748b' } };
    return {
      backgroundColor: 'transparent',
      animation: false,
      series: [],
      graphic: {
        id: 'layeringPlaceholder',
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: !primaryData ? 'Waiting for primary waveform page...' : 'No layer groups yet.',
          fill: theme?.textColor || '#64748b',
          fontSize: 12,
        },
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
  const graphic = [];

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
      containLabel: false,
      borderColor: theme.gridColor || '#f1f5f9',
      borderWidth: 1,
    });

    xAxes.push({
      type: 'value',
      gridIndex: groupIdx,
      show: true,
      axisLabel: { show: groupIdx === layeringGroups.length - 1, color: theme.textColor, fontSize: 10 },
      splitLine: { 
        show: gridConfig.x.major.show, 
        interval: gridConfig.x.major.interval,
        lineStyle: { 
          color: theme.gridColor || '#f1f5f9', 
          type: gridConfig.x.major.type, 
          opacity: gridConfig.x.major.opacity 
        } 
      },
      minorSplitLine: {
        show: gridConfig.x.minor.show,
        interval: gridConfig.x.minor.interval,
        lineStyle: {
          color: theme.gridColor || '#f1f5f9',
          type: gridConfig.x.minor.type,
          opacity: gridConfig.x.minor.opacity
        }
      },
      axisLine: { lineStyle: { color: theme.gridColor || '#f1f5f9' } },
      min: 'dataMin',
      max: 'dataMax'
    });

    // Add Interactive Ruler (Secondary X-Axis) 
    if (groupIdx === layeringGroups.length - 1 && rulerConfig.enabled) {
      const gridId = `grid-${groupIdx}`;
      
      // Secondary Axis
      xAxes.push({
        type: 'value',
        gridIndex: groupIdx,
        show: true,
        position: 'bottom',
        offset: 35,
        axisLine: { show: true, lineStyle: { color: rulerConfig.color, width: 2 } },
        axisTick: { show: true, lineStyle: { color: rulerConfig.color } },
        splitLine: { show: false },
        axisLabel: {
          color: rulerConfig.color,
          fontSize: 10,
          fontWeight: 'bold',
          formatter: (value) => {
            const adjusted = (value / 1000) - (rulerConfig.offsetMs / 1000);
            return `${adjusted.toFixed(2)}s`;
          }
        },
        min: 'dataMin',
        max: 'dataMax'
      });

      // Draggable Handle Graphic
      // We position it at the offset location
      const handleValue = rulerConfig.offsetMs;
      
      graphic.push({
        type: 'group',
        id: 'ruler-handle-group',
        draggable: 'horizontal', // Constraint to horizontal
        x: 0, // Initial global x, will be updated by chart.convertToPixel
        y: 0,
        z: 100,
        zlevel: 1, // Use a separate layer for better interaction
        __chart: chart,
        cursor: 'grab',
        onmousedown: (params) => {
          // Store start dragging state if needed
        },
        ondrag: function(params) {
          const chart = this.__chart; 
          if (!chart) return;

          // Use the group's current x position for conversion
          const dataCoord = chart.convertFromPixel({ gridIndex: groupIdx }, [this.x, 0]);
          
          if (dataCoord && dataCoord[0] !== undefined) {
            rulerManager.updateConfig({ offsetMs: dataCoord[0] });
          }
        },
        children: [
          // Vertical reference mark
          {
            type: 'line',
            shape: { x1: 0, y1: 0, x2: 0, y2: 40 },
            style: { stroke: rulerConfig.color, lineWidth: 3, lineDash: [4, 4], opacity: 0.6 }
          },
          // Draggable Diamond Handle
          {
            type: 'polygon',
            shape: {
              points: [[-8, 40], [0, 32], [8, 40], [0, 48]]
            },
            style: { fill: rulerConfig.color, stroke: '#fff', lineWidth: 2, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' }
          },
          // Label "0s"
          {
             type: 'text',
             style: {
               text: 'RULER 0s',
               fill: rulerConfig.color,
               fontSize: 10,
               fontWeight: 'bold',
               y: 55,
               x: -25,
               backgroundColor: 'rgba(255,255,255,0.8)',
               padding: [2, 4],
               borderRadius: 2
             }
          }
        ],
        // Position the group at the current offset value
        position: null, // Will be set via updated convertToPixel logic below
      });

      // Use transform/position logic to place the handle
      // ECharts allows setting 'position' [x, y] in graphic group
    }

    yAxes.push(
      { 
        type: 'value',
        gridIndex: groupIdx,
        position: 'left',
        splitLine: { 
          show: gridConfig.y.major.show, 
          interval: gridConfig.y.major.interval,
          lineStyle: { 
            color: theme.gridColor || '#f1f5f9', 
            type: gridConfig.y.major.type,
            opacity: gridConfig.y.major.opacity 
          } 
        },
        minorSplitLine: {
          show: gridConfig.y.minor.show,
          interval: gridConfig.y.minor.interval,
          lineStyle: {
            color: theme.gridColor || '#f1f5f9',
            type: gridConfig.y.minor.type,
            opacity: gridConfig.y.minor.opacity
          }
        },
        axisLabel: { color: theme.textColor, fontSize: 8, formatter: '{value}' },
        nameTextStyle: { color: theme.textColor, fontSize: 8 },
      },
      { 
        type: 'value',
        gridIndex: groupIdx,
        position: 'right',
        splitLine: { show: false },
        axisLabel: { color: theme.textColor, fontSize: 8, formatter: '{value}' },
        nameTextStyle: { color: theme.textColor, fontSize: 8 },
      }
    );

    group.channels.forEach(chCfg => {
      // Visibility check
      if (chCfg.visible === false) return;

      // Use robust comparison to handle number vs string IDs and potential whitespace/nulls
      const cleanId = (id) => id === null || id === undefined ? '' : String(id).trim();
      const isPrimary = !chCfg.disturbanceId || chCfg.disturbanceId === 'current' || cleanId(chCfg.disturbanceId) === cleanId(primaryDisturbanceId);
      const sourceData = isPrimary ? primaryData : crossFileData[chCfg.disturbanceId];
      
      if (!sourceData) {
        // sourceData might be null momentarily while fetching
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

      let puBase = 1;
      if (puMode) {
        const cfgBase = Number(chCfg.puBase);
        puBase = Number.isFinite(cfgBase) && cfgBase > 0 ? cfgBase : 1;
      }

      const n = Math.min(sourceTime.length, values.length);
      if (n === 0) return;

      series.push({
        name: `${group.name}: ${chCfg.name}`,
        type: 'line',
        xAxisIndex: groupIdx,
        yAxisIndex: chCfg.yAxis === 'right' ? (groupIdx * 2 + 1) : (groupIdx * 2),
        symbol: 'none',
        lineStyle: { width: 1.5, color: chCfg.color },
        data: Array.from({ length: n }, (_, i) => {
          const val = values[i];
          if (val === null || val === undefined) return null;
          const scaled = val * scale;
          
          let yVal = scaled;
          if (puMode) {
            let finalPuBase = puBase;
            if (finalPuBase === 1 || !finalPuBase) {
              // Auto-detect base if not set or set to 1
              const absValues = values.filter(v => v !== null && v !== undefined).map(Math.abs);
              const maxAbs = absValues.length > 0 ? Math.max(...absValues) : 0;
              finalPuBase = maxAbs > 0 ? maxAbs : 1;
            }
            yVal = scaled / finalPuBase;
          }
          return [sourceTime[i] + offset, yVal];
        }),
        z: 3
      });
    });
  });

  const option = {
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
    tooltip: { trigger: 'axis' },
    series,
    graphic,
  };

  if (series.length === 0) {
    graphic.push({
      id: 'layeringEmpty',
      type: 'text',
      left: 'center',
      top: 'middle',
      style: {
        text: 'No layered waveforms to display (channels not found on current page).',
        fill: theme?.textColor || '#64748b',
        fontSize: 12,
      },
    });
  }

  return option;
}

const WaveformViewer = ({ disturbanceId }) => {
  const [rawPage, setRawPage] = useState(1);
  const [rawWindowMs, setRawWindowMs] = useState(1000);
  const [rawLaneHeight, setRawLaneHeight] = useState(60);
  const [rawViewport, setRawViewport] = useState(null); // { startMs, endMs } when zoomed

  const [calcPage, setCalcPage] = useState(1);
  const [calcWindowMs, setCalcWindowMs] = useState(1000);
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

  // Cursor initialization flag
  const cursorInitializedRef = useRef(false);

  // Layering reference lines drawer
  const [showReferenceLinesPanel, setShowReferenceLinesPanel] = useState(false);
  const [refLinesVersion, setRefLinesVersion] = useState(0); // Trigger re-render
  const [gridConfigVersion, setGridConfigVersion] = useState(0); // Trigger re-render
  const [rulerVersion, setRulerVersion] = useState(0); // Trigger re-render
  const [referenceLineIntersections, setReferenceLineIntersections] = useState({});

  // Cursor drag handler - smooth update with RAF batching
  // Simple cursor update via state - chart updates via useEffect
  const handleCursorDrag = useCallback((id, timeMs) => {
    setCursors(prev => ({ ...prev, [id]: timeMs }));
  }, []);

  useEffect(() => {
    const unsubscribe = gridConfigManager.addListener(() => {
      setGridConfigVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = rulerManager.addListener(() => {
      setRulerVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);

  const [allDisturbances, setAllDisturbances] = useState([]);
  const [crossFileData, setCrossFileData] = useState({}); // { [id]: data }
  const [layeringGroups, setLayeringGroups] = useState([]);
  const [layeringPuMode, setLayeringPuMode] = useState(true); // Per-unit mode always on for layering
  const [showLayeringModal, setShowLayeringModal] = useState(false);
  const [activeLayeringGroupId, setActiveLayeringGroupId] = useState(null);
  const [layeringModalEditId, setLayeringModalEditId] = useState(null);
  const [layeringPage, setLayeringPage] = useState(1);
  const [layeringWindowMs, setLayeringWindowMs] = useState(1000);
  const [layeringLaneHeight, setLayeringLaneHeight] = useState(120); // Taller lanes for overlays

  const draggingRef = useRef(null); // 'A' or 'B' or null
  const isDraggingRef = useRef(null);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const calcChartRef = useRef(null);
  const calcChartInstance = useRef(null);
  const layeringChartRef = useRef(null);
  const layeringChartInstance = useRef(null);

  const { meta: channelMeta, loading: metaLoading, refetch: refetchMeta } = useChannelMeta(disturbanceId);
  const { meta: waveformMeta, loading: waveformMetaLoading } = useWaveformMetadata(disturbanceId);
  const { settings, updateSettings } = useSettings();

  const seededHiddenRef = useRef(null);

  // Reset hiddenChannels when disturbance changes
  useEffect(() => {
    if (!disturbanceId) return;
    seededHiddenRef.current = disturbanceId;
    // Don't set hiddenChannels here - let visibleSignals handle it
  }, [disturbanceId]);

  // Seed digital channels after channelMeta loads
  useEffect(() => {
    if (!channelMeta || !disturbanceId) return;
    if (seededHiddenRef.current !== disturbanceId) return;
    const digitalNames = (channelMeta.digital || []).map(ch => ch?.name).filter(Boolean);
    setHiddenChannels(new Set(digitalNames));
  }, [channelMeta, disturbanceId]);

  // Refs for stable event handlers
  const cursorsRef = useRef(cursors);
  useEffect(() => { cursorsRef.current = cursors; }, [cursors]);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const rawDataRef = useRef(null);
  const calcDataRef = useRef(null);
  const suppressDataZoomRef = useRef(false);
  const zoomDebounceRef = useRef(null);
  const lastViewportRequestRef = useRef(null);

  const visibleSignals = useMemo(() => {
    const out = [];
    const m = channelMeta;

    if (!m) return out;

    // Always request analog channels (unless user explicitly hides them).
    (m.analog || []).forEach(ch => {
      const name = ch?.name;
      if (!name) return;
      if (ch?.visible === false) return;
      if (hiddenChannels.has(name)) return;
      out.push(name);
    });

    // Digital channels: only include if NOT in hiddenChannels (default hidden)
    (m.digital || []).forEach(ch => {
      const name = ch?.name;
      if (!name) return;
      if (hiddenChannels.has(name)) return;
      out.push(name);
    });

    return out;
  }, [channelMeta, hiddenChannels, disturbanceId]);

  const rawStartEnd = useMemo(() => {
    const wm = waveformMeta;
    if (!wm || !Number.isFinite(wm.start_ms) || !Number.isFinite(wm.end_ms)) return null;
    const windowMs = Number(rawWindowMs) || 500;
    const totalMs = Math.max(1, wm.end_ms - wm.start_ms);
    const totalPages = Math.max(1, Math.ceil(totalMs / windowMs));
    const page = Math.max(1, Math.min(rawPage, totalPages));
    const start = wm.start_ms + ((page - 1) * windowMs);
    const end = Math.min(wm.end_ms, start + windowMs);
    return { startMs: start, endMs: end, totalPages };
  }, [waveformMeta, rawPage, rawWindowMs]);

  useEffect(() => {
    // Any explicit paging/window selection exits zoom-viewport mode.
    setRawViewport(null);
  }, [disturbanceId, rawPage, rawWindowMs]);

  const chartWidthPx = useMemo(() => {
    try {
      const w = chartRef.current?.clientWidth;
      return Number.isFinite(w) && w > 0 ? w : 1200;
    } catch {
      return 1200;
    }
  }, [isFullscreen, rawLaneHeight, view]);

  const rawResult = useWaveformWindow({
    disturbanceId,
    startMs: rawViewport?.startMs ?? rawStartEnd?.startMs,
    endMs: rawViewport?.endMs ?? rawStartEnd?.endMs,
    signals: visibleSignals,
    mode,
    // For envelope responses we interleave min/max, doubling the point count.
    // Pick ~0.6x width buckets so rendered points stay ~1.2x width.
    maxPoints: Math.max(300, Math.floor(chartWidthPx * 0.6)),
  });
  const layeringResult = useWaveformData(disturbanceId, layeringPage, layeringWindowMs, mode);
  const calcBaseResult = useWaveformData(disturbanceId, calcPage, calcWindowMs, mode);
  
  // Keep a live map of crossing times for each horizontal reference line (layering view only)
  useEffect(() => {
    if (view !== 'layering') {
      setReferenceLineIntersections({});
      return;
    }

    const data = layeringResult.data;
    if (!data || !Array.isArray(data.time_ms) || data.time_ms.length === 0) {
      setReferenceLineIntersections({});
      return;
    }

    const recompute = (linesArray) => {
      const next = {};
      (linesArray || []).forEach((line) => {
        if (!line || line.type !== 'horizontal' || !line.visible) return;
        try {
          const intersections = IntersectionCalculator.calculateHorizontalIntersections(data, line);
          if (intersections && intersections.length > 0) {
            next[line.id] = intersections;
          }
        } catch (err) {
          // Ignore per-line intersection errors; keep others
        }
      });
      setReferenceLineIntersections(next);
    };

    const unsubscribe = referenceLineManager.addListener(recompute);
    recompute(referenceLineManager.getAllLines());

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [view, layeringResult.data]);
  
  useEffect(() => {
    // Used by cursor hit-testing across views.
    rawDataRef.current = (view === 'layering' ? layeringResult.data : rawResult.data);
  }, [rawResult.data, layeringResult.data, view]);

  const getPhaseColor = useCallback((phase) => {
    const phaseColors = { R: '#ef4444', Y: '#f59e0b', B: '#3b82f6', N: '#10b981' };
    return phaseColors[phase] || '#64748b';
  }, []);

  // Merged configurations: Record-level (from backend) + App-level (local settings)
  const mergedConfigs = useMemo(() => {
    const recordConfigs = {};
    if (channelMeta) {
      [...(channelMeta.analog || []), ...(channelMeta.digital || [])].forEach(ch => {
        recordConfigs[ch.name] = {
          title: ch.title,
          color: ch.color,
          scale: ch.scale,
          visible: ch.visible
        };
      });
    }
    return { ...settings.channelConfigs, ...recordConfigs };
  }, [channelMeta, settings.channelConfigs]);

  // Derive display channels for the sidebar
  const allChannels = useMemo(() => {
    const data = rawResult.data;
    if (!data) return [];
    
    const digitalWithColor = (data.digital || [])
      .map(ch => {
        const config = mergedConfigs[ch.name] || {};
        if (hiddenChannels.has(ch.name)) return null;
        const valuesArr = ch.values || ch.max || [];
        return { 
          ...ch, 
          title: config.title || ch.name,
          color: config.color || settings.theme.digitalHighColor, 
          type: 'digital',
          values: config.scale ? valuesArr.map(v => v * config.scale) : valuesArr
        };
      })
      .filter(Boolean);

    const analogWithColor = (data.analog || [])
      .map(ch => {
        const config = mergedConfigs[ch.name] || {};
        if (hiddenChannels.has(ch.name)) return null;

        const valuesArr = ch.values || ch.max || [];
        
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
          values: config.scale ? valuesArr.map(v => v !== null ? v * config.scale : null) : valuesArr
        };
      })
      .filter(Boolean);

    return sortChannels([...analogWithColor, ...digitalWithColor]);
  }, [rawResult.data, getPhaseColor, settings.theme.digitalHighColor, mergedConfigs, hiddenChannels]);

  // Sync reference lines version to trigger re-render of chart effects
  useEffect(() => {
    const unsubscribe = referenceLineManager.addListener(() => {
      setRefLinesVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);
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

  // Initialize cursors to default positions when data loads
  useEffect(() => {
    if (cursorInitializedRef.current) return;
    const timeMs = rawResult.data?.time_ms || calculatedData?.time_ms;
    if (timeMs && timeMs.length > 0) {
      const t0 = timeMs[Math.floor(timeMs.length * 0.25)];
      const t1 = timeMs[Math.floor(timeMs.length * 0.75)];
      setCursors({ A: t0, B: t1, active: 'A' });
      cursorInitializedRef.current = true;
    }
  }, [rawResult.data?.time_ms, calculatedData?.time_ms]);

  useEffect(() => { calcDataRef.current = calculatedData; }, [calculatedData]);

  const handleUpdateLayering = (groups) => {
    setLayeringGroups(groups);
    if (!activeLayeringGroupId && groups.length > 0) {
      setActiveLayeringGroupId(groups[0].id);
    }
  };


  const rawSeriesCountRef = useRef(0);
  const calcSeriesCountRef = useRef(0);

  const rawHoverRafRef = useRef(null);
  const rawHoverLastIdxRef = useRef(-1);
  const calcHoverRafRef = useRef(null);
  const calcHoverLastIdxRef = useRef(-1);
  const layeringHoverRafRef = useRef(null);
  const layeringHoverLastTRef = useRef(null);

  const rawLiveRafRef = useRef(null);
  const rawLiveXRef = useRef(null);
  const calcLiveRafRef = useRef(null);
  const calcLiveXRef = useRef(null);
  const layeringLiveRafRef = useRef(null);
  const layeringLiveXRef = useRef(null);
  const layeringInitRafRef = useRef(null);

  useEffect(() => {
    try {
      if (!calculatedData || !calcChartRef.current || view !== 'advanced') return;
      if (!calcChartInstance.current || calcChartInstance.current.isDisposed?.()) {
        try { calcChartInstance.current?.dispose?.(); } catch {}
        calcChartInstance.current = echarts.init(calcChartRef.current, null, { renderer: 'canvas' });
      }
      const t0 = PERF_ENABLED ? perfNow() : 0;
      const option = buildChartOption({ 
        data: { ...calculatedData, digital: calculatedData.digital || [] }, 
        settings, 
        mergedConfigs, 
        samplingMode, 
        hiddenChannels,
        laneHeight: calcLaneHeight 
      });
      const t1 = PERF_ENABLED ? perfNow() : 0;
      calcChartInstance.current.setOption(option, { notMerge: true });
      const t2 = PERF_ENABLED ? perfNow() : 0;
      calcSeriesCountRef.current = option?.series?.length || 0;
      // Cursor graphics disabled for stability
      if (PERF_ENABLED) {
        console.debug('[perf] calc option build ms=', (t1 - t0).toFixed(2), 'setOption ms=', (t2 - t1).toFixed(2),
          'series=', calcSeriesCountRef.current, 'samples=', (calculatedData.time_ms || []).length);
      }

      // Note: reference lines and intersections are only rendered in the Channel Layering view

      // Cursor Click & Drag handlers (Stable Registration)
      const zr = calcChartInstance.current.getZr();

      const checkHit = (time, xPx, chart) => {
        if (time === null || time === undefined || !chart) return false;
        const tArr = calcDataRef.current?.time_ms || [];
        const idx = nearestIndexSorted(tArr, time);
        const targetX = chart.convertToPixel({ xAxisIndex: 0 }, tArr[idx]);
        return Number.isFinite(targetX) && Math.abs(xPx - targetX) < 40;  // Increased hit area
      };

      const handleZrMouseDown = (params) => {
        const xPx = params.offsetX;
        const c = cursorsRef.current;
        if (checkHit(c.A, xPx, calcChartInstance.current)) {
          draggingRef.current = 'A';
          isDraggingRef.current = true;
        } else if (checkHit(c.B, xPx, calcChartInstance.current)) {
          draggingRef.current = 'B';
          isDraggingRef.current = true;
        } else {
          draggingRef.current = null;
          isDraggingRef.current = false;
        }
      };

      const handleZrMouseMove = (params) => {
        if (draggingRef.current) {
          const tArr = calcDataRef.current?.time_ms || [];
          if (tArr.length === 0) return;
          const pointInData = calcChartInstance.current.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          if (!Number.isFinite(xNum)) return;
          const nearestIdx = nearestIndexSorted(tArr, xNum);
          const t = tArr[nearestIdx];
          if (cursorsRef.current[draggingRef.current] !== t) {
            setCursors(prev => ({ ...prev, [draggingRef.current]: t }));
          }
          return;
        }

        // Crosshair
        if (!calcChartInstance.current) return;
        calcLiveXRef.current = params.offsetX;
        if (calcLiveRafRef.current) return;
        calcLiveRafRef.current = requestAnimationFrame(() => {
          calcLiveRafRef.current = null;
          applyLiveCursorGraphic(calcChartInstance.current, calcLiveXRef.current, settingsRef.current.theme);
        });
      };

      const handleZrMouseUp = () => {
        if (draggingRef.current) {
          setTimeout(() => { isDraggingRef.current = false; }, 50);
          draggingRef.current = null;
        }
      };

      zr.off('mousedown');
      zr.on('mousedown', handleZrMouseDown);
      zr.off('mousemove');
      zr.on('mousemove', handleZrMouseMove);
      zr.off('mouseup');
      zr.on('mouseup', handleZrMouseUp);

      zr.off('click');
      zr.on('click', (params) => {
        if (isDraggingRef.current || !calcChartInstance.current) return;
        const tArr = calcDataRef.current?.time_ms || [];
        if (tArr.length > 0) {
          const pointInData = calcChartInstance.current.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          const nearestIdx = Number.isFinite(xNum) ? nearestIndexSorted(tArr, xNum) : 0;
          const t = tArr[nearestIdx];
          // Alternate between A and B on each click
          setCursors(prev => {
            const target = prev.active === 'A' ? 'B' : 'A';
            return { ...prev, [target]: t, active: target };
          });
        }
      });

      zr.off('mouseout');
      zr.on('mouseout', () => {
        clearLiveCursorGraphic(calcChartInstance.current);
      });

      // Hovered value tracking
      calcChartInstance.current.off('updateAxisPointer');
      calcChartInstance.current.on('updateAxisPointer', (evt) => {
        if (!evt.axesInfo || evt.axesInfo.length === 0) return;
        const xVal = evt.axesInfo[0]?.value;
        if (xVal === undefined) return;
        const tArr = calculatedData.time_ms || [];
        const xNum = Number(xVal);
        if (!Number.isFinite(xNum) || tArr.length === 0) return;
        const nearestIdx = nearestIndexSorted(tArr, xNum);
        if (nearestIdx === calcHoverLastIdxRef.current) return;
        calcHoverLastIdxRef.current = nearestIdx;
        if (calcHoverRafRef.current) cancelAnimationFrame(calcHoverRafRef.current);
        calcHoverRafRef.current = requestAnimationFrame(() => {
          const newVals = {};
          (calculatedData.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
          (calculatedData.digital || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
          if (rawResult.data) {
            (rawResult.data.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
            (rawResult.data.digital || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
          }
          setHoveredValues({ t: tArr[nearestIdx], channels: newVals });
        });
      });

      const ro = new ResizeObserver(() => calcChartInstance.current?.resize());
      ro.observe(calcChartRef.current);
      return () => {
        ro.disconnect();
        calcChartInstance.current?.off('updateAxisPointer');
        const _zr = calcChartInstance.current?.getZr();
        _zr?.off('mousedown');
        _zr?.off('mousemove');
        _zr?.off('mouseup');
        _zr?.off('click');
        _zr?.off('mouseout');
        if (calcHoverRafRef.current) cancelAnimationFrame(calcHoverRafRef.current);
        if (calcLiveRafRef.current) cancelAnimationFrame(calcLiveRafRef.current);
      };
    } catch (err) {
      console.error('[WaveformViewer] calc chart init error:', err);
    }
  }, [calculatedData, rawResult.data, settings, calcLaneHeight, view, mergedConfigs, hiddenChannels, samplingMode]);
  useEffect(() => {
    try {
      const data = rawResult.data;
      if (!data || !chartRef.current) return;
      if (!chartInstance.current || chartInstance.current.isDisposed?.()) {
        try { chartInstance.current?.dispose?.(); } catch {}
        chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
      }
      const t0 = PERF_ENABLED ? perfNow() : 0;
      const option = buildChartOption({ 
        data: { ...data, digital: data.digital || [] }, 
        settings, 
        mergedConfigs, 
        samplingMode, 
        hiddenChannels,
        laneHeight: rawLaneHeight,
        refLinesVersion, // Re-render chart with ref lines update
        gridConfigVersion, // Re-render chart with grid update
      });
      const t1 = PERF_ENABLED ? perfNow() : 0;
      suppressDataZoomRef.current = true;
      chartInstance.current.setOption(option, { notMerge: true });
      const t2 = PERF_ENABLED ? perfNow() : 0;
      rawSeriesCountRef.current = option?.series?.length || 0;
      // Cursor graphics disabled
      setTimeout(() => { suppressDataZoomRef.current = false; }, 0);
      if (PERF_ENABLED) {
        console.debug('[perf] raw option build ms=', (t1 - t0).toFixed(2), 'setOption ms=', (t2 - t1).toFixed(2),
          'series=', rawSeriesCountRef.current, 'samples=', (data.time_ms || []).length);
      }

      // Note: reference lines and intersections are only rendered in the Channel Layering view

      // Cursor Click & Drag handlers (Stable Registration)
      const zr = chartInstance.current.getZr();

      // Zoom/pan -> fetch higher resolution window (debounced)
      chartInstance.current.off('datazoom');
      chartInstance.current.on('datazoom', (evt) => {
        if (suppressDataZoomRef.current) return;
        const tArr = rawDataRef.current?.time_ms || [];
        if (!Array.isArray(tArr) || tArr.length < 2) return;

        const rep = rawDataRef.current?.representation || 'raw';
        const isEnv = rep === 'envelope';
        const xLen = isEnv ? (tArr.length * 2) : tArr.length;
        const dz = (evt?.batch && evt.batch[0]) ? evt.batch[0] : evt;
        const startPct = Number(dz?.start);
        const endPct = Number(dz?.end);
        if (!Number.isFinite(startPct) || !Number.isFinite(endPct) || xLen <= 1) return;

        const idx0x = Math.max(0, Math.min(xLen - 1, Math.floor((startPct / 100) * (xLen - 1))));
        const idx1x = Math.max(0, Math.min(xLen - 1, Math.ceil((endPct / 100) * (xLen - 1))));
        const b0 = isEnv ? Math.floor(idx0x / 2) : idx0x;
        const b1 = isEnv ? Math.floor(idx1x / 2) : idx1x;
        const i0 = Math.max(0, Math.min(tArr.length - 1, b0));
        const i1 = Math.max(0, Math.min(tArr.length - 1, b1));

        const startMs = Number(tArr[Math.min(i0, i1)]);
        const endMs = Number(tArr[Math.max(i0, i1)]);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

        if (zoomDebounceRef.current) window.clearTimeout(zoomDebounceRef.current);
        zoomDebounceRef.current = window.setTimeout(() => {
          setRawViewport({ startMs, endMs });
        }, 180);
      });

      const checkHit = (time, xPx, chartInst) => {
        if (time === null || time === undefined || !chartInst) return false;
        const tArr = rawDataRef.current?.time_ms || [];
        const idx = nearestIndexSorted(tArr, time);
        const targetX = chartInst.convertToPixel({ xAxisIndex: 0 }, tArr[idx]);
        return Number.isFinite(targetX) && Math.abs(xPx - targetX) < 40;  // Increased hit area
      };

      const handleZrMouseDown = (params) => {
        const xPx = params.offsetX;
        const c = cursorsRef.current;
        if (checkHit(c.A, xPx, chartInstance.current)) {
          draggingRef.current = 'A';
          isDraggingRef.current = true;
        } else if (checkHit(c.B, xPx, chartInstance.current)) {
          draggingRef.current = 'B';
          isDraggingRef.current = true;
        } else {
          draggingRef.current = null;
          isDraggingRef.current = false;
        }
      };

      const handleZrMouseMove = (params) => {
        if (draggingRef.current) {
          const tArr = rawDataRef.current?.time_ms || [];
          if (tArr.length === 0) return;
          const pointInData = chartInstance.current.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          if (!Number.isFinite(xNum)) return;
          const nearestIdx = nearestIndexSorted(tArr, xNum);
          const t = tArr[nearestIdx];
          if (cursorsRef.current[draggingRef.current] !== t) {
            setCursors(prev => ({ ...prev, [draggingRef.current]: t }));
          }
          return;
        }

        // Crosshair
        if (!chartInstance.current) return;
        rawLiveXRef.current = params.offsetX;
        if (rawLiveRafRef.current) return;
        rawLiveRafRef.current = requestAnimationFrame(() => {
          rawLiveRafRef.current = null;
          applyLiveCursorGraphic(chartInstance.current, rawLiveXRef.current, settingsRef.current.theme);
        });
      };

      const handleZrMouseUp = () => {
        if (draggingRef.current) {
          setTimeout(() => { isDraggingRef.current = false; }, 50);
          draggingRef.current = null;
        }
      };

      zr.off('mousedown');
      zr.on('mousedown', handleZrMouseDown);
      zr.off('mousemove');
      zr.on('mousemove', handleZrMouseMove);
      zr.off('mouseup');
      zr.on('mouseup', handleZrMouseUp);

      zr.off('click');
      zr.on('click', (params) => {
        if (isDraggingRef.current || !chartInstance.current) return;
        const tArr = rawDataRef.current?.time_ms || [];
        if (tArr.length > 0) {
          const pointInData = chartInstance.current.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          const nearestIdx = Number.isFinite(xNum) ? nearestIndexSorted(tArr, xNum) : 0;
          const t = tArr[nearestIdx];
          setCursors(prev => {
            const target = prev.active === 'A' ? 'B' : 'A';
            return { ...prev, [target]: t, active: target };
          });
        }
      });

      zr.off('mouseout');
      zr.on('mouseout', () => {
        clearLiveCursorGraphic(chartInstance.current);
      });

      chartInstance.current.off('updateAxisPointer');
      chartInstance.current.on('updateAxisPointer', (evt) => {
        if (!evt.axesInfo || evt.axesInfo.length === 0) return;
        const xVal = evt.axesInfo[0]?.value;
        if (xVal === undefined) return;
        const tArr = data.time_ms || [];
        const xNum = Number(xVal);
        if (!Number.isFinite(xNum) || tArr.length === 0) return;
        const nearestIdx = nearestIndexSorted(tArr, xNum);
        if (nearestIdx === rawHoverLastIdxRef.current) return;
        rawHoverLastIdxRef.current = nearestIdx;
        if (rawHoverRafRef.current) cancelAnimationFrame(rawHoverRafRef.current);
        rawHoverRafRef.current = requestAnimationFrame(() => {
          const newVals = {};
          (data.analog || []).forEach(ch => {
            const arr = ch.values || ch.max || [];
            newVals[ch.name] = arr[nearestIdx];
          });
          (data.digital || []).forEach(ch => {
            const arr = ch.values || ch.max || [];
            newVals[ch.name] = arr[nearestIdx];
          });
          if (calculatedData) {
            (calculatedData.analog || []).forEach(ch => { newVals[ch.name] = ch.values[nearestIdx]; });
          }
          setHoveredValues({ t: tArr[nearestIdx], channels: newVals });
        });
      });

      const ro = new ResizeObserver(() => {
        if (chartInstance.current) {
          chartInstance.current.resize();
        }
      });
      ro.observe(chartRef.current);
      return () => {
        ro.disconnect();
        if (zoomDebounceRef.current) window.clearTimeout(zoomDebounceRef.current);
        chartInstance.current?.off('updateAxisPointer');
        chartInstance.current?.off('datazoom');
        const _zr = chartInstance.current?.getZr();
        _zr?.off('mousedown');
        _zr?.off('mousemove');
        _zr?.off('mouseup');
        _zr?.off('click');
        _zr?.off('mouseout');
        if (rawHoverRafRef.current) cancelAnimationFrame(rawHoverRafRef.current);
        if (rawLiveRafRef.current) cancelAnimationFrame(rawLiveRafRef.current);
      };
    } catch (err) {
      console.error('[WaveformViewer] raw chart init error:', err);
    }
  }, [rawResult.data, calculatedData, settings, rawLaneHeight, view, mergedConfigs, hiddenChannels, samplingMode, refLinesVersion, gridConfigVersion]);

  useEffect(() => {
    try {
       if (!layeringChartRef.current || view !== 'layering' || layeringGroups.length === 0) return;
       if (!layeringResult.data) return;
       
       if (!layeringChartInstance.current) {
         layeringChartInstance.current = echarts.init(layeringChartRef.current, null, { renderer: 'canvas' });
       } else if (layeringChartInstance.current.isDisposed()) {
         layeringChartInstance.current = echarts.init(layeringChartRef.current, null, { renderer: 'canvas' });
       }
       const chart = layeringChartInstance.current;
       if (!chart) return;

       // Check if container has size
       if (!layeringChartRef.current.clientWidth || !layeringChartRef.current.clientHeight) {
         // Container not ready, defer initialization
         const checkSize = () => {
           if (layeringChartRef.current?.clientWidth && layeringChartRef.current?.clientHeight) {
             initLayeringContent();
           }
         };
         const timeoutId = setTimeout(checkSize, 100);
         return () => clearTimeout(timeoutId);
       }
       
       initLayeringContent();
       
       function initLayeringContent() {
         if (!layeringChartRef.current || !chart) return;
         
        // Defer init one frame so the container has size
        layeringInitRafRef.current = window.requestAnimationFrame(() => {
          const option = buildLayeringOption({
            primaryData: { ...layeringResult.data, digital: layeringResult.data?.digital || [] },
            settings,
            layeringGroups,
            crossFileData,
            primaryDisturbanceId: disturbanceId,
            laneHeight: layeringLaneHeight,
            puMode: layeringPuMode,
             refLinesVersion,
             gridConfigVersion,
             rulerVersion,
             chart,
           });

          chart.setOption(option, { notMerge: true });

          // Update handle position after first render to ensure grid is available
          const rulerConfig = rulerManager.getConfig();
          if (rulerConfig.enabled) {
            const lastGridIdx = layeringGroups.length - 1;
            const pixelPos = chart.convertToPixel({ gridIndex: lastGridIdx }, [rulerConfig.offsetMs, 0]);
            if (pixelPos) {
              chart.setOption({
                graphic: [{
                  id: 'ruler-handle-group',
                  x: pixelPos[0],
                  y: pixelPos[1] - 10,
                  __chart: chart // Ensure it's passed for drag support
                }]
              });
            }
          }

          chart.resize();
        });

        // Cursor Click & Drag handlers (Stable Registration)
      const zr = chart.getZr();

      const checkHit = (time, xPx, chartInst) => {
        if (time === null || time === undefined || !chartInst) return false;
        const tArr = rawDataRef.current?.time_ms || [];
        const idx = nearestIndexSorted(tArr, time);
        const targetX = chartInst.convertToPixel({ xAxisIndex: 0 }, tArr[idx]);
        return Number.isFinite(targetX) && Math.abs(xPx - targetX) < 40;  // Increased hit area
      };

      const handleZrMouseDown = (params) => {
        const xPx = params.offsetX;
        const c = cursorsRef.current;
        if (checkHit(c.A, xPx, chart)) {
          draggingRef.current = 'A';
          isDraggingRef.current = true;
        } else if (checkHit(c.B, xPx, chart)) {
          draggingRef.current = 'B';
          isDraggingRef.current = true;
        } else {
          draggingRef.current = null;
          isDraggingRef.current = false;
        }
      };

      const handleZrMouseMove = (params) => {
        if (draggingRef.current) {
          const tArr = rawDataRef.current?.time_ms || [];
          if (tArr.length === 0) return;
          const pointInData = chart.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          if (!Number.isFinite(xNum)) return;
          const nearestIdx = nearestIndexSorted(tArr, xNum);
          const t = tArr[nearestIdx];
          if (cursorsRef.current[draggingRef.current] !== t) {
            setCursors(prev => ({ ...prev, [draggingRef.current]: t }));
          }
          return;
        }

        // Crosshair
        if (!chart) return;
        layeringLiveXRef.current = params.offsetX;
        if (layeringLiveRafRef.current) return;
        layeringLiveRafRef.current = requestAnimationFrame(() => {
          layeringLiveRafRef.current = null;
          applyLiveCursorGraphic(chart, layeringLiveXRef.current, settingsRef.current.theme);
        });
      };

      const handleZrMouseUp = () => {
        if (draggingRef.current) {
          setTimeout(() => { isDraggingRef.current = false; }, 50);
          draggingRef.current = null;
        }
      };

      zr.off('mousedown');
      zr.on('mousedown', handleZrMouseDown);
      zr.off('mousemove');
      zr.on('mousemove', handleZrMouseMove);
      zr.off('mouseup');
      zr.on('mouseup', handleZrMouseUp);

      zr.off('click');
      zr.on('click', (params) => {
        if (isDraggingRef.current || !chart) return;
        const tArr = rawDataRef.current?.time_ms || [];
        if (tArr.length > 0) {
          const pointInData = chart.convertFromPixel(
            { xAxisIndex: 0, yAxisIndex: 0 },
            [params.offsetX, params.offsetY]
          );
          const xNum = Number(pointInData?.[0]);
          const nearestIdx = Number.isFinite(xNum) ? nearestIndexSorted(tArr, xNum) : 0;
          const t = tArr[nearestIdx];
          setCursors(prev => {
            const target = prev.active === 'A' ? 'B' : 'A';
            return { ...prev, [target]: t, active: target };
          });
        }
      });

       zr.off('mouseout');
       zr.on('mouseout', () => {
         clearLiveCursorGraphic(chart);
       });

        // Render reference lines on layering chart using ECharts coordinate system with interaction
        if (layeringResult.data && layeringResult.data.time_ms && layeringResult.data.time_ms.length > 0) {
          if (chart && !chart.isDisposed()) {
            ReferenceLineRenderer.render(
              chart, 
              referenceLineManager.getAllLines(),
              {
                onLineDragStart: (line) => {
                  // Store original value for potential cancel
                  line._originalValue = line.value;
                  line._dragging = true;
                },
                onLineDrag: (lineId, newValue) => {
                  // Update the line value in real-time during drag
                  referenceLineManager.updateLine(lineId, { value: newValue });
                },
                onLineDragEnd: (lineId, finalValue) => {
                  // Clean up dragging state
                  const line = referenceLineManager.getLine(lineId);
                  if (line) {
                    delete line._originalValue;
                    delete line._dragging;
                  }
                }
              }
            );
            
             // Calculate and render intersection points for horizontal lines on layering chart
             const horizontalLines = referenceLineManager.getHorizontalLines();
             horizontalLines.forEach(line => {
               if (line.visible) {
                 const intersections = IntersectionCalculator.calculateHorizontalIntersections(layeringResult.data, line);
                 IntersectionDisplay.renderIntersections(chart, intersections, line);
               }
             });
           }
         }
       }

      chart.off('updateAxisPointer');
      chart.on('updateAxisPointer', (evt) => {
        if (!evt.axesInfo || evt.axesInfo.length === 0) return;
        const xVal = evt.axesInfo[0]?.value;
        if (xVal === undefined) return;
        const xNum = Number(xVal);
        if (!Number.isFinite(xNum)) return;
        if (layeringHoverLastTRef.current === xNum) return;
        layeringHoverLastTRef.current = xNum;
        if (layeringHoverRafRef.current) cancelAnimationFrame(layeringHoverRafRef.current);
        layeringHoverRafRef.current = requestAnimationFrame(() => {
          const newVals = {};
          const tArrPrimary = rawResult.data?.time_ms || [];
          if (tArrPrimary.length === 0) return;
          const primaryNearest = nearestIndexSorted(tArrPrimary, xNum);
          (rawResult.data?.analog || []).forEach(ch => { 
            if (ch.values && ch.values.length > primaryNearest) {
              newVals[ch.name] = ch.values[primaryNearest]; 
            }
          });

          Object.keys(crossFileData || {}).forEach(extId => {
            const ext = crossFileData[extId];
            const tArrExt = ext?.time_ms || [];
            if (tArrExt.length === 0) return;
            const extNearest = nearestIndexSorted(tArrExt, xNum);
            (ext?.analog || []).forEach(ch => { 
              if (ch.values && ch.values.length > extNearest) {
                newVals[`${ch.name}_${extId}`] = ch.values[extNearest]; 
              }
            });
          });

          setHoveredValues({ t: xNum, channels: newVals });
        });
      });

      const ro = new ResizeObserver(() => chart?.resize());
      ro.observe(layeringChartRef.current);
      return () => {
        ro.disconnect();
        chart?.off('updateAxisPointer');
        const _zr = chart?.getZr();
        _zr?.off('mousedown');
        _zr?.off('mousemove');
        _zr?.off('mouseup');
        _zr?.off('click');
        _zr?.off('mouseout');
        window.cancelAnimationFrame(layeringInitRafRef.current);
        if (layeringHoverRafRef.current) cancelAnimationFrame(layeringHoverRafRef.current);
        if (layeringLiveRafRef.current) cancelAnimationFrame(layeringLiveRafRef.current);
      };
    } catch (err) {
      console.error('[WaveformViewer] layering chart init error:', err);
    }
  }, [
    rawResult.data,
    layeringResult.data,
    layeringGroups,
    settings,
    layeringLaneHeight,
    layeringPuMode,
    view,
    crossFileData,
    disturbanceId,
    refLinesVersion,
    gridConfigVersion,
    rulerVersion,
  ]);

  // Cursor overlay updates - disabled for stability

  const handleExternalZoom = useCallback((params) => {
    let activeChart = null;
    if (view === 'raw') {
      activeChart = chartInstance.current;
    } else if (view === 'advanced') {
      activeChart = calcChartInstance.current;
    } else if (view === 'layering') {
      activeChart = layeringChartInstance.current;
    }
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
    // Reset cursor initialization flag when disturbance changes
    cursorInitializedRef.current = false;
    setCursors({ A: null, B: null, active: 'A' });
    setHoveredValues({});
    
    // Auto-prompt mapping if no config exists for this record
    if (disturbanceId && channelMeta && !channelMeta.has_config) {
      setShowMappingModal(true);
    }
  }, [disturbanceId, channelMeta]);

  useEffect(() => {
    fetch('/api/v1/disturbances/all/')
      .then(r => r.json())
      .then(setAllDisturbances)
      .catch(console.error);
  }, [disturbanceId]); // Refetch list when any new record is loaded/selected

  // Sync crossFileData for any external records in layeringGroups
  useEffect(() => {
    // Optimization: find which IDs are missing or need fetching
    const externalIds = new Set();
    layeringGroups.forEach(g => {
      g.channels.forEach(ch => {
        const cid = String(ch.disturbanceId || '');
        if (cid && cid !== 'current' && cid !== 'null' && cid !== String(disturbanceId)) {
          externalIds.add(cid);
        }
      });
    });

    externalIds.forEach(extId => {
      // Fetch if not in cache. The cache is cleared via separate effect on page/window change.
      if (!crossFileData[extId]) {
        fetch(`/api/v1/disturbances/${extId}/waveform/?page=${layeringPage}&window_ms=${layeringWindowMs}&mode=${mode}`)
          .then(r => r.json())
          .then(res => {
            setCrossFileData(prev => ({ ...prev, [extId]: res }));
          })
          .catch(err => {
            console.error(`[layering] Fallback fetch failed for ${extId}:`, err);
          });
      }
    });
   }, [layeringGroups, layeringResult.data, layeringLaneHeight, settings, crossFileData, disturbanceId, view]);

  // Handle pagination/window changes: Invalidate the crossFileData cache
  useEffect(() => {
    setCrossFileData({});
  }, [layeringPage, layeringWindowMs, mode, disturbanceId]);

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
      const nearestIdx = nearestIndexSorted(tArr, t);
      src.analog.forEach(ch => {
        const arr = ch.values || ch.max || [];
        vals[ch.name] = arr[nearestIdx];
      });
      src.digital.forEach(ch => {
        const arr = ch.values || ch.max || [];
        vals[ch.name] = arr[nearestIdx];
      });
    });
    return vals;
  }, [rawResult.data, calculatedData]);

  const cursorAValues = useMemo(() => getValuesAt(cursors.A), [cursors.A, getValuesAt]);
  const cursorBValues = useMemo(() => getValuesAt(cursors.B), [cursors.B, getValuesAt]);

  const delta = useMemo(() => {
    const dt = (cursors.A !== null && cursors.B !== null) ? Math.abs(cursors.B - cursors.A).toFixed(3) : null;
    return { A: cursors.A !== null ? cursors.A.toFixed(2) : '--', B: cursors.B !== null ? cursors.B.toFixed(2) : '--', dt };
  }, [cursors]);

  const stickyXAxisTicks = null; // Unused - using ECharts axis instead

  const formatMsTick = useCallback((v) => {
    if (!Number.isFinite(v)) return '--';
    const abs = Math.abs(v);
    if (abs >= 10000) return `${(v / 1000).toFixed(1)}s`;
    if (abs >= 1000) return `${(v / 1000).toFixed(2)}s`;
    return `${v.toFixed(0)}ms`;
  }, []);

  const totalPagesFromMeta = useCallback((windowMs) => {
    const wm = waveformMeta;
    const w = Number(windowMs) || 500;
    if (!wm || !Number.isFinite(wm.start_ms) || !Number.isFinite(wm.end_ms) || w <= 0) return 1;
    const totalMs = Math.max(1, wm.end_ms - wm.start_ms);
    return Math.max(1, Math.ceil(totalMs / w));
  }, [waveformMeta]);

  const rawTotalPages = useMemo(() => totalPagesFromMeta(rawWindowMs), [totalPagesFromMeta, rawWindowMs]);
  const layeringTotalPages = useMemo(() => totalPagesFromMeta(layeringWindowMs), [totalPagesFromMeta, layeringWindowMs]);

  useEffect(() => {
    if (rawPage > rawTotalPages) setRawPage(rawTotalPages);
  }, [rawPage, rawTotalPages]);

  useEffect(() => {
    if (layeringPage > layeringTotalPages) setLayeringPage(layeringTotalPages);
  }, [layeringPage, layeringTotalPages]);

  if (!disturbanceId) {
    return (
      <div className={styles.emptyState}>
        <RiPulseLine className={styles.emptyIcon} />
        <p className={styles.emptyText}>Select a disturbance to analyze waveform</p>
      </div>
    );
  }

  const currentLaneHeight = view === 'raw' ? rawLaneHeight : (view === 'layering' ? layeringLaneHeight : calcLaneHeight);
  const setLaneHeight = view === 'raw' ? setRawLaneHeight : (view === 'layering' ? setLayeringLaneHeight : setCalcLaneHeight);
  const currentData = view === 'raw' ? rawResult.data : (view === 'layering' ? layeringResult.data : calcBaseResult.data);
  const currentPage = view === 'raw' ? rawPage : (view === 'layering' ? layeringPage : calcPage);
  const setPage = view === 'raw' ? setRawPage : (view === 'layering' ? setLayeringPage : setCalcPage);
  const currentWindowMs = view === 'raw' ? rawWindowMs : (view === 'layering' ? layeringWindowMs : calcWindowMs);
  const setWindowMs = view === 'raw' ? setRawWindowMs : (view === 'layering' ? setLayeringWindowMs : setCalcWindowMs);
  const currentTotalPages = view === 'raw'
    ? rawTotalPages
    : (view === 'layering' ? layeringTotalPages : (currentData?.total_pages || 1));
  const currentLoading = view === 'raw'
    ? (rawResult.loading || waveformMetaLoading)
    : (view === 'layering' ? layeringResult.loading : calcBaseResult.loading);
  const currentError = view === 'raw'
    ? rawResult.error
    : (view === 'layering' ? layeringResult.error : calcBaseResult.error);

  return (
    <div className={`${styles.viewerContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      <WaveformToolbar
        mode={mode} onModeChange={setMode} laneHeight={currentLaneHeight} onLaneHeightChange={setLaneHeight}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMapping={() => setShowMappingModal(true)}
        onOpenVisibility={() => setShowVisibilityPanel(true)}
        onOpenReferenceLines={() => {
          if (view === 'layering') setShowReferenceLinesPanel(true);
        }}
        canOpenReferenceLines={view === 'layering'}
        isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)}
        samplingMode={samplingMode} onSamplingModeChange={setSamplingMode}
      />

      <div className={styles.viewTabs}>
        <button className={`${styles.viewTab} ${view === 'raw' ? styles.activeViewTab : ''}`} onClick={() => setView('raw')}>Raw Waveform</button>
        <button className={`${styles.viewTab} ${view === 'advanced' ? styles.activeViewTab : ''}`} onClick={() => setView('advanced')}>Calculated Channels</button>
        <button className={`${styles.viewTab} ${view === 'layering' ? styles.activeViewTab : ''}`} onClick={() => setView('layering')}>Channel Layering</button>
      </div>

       <div className={styles.viewContent} style={{ display: view === 'raw' ? 'flex' : 'none' }}>
 
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
             />
           </div>
            <div className={styles.chartContainer}>
              <div className={styles.zoomSection}>
                {rawResult.data && (
                  <div className={styles.zoomContainer}>
                    <ZoomSlider data={rawResult.data} settings={settings} onZoom={handleExternalZoom} height={20} />
                  </div>
                )}
              </div>
              <div className={styles.chartWrapper} style={{ height: `${allChannels.length * rawLaneHeight + 20}px` }}>
                {rawResult.loading && <div className={styles.loadingOverlay}><RiLoader4Line className={styles.spinner} /><span>Loading waveform data...</span></div>}
                {rawResult.error && <div className={styles.errorOverlay}><p>⚠ {rawResult.error}</p></div>}
                <div ref={chartRef} className={styles.chart} style={{ height: "100%" }} />
              </div>
              <div className={styles.chartOverlay} />
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
            <div className={styles.chartContainer}>
              <div className={styles.zoomSection}>
                {calcBaseResult.data && (
                  <div className={styles.zoomContainer}>
                    <ZoomSlider data={calcBaseResult.data} settings={settings} onZoom={handleExternalZoom} height={20} />
                  </div>
                )}
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
              <div className={styles.chartOverlay} />
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
            onOpenModal={(id) => { setLayeringModalEditId(id); setShowLayeringModal(true); }}
            samplingInterval={layeringResult.data?.time_ms?.length > 1 ? (layeringResult.data.time_ms[1] - layeringResult.data.time_ms[0]) : 1}
            puMode={layeringPuMode}
            onTogglePu={(val) => setLayeringPuMode(val)}
            onOpenReferenceLines={() => setShowReferenceLinesPanel(true)}
            rulerEnabled={rulerManager.getConfig().enabled}
            onToggleRuler={() => rulerManager.updateConfig({ enabled: !rulerManager.getConfig().enabled })}
          />

          <div className={styles.chartContainer}>
            <div className={styles.zoomSection}>
              {layeringResult.data && (
                <div className={styles.zoomContainer}>
                  <ZoomSlider data={layeringResult.data} settings={settings} onZoom={handleExternalZoom} height={20} />
                </div>
              )}
            </div>
            {layeringGroups.length > 0 ? (
              <div className={styles.chartWrapper} style={{ height: `${layeringGroups.length * (layeringLaneHeight + 30) + 40}px` }}>
                {layeringResult.loading && <div className={styles.loadingOverlay}><RiLoader4Line className={styles.spinner} /><span>Updating overlays...</span></div>}
                <div ref={layeringChartRef} className={styles.chart} style={{ height: '100%' }} />
              </div>
            ) : (
              <div className={styles.advancedPlaceholder}>
                <div className={styles.placeholderContent}>
                  <RiStackLine className={styles.placeholderIcon} />
                  <h3>Streamlined Layering</h3>
                  <p>Add channels to an overlay group directly from the sidebar, or create one here.</p>
                </div>
              </div>
            )}
            <div className={styles.chartOverlay} />
          </div>
        </div>
      </div>

      {/* Shared Bottom Bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomRowTop}>
          <div className={styles.deltaReadout}>
            <span className={`${styles.deltaLabel} ${styles.cursorA}`}>A:</span>
            <span className={styles.deltaA}>{delta.A} ms</span>
            <span className={`${styles.deltaLabel} ${styles.cursorB}`}>B:</span>
            <span className={styles.deltaB}>{delta.B} ms</span>
            {delta.dt && <><span className={styles.deltaSep}>|</span><span className={styles.deltaDt}>Δt = {delta.dt} ms</span></>}
          </div>
          <button className={styles.clearCursors} onClick={() => { cursorInitializedRef.current = false; setCursors({ A: null, B: null, active: 'A' }); }} disabled={cursors.A === null && cursors.B === null} style={{ opacity: (cursors.A !== null || cursors.B !== null) ? 1 : 0.5, marginLeft: 'auto' }}>X Clear</button>
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
            <PaginationBar page={currentPage} totalPages={currentTotalPages} windowMs={currentWindowMs} onPageChange={setPage} onWindowChange={(ms) => { setWindowMs(ms); setPage(1); }} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showVisibilityPanel && (
          <ChannelVisibilityDrawer 
            channels={(() => {
                const base = [];
                const fetchedAnalog = new Map((rawResult.data?.analog || []).map(ch => [ch.name, ch]));
                const fetchedDigital = new Map((rawResult.data?.digital || []).map(ch => [ch.name, ch]));

                (channelMeta?.analog || []).forEach(ch => {
                  const name = ch?.name;
                  if (!name) return;
                  const f = fetchedAnalog.get(name) || {};
                  base.push({
                    ...f,
                    name,
                    type: 'analog',
                    phase: f.phase,
                    unit: f.unit,
                  });
                });

                (channelMeta?.digital || []).forEach(ch => {
                  const name = ch?.name;
                  if (!name) return;
                  const f = fetchedDigital.get(name) || {};
                  base.push({
                    ...f,
                    name,
                    type: 'digital',
                  });
                });

                return base.map(ch => ({
                  ...ch,
                  title: mergedConfigs[ch.name]?.title || ch.name,
                  color: ch.color || (ch.type === 'digital' ? settings.theme.digitalHighColor : getPhaseColor(ch.phase)),
                }));
              })()} 
            hiddenChannels={hiddenChannels} 
            onToggle={setHiddenChannels} 
            onClose={() => setShowVisibilityPanel(false)} 
          />
        )}
        {showReferenceLinesPanel && (
          <ReferenceLineDrawer 
            onClose={() => setShowReferenceLinesPanel(false)}
            sessionKey={disturbanceId ? `layering_ref_lines_${disturbanceId}` : 'layering_ref_lines'}
            lineIntersections={referenceLineIntersections}
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
