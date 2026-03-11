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
} from 'react-icons/ri';
import { useWaveformData, useChannelMeta } from '../../hooks/useWaveformData';
import { useSettings } from '../../hooks/useSettings';
import ChannelSidebar from './waveform/ChannelSidebar';
import WaveformToolbar from './waveform/WaveformToolbar';
import PaginationBar from './waveform/PaginationBar';
import SettingsModal from './settings/SettingsModal';
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

// ─── Build ECharts option from waveform data ──────────────────────────────

function buildChartOption({ data, settings, cursors, hoveredTime }) {
  const { theme, phaseColors } = settings;
  const { analog, digital, time_ms } = data;

  const { voltage, current, other } = classifyChannels(analog);
  const hasDigital = digital && digital.length > 0;

  // Calculate grid layout
  // We'll have: [digital grid?] + [voltage grid] + [current grid] + [other grid?]
  const panels = [];
  if (hasDigital) panels.push({ type: 'digital', channels: digital });
  if (voltage.length > 0) panels.push({ type: 'voltage', channels: voltage });
  if (current.length > 0) panels.push({ type: 'current', channels: current });
  if (other.length > 0) panels.push({ type: 'other', channels: other });

  const totalPanels = panels.length || 1;
  const topOffset = 10;
  const bottomOffset = 10;
  const gapBetween = 8;
  const availableHeight = 100 - topOffset - bottomOffset - gapBetween * (totalPanels - 1);

  // Digital panels are compact (10%), analog panels share the rest equally
  const digitalCount = panels.filter(p => p.type === 'digital').length;
  const analogPanelCount = totalPanels - digitalCount;
  const digitalHeightPct = digitalCount > 0 ? 12 : 0;
  const analogHeightPct = analogPanelCount > 0
    ? (availableHeight - digitalHeightPct * digitalCount) / analogPanelCount
    : 0;

  const grids = [];
  const xAxes = [];
  const yAxes = [];
  const series = [];

  let currentTop = topOffset;

  panels.forEach((panel, panelIdx) => {
    const heightPct = panel.type === 'digital' ? digitalHeightPct : analogHeightPct;
    const gridIdx = panelIdx;

    grids.push({
      top: `${currentTop}%`,
      bottom: `${100 - currentTop - heightPct}%`,
      left: '0%',
      right: '2%',
      containLabel: false,
    });

    // Shared x-axis (only show labels on last panel)
    const isLastPanel = panelIdx === totalPanels - 1;
    xAxes.push({
      type: 'value',
      gridIndex: gridIdx,
      min: 'dataMin',
      max: 'dataMax',
      axisLine: { lineStyle: { color: theme.gridColor } },
      splitLine: { lineStyle: { color: theme.gridColor, type: 'dashed' } },
      axisLabel: {
        show: isLastPanel,
        color: theme.textColor,
        fontSize: 10,
        formatter: (v) => `${v.toFixed(0)}ms`,
      },
      axisTick: { show: isLastPanel, lineStyle: { color: theme.gridColor } },
    });

    // Y-axis
    if (panel.type === 'digital') {
      yAxes.push({
        type: 'value',
        gridIndex: gridIdx,
        min: -0.1,
        max: panel.channels.length,
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: theme.gridColor } },
        axisTick: { show: false },
      });
    } else {
      yAxes.push({
        type: 'value',
        gridIndex: gridIdx,
        axisLabel: {
          color: theme.textColor,
          fontSize: 9,
          formatter: (v) => {
            if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
            return v.toFixed(1);
          },
        },
        splitLine: { lineStyle: { color: theme.gridColor, type: 'dashed' } },
        axisLine: { lineStyle: { color: theme.gridColor } },
        axisTick: { lineStyle: { color: theme.gridColor } },
      });
    }

    // Series
    if (panel.type === 'digital') {
      panel.channels.forEach((ch, chIdx) => {
        // Stack digital channels by offset so each gets its own row
        const offset = panel.channels.length - 1 - chIdx;
        const scaledValues = time_ms.map((t, i) => [t, (ch.values[i] || 0) + offset]);
        series.push({
          name: ch.name,
          type: 'line',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx,
          step: 'end',
          symbol: 'none',
          sampling: 'none',
          lineStyle: { width: 1.5, color: theme.digitalHighColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(57, 255, 20, 0.3)' },
              { offset: 1, color: 'rgba(57, 255, 20, 0.0)' },
            ]),
          },
          data: scaledValues,
          z: 3,
        });
      });
    } else {
      panel.channels.forEach((ch) => {
        const color = phaseColors[ch.phase] || phaseColors.default;
        series.push({
          name: ch.name,
          type: 'line',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx,
          symbol: 'none',
          sampling: 'lttb',
          lineStyle: { width: 1.5, color },
          data: time_ms.map((t, i) => [t, ch.values[i] ?? null]),
          z: 3,
        });
      });
    }

    currentTop += heightPct + gapBetween;
  });

  // Cursor mark lines
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

  // Add mark lines to first series of each grid (or a dummy series)
  if (cursorMarkLines.length > 0 && series.length > 0) {
    // Add to all first-series-per-panel
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
      {
        type: 'slider',
        xAxisIndex: xAxes.map((_, i) => i),
        bottom: 2,
        height: 20,
        borderColor: theme.gridColor,
        fillerColor: 'rgba(0,150,255,0.08)',
        handleStyle: { color: '#4488ff' },
        textStyle: { color: theme.textColor, fontSize: 9 },
        labelFormatter: (v) => `${Number(v).toFixed(1)}ms`,
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#ffffff33', type: 'dashed' },
      },
      backgroundColor: 'rgba(13,17,23,0.92)',
      borderColor: '#30363d',
      textStyle: { color: '#c9d1d9', fontSize: 10 },
      formatter: (params) => {
        if (!params || params.length === 0) return '';
        const t = params[0]?.axisValue?.toFixed(3);
        let html = `<div style="font-weight:bold;margin-bottom:4px;color:#8b949e">${t} ms</div>`;
        params.forEach(p => {
          if (p.value && p.value[1] !== null) {
            html += `<div style="display:flex;align-items:center;gap:6px;margin:1px 0">
              <span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>
              <span style="color:#8b949e;min-width:80px">${p.seriesName}</span>
              <span style="color:#fff;font-weight:500">${typeof p.value[1] === 'number' ? p.value[1].toFixed(4) : p.value[1]}</span>
            </div>`;
          }
        });
        return html;
      },
    },
    series,
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

