---
name: django-react-power-disturbance
description: "Full-stack power system disturbance analysis app using Django and React.js. Use when building a production-grade disturbance analysis web app that ingests COMTRADE (.cfg/.dat), CSV, Excel, or PSS/E RAW files; parses analogue and digital channels (voltage, current, P, Q, frequency, binary status); renders interactive waveforms and event timelines in React; applies power system logic (RoCoF, fault detection, islanding, protection correlation); or requires Django REST API patterns for power engineering workflows. Follows oscilloscope-inspired dark UI design. Always build from scratch following the workflow in this skill."
---

# Power System Disturbance Waveform Analysis Platform

A comprehensive skill for building a **production-grade post-event grid disturbance analysis tool**. The platform ingests disturbance recorder data, performs advanced waveform analysis and signal processing, detects power system events, and presents interactive visualisations in a modern engineering UI.

This project is developed **incrementally, component by component**, and is designed to evolve into a large, long-term platform — potentially packaged as a **standalone executable application** for distribution.

---

## 1  Purpose

Guide the AI coding agent to build, extend, and maintain a power system disturbance waveform analysis platform that:

1. Ingests multi-format disturbance data files (COMTRADE, CSV, Excel)
2. Parses analogue waveform channels, digital status channels, and high-sampling-rate data
3. Provides a **rich waveform analysis engine** — the core of the entire system
4. Applies power-system signal processing algorithms (RoCoF, FFT, harmonic analysis, fault detection, etc.)
5. Trains and runs machine-learning models for disturbance classification and anomaly detection
6. Renders interactive, engineering-grade waveform visualisations in a React frontend
7. Maintains clean, modular architecture so the system can later be packaged as a desktop executable

---

## 2  System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       React.js Frontend                         │
│  ┌──────────┐ ┌──────────────┐ ┌────────┐ ┌─────────────────┐  │
│  │   File   │ │   Waveform   │ │Channel │ │   Analysis      │  │
│  │ Uploader │ │   Viewer     │ │Selector│ │   Dashboard     │  │
│  └────┬─────┘ └──────┬───────┘ └───┬────┘ └────────┬────────┘  │
│       │              │             │                │           │
│       └──────────────┴─────────────┴────────────────┘           │
│                            │  Axios / REST                      │
└────────────────────────────┼────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    Django REST API                               │
│  ┌───────────┐ ┌───────────┴──────┐ ┌─────────────────────┐    │
│  │  File     │ │   Waveform       │ │   ML / Advanced     │    │
│  │ Ingestion │ │   Analysis       │ │   Analysis          │    │
│  │ Module    │ │   Engine         │ │   Module            │    │
│  └─────┬─────┘ └────────┬─────────┘ └──────────┬──────────┘    │
│        │                │                       │               │
│  ┌─────┴────────────────┴───────────────────────┴──────────┐    │
│  │              Signal Processing Core                      │    │
│  │  RMS · RoCoF · FFT · Harmonics · Phasor · Transients   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│                   PostgreSQL                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3  Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend API | Django 4.x + Django REST Framework | Robust ORM, file handling, fast prototyping |
| File Parsing | Python (`comtrade`, `pandas`, `openpyxl`) | Best-in-class power data libraries |
| Signal Processing | NumPy, SciPy, scikit-learn | Industry-standard numerical computing |
| Database | PostgreSQL (local instance) | Time-series readiness, JSON support, future scalability |
| Frontend | React.js (Vite) | Fast dev, component-based architecture |
| Waveform Charts | Apache ECharts via `echarts-for-react` | Power-grade zoom/pan, large dataset performance, configurable axes |
| Styling | Vanilla CSS with CSS Modules + CSS variables | Full design control, scoped styles, no framework lock-in |
| State Management | React Context + `useState`/`useReducer` | Adequate for current scale; avoid Redux overhead |
| Auth Scaffolding | Django `AbstractUser` (disabled by default) | Prepared for future JWT toggle |
| Future Packaging | PyInstaller / Electron | Standalone executable distribution |

---

