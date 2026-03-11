# Power Domain Reference

## Table of Contents
1. RoCoF Calculation
2. Phasor Computation (RMS + Phase Angle)
3. Active and Reactive Power (P, Q)
4. Fault Event Detection
5. Frequency Tracking
6. UFLS/UVLS Logic
7. COMTRADE Event Correlation

---

## 1. RoCoF Calculation

Rate of Change of Frequency (df/dt) — key disturbance indicator.

```python
# analysis/engine.py
import numpy as np

def compute_rocof(times_us: list, freq_values: list, window_ms: float = 100.0) -> list:
    """
    Compute RoCoF (df/dt in Hz/s) using sliding window linear regression.
    times_us: list of timestamps in microseconds
    freq_values: list of frequency values in Hz
    window_ms: sliding window width in milliseconds
    Returns: list of (time_us, rocof_hz_per_s) tuples
    """
    times = np.array(times_us, dtype=float)
    freqs = np.array(freq_values, dtype=float)
    window_us = window_ms * 1000.0
    results = []

    for i, t_center in enumerate(times):
        mask = (times >= t_center - window_us / 2) & (times <= t_center + window_us / 2)
        t_win = times[mask]
        f_win = freqs[mask]
        if len(t_win) < 2:
            results.append((int(t_center), 0.0))
            continue
        # Linear regression slope = df/dt in Hz/us, convert to Hz/s
        t_norm = (t_win - t_win[0]) / 1e6  # seconds
        slope = np.polyfit(t_norm, f_win, 1)[0]
        results.append((int(t_center), slope))

    return results
```

**Typical thresholds (Malaysian Grid Code / IEC 61000):**
- RoCoF > 0.5 Hz/s: significant generation-demand imbalance
- RoCoF > 1.0 Hz/s: major disturbance; UFLS may activate
- RoCoF > 2.0 Hz/s: cascade failure risk

---

## 2. Phasor Computation

```python
def compute_rms(samples: list, nominal_freq_hz: float = 50.0) -> list:
    """
    Compute per-cycle RMS from time-domain samples.
    samples: [(time_us, value), ...]
    Returns: [(time_us_cycle_center, rms_value), ...]
    """
    times = np.array([s[0] for s in samples], dtype=float)
    values = np.array([s[1] for s in samples], dtype=float)
    cycle_us = 1_000_000.0 / nominal_freq_hz  # 20000 us per cycle at 50 Hz
    results = []

    t = times[0]
    while t + cycle_us <= times[-1]:
        mask = (times >= t) & (times < t + cycle_us)
        window = values[mask]
        if len(window) > 1:
            rms = np.sqrt(np.mean(window ** 2))
            center = t + cycle_us / 2
            results.append((int(center), float(rms)))
        t += cycle_us

    return results

def compute_phase_angle(voltage: list, current: list) -> list:
    """
    Compute per-cycle phase angle between V and I using cross-correlation.
    Both signals must have same time base.
    Returns: [(time_us, angle_degrees), ...]
    """
    from scipy.signal import correlate
    t_v = np.array([s[0] for s in voltage])
    v = np.array([s[1] for s in voltage])
    i = np.array([s[1] for s in current])

    if len(v) != len(i):
        return []

    # Normalised cross-correlation
    v_norm = v / (np.std(v) + 1e-9)
    i_norm = i / (np.std(i) + 1e-9)
    corr = correlate(v_norm, i_norm, mode='full')
    lag = (np.argmax(corr) - (len(v) - 1))

    dt_us = np.mean(np.diff(t_v)) if len(t_v) > 1 else 0
    freq = 50.0
    period_us = 1_000_000 / freq
    angle_deg = (lag * dt_us / period_us) * 360.0

    return [(int(t_v[len(t_v) // 2]), float(angle_deg))]
```

---

## 3. Active and Reactive Power (P, Q)

**Always verify V and I have matching phase labels before computing P/Q.**

```python
def compute_power(voltage_samples: list, current_samples: list,
                  nominal_freq_hz: float = 50.0) -> tuple:
    """
    Compute per-cycle P (MW) and Q (MVAr) from V (kV) and I (kA) waveforms.
    Returns: (p_series, q_series) each as [(time_us, value), ...]
    """
    cycle_us = 1_000_000.0 / nominal_freq_hz
    t_v = np.array([s[0] for s in voltage_samples])
    v = np.array([s[1] for s in voltage_samples])
    t_i = np.array([s[0] for s in current_samples])
    i_interp = np.interp(t_v, t_i, np.array([s[1] for s in current_samples]))

    p_series, q_series = [], []
    t_start = t_v[0]
    while t_start + cycle_us <= t_v[-1]:
        mask = (t_v >= t_start) & (t_v < t_start + cycle_us)
        v_win = v[mask]
        i_win = i_interp[mask]
        if len(v_win) < 2:
            t_start += cycle_us
            continue
        p = np.mean(v_win * i_win)             # Active power
        # Q via Hilbert: i_q = 90-degree shifted current
        from scipy.signal import hilbert
        i_hat = np.imag(hilbert(i_win))
        q = np.mean(v_win * i_hat)             # Reactive power sign convention
        center = int(t_start + cycle_us / 2)
        p_series.append((center, float(p)))
        q_series.append((center, float(q)))
        t_start += cycle_us

    return p_series, q_series
```

**Unit note:** If V in kV and I in kA, P/Q are in MW/MVAr. If V in V and I in A, multiply result by 1e-6.

---

## 4. Fault Event Detection

