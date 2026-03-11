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

  // Pre-calculate colors based on settings so both Chart and Sidebar use the exact same values
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
      left: 10,  // Fixed px offset for stability
      right: 20, // Fixed px offset for stability
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
        axisLabel: { show: false },
        splitLine: { 
          show: true, 
          interval: 100000, 
          lineStyle: { color: theme.gridColor, type: 'solid', opacity: 0.3 } 
        },
        axisLine: { show: false },
        axisTick: { show: false },
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

  // MarkLines (Cursors)
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
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#00606433', type: 'dashed' },
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#0f172a', fontSize: 11 },
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      formatter: (params) => {
        if (!params || params.length === 0) return '';
        const t = params[0]?.axisValue?.toFixed(3);
        let html = `<div style="font-weight:700;margin-bottom:6px;color:#006064;border-bottom:1px solid #f1f5f9;padding-bottom:4px">${t} ms</div>`;
        
        params.forEach(p => {
          if (p.value && p.value[1] !== null) {
            let displayValue = p.value[1];
            
            // Normalize value to 0 or 1 if it's a digital signal
            if (p.seriesId && p.seriesId.startsWith('digital')) {
              displayValue = p.value[1]; // No more offset needed in 1:1 mode
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

// ─── Main Component ──────────────────────────────────────────────────────────

const WaveformViewer = ({ disturbanceId }) => {
  const [page, setPage] = useState(1);
  const [windowMs, setWindowMs] = useState(500);
  const [mode, setMode] = useState('instantaneous'); // 'instantaneous' | 'rms'
  const [cursors, setCursors] = useState({ A: null, B: null, active: 'A' });
  const [hoveredValues, setHoveredValues] = useState({});
  const [laneHeight, setLaneHeight] = useState(60);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalculatedModal, setShowCalculatedModal] = useState(false);
  const [view, setView] = useState('raw'); // 'raw' | 'advanced' (renamed to Calculated Channels)
  const [calculatedDefinitions, setCalculatedDefinitions] = useState([]);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const { data, loading, error } = useWaveformData(disturbanceId, page, windowMs, mode);
  const { meta } = useChannelMeta(disturbanceId);
  const { settings, updateSettings, getPhaseColor } = useSettings();

  // Derive display channels from data for the sidebar
  const allChannels = useMemo(() => {
    if (!data) return [];
    
    // Convert digital channels to sidebar format
    const digitalWithColor = (data.digital || []).map(ch => ({
      ...ch,
      color: settings.theme.digitalHighColor,
      type: 'digital',
    }));

    // Convert analog channels to sidebar format
    const analogWithColor = (data.analog || []).map(ch => ({
      ...ch,
      color: getPhaseColor(ch.phase),
      type: 'analog',
    }));

    // Combine them in the SAME order as buildChartOption (analog then digital)
    return [...analogWithColor, ...digitalWithColor];
  }, [data, getPhaseColor, settings.theme.digitalHighColor]);

  // compute engine for calculated channels
  const calculatedData = useMemo(() => {
    if (!data || !data.analog || calculatedDefinitions.length === 0) return null;
    
    const time_ms = data.time_ms || [];
    const analogMap = {};
    data.analog.forEach(ch => { analogMap[ch.name] = ch; });

    const computedAnalog = calculatedDefinitions.map(def => {
      const srcA = analogMap[def.sourceA];
      const srcB = analogMap[def.sourceB];
      
      if (!srcA || !srcB) return null;

      const values = srcA.values.map((v, i) => {
        const valB = srcB.values[i];
        if (def.operator === '+') return v + valB;
        if (def.operator === '-') return v - valB;
        if (def.operator === '*') return v * valB;
        if (def.operator === '/') return valB !== 0 ? v / valB : 0;
        return v;
      });

      return {
        id: def.id,
        name: def.name,
        values,
        unit: srcA.unit || '',
        phase: 'default',
        color: def.color,
      };
    }).filter(Boolean);

    return {
      time_ms,
      analog: computedAnalog,
      digital: [],
      total_pages: 1,
      total_samples: data.total_samples
    };
  }, [data, calculatedDefinitions]);

  // chart instance for the calculated view
  const calcChartRef = useRef(null);
  const calcChartInstance = useRef(null);

  useEffect(() => {
    if (!calculatedData || !calcChartRef.current || view !== 'advanced') return;

    if (!calcChartInstance.current) {
        calcChartInstance.current = echarts.init(calcChartRef.current, null, { renderer: 'canvas' });
    }

    const option = buildChartOption({ 
      data: calculatedData, 
      settings, 
      cursors, 
      laneHeight 
    });
    calcChartInstance.current.setOption(option, { notMerge: true });

    const ro = new ResizeObserver(() => calcChartInstance.current?.resize());
    ro.observe(calcChartRef.current);
    return () => ro.disconnect();
  }, [calculatedData, settings, cursors, laneHeight, view]);

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

    const option = buildChartOption({ 
      data, 
      settings: settingsWithPhaseColors, 
      cursors, 
      laneHeight 
    });
    chartInstance.current.setOption(option, { notMerge: true });

    // Cursor click handler (anywhere in chart)
    const zr = chartInstance.current.getZr();
    zr.off('click');
    zr.on('click', (params) => {
      if (!chartInstance.current) return;
      
      // Force the Y coordinate to be inside the first grid (gridIndex: 0)
      // This guarantees convertFromPixel will successfully map the X coordinate 
      // regardless of which lane the user actually clicked vertically.
      const pointInPixel = [params.offsetX, laneHeight / 2]; 
      
      const pointInData = chartInstance.current.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
      
      if (pointInData) {
        let t = pointInData[0];
        // Constrain to data range
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

    // SYNC: When main chart zooms (mouse/click), this is usually for 'inside' zoom
    // We don't necessarily NEED to sync back to the slider if its 'inside'
    // but we will for completeness if needed.

    const ro = new ResizeObserver(() => chartInstance.current?.resize());
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, [data, settings, cursors, laneHeight]);

  const handleExternalZoom = useCallback((params) => {
    if (!chartInstance.current) return;
    const { start, end } = params;
    chartInstance.current.setOption({
      dataZoom: [{ type: 'inside', start, end }]
    });
  }, []);

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

  // Handle chart resize when switching back to 'raw' view
  useEffect(() => {
    if (view === 'raw' && chartInstance.current) {
      setTimeout(() => {
        chartInstance.current.resize();
      }, 0);
    }
  }, [view]);

  // Find values at specific time T
  const getValuesAt = useCallback((t) => {
    if (t === null || !data) return null;
    const vals = {};
    const tArr = data.time_ms || [];
    let minDiff = Infinity, nearestIdx = 0;
    for (let i = 0; i < tArr.length; i++) {
      const d = Math.abs(tArr[i] - t);
      if (d < minDiff) { minDiff = d; nearestIdx = i; }
    }
    (data.analog || []).forEach(ch => { vals[ch.name] = ch.values[nearestIdx]; });
    (data.digital || []).forEach(ch => { vals[ch.name] = ch.values[nearestIdx]; });
    return vals;
  }, [data]);

  const cursorAValues = useMemo(() => getValuesAt(cursors.A), [cursors.A, getValuesAt]);
  const cursorBValues = useMemo(() => getValuesAt(cursors.B), [cursors.B, getValuesAt]);

  // Delta calculation
  const delta = useMemo(() => {
    const dt = (cursors.A !== null && cursors.B !== null) 
      ? Math.abs(cursors.B - cursors.A).toFixed(3) 
      : null;
    return {
      A: cursors.A !== null ? cursors.A.toFixed(2) : '--',
      B: cursors.B !== null ? cursors.B.toFixed(2) : '--',
      dt: dt,
    };
  }, [cursors]);

  if (!disturbanceId) {
    return (
      <div className={styles.emptyState}>
        <RiPulseLine className={styles.emptyIcon} />
        <p className={styles.emptyText}>Select a disturbance to analyze waveform</p>
      </div>
    );
  }

  return (
    <div className={`${styles.viewerContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      {/* Toolbar */}
      <WaveformToolbar
        mode={mode}
        onModeChange={setMode}
        laneHeight={laneHeight}
        onLaneHeightChange={setLaneHeight}
        onOpenSettings={() => setShowSettings(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(f => !f)}
        cursors={cursors}
        onCursorChange={setCursors}
        delta={delta}
        meta={meta}
        data={data}
      />

      {/* View Tabs */}
      <div className={styles.viewTabs}>
        <button 
          className={`${styles.viewTab} ${view === 'raw' ? styles.activeViewTab : ''}`}
          onClick={() => setView('raw')}
        >
          Raw Waveform
        </button>
        <button 
          className={`${styles.viewTab} ${view === 'advanced' ? styles.activeViewTab : ''}`}
          onClick={() => setView('advanced')}
        >
          Calculated Channels
        </button>
      </div>

      <div className={styles.viewContent} style={{ display: view === 'raw' ? 'flex' : 'none' }}>
        {/* Sticky Zoom Slider Header */}
        <div className={styles.stickyHeader}>
          <div className={styles.sidebarSpacer} />
          <div className={styles.zoomContainer}>
            {data && (
              <ZoomSlider 
                data={data} 
                settings={settings} 
                onZoom={handleExternalZoom} 
                height={20} 
              />
            )}
          </div>
        </div>

        <div className={styles.mainArea}>
          {/* Channel Sidebar */}
          <div style={{ height: `${allChannels.length * laneHeight + 20}px` }}>
            <ChannelSidebar
              channels={allChannels}
              hoveredValues={hoveredValues}
              cursorAValues={cursorAValues}
              cursorBValues={cursorBValues}
              cursors={cursors}
              settings={settings}
              laneHeight={laneHeight}
            />
          </div>

          {/* Chart Area */}
          <div className={styles.chartWrapper} style={{ height: `${allChannels.length * laneHeight + 20}px` }}>
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
            <div 
              ref={chartRef} 
              className={styles.chart} 
              style={{ height: '100%' }}
            />
          </div>
        </div>

        {/* Bottom bar: pagination + delta readout + time status */}
        <div className={styles.bottomBar}>
          <div className={styles.bottomRowTop}>
            <div className={styles.deltaReadout}>
              <span className={`${styles.deltaLabel} ${cursors.active === 'A' ? styles.active : ''}`}>A:</span>
              <span className={styles.deltaA}>{delta.A} ms</span>
              
              <span className={`${styles.deltaLabel} ${cursors.active === 'B' ? styles.active : ''}`}>B:</span>
              <span className={styles.deltaB}>{delta.B} ms</span>
              
              {delta.dt && (
                <>
                  <span className={styles.deltaSep}>|</span>
                  <span className={styles.deltaDt}>Δt = {delta.dt} ms</span>
                </>
              )}
            </div>

            <button
              className={styles.clearCursors}
              onClick={() => setCursors({ A: null, B: null, active: 'A' })}
              disabled={cursors.A === null && cursors.B === null}
              style={{ 
                opacity: (cursors.A !== null || cursors.B !== null) ? 1 : 0.5,
                marginLeft: 'auto' 
              }}
            >✕ Clear</button>
          </div>

          <div className={styles.bottomRowBottom}>
            <div className={styles.bottomRightActions}>
              <div className={styles.hoverTime}>
                <span className={styles.timeLabel}>T =</span>
                <span className={styles.timeValue}>
                  {hoveredValues.t !== undefined ? `${Number(hoveredValues.t).toFixed(3)} ms` : '--'}
                </span>
              </div>

              <div className={styles.vScaleBar}>
                <span className={styles.timeLabel}>V-SCALE</span>
                <input
                  type="range"
                  min="40"
                  max="300"
                  step="10"
                  value={laneHeight}
                  onChange={(e) => setLaneHeight(Number(e.target.value))}
                  className={styles.vScaleInput}
                />
              </div>

              <PaginationBar
                page={page}
                totalPages={data?.total_pages || 1}
                windowMs={windowMs}
                onPageChange={setPage}
                onWindowChange={(ms) => { setWindowMs(ms); setPage(1); }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.viewContent} style={{ display: view === 'advanced' ? 'flex' : 'none' }}>
        <div className={styles.calculatedHeader}>
          <div className={styles.calcTitle}>
            <RiCalculatorLine />
            <span>Virtual Waveforms</span>
          </div>
          <button 
            className={styles.manageBtn}
            onClick={() => setShowCalculatedModal(true)}
          >
            <RiSettings3Line /> Manage Calculations
          </button>
        </div>

        {calculatedDefinitions.length > 0 ? (
          <div className={styles.mainArea}>
            <div style={{ height: `${calculatedDefinitions.length * laneHeight + 20}px` }}>
              <ChannelSidebar
                channels={calculatedData?.analog.map(ch => ({ ...ch, type: 'analog' })) || []}
                hoveredValues={hoveredValues}
                cursorAValues={cursorAValues}
                cursorBValues={cursorBValues}
                cursors={cursors}
                settings={settings}
                laneHeight={laneHeight}
              />
            </div>
            <div className={styles.chartWrapper} style={{ height: `${calculatedDefinitions.length * laneHeight + 20}px` }}>
              <div ref={calcChartRef} className={styles.chart} style={{ height: '100%' }} />
            </div>
          </div>
        ) : (
          <div className={styles.advancedPlaceholder}>
            <div className={styles.placeholderContent}>
              <RiCalculatorLine className={styles.placeholderIcon} />
              <h3>No Calculated Channels</h3>
              <p>Define new waveforms (e.g., IA + IB) to perform multi-channel analysis.</p>
              <button 
                className={styles.primaryAddBtn}
                onClick={() => setShowCalculatedModal(true)}
              >
                <RiAddLine /> Create First Calculation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Calculated Channel Modal */}
      <AnimatePresence>
        {showCalculatedModal && (
          <CalculatedChannelModal
            analogChannels={data?.analog || []}
            definitions={calculatedDefinitions}
            onUpdate={setCalculatedDefinitions}
            onClose={() => setShowCalculatedModal(false)}
          />
        )}
      </AnimatePresence>

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