## 4  Project Structure

```
disturbances/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py             # Shared settings
│   │   │   ├── local.py            # Dev overrides (DEBUG, DB creds)
│   │   │   └── production.py       # Prod overrides
│   │   ├── urls.py                 # Root URL conf
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── core/                   # User model, shared utilities
│   │   ├── disturbances/           # File ingestion, data models
│   │   │   ├── models.py           # DisturbanceRecord, Channel, DataPoint
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   └── parsers/
│   │   │       ├── comtrade_parser.py
│   │   │       ├── csv_parser.py
│   │   │       └── excel_parser.py
│   │   └── analysis/               # Analysis engine, ML models
│   │       ├── models.py
│   │       ├── engine.py           # Signal processing core
│   │       ├── ml/                 # Machine learning module (future)
│   │       │   ├── features.py     # Feature extraction
│   │       │   ├── classifiers.py  # Disturbance classifiers
│   │       │   └── anomaly.py      # Anomaly detection
│   │       └── views.py
│   ├── utils/                      # Shared helper functions
│   └── data/                       # Sample data, fixtures
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/                    # Axios client, endpoint helpers
│       ├── hooks/                  # Custom React hooks
│       │   ├── useWaveformData.js
│       │   └── useSettings.js
│       ├── components/
│       │   ├── common/             # Sidebar, layout, shared UI
│       │   └── features/
│       │       ├── FileUploader.jsx
│       │       ├── ColumnMapper.jsx
│       │       ├── WaveformViewer.jsx
│       │       ├── WaveformChart.jsx
│       │       ├── DisturbanceList.jsx
│       │       ├── StatsOverview.jsx
│       │       ├── ActivityLog.jsx
│       │       ├── waveform/       # Sub-components
│       │       │   ├── ChannelSidebar.jsx
│       │       │   ├── WaveformToolbar.jsx
│       │       │   └── PaginationBar.jsx
│       │       └── settings/
│       ├── pages/
│       ├── services/
│       ├── styles/                 # Global CSS, design tokens
│       └── utils/
│
├── samples/                        # Example disturbance data files
└── .agents/skills/disturbance/
    ├── SKILL.md                    # This file
    └── references/                 # Detailed reference docs
```

---

## 5  Architecture Guidelines

### 5.1  Separation of Concerns

- **Parsers** handle only file I/O → normalised channel data. No analysis logic.
- **Analysis Engine** receives normalised data → returns computed results. No HTTP or DB logic.
- **Views/Serializers** handle only request/response. Call parsers and engine as services.
- **Frontend components** are presentational or container. No business logic in JSX.

### 5.2  Parser Interface Contract

All parsers **must** conform to this interface:

```python
def parse(file_path: str, options: dict = None) -> dict:
    """
    Returns:
    {
        'metadata': {
            'source_type': str,       # 'COMTRADE' | 'CSV' | 'EXCEL'
            'station_name': str,
            'start_time': str | None, # ISO 8601 or None
            'frequency': float,       # Nominal system frequency (Hz)
            'sampling_rate': float,   # Samples per second
            'total_samples': int,
        },
        'channels': [
            {
                'name': str,
                'unit': str,           # 'kV', 'A', 'MW', 'Hz', etc.
                'type': 'ANALOGUE' | 'DIGITAL',
                'phase': str | None,   # 'A', 'B', 'C', 'N', or None
                'samples': [(time_us: int, value: float), ...]
            }
        ]
    }
    """
```

### 5.3  Data Flow

```
File Upload → Parser (auto-detect format) → Normalised Dict
  → Store metadata in DisturbanceRecord
  → Store channels in Channel table
  → Store samples in DataPoint table
  → Frontend requests channel data via REST
  → Backend downsamples before responding
  → Frontend renders in ECharts
```

### 5.4  Modularity for Future Packaging

- Keep all business logic in pure Python modules (no Django imports)
- Analysis engine should work independently of the web framework
- Use dependency injection patterns where framework coupling is unavoidable
- This ensures the core can be wrapped in a PyInstaller/Electron executable later

