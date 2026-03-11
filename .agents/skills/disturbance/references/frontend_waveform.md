# Frontend Waveform Reference

## Table of Contents
1. Design System Tokens
2. Axios API Client
3. FileUploader Component
4. WaveformChart (ECharts)
5. ChannelSelector Component
6. EventTimeline Component
7. Page Layouts
8. ECharts Configuration Patterns

---

## 1. Design System Tokens (index.css)

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@300;400;600&display=swap');

:root {
  --bg-base:        #080c10;
  --bg-surface:     #0d1117;
  --bg-panel:       #161b22;
  --bg-card:        #1c2128;
  --bg-hover:       #21262d;

  /* Signal trace colors - oscilloscope palette */
  --trace-a:        #f0b429;   /* Phase A - amber */
  --trace-b:        #4ade80;   /* Phase B - green */
  --trace-c:        #60a5fa;   /* Phase C - blue */
  --trace-n:        #f472b6;   /* Neutral - pink */
  --trace-p:        #a78bfa;   /* Active power - violet */
  --trace-q:        #2dd4bf;   /* Reactive power - teal */
  --trace-f:        #fb923c;   /* Frequency - orange */
  --trace-digital:  #94a3b8;   /* Digital / binary - slate */

  --text-primary:   #e6edf3;
  --text-secondary: #8b949e;
  --text-muted:     #484f58;
  --border-subtle:  #21262d;
  --border-active:  #f0b429;
  --status-fault:   #ef4444;
  --status-ok:      #4ade80;
  --status-warn:    #f59e0b;
  --font-display:   'Space Grotesk', sans-serif;
  --font-mono:      'JetBrains Mono', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-display);
  min-height: 100vh;
}
.mono { font-family: var(--font-mono); }
```

---

## 2. Axios API Client

```js
// src/api/client.js
import axios from 'axios';

const client = axios.create({ baseURL: '/api/v1' });