```python
def detect_fault_events(channel_name: str, samples: list,
                         threshold_pu: float = 0.85,
                         nominal_value: float = None) -> list:
    """
    Detect voltage dip (fault) or overcurrent events by threshold crossing.
    For voltage: fault when V < threshold_pu * nominal
    For current: fault when I > threshold_pu * nominal (overcurrent)
    Returns: list of EventMarker-compatible dicts
    """
    times = np.array([s[0] for s in samples])
    values = np.array([s[1] for s in samples])

    if nominal_value is None:
        nominal_value = np.percentile(np.abs(values), 90) or 1.0

    is_voltage = any(x in channel_name.upper() for x in ['VA', 'VB', 'VC', 'VOLT', 'KV'])
    events = []
    in_event = False

    for t, v in zip(times, values):
        if is_voltage:
            triggered = abs(v) < threshold_pu * nominal_value
        else:
            triggered = abs(v) > (2.0 - threshold_pu) * nominal_value  # overcurrent

        if triggered and not in_event:
            events.append({
                'event_type': 'FAULT',
                'time_us': int(t),
                'description': f"{'Voltage dip' if is_voltage else 'Overcurrent'} on {channel_name}",
                'severity': 'CRITICAL',
            })
            in_event = True
        elif not triggered:
            in_event = False

    return events


def detect_derivative_events(samples: list, spike_threshold: float = None) -> list:
    """
    Detect rapid signal changes (protection operations, CB trips).
    """
    times = np.array([s[0] for s in samples])
    values = np.array([s[1] for s in samples])
    dt = np.diff(times) / 1e6  # seconds
    dv = np.diff(values)
    deriv = np.where(dt > 0.001, dv / dt, 0)

    if spike_threshold is None:
        spike_threshold = 5.0 * np.std(deriv)

    events = []
    for i, d in enumerate(deriv):
        if abs(d) > spike_threshold:
            events.append({
                'event_type': 'RELAY',
                'time_us': int(times[i]),
                'description': f'Rapid signal change: d/dt = {d:.2f}',
                'severity': 'WARNING',
            })
    return events
```

---

## 5. Frequency Tracking

```python
def track_frequency_zero_crossing(samples: list,
                                   nominal_freq: float = 50.0) -> list:
    """
    Estimate instantaneous frequency via zero-crossing detection.
    Best for clean sinusoidal signals (use DFT approach for noisy data).
    Returns: [(time_us, frequency_hz), ...]
    """
    times = np.array([s[0] for s in samples])
    values = np.array([s[1] for s in samples])

    # Find positive zero crossings
    crossings = []
    for i in range(1, len(values)):
        if values[i - 1] < 0 and values[i] >= 0:
            # Linear interpolation for sub-sample accuracy
            frac = -values[i - 1] / (values[i] - values[i - 1])
            t_cross = times[i - 1] + frac * (times[i] - times[i - 1])
            crossings.append(t_cross)

    freq_series = []
    for i in range(1, len(crossings)):
        period_us = crossings[i] - crossings[i - 1]
        if period_us > 0.001:
            freq = 1_000_000.0 / period_us
            if 40.0 < freq < 60.0:  # Sanity bounds
                t_center = int((crossings[i - 1] + crossings[i]) / 2)
                freq_series.append((t_center, freq))

    return freq_series
```

---

## 6. UFLS/UVLS Logic

**Malaysian Grid Code reference setpoints:**
- UFLS Stage 1: < 49.0 Hz  → shed 10% load
- UFLS Stage 2: < 48.5 Hz  → shed additional 15% load
- UFLS Stage 3: < 48.0 Hz  → shed additional 15% load
- UVLS: voltage < 0.85 pu for > 0.15s → shed reactive load

```python
UFLS_STAGES = [
    {'stage': 1, 'threshold_hz': 49.0, 'shed_pct': 10},
    {'stage': 2, 'threshold_hz': 48.5, 'shed_pct': 15},
    {'stage': 3, 'threshold_hz': 48.0, 'shed_pct': 15},
]

def detect_ufls_events(freq_series: list) -> list:
    events = []
    triggered = set()
    for t, f in freq_series:
        for stage in UFLS_STAGES:
            if f < stage['threshold_hz'] and stage['stage'] not in triggered:
                triggered.add(stage['stage'])
                events.append({
                    'event_type': 'UFLS',
                    'time_us': t,
                    'description': f"UFLS Stage {stage['stage']}: f={f:.3f}Hz < {stage['threshold_hz']}Hz, shed {stage['shed_pct']}%",
                    'severity': 'CRITICAL',
                })
    return events
```

---

## 7. COMTRADE Event Correlation

Digital channels in COMTRADE often map to protection relay outputs. Standard naming:
- `52A`  = Circuit breaker A status (1=closed, 0=open)
- `86`   = Lockout relay
- `21`   = Distance relay
- `87`   = Differential relay
- `50/51` = Overcurrent relay

When parsing digital channels, check for name patterns:
```python
RELAY_MAP = {
    '52': 'Circuit Breaker',
    '86': 'Lockout Relay',
    '21': 'Distance Relay',
    '87': 'Differential Relay',
    '50': 'Overcurrent Relay',
    '51': 'Overcurrent Relay (Time)',
    '27': 'Under-Voltage Relay',
    '59': 'Over-Voltage Relay',
    '81': 'Frequency Relay',
}

def classify_digital_channel(channel_name: str) -> str:
    for code, label in RELAY_MAP.items():
        if code in channel_name:
            return label
    return 'Digital Status'
```

Rising edge of digital channel (0→1) = relay pickup/CB close; falling edge (1→0) = relay drop/CB open.