---

## 6  Core Modules

### 6.1  File Ingestion Module

| Format | Library | Key Notes |
|---|---|---|
| COMTRADE | `comtrade` (PyPI) | Parse `.cfg` + `.dat` pair; analogue + digital channels |
| CSV | `pandas` | Auto-detect header row, time column, delimiter |
| Excel | `pandas` + `openpyxl` | Multi-sheet support; user selects sheet via ColumnMapper |

**Rules:**
- COMTRADE: Always require **both** `.cfg` AND `.dat` files; raise `ValidationError` if the pair is incomplete
- Smart file-type detection: auto-detect by extension + magic bytes
- Frontend shows a correction dropdown (`ColumnMapper`) for ambiguous CSV/Excel column mappings
- Maximum upload size: enforce in Django settings (default 100 MB)

### 6.2  Waveform Analysis Engine ★ Core Priority

This is the **most important module** in the entire system. All development effort should prioritise the analysis engine above other features.

#### 6.2.1  Waveform Processing

| Feature | Description | Implementation |
|---|---|---|
| Analogue Waveform Visualisation | Render voltage, current, power, frequency waveforms | ECharts line series with `dataZoom` |
| Digital Signal Visualisation | Step/binary chart for breaker status, relay flags | ECharts step-line with 0/1 range |
| Zoom, Pan, Time Cursor | Interactive navigation of long recordings | ECharts `dataZoom` (slider + inside) |
| Channel Overlay & Comparison | Stack multiple channels on shared time axis | Multi-series with independent Y-axes |
| Time-Window Selection | Select region for targeted analysis | ECharts `brush` component |

#### 6.2.2  Signal Processing Features

| Feature | Algorithm | Python Libraries |
|---|---|---|
| RMS Calculation | Root Mean Square over sliding window | `numpy` |
| RoCoF | Rate of Change of Frequency (df/dt) | `numpy` (gradient-based) |
| Harmonic Analysis | FFT decomposition into harmonic orders | `scipy.fft` |
| FFT Spectral Analysis | Full frequency-domain spectrum | `scipy.fft`, `numpy` |
| DC Offset Detection | Mean value deviation from zero | `numpy` |
| Transient Detection | Derivative spike + threshold crossing | `scipy.signal.find_peaks` |
| High-Frequency Disturbance | Band-pass filter + energy detection | `scipy.signal.butter`, `sosfilt` |
| Small Signal Oscillation | Low-frequency modal analysis | `scipy.signal` (Prony/ERA methods) |
| Phasor Computation | RMS magnitude + phase angle from samples | DFT at fundamental frequency |
| Frequency Tracking | Zero-crossing or DFT-based | `scipy.signal` |
| Power Calculation | P = V·I·cos(φ), Q = V·I·sin(φ) | `numpy` with phase-matched V/I |

#### 6.2.3  Disturbance Analysis

| Feature | Method |
|---|---|
| Fault Pattern Identification | Overcurrent + undervoltage coincidence detection |
| Voltage Sag/Swell Detection | RMS envelope vs nominal ± threshold |
| Oscillation Analysis | Damping ratio estimation from ring-down |
| Protection Operation Analysis | Digital channel sequence timing correlation |
| Islanding Detection | RoCoF + frequency deviation combined criteria |

#### 6.2.4  Advanced Analysis & Feature Extraction

| Feature | Purpose |
|---|---|
| Waveform Segmentation | Split recording into pre-fault / fault / post-fault windows |
| Event Detection | Automatic identification of event boundaries |
| Harmonic Order Identification | Rank harmonics by magnitude, flag odd/even patterns |
| Signal Decomposition | EMD / VMD for non-stationary waveforms |
| Feature Vector Extraction | Convert waveform windows into ML-ready feature sets |

#### 6.2.5  Machine Learning Module