export const api = {
  upload: (formData) => client.post('/disturbances/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  listRecords: () => client.get('/disturbances/'),
  getRecord: (id) => client.get(`/disturbances/${id}/`),
  getChannelData: (id, chId, params = {}) =>
    client.get(`/disturbances/${id}/channels/${chId}/data/`, { params }),
  getEvents: (id) => client.get(`/disturbances/${id}/events/`),
  runAnalysis: (id) => client.post(`/analysis/${id}/run/`),
};
```

---

## 3. FileUploader Component

```jsx
// src/components/FileUploader.jsx
import { useState, useCallback } from 'react';
import { api } from '../api/client';

const FILE_TYPE_OPTIONS = [
  { value: '',         label: 'Auto-detect' },
  { value: 'COMTRADE', label: 'COMTRADE (.cfg + .dat)' },
  { value: 'CSV',      label: 'CSV (.csv)' },
  { value: 'EXCEL',    label: 'Excel (.xlsx/.xls)' },
  { value: 'PSSE',     label: 'PSS/E RAW (.raw)' },
];

export default function FileUploader({ onUploadSuccess }) {
  const [files, setFiles] = useState([]);
  const [typeHint, setTypeHint] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [detected, setDetected] = useState(null);

  const autoDetect = (filename) => {
    if (!filename) return;
    const ext = filename.split('.').pop().toLowerCase();
    const MAP = { cfg: 'COMTRADE', dat: 'COMTRADE', raw: 'PSS/E RAW',
                  csv: 'CSV', xlsx: 'Excel', xls: 'Excel' };
    setDetected(MAP[ext] || 'Unknown');
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(dropped);
    autoDetect(dropped[0]?.name);
  }, []);

  const handleUpload = async () => {
    setUploading(true); setError(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('file', f));
      if (typeHint) formData.append('file_type_hint', typeHint);
      const res = await api.upload(formData);
      onUploadSuccess?.(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="file-uploader">
      <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        <input type="file" multiple accept=".cfg,.dat,.raw,.csv,.xlsx,.xls"
          onChange={e => { setFiles(Array.from(e.target.files)); autoDetect(e.target.files[0]?.name); }} />
        <p>{files.length ? files.map(f => f.name).join(', ') : 'Drop file here or click to browse'}</p>
        {detected && <span className="detected-type">Detected: {detected}</span>}
      </div>
      <div className="type-hint-row">
        <label>File type override:</label>
        <select value={typeHint} onChange={e => setTypeHint(e.target.value)}>
          {FILE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <button onClick={handleUpload} disabled={!files.length || uploading}>
        {uploading ? 'Uploading...' : 'Upload & Parse'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

---

## 4. WaveformChart (ECharts)

```jsx
// src/components/WaveformChart.jsx
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';

const TRACE_COLORS = {
  A: '#f0b429', B: '#4ade80', C: '#60a5fa', N: '#f472b6',
  P: '#a78bfa', Q: '#2dd4bf', FREQ: '#fb923c',
  DIGITAL: '#94a3b8', DEFAULT: '#e6edf3',
};

function resolveColor(ch) {
  const name = ch.name.toUpperCase();
  if (ch.channel_type === 'DIGITAL')                return TRACE_COLORS.DIGITAL;
  if (ch.phase in TRACE_COLORS)                     return TRACE_COLORS[ch.phase];
  if (name.includes('_P') || name.includes('MW'))   return TRACE_COLORS.P;
  if (name.includes('_Q') || name.includes('MVAR')) return TRACE_COLORS.Q;
  if (name.includes('FREQ') || name.includes('HZ')) return TRACE_COLORS.FREQ;
  return TRACE_COLORS.DEFAULT;
}

export default function WaveformChart({ channels, data }) {
  const option = useMemo(() => ({
    backgroundColor: '#0d1117',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#161b22',
      borderColor: '#21262d',
      textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono' },
    },
    toolbox: { feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: {} } },
    legend: { bottom: 4, textStyle: { color: '#8b949e', fontFamily: 'JetBrains Mono', fontSize: 11 } },
    grid: { top: 20, bottom: 60, left: 60, right: 20 },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#21262d' } },
      axisLabel: { color: '#8b949e', fontFamily: 'JetBrains Mono',
                   formatter: v => `${(v / 1000).toFixed(1)}ms` },
      splitLine: { lineStyle: { color: '#0f1721', type: 'dashed' } },
    },
    yAxis: channels.map((ch, i) => ({
      type: 'value',
      name: `${ch.name} (${ch.unit})`,
      nameTextStyle: { color: '#484f58', fontFamily: 'JetBrains Mono', fontSize: 10 },
      axisLine: { lineStyle: { color: '#21262d' } },
      axisLabel: { color: '#8b949e', fontFamily: 'JetBrains Mono' },
      splitLine: { show: i === 0, lineStyle: { color: '#0f1721', type: 'dashed' } },
      show: i < 4,
    })),
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, height: 20, bottom: 30,
        fillerColor: 'rgba(240,180,41,0.1)', borderColor: '#f0b429' },
    ],
    series: channels.map((ch, i) => ({
      name: ch.name,
      type: 'line',
      step: ch.channel_type === 'DIGITAL' ? 'end' : false,
      yAxisIndex: Math.min(i, 3),
      data: (data[ch.id] || []).map(([t, v]) => [t, v]),
      lineStyle: { color: resolveColor(ch), width: 1.5 },
      itemStyle: { color: resolveColor(ch) },
      showSymbol: false,
      large: true,
      largeThreshold: 500,
    })),
  }), [channels, data]);

  return (
    <ReactECharts option={option}
      style={{ height: '420px', width: '100%' }}
      opts={{ renderer: 'canvas' }} />
  );
}
```

---

## 5. ChannelSelector Component

```jsx
// src/components/ChannelSelector.jsx
import { useState } from 'react';

export default function ChannelSelector({ channels, selected, onSelectionChange }) {
  const [filter, setFilter] = useState('ALL');

  const visible = channels.filter(ch => filter === 'ALL' || ch.channel_type === filter);
  const toggle = (id) => onSelectionChange(
    selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  );

  return (
    <div className="channel-selector">
      <div className="filter-tabs">
        {['ALL', 'ANALOGUE', 'DIGITAL'].map(t => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>
      <div className="channel-list">
        {visible.map(ch => (
          <label key={ch.id} className="channel-item">
            <input type="checkbox" checked={selected.includes(ch.id)} onChange={() => toggle(ch.id)} />
            <span className="ch-name mono">{ch.name}</span>
            <span className="ch-meta">{ch.channel_type === 'DIGITAL' ? 'DIG' : ch.unit}</span>
            {ch.phase !== 'NA' && <span className="ch-phase">{ch.phase}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. EventTimeline Component

```jsx
// src/components/EventTimeline.jsx
const EVENT_COLORS = {
  FAULT: '#ef4444', TRIP: '#f59e0b',
  RELAY: '#a78bfa', UFLS: '#f0b429', OTHER: '#8b949e',
};

export default function EventTimeline({ events, totalDuration }) {
  if (!events?.length) return null;
  return (
    <div className="event-timeline">
      <div className="timeline-bar">
        {events.map((ev, i) => (
          <div key={i} className="event-marker"
            style={{ left: `${(ev.time_us / totalDuration) * 100}%` }}
            title={`${ev.event_type} @ ${(ev.time_us / 1000).toFixed(1)}ms`}>
            <div className="marker-dot"
              style={{ background: EVENT_COLORS[ev.event_type] || '#8b949e' }} />
          </div>
        ))}
      </div>
      <div className="event-list">
        {events.map((ev, i) => (
          <div key={i} className="event-row">
            <span className="ev-time mono">{(ev.time_us / 1000).toFixed(2)}ms</span>
            <span className="ev-type" style={{ color: EVENT_COLORS[ev.event_type] }}>{ev.event_type}</span>
            <span className="ev-desc">{ev.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Page Layouts

### DashboardPage

```jsx
// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import FileUploader from '../components/FileUploader';

export default function DashboardPage() {
  const [records, setRecords] = useState([]);
  const navigate = useNavigate();
  const load = () => api.listRecords().then(r => setRecords(r.data.results || r.data));
  useEffect(() => { load(); }, []);

  return (
    <div className="page dashboard">
      <header className="page-header">
        <h1>Power Disturbance Analyser</h1>
        <p>Upload and inspect power system disturbance records</p>
      </header>
      <FileUploader onUploadSuccess={load} />
      <section className="records-section">
        {records.map(rec => (
          <div key={rec.id} className="record-card" onClick={() => navigate(`/analysis/${rec.id}`)}>
            <span className="source-badge">{rec.source_type}</span>
            <span className="filename">{rec.original_filename}</span>
            <span className="station">{rec.station_name || 'Unknown Station'}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
```

### AnalysisPage

```jsx
// src/pages/AnalysisPage.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import WaveformChart from '../components/WaveformChart';
import ChannelSelector from '../components/ChannelSelector';
import EventTimeline from '../components/EventTimeline';

export default function AnalysisPage() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [selected, setSelected] = useState([]);
  const [chartData, setChartData] = useState({});
  const [events, setEvents] = useState([]);

  useEffect(() => {
    api.getRecord(id).then(r => {
      setRecord(r.data);
      setSelected(r.data.channels.filter(c => c.channel_type === 'ANALOGUE').slice(0, 4).map(c => c.id));
    });
    api.getEvents(id).then(r => setEvents(r.data));
  }, [id]);

  useEffect(() => {
    if (!selected.length) return;
    Promise.all(selected.map(chId =>
      api.getChannelData(id, chId, { downsample: 2000 }).then(r => ({ chId, data: r.data.data }))
    )).then(results => {
      const next = {};
      results.forEach(({ chId, data }) => { next[chId] = data; });
      setChartData(next);
    });
  }, [selected, id]);

  if (!record) return <div className="loading">Loading...</div>;
  const selectedChannels = record.channels.filter(c => selected.includes(c.id));
  const totalDuration = Object.values(chartData)[0]?.at(-1)?.[0] || 1;

  return (
    <div className="page analysis">
      <aside className="channel-panel">
        <h2 className="panel-title">Channels</h2>
        <ChannelSelector channels={record.channels} selected={selected} onSelectionChange={setSelected} />
      </aside>
      <main className="waveform-main">
        <div className="record-meta">
          <span className="source-badge">{record.source_type}</span>
          <span className="station">{record.station_name || record.original_filename}</span>
        </div>
        <WaveformChart channels={selectedChannels} data={chartData} />
        <EventTimeline events={events} totalDuration={totalDuration} />
      </main>
    </div>
  );
}
```

---

## 8. ECharts Configuration Patterns

### Multi-Y-axis rule
- Channels 0-3 get separate Y-axes (yAxisIndex 0-3)
- Channels 4+ share yAxisIndex 3 to avoid overflow
- Digital channels always use a dedicated 0-1 axis

### Large dataset performance
- Always use `large: true` and `largeThreshold: 500` on series
- Always downsample to 2000 points server-side (LTTB algorithm)
- Use `renderer: 'canvas'` not SVG for large data

### Synchronized zoom across multiple charts
```jsx
import * as echarts from 'echarts';
echarts.connect('pd-chart-group');
// On each ECharts instance:
echartsRef.current.getEchartsInstance().group = 'pd-chart-group';
```
