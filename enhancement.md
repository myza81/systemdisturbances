# Waveform Analysis Application – Architecture Plan (Professional Disturbance Viewer Design)

## Objective

Design the waveform engine of the **Django + React disturbance analysis web application** so that it performs similarly to professional disturbance viewers used by relay manufacturers.

The application must support:

* COMTRADE / CSV / Excel waveform inputs
* Millions of samples
* Fast zoom and pan
* Multiple analog and digital signals
* Accurate measurement (no data loss)
* Smooth browser interaction

The system must **retain full resolution data** while still allowing fast visualization.

---

# 1. Key Principle Used in Professional Disturbance Viewers

Commercial disturbance viewers internally separate waveform data into **three layers**:

```
File Layer
     ↓
Waveform Memory Layer
     ↓
Rendering Layer
```

Each layer has a different responsibility.

---

# 2. Layer 1 – File Layer (Raw Event Data)

This layer stores the waveform data exactly as read from the event file.

Example sources:

* COMTRADE (.cfg + .dat)
* CSV
* Excel

Example structure after parsing:

```
event_record
 ├── metadata
 │     ├── station
 │     ├── recorder
 │     ├── sampling_rate
 │     └── start_time
 │
 ├── time_vector
 │
 ├── analog_channels
 │     ├── VA
 │     ├── VB
 │     ├── VC
 │     ├── IA
 │     ├── IB
 │     └── IC
 │
 └── digital_channels
       ├── Trip
       ├── Breaker
       └── RelayPickup
```

All arrays are **full resolution**.

Example:

```
50,000 samples per signal
```

---

# 3. Layer 2 – Waveform Memory Layer

Professional disturbance tools convert raw data into a **memory-optimized structure**.

This allows extremely fast slicing and rendering.

The recommended structure for the backend is:

```
WaveformMemory
 ├── time : Float32Array
 │
 ├── analog :
 │      ├── VA : Float32Array
 │      ├── VB : Float32Array
 │      ├── VC : Float32Array
 │      ├── IA : Float32Array
 │      ├── IB : Float32Array
 │      └── IC : Float32Array
 │
 └── digital :
        ├── Trip : Uint8Array
        ├── Breaker : Uint8Array
        └── RelayPickup : Uint8Array
```

Why this structure?

Advantages:

• contiguous memory
• fast slicing
• minimal overhead
• efficient transfer to frontend

Analog signals use **Float32Array**.
Digital signals use **Uint8Array**.

---

# 4. Waveform Memory Indexing

Professional tools do not repeatedly search arrays.

They build **indexes**.

Example:

```
sample_index = time * sampling_rate
```

Example:

```
time = 2.5 s
sampling_rate = 5000 Hz

sample_index = 12500
```

Now slicing a window becomes extremely fast.

Example window:

```
start = 2.5 s
end = 2.8 s

samples 12500 → 14000
```

---

# 5. Layer 3 – Rendering Layer

The rendering layer prepares data for the chart engine.

The chart engine should **never receive raw arrays directly**.

Instead the rendering layer prepares series data.

Example:

```
render_series
 ├── name
 ├── color
 ├── signal_type
 └── data
```

Example dataset sent to chart:

```
[
  [0.0001, 10.2],
  [0.0002, 10.3],
  [0.0003, 10.5]
]
```

This format works well with the frontend chart engine.

---

# 6. Backend Workflow

### Step 1 – Upload Event

```
User uploads COMTRADE
```

Backend processing:

```
Parse file
Convert signals to Float32Array
Create WaveformMemory
Store event in memory or cache
```

---

### Step 2 – Provide Event Metadata

API endpoint:

```
GET /api/event/{event_id}/metadata
```

Returns:

```
sampling_rate
duration
available_signals
```

---

### Step 3 – Provide Waveform Window

API endpoint:

```
GET /api/event/{event_id}/window
```

Parameters:

```
start_time
end_time
signals
```

Example request:

```
/api/event/15/window?start=1.2&end=1.6&signals=VA,VB,IA
```

Backend workflow:

```
convert time → sample index
slice arrays
format chart data
return result
```

---

# 7. Frontend Waveform Engine

The frontend must maintain a **Waveform Engine object**.

Example structure:

```
WaveformEngine
 ├── event_metadata
 ├── visible_signals
 ├── chart_instance
 └── cursor_manager
```

Responsibilities:

• request waveform window
• update chart
• manage signal selection
• handle zoom events

---

# 8. Chart Rendering Strategy

When event is opened:

```
Request entire event window
```

Example:

```
0 → 10 seconds
```

Chart renders selected signals.

When user zooms:

```
React detects new viewport
```

Example:

```
3.0 → 3.3 seconds
```

Frontend requests backend:

```
GET window data
```

Chart updates.

---

# 9. Digital Signal Rendering

Digital signals must be drawn as **step signals**.

Example:

```
0 → 1 → 0 transitions
```

Frontend configuration:

```
step = 'end'
```

---

# 10. Signal Visibility Control

Only render signals selected by the user.

Example UI:

```
Analog
☑ VA
☑ VB
☐ VC
☐ IA
☐ IB

Digital
☑ Breaker
☐ Trip
```

Rendering fewer signals improves performance.

---

# 11. Cursor Measurement System

Add dual cursor measurement.

Example:

```
Cursor A = 1.004 s
Cursor B = 1.016 s

Δt = 12 ms
ΔV = 3.2 kV
```

Cursor data should be calculated from **WaveformMemory**.

---

# 12. Performance Rules

Follow these rules strictly.

### Rule 1

Never store waveform arrays inside React state.

### Rule 2

Initialize chart once.

### Rule 3

Update chart using `setOption`.

### Rule 4

Render only selected signals.

### Rule 5

Use typed arrays whenever possible.

---

# 13. Future Features

After waveform engine is stable, add advanced analysis.

### Signal Analysis

* RMS calculation
* frequency tracking
* FFT spectrum
* symmetrical components
* impedance calculation

### Event Detection

* fault inception detection
* relay pickup detection
* breaker trip timing

### Event Classification

* lightning strike
* tree contact
* conductor break
* protection misoperation

---

# 14. Final Instruction for Developers

The project must remain based on:

```
Django backend
React frontend
ECharts waveform viewer
```

The backend must implement **WaveformMemory architecture** as described.

The frontend must implement **WaveformEngine architecture** to interact with the backend.

This structure mirrors how professional disturbance record viewers manage waveform data and ensures that the application remains scalable and responsive even with very large event files.