| Capability | Approach |
|---|---|
| Disturbance Classification | Supervised (SVM, Random Forest, CNN on spectrograms) |
| Anomaly Detection | Isolation Forest, Autoencoder on feature vectors |
| Pattern Recognition | Clustering (DBSCAN, k-means) on extracted features |
| Model Training Pipeline | scikit-learn pipelines with cross-validation |
| Model Persistence | `joblib` serialization to `/models/` directory |

### 6.3  Data Models

Core models in `disturbances/models.py`:

| Model | Purpose | Key Fields |
|---|---|---|
| `DisturbanceRecord` | One per uploaded file | `file_type`, `original_filename`, `recorded_at`, `metadata` (JSON), `station_name`, `sampling_rate` |
| `Channel` | One per signal in a file | `name`, `unit`, `channel_type` (ANALOGUE/DIGITAL), `phase` (A/B/C/N), FK → DisturbanceRecord |
| `DataPoint` | Bulk time-series samples | `channel` FK, `time_us` (INTEGER, microseconds from start), `value` (FLOAT) |
| `EventMarker` | Detected disturbance events | `event_type`, `time_us`, `duration_us`, `severity`, `description`, FK → DisturbanceRecord |
| `AnalysisResult` | Computed analysis outputs | `analysis_type`, `parameters` (JSON), `results` (JSON), FK → DisturbanceRecord |

### 6.4  REST API

Base URL: `/api/v1/`

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/disturbances/upload/` | Upload file; returns record ID + detected type |
| `GET` | `/disturbances/` | List all disturbance records |
| `GET` | `/disturbances/<id>/` | Record detail + channel list |
| `GET` | `/disturbances/<id>/channels/` | Channel metadata |
| `GET` | `/disturbances/<id>/channels/<ch_id>/data/` | Time-series data (`?t_start=&t_end=&downsample=`) |
| `GET` | `/disturbances/<id>/events/` | Detected events |
| `POST` | `/analysis/<id>/run/` | Trigger analysis engine |
| `GET` | `/analysis/<id>/results/` | Retrieve analysis results |
| `POST` | `/analysis/<id>/rms/` | Compute RMS for selected channels |
| `POST` | `/analysis/<id>/fft/` | Run FFT on selected channel window |
| `POST` | `/analysis/<id>/rocof/` | Compute RoCoF for frequency channels |

---

## 7  UI/UX Requirements

### 7.1  Design Philosophy

The UI must support a **modern engineering analysis workflow** — not a generic dashboard. Think oscilloscope + SCADA control room.

- **Dark industrial aesthetic**: deep charcoal backgrounds (`#0d1117`, `#161b22`)
- **Signal-trace colours**: amber/green/cyan for waveforms; avoid default blue
- **Monospaced values**: JetBrains Mono or IBM Plex Mono for engineering readouts
- **Oscilloscope-style grid**: subtle grid lines on waveform area
- **Staggered channel reveal**: fade-in animations when channels load

### 7.2  Waveform Viewer Features

The waveform viewer is the centrepiece of the UI. It must support:

| Feature | Interaction |
|---|---|
| Multi-channel display | Stack or overlay channels with independent Y-axes |
| Zoom/Pan | Mouse wheel zoom, drag-to-pan, pinch on touch |
| Time cursor | Vertical crosshair showing values at cursor position |
| Region selection | Drag to select time window for analysis |
| Channel toggle | Sidebar checkboxes to show/hide channels |
| Amplitude scaling | Per-channel gain adjustment |
| Measurement cursors | Dual cursors for ΔT, ΔV measurement |
| Pagination | Navigate through long recordings in pages |
| Export | Download visible window as PNG or CSV |

### 7.3  Component Architecture

```
App
├── FileUploader         — Drag-drop upload with format detection
├── ColumnMapper         — Map CSV/Excel columns to signal types
├── WaveformViewer       — Main viewer container
│   ├── WaveformToolbar  — Zoom, cursor, export controls
│   ├── WaveformChart    — ECharts canvas (one per channel group)
│   ├── ChannelSidebar   — Channel list with toggle, colour, scale
│   └── PaginationBar    — Page navigation for long recordings
├── DisturbanceList      — List of uploaded records
├── StatsOverview        — Summary statistics cards
├── ActivityLog          — Recent operations log
└── AnalysisDashboard    — Analysis results & charts (future)
```

