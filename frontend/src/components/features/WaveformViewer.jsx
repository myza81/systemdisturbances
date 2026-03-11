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
  RiCalculatorLine, RiAddLine,
} from 'react-icons/ri';
import { useWaveformData, useChannelMeta } from '../../hooks/useWaveformData';
import { useSettings } from '../../hooks/useSettings';
import WaveformToolbar from './waveform/WaveformToolbar';
import ChannelSidebar from './waveform/ChannelSidebar';
import ZoomSlider from './waveform/ZoomSlider';
import PaginationBar from './waveform/PaginationBar';
import SettingsModal from './settings/SettingsModal';
import CalculatedChannelModal from './waveform/CalculatedChannelModal';
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

function buildChartOption({ data, settings, cursors, laneHeight = 60 }) {
  const { theme, phaseColors } = settings;
  const analog = data.analog || [];
  const digital = data.digital || [];
  const time_ms = data.time_ms || [];

  const minX = time_ms.length > 0 ? time_ms[0] : 0;
  const maxX = time_ms.length > 0 ? time_ms[time_ms.length - 1] : 100;

  // Pre-calculate colors
  const processChannel = (ch, type) => {
    let color = settings.theme.textColor; // default
    if (type === 'analog') {
      color = phaseColors[ch.phase] || phaseColors.default || '#64748b';
    } else if (type === 'digital') {
      color = settings.theme.digitalHighColor || '#10b981';
    }
    return { ...ch, type, color };
  };

  const allChannels = [
    ...analog.map(ch => processChannel(ch, 'analog')),
    ...digital.map(ch => processChannel(ch, 'digital'))
  ];

  const grids = [];
  const xAxes = [];
  const yAxes = [];
  const series = [];

  allChannels.forEach((ch, idx) => {
    const gridIdx = idx;
    const top = idx * laneHeight;

    grids.push({
      top: top,
      height: laneHeight,
      left: 50,  // Increased for Y-axis labels
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
        name: ch.name,
        id: `digital-${idx}-${ch.name}`,
        type: 'line',
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        step: 'end',
        symbol: 'none',
        lineStyle: { width: 1.5, color: ch.color },
        data: time_ms.map((t, i) => [t, ch.values[i]]),
        z: 3,
      });
    } else {
      yAxes.push({
        type: 'value',
        gridIndex: gridIdx,
        axisLabel: { 
          show: true,
          color: theme.textColor,
          fontSize: 9,
          hideOverlap: true,
          formatter: (v) => Number(v).toFixed(1)
        },
        splitLine: { 
          show: true, 
          interval: 100000, 
          lineStyle: { color: theme.gridColor, type: 'solid', opacity: 0.3 } 
        },
        axisLine: { show: false },
        axisTick: { show: true, lineStyle: { color: theme.gridColor } },
      });

      series.push({
        name: ch.name,
        type: 'line',
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: { width: 1.5, color: ch.color },
        data: time_ms.map((t, i) => [t, ch.values[i] ?? null]),
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
    series,
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
  const [view, setView] = useState('raw'); 
  const [calculatedDefinitions, setCalculatedDefinitions] = useState([]);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const rawResult = useWaveformData(disturbanceId, rawPage, rawWindowMs, mode);
  const calcBaseResult = useWaveformData(disturbanceId, calcPage, calcWindowMs, mode);

  const { meta } = useChannelMeta(disturbanceId);
  const { settings, updateSettings, getPhaseColor } = useSettings();

  // Derive display channels
  const allChannels = useMemo(() => {
    const data = rawResult.data;
    if (!data) return [];
    const digitalWithColor = (data.digital || []).map(ch => ({ ...ch, color: settings.theme.digitalHighColor, type: 'digital' }));
    const analogWithColor = (data.analog || []).map(ch => ({ ...ch, color: getPhaseColor(ch.phase), type: 'analog' }));
    return [...analogWithColor, ...digitalWithColor];
  }, [rawResult.data, getPhaseColor, settings.theme.digitalHighColor]);

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

  const calcChartRef = useRef(null);
  const calcChartInstance = useRef(null);

  useEffect(() => {
    if (!calculatedData || !calcChartRef.current || view !== 'advanced') return;
    if (!calcChartInstance.current) calcChartInstance.current = echarts.init(calcChartRef.current, null, { renderer: 'canvas' });
    const option = buildChartOption({ data: calculatedData, settings, cursors, laneHeight: calcLaneHeight });
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
  }, [calculatedData, rawResult.data, settings, cursors, calcLaneHeight, view]);
  useEffect(() => {
    const data = rawResult.data;
    if (!data || !chartRef.current) return;
    if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    const option = buildChartOption({ data, settings, cursors, laneHeight: rawLaneHeight });
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
  }, [rawResult.data, calculatedData, settings, cursors, rawLaneHeight, view]);

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
    };
  }, []);

  useEffect(() => {
    setRawPage(1);
    setCalcPage(1);
    setCursors({ A: null, B: null, active: 'A' });
    setHoveredValues({});
  }, [disturbanceId]);

  useEffect(() => {
    if (view === 'raw' && chartInstance.current) setTimeout(() => chartInstance.current.resize(), 0);
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
        onOpenSettings={() => setShowSettings(true)} isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)}
        cursors={cursors} onCursorChange={setCursors} delta={delta} meta={meta} data={currentData}
      />

      <div className={styles.viewTabs}>
        <button className={`${styles.viewTab} ${view === 'raw' ? styles.activeViewTab : ''}`} onClick={() => setView('raw')}>Raw Waveform</button>
        <button className={`${styles.viewTab} ${view === 'advanced' ? styles.activeViewTab : ''}`} onClick={() => setView('advanced')}>Calculated Channels</button>
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
              channels={allChannels} hoveredValues={hoveredValues} cursorAValues={cursorAValues} cursorBValues={cursorBValues}
              cursors={cursors} settings={settings} laneHeight={rawLaneHeight}
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
          <button className={styles.manageBtn} onClick={() => setShowCalculatedModal(true)}><RiSettings3Line /> Manage Calculations</button>
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
        {showCalculatedModal && <CalculatedChannelModal analogChannels={rawResult.data?.analog || []} definitions={calculatedDefinitions} onUpdate={setCalculatedDefinitions} onClose={() => setShowCalculatedModal(false)} />}
        {showSettings && <SettingsModal settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  );
};

export default WaveformViewer;