const WaveformViewer = ({ disturbanceId }) => {
  const [page, setPage] = useState(1);
  const [windowMs, setWindowMs] = useState(500);
  const [mode, setMode] = useState('instantaneous'); // 'instantaneous' | 'rms'
  const [cursors, setCursors] = useState({ A: null, B: null, active: 'A' });
  const [hoveredValues, setHoveredValues] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const { data, loading, error } = useWaveformData(disturbanceId, page, windowMs, mode);
  const { meta } = useChannelMeta(disturbanceId);
  const { settings, updateSettings, getPhaseColor } = useSettings();

  // Derive display channels from data for the sidebar
  const allChannels = useMemo(() => {
    if (!data) return [];
    const analogWithColor = (data.analog || []).map(ch => ({
      ...ch,
      color: getPhaseColor(ch.phase),
      type: 'analog',
    }));
    const digitalWithColor = (data.digital || []).map(ch => ({
      ...ch,
      color: settings.theme.digitalHighColor,
      type: 'digital',
    }));
    return [...digitalWithColor, ...analogWithColor];
  }, [data, getPhaseColor, settings.theme.digitalHighColor]);

  // Init & update chart
  useEffect(() => {
    if (!data || !chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }

    const settingsWithPhaseColors = {
      ...settings,
      phaseColors: settings.phaseColors,
    };

    const option = buildChartOption({ data, settings: settingsWithPhaseColors, cursors, hoveredTime: null });
    chartInstance.current.setOption(option, { notMerge: true });

    // Cursor click handler
    chartInstance.current.off('click');
    chartInstance.current.on('click', (params) => {
      if (params.componentType === 'series') {
        const t = params.value[0];
        setCursors(prev => {
          const next = { ...prev };
          next[prev.active] = t;
          next.active = prev.active === 'A' ? 'B' : 'A'; // auto-switch after placing
          return next;
        });
      }
    });

    // Hovered value tracking (for sidebar)
    chartInstance.current.off('updateAxisPointer');
    chartInstance.current.on('updateAxisPointer', (evt) => {
      if (!evt.axesInfo || evt.axesInfo.length === 0) return;
      const xVal = evt.axesInfo[0]?.value;
      if (xVal === undefined) return;
      const newVals = {};
      (data.analog || []).forEach(ch => {
        // Find nearest sample
        const tArr = data.time_ms;
        let minDiff = Infinity, nearestIdx = 0;
        for (let i = 0; i < tArr.length; i++) {
          const d = Math.abs(tArr[i] - xVal);
          if (d < minDiff) { minDiff = d; nearestIdx = i; }
        }
        newVals[ch.name] = ch.values[nearestIdx];
      });
      (data.digital || []).forEach(ch => {
        const tArr = data.time_ms;
        let minDiff = Infinity, nearestIdx = 0;
        for (let i = 0; i < tArr.length; i++) {
          const d = Math.abs(tArr[i] - xVal);
          if (d < minDiff) { minDiff = d; nearestIdx = i; }
        }
        newVals[ch.name] = ch.values[nearestIdx];
      });
      setHoveredValues({ t: xVal, channels: newVals });
    });

    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, [data, settings, cursors]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Reset page when disturbance changes
  useEffect(() => {
    setPage(1);
    setCursors({ A: null, B: null, active: 'A' });
    setHoveredValues({});
  }, [disturbanceId]);

  // Delta calculation
  const delta = useMemo(() => {
    if (cursors.A === null || cursors.B === null) return null;
    return {
      dt: Math.abs(cursors.B - cursors.A).toFixed(3),
    };
  }, [cursors]);

  if (!disturbanceId) {
    return (
      <div className={styles.emptyState}>
        <RiPulseLine className={styles.emptyIcon} />
        <p className={styles.emptyText}>SELECT A DISTURBANCE TO VIEW WAVEFORM</p>
      </div>
    );
  }

  return (
    <div className={`${styles.viewerContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      {/* Toolbar */}
      <WaveformToolbar
        mode={mode}
        onModeChange={setMode}
        onOpenSettings={() => setShowSettings(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(f => !f)}
        cursors={cursors}
        onCursorChange={setCursors}
        delta={delta}
        meta={meta}
        data={data}
      />

      <div className={styles.mainArea}>
        {/* Channel Sidebar */}
        <ChannelSidebar
          channels={allChannels}
          hoveredValues={hoveredValues}
          settings={settings}
        />

        {/* Chart Area */}
        <div className={styles.chartWrapper}>
          {loading && (
            <div className={styles.loadingOverlay}>
              <RiLoader4Line className={styles.spinner} />
              <span>Loading waveform data...</span>
            </div>
          )}
          {error && (
            <div className={styles.errorOverlay}>
              <p>⚠ {error}</p>
            </div>
          )}
          <div ref={chartRef} className={styles.chart} />
        </div>
      </div>

      {/* Bottom bar: pagination + delta readout */}
      <div className={styles.bottomBar}>
        {delta && (
          <div className={styles.deltaReadout}>
            <span className={styles.deltaA}>A:{cursors.A?.toFixed(2)}ms</span>
            <span className={styles.deltaSep}>→</span>
            <span className={styles.deltaB}>B:{cursors.B?.toFixed(2)}ms</span>
            <span className={styles.deltaDt}>Δt = {delta.dt}ms</span>
            <button
              className={styles.clearCursors}
              onClick={() => setCursors({ A: null, B: null, active: 'A' })}
            >✕ Clear</button>
          </div>
        )}
        <PaginationBar
          page={page}
          totalPages={data?.total_pages || 1}
          windowMs={windowMs}
          onPageChange={setPage}
          onWindowChange={(ms) => { setWindowMs(ms); setPage(1); }}
        />
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            settings={settings}
            onUpdate={updateSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WaveformViewer;