---

## 8  Key Engineering Rules

### 8.1  Data Handling

- **Time base**: Store all timestamps as `time_us` (microseconds from record start) as `INTEGER` — never `datetime` for bulk samples
- **Digital channels**: Store as 0/1 int in `DataPoint.value`; render as step/binary chart
- **Downsampling**: Never send raw high-frequency data to frontend; downsample to max **2000 points per channel per viewport** using LTTB algorithm
- **Large datasets**: For recordings > 1M samples, use server-side windowing; never load all points into browser memory
- **Floating-point**: Use `> 0.001` thresholds for meaningful signal presence; never compare floats with `==`

### 8.2  Power Engineering Rules

- **COMTRADE**: Always require both `.cfg` AND `.dat` files; raise `ValidationError` if pair is incomplete
- **Power calculation**: Always validate V and I are same-phase matched before computing P/Q
- **Frequency**: Nominal frequency (50/60 Hz) must be stored in metadata; all frequency-dependent calculations reference this
- **Phase convention**: Use positive-sequence (A-B-C) convention; document any deviation
- **Per-unit conversion**: Support optional per-unit conversion with configurable base values
- **Sampling theorem**: Warn if sampling rate < 2× the highest frequency of interest

### 8.3  Frontend Rules

- CSS Modules for component-scoped styles; global tokens in `index.css` or `styles/` directory
- No inline styles except dynamic computed values (e.g., waveform trace colours)
- ECharts instances must call `dispose()` on component unmount to prevent memory leaks
- Debounce zoom/pan events to avoid excessive API calls
- Use `requestAnimationFrame` for cursor position updates

### 8.4  Backend Rules

- All file parsing must happen asynchronously or in the request cycle with progress feedback
- Parser errors must be caught and returned as structured JSON, never raw tracebacks
- API responses must include proper HTTP status codes and error schemas
- Use Django transactions for bulk `DataPoint` inserts
- Log all file processing operations to `ActivityLog`

---

## 9  Coding Principles

1. **Modular over monolithic** — every feature is a self-contained module with clear interfaces
2. **Pure functions for algorithms** — signal processing functions take arrays in, return arrays out; no side effects
3. **Separation of framework and logic** — analysis code must not import Django; views call engine as a service
4. **Type hints everywhere** — all Python functions use type annotations for IDE support and documentation
5. **Docstrings on all public functions** — include parameter descriptions, return types, and usage examples
6. **Error boundaries** — every API endpoint wraps logic in try/except with structured error responses
7. **Configuration over hard-coding** — thresholds, window sizes, and algorithm parameters are configurable
8. **Test-ready** — pure functions make unit testing trivial; write tests for every signal processing function
9. **Performance-aware** — use NumPy vectorised operations, avoid Python loops for numerical computation
10. **Incremental delivery** — each module works standalone before being integrated

---

## 10  Recommended Development Order

Build the system **incrementally**, one module at a time. Each step should result in a working, testable component.

```
Phase 1: Foundation
  ├── 1.1  Project scaffolding (Django + Vite + PostgreSQL)     ✅ DONE
  ├── 1.2  Data models & migrations                             ✅ DONE
  ├── 1.3  File upload API + parser framework                   ✅ DONE
  ├── 1.4  COMTRADE parser                                      ✅ DONE
  ├── 1.5  CSV parser                                           ✅ DONE
  └── 1.6  Excel parser                                         ✅ DONE

Phase 2: Waveform Visualisation
  ├── 2.1  Channel data API with downsampling                   ✅ DONE
  ├── 2.2  Basic waveform chart (ECharts)                       ✅ DONE
  ├── 2.3  Multi-channel viewer with overlay                    ✅ DONE
  ├── 2.4  Channel sidebar (toggle, colour, scale)              ✅ DONE
  ├── 2.5  Zoom/Pan controls + toolbar                          ✅ DONE
  ├── 2.6  Time cursor & measurement readout
  ├── 2.7  Digital channel step-chart renderer
  └── 2.8  Pagination for long recordings                       ✅ DONE

Phase 3: Signal Processing Engine
  ├── 3.1  RMS calculation module
  ├── 3.2  RoCoF (Rate of Change of Frequency)
  ├── 3.3  FFT & spectral analysis
  ├── 3.4  Harmonic analysis & order identification
  ├── 3.5  DC offset detection
  ├── 3.6  Phasor computation (magnitude + phase angle)
  ├── 3.7  Frequency tracking (zero-crossing / DFT)
  └── 3.8  Power calculation (P, Q with phase matching)

Phase 4: Disturbance Detection
  ├── 4.1  Transient detection (spike + derivative)
  ├── 4.2  Voltage sag/swell detection
  ├── 4.3  Fault pattern identification
  ├── 4.4  Oscillation analysis (damping estimation)
  ├── 4.5  Protection operation sequence analysis
  ├── 4.6  Islanding detection (RoCoF + freq criteria)
  ├── 4.7  High-frequency disturbance detection
  └── 4.8  Event timeline & annotation layer

Phase 5: Advanced Analysis
  ├── 5.1  Waveform segmentation (pre/fault/post windows)
  ├── 5.2  Automatic event boundary detection
  ├── 5.3  Signal decomposition (EMD / VMD)
  ├── 5.4  Small signal oscillation analysis
  └── 5.5  Feature extraction pipeline

Phase 6: Machine Learning
  ├── 6.1  Feature vector computation
  ├── 6.2  Disturbance classifier (SVM / Random Forest)
  ├── 6.3  Anomaly detection (Isolation Forest)
  ├── 6.4  Pattern clustering (DBSCAN)
  ├── 6.5  CNN on spectrograms (optional)
  └── 6.6  Model training & persistence pipeline

Phase 7: Analysis Dashboard & Reporting
  ├── 7.1  Analysis results API
  ├── 7.2  Analysis dashboard UI
  ├── 7.3  Event timeline visualisation
  ├── 7.4  Report generation (PDF / HTML export)
  └── 7.5  Batch analysis mode

Phase 8: Packaging & Distribution
  ├── 8.1  Configuration for standalone packaging
  ├── 8.2  PyInstaller / Electron wrapper
  ├── 8.3  Embedded database option (SQLite fallback)
  └── 8.4  Installer & auto-update mechanism
```

---

## 11  Constraints & Design Considerations

### 11.1  Performance

- Recordings may contain **millions of data points** (e.g., 200 kHz sampling over several seconds)
- Always downsample server-side before sending to frontend
- Use NumPy vectorised operations for all numerical work; avoid Python-level loops
- Consider chunked streaming for very large files during upload
- Frontend must handle at least 20 channels simultaneously without lag

### 11.2  Data Integrity

- Raw uploaded files must be preserved unchanged in `media/uploads/`
- Parsed data in the database is a materialised view — re-parsing from raw file must reproduce identical results
- All analysis results reference back to the source `DisturbanceRecord` via foreign key
- Database transactions for bulk inserts to prevent partial data on failure

### 11.3  Extensibility

- New file formats: add a new parser implementing the standard interface in `parsers/`
- New analysis algorithms: add a new function in `analysis/engine.py` following the pure-function pattern
- New ML models: add to `analysis/ml/` with standardised `train()` and `predict()` interfaces
- New visualisation types: add a new React component in `components/features/` with its own CSS Module

### 11.4  Future Desktop Packaging

- Backend logic must remain decoupled from Django's request/response cycle
- Analysis engine should be callable as: `engine.compute_rms(samples, window_size)` — no HTTP required
- Consider SQLite as an embedded database alternative for standalone distribution
- Frontend can be served statically from a local server bundled in the executable

---

## 12  Reference Files

Load these **as needed** — do NOT pre-load all of them:

| Reference | Path | Contents |
|---|---|---|
| Django Backend | `references/django_backend.md` | Settings templates, model patterns, API design |
| File Parsers | `references/file_parsers.md` | Full parser implementations for all formats |
| Frontend Waveform | `references/frontend_waveform.md` | React components, ECharts config, design tokens |
| Power Domain | `references/power_domain.md` | RoCoF, phasor, fault detection algorithms |
| Project Setup | `references/project_setup.md` | PostgreSQL setup, dev-server commands |

---

## 13  Build Workflow

Follow these steps **in order** when building this app from scratch.

### Step 1 — Bootstrap Backend

```bash
mkdir power-disturbance && cd power-disturbance
python -m venv venv && venv\Scripts\activate
pip install django djangorestframework psycopg2-binary django-cors-headers \
            python-dotenv comtrade pandas openpyxl numpy scipy scikit-learn joblib
django-admin startproject config backend
cd backend
python manage.py startapp disturbances
python manage.py startapp analysis
python manage.py startapp core
```

Restructure settings into `config/settings/base.py` and `local.py`.
See `references/django_backend.md` for the full settings template and model patterns.

### Step 2 — PostgreSQL Setup (Local)

```sql
-- In psql shell as postgres user
CREATE DATABASE powerdisturbance;
CREATE USER pduser WITH PASSWORD 'pdpass';
GRANT ALL PRIVILEGES ON DATABASE powerdisturbance TO pduser;
```

Set in `local.py`:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'powerdisturbance',
        'USER': 'pduser',
        'PASSWORD': 'pdpass',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

### Step 3 — Data Models

See Section 6.3 for model definitions. Run:
```bash
python manage.py makemigrations
python manage.py migrate
```

### Step 4 — File Parsers

Implement parsers following the interface contract in Section 5.2.
See `references/file_parsers.md` for full implementations.

### Step 5 — REST API Endpoints

See Section 6.4 for endpoint table.
See `references/django_backend.md` → API Design for view and serializer templates.

### Step 6 — Bootstrap Frontend

```bash
cd frontend
npm create vite@latest . -- --template react
npm install axios echarts echarts-for-react
```

See `references/frontend_waveform.md` for React component patterns and ECharts configuration.

### Step 7 — Frontend Design System

Apply the oscilloscope-inspired aesthetic described in Section 7.1.
See `references/frontend_waveform.md` → Design Tokens.

### Step 8 — Waveform Viewer

Build the waveform viewer following the component hierarchy in Section 7.3.
This is the most complex frontend component — budget extra time.

### Step 9 — Analysis Engine

Implement signal processing functions following Phase 3 development order.
See `references/power_domain.md` for algorithm reference implementations.

### Step 10 — Auth Scaffolding (Inactive by Default)

Always extend `AbstractUser` even when auth is off:
```python
# core/models.py
class User(AbstractUser):
    pass
```
Set `AUTH_USER_MODEL = 'core.User'` in `base.py`.

---

## 14  Quick Reference: Analysis Engine API Patterns

Every analysis function should follow this pattern:

```python
import numpy as np
from numpy.typing import NDArray

def compute_rms(
    samples: NDArray[np.float64],
    window_size: int = 256,
    overlap: int = 128,
) -> NDArray[np.float64]:
    """
    Compute RMS values over a sliding window.

    Args:
        samples: 1-D array of waveform samples.
        window_size: Number of samples per RMS window.
        overlap: Number of overlapping samples between windows.

    Returns:
        1-D array of RMS values, one per window position.
    """
    step = window_size - overlap
    n_windows = (len(samples) - window_size) // step + 1
    rms = np.empty(n_windows, dtype=np.float64)

    for i in range(n_windows):
        start = i * step
        window = samples[start : start + window_size]
        rms[i] = np.sqrt(np.mean(window ** 2))

    return rms
```

**Key conventions:**
- Input: NumPy arrays (never Django querysets or HTTP request objects)
- Output: NumPy arrays or plain Python dicts
- Parameters: explicit keyword arguments with sensible defaults
- Docstring: always include Args and Returns sections
- Type hints: use `NDArray` from `numpy.typing`
